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
   ENTRY SAVE / EDIT
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
   STORAGE
================================ */
function getTrips() {
  return JSON.parse(localStorage.getItem("companyTrips") || "[]");
}

function saveTrips(list) {
  localStorage.setItem("companyTrips", JSON.stringify(list));
}

/* ===============================
   TRIP NUMBER
================================ */
function generateTripNumber() {
  const key = "lastCompanyTrip";
  let last = parseInt(localStorage.getItem(key) || "200", 10);
  last++;
  localStorage.setItem(key, last);
  return "GH-" + last;
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

  // Client Info
  clientName.value = "";
  clientPhone.value = "";

  // Trip Details
  pickup.value = "";
  dropoff.value = "";
  tripDate.value = "";
  tripTime.value = "";
  notes.value = "";

  // Stops
  stopsContainer.innerHTML = "";

  // لا نمسح entryName و entryPhone
}

/* ===============================
   SAVE TRIP (Draft)
================================ */
if (saveTripBtn) {
  saveTripBtn.addEventListener("click", function(e){

    e.preventDefault();

    if (!tripDate.value || !tripTime.value) {
      alert("Please select trip date and time.");
      return;
    }

    let trips = getTrips();
    trips.push(collectTripData("Draft"));
    saveTrips(trips);

    alert("Trip saved as Draft ✔");
    clearForm();
  });
}

/* ===============================
   SUBMIT TRIP
================================ */
if (submitTripBtn) {
  submitTripBtn.addEventListener("click", function(e){

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
        "⚠️ This booking is within 120 minutes of the scheduled pickup time.\n" +
        "After submission, you will NOT be allowed to modify this trip.\n\n" +
        "Do you want to continue?"
      );
      if (!ok) return;
    }

    let trips = getTrips();
    trips.push(collectTripData("Scheduled"));
    saveTrips(trips);

    alert("Trip submitted successfully ✔");
    clearForm();
  });
}

});