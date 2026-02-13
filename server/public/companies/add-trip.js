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
}

/* ===============================
   ARIZONA TIME
================================ */
function getAZNow(){
  return new Date(
    new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" })
  );
}

function isWithin120Minutes(tripDate, tripTime) {
  if (!tripDate || !tripTime) return false;

  const tripDT = new Date(
    new Date(`${tripDate}T${tripTime}`)
    .toLocaleString("en-US",{ timeZone:"America/Phoenix" })
  );

  const diffMinutes = (tripDT - getAZNow()) / 60000;
  return diffMinutes > 0 && diffMinutes <= 120;
}

/* ===============================
   DOM ELEMENTS
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
   ENTRY SAVE / EDIT (LOCAL ONLY)
================================ */
function loadEntry() {
  const saved = JSON.parse(localStorage.getItem("entryInfo") || "null");

  if (saved) {
    entryName.value  = saved.name || "";
    entryPhone.value = saved.phone || "";
    lockEntry();
  } else {
    unlockEntry();
  }
}
loadEntry();

function lockEntry() {
  entryName.disabled = true;
  entryPhone.disabled = true;
  if(saveEntry) saveEntry.style.display = "none";
  if(editEntry) editEntry.style.display = "inline-block";
}

function unlockEntry() {
  entryName.disabled = false;
  entryPhone.disabled = false;
  if(saveEntry) saveEntry.style.display = "inline-block";
  if(editEntry) editEntry.style.display = "none";
}

if (saveEntry) {
  saveEntry.addEventListener("click", function(e){
    e.preventDefault();

    if (!entryName.value || !entryPhone.value) {
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

if (editEntry) {
  editEntry.addEventListener("click", function(e){
    e.preventDefault();
    unlockEntry();
  });
}

/* ===============================
   GENERATE TRIP NUMBER
   (تعديل بسيط: ضمان uniqueness عشان السيرفر مايرفضش)
================================ */
function generateTripNumber() {
  return "GH-" + Date.now() + "-" + Math.floor(Math.random()*1000);
}

/* ===============================
   COLLECT DATA
================================ */
function collectTripData(statusType) {

  return {
    tripNumber: generateTripNumber(),
    type: "Company",
    company: loggedCompany?.name || "",

    entryName: entryName.value,
    entryPhone: entryPhone.value,

    clientName: clientName.value,
    clientPhone: clientPhone.value,
    pickup: pickup.value,
    dropoff: dropoff.value,

    stops: [...document.querySelectorAll("#stops input")]
      .map(i => i.value.trim())
      .filter(Boolean),

    tripDate: tripDate.value,
    tripTime: tripTime.value,

    notes: notes.value,

    status: statusType,
    createdAt: new Date().toISOString()
  };
}

/* ===============================
   CLEAR FORM
================================ */
function clearForm() {

  clientName.value = "";
  clientPhone.value = "";
  pickup.value = "";
  dropoff.value = "";
  tripDate.value = "";
  tripTime.value = "";
  notes.value = "";
  stopsContainer.innerHTML = "";
}

/* ===============================
   SEND TO SERVER
   (تعديل مهم: قراءة error صح + اظهار تفاصيل)
================================ */
async function sendTripToServer(tripData){

  try{

    console.log("Sending trip:", tripData);

    const response = await fetch("/api/trips", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(tripData)
    });

    const text = await response.text();
    let result = {};
    try { result = JSON.parse(text); } catch { result = { raw: text }; }

    console.log("Server reply:", response.status, result);

    if(!response.ok){
      throw new Error(result.error || result.message || "Server error");
    }

    return true;

  }catch(error){
    alert("Server Error: " + error.message);
    return false;
  }
}

/* ===============================
   SAVE TRIP (Draft → Online)
================================ */
if (saveTripBtn) {
  saveTripBtn.addEventListener("click", async function(e){

    e.preventDefault();

    if (!tripDate.value || !tripTime.value) {
      alert("Please select trip date and time.");
      return;
    }

    const trip = collectTripData("Draft");

    const ok = await sendTripToServer(trip);

    if(ok){
      alert("Trip saved as Draft ✔");
      clearForm();
    }
  });
}

/* ===============================
   SUBMIT TRIP (Scheduled → Online)
================================ */
if (submitTripBtn) {
  submitTripBtn.addEventListener("click", async function(e){

    e.preventDefault();

    if (!entryName.value || !entryPhone.value) {
      alert("Please complete Entry Name and Phone first.");
      return;
    }

    if (!tripDate.value || !tripTime.value) {
      alert("Please select trip date and time.");
      return;
    }

    if (isWithin120Minutes(tripDate.value, tripTime.value)) {
      const ok = confirm(
        "⚠️ This booking is within 120 minutes.\nAfter submission, you cannot modify it.\nContinue?"
      );
      if (!ok) return;
    }

    const trip = collectTripData("Scheduled");

    const ok = await sendTripToServer(trip);

    if(ok){
      alert("Trip submitted successfully ✔");
      clearForm();
    }
  });
}

});