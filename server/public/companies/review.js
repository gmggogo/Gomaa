window.addEventListener("DOMContentLoaded", () => {

  let trips = JSON.parse(localStorage.getItem("companyTrips")) || [];
  const container = document.getElementById("tripsContainer");

  function saveTrips(){
    localStorage.setItem("companyTrips", JSON.stringify(trips));
  }

  /* ================= KEEP LAST 7 DAYS ================= */
  function keepLast7Days(){
    const now = new Date();
    trips = trips.filter(t=>{
      if(!t.createdAt) return true;
      const created = new Date(t.createdAt);
      const diffDays = (now - created) / (1000*60*60*24);
      return diffDays <= 7;
    });
    saveTrips();
  }

  keepLast7Days();

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

    /* ===== DAILY HEADER ===== */
    const headerBar = document.createElement("div");
    headerBar.style.display = "flex";
    headerBar.style.justifyContent = "space-between";
    headerBar.style.alignItems = "center";
    headerBar.style.padding = "10px";
    headerBar.style.background = "#f8fafc";
    headerBar.style.border = "1px solid #e2e8f0";
    headerBar.style.marginBottom = "10px";
    headerBar.style.fontSize = "14px";

    const today = new Date().toLocaleDateString("en-US", {
      timeZone: "America/Phoenix",
      year: "numeric",
      month: "short",
      day: "2-digit"
    });

    headerBar.innerHTML = `
      <strong>📅 Today: ${today}</strong>
      <span>Arizona Time</span>
    `;

    container.appendChild(headerBar);

    /* ===== TABLE ===== */
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.tableLayout = "fixed";
    table.style.borderCollapse = "collapse";

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

      const tr = document.createElement("tr");
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
  window.editTrip = function(i,btn){

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

    t.stops = row.querySelector(".stops").value
      .split(",")
      .map(s=>s.trim())
      .filter(Boolean);

    t.tripDate = newDate;
    t.tripTime = newTime;
    t.notes    = row.querySelector(".notes").value;

    t.status = "Scheduled";

    inputs.forEach(x=>x.disabled=true);
    btn.innerText = "Edit";

    saveTrips();
    render();
  }

  window.confirmTrip = function(i){
    trips[i].status = "Confirmed";
    saveTrips();
    render();
  }

  window.cancelTrip = function(i){
    trips[i].status = "Cancelled";
    saveTrips();
    render();
  }

  window.deleteTrip = function(i){
    if(!confirm("Delete this trip?")) return;
    trips.splice(i,1);
    saveTrips();
    render();
  }

  render();
});