window.addEventListener("DOMContentLoaded", async () => {

let loggedCompany = null;
try { loggedCompany = JSON.parse(localStorage.getItem("loggedCompany")); } catch {}
if (!loggedCompany) {
  window.location.href = "company-login.html";
  return;
}

const container = document.getElementById("tripsContainer");
let trips = [];

/* ================= TIME ================= */
function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" }));
}
function getTripDT(t){
  if(!t.tripDate||!t.tripTime) return null;
  return new Date(t.tripDate+"T"+t.tripTime);
}
function minutesToTrip(t){
  const dt=getTripDT(t);
  if(!dt) return null;
  return (dt-getAZNow())/60000;
}
function within120(t){
  const m=minutesToTrip(t);
  return m!==null && m>0 && m<=120;
}
function passed(t){
  const m=minutesToTrip(t);
  return m!==null && m<=0;
}

/* ================= LOAD ================= */
async function load(){
  const res = await fetch("/api/trips/company/"+loggedCompany.name);
  trips = await res.json();
  render();
}

/* ================= RENDER ================= */
function render(){
  container.innerHTML="";
  if(!trips.length){
    container.innerHTML="<p>No Trips</p>";
    return;
  }

  const table=document.createElement("table");
  table.innerHTML=`
  <tr>
  <th>#</th>
  <th>Trip#</th>
  <th>Client</th>
  <th>Pickup</th>
  <th>Date</th>
  <th>Time</th>
  <th>Status</th>
  <th>Actions</th>
  </tr>`;

  trips.forEach((t,i)=>{
    const tr=document.createElement("tr");

    const is120=within120(t);
    const isPassed=passed(t);

    let actions="";

    if(t.status==="Confirmed"){
      actions=`<button class="btn cancel" onclick="cancelTrip('${t._id}')">Cancel</button>`;
    }
    else if(is120){
      actions=`<button class="btn cancel" onclick="cancelTrip('${t._id}')">Cancel</button>`;
    }
    else{
      actions=`
      <button class="btn edit" onclick="editTrip('${t._id}')">Edit</button>
      <button class="btn delete" onclick="deleteTrip('${t._id}')">Delete</button>
      <button class="btn confirm" onclick="confirmTrip('${t._id}')">Confirm</button>`;
    }

    tr.innerHTML=`
    <td>${i+1}</td>
    <td>${t.tripNumber||""}</td>
    <td>${t.clientName||""}</td>
    <td>${t.pickup||""}</td>
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
window.confirmTrip = async function(id){
  await fetch("/api/trips/"+id,{
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ status:"Confirmed" })
  });
  load();
};

window.cancelTrip = async function(id){
  await fetch("/api/trips/"+id,{
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ status:"Cancelled" })
  });
  load();
};

window.deleteTrip = async function(id){
  if(!confirm("Delete this trip?")) return;
  await fetch("/api/trips/"+id,{ method:"DELETE" });
  load();
};

window.editTrip = async function(id){
  alert("Edit page can be implemented if needed with same 120 rule.");
};

load();

});