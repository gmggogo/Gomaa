window.addEventListener("DOMContentLoaded", () => {

  const API_URL = "/api/trips";
  const HUB_URL = "/api/trips-hub";
  const container = document.getElementById("tripsContainer");

  let trips = [];

  /* ================= LOAD ================= */
  async function loadTrips(){
    try{
      const res = await fetch(API_URL);
      const data = await res.json();
      trips = Array.isArray(data) ? data : [];
    }catch(e){
      console.error("Load failed", e);
      trips = [];
    }
  }

  /* ================= SAVE ================= */
  async function saveTrips(){
    await fetch(API_URL,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(trips)
    });
  }

  /* ================= HUB ================= */
  async function sendToHub(trip){
    await fetch(HUB_URL,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(trip)
    });
  }

  /* ================= CLEAN & SORT ================= */
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

  function sortTrips(){
    trips.sort((a,b)=>{
      return new Date(b.createdAt||0) - new Date(a.createdAt||0);
    });
  }

  /* ================= TIME ENGINE ================= */
  function getTripDateTime(t){
    if(!t.tripDate || !t.tripTime) return null;

    const [y,m,d] = t.tripDate.split("-");
    const [h,min] = t.tripTime.split(":");

    return new Date(Number(y), Number(m)-1, Number(d), Number(h), Number(min));
  }

  function minutesToTrip(t){
    const dt = getTripDateTime(t);
    if(!dt) return null;
    return (dt - new Date()) / 60000;
  }

  function inside120(t){
    const m = minutesToTrip(t);
    return m !== null && m > 0 && m <= 120;
  }

  function passed(t){
    const m = minutesToTrip(t);
    return m !== null && m <= 0;
  }

  function anyEditing(){
    return trips.some(t=>t.editing);
  }

  /* ================= RENDER ================= */
  function render(){

    container.innerHTML = "";

    const table = document.createElement("table");
    table.style.width="100%";
    table.style.borderCollapse="collapse";
    table.style.tableLayout="fixed";

    table.innerHTML = `
      <tr>
        <th>#</th>
        <th>Trip #</th>
        <th>Client</th>
        <th>Phone</th>
        <th>Pickup</th>
        <th>Drop</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    `;

    trips.forEach((t,index)=>{

      const tr = document.createElement("tr");

      const isPassed = passed(t);
      const in120 = inside120(t);

      if(isPassed){
        tr.style.background="#ffcccc";
      } else if(in120){
        tr.style.background="#fff3cd";
      }

      const editing = t.editing === true;

      const client = editing ? `<input class="edit-client" value="${t.clientName||""}"/>` : (t.clientName||"");
      const phone  = editing ? `<input class="edit-phone" value="${t.clientPhone||""}"/>` : (t.clientPhone||"");
      const pickup = editing ? `<input class="edit-pickup" value="${t.pickup||""}"/>` : (t.pickup||"");
      const drop   = editing ? `<input class="edit-drop" value="${t.dropoff||""}"/>` : (t.dropoff||"");
      const date   = editing ? `<input type="date" class="edit-date" value="${t.tripDate||""}"/>` : (t.tripDate||"");
      const time   = editing ? `<input type="time" class="edit-time" value="${t.tripTime||""}"/>` : (t.tripTime||"");

      let actions="";

      if(!isPassed){

        if(t.status==="Scheduled"){
          actions = `
            <button class="btn edit" onclick="editTrip(${index})">${editing?"Save":"Edit"}</button>
            <button class="btn delete" onclick="deleteTrip(${index})">Delete</button>
            <button class="btn confirm" onclick="confirmTrip(${index})">Confirm</button>
          `;
        }

        if(t.status==="Confirmed"){
          if(in120){
            actions = `<button class="btn cancel" onclick="cancelTrip(${index})">Cancel</button>`;
          } else {
            actions = `
              <button class="btn edit" onclick="editTrip(${index})">${editing?"Save":"Edit"}</button>
              <button class="btn delete" onclick="deleteTrip(${index})">Delete</button>
              <button class="btn cancel" onclick="cancelTrip(${index})">Cancel</button>
            `;
          }
        }
      }

      tr.innerHTML = `
        <td>${index+1}</td>
        <td>${t.tripNumber||""}</td>
        <td>${client}</td>
        <td>${phone}</td>
        <td>${pickup}</td>
        <td>${drop}</td>
        <td>${date}</td>
        <td>${time}</td>
        <td>${t.status||"Scheduled"}</td>
        <td>${actions}</td>
      `;

      table.appendChild(tr);
    });

    container.appendChild(table);
  }

  /* ================= ACTIONS ================= */

  window.confirmTrip = async function(i){
    const t = trips[i];
    if(passed(t)){
      alert("Trip time has already passed.");
      return;
    }
    t.status="Confirmed";
    t.editing=false;
    await sendToHub(t);
    await saveTrips();
    render();
  };

  window.cancelTrip = async function(i){
    trips[i].status="Cancelled";
    trips[i].editing=false;
    await saveTrips();
    render();
  };

  window.deleteTrip = async function(i){
    if(!confirm("Delete this trip?")) return;
    trips.splice(i,1);
    await saveTrips();
    render();
  };

  window.editTrip = async function(i){

    const t = trips[i];

    if(!t.editing){
      trips.forEach(x=>x.editing=false);
      t.editing=true;
      render();
      return;
    }

    const row = container.querySelectorAll("tr")[i+1];

    const newDate = row.querySelector(".edit-date").value;
    const newTime = row.querySelector(".edit-time").value;

    const tempTrip = { ...t, tripDate:newDate, tripTime:newTime };
    const mins = minutesToTrip(tempTrip);

    if(mins !== null && mins > 0 && mins <= 120){
      if(!confirm("Trip is within 120 minutes. Continue editing?")) return;
    }

    t.clientName  = row.querySelector(".edit-client").value;
    t.clientPhone = row.querySelector(".edit-phone").value;
    t.pickup      = row.querySelector(".edit-pickup").value;
    t.dropoff     = row.querySelector(".edit-drop").value;
    t.tripDate    = newDate;
    t.tripTime    = newTime;

    t.status="Scheduled";
    t.editing=false;

    await saveTrips();
    render();
  };

  /* ================= AUTO REFRESH ================= */
  setInterval(async ()=>{
    if(!anyEditing()){
      await loadTrips();
      await keepLast30Days();
      sortTrips();
      render();
    }
  },30000);

  /* ================= INIT ================= */
  (async function(){
    await loadTrips();
    await keepLast30Days();
    sortTrips();
    render();
  })();

});