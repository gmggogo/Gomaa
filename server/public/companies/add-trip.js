document.addEventListener("DOMContentLoaded", function(){

/* ============================= */
/* AUTH CHECK */
/* ============================= */

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}

/* ============================= */
/* ELEMENTS */
/* ============================= */

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

const saveTrip   = document.getElementById("saveTrip");
const submitTrip = document.getElementById("submitTrip");

/* ============================= */
/* STATE */
/* ============================= */

let selectedPickup = null;
let selectedDropoff = null;
let selectedStops = new Map(); // key = input.dataset.stopId

/* ============================= */
/* HELPERS */
/* ============================= */

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getArizonaNow(){
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
  );
}

function isValidCoord(v){
  return typeof v === "number" && Number.isFinite(v);
}

function makeSuggestionBox(input){
  let box = input.parentNode.querySelector(".suggestions");

  if(!box){
    box = document.createElement("div");
    box.className = "suggestions";
    input.parentNode.appendChild(box);
  }

  return box;
}

function clearSuggestions(box){
  if(box) box.innerHTML = "";
}

function setSelectedAddress(type, value, input){
  if(type === "pickup"){
    selectedPickup = value;
  }else if(type === "dropoff"){
    selectedDropoff = value;
  }else if(type === "stop"){
    const stopId = input.dataset.stopId;
    if(stopId){
      selectedStops.set(stopId, value);
    }
  }
}

function clearSelectedAddress(type, input){
  if(type === "pickup"){
    selectedPickup = null;
  }else if(type === "dropoff"){
    selectedDropoff = null;
  }else if(type === "stop"){
    const stopId = input.dataset.stopId;
    if(stopId){
      selectedStops.delete(stopId);
    }
  }
}

function collectStops(){
  return [...stopsBox.querySelectorAll(".stop-input")]
    .map(input => input.value.trim())
    .filter(Boolean);
}

function collectStopsGeo(){
  const result = [];

  [...stopsBox.querySelectorAll(".stop-input")].forEach(input => {
    const stopId = input.dataset.stopId;
    const selected = stopId ? selectedStops.get(stopId) : null;

    if(selected && selected.address){
      result.push({
        address: selected.address,
        lat: selected.lat,
        lng: selected.lng
      });
    }
  });

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

  selectedPickup = null;
  selectedDropoff = null;
  selectedStops.clear();
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
  }else{
    entryName.disabled = false;
    entryPhone.disabled = false;
    if(editEntry) editEntry.textContent = "Save";
  }
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
  pickupInput.value = draft.pickup || "";
  dropoffInput.value = draft.dropoff || "";
  tripDate.value = draft.tripDate || "";
  tripTime.value = draft.tripTime || "";
  notes.value = draft.notes || "";

  selectedPickup = draft.selectedPickup || null;
  selectedDropoff = draft.selectedDropoff || null;

  const draftStops = Array.isArray(draft.stops) ? draft.stops : [];
  const draftStopsGeo = Array.isArray(draft.stopsGeo) ? draft.stopsGeo : [];

  stopsBox.innerHTML = "";
  selectedStops.clear();

  draftStops.forEach((stopText, idx) => {
    const stopInput = createStopInput();
    stopInput.value = stopText || "";

    const geo = draftStopsGeo[idx];
    if(geo && geo.address){
      selectedStops.set(stopInput.dataset.stopId, {
        address: geo.address,
        lat: Number(geo.lat),
        lng: Number(geo.lng)
      });
    }
  });
}

function saveTripDraftToLocal(){
  const draft = {
    clientName: clientName.value,
    clientPhone: clientPhone.value,
    pickup: pickupInput.value,
    dropoff: dropoffInput.value,
    tripDate: tripDate.value,
    tripTime: tripTime.value,
    notes: notes.value,
    stops: collectStops(),
    selectedPickup,
    selectedDropoff,
    stopsGeo: collectStopsGeo()
  };

  localStorage.setItem("tripDraft", JSON.stringify(draft));
}

function removeTripDraft(){
  localStorage.removeItem("tripDraft");
}

/* ============================= */
/* AUTOCOMPLETE */
/* ============================= */

async function searchAddress(query){
  if(!query || query.trim().length < 3) return [];

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`,
    {
      headers: {
        "Accept": "application/json"
      }
    }
  );

  if(!res.ok) return [];

  const data = await res.json();
  if(!Array.isArray(data)) return [];

  return data;
}

function attachAutocomplete(input, type){
  const box = makeSuggestionBox(input);
  let searchTimer = null;

  input.setAttribute("autocomplete", "off");

  input.addEventListener("input", function(){
    clearSelectedAddress(type, input);

    clearTimeout(searchTimer);

    const value = input.value.trim();

    if(value.length < 3){
      clearSuggestions(box);
      return;
    }

    searchTimer = setTimeout(async () => {
      const results = await searchAddress(value);

      if(!results.length){
        box.innerHTML = `<div class="option disabled">No address found</div>`;
        return;
      }

      box.innerHTML = results.map(item => `
        <div class="option"
             data-address="${escapeHtml(item.display_name)}"
             data-lat="${escapeHtml(item.lat)}"
             data-lng="${escapeHtml(item.lon)}">
          ${escapeHtml(item.display_name)}
        </div>
      `).join("");
    }, 250);
  });

  box.addEventListener("click", function(e){
    const option = e.target.closest(".option");
    if(!option || option.classList.contains("disabled")) return;

    const selected = {
      address: option.dataset.address,
      lat: Number(option.dataset.lat),
      lng: Number(option.dataset.lng)
    };

    input.value = selected.address;
    setSelectedAddress(type, selected, input);
    clearSuggestions(box);
  });

  input.addEventListener("blur", function(){
    setTimeout(() => clearSuggestions(box), 180);
  });
}

/* ============================= */
/* STOPS */
/* ============================= */

function createStopInput(value = ""){
  if(stopsBox.children.length >= 5){
    alert("Maximum 5 stops allowed.");
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "stop-row";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Stop address";
  input.className = "stop-input";
  input.value = value;

  input.dataset.stopId = "stop_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-stop-btn";
  removeBtn.textContent = "✕";

  wrapper.appendChild(input);
  wrapper.appendChild(removeBtn);
  stopsBox.appendChild(wrapper);

  attachAutocomplete(input, "stop");

  removeBtn.addEventListener("click", function(){
    selectedStops.delete(input.dataset.stopId);
    wrapper.remove();
  });

  return input;
}

if(addStopBtn){
  addStopBtn.addEventListener("click", function(){
    createStopInput();
  });
}

/* ============================= */
/* ENTRY EDIT / SAVE */
/* ============================= */

if(editEntry){
  editEntry.addEventListener("click", function(){

    if(entryName.disabled){
      entryName.disabled = false;
      entryPhone.disabled = false;
      editEntry.textContent = "Save";
    }else{
      saveEntryInfo();

      entryName.disabled = true;
      entryPhone.disabled = true;
      editEntry.textContent = "Edit";

      alert("Entry information saved ✔");
    }

  });
}

/* ============================= */
/* 120 MINUTES CHECK */
/* ============================= */

function check120(){
  const date = tripDate.value;
  const time = tripTime.value;

  if(!date || !time) return true;

  const tripDateTime = new Date(date + "T" + time);
  const now = getArizonaNow();
  const diff = (tripDateTime - now) / 60000;

  if(diff < 120){
    return confirm(
      "Trip is within 120 minutes.\nEditing may be restricted.\nContinue?"
    );
  }

  return true;
}

/* ============================= */
/* PAST TIME VALIDATION */
/* ============================= */

function validateFutureTime(){
  const date = tripDate.value;
  const time = tripTime.value;

  if(!date || !time){
    alert("Please select trip date and time.");
    return false;
  }

  const tripDateTime = new Date(date + "T" + time);
  const now = getArizonaNow();

  if(isNaN(tripDateTime.getTime())){
    alert("Invalid trip date/time.");
    return false;
  }

  if(tripDateTime <= now){
    alert("Trip time already passed. You cannot add a past trip.");
    return false;
  }

  return true;
}

/* ============================= */
/* ADDRESS VALIDATION */
/* ============================= */

function validateSelectedAddresses(){
  if(!selectedPickup || !selectedPickup.address || !isValidCoord(selectedPickup.lat) || !isValidCoord(selectedPickup.lng)){
    alert("Please select a valid pickup address from suggestions.");
    pickupInput.focus();
    return false;
  }

  if(!selectedDropoff || !selectedDropoff.address || !isValidCoord(selectedDropoff.lat) || !isValidCoord(selectedDropoff.lng)){
    alert("Please select a valid dropoff address from suggestions.");
    dropoffInput.focus();
    return false;
  }

  const stopInputs = [...stopsBox.querySelectorAll(".stop-input")];

  for(const input of stopInputs){
    const value = input.value.trim();
    const stopId = input.dataset.stopId;
    const selected = selectedStops.get(stopId);

    if(value && (!selected || !selected.address || !isValidCoord(selected.lat) || !isValidCoord(selected.lng))){
      alert("Each stop must be selected from suggestions.");
      input.focus();
      return false;
    }
  }

  return true;
}

/* ============================= */
/* SAVE FORM ONLY */
/* ============================= */

if(saveTrip){
  saveTrip.addEventListener("click", function(){
    saveTripDraftToLocal();
    alert("Trip saved locally ✔");
  });
}

/* ============================= */
/* SUBMIT TRIP */
/* ============================= */

if(submitTrip){
  submitTrip.addEventListener("click", async function(){

    if(!validateFutureTime()){
      return;
    }

    if(!check120()){
      return;
    }

    if(!validateSelectedAddresses()){
      return;
    }

    const stops = collectStops();
    const stopsGeo = collectStopsGeo();

    const trip = {
      entryName: entryName.value,
      entryPhone: entryPhone.value,

      clientName: clientName.value,
      clientPhone: clientPhone.value,

      pickup: selectedPickup.address,
      pickupLat: selectedPickup.lat,
      pickupLng: selectedPickup.lng,

      dropoff: selectedDropoff.address,
      dropoffLat: selectedDropoff.lat,
      dropoffLng: selectedDropoff.lng,

      tripDate: tripDate.value,
      tripTime: tripTime.value,

      stops: stops,
      stopsGeo: stopsGeo,

      notes: notes.value,
      status: "Scheduled"
    };

    try{
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

      saveEntryInfo();
      removeTripDraft();
      clearTripForm();

      alert("Trip submitted ✔");
      clientName.focus();
    }
    catch(err){
      alert(err.message || "Server error saving trip.");
      console.error(err);
    }

  });
}

/* ============================= */
/* INIT AUTOCOMPLETE */
/* ============================= */

attachAutocomplete(pickupInput, "pickup");
attachAutocomplete(dropoffInput, "dropoff");

/* ============================= */
/* LOAD SAVED DATA */
/* ============================= */

loadEntry();
loadTripDraft();

});