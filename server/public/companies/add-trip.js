document.addEventListener("DOMContentLoaded", function(){

/* ===============================
   AUTH
================================ */
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}

/* ===============================
   TIME HELPERS (Arizona)
================================ */
function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" }));
}
function getTripDT(date,time){
  if(!date || !time) return null;
  const dt=new Date(date+"T"+time);
  return String(dt)==="Invalid Date"?null:dt;
}
function minutesToTrip(date,time){
  const dt=getTripDT(date,time);
  if(!dt) return null;
  return (dt-getAZNow())/60000;
}
function isWithin120(date,time){
  const mins=minutesToTrip(date,time);
  return mins!==null && mins>0 && mins<=120;
}
function tripPassed(date,time){
  const mins=minutesToTrip(date,time);
  return mins!==null && mins<=0;
}

/* ===============================
   DOM
================================ */
const entryName   = document.getElementById("entryName");
const entryPhone  = document.getElementById("entryPhone");
const editEntry   = document.getElementById("editEntry");

const clientName  = document.getElementById("clientName");
const clientPhone = document.getElementById("clientPhone");
const pickup      = document.getElementById("pickup");
const dropoff     = document.getElementById("dropoff");
const tripDate    = document.getElementById("tripDate");
const tripTime    = document.getElementById("tripTime");
const notes       = document.getElementById("notes");

const stopsBox    = document.getElementById("stops");
const addStopBtn  = document.getElementById("addStopBtn");
const submitTripBtn = document.getElementById("submitTrip");

/* ===============================
   ENTRY (Persistent)
================================ */
function lockEntry(){
  entryName.disabled=true;
  entryPhone.disabled=true;
}
function unlockEntry(){
  entryName.disabled=false;
  entryPhone.disabled=false;
}

function loadEntry(){
  let saved=null;
  try{ saved=JSON.parse(localStorage.getItem("entryInfo")); }catch{}
  if(saved){
    entryName.value=saved.name||"";
    entryPhone.value=saved.phone||"";
    lockEntry();
  }
}
loadEntry();

editEntry.addEventListener("click",function(e){
  e.preventDefault();
  unlockEntry();
});

/* ===============================
   STOPS (Max 5)
================================ */
function addStop(value=""){
  if(stopsBox.querySelectorAll("input").length>=5){
    alert("Maximum 5 stops.");
    return;
  }
  const input=document.createElement("input");
  input.type="text";
  input.placeholder="Stop";
  input.value=value;
  stopsBox.appendChild(input);
}
addStopBtn.addEventListener("click",function(e){
  e.preventDefault();
  addStop();
});

/* ===============================
   SUBMIT
================================ */
submitTripBtn.addEventListener("click", async function(e){
  e.preventDefault();

  if(!entryName.value || !entryPhone.value){
    alert("Enter Entry Name & Phone.");
    return;
  }
  if(!tripDate.value || !tripTime.value){
    alert("Select date & time.");
    return;
  }
  if(tripPassed(tripDate.value,tripTime.value)){
    alert("Trip already passed.");
    return;
  }
  if(isWithin120(tripDate.value,tripTime.value)){
    const ok=confirm("⚠️ Within 120 minutes.\nContinue?");
    if(!ok) return;
  }

  try{

    localStorage.setItem("entryInfo",JSON.stringify({
      name:entryName.value,
      phone:entryPhone.value
    }));
    lockEntry();

    const stops=[...stopsBox.querySelectorAll("input")]
      .map(i=>i.value.trim())
      .filter(Boolean);

    const trip={
      entryName:entryName.value,
      entryPhone:entryPhone.value,
      clientName:clientName.value,
      clientPhone:clientPhone.value,
      pickup:pickup.value,
      dropoff:dropoff.value,
      stops,
      tripDate:tripDate.value,
      tripTime:tripTime.value,
      notes:notes.value,
      status:"Scheduled"
    };

    const res=await fetch("/api/trips",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer "+token
      },
      body:JSON.stringify(trip)
    });

    if(!res.ok) throw new Error("Server error");

    clientName.value="";
    clientPhone.value="";
    pickup.value="";
    dropoff.value="";
    tripDate.value="";
    tripTime.value="";
    notes.value="";
    stopsBox.innerHTML="";

    alert("Trip saved ✔");

  }catch(err){
    alert(err.message);
  }
});

});