document.addEventListener("DOMContentLoaded", function(){

/* =============================
   AUTH CHECK
============================= */

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const companyName = localStorage.getItem("name") || "";

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}

/* =============================
   TABS
============================= */

const tabIndividual = document.getElementById("tabIndividual");
const tabShared = document.getElementById("tabShared");
const individualSection = document.getElementById("individualSection");
const sharedSection = document.getElementById("sharedSection");

if(tabIndividual && tabShared && individualSection && sharedSection){
  tabIndividual.addEventListener("click", function(){
    individualSection.style.display = "block";
    sharedSection.style.display = "none";

    tabIndividual.classList.add("btn-blue");
    tabIndividual.classList.remove("btn-gray");

    tabShared.classList.add("btn-gray");
    tabShared.classList.remove("btn-blue");
  });

  tabShared.addEventListener("click", function(){
    individualSection.style.display = "none";
    sharedSection.style.display = "block";

    tabShared.classList.add("btn-blue");
    tabShared.classList.remove("btn-gray");

    tabIndividual.classList.add("btn-gray");
    tabIndividual.classList.remove("btn-blue");
  });
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

/* =============================
   STATE
============================= */

let stopCounter = 0;
let googleLoadPromise = null;

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

function normalizeAZ(address){
  const value = normalizeText(address);
  const lower = value.toLowerCase();

  if(
    lower.includes(" az") ||
    lower.includes(",az") ||
    lower.includes("arizona")
  ){
    return value;
  }

  return value + ", AZ, USA";
}

/* =============================
   LOAD GOOGLE FROM RENDER CONFIG
============================= */

function ensureGoogleLoaded(){
  if(window.google && google.maps && google.maps.Geocoder){
    return Promise.resolve();
  }

  if(googleLoadPromise){
    return googleLoadPromise;
  }

  googleLoadPromise = new Promise(async (resolve, reject) => {
    try{
      const res = await fetch("/api/config");

      if(!res.ok){
        reject(new Error("Google config not found."));
        return;
      }

      const data = await res.json();

      if(!data.googleKey){
        reject(new Error("Google key missing from server config."));
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;
      script.async = true;

      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google Maps failed to load."));

      document.head.appendChild(script);
    }catch(err){
      reject(err);
    }
  });

  return googleLoadPromise;
}

async function geocodeAddress(address){
  await ensureGoogleLoaded();

  return new Promise((resolve, reject) => {
    const geocoder = new google.maps.Geocoder();

    geocoder.geocode(
      {
        address: normalizeAZ(address),
        componentRestrictions: { country: "US" }
      },
      function(results, status){
        if(status === "OK" && results && results[0]){
          const loc = results[0].geometry.location;

          resolve({
            address: results[0].formatted_address,
            lat: loc.lat(),
            lng: loc.lng()
          });
        }else{
          reject(new Error("Address not found: " + address));
        }
      }
    );
  });
}

async function geocodeStops(){
  const result = [];
  const inputs = [...stopsBox.querySelectorAll(".stop-input")];

  for(const input of inputs){
    const value = normalizeText(input.value);
    if(!value) continue;

    const geo = await geocodeAddress(value);

    result.push({
      address: geo.address,
      lat: geo.lat,
      lng: geo.lng
    });
  }

  return result;
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

/* =============================
   ENTRY EDIT / SAVE
============================= */

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
   TIME VALIDATION
============================= */

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

/* =============================
   ROUTE HELPERS
============================= */

function getDistance(a, b){
  const dx = Number(a.lat) - Number(b.lat);
  const dy = Number(a.lng) - Number(b.lng);
  return Math.sqrt(dx * dx + dy * dy);
}

function sortStopsByNearest(startPoint, stops){
  const remaining = [...stops];
  const sorted = [];
  let current = startPoint;

  while(remaining.length){
    remaining.sort((a, b) => {
      return getDistance(current, a) - getDistance(current, b);
    });

    const next = remaining.shift();
    sorted.push(next);
    current = next;
  }

  return sorted;
}

function buildIndividualRoute(pickupGeo, stopsGeo, dropoffGeo){
  const orderedStops = sortStopsByNearest(pickupGeo, stopsGeo);

  const route = [
    {
      type: "pickup",
      address: pickupGeo.address,
      lat: pickupGeo.lat,
      lng: pickupGeo.lng
    },
    ...orderedStops.map((s, index) => ({
      type: "stop",
      stopIndex: index,
      address: s.address,
      lat: s.lat,
      lng: s.lng
    })),
    {
      type: "dropoff",
      address: dropoffGeo.address,
      lat: dropoffGeo.lat,
      lng: dropoffGeo.lng
    }
  ];

  return {
    orderedStops,
    route
  };
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
    submitTripBtn.textContent = "Submitting...";

    try{
      const pickupGeo = await geocodeAddress(pickupInput.value);
      const dropoffGeo = await geocodeAddress(dropoffInput.value);
      const stopsGeoRaw = await geocodeStops();

      const builtRoute = buildIndividualRoute(pickupGeo, stopsGeoRaw, dropoffGeo);
      const stopsGeo = builtRoute.orderedStops;
      const stops = stopsGeo.map(s => s.address);

      const trip = {
        company: companyName,

        entryName: entryName.value,
        entryPhone: entryPhone.value,

        clientName: clientName.value,
        clientPhone: clientPhone.value,

        pickup: pickupGeo.address,
        pickupLat: pickupGeo.lat,
        pickupLng: pickupGeo.lng,

        dropoff: dropoffGeo.address,
        dropoffLat: dropoffGeo.lat,
        dropoffLng: dropoffGeo.lng,

        tripDate: tripDate.value,
        tripTime: tripTime.value,
        timezone: "America/Phoenix",

        stops: stops,
        stopsGeo: stopsGeo,
        route: builtRoute.route,

        notes: notes.value,
        status: "Scheduled",
        type: "INDIVIDUAL"
      };

      console.log("SENDING INDIVIDUAL:", trip);

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
        console.log("SERVER ERROR:", errData);
        throw new Error(errData.message || "Server error");
      }

      saveEntryInfo();
      removeTripDraft();
      clearTripForm();

      showAlert("Trip submitted ✔");
      clientName.focus();
    }
    catch(err){
      showAlert(err.message || "Server error saving trip.");
      console.error(err);
    }
    finally{
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

  document.querySelectorAll(".passenger-card").forEach(card => {
    passengers.push({
      clientName: normalizeText(card.querySelector(".sharedClientName")?.value),
      clientPhone: normalizeText(card.querySelector(".sharedClientPhone")?.value),
      pickup: normalizeText(card.querySelector(".sharedPickup")?.value),
      dropoff: normalizeText(card.querySelector(".sharedDropoff")?.value),
      status: "Scheduled"
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

function clearSharedForm(){
  sharedEntryName.value = "";
  sharedEntryPhone.value = "";
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
   SHARED ROUTE
============================= */

function samePickup(passengers){
  if(passengers.length < 2) return false;

  const first = passengers[0].pickup.toLowerCase();

  return passengers.every(p => p.pickup.toLowerCase() === first);
}

function buildSamePickupRoute(passengers){
  const route = [];

  passengers.forEach((p, index) => {
    route.push({
      type: "pickup",
      passengerIndex: index,
      passengerId: p.passengerId,
      clientName: p.clientName,
      address: p.pickup,
      lat: p.pickupLat,
      lng: p.pickupLng
    });
  });

  const sortedDropoffs = passengers
    .map((p, index) => ({
      index,
      distance: getDistance(
        { lat: passengers[0].pickupLat, lng: passengers[0].pickupLng },
        { lat: p.dropoffLat, lng: p.dropoffLng }
      )
    }))
    .sort((a, b) => a.distance - b.distance);

  sortedDropoffs.forEach(item => {
    const p = passengers[item.index];

    route.push({
      type: "dropoff",
      passengerIndex: item.index,
      passengerId: p.passengerId,
      clientName: p.clientName,
      address: p.dropoff,
      lat: p.dropoffLat,
      lng: p.dropoffLng
    });
  });

  return route;
}

function buildDifferentPickupRoute(passengers){
  const route = [];

  const sortedPickups = passengers
    .map((p, index) => ({
      index,
      distance: getDistance(
        { lat: passengers[0].pickupLat, lng: passengers[0].pickupLng },
        { lat: p.pickupLat, lng: p.pickupLng }
      )
    }))
    .sort((a, b) => a.distance - b.distance);

  sortedPickups.forEach(item => {
    const p = passengers[item.index];

    route.push({
      type: "pickup",
      passengerIndex: item.index,
      passengerId: p.passengerId,
      clientName: p.clientName,
      address: p.pickup,
      lat: p.pickupLat,
      lng: p.pickupLng
    });
  });

  let current = {
    lat: passengers[sortedPickups[0].index].pickupLat,
    lng: passengers[sortedPickups[0].index].pickupLng
  };

  const remainingDropoffs = sortedPickups.map(item => item.index);

  while(remainingDropoffs.length){
    remainingDropoffs.sort((a, b) => {
      const da = getDistance(current, {
        lat: passengers[a].dropoffLat,
        lng: passengers[a].dropoffLng
      });

      const db = getDistance(current, {
        lat: passengers[b].dropoffLat,
        lng: passengers[b].dropoffLng
      });

      return da - db;
    });

    const nextIndex = remainingDropoffs.shift();
    const p = passengers[nextIndex];

    route.push({
      type: "dropoff",
      passengerIndex: nextIndex,
      passengerId: p.passengerId,
      clientName: p.clientName,
      address: p.dropoff,
      lat: p.dropoffLat,
      lng: p.dropoffLng
    });

    current = {
      lat: p.dropoffLat,
      lng: p.dropoffLng
    };
  }

  return route;
}

function buildSharedRoute(passengers){
  if(samePickup(passengers)){
    return buildSamePickupRoute(passengers);
  }

  return buildDifferentPickupRoute(passengers);
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

    const rawPassengers = collectSharedPassengersRaw();

    if(rawPassengers.length !== count){
      showAlert("Passenger cards are not complete.");
      return;
    }

    for(let i = 0; i < rawPassengers.length; i++){
      const p = rawPassengers[i];

      if(!p.clientName || !p.clientPhone || !p.pickup || !p.dropoff){
        showAlert(`Passenger ${i + 1} is missing required information.`);
        return;
      }
    }

    submitSharedBtn.disabled = true;
    submitSharedBtn.textContent = "Submitting...";

    try{
      const passengers = [];

      for(let i = 0; i < rawPassengers.length; i++){
        const p = rawPassengers[i];

        const pickupGeo = await geocodeAddress(p.pickup);
        const dropoffGeo = await geocodeAddress(p.dropoff);

        passengers.push({
          passengerId: `P${i + 1}`,

          clientName: p.clientName,
          clientPhone: p.clientPhone,

          pickup: pickupGeo.address,
          pickupLat: pickupGeo.lat,
          pickupLng: pickupGeo.lng,

          dropoff: dropoffGeo.address,
          dropoffLat: dropoffGeo.lat,
          dropoffLng: dropoffGeo.lng,

          status: "Scheduled"
        });
      }

      const route = buildSharedRoute(passengers);

      const firstPassenger = passengers[0];
      const lastRouteItem = route[route.length - 1];

      const sharedTrip = {
        company: companyName,

        type: "SHARED",
        tripType: "shared",
        sharedSuffix: "-SH",

        entryName: sharedEntryName.value,
        entryPhone: sharedEntryPhone.value,

        clientName: "Shared Trip",
        clientPhone: firstPassenger.clientPhone,

        pickup: firstPassenger.pickup,
        pickupLat: firstPassenger.pickupLat,
        pickupLng: firstPassenger.pickupLng,

        dropoff: lastRouteItem.address,
        dropoffLat: lastRouteItem.lat,
        dropoffLng: lastRouteItem.lng,

        passengerCount: passengers.length,
        passengers: passengers,

        tripDate: sharedDate.value,
        tripTime: sharedTime.value,
        timezone: "America/Phoenix",

        stops: [],
        stopsGeo: [],

        notes: sharedNotes.value,

        route: route,
        status: "Scheduled"
      };

      console.log("SENDING SHARED:", sharedTrip);

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
        console.log("SERVER ERROR:", errData);
        throw new Error(errData.message || "Server error");
      }

      localStorage.removeItem("sharedTripDraft");
      clearSharedForm();

      showAlert("Shared trip submitted ✔");
    }
    catch(err){
      showAlert(err.message || "Server error saving shared trip.");
      console.error(err);
    }
    finally{
      submitSharedBtn.disabled = false;
      submitSharedBtn.textContent = "Submit Shared";
    }

  });
}

/* =============================
   INIT
============================= */

ensureGoogleLoaded().catch(err => {
  console.error("Google load error:", err);
});

loadEntry();
loadTripDraft();
loadSharedDraft();

});