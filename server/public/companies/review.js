window.addEventListener("DOMContentLoaded", () => {

  const API_URL = "/api/trips";

  let trips = [];
  const container = document.getElementById("tripsContainer");

  /* ================= LOAD / SAVE (SERVER) ================= */
  async function loadTrips(){
    try{
      const res = await fetch(API_URL);
      const data = await res.json();
      trips = Array.isArray(data) ? data : [];
    }catch{
      trips = [];
    }
  }

  async function saveTrips(){
    // نفس اسم الدالة القديمة عشان ميكسرش أي حاجة
    try{
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trips)
      });
    }catch(e){
      console.error("Save failed", e);
    }
  }

  /* ================= KEEP LAST 30 DAYS ================= */
  async function keepLast30Days(){
    const now = new Date();
    const before = trips.length;

    trips = trips.filter(t=>{
      if(!t.createdAt) return true;
      const created = new Date(t.createdAt);
      const diffDays = (now - created) / (1000*60*60*24);
      return diffDays <= 30;
    });

    if(trips.length !== before){
      await saveTrips();
    }
  }

  /* ================= SORT NEW FIRST ================= */
  function sortTrips(){
    trips.sort((a,b)=>{
      const d1 = new Date(a.createdAt || 0);
      const d2 = new Date(b.createdAt || 0);
      return d2 - d1;
    });
  }

  /* ================= ARIZONA TIME ================= */
  function getAZNow(){
    return new Date(
      new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" })
    );
  }

  function getTripDateTime(t){
    if(!t.tripDate || !t.tripTime) return null;
    return new Date(
      new Date(`${t.tripDate}T${t.tripTime}`)
      .toLocaleString("en-US",{ timeZone:"America/Phoenix" })
    );
  }

  function minutesToTrip(t){
    const tripDT = getTripDateTime(t);
    if(!tripDT) return null;
    return (tripDT - getAZNow()) / 60000;
  }

  function within120(t){
    const diff = minutesToTrip(t);
    return diff !== null && diff > 0 && diff <= 120;
  }

  /* ================= RENDER ================= */
  function render(){

    container.innerHTML = "";

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.tableLayout = "fixed";
    table.style.borderCollapse = "collapse";

    let lastDateHeader = "";

    table.innerHTML = `
      <tr>
        <th style="width:40px;">#</th>
        <th style="width:90px;">Trip #</th>
        <th>Entry</th>
        <th>Entry Phone</th>
        <th>Client</th>
        <th>Phone</th>
        <th>Pickup</th>
        <th>Drop</th>
        <th>Stops</th>
        <th style="width:110px;">Date</th>
        <th style="width:90px;">Time</th>
        <th>Notes</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    `;

    trips.forEach((t,index)=>{

      const createdDate = t.createdAt
        ? new Date(t.createdAt).toLocaleDateString()
        : "No Date";

      if(createdDate !== lastDateHeader){
        const headerRow = document.createElement("tr");
        headerRow.innerHTML = `
          <td colspan="14" style="
            background:#111827;
            color:white;
            font-weight:bold;
            text-align:center;
            padding:6px;
          ">
            ${createdDate}
          </td>
        `;
        table.appendChild(headerRow);
        lastDateHeader = createdDate;
      }

      const tr = document.createElement("tr");

      /* ===== RED IF TIME PASSED ===== */
      const tripDT = getTripDateTime(t);
      if(tripDT){
        const now = getAZNow();
        if(now > tripDT){
          tr.style.backgroundColor = "#ffe5e5";
          tr.style.borderLeft = "4px solid red";
        }
      }

      const inside120 = within120(t);

      let actions = "";

      if(t.status === "Cancelled"){
        actions = "";
      }
      else if(inside120 && t.status === "Confirmed"){
        actions = `
          <button class="btn cancel" onclick="cancelTrip(${index})">Cancel</button>
        `;
      }
      else{
        actions = `
          <div class="actions">
            <button class="btn confirm" onclick="confirmTrip(${index})">Confirm</button>
            <button class="btn edit" onclick="editTrip(${index},this)">Edit</button>
            <button class="btn delete" onclick="deleteTrip(${index})">Delete</button>
          </div>
        `;
      }

      tr.innerHTML = `
        <td>${index+1}</td>
        <td>${t.tripNumber || ""}</td>

        <td><input class="editField entryName" disabled value="${t.entryName||""}"></td>
        <td><input class="editField entryPhone" disabled value="${t.entryPhone||""}"></td>

        <td><input class="editField clientName" disabled value="${t.clientName||""}"></td>
        <td><input class="editField clientPhone" disabled value="${t.clientPhone||""}"></td>

        <td><input class="editField pickup" disabled value="${t.pickup||""}"></td>
        <td><input class="editField dropoff" disabled value="${t.dropoff||""}"></td>

        <td>
          <textarea class="editField stops" disabled>
${(t.stops || []).join(", ")}
          </textarea>
        </td>

        <td><input type="date" class="editField tripDate" disabled value="${t.tripDate||""}"></td>
        <td><input type="time" class="editField tripTime" disabled value="${t.tripTime||""}"></td>

        <td><textarea class="editField notes" disabled>${t.notes||""}</textarea></td>

        <td>${t.status || "Scheduled"}</td>
        <td>${actions}</td>
      `;

      table.appendChild(tr);
    });

    container.appendChild(table);
  }

  /* ================= EDIT ================= */
  window.editTrip = async function(i,btn){

    const t = trips[i];
    const row = btn.closest("tr");
    const inputs = row.querySelectorAll(".editField");

    if(btn.innerText.trim() === "Edit"){
      inputs.forEach(x=>x.disabled=false);
      btn.innerText = "Save";
      return;
    }

    const newDate = row.querySelector(".tripDate").value;
    const newTime = row.querySelector(".tripTime").value;
    const tempTrip = { tripDate:newDate, tripTime:newTime };

    if(within120(tempTrip)){
      const ok = confirm(
        "⚠️ This trip is within 120 minutes of the scheduled pickup time.\nModifications are not permitted at this stage.\nPress OK to proceed."
      );
      if(!ok) return;
    }

    t.entryName  = row.querySelector(".entryName").value;
    t.entryPhone = row.querySelector(".entryPhone").value;
    t.clientName  = row.querySelector(".clientName").value;
    t.clientPhone = row.querySelector(".clientPhone").value;
    t.pickup      = row.querySelector(".pickup").value;
    t.dropoff     = row.querySelector(".dropoff").value;
    t.stops = row.querySelector(".stops").value.split(",").map(s=>s.trim()).filter(Boolean);
    t.tripDate = newDate;
    t.tripTime = newTime;
    t.notes    = row.querySelector(".notes").value;

    t.status = "Scheduled";

    inputs.forEach(x=>x.disabled=true);
    btn.innerText = "Edit";

    await saveTrips();
    render();
  };

  window.confirmTrip = async function(i){
    trips[i].status = "Confirmed";
    await saveTrips();
    render();
  };

  window.cancelTrip = async function(i){
    trips[i].status = "Cancelled";
    await saveTrips();
    render();
  };

  window.deleteTrip = async function(i){
    if(!confirm("Delete this trip?")) return;
    trips.splice(i,1);
    await saveTrips();
    render();
  };

  /* ================= INIT ================= */
  (async function(){
    await loadTrips();
    await keepLast30Days();
    sortTrips();
    render();
  })();

});