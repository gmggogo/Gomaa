/* =====================================================
FILE: add-reservation.js
ADMIN RESERVATION ADD TRIP - RV
===================================================== */

document.addEventListener("DOMContentLoaded", async function(){

const API_URL = "/api/trips";
const SERVICES_URL = "/api/services/admin";

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role") || "";

if(!token || !["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
  return;
}

let SERVICES = [];
let TABS = [];
let activeTab = null;
let SYSTEM_TIMEZONE = "America/Phoenix";

/* ================= ELEMENTS ================= */

const companyTabs = document.getElementById("companyTabs");

const individualSection = document.getElementById("individualSection");
const sharedSection = document.getElementById("sharedSection");

const entryName = document.getElementById("entryName");
const entryPhone = document.getElementById("entryPhone");
const editEntryBtn = document.getElementById("editEntryBtn");
const saveEntryBtn = document.getElementById("saveEntryBtn");

const clientName = document.getElementById("clientName");
const clientPhone = document.getElementById("clientPhone");
const pickupInput = document.getElementById("pickup");
const dropoffInput = document.getElementById("dropoff");
const tripDate = document.getElementById("tripDate");
const tripTime = document.getElementById("tripTime");
const notes = document.getElementById("notes");
const stopsBox = document.getElementById("stops");
const addStopBtn = document.getElementById("addStopBtn");
const submitTripBtn = document.getElementById("submitTrip");
const saveDraftBtn = document.getElementById("saveDraftBtn");

const sharedEntryName = document.getElementById("sharedEntryName");
const sharedEntryPhone = document.getElementById("sharedEntryPhone");
const editSharedEntryBtn = document.getElementById("editSharedEntryBtn");
const passengerCount = document.getElementById("passengerCount");
const sharedDate = document.getElementById("sharedDate");
const sharedTime = document.getElementById("sharedTime");
const sharedNotes = document.getElementById("sharedNotes");
const passengersContainer = document.getElementById("passengersContainer");
const submitSharedBtn = document.getElementById("submitShared");
const saveSharedDraftBtn = document.getElementById("saveSharedDraftBtn");

/* ================= HELPERS ================= */

function normalizeText(v){
  return String(v ?? "").trim();
}

function showAlert(msg){
  alert(msg);
}

function getServiceKey(service){
  return String(
    service?.serviceKey ||
    service?.key ||
    service?.code ||
    service?.title ||
    "STANDARD"
  ).toUpperCase();
}

function getServiceTitle(service){
  return (
    service?.title ||
    service?.name ||
    service?.serviceName ||
    getServiceKey(service)
  );
}

function getServiceSuffix(service){
  return (
    service?.companySuffix ||
    service?.suffix ||
    service?.serviceSuffix ||
    service?.code ||
    service?.serviceKey ||
    "ST"
  );
}

function serviceIndividualOn(service){
  return service.enabled === true || service.companyEnabled === true;
}

function serviceSharedOn(service){
  return service.companyShared === true || service.shared === true;
}

function getCurrentServiceConfig(){
  return activeTab?.service || {};
}

async function loadSystemTimezone(){
  try{
    const res = await fetch("/api/system-design");
    const data = await res.json();
    SYSTEM_TIMEZONE = data?.timezone || "America/Phoenix";
  }catch(err){
    console.log(err);
  }
}

function getSystemNow(){
  return new Date(
    new Date().toLocaleString("en-US",{timeZone:SYSTEM_TIMEZONE})
  );
}

function checkDynamicWarning(){
  return true;
}
/* ================= ENTRY ================= */

function loadEntryInfo(){
  const saved = JSON.parse(localStorage.getItem("reservationEntryInfo") || "{}");

  entryName.value = saved.entryName || "";
  entryPhone.value = saved.entryPhone || "";
  sharedEntryName.value = saved.entryName || "";
  sharedEntryPhone.value = saved.entryPhone || "";
}

function saveEntryInfo(){
  localStorage.setItem("reservationEntryInfo",JSON.stringify({
    entryName:entryName.value,
    entryPhone:entryPhone.value
  }));

  sharedEntryName.value = entryName.value;
  sharedEntryPhone.value = entryPhone.value;

  showAlert("Entry Info Saved ✔");
}

let entryEditMode = false;

function toggleEntryEdit(){
  if(!entryEditMode){
    entryEditMode = true;

    entryName.removeAttribute("readonly");
    entryPhone.removeAttribute("readonly");
    sharedEntryName.removeAttribute("readonly");
    sharedEntryPhone.removeAttribute("readonly");

    if(editEntryBtn) editEntryBtn.innerText = "Save";
    if(editSharedEntryBtn) editSharedEntryBtn.innerText = "Save";

    entryName.focus();
    return;
  }

  saveEntryInfo();

  entryEditMode = false;

  entryName.setAttribute("readonly",true);
  entryPhone.setAttribute("readonly",true);
  sharedEntryName.setAttribute("readonly",true);
  sharedEntryPhone.setAttribute("readonly",true);

  if(editEntryBtn) editEntryBtn.innerText = "Edit";
  if(editSharedEntryBtn) editSharedEntryBtn.innerText = "Edit";
}

editEntryBtn?.addEventListener("click",toggleEntryEdit);
editSharedEntryBtn?.addEventListener("click",toggleEntryEdit);
saveEntryBtn?.addEventListener("click",saveEntryInfo);

/* ================= VALIDATION ================= */

function validateIndividualTrip(){
  if(!normalizeText(entryName.value)) return showAlert("Entry Name Required"), false;
  if(!normalizeText(entryPhone.value)) return showAlert("Entry Phone Required"), false;
  if(!normalizeText(clientName.value)) return showAlert("Client Name Required"), false;
  if(!normalizeText(clientPhone.value)) return showAlert("Client Phone Required"), false;
  if(!normalizeText(pickupInput.value)) return showAlert("Pickup Required"), false;
  if(!normalizeText(dropoffInput.value)) return showAlert("Dropoff Required"), false;
  if(!tripDate.value) return showAlert("Trip Date Required"), false;
  if(!tripTime.value) return showAlert("Trip Time Required"), false;

  const dt = new Date(`${tripDate.value}T${tripTime.value}:00`);
  if(dt <= getSystemNow()) return showAlert("Trip Date/Time Already Passed"), false;

  return true;
}

function validateSharedTrip(){
  if(!normalizeText(sharedEntryName.value)) return showAlert("Entry Name Required"), false;
  if(!normalizeText(sharedEntryPhone.value)) return showAlert("Entry Phone Required"), false;
  if(!sharedDate.value) return showAlert("Trip Date Required"), false;
  if(!sharedTime.value) return showAlert("Trip Time Required"), false;

  const dt = new Date(`${sharedDate.value}T${sharedTime.value}:00`);
  if(dt <= getSystemNow()) return showAlert("Trip Date/Time Already Passed"), false;

  const cards = document.querySelectorAll(".passenger-card");
  if(cards.length < 2) return showAlert("Minimum 2 Passengers"), false;

  for(const card of cards){
    if(!normalizeText(card.querySelector(".sharedClientName")?.value)) return showAlert("Passenger Name Required"), false;
    if(!normalizeText(card.querySelector(".sharedClientPhone")?.value)) return showAlert("Passenger Phone Required"), false;
    if(!normalizeText(card.querySelector(".sharedPickup")?.value)) return showAlert("Passenger Pickup Required"), false;
    if(!normalizeText(card.querySelector(".sharedDropoff")?.value)) return showAlert("Passenger Dropoff Required"), false;
  }

  return true;
}

/* ================= DRAFTS ================= */

function loadDraft(){
  const draft = JSON.parse(localStorage.getItem("reservationTripDraft") || "{}");

  clientName.value = draft.clientName || "";
  clientPhone.value = draft.clientPhone || "";
  pickupInput.value = draft.pickup || "";
  dropoffInput.value = draft.dropoff || "";
  tripDate.value = draft.tripDate || "";
  tripTime.value = draft.tripTime || "";
  notes.value = draft.notes || "";

  if(Array.isArray(draft.stops)){
    draft.stops.forEach(s=>createStopInput(s));
  }
}

function saveDraft(){
  const stops = [...document.querySelectorAll(".stop-input")]
    .map(i=>normalizeText(i.value))
    .filter(Boolean);

  localStorage.setItem("reservationTripDraft",JSON.stringify({
    clientName:clientName.value,
    clientPhone:clientPhone.value,
    pickup:pickupInput.value,
    dropoff:dropoffInput.value,
    tripDate:tripDate.value,
    tripTime:tripTime.value,
    notes:notes.value,
    stops
  }));

  showAlert("Draft Saved ✔");
}

function loadSharedDraft(){
  const draft = JSON.parse(localStorage.getItem("reservationSharedDraft") || "{}");

  passengerCount.value = draft.passengerCount || "";
  sharedDate.value = draft.sharedDate || "";
  sharedTime.value = draft.sharedTime || "";
  sharedNotes.value = draft.sharedNotes || "";

  if(Number(draft.passengerCount) >= 2){
    renderSharedPassengers(Number(draft.passengerCount));

    setTimeout(()=>{
      const cards = document.querySelectorAll(".passenger-card");
      (draft.passengers || []).forEach((p,index)=>{
        const card = cards[index];
        if(!card) return;

        card.querySelector(".sharedClientName").value = p.clientName || "";
        card.querySelector(".sharedClientPhone").value = p.clientPhone || "";
        card.querySelector(".sharedPickup").value = p.pickup || "";
        card.querySelector(".sharedDropoff").value = p.dropoff || "";
      });
    },50);
  }
}

function saveSharedDraft(){
  const passengers = [];

  document.querySelectorAll(".passenger-card").forEach(card=>{
    passengers.push({
      clientName:card.querySelector(".sharedClientName").value,
      clientPhone:card.querySelector(".sharedClientPhone").value,
      pickup:card.querySelector(".sharedPickup").value,
      dropoff:card.querySelector(".sharedDropoff").value
    });
  });

  localStorage.setItem("reservationSharedDraft",JSON.stringify({
    passengerCount:passengerCount.value,
    passengers,
    sharedDate:sharedDate.value,
    sharedTime:sharedTime.value,
    sharedNotes:sharedNotes.value
  }));

  showAlert("Shared Draft Saved ✔");
}

saveDraftBtn?.addEventListener("click",saveDraft);
saveSharedDraftBtn?.addEventListener("click",saveSharedDraft);

/* ================= SERVICES / TABS ================= */

async function loadAdminServices(){
  try{
    const res = await fetch(SERVICES_URL,{
      headers:{Authorization:"Bearer " + token}
    });

    if(!res.ok) throw new Error("Failed loading services");

    const data = await res.json();

    const raw = Array.isArray(data)
      ? data
      : Array.isArray(data.services)
        ? data.services
        : Array.isArray(data.data)
          ? data.data
          : [];

    SERVICES = raw;
    buildDynamicTabs();

  }catch(err){
    console.log(err);
    SERVICES = [{
      serviceKey:"STANDARD",
      title:"Standard",
      suffix:"ST",
      enabled:true,
      companyShared:false,
      warningMinutes:120
    }];

    buildDynamicTabs();
  }
}

function buildTabsFromServices(){
  const tabs = [];

  SERVICES.forEach(service=>{
    const key = getServiceKey(service);
    const title = getServiceTitle(service);
    const suffix = getServiceSuffix(service);

    if(serviceIndividualOn(service)){
      tabs.push({
        mode:"INDIVIDUAL",
        label:title,
        service,
        serviceKey:key,
        suffix
      });
    }

 if(serviceSharedOn(service)){
  tabs.push({
    mode:"SHARED",
    label:title,
    service,
    serviceKey:key,
    suffix
  });
}
  });

  return tabs;
}

function buildDynamicTabs(){
  if(!companyTabs) return;

  TABS = buildTabsFromServices();
  companyTabs.innerHTML = "";

  if(!TABS.length){
    companyTabs.innerHTML = `<div style="padding:12px;font-weight:900;color:#dc2626;">No active reservation services</div>`;
    individualSection.style.display = "none";
    sharedSection.style.display = "none";
    return;
  }

  TABS.forEach((tab,index)=>{
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerText = tab.label;
    btn.className = index === 0 ? "btn-blue" : "btn-gray";
    btn.onclick = ()=>setActiveTab(tab,index);
    companyTabs.appendChild(btn);
  });

  setActiveTab(TABS[0],0);
}

function setActiveTab(tab,index){
  activeTab = tab;

  companyTabs.querySelectorAll("button").forEach(btn=>{
    btn.classList.remove("btn-blue");
    btn.classList.add("btn-gray");
  });

  const btn = companyTabs.querySelectorAll("button")[index];
  if(btn){
    btn.classList.remove("btn-gray");
    btn.classList.add("btn-blue");
  }

  if(tab.mode === "SHARED"){
    individualSection.style.display = "none";
    sharedSection.style.display = "block";
  }else{
    individualSection.style.display = "block";
    sharedSection.style.display = "none";
  }
}

/* ================= STOPS ================= */

function createStopInput(value=""){
  const currentStops = stopsBox.querySelectorAll(".stop-input").length;

  if(currentStops >= 5){
    showAlert("Maximum 5 stops allowed.");
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "stop-row";
  wrapper.innerHTML = `
    <input type="text" class="stop-input" placeholder="Stop address" value="${value}">
    <button type="button" class="remove-stop-btn">✕</button>
  `;

  wrapper.querySelector(".remove-stop-btn").onclick = ()=>wrapper.remove();

  stopsBox.appendChild(wrapper);
}

addStopBtn?.addEventListener("click",()=>createStopInput());

/* ================= SHARED PASSENGERS ================= */

function renderSharedPassengers(count){
  passengersContainer.innerHTML = "";

  if(count < 2) return;

  for(let i = 1; i <= count; i++){
    const card = document.createElement("div");
    card.className = "passenger-card";
    card.innerHTML = `
      <div class="passenger-header">
        <h4>Passenger ${i}</h4>
      </div>
      <div class="form-grid">
        <div class="field-wrap">
          <input class="sharedClientName" placeholder="Client Name">
        </div>
        <div class="field-wrap">
          <input class="sharedClientPhone" placeholder="Client Phone">
        </div>
        <div class="field-wrap">
          <input class="sharedPickup" placeholder="Pickup Address">
        </div>
        <div class="field-wrap">
          <input class="sharedDropoff" placeholder="Dropoff Address">
        </div>
      </div>
    `;

    passengersContainer.appendChild(card);
  }
}

passengerCount?.addEventListener("change",function(){
  renderSharedPassengers(Number(this.value));
});

/* ================= SUBMIT INDIVIDUAL ================= */

submitTripBtn?.addEventListener("click",async function(){
  if(!activeTab) return showAlert("Select Service");
  if(!validateIndividualTrip()) return;

  if(!checkDynamicWarning(tripDate.value,tripTime.value)) return;

  submitTripBtn.disabled = true;
  submitTripBtn.innerText = "Submitting...";

  try{
    const stops = [...document.querySelectorAll(".stop-input")]
      .map(i=>normalizeText(i.value))
      .filter(Boolean);

    const trip = {
      type:"reserved",
      reservation:true,
      source:"RV",
      bookingSource:"RV",

      tripType:"INDIVIDUAL",
      isShared:false,

      serviceKey:activeTab.serviceKey,
      serviceType:activeTab.serviceKey,
      serviceSuffix:activeTab.suffix,

      entryName:entryName.value,
      entryPhone:entryPhone.value,

      clientName:clientName.value,
      clientPhone:clientPhone.value,

      pickup:pickupInput.value,
      dropoff:dropoffInput.value,
      stops,

      tripDate:tripDate.value,
      tripTime:tripTime.value,
      notes:notes.value,

      status:"Scheduled"
    };

    const res = await fetch(API_URL,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:JSON.stringify(trip)
    });

    if(!res.ok){
      const err = await res.json();
      throw new Error(err.message || "Server Error");
    }

    localStorage.removeItem("reservationTripDraft");

    showAlert("Reservation Submitted Successfully ✔");

    window.location.href = "/admin/trips-hub.html";

  }catch(err){
    console.log(err);
    showAlert(err.message || "Server Error");
  }finally{
    submitTripBtn.disabled = false;
    submitTripBtn.innerText = "Submit Trip";
  }
});

/* ================= SUBMIT SHARED ================= */

submitSharedBtn?.addEventListener("click",async function(){
  if(!activeTab) return showAlert("Select Service");
  if(!validateSharedTrip()) return;

  if(!checkDynamicWarning(sharedDate.value,sharedTime.value)) return;

  const passengers = [];

  document.querySelectorAll(".passenger-card").forEach((card,index)=>{
    passengers.push({
      passengerId:"P" + (index + 1),
      clientName:card.querySelector(".sharedClientName").value,
      clientPhone:card.querySelector(".sharedClientPhone").value,
      pickup:card.querySelector(".sharedPickup").value,
      dropoff:card.querySelector(".sharedDropoff").value,
      status:"Scheduled"
    });
  });

  if(passengers.length < 2){
    showAlert("Minimum 2 passengers");
    return;
  }

  submitSharedBtn.disabled = true;
  submitSharedBtn.innerText = "Submitting...";

  try{
    const sharedTrip = {
      type:"reserved",
      reservation:true,
      source:"RV",
      bookingSource:"RV",

      isShared:true,
      tripType:"SHARED",

      serviceKey:activeTab.serviceKey,
      serviceType:activeTab.serviceKey,
      serviceSuffix:activeTab.suffix,

      passengers,
      passengersCount:passengers.length,
      totalPassengers:passengers.length,

      entryName:sharedEntryName.value,
      entryPhone:sharedEntryPhone.value,

      tripDate:sharedDate.value,
      tripTime:sharedTime.value,
      notes:sharedNotes.value,

      status:"Scheduled"
    };

    const res = await fetch(API_URL,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:JSON.stringify(sharedTrip)
    });

    if(!res.ok){
      const err = await res.json();
      throw new Error(err.message || "Server Error");
    }

    localStorage.removeItem("reservationSharedDraft");

    showAlert("Shared Reservation Submitted ✔");

    window.location.href = "/admin/trips-hub.html";

  }catch(err){
    console.log(err);
    showAlert(err.message || "Server Error");
  }finally{
    submitSharedBtn.disabled = false;
    submitSharedBtn.innerText = "Submit Shared";
  }
});

/* ================= INIT ================= */

loadEntryInfo();
loadDraft();
loadSharedDraft();

await loadSystemTimezone();
await loadAdminServices();

});