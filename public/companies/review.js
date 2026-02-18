window.addEventListener("DOMContentLoaded", () => {

const container=document.getElementById("tripsContainer");
let trips=JSON.parse(localStorage.getItem("trips"))||[];

/* ================= CLOCK ================= */
function updateClock(){
document.getElementById("azDateTime").innerText=
new Intl.DateTimeFormat("en-US",{
timeZone:"America/Phoenix",
year:"numeric",month:"short",day:"2-digit",
hour:"2-digit",minute:"2-digit",second:"2-digit"
}).format(new Date());
}
setInterval(updateClock,1000);
updateClock();

/* ================= GREETING ================= */
const h=new Date().getHours();
document.getElementById("greetingText").innerText=
h<12?"Good Morning ☀️":h<18?"Good Afternoon 🌤":"Good Evening 🌙";

/* ================= TIME ================= */
function getAZNow(){
return new Date(new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"}));
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

/* ================= KEEP 30 DAYS ================= */
function keep30Days(){
const now=new Date();
trips=trips.filter(t=>{
if(!t.createdAt) return true;
return (now-new Date(t.createdAt))/(1000*60*60*24)<=30;
});
}

/* ================= GROUP BY CREATED DATE ================= */
function groupByCreated(){
const groups={};
trips.forEach(t=>{
const d=new Date(t.createdAt||Date.now()).toLocaleDateString();
if(!groups[d]) groups[d]=[];
groups[d].push(t);
});
return groups;
}

/* ================= SAVE ================= */
function save(){
localStorage.setItem("trips",JSON.stringify(trips));
}

/* ================= RENDER ================= */
function render(){
container.innerHTML="";
keep30Days();

const groups=groupByCreated();

Object.keys(groups).sort((a,b)=>new Date(b)-new Date(a))
.forEach(date=>{

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
</tr>`;

groups[date].forEach((t,i)=>{

const tr=document.createElement("tr");
const mins=minutesToTrip(t);

if(mins>0 && mins<=120) tr.classList.add("yellow");
if(mins<=0) tr.classList.add("red");

const editing=t.editing===true;

function cell(val,cls,type="text"){
if(!editing) return val||"";
return `<input type="${type}" class="edit-input ${cls}" value="${val||""}">`;
}

let actions="";

if(t.status==="Confirmed"){
actions=`<button class="btn cancel" onclick="cancelTrip(${i})">Cancel</button>`;
}else{
actions=`
<button class="btn edit" onclick="editTrip(${i})">${editing?"Save":"Edit"}</button>
<button class="btn delete" onclick="deleteTrip(${i})">Delete</button>
<button class="btn confirm" onclick="confirmTrip(${i})">Confirm</button>`;
}

tr.innerHTML=`
<td>${i+1}</td>
<td>${t.tripNumber||""}</td>
<td>${cell(t.enteredBy,"enteredBy")}</td>
<td>${cell(t.enteredPhone,"enteredPhone")}</td>
<td>${cell(t.clientName,"clientName")}</td>
<td>${cell(t.clientPhone,"clientPhone")}</td>
<td>${cell(t.pickup,"pickup")}</td>
<td>${cell(t.dropoff,"dropoff")}</td>
<td>${Array.isArray(t.stops)?t.stops.join(" | "):""}</td>
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

/* ================= ACTIONS ================= */

window.editTrip=function(i){
const t=trips[i];

if(!t.editing){
t.editing=true;
render();
return;
}

/* SAVE */
const row=container.querySelectorAll("table")[0].rows[i+1];

const newDate=row.querySelector(".tripDate")?.value||t.tripDate;
const newTime=row.querySelector(".tripTime")?.value||t.tripTime;

const temp={...t,tripDate:newDate,tripTime:newTime};
const mins=minutesToTrip(temp);

if(mins>0 && mins<=120){
const ok=confirm("WARNING:\nThis trip is within 120 minutes.\nAre you sure you want to modify it?");
if(!ok) return;
}

t.enteredBy=row.querySelector(".enteredBy")?.value||t.enteredBy;
t.enteredPhone=row.querySelector(".enteredPhone")?.value||t.enteredPhone;
t.clientName=row.querySelector(".clientName")?.value||t.clientName;
t.clientPhone=row.querySelector(".clientPhone")?.value||t.clientPhone;
t.pickup=row.querySelector(".pickup")?.value||t.pickup;
t.dropoff=row.querySelector(".dropoff")?.value||t.dropoff;
t.tripDate=newDate;
t.tripTime=newTime;

t.status="Scheduled";
t.editing=false;
save();
render();
};

window.confirmTrip=function(i){
trips[i].status="Confirmed";
trips[i].editing=false;
save();
render();
};

window.cancelTrip=function(i){
trips[i].status="Cancelled";
trips[i].editing=false;
save();
render();
};

window.deleteTrip=function(i){
if(confirm("Delete this trip?")){
trips.splice(i,1);
save();
render();
}
};

render();

});