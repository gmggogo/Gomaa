document.addEventListener("DOMContentLoaded", function(){

/* ===============================
   AUTH
================================ */
let loggedCompany = null;
try {
  loggedCompany = JSON.parse(localStorage.getItem("loggedCompany"));
} catch {}

if (!loggedCompany) {
  window.location.href = "company-login.html";
  return;
}

/* ===============================
   TIME (Arizona)
================================ */
function getAZNow(){
  return new Date(
    new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" })
  );
}

function getTripDateTime(tripDate, tripTime){
  if (!tripDate || !tripTime) return null;

  const [y,m,d] = tripDate.split("-");
  const [hh,mm] = tripTime.split(":");

  if(!y || !m || !d || hh === undefined || mm === undefined) return null;

  const dt = new Date(Number(y), Number(m)-1, Number(d), Number(hh), Number(mm));
  return String(dt) === "Invalid Date" ? null : dt;
}

function minutesToTrip(tripDate, tripTime){
  const dt = getTripDateTime(tripDate, tripTime);
  if(!dt) return null;
  return (dt - getAZNow()) / 60000;
}

function isWithin120Minutes(tripDate, tripTime){
  const mins = minutesToTrip(tripDate, tripTime);
  return mins !== null && mins > 0 && mins <= 120;
}

function tripPassed(tripDate, tripTime){
  const mins = minutesToTrip(tripDate, tripTime);
  return mins !== null && mins <= 0;
}

/* ===============================
   DOM
================================ */
const entryName  = document.getElementById("entryName");
const entryPhone = document.getElementById("entryPhone");
const saveEntry  = document.getElementById("saveEntry");
const editEntry  = document.getElementById("editEntry");

const clientName = document.getElementById("clientName");
const clientPhone = document.getElementById("clientPhone");
const pickup = document.getElementById("pickup");
const dropoff = document.getElementById("dropoff");
const tripDate = document.getElementById("tripDate");
const tripTime = document.getElementById("tripTime");
const notes = document.getElementById("notes");
const stopsContainer = document.getElementById("stops");

const saveTripBtn   = document.getElementById("saveTrip");
const submitTripBtn = document.getElementById("submitTrip");

/* ===============================
   DRAFT KEY
================================ */
const DRAFT_KEY = "companyDraftTrip";

/* ===============================
   ENTRY SAVE / EDIT
================================ */
function lockEntry(){
  entryName.disabled = true;
  entryPhone.disabled = true;
  if(saveEntry) saveEntry.style.display = "none";
  if(editEntry) editEntry.style.display = "inline-block";
}

function unlockEntry(){
  entryName.disabled = false;
  entryPhone.disabled = false;
  if(saveEntry) saveEntry.style.display = "inline-block";
  if(editEntry) editEntry.style.display = "none";
}

function loadEntry(){
  const saved = JSON.parse(localStorage.getItem("entryInfo") || "null");
  if(saved){
    entryName.value = saved.name || "";
    entryPhone.value = saved.phone || "";
    lockEntry();
  }else{
    unlockEntry();
  }
}
loadEntry();

if(saveEntry){
  saveEntry.addEventListener("click", function(e){
    e.preventDefault();
    if(!entryName.value || !entryPhone.value){
      alert("Please enter Entry Name and Phone.");
      return;
    }
    localStorage.setItem("entryInfo", JSON.stringify({
      name: entryName.value,
      phone: entryPhone.value
    }));
    lockEntry();
  });
}

if(editEntry){
  editEntry.addEventListener("click", function(e){
    e.preventDefault();
    unlockEntry();
  });
}

/* ===============================
   STOPS
================================ */
function addStopField(value=""){
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Stop address";
  input.value = value;
  stopsContainer.appendChild(input);
  input.addEventListener("input", saveDraft);
}

/* ===============================
   GENERATE TRIP #
================================ */
function generateTripNumber(){
  return "GH-" + Date.now();
}

/* ===============================
   COLLECT DATA
================================ */
function collect(statusType){
  return {
    tripNumber: generateTripNumber(),
    type: "Company",
    company: loggedCompany.name,

    entryName: entryName.value,
    entryPhone: entryPhone.value,

    clientName: clientName.value,
    clientPhone: clientPhone.value,
    pickup: pickup.value,
    dropoff: dropoff.value,

    stops: [...stopsContainer.querySelectorAll("input")]
      .map(i=>i.value.trim())
      .filter(Boolean),

    tripDate: tripDate.value,
    tripTime: tripTime.value,

    notes: notes.value,

    status: statusType,
    createdAt: new Date().toISOString()
  };
}

/* ===============================
   DRAFT SAVE / LOAD
================================ */
function saveDraft(){
  const draft = {
    entryName: entryName.value,
    entryPhone: entryPhone.value,
    clientName: clientName.value,
    clientPhone: clientPhone.value,
    pickup: pickup.value,
    dropoff: dropoff.value,
    tripDate: tripDate.value,
    tripTime: tripTime.value,
    notes: notes.value,
    stops: [...stopsContainer.querySelectorAll("input")].map(i=>i.value)
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function loadDraft(){
  const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  if(!draft) return;

  entryName.value = draft.entryName || "";
  entryPhone.value = draft.entryPhone || "";
  clientName.value = draft.clientName || "";
  clientPhone.value = draft.clientPhone || "";
  pickup.value = draft.pickup || "";
  dropoff.value = draft.dropoff || "";
  tripDate.value = draft.tripDate || "";
  tripTime.value = draft.tripTime || "";
  notes.value = draft.notes || "";

  stopsContainer.innerHTML="";
  if(draft.stops){
    draft.stops.forEach(s=>addStopField(s));
  }
}
loadDraft();

document.querySelectorAll("input, textarea").forEach(el=>{
  el.addEventListener("input", saveDraft);
});

/* ===============================
   SERVER SEND (Review Only)
================================ */
let isSending = false;

async function sendTripToReview(data){

  if(isSending) return false;
  isSending = true;
  submitTripBtn.disabled = true;

  try{
    const res = await fetch("/api/trips",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(data)
    });

    if(!res.ok) throw new Error("Server error");
    return true;

  }catch(err){
    alert("Server Error: " + err.message);
    return false;

  }finally{
    isSending = false;
    submitTripBtn.disabled = false;
  }
}

/* ===============================
   SAVE (LOCAL ONLY)
================================ */
saveTripBtn.addEventListener("click", function(e){
  e.preventDefault();
  saveDraft();
  alert("Saved ✔");
});

/* ===============================
   SUBMIT (Review Only)
================================ */
submitTripBtn.addEventListener("click", async function(e){

  e.preventDefault();

  if(!entryName.value || !entryPhone.value){
    alert("Complete Entry Info first.");
    return;
  }

  if(!tripDate.value || !tripTime.value){
    alert("Select trip date & time.");
    return;
  }

  if(tripPassed(tripDate.value, tripTime.value)){
    alert("Trip time already passed. Cannot book.");
    return;
  }

  if(isWithin120Minutes(tripDate.value, tripTime.value)){
    if(!confirm("⚠️ Within 120 minutes. No modification allowed.\nContinue?")){
      return;
    }
  }

  const trip = collect("Scheduled");

  const ok = await sendTripToReview(trip);

  if(ok){
    alert("Trip sent to Review ✔");
    localStorage.removeItem(DRAFT_KEY);
    window.location.href = "review.html";
  }
});

});