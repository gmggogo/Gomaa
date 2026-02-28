window.addEventListener("DOMContentLoaded", async () => {

/* ===============================
   AUTH (JWT)
================================ */
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const companyName = localStorage.getItem("name");

if (!token || role !== "company" || !companyName) {
  window.location.replace("company-login.html");
  return;
}

const container = document.getElementById("tripsContainer");

/* ===============================
   TIME HELPERS
================================ */
function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" }));
}

function getTripDT(t){
  if(!t.tripDate || !t.tripTime) return null;
  const dt = new Date(t.tripDate + "T" + t.tripTime);
  return String(dt)==="Invalid Date"?null:dt;
}

function minutesToTrip(t){
  const dt = getTripDT(t);
  if(!dt) return null;
  return (dt - getAZNow())/60000;
}

function isWithin120(t){
  const mins = minutesToTrip(t);
  return mins!==null && mins>0 && mins<=120;
}

/* ===============================
   SERVER API
================================ */
let trips = [];

async function fetchTrips(){
  const res = await fetch("/api/trips/company/"+encodeURIComponent(companyName),{
    headers:{ "Authorization":"Bearer "+token }
  });
  if(!res.ok) throw new Error("Failed to load trips");
  trips = await res.json();
  if(!Array.isArray(trips)) trips=[];
}

async function updateTrip(id,data){
  const res = await fetch("/api/trips/"+id,{
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer "+token
    },
    body:JSON.stringify(data)
  });
  if(!res.ok) throw new Error("Update failed");
}

async function deleteTrip(id){
  const res = await fetch("/api/trips/"+id,{
    method:"DELETE",
    headers:{ "Authorization":"Bearer "+token }
  });
  if(!res.ok) throw new Error("Delete failed");
}

/* ===============================
   KEEP 30 DAYS
================================ */
function keep30Days(list){
  const now=new Date();
  return list.filter(t=>{
    const c=t.createdAt?new Date(t.createdAt):null;
    if(!c || String(c)==="Invalid Date") return true;
    return (now-c)/(1000*60*60*24)<=30;
  });
}

/* ===============================
   GROUP BY DATE
================================ */
function groupByCreated(list){
  const groups={};
  list.forEach(t=>{
    const d=t.createdAt?new Date(t.createdAt):new Date();
    const key=d.toLocaleDateString();
    if(!groups[key]) groups[key]=[];
    groups[key].push(t);
  });
  return groups;
}

/* ===============================
   RENDER
================================ */
function render(){

  container.innerHTML="";

  const filtered=keep30Days(trips);
  const groups=groupByCreated(filtered);

  const dates=Object.keys(groups).sort((a,b)=>new Date(b)-new Date(a));

  if(!dates.length){
    container.innerHTML="<div style='padding:10px'>No trips found.</div>";
    return;
  }

  dates.forEach(date=>{

    const title=document.createElement("div");
    title.className="date-title";
    title.innerText=date;
    container.appendChild(title);

    const table=document.createElement("table");

    table.innerHTML=`
      <tr>
        <th>#</th>
        <th>Trip#</th>
        <th>Entered By</th>
        <th>Entered Phone</th>
        <th>Client</th>
        <th>Phone</th>
        <th>Pickup</th>
        <th>Drop</th>
        <th>Stops</th>
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

      const editing=t.__editing===true;

      function cell(val,cls,type="text"){
        if(!editing) return (val||"");
        return `<input type="${type}" class="edit-input ${cls}" value="${val||""}">`;
      }

      const stopsText=Array.isArray(t.stops)?t.stops.join(" | "):"";

      let actions="";

      if(isWithin120(t)){
        actions=`<button class="btn cancel" data-action="cancel">Cancel</button>`;
      }else{
        if(t.status==="Confirmed"){
          actions=`<button class="btn cancel" data-action="cancel">Cancel</button>`;
        }else{
          actions=`
            <button class="btn edit" data-action="edit">${editing?"Save":"Edit"}</button>
            <button class="btn delete" data-action="delete">Delete</button>
            <button class="btn confirm" data-action="confirm">Confirm</button>
          `;
        }
      }

      tr.innerHTML=`
        <td>${i+1}</td>
        <td>${t.tripNumber||""}</td>
        <td>${cell(t.entryName,"entryName")}</td>
        <td>${cell(t.entryPhone,"entryPhone")}</td>
        <td>${cell(t.clientName,"clientName")}</td>
        <td>${cell(t.clientPhone,"clientPhone")}</td>
        <td>${cell(t.pickup,"pickup")}</td>
        <td>${cell(t.dropoff,"dropoff")}</td>
        <td>${stopsText}</td>
        <td>${cell(t.tripDate,"tripDate","date")}</td>
        <td>${cell(t.tripTime,"tripTime","time")}</td>
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