window.addEventListener("DOMContentLoaded", () => {

  const API_URL = "/api/trips";
  let trips = [];
  const container = document.getElementById("tripsContainer");

  /* ================= LOAD ================= */
  async function loadTrips(){
    try{
      const res = await fetch(API_URL);
      const data = await res.json();
      trips = Array.isArray(data) ? data : [];
    }catch{
      trips = [];
    }
  }

  /* ================= SAVE ================= */
  async function saveTrips(){
    try{
      await fetch(API_URL,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(trips)
      });
    }catch(e){
      console.error("Save failed",e);
    }
  }

  /* ================= KEEP 30 DAYS ================= */
  async function keepLast30Days(){
    const now = new Date();
    const before = trips.length;

    trips = trips.filter(t=>{
      if(!t.createdAt) return true;
      const created = new Date(t.createdAt);
      const diffDays = (now-created)/(1000*60*60*24);
      return diffDays <= 30;
    });

    if(trips.length !== before){
      await saveTrips();
    }
  }

  /* ================= SORT ================= */
  function sortTrips(){
    trips.sort((a,b)=>{
      const d1 = new Date(a.createdAt || 0);
      const d2 = new Date(b.createdAt || 0);
      return d2-d1;
    });
  }

  /* ================= TIME ================= */
  function getAZNow(){
    return new Date(
      new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
    );
  }

  function getTripDateTime(t){
    if(!t.tripDate || !t.tripTime) return null;
    return new Date(
      new Date(`${t.tripDate}T${t.tripTime}`)
      .toLocaleString("en-US",{timeZone:"America/Phoenix"})
    );
  }

  function minutesToTrip(t){
    const dt = getTripDateTime(t);
    if(!dt) return null;
    return (dt - getAZNow()) / 60000;
  }

  function inside120(t){
    const diff = minutesToTrip(t);
    return diff !== null && diff > 0 && diff <= 120;
  }

  function tripPassed(t){
    const diff = minutesToTrip(t);
    return diff !== null && diff <= 0;
  }

  /* ================= RENDER ================= */
  function render(){

    container.innerHTML = "";

    const table = document.createElement("table");
    table.style.width="100%";
    table.style.tableLayout="fixed";
    table.style.borderCollapse="collapse";

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

      if(tripPassed(t)){
        tr.style.background="#ffe5e5";
        tr.style.borderLeft="4px solid red";
      }

      /* ===== BUTTON POLICY ===== */

      let actions="";

      if(t.status==="Cancelled"){
        actions="";
      }
      else if(tripPassed(t)){
        actions="";
      }
      else if(inside120(t) && t.status==="Confirmed"){
        actions=`
          <button class="btn cancel" onclick="cancelTrip(${index})">Cancel</button>
        `;
      }
      else{
        actions=`
          ${t.status!=="Confirmed"
            ? `<button class="btn confirm" onclick="confirmTrip(${index})">Confirm</button>`
            : ""}
          <button class="btn edit" onclick="editTrip(${index},this)">Edit</button>
          <button class="btn delete" onclick="deleteTrip(${index})">Delete</button>
        `;
      }

      tr.innerHTML=`
        <td>${index+1}</td>
        <td>${t.tripNumber||""}</td>
        <td>${t.clientName||""}</td>
        <td>${t.clientPhone||""}</td>
        <td>${t.pickup||""}</td>
        <td>${t.dropoff||""}</td>
        <td>${t.tripDate||""}</td>
        <td>${t.tripTime||""}</td>
        <td>${t.status||"Scheduled"}</td>
        <td>${actions}</td>
      `;

      table.appendChild(tr);
    });

    container.appendChild(table);
  }

  /* ================= ACTIONS ================= */

  window.confirmTrip = async function(i){
    if(tripPassed(trips[i])){
      alert("Trip already passed.");
      return;
    }
    trips[i].status="Confirmed";
    await saveTrips();
    render();
  };

  window.cancelTrip = async function(i){
    trips[i].status="Cancelled";
    await saveTrips();
    render();
  };

  window.deleteTrip = async function(i){
    if(!confirm("Delete this trip?")) return;
    trips.splice(i,1);
    await saveTrips();
    render();
  };

  window.editTrip = async function(i,btn){

    const t = trips[i];

    if(tripPassed(t)){
      alert("Trip already passed.");
      return;
    }

    const newDate = prompt("New Date (YYYY-MM-DD)", t.tripDate);
    if(!newDate) return;

    const newTime = prompt("New Time (HH:MM)", t.tripTime);
    if(!newTime) return;

    const temp={tripDate:newDate,tripTime:newTime};

    if(inside120(temp)){
      if(!confirm("⚠️ Within 120 minutes.\nContinue?")) return;
    }

    t.tripDate=newDate;
    t.tripTime=newTime;
    t.status="Scheduled";

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