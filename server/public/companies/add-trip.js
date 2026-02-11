/* ===============================
   AUTH / COMPANY INFO
================================ */
const companyTitle = document.getElementById("companyTitle");
let loggedCompany = null;

try {
  loggedCompany = JSON.parse(localStorage.getItem("loggedCompany"));
} catch {}

if (!loggedCompany) {
  window.location.href = "company-login.html";
} else if (companyTitle) {
  companyTitle.innerText = loggedCompany.name || "";
}

/* ===============================
   GREETING + LIVE CLOCK
================================ */
function updateTime() {
  const now = new Date();
  const h = now.getHours();

  const greetingEl = document.getElementById("greeting");
  const clockEl = document.getElementById("clock");

  if (greetingEl) {
    greetingEl.innerText =
      h < 12 ? "Good Morning" :
      h < 18 ? "Good Afternoon" :
      "Good Evening";
  }

  if (clockEl) {
    clockEl.innerText = now.toLocaleString();
  }
}
setInterval(updateTime, 1000);
updateTime();

/* ===============================
   ENTRY INFO (LOCK / EDIT)
================================ */
const entryName  = document.getElementById("entryName");
const entryPhone = document.getElementById("entryPhone");
const saveEntry  = document.getElementById("saveEntry");
const editEntry  = document.getElementById("editEntry");

try {
  const savedEntry = JSON.parse(localStorage.getItem("entryInfo"));
  if (savedEntry) {
    entryName.value  = savedEntry.name || "";
    entryPhone.value = savedEntry.phone || "";
    lockEntry();
  }
} catch {}

if (saveEntry) {
  saveEntry.onclick = () => {
    if (!entryName.value || !entryPhone.value) {
      alert("Please enter entry name & phone");
      return;
    }

    localStorage.setItem(
      "entryInfo",
      JSON.stringify({
        name: entryName.value,
        phone: entryPhone.value
      })
    );

    lockEntry();
  };
}

if (editEntry) {
  editEntry.onclick = unlockEntry;
}

function lockEntry() {
  entryName.disabled = true;
  entryPhone.disabled = true;
  saveEntry.style.display = "none";
  editEntry.style.display = "inline-block";
}

function unlockEntry() {
  entryName.disabled = false;
  entryPhone.disabled = false;
  saveEntry.style.display = "inline-block";
  editEntry.style.display = "none";
}

/* ===============================
   STOPS MANAGEMENT
================================ */
let stopCount = 0;

function addStop(value = "") {
  stopCount++;
  const input = document.createElement("input");
  input.placeholder = `Stop ${stopCount}`;
  input.value = value;
  document.getElementById("stops").appendChild(input);
}

/* ===============================
   TRIP NUMBER (SAFE)
================================ */
function generateTripNumber() {
  const key = "lastCompanyTrip";
  let last = parseInt(localStorage.getItem(key) || "200", 10);
  last++;
  localStorage.setItem(key, last);
  return "GH-" + last;
}

/* ===============================
   TIME VALIDATION
================================ */
function isWithin120Minutes(tripDate, tripTime) {
  if (!tripDate || !tripTime) return false;

  const tripDT = new Date(`${tripDate}T${tripTime}`);
  const now = new Date();
  const diffMinutes = (tripDT - now) / 60000;

  return diffMinutes > 0 && diffMinutes <= 120;
}

/* ===============================
   BUTTONS
================================ */
const saveTripBtn   = document.getElementById("saveTrip");
const submitTripBtn = document.getElementById("submitTrip");

/* ===============================
   SAFE LOAD STORAGE
================================ */
function getTrips() {
  try {
    return JSON.parse(localStorage.getItem("companyTrips")) || [];
  } catch {
    return [];
  }
}

function saveTrips(list) {
  localStorage.setItem("companyTrips", JSON.stringify(list));
}

/* ===============================
   SAVE DRAFT
================================ */
if (saveTripBtn) {
  saveTripBtn.onclick = () => {
    localStorage.setItem(
      "draftTrip",
      JSON.stringify(collectTripData(false))
    );
    saveTripBtn.style.background = "#22c55e";
  };
}

/* ===============================
   SUBMIT TRIP
================================ */
if (submitTripBtn) {
  submitTripBtn.onclick = () => {

    const tripDateVal = tripDate.value;
    const tripTimeVal = tripTime.value;

    if (isWithin120Minutes(tripDateVal, tripTimeVal)) {
      const ok = confirm(
        "⚠️ Important Notice\n\n" +
        "This trip is within 120 minutes.\n" +
        "You will NOT be able to edit it after submission.\n\n" +
        "Continue?"
      );
      if (!ok) return;
    }

    let trips = getTrips();

    const trip = collectTripData(true);

    trip.status = "Scheduled";

    trips.push(trip);
    saveTrips(trips);

    localStorage.removeItem("draftTrip");
    clearTripFields();

    alert("Trip added successfully ✔");
  };
}

/* ===============================
   COLLECT TRIP DATA (FIXED)
================================ */
function collectTripData(finalSubmit) {

  const draft = JSON.parse(localStorage.getItem("draftTrip") || "null");

  return {
    tripNumber: finalSubmit
      ? (draft?.tripNumber || generateTripNumber())
      : "",

    type: "Company",
    company: loggedCompany.name || "",

    entryName: entryName.value || "",
    entryPhone: entryPhone.value || "",

    clientName: clientName.value || "",
    clientPhone: clientPhone.value || "",

    pickup: pickup.value || "",
    dropoff: dropoff.value || "",

    stops: [...document.querySelectorAll("#stops input")]
      .map(i => i.value.trim())
      .filter(Boolean),

    tripDate: tripDate.value || "",
    tripTime: tripTime.value || "",

    notes: notes.value || "",

    status: finalSubmit ? "Scheduled" : "Draft",

    createdAt: draft?.createdAt || new Date().toISOString(),
    bookedAt: finalSubmit ? new Date().toISOString() : ""
  };
}

/* ===============================
   CLEAR FORM
================================ */
function clearTripFields() {
  clientName.value = "";
  clientPhone.value = "";
  pickup.value = "";
  dropoff.value = "";
  tripDate.value = "";
  tripTime.value = "";
  notes.value = "";

  document.getElementById("stops").innerHTML = "";
  stopCount = 0;

  if (saveTripBtn)
    saveTripBtn.style.background = "#64748b";
}

/* ===============================
   LOAD DRAFT
================================ */
try {
  const draftTrip = JSON.parse(localStorage.getItem("draftTrip"));

  if (draftTrip) {
    clientName.value = draftTrip.clientName || "";
    clientPhone.value = draftTrip.clientPhone || "";
    pickup.value = draftTrip.pickup || "";
    dropoff.value = draftTrip.dropoff || "";
    tripDate.value = draftTrip.tripDate || "";
    tripTime.value = draftTrip.tripTime || "";
    notes.value = draftTrip.notes || "";

    if (Array.isArray(draftTrip.stops)) {
      draftTrip.stops.forEach(s => addStop(s));
    }
  }
} catch {}