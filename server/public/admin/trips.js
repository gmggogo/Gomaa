const API_URL="/api/trips";

const container=document.getElementById("tripsContainer");
const searchBox=document.getElementById("searchBox");

let trips=[];

/* CLOCK */

function updateClock(){
 const now=new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"});
 document.getElementById("clock").innerText=now;
}
setInterval(updateClock,1000);
updateClock();

/* LOAD */

async function loadTrips(){

 const res=await fetch(API_URL);
 const data=await res.json();

 trips=data||[];

 render();
}

/* TODAY / TOMORROW */

function getDayType(date){

 const now=new Date(new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"}));

 const today=new Date(now);
 today.setHours(0,0,0,0);

 const tomorrow=new Date(today);
 tomorrow.setDate(today.getDate()+1);

 const trip=new Date(date);
 trip.setHours(0,0,0,0);

 if(trip.getTime()===today.getTime()) return "today";
 if(trip.getTime()===tomorrow.getTime()) return "tomorrow";

 return null;
}

/* ADD STOP */

function addStop(id){

 const row=document.getElementById("row-"+id);
 const input=row.querySelector(".stops");

 let stops=input.value.split("→").map(s=>s.trim()).filter(Boolean);

 if(stops.length>=5){
  alert("Maximum 5 stops");
  return;
 }

 stops.push("New Stop");

 input.value=stops.join(" → ");
}

/* RENDER */

function render(){

 container.innerHTML="";

 const groups={
  today:[],
  tomorrow:[]
 };

 trips.forEach(t=>{
  const type=getDayType(t.tripDate);
  if(type) groups[type].push(t);
 });

 drawGroup("Today Trips",groups.today,"today-group");
 drawGroup("Tomorrow Trips",groups.tomorrow,"tomorrow-group");

}

/* DRAW GROUP */

function drawGroup(title,list,className){

 if(!list.length) return;

 const div=document.createElement("div");
 div.className="group-title "+className;
 div.innerText=title;
 container.appendChild(div);

 const table=document.createElement("table");
 table.className="hub-table";

 table.innerHTML=`
 <tr>
 <th>#</th>
 <th>Trip</th>
 <th>Company</th>
 <th>Entry Name</th>
 <th>Entry Phone</th>
 <th>Client</th>
 <th>Phone</th>
 <th>Pickup</th>
 <th>Stops</th>
 <th>Dropoff</th>
 <th>Date</th>
 <th>Time</th>
 <th>Actions</th>
 </tr>
 `;

 list.forEach((t,i)=>{

 const stops=(t.stops||[]).join(" → ");

 const tr=document.createElement("tr");
 tr.id="row-"+t._id;

 tr.innerHTML=`

 <td>${i+1}</td>
 <td>${t.tripNumber||""}</td>

 <td><input value="${t.company||""}" disabled></td>

 <td><input value="${t.entryName||""}" disabled></td>
 <td><input value="${t.entryPhone||""}" disabled></td>

 <td><input value="${t.clientName||""}" disabled></td>
 <td><input value="${t.clientPhone||""}" disabled></td>

 <td><input value="${t.pickup||""}" disabled></td>

 <td>
 <input class="stops" value="${stops}" disabled>
 <button class="stop-btn" onclick="addStop('${t._id}')">+ Stop</button>
 </td>

 <td><input value="${t.dropoff||""}" disabled></td>

 <td>${t.tripDate||""}</td>
 <td>${t.tripTime||""}</td>

 <td>

 <div class="hub-actions">

 <button class="hub-btn edit-btn">Edit</button>
 <button class="hub-btn save-btn">Save</button>
 <button class="hub-btn delete-btn">Delete</button>

 </div>

 </td>

 `;

 table.appendChild(tr);

 });

 container.appendChild(table);

}

/* SEARCH */

if(searchBox){

 searchBox.addEventListener("input",function(){

 const v=this.value.toLowerCase();

 trips=trips.filter(t=>JSON.stringify(t).toLowerCase().includes(v));

 render();

 });

}

/* INIT */

loadTrips();