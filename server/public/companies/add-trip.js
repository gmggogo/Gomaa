
/* =====================================================
FILE: add-trip.js
FINAL COMPLETE VERSION
===================================================== */
document.addEventListener("DOMContentLoaded", function(){
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const companyName =
  localStorage.getItem("name") || "";

const companyId =
  localStorage.getItem("companyId") ||
  localStorage.getItem("userId") ||
  localStorage.getItem("localId") ||
  localStorage.getItem("_id") ||
  localStorage.getItem("id") ||
  "";
if(!token || role !== "company"){
  window.location.replace("company-login.html");
  return;
}
let COMPANY_SERVICES = [];
let activeService = "STANDARD";
let activeSuffix  = "ST";
let SYSTEM_TIMEZONE = "America/Phoenix";
/* ================= BILLING ================= */
async function checkBillingLock(){
  try{
    const res = await fetch(
      "/api/company/billing?company=" + encodeURIComponent(companyName),
      { headers:{ Authorization:"Bearer " + token } }
    );
    const data = await res.json();
    if(data.billingLocked){
      document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;padding:20px;font-family:Segoe UI;">
        <div style="max-width:600px;width:100%;background:#fff;padding:40px;border-radius:20px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.08);">
          <h1 style="color:#dc2626;margin-bottom:15px;">Account Suspended</h1>
          <p style="color:#475569;font-size:17px;line-height:1.7;">
            Your company account is currently locked due to unpaid billing.
          </p>
          <a href="/companies/payment.html" style="display:inline-block;margin-top:25px;background:#2563eb;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:800;">
            Go To Payment Center
          </a>
        </div>
      </div>`;
      return false;
    }
    return true;
  }catch(err){
    console.log(err);
    return true;
  }
}
(async()=>{
const ok = await checkBillingLock();
if(!ok) return;
/* ================= ELEMENTS ================= */
const companyTabs = document.getElementById("companyTabs");
const individualSection = document.getElementById("individualSection");
const sharedSection = document.getElementById("sharedSection");
const entryName = document.getElementById("entryName");
const entryPhone = document.getElementById("entryPhone");
const editEntryBtn = document.getElementById("editEntryBtn");
const saveEntryBtn = document.getElementById("saveEntryBtn");
const saveDraftBtn = document.getElementById("saveDraftBtn");
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
async function loadSystemTimezone(){
  try{
    const res = await fetch("/api/system-design");
    const data = await res.json();

    SYSTEM_TIMEZONE =
      data?.timezone ||
      "America/Phoenix";

  }catch(err){
    console.log(err);
  }
}

function getSystemNow(){
  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone:SYSTEM_TIMEZONE
      }
    )
  );
}
function getCurrentServiceConfig(){
  return COMPANY_SERVICES.find(s =>
    String(s.serviceKey || "").toUpperCase() ===
    String(activeService || "").toUpperCase()
  ) || {};
}
function isSharedService(service){
  return (
    service.companyShared === true ||
    service.shared === true ||
    String(service.serviceType || "").toUpperCase() === "SHARED" ||
    String(service.type || "").toUpperCase() === "SHARED" ||
    String(service.title || "").toUpperCase() === "SHARED"
  );
}

function checkDynamicWarning(dateValue,timeValue){

  if(!dateValue || !timeValue){
    return true;
  }

  const service =
    getCurrentServiceConfig();

  const warningOn =
  service.companyDisableCancel !== true &&
service.disableCancel !== true

  if(!warningOn){
    return true;
  }

  const warningMinutes =
    Number(
      service.companyWarningMinutes ??
      service.warningMinutes ??
      120
    );

  if(warningMinutes <= 0){
    return true;
  }

  const tripDateTime =
    new Date(`${dateValue}T${timeValue}:00`);

 const now =
  getSystemNow();

  const diff =
    (tripDateTime - now) / 60000;

  if(
    diff > 0 &&
    diff <= warningMinutes
  ){

    return confirm(
`WARNING

This trip is within ${warningMinutes} minutes.

Continue anyway?`
    );

  }

  return true;
}

/* ================= VALIDATION ================= */

function validateIndividualTrip(){

  if(!normalizeText(entryName.value)){
    showAlert("Entry Name Required");
    return false;
  }

  if(!normalizeText(entryPhone.value)){
    showAlert("Entry Phone Required");
    return false;
  }

  if(!normalizeText(clientName.value)){
    showAlert("Client Name Required");
    return false;
  }

  if(!normalizeText(clientPhone.value)){
    showAlert("Client Phone Required");
    return false;
  }

  if(!normalizeText(pickupInput.value)){
    showAlert("Pickup Required");
    return false;
  }

  if(!normalizeText(dropoffInput.value)){
    showAlert("Dropoff Required");
    return false;
  }

  if(!tripDate.value){
    showAlert("Trip Date Required");
    return false;
  }

  if(!tripTime.value){
    showAlert("Trip Time Required");
    return false;
  }

  const tripDateTime =
    new Date(
      `${tripDate.value}T${tripTime.value}:00`
    );

  if(tripDateTime <= getSystemNow()){
    showAlert(
      "Trip Date/Time Already Passed"
    );
    return false;
  }

  return true;
}

function validateSharedTrip(){

  if(!normalizeText(sharedEntryName.value)){
    showAlert("Entry Name Required");
    return false;
  }

  if(!normalizeText(sharedEntryPhone.value)){
    showAlert("Entry Phone Required");
    return false;
  }

  if(!sharedDate.value){
    showAlert("Trip Date Required");
    return false;
  }

  if(!sharedTime.value){
    showAlert("Trip Time Required");
    return false;
  }

  const tripDateTime =
    new Date(
      `${sharedDate.value}T${sharedTime.value}:00`
    );

  if(tripDateTime <= getSystemNow()){
    showAlert(
      "Trip Date/Time Already Passed"
    );
    return false;
  }

  const cards =
    document.querySelectorAll(
      ".passenger-card"
    );

  if(cards.length < 2){
    showAlert(
      "Minimum 2 Passengers"
    );
    return false;
  }

  for(const card of cards){

    if(
      !normalizeText(
        card.querySelector(".sharedClientName").value
      )
    ){
      showAlert(
        "Passenger Name Required"
      );
      return false;
    }

    if(
      !normalizeText(
        card.querySelector(".sharedClientPhone").value
      )
    ){
      showAlert(
        "Passenger Phone Required"
      );
      return false;
    }

    if(
      !normalizeText(
        card.querySelector(".sharedPickup").value
      )
    ){
      showAlert(
        "Passenger Pickup Required"
      );
      return false;
    }

    if(
      !normalizeText(
        card.querySelector(".sharedDropoff").value
      )
    ){
      showAlert(
        "Passenger Dropoff Required"
      );
      return false;
    }

  }

  return true;
}

/* ================= ENTRY ================= */
function loadEntryInfo(){
  const saved = JSON.parse(localStorage.getItem("entryInfo") || "{}");
  entryName.value = saved.entryName || "";
  entryPhone.value = saved.entryPhone || "";
  sharedEntryName.value = saved.entryName || "";
  sharedEntryPhone.value = saved.entryPhone || "";
}
function saveEntryInfo(){
  localStorage.setItem("entryInfo", JSON.stringify({
    entryName: entryName.value,
    entryPhone: entryPhone.value
  }));
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
  }else{
    saveEntryInfo();
    entryEditMode = false;
    entryName.setAttribute("readonly", true);
    entryPhone.setAttribute("readonly", true);
    sharedEntryName.setAttribute("readonly", true);
    sharedEntryPhone.setAttribute("readonly", true);
    if(editEntryBtn) editEntryBtn.innerText = "Edit";
    if(editSharedEntryBtn) editSharedEntryBtn.innerText = "Edit";
  }
}
if(editEntryBtn) editEntryBtn.onclick = toggleEntryEdit;
if(editSharedEntryBtn) editSharedEntryBtn.onclick = toggleEntryEdit;
if(saveEntryBtn) saveEntryBtn.onclick = saveEntryInfo;
loadEntryInfo();
/* ================= DRAFTS ================= */
function loadDraft(){
  const draft = JSON.parse(localStorage.getItem("companyTripDraft") || "{}");
  clientName.value = draft.clientName || "";
  clientPhone.value = draft.clientPhone || "";
  pickupInput.value = draft.pickup || "";
  dropoffInput.value = draft.dropoff || "";
  tripDate.value = draft.tripDate || "";
  tripTime.value = draft.tripTime || "";
  notes.value = draft.notes || "";
}
function saveDraft(){
  localStorage.setItem("companyTripDraft", JSON.stringify({
    clientName: clientName.value,
    clientPhone: clientPhone.value,
    pickup: pickupInput.value,
    dropoff: dropoffInput.value,
    tripDate: tripDate.value,
    tripTime: tripTime.value,
    notes: notes.value
  }));
  showAlert("Draft Saved ✔");
}
if(saveDraftBtn) saveDraftBtn.onclick = saveDraft;
function loadSharedDraft(){
  const draft = JSON.parse(localStorage.getItem("companySharedDraft") || "{}");
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
      clientName: card.querySelector(".sharedClientName").value,
      clientPhone: card.querySelector(".sharedClientPhone").value,
      pickup: card.querySelector(".sharedPickup").value,
      dropoff: card.querySelector(".sharedDropoff").value
    });
  });
  localStorage.setItem("companySharedDraft", JSON.stringify({
    passengerCount: passengerCount.value,
    passengers,
    sharedDate: sharedDate.value,
    sharedTime: sharedTime.value,
    sharedNotes: sharedNotes.value
  }));
  showAlert("Shared Draft Saved ✔");
}
if(saveSharedDraftBtn) saveSharedDraftBtn.onclick = saveSharedDraft;
/* ================= SERVICES ================= */
async function loadCompanyServices(){
  try{

const res = await fetch(
  "/api/company-services?company=true",
  {
    headers:{
      Authorization:"Bearer " + token
    }
  }
);  

  if(!res.ok){
      throw new Error("Failed loading services");
    }
  const data = await res.json();

console.log(
  "COMPANY SERVICES",
  data
);

COMPANY_SERVICES =
Array.isArray(data)
? data
: [];
    if(COMPANY_SERVICES.length === 0){
      COMPANY_SERVICES = [{
        serviceKey:"STANDARD",
        title:"Standard",
        companySuffix:"ST",
        companyShared:false,
        companyWarningEnabled:true,
        companyWarningMinutes:120
      }];
    }
    buildDynamicTabs();
  }catch(err){
    console.log(err);
  }
}
function setActiveService(service,index){
  activeService = service.serviceKey || "STANDARD";
  activeSuffix = service.companySuffix || "ST";
  companyTabs.querySelectorAll("button").forEach(b=>{
    b.classList.remove("btn-blue");
    b.classList.add("btn-gray");
  });
  const btn = companyTabs.querySelectorAll("button")[index];
  if(btn){
    btn.classList.remove("btn-gray");
    btn.classList.add("btn-blue");
  }
  if(isSharedService(service)){
    individualSection.style.display = "none";
    sharedSection.style.display = "block";
  }else{
    individualSection.style.display = "block";
    sharedSection.style.display = "none";
  }
}
function buildDynamicTabs(){
  if(!companyTabs) return;
  companyTabs.innerHTML = "";
  COMPANY_SERVICES.forEach((service,index)=>{
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerText = service.title || "Service";
    btn.className = index === 0 ? "btn-blue" : "btn-gray";
    btn.onclick = ()=>{
      setActiveService(service,index);
    };
    companyTabs.appendChild(btn);
  });
  if(COMPANY_SERVICES.length > 0){
    setActiveService(COMPANY_SERVICES[0],0);
  }
}
/* ================= STOPS ================= */
function createStopInput(value=""){
  const currentStops =
    stopsBox.querySelectorAll(".stop-input").length;
  if(currentStops >= 5){
    showAlert("Maximum 5 stops allowed.");
    return;
  }
  const wrapper = document.createElement("div");
  wrapper.className = "stop-row";
  wrapper.innerHTML = `
    <input
      type="text"
      class="stop-input"
      placeholder="Stop address"
      value="${value}"
    >
    <button
      type="button"
      class="remove-stop-btn"
    >
      ✕
    </button>
  `;
  wrapper.querySelector(".remove-stop-btn").onclick = ()=>{
    wrapper.remove();
  };
  stopsBox.appendChild(wrapper);
}
if(addStopBtn){
  addStopBtn.onclick = ()=>createStopInput();
}
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
if(passengerCount){
  passengerCount.onchange = function(){
    renderSharedPassengers(Number(this.value));
  };
}
/* ================= SUBMIT INDIVIDUAL ================= */
if(submitTripBtn){
submitTripBtn.onclick = async function(){

  if(!validateIndividualTrip()){
    return;
  }

  if(
    !checkDynamicWarning(
      tripDate.value,
      tripTime.value
    )
  ){
    return;
  }submitTripBtn.disabled = true;
submitTripBtn.innerText = "Submitting...";
try{
const stops = [...document.querySelectorAll(".stop-input")]
  .map(i=>normalizeText(i.value))
  .filter(Boolean);
const trip = {
  company:companyName,
  companyName:companyName,
  facilityName:companyName,

  companyId:companyId,
  facilityId:companyId,
  userId:companyId,

  type:"company",
  source:"company",

  tripType:"INDIVIDUAL",
  isShared:false,

  serviceKey:activeService,
  serviceType:activeService,
  serviceSuffix:activeSuffix,  entryName:entryName.value,
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
const res = await fetch("/api/trips",{
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
showAlert("Trip Submitted Successfully ✔");
clientName.value = "";
clientPhone.value = "";
pickupInput.value = "";
dropoffInput.value = "";
tripDate.value = "";
tripTime.value = "";
notes.value = "";
stopsBox.innerHTML = "";
localStorage.removeItem("companyTripDraft");
}catch(err){
  console.log(err);
  showAlert(err.message || "Server Error");
}finally{
  submitTripBtn.disabled = false;
  submitTripBtn.innerText = "Submit Trip";
}
};
}
/* ================= SUBMIT SHARED ================= */
if(submitSharedBtn){
submitSharedBtn.onclick = async function(){

  if(!validateSharedTrip()){
    return;
  }

  if(
    !checkDynamicWarning(
      sharedDate.value,
      sharedTime.value
    )
  ){
    return;
  }

if(!sharedDate.value || !sharedTime.value){
  showAlert("Select shared date/time");
  return;
}
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
  company:companyName,
  companyName:companyName,
  facilityName:companyName,

  companyId:companyId,
  facilityId:companyId,
  userId:companyId,

  type:"company",
  source:"company",

  isShared:true,
  tripType:"SHARED",

  serviceKey:activeService,
  serviceType:activeService,
  serviceSuffix:activeSuffix,

  passengers,
  passengersCount: passengers.length,

  totalPassengers: passengers.length,
  entryName:sharedEntryName.value,
  entryPhone:sharedEntryPhone.value,
  tripDate:sharedDate.value,
  tripTime:sharedTime.value,
  notes:sharedNotes.value,
  status:"Scheduled"
};
const res = await fetch("/api/trips",{
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
showAlert("Shared Trip Submitted ✔");
passengersContainer.innerHTML = "";
sharedDate.value = "";
sharedTime.value = "";
sharedNotes.value = "";
passengerCount.value = "";
localStorage.removeItem("companySharedDraft");
}catch(err){
  console.log(err);
  showAlert(err.message || "Server Error");
}finally{
  submitSharedBtn.disabled = false;
  submitSharedBtn.innerText = "Submit Shared";
}
};
}
/* ================= INIT ================= */
loadDraft();
loadSharedDraft();

await loadSystemTimezone();
await loadCompanyServices();
})(); 
});