window.addEventListener("DOMContentLoaded", async () => {

/* ===============================
   AUTH
================================ */
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}

const container=document.getElementById("tripsContainer");

/* ===============================
   TIME HELPERS
================================ */
function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" }));
}
function getTripDT(t){
  if(!t.tripDate||!t.tripTime) return null;
  const dt=new Date(t.tripDate+"T"+t.tripTime);
  return String(dt)==="Invalid Date"?null:dt;
}
function minutesToTrip(t){
  const dt=getTripDT(t);
  if(!dt) return null;
  return (dt-getAZNow())/60000;
}
function isWithin120(t){
  const mins=minutesToTrip(t);
  return mins!==null && mins>0 && mins<=120;
}

/* ===============================
   SERVER
================================ */
let trips=[];

async function fetchTrips(){
  const res=await fetch("/api/trips/company",{
    headers:{ "Authorization":"Bearer "+token }
  });
  if(!res.ok) throw new Error("Load failed");
  trips=await res.json();
  if(!Array.isArray(trips)) trips=[];
}

async function updateTrip(id,data){
  await fetch("/api/trips/"+id,{
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer "+token
    },
    body:JSON.stringify(data)
  });
}

async function deleteTrip(id){
  await fetch("/api/trips/"+id,{
    method:"DELETE",
    headers:{ "Authorization":"Bearer "+token }
  });
}

/* ===============================
   RENDER
================================ */
function render(){

  container.innerHTML="";

  if(!trips.length){
    container.innerHTML="<div style='padding:10px'>No trips found.</div>";
    return;
  }

  const groups={};
  trips.forEach(t=>{
    const key=(t.createdAt?new Date(t.createdAt):new Date()).toLocaleDateString();
    if(!groups[key]) groups[key]=[];
    groups[key].push(t);
  });

  const dates=Object.keys(groups).sort((a,b)=>new Date(b)-new Date(a));

  dates.forEach(date=>{

    const title=document.createElement("div");
    title.className="date-title";
    title.innerText=date;
    container.appendChild(title);

    const table=document.createElement("table");
    table.innerHTML=`
      <tr>
        <th>#</th>
        <th>Client</th>
        <th>Pickup</th>
        <th>Drop</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    `;

    groups[date].forEach((t,i)=>{

      const tr=document.createElement("tr");
      tr.dataset.id=t._id;

      const mins=minutesToTrip(t);
      if(mins!==null && mins>0 && mins<=120) tr.classList.add("yellow");
      if(mins!==null && mins<=0) tr.classList.add("red");

      let actions="";

      if(isWithin120(t)){
        actions=`<button data-action="cancel">Cancel</button>`;
      }else{
        if(t.status==="Confirmed"){
          actions=`<button data-action="cancel">Cancel</button>`;
        }else{
          actions=`
            <button data-action="edit">Edit</button>
            <button data-action="delete">Delete</button>
            <button data-action="confirm">Confirm</button>
          `;
        }
      }

      tr.innerHTML=`
        <td>${i+1}</td>
        <td>${t.clientName||""}</td>
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
  });
}

/* ===============================
   EVENTS
================================ */
container.addEventListener("click", async (e)=>{

  const btn=e.target.closest("button");
  if(!btn) return;

  const tr=e.target.closest("tr");
  if(!tr) return;

  const id=tr.dataset.id;
  const action=btn.dataset.action;

  const t=trips.find(x=>x._id===id);
  if(!t) return;

  if(action==="confirm"){
    await updateTrip(id,{status:"Confirmed"});
  }

  if(action==="cancel"){
    if(!confirm("Cancel trip?")) return;
    await updateTrip(id,{status:"Cancelled"});
  }

  if(action==="delete"){
    if(!confirm("Delete trip?")) return;
    await deleteTrip(id);
  }

  await fetchTrips();
  render();

});

/* ===============================
   INIT
================================ */
await fetchTrips();
render();

});