window.addEventListener("DOMContentLoaded", () => {

const container = document.getElementById("tripsContainer");
const searchBox = document.getElementById("searchBox");

let trips = JSON.parse(localStorage.getItem("companyTrips") || "[]");

/* HEADER */
let loggedCompany = JSON.parse(localStorage.getItem("loggedCompany") || "{}");
document.getElementById("companyName").innerText = loggedCompany.name || "SUNBEAM";

function setGreeting(){
  const h = new Date().getHours();
  let msg = h < 12 ? "Good Morning ☀️" :
            h < 18 ? "Good Afternoon 🌤" :
                     "Good Evening 🌙";
  document.getElementById("greetingText").innerText = msg;
}
setGreeting();

function updateClock(){
  document.getElementById("azDateTime").innerText =
    new Intl.DateTimeFormat("en-US",{
      timeZone:"America/Phoenix",
      year:"numeric",month:"short",day:"2-digit",
      hour:"2-digit",minute:"2-digit",second:"2-digit"
    }).format(new Date());
}
setInterval(updateClock,1000);
updateClock();

/* TIME LOGIC */
function getTripDateTime(t){
  if(!t.tripDate || !t.tripTime) return null;
  return new Date(`${t.tripDate}T${t.tripTime}`);
}

function minutesToTrip(t){
  const dt = getTripDateTime(t);
  if(!dt) return null;
  return (dt - new Date())/60000;
}

function groupByCreated(){
  const groups={};
  trips.forEach(t=>{
    const d = new Date(t.createdAt || Date.now()).toLocaleDateString();
    if(!groups[d]) groups[d]=[];
    groups[d].push(t);
  });
  return groups;
}

function render(){

container.innerHTML="";

const groups = groupByCreated();

Object.keys(groups).sort((a,b)=> new Date(b)-new Date(a)).forEach(date=>{

  const div = document.createElement("div");
  div.className="date-group";
  div.innerHTML=`<div class="date-title">${date}</div>`;

  const table=document.createElement("table");

  table.innerHTML=`
    <tr>
      <th>#</th>
      <th>Trip #</th>
      <th>Entered By</th>
      <th>Entered Phone</th>
      <th>Client</th>
      <th>Client Phone</th>
      <th>Pickup</th>
      <th>Drop</th>
      <th>Stops</th>
      <th>Notes</th>
      <th>Date</th>
      <th>Time</th>
      <th>Status</th>
      <th>Actions</th>
    </tr>
  `;

  groups[date].forEach((t,i)=>{

    const tr=document.createElement("tr");

    const mins=minutesToTrip(t);
    if(mins!==null && mins<=120 && mins>0) tr.classList.add("yellow");
    if(mins!==null && mins<=0) tr.classList.add("red");

    tr.innerHTML=`
      <td>${i+1}</td>
      <td>${t.tripNumber||""}</td>
      <td>${t.enteredBy||""}</td>
      <td>${t.enteredPhone||""}</td>
      <td>${t.clientName||""}</td>
      <td>${t.clientPhone||""}</td>
      <td>${t.pickup||""}</td>
      <td>${t.dropoff||""}</td>
      <td>${(t.stops||[]).join(", ")}</td>
      <td>${t.notes||""}</td>
      <td>${t.tripDate||""}</td>
      <td>${t.tripTime||""}</td>
      <td>${t.status||"Scheduled"}</td>
      <td>
        ${t.status==="Scheduled" ? `
          <button class="btn-edit" onclick="editTrip(${trips.indexOf(t)})">Edit</button>
          <button class="btn-delete" onclick="deleteTrip(${trips.indexOf(t)})">Delete</button>
          <button class="btn-confirm" onclick="confirmTrip(${trips.indexOf(t)})">Confirm</button>
        ` : ""}
        ${t.status==="Confirmed" ? `
          <button class="btn-cancel" onclick="cancelTrip(${trips.indexOf(t)})">Cancel</button>
        ` : ""}
      </td>
    `;

    table.appendChild(tr);
  });

  div.appendChild(table);
  container.appendChild(div);

});
}

window.deleteTrip=function(i){
  trips.splice(i,1);
  localStorage.setItem("companyTrips",JSON.stringify(trips));
  render();
}

window.confirmTrip=function(i){
  trips[i].status="Confirmed";
  localStorage.setItem("companyTrips",JSON.stringify(trips));
  render();
}

window.cancelTrip=function(i){
  trips[i].status="Cancelled";
  localStorage.setItem("companyTrips",JSON.stringify(trips));
  render();
}

window.editTrip=function(i){
  alert("Edit mode here (logic already in your main JS)");
}

render();

});