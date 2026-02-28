document.addEventListener("DOMContentLoaded", function(){

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

/* ===============================
   TIME HELPERS (Arizona)
================================ */
function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" }));
}

function getTripDT(date,time){
  if(!date || !time) return null;
  const dt = new Date(date + "T" + time);
  return String(dt)==="Invalid Date"?null:dt;
}

function minutesToTrip(date,time){
  const dt = getTripDT(date,time);
  if(!dt) return null;
  return (dt - getAZNow())/60000;
}

function isWithin120(date,time){
  const mins = minutesToTrip(date,time);
  return mins!==null && mins>0 && mins<=120;
}

function tripPassed(date,time){
  const mins = minutesToTrip(date,time);
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

const saveDraftBtn   = document.getElementById("saveTrip");
const submitTripBtn  = document.getElementById("submitTrip");

/* ===============================
   ENTRY (Persistent)
================================ */

function lockEntry(){
  entryName.disabled = true;
  entryPhone.disabled = true;
  editEntry.style.display = "inline-block";
}

function unlockEntry(){
  entryName.disabled = false;
  entryPhone.disabled = false;
}

function loadEntry(){
  let saved=null;
  try{ saved = JSON.parse(localStorage.getItem("entryInfo")); }catch{}
  if(saved){
    entryName.value  = saved.name || "";
    entryPhone.value = saved.phone || "";
    lockEntry();
  }
}
loadEntry();

editEntry.addEventListener("click", function(e){
  e.preventDefault();
  unlockEntry();
});

/* ===============================
   STOPS (Max 5)
================================ */
function addStop(value=""){
  if(stopsBox.querySelectorAll("input").length >= 5){
    alert("Maximum 5 stops.");
    return;
  }
  const input = document.createElement("input");
  input.type="text";
  input.placeholder="Stop";
  input.value=value;
  stopsBox.appendChild(input);
}

addStopBtn.addEventListener("click", function(e){
  e.preventDefault();
  addStop();
});

/* ===============================
   TRIP NUMBER
================================ */
function generateTripNumber(){
  const key="lastCompanyTrip_"+companyName;
  let last=parseInt(localStorage.getItem(key)||"300",10);
  last++;
  localStorage.setItem(key,last);
  return "GH-"+last;
}

/* ===============================
   DRAFT (per company)
================================ */
const DRAFT_KEY="companyDraft_"+companyName;

function saveDraft(){
  const draft={
    clientName:clientName.value,
    clientPhone:clientPhone.value,
    pickup:pickup.value,
    dropoff:dropoff.value,
    tripDate:tripDate.value,
    tripTime:tripTime.value,
    notes:notes.value,
    stops:[...stopsBox.querySelectorAll("input")].map(i=>i.value)
  };
  localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));
}

function loadDraft(){
  let draft=null;
  try{ draft=JSON.parse(localStorage.getItem(DRAFT_KEY)); }catch{}
  if(!draft) return;

  clientName.value=draft.clientName||"";
  clientPhone.value=draft.clientPhone||"";
  pickup.value=draft.pickup||"";
  dropoff.value=draft.dropoff||"";
  tripDate.value=draft.tripDate||"";
  tripTime.value=draft.tripTime||"";
  notes.value=draft.notes||"";

  stopsBox.innerHTML="";
  if(Array.isArray(draft.stops)){
    draft.stops.forEach(s=>{ if((s||"").trim()) addStop(s); });
  }
}
loadDraft();

/* ===============================
   CLEAR FORM AFTER SUBMIT
================================ */
function clearTripFields(){
  clientName.value="";
  clientPhone.value="";
  pickup.value="";
  dropoff.value="";
  tripDate.value="";
  tripTime.value="";
  notes.value="";
  stopsBox.innerHTML="";
}

/* ===============================
   SERVER CREATE
================================ */
async function createTrip(trip){
  const res = await fetch("/api/trips",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer "+token
    },
    body:JSON.stringify(trip)
  });
  if(!res.ok){
    const txt=await res.text().catch(()=> "");
    throw new Error(txt||"Server error");
  }
  return await res.json();
}

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
    const ok=confirm("⚠️ Within 120 minutes.\nAfter saving, you cannot modify.\nContinue?");
    if(!ok) return;
  }

  try{

    // save entry permanently
    localStorage.setItem("entryInfo",JSON.stringify({
      name:entryName.value,
      phone:entryPhone.value
    }));
    lockEntry();

    const stops=[...stopsBox.querySelectorAll("input")]
      .map(i=>i.value.trim())
      .filter(Boolean);

    const trip={
      tripNumber:generateTripNumber(),
      type:"Company",
      company:companyName,

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

    await createTrip(trip);

    localStorage.removeItem(DRAFT_KEY);

    clearTripFields();   // ✅ يمسح كل حاجة غير Entry
    alert("Trip saved ✔");

  }catch(err){
    alert("Server Error: "+err.message);
  }

});

});