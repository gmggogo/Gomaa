document.addEventListener("DOMContentLoaded", function(){

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const companyName = localStorage.getItem("name") || "";

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}
/* =========================
   BILLING CHECK
========================= */

async function checkBillingLock(){

  try{

    const res = await fetch(
      "/api/company/billing",
      {
        headers:{
          Authorization:"Bearer " + token
        }
      }
    );

    const data = await res.json();

    if(data.billingLocked){

      document.body.innerHTML = `

        <div style="
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          background:#f1f5f9;
          padding:20px;
          font-family:Segoe UI;
        ">

          <div style="
            max-width:600px;
            width:100%;
            background:#fff;
            padding:40px;
            border-radius:20px;
            text-align:center;
            box-shadow:0 10px 30px rgba(0,0,0,.08);
          ">

            <h1 style="
              color:#dc2626;
              margin-bottom:15px;
            ">
              Account Suspended
            </h1>

            <p style="
              color:#475569;
              font-size:17px;
              line-height:1.7;
            ">
              Your company account is currently locked
              due to unpaid billing.

              Please complete payment to continue
              using Sunbeam Transportation.
            </p>

            <a href="/companies/payment.html"
              style="
                display:inline-block;
                margin-top:25px;
                background:#2563eb;
                color:#fff;
                text-decoration:none;
                padding:14px 22px;
                border-radius:12px;
                font-weight:800;
              ">
              Go To Payment Center
            </a>

          </div>

        </div>

      `;

      return false;
    }

    return true;

  }catch(err){

    console.log(err);

    return true;

  }

}

(async()=>{

  const ok =
    await checkBillingLock();

  if(!ok){
    return;
  }

  /* =============================
     TABS
  ============================= */

  const tabIndividual =
    document.getElementById("tabIndividual");

  const tabShared =
    document.getElementById("tabShared");

  const individualSection =
    document.getElementById("individualSection");

  const sharedSection =
    document.getElementById("sharedSection");

  if(
    tabIndividual &&
    tabShared &&
    individualSection &&
    sharedSection
  ){

    tabIndividual.addEventListener(
      "click",
      function(){

        individualSection.style.display =
          "block";

        sharedSection.style.display =
          "none";

        tabIndividual.classList.add(
          "btn-blue"
        );

        tabIndividual.classList.remove(
          "btn-gray"
        );

        tabShared.classList.add(
          "btn-gray"
        );

        tabShared.classList.remove(
          "btn-blue"
        );

      }
    );

    tabShared.addEventListener(
      "click",
      function(){

        individualSection.style.display =
          "none";

        sharedSection.style.display =
          "block";

        tabShared.classList.add(
          "btn-blue"
        );

        tabShared.classList.remove(
          "btn-gray"
        );

        tabIndividual.classList.add(
          "btn-gray"
        );

        tabIndividual.classList.remove(
          "btn-blue"
        );

      }
    );

  }

/* =============================
   ELEMENTS
============================= */

const entryName   = document.getElementById("entryName");
const entryPhone  = document.getElementById("entryPhone");
const editEntry   = document.getElementById("editEntry");

const clientName  = document.getElementById("clientName");
const clientPhone = document.getElementById("clientPhone");

const pickupInput  = document.getElementById("pickup");
const dropoffInput = document.getElementById("dropoff");

const tripDate = document.getElementById("tripDate");
const tripTime = document.getElementById("tripTime");
const notes    = document.getElementById("notes");

const stopsBox   = document.getElementById("stops");
const addStopBtn = document.getElementById("addStopBtn");

const saveTripBtn   = document.getElementById("saveTrip");
const submitTripBtn = document.getElementById("submitTrip");

/* SHARED ELEMENTS */

const sharedEntryName  = document.getElementById("sharedEntryName");
const sharedEntryPhone = document.getElementById("sharedEntryPhone");
const editSharedEntry  = document.getElementById("editSharedEntry");

const passengerCount   = document.getElementById("passengerCount");
const sharedDate       = document.getElementById("sharedDate");
const sharedTime       = document.getElementById("sharedTime");
const sharedNotes      = document.getElementById("sharedNotes");
const passengersContainer = document.getElementById("passengersContainer");
const saveSharedBtn = document.getElementById("saveShared");
const submitSharedBtn = document.getElementById("submitShared");

let stopCounter = 0;

/* =============================
   HELPERS
============================= */

function getArizonaNow(){
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
  );
}

function normalizeText(value){
  return String(value ?? "").trim();
}

function showAlert(msg){
  alert(msg);
}

function escapeAttr(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function validateFutureTime(dateValue, timeValue){
  if(!dateValue || !timeValue){
    showAlert("Please select trip date and time.");
    return false;
  }

  const tripDateTime = new Date(`${dateValue}T${timeValue}:00`);
  const now = getArizonaNow();

  if(isNaN(tripDateTime.getTime())){
    showAlert("Invalid trip date/time.");
    return false;
  }

  if(tripDateTime <= now){
    showAlert("Trip time already passed. You cannot add a past trip.");
    return false;
  }

  return true;
}

function check120(dateValue, timeValue){
  if(!dateValue || !timeValue) return true;

  const tripDateTime = new Date(`${dateValue}T${timeValue}:00`);
  const now = getArizonaNow();
  const diff = (tripDateTime - now) / 60000;

  if(diff < 120){
    return confirm("Trip is within 120 minutes.\nEditing may be restricted.\nContinue?");
  }

  return true;
}

/* =============================
   ENTRY INFO
============================= */

function saveEntryInfo(){
  localStorage.setItem("entryInfo", JSON.stringify({
    name: entryName.value,
    phone: entryPhone.value
  }));
}

function loadEntry(){
  let saved = null;

  try{
    saved = JSON.parse(localStorage.getItem("entryInfo"));
  }catch(e){
    saved = null;
  }

  if(saved){
    entryName.value  = saved.name || "";
    entryPhone.value = saved.phone || "";
    entryName.disabled = true;
    entryPhone.disabled = true;

    if(editEntry) editEntry.textContent = "Edit";

    if(sharedEntryName){
      sharedEntryName.value = saved.name || "";
      sharedEntryName.disabled = true;
    }

    if(sharedEntryPhone){
      sharedEntryPhone.value = saved.phone || "";
      sharedEntryPhone.disabled = true;
    }

    if(editSharedEntry){
      editSharedEntry.textContent = "Edit";
    }
  }else{
    entryName.disabled = false;
    entryPhone.disabled = false;

    if(editEntry) editEntry.textContent = "Save";

    if(sharedEntryName) sharedEntryName.disabled = false;
    if(sharedEntryPhone) sharedEntryPhone.disabled = false;
    if(editSharedEntry) editSharedEntry.textContent = "Save";
  }
}

if(editEntry){
  editEntry.addEventListener("click", function(){

    if(entryName.disabled){
      entryName.disabled = false;
      entryPhone.disabled = false;
      editEntry.textContent = "Save";
    }else{
      saveEntryInfo();

      if(sharedEntryName){
        sharedEntryName.value = entryName.value;
        sharedEntryName.disabled = true;
      }

      if(sharedEntryPhone){
        sharedEntryPhone.value = entryPhone.value;
        sharedEntryPhone.disabled = true;
      }

      if(editSharedEntry){
        editSharedEntry.textContent = "Edit";
      }

      entryName.disabled = true;
      entryPhone.disabled = true;
      editEntry.textContent = "Edit";

      showAlert("Entry information saved ✔");
    }

  });
}

if(editSharedEntry){
  editSharedEntry.addEventListener("click", function(){

    if(sharedEntryName.disabled){
      sharedEntryName.disabled = false;
      sharedEntryPhone.disabled = false;
      editSharedEntry.textContent = "Save";
    }else{
      localStorage.setItem("entryInfo", JSON.stringify({
        name: sharedEntryName.value,
        phone: sharedEntryPhone.value
      }));

      entryName.value = sharedEntryName.value;
      entryPhone.value = sharedEntryPhone.value;

      entryName.disabled = true;
      entryPhone.disabled = true;
      if(editEntry) editEntry.textContent = "Edit";

      sharedEntryName.disabled = true;
      sharedEntryPhone.disabled = true;
      editSharedEntry.textContent = "Edit";

      showAlert("Entry information saved ✔");
    }

  });
}

/* =============================
   STOPS
============================= */

function createStopInput(value = ""){
  const currentStops = stopsBox.querySelectorAll(".stop-input").length;

  if(currentStops >= 5){
    showAlert("Maximum 5 stops allowed.");
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "stop-row";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Stop address";
  input.className = "stop-input";
  input.value = value;

  stopCounter += 1;
  input.dataset.stopId = `stop_${stopCounter}`;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-stop-btn btn-gray";
  removeBtn.textContent = "✕";
  removeBtn.style.marginTop = "6px";

  wrapper.appendChild(input);
  wrapper.appendChild(removeBtn);
  stopsBox.appendChild(wrapper);

  removeBtn.addEventListener("click", function(){
    wrapper.remove();
  });

  return input;
}

if(addStopBtn){
  addStopBtn.addEventListener("click", function(){
    createStopInput();
  });
}

/* =============================
   INDIVIDUAL DRAFT
============================= */

function saveTripDraftToLocal(){
  const draft = {
    clientName: clientName.value,
    clientPhone: clientPhone.value,
    pickup: pickupInput.value,
    dropoff: dropoffInput.value,
    tripDate: tripDate.value,
    tripTime: tripTime.value,
    notes: notes.value,
    stops: [...stopsBox.querySelectorAll(".stop-input")].map(input => input.value)
  };

  localStorage.setItem("tripDraft", JSON.stringify(draft));
}

function loadTripDraft(){
  let draft = null;

  try{
    draft = JSON.parse(localStorage.getItem("tripDraft"));
  }catch(e){
    draft = null;
  }

  if(!draft) return;

  clientName.value  = draft.clientName || "";
  clientPhone.value = draft.clientPhone || "";

  pickupInput.value  = draft.pickup || "";
  dropoffInput.value = draft.dropoff || "";

  tripDate.value = draft.tripDate || "";
  tripTime.value = draft.tripTime || "";
  notes.value    = draft.notes || "";

  stopsBox.innerHTML = "";
  stopCounter = 0;

  const draftStops = Array.isArray(draft.stops) ? draft.stops : [];
  draftStops.forEach(stopText => {
    createStopInput(stopText || "");
  });
}

function removeTripDraft(){
  localStorage.removeItem("tripDraft");
}

if(saveTripBtn){
  saveTripBtn.addEventListener("click", function(){
    saveTripDraftToLocal();
    showAlert("Trip saved locally ✔");
  });
}

function clearTripForm(){
  clientName.value = "";
  clientPhone.value = "";
  pickupInput.value = "";
  dropoffInput.value = "";
  tripDate.value = "";
  tripTime.value = "";
  notes.value = "";
  stopsBox.innerHTML = "";
  stopCounter = 0;
}

/* =============================
   SUBMIT INDIVIDUAL
============================= */

if(submitTripBtn){
  submitTripBtn.addEventListener("click", async function(){

    if(!validateFutureTime(tripDate.value, tripTime.value)){
      return;
    }

    if(!check120(tripDate.value, tripTime.value)){
      return;
    }

    if(!normalizeText(clientName.value)){
      showAlert("Client name required.");
      clientName.focus();
      return;
    }

    if(!normalizeText(clientPhone.value)){
      showAlert("Client phone required.");
      clientPhone.focus();
      return;
    }

    if(!normalizeText(pickupInput.value)){
      showAlert("Pickup address required.");
      pickupInput.focus();
      return;
    }

    if(!normalizeText(dropoffInput.value)){
      showAlert("Dropoff address required.");
      dropoffInput.focus();
      return;
    }

    submitTripBtn.disabled = true;
    submitTripBtn.textContent = "Saving...";

    try{
      const stops = [...stopsBox.querySelectorAll(".stop-input")]
        .map(input => normalizeText(input.value))
        .filter(Boolean);

      const trip = {
        company: companyName,

        type: "company",
        tripType: "INDIVIDUAL",
        isShared: false,

        entryName: entryName.value,
        entryPhone: entryPhone.value,

        clientName: clientName.value,
        clientPhone: clientPhone.value,

        pickup: pickupInput.value,
        dropoff: dropoffInput.value,

        pickupLat: null,
        pickupLng: null,
        dropoffLat: null,
        dropoffLng: null,

        stops: stops,
        stopCoords: [],

        tripDate: tripDate.value,
        tripTime: tripTime.value,
        timezone: "America/Phoenix",

        notes: notes.value,

        priceAmount: 0,
        basePrice: 0,
        finalPrice: 0,
        miles: 0,
        distanceMeters: 0,
        durationSeconds: 0,
        estimatedMinutes: 0,

        status: "Scheduled"
      };

      const res = await fetch("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(trip)
      });

      if(!res.ok){
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Server error");
      }

      const savedTrip = await res.json().catch(() => trip);
      localStorage.setItem("lastTrip", JSON.stringify(savedTrip));
      localStorage.setItem("reviewTrip", JSON.stringify(savedTrip));

      saveEntryInfo();
      removeTripDraft();
      clearTripForm();

      showAlert("Trip saved ✔");
      clientName.focus();

    }catch(err){
      showAlert(err.message || "Server error saving trip.");
      console.error(err);
    }finally{
      submitTripBtn.disabled = false;
      submitTripBtn.textContent = "Submit Trip";
    }

  });
}

/* =============================
   SHARED PASSENGERS
============================= */

function updatePassengerCountFromCards(){
  const remaining = document.querySelectorAll(".passenger-card").length;

  if(passengerCount){
    if(remaining >= 2 && remaining <= 4){
      passengerCount.value = String(remaining);
    }else{
      passengerCount.value = "";
    }
  }

  reindexPassengerCards();
}

function reindexPassengerCards(){
  document.querySelectorAll(".passenger-card").forEach((card, idx) => {
    const title = card.querySelector(".passenger-title");
    if(title){
      title.textContent = `Passenger ${idx + 1}`;
    }
  });
}

function createPassengerCard(index, data = {}){
  const card = document.createElement("div");
  card.className = "passenger-card";

  card.innerHTML = `
    <div class="passenger-header">
      <h4 class="passenger-title">Passenger ${index}</h4>
      <button type="button" class="remove-passenger">✕</button>
    </div>

    <div class="form-grid">
      <div class="field-wrap">
        <input class="sharedClientName" placeholder="Client Name" value="${escapeAttr(data.clientName || "")}">
      </div>
      <div class="field-wrap">
        <input class="sharedClientPhone" placeholder="Client Phone" value="${escapeAttr(data.clientPhone || "")}">
      </div>
      <div class="field-wrap">
        <input class="sharedPickup" placeholder="Pickup Address" value="${escapeAttr(data.pickup || "")}" autocomplete="off">
      </div>
      <div class="field-wrap">
        <input class="sharedDropoff" placeholder="Dropoff Address" value="${escapeAttr(data.dropoff || "")}" autocomplete="off">
      </div>
    </div>
  `;

  const removeBtn = card.querySelector(".remove-passenger");

  removeBtn.addEventListener("click", function(){
    card.remove();
    updatePassengerCountFromCards();
  });

  passengersContainer.appendChild(card);
}

function renderSharedPassengers(count, savedPassengers = []){
  passengersContainer.innerHTML = "";

  if(count < 2 || count > 4) return;

  for(let i = 1; i <= count; i++){
    createPassengerCard(i, savedPassengers[i - 1] || {});
  }

  updatePassengerCountFromCards();
}

if(passengerCount){
  passengerCount.addEventListener("change", function(){
    const count = Number(this.value);
    renderSharedPassengers(count);
  });
}

/* =============================
   SHARED DRAFT
============================= */

function collectSharedPassengersRaw(){
  const passengers = [];

  document.querySelectorAll(".passenger-card").forEach((card, index) => {
    const clientNameValue = normalizeText(card.querySelector(".sharedClientName")?.value);
    const clientPhoneValue = normalizeText(card.querySelector(".sharedClientPhone")?.value);
    const pickupValue = normalizeText(card.querySelector(".sharedPickup")?.value);
    const dropoffValue = normalizeText(card.querySelector(".sharedDropoff")?.value);

    passengers.push({
      passengerId: `P${index + 1}`,

      name: clientNameValue,
      phone: clientPhoneValue,

      clientName: clientNameValue,
      clientPhone: clientPhoneValue,

      pickup: pickupValue,
      dropoff: dropoffValue,

      pickupLat: null,
      pickupLng: null,
      dropoffLat: null,
      dropoffLng: null,

      status: "Scheduled",
      basePrice: 0,
      finalPrice: 0,
      priceAmount: 0
    });
  });

  return passengers;
}

function saveSharedDraft(){
  const draft = {
    entryName: sharedEntryName.value,
    entryPhone: sharedEntryPhone.value,
    passengerCount: passengerCount.value,
    sharedDate: sharedDate.value,
    sharedTime: sharedTime.value,
    sharedNotes: sharedNotes.value,
    passengers: collectSharedPassengersRaw()
  };

  localStorage.setItem("sharedTripDraft", JSON.stringify(draft));
}

function loadSharedDraft(){
  let draft = null;

  try{
    draft = JSON.parse(localStorage.getItem("sharedTripDraft"));
  }catch(e){
    draft = null;
  }

  if(!draft) return;

  sharedEntryName.value = draft.entryName || "";
  sharedEntryPhone.value = draft.entryPhone || "";
  passengerCount.value = draft.passengerCount || "";
  sharedDate.value = draft.sharedDate || "";
  sharedTime.value = draft.sharedTime || "";
  sharedNotes.value = draft.sharedNotes || "";

  if(draft.passengerCount){
    renderSharedPassengers(Number(draft.passengerCount), draft.passengers || []);
  }
}

function clearSharedTripOnly(){
  passengerCount.value = "";
  sharedDate.value = "";
  sharedTime.value = "";
  sharedNotes.value = "";
  passengersContainer.innerHTML = "";
}

if(saveSharedBtn){
  saveSharedBtn.addEventListener("click", function(){
    saveSharedDraft();
    showAlert("Shared trip saved locally ✔");
  });
}

/* =============================
   SUBMIT SHARED
============================= */

if(submitSharedBtn){
  submitSharedBtn.addEventListener("click", async function(){

    const count = Number(passengerCount.value);

    if(count < 2 || count > 4){
      showAlert("Please select 2 to 4 passengers.");
      return;
    }

    if(!validateFutureTime(sharedDate.value, sharedTime.value)){
      return;
    }

    if(!check120(sharedDate.value, sharedTime.value)){
      return;
    }

    const passengers = collectSharedPassengersRaw();

    if(passengers.length !== count){
      showAlert("Passenger cards are not complete.");
      return;
    }

    for(let i = 0; i < passengers.length; i++){
      const p = passengers[i];

      if(!p.clientName || !p.clientPhone || !p.pickup || !p.dropoff){
        showAlert(`Passenger ${i + 1} is missing required information.`);
        return;
      }
    }

    submitSharedBtn.disabled = true;
    submitSharedBtn.textContent = "Saving...";

    try{
      const firstPassenger = passengers[0];
      const lastPassenger = passengers[passengers.length - 1];

      const sharedTrip = {
        company: companyName,

        type: "company",
        isShared: true,
        tripType: "SHARED",
        sharedSuffix: "-SH",

        entryName: sharedEntryName.value,
        entryPhone: sharedEntryPhone.value,

        clientName: "Shared Trip",
        clientPhone: firstPassenger.clientPhone,

        pickup: firstPassenger.pickup,
        pickupLat: null,
        pickupLng: null,

        dropoff: lastPassenger.dropoff,
        dropoffLat: null,
        dropoffLng: null,

        passengerCount: passengers.length,
        totalPassengers: passengers.length,
        passengers: passengers,

        tripDate: sharedDate.value,
        tripTime: sharedTime.value,
        timezone: "America/Phoenix",

        stops: [],
        stopCoords: [],

        notes: sharedNotes.value,

        priceAmount: 0,
        basePrice: 0,
        finalPrice: 0,
        pricePerPassenger: 0,
        miles: 0,
        distanceMeters: 0,
        durationSeconds: 0,
        estimatedMinutes: 0,

        route: [],
        pricingPolicy: {},
        googleRoute: {},

        status: "Scheduled"
      };

      const res = await fetch("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(sharedTrip)
      });

      if(!res.ok){
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Server error");
      }

      const savedTrip = await res.json().catch(() => sharedTrip);
      localStorage.setItem("lastTrip", JSON.stringify(savedTrip));
      localStorage.setItem("reviewTrip", JSON.stringify(savedTrip));

      localStorage.removeItem("sharedTripDraft");

      saveEntryInfo();
      clearSharedTripOnly();

      showAlert("Shared trip saved ✔");

    }catch(err){
      showAlert(err.message || "Server error saving shared trip.");
      console.error(err);
    }finally{
      submitSharedBtn.disabled = false;
      submitSharedBtn.textContent = "Submit Shared";
    }

  });
}

/* =============================
   INIT
============================= */

loadEntry();
loadTripDraft();
loadSharedDraft();

})(); // END ASYNC

}); // END DOMContentLoaded