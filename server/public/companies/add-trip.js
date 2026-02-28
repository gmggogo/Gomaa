document.addEventListener("DOMContentLoaded", function(){

/* ===============================
   AUTH (Company)
================================ */
let loggedCompany = null;
try { loggedCompany = JSON.parse(localStorage.getItem("loggedCompany")); } catch {}

if (!loggedCompany || !loggedCompany.name) {
  window.location.href = "company-login.html";
  return;
}

/* ===============================
   TIME (Arizona)
================================ */
function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" }));
}

function getTripDateTime(tripDate, tripTime){
  if (!tripDate || !tripTime) return null;

  // support "YYYY-MM-DD" + "HH:MM"
  const dt = new Date(tripDate + "T" + tripTime);
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

const clientName  = document.getElementById("clientName");
const clientPhone = document.getElementById("clientPhone");
const pickup      = document.getElementById("pickup");
const dropoff     = document.getElementById("dropoff");
const tripDate    = document.getElementById("tripDate");
const tripTime    = document.getElementById("tripTime");
const notes       = document.getElementById("notes");
const stopsContainer = document.getElementById("stops");

const addStopBtn    = document.getElementById("addStopBtn");
const saveTripBtn   = document.getElementById("saveTrip");
const submitTripBtn = document.getElementById("submitTrip");

/* ===============================
   ENTRY SAVE / EDIT (LOCK)
================================ */
function lockEntry(){
  if(entryName) entryName.disabled = true;
  if(entryPhone) entryPhone.disabled = true;
  if(saveEntry) saveEntry.style.display = "none";
  if(editEntry) editEntry.style.display = "inline-block";
}

function unlockEntry(){
  if(entryName) entryName.disabled = false;
  if(entryPhone) entryPhone.disabled = false;
  if(saveEntry) saveEntry.style.display = "inline-block";
  if(editEntry) editEntry.style.display = "none";
}

function loadEntry(){
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("entryInfo") || "null"); } catch {}
  if(saved){
    if(entryName) entryName.value = saved.name || "";
    if(entryPhone) entryPhone.value = saved.phone || "";
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
  input.placeholder = "Stop";
  input.value = value;
  stopsContainer.appendChild(input);
  input.addEventListener("input", saveDraft);
}

if(addStopBtn){
  addStopBtn.addEventListener("click", function(e){
    e.preventDefault();
    // max 5 stops (لو عايز)
    const count = stopsContainer.querySelectorAll("input").length;
    if(count >= 5){
      alert("Max 5 stops.");
      return;
    }
    addStopField("");
    saveDraft();
  });
}

/* ===============================
   DRAFT KEY (PER COMPANY)
================================ */
const DRAFT_KEY = "companyDraftTrip_" + (loggedCompany.username || loggedCompany.name || "default");

/* ===============================
   DRAFT SAVE / LOAD
================================ */
function saveDraft(){
  const draft = {
    entryName: entryName ? (entryName.value || "") : "",
    entryPhone: entryPhone ? (entryPhone.value || "") : "",
    clientName: clientName ? (clientName.value || "") : "",
    clientPhone: clientPhone ? (clientPhone.value || "") : "",
    pickup: pickup ? (pickup.value || "") : "",
    dropoff: dropoff ? (dropoff.value || "") : "",
    tripDate: tripDate ? (tripDate.value || "") : "",
    tripTime: tripTime ? (tripTime.value || "") : "",
    notes: notes ? (notes.value || "") : "",
    stops: [...stopsContainer.querySelectorAll("input")].map(i=>i.value || "")
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function loadDraft(){
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch {}
  if(!draft) return;

  if(entryName && !entryName.disabled) entryName.value = draft.entryName || entryName.value || "";
  if(entryPhone && !entryPhone.disabled) entryPhone.value = draft.entryPhone || entryPhone.value || "";
  if(clientName) clientName.value = draft.clientName || "";
  if(clientPhone) clientPhone.value = draft.clientPhone || "";
  if(pickup) pickup.value = draft.pickup || "";
  if(dropoff) dropoff.value = draft.dropoff || "";
  if(tripDate) tripDate.value = draft.tripDate || "";
  if(tripTime) tripTime.value = draft.tripTime || "";
  if(notes) notes.value = draft.notes || "";

  stopsContainer.innerHTML = "";
  if(Array.isArray(draft.stops)){
    draft.stops.forEach(s => addStopField(s));
  }
}
loadDraft();

document.querySelectorAll("input, textarea").forEach(el=>{
  el.addEventListener("input", saveDraft);
});

/* ===============================
   TRIP #
================================ */
function generateTripNumber(){
  // Unique & safe
  return "GH-" + Date.now();
}

/* ===============================
   COLLECT
================================ */
function collect(statusType){

  const stops = [...stopsContainer.querySelectorAll("input")]
    .map(i => (i.value || "").trim())
    .filter(Boolean);

  return {
    tripNumber: generateTripNumber(),
    type: "Company",
    company: loggedCompany.name || "",

    // مهم: نفس أسماء السيرفر عندك
    entryName: entryName ? (entryName.value || "") : "",
    entryPhone: entryPhone ? (entryPhone.value || "") : "",

    clientName: clientName ? (clientName.value || "") : "",
    clientPhone: clientPhone ? (clientPhone.value || "") : "",

    pickup: pickup ? (pickup.value || "") : "",
    dropoff: dropoff ? (dropoff.value || "") : "",
    stops,

    tripDate: tripDate ? (tripDate.value || "") : "",
    tripTime: tripTime ? (tripTime.value || "") : "",

    notes: notes ? (notes.value || "") : "",

    status: statusType
  };
}

/* ===============================
   SAVE DRAFT BUTTON
================================ */
if(saveTripBtn){
  saveTripBtn.addEventListener("click", function(e){
    e.preventDefault();
    saveDraft();
    alert("Saved ✔");
  });
}

/* ===============================
   SUBMIT -> SERVER -> REVIEW
================================ */
let isSending = false;

if(submitTripBtn){
submitTripBtn.addEventListener("click", async function(e){

  e.preventDefault();

  if(isSending) return;

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
    if(!confirm("⚠️ Within 120 minutes.\nAfter submission, you cannot modify it.\nContinue?")){
      return;
    }
  }

  const trip = collect("Scheduled");

  try{
    isSending = true;
    submitTripBtn.disabled = true;

    const res = await fetch("/api/trips",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(trip)
    });

    if(!res.ok){
      const txt = await res.text().catch(()=> "");
      alert("Server Error: " + (txt || "Failed to create trip"));
      submitTripBtn.disabled = false;
      isSending = false;
      return;
    }

    localStorage.removeItem(DRAFT_KEY);
    window.location.href = "review.html";

  }catch(err){
    alert("Server Error: " + err.message);
    submitTripBtn.disabled = false;
    isSending = false;
  }
});
}

});