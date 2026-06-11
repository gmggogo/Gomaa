/* =====================================================
FILE: dispatch-add-trip.js
DISPATCH ADD TRIP - CLEAN BUILD
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
let activeService = null;
let pendingTrips = JSON.parse(localStorage.getItem("dispatchReviewTrips") || "[]");
let SYSTEM_TIMEZONE = "America/Phoenix";

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

function normalizeText(v){
  return String(v ?? "").trim();
}

function showAlert(msg){
  alert(msg);
}

function normalizeCode(v){
  const c = normalizeText(v).toUpperCase();

  if(c === "STANDARD" || c === "ST") return "ST";
  if(c === "WHEELCHAIR" || c === "WH") return "WH";
  if(c === "SHARED" || c === "SH") return "SH";
  if(c === "LIMOUSINE" || c === "LIMO" || c === "LM") return "LM";
  if(c === "TAXI" || c === "TX") return "TX";
  if(c === "XL") return "XL";

  return c;
}

function getServiceCode(service){
  return normalizeCode(
    service?.serviceKey ||
    service?.key ||
    service?.code ||
    service?.suffix ||
    service?.companySuffix ||
    service?.title ||
    service?.name ||
    ""
  );
}

function getServiceTitle(service){
  const code = getServiceCode(service);

  if(code === "ST") return "Standard";
  if(code === "XL") return "XL";
  if(code === "TX") return "Taxi";
  if(code === "LM") return "Limousine";
  if(code === "WH") return "Wheelchair";
  if(code === "SH") return "Shared";

  return service?.title || service?.name || service?.serviceName || code || "Service";
}

function getServiceSuffix(service){
  const code = getServiceCode(service);
  return service?.companySuffix || service?.suffix || service?.serviceSuffix || code || "ST";
}

function serviceVisible(service){
  return (
    service?.enabled === true ||
    service?.companyEnabled === true
  );
}

function isSharedService(service){
  const code = getServiceCode(service);
  const title = getServiceTitle(service).toLowerCase();

  return (
    code === "SH" ||
    title === "shared" ||
    String(service?.serviceType || "").toUpperCase() === "SHARED" ||
    String(service?.type || "").toUpperCase() === "SHARED"
  );
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

function buildTopHeader(){
  if(document.getElementById("dispatchAddHeader")) return;

  const container = document.querySelector(".container");
  if(!container) return;

  const header = document.createElement("div");
  header.id = "dispatchAddHeader";
  header.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <button id="backToHubBtn" type="button" style="background:#64748b;color:#fff;flex:1;">
        ← Back To Trips Hub
      </button>
      <button id="showAddBtn" type="button" style="background:#f97316;color:#fff;flex:1;">
        Dispatch Add Trip
      </button>
      <button id="showReviewBtn" type="button" style="background:#16a34a;color:#fff;flex:1;">
        Dispatch Review
      </button>
    </div>
  `;

  container.insertBefore(header,container.firstChild);

  document.getElementById("backToHubBtn").onclick = ()=>{
    window.location.href = "/admin/trips-hub.html";
  };

  document.getElementById("showAddBtn").onclick = showAddPage;
  document.getElementById("showReviewBtn").onclick = showReviewPage;
}

function buildReviewPage(){
  if(document.getElementById("dispatchReviewPage")) return;

  const container = document.querySelector(".container");
  if(!container) return;

  const review = document.createElement("div");
  review.id = "dispatchReviewPage";
  review.style.display = "none";
  review.innerHTML = `
    <section>
      <h3>Dispatch Review</h3>
      <div id="dispatchReviewList"></div>
      <div class="actions">
        <button id="backToAddFromReview" type="button" class="btn-orange">Back To Add Trip</button>
      </div>
    </section>
  `;

  container.appendChild(review);

  document.getElementById("backToAddFromReview").onclick = showAddPage;
}

function showAddPage(){
  document.getElementById("dispatchReviewPage").style.display = "none";
  if(companyTabs) companyTabs.style.display = "flex";

  if(activeService && isSharedService(activeService)){
    individualSection.style.display = "none";
    sharedSection.style.display = "block";
  }else{
    individualSection.style.display = "block";
    sharedSection.style.display = "none";
  }
}
function showReviewPage(){
  if(companyTabs) companyTabs.style.display = "none";

  individualSection.style.display = "none";
  sharedSection.style.display = "none";

  const page =
    document.getElementById("dispatchReviewPage");

  page.style.display = "block";

  renderPendingReview();
}
async function createTripFromReview(index){
  const trip = pendingTrips[index];
  if(!trip) return;

  if(!confirm("Confirm and create RV trip?")) return;

  try{
    const payload = {
      ...trip,
      reviewOnly:false,
      status:"RV",
      reservationStatus:"RV",
      dispatchSelected:false,
      driverAssigned:false
    };

    delete payload.localId;

    const res = await fetch(API_URL,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:JSON.stringify(payload)
    });

    const data = await res.json().catch(()=>({}));

    if(!res.ok || data.success === false){
      throw new Error(data.message || "Error creating trip");
    }

    pendingTrips.splice(index,1);
    localStorage.setItem("dispatchReviewTrips",JSON.stringify(pendingTrips));

    showAlert("RV Trip Created ✔");
    renderPendingReview();

  }catch(err){
    console.error(err);
    alert(err.message || "Create trip failed");
  }
}

function editPendingTrip(index){
  const trip = pendingTrips[index];
  if(!trip) return;

  if(trip.isShared){
    localStorage.setItem("dispatchSharedDraft",JSON.stringify({
      passengerCount:trip.passengers?.length || 2,
      sharedDate:trip.tripDate || "",
      sharedTime:trip.tripTime || "",
      sharedNotes:trip.notes || "",
      entryName:trip.entryName || "",
      entryPhone:trip.entryPhone || "",
      passengers:trip.passengers || []
    }));
  }else{
    localStorage.setItem("dispatchTripDraft",JSON.stringify({
      serviceKey:trip.serviceKey || "",
      clientName:trip.clientName || "",
      clientPhone:trip.clientPhone || "",
      pickup:trip.pickup || "",
      dropoff:trip.dropoff || "",
      tripDate:trip.tripDate || "",
      tripTime:trip.tripTime || "",
      notes:trip.notes || "",
      stops:trip.stops || []
    }));
  }

  pendingTrips.splice(index,1);
  localStorage.setItem("dispatchReviewTrips",JSON.stringify(pendingTrips));

  showAddPage();
  location.reload();
}


function renderPendingReview(){
  const box = document.getElementById("dispatchReviewList");
  if(!box) return;

  if(!pendingTrips.length){
    box.innerHTML = `<div style="font-weight:900;color:#64748b;">No trips in review yet.</div>`;
    return;
  }

  box.innerHTML = pendingTrips.map((t,i)=>{
    const isShared = t.isShared === true;
    return `
      <div style="background:#f8fafc;border:1px solid #dbe3ee;border-radius:12px;padding:12px;margin-bottom:10px;">
        <b>${i + 1}. ${isShared ? "Shared" : "Individual"} - ${t.serviceTitle || t.serviceType}</b><br>
        Date: ${t.tripDate || "-"} | Time: ${t.tripTime || "-"}<br>
        ${isShared ? `Passengers: ${t.passengers?.length || 0}` : `Client: ${t.clientName || "-"}`}<br>
     <button type="button"
onclick="editPendingTrip(${i})"
style="margin-top:8px;background:#2563eb;color:#fff;">
Edit
</button>

<button type="button"
onclick="createTripFromReview(${i})"
style="margin-top:8px;background:#16a34a;color:#fff;">
Confirm
</button>

<button type="button"
onclick="deletePendingTrip(${i})"
style="margin-top:8px;background:#ef4444;color:#fff;">
Delete
</button>

</div>
`;   

  }).join("");
}

window.deletePendingTrip = function(index){
  pendingTrips.splice(index,1);
  localStorage.setItem("dispatchReviewTrips",JSON.stringify(pendingTrips));
  renderPendingReview();
};

window.createTripFromReview = createTripFromReview;
window.editPendingTrip = editPendingTrip;
function loadEntryInfo(){
  const saved = JSON.parse(localStorage.getItem("dispatchEntryInfo") || "{}");

  entryName.value = saved.entryName || "";
  entryPhone.value = saved.entryPhone || "";
  sharedEntryName.value = saved.entryName || "";
  sharedEntryPhone.value = saved.entryPhone || "";
}

function saveEntryInfo(){
  localStorage.setItem("dispatchEntryInfo",JSON.stringify({
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

    const unique = new Map();

    raw.filter(serviceVisible).forEach(service=>{
      const code = getServiceCode(service);
      if(code && !unique.has(code)){
        unique.set(code,service);
      }
    });

    SERVICES = [...unique.values()];
    buildServiceTabs();

  }catch(err){
    console.log(err);

    SERVICES = [{
      serviceKey:"ST",
      title:"Standard",
      suffix:"ST",
      enabled:true
    }];

    buildServiceTabs();
  }
}

function buildServiceTabs(){
  if(!companyTabs) return;

  companyTabs.innerHTML = "";

  if(!SERVICES.length){
    companyTabs.innerHTML = `<div style="padding:12px;font-weight:900;color:#dc2626;">No active services</div>`;
    return;
  }

  SERVICES.forEach((service,index)=>{
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerText = getServiceTitle(service);
    btn.className = index === 0 ? "btn-blue" : "btn-gray";
    btn.onclick = ()=>setActiveService(service,index);
    companyTabs.appendChild(btn);
  });

  setActiveService(SERVICES[0],0);
}

function setActiveService(service,index){
  activeService = service;

  companyTabs.querySelectorAll("button").forEach(btn=>{
    btn.classList.remove("btn-blue");
    btn.classList.add("btn-gray");
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

function clearIndividualForm(){
  clientName.value = "";
  clientPhone.value = "";
  pickupInput.value = "";
  dropoffInput.value = "";
  tripDate.value = "";
  tripTime.value = "";
  notes.value = "";
  stopsBox.innerHTML = "";
}

function clearSharedForm(){
  passengerCount.value = "";
  sharedDate.value = "";
  sharedTime.value = "";
  sharedNotes.value = "";
  passengersContainer.innerHTML = "";
}

submitTripBtn?.addEventListener("click",function(){
  if(!activeService) return showAlert("Select Service");
  if(!validateIndividualTrip()) return;

  const stops = [...document.querySelectorAll(".stop-input")]
    .map(i=>normalizeText(i.value))
    .filter(Boolean);

  const serviceCode = getServiceCode(activeService);
  const suffix = getServiceSuffix(activeService);

  const trip = {
    type:"reserved",
    reservation:true,
    source:"RV",
    bookingSource:"RV",
    reviewOnly:true,

    tripType:"INDIVIDUAL",
    isShared:false,

    serviceKey:serviceCode,
    serviceType:serviceCode,
    serviceSuffix:suffix,
    serviceTitle:getServiceTitle(activeService),

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

    status:"Review"
  };

  pendingTrips.push(trip);
  localStorage.setItem("dispatchReviewTrips",JSON.stringify(pendingTrips));
renderPendingReview();
  clearIndividualForm();

localStorage.removeItem("dispatchTripDraft");

showAlert("Trip Added To Dispatch Review ✔");
});

submitSharedBtn?.addEventListener("click",function(){
  if(!activeService) return showAlert("Select Service");
  if(!validateSharedTrip()) return;

  const passengers = [];

  document.querySelectorAll(".passenger-card").forEach((card,index)=>{
    passengers.push({
      passengerId:"P" + (index + 1),
      clientName:card.querySelector(".sharedClientName").value,
      clientPhone:card.querySelector(".sharedClientPhone").value,
      pickup:card.querySelector(".sharedPickup").value,
      dropoff:card.querySelector(".sharedDropoff").value,
      status:"Review"
    });
  });

  const serviceCode = getServiceCode(activeService);
  const suffix = getServiceSuffix(activeService);

  const sharedTrip = {
    type:"reserved",
    reservation:true,
    source:"RV",
    bookingSource:"RV",
    reviewOnly:true,

    isShared:true,
    tripType:"SHARED",

    serviceKey:serviceCode,
    serviceType:serviceCode,
    serviceSuffix:suffix,
    serviceTitle:getServiceTitle(activeService),

    passengers,
    passengersCount:passengers.length,
    totalPassengers:passengers.length,

serviceKey:getServiceCode(activeService),
entryName:sharedEntryName.value,
entryPhone:sharedEntryPhone.value,

    tripDate:sharedDate.value,
    tripTime:sharedTime.value,
    notes:sharedNotes.value,

    status:"Review"
  };

  pendingTrips.push(sharedTrip);
  localStorage.setItem("dispatchReviewTrips",JSON.stringify(pendingTrips));

  clearSharedForm();

localStorage.removeItem("dispatchSharedDraft");

showAlert("Shared Trip Added To Dispatch Review ✔");
});

saveDraftBtn?.addEventListener("click",()=>{

  const draft = {
    serviceKey:getServiceCode(activeService),
clientName:clientName.value,
    clientPhone:clientPhone.value,
    pickup:pickupInput.value,
    dropoff:dropoffInput.value,
    tripDate:tripDate.value,
    tripTime:tripTime.value,
    notes:notes.value,
    stops:[...document.querySelectorAll(".stop-input")]
      .map(i=>i.value)
  };

  localStorage.setItem(
    "dispatchTripDraft",
    JSON.stringify(draft)
  );

  showAlert("Draft Saved ✔");
});

saveSharedDraftBtn?.addEventListener("click",()=>{

  const passengers = [];

  document.querySelectorAll(".passenger-card").forEach(card=>{

    passengers.push({
      clientName:
        card.querySelector(".sharedClientName")?.value || "",

      clientPhone:
        card.querySelector(".sharedClientPhone")?.value || "",

      pickup:
        card.querySelector(".sharedPickup")?.value || "",

      dropoff:
        card.querySelector(".sharedDropoff")?.value || ""
    });

  });

  localStorage.setItem(
    "dispatchSharedDraft",
    JSON.stringify({
      passengerCount: passengerCount.value,
      sharedDate: sharedDate.value,
      sharedTime: sharedTime.value,
      sharedNotes: sharedNotes.value,
      passengers
    })
  );

  showAlert("Shared Draft Saved ✔");

});

buildTopHeader();
buildReviewPage();

loadEntryInfo();
const draft =
JSON.parse(
  localStorage.getItem("dispatchTripDraft") || "{}"
);

clientName.value = draft.clientName || "";
clientPhone.value = draft.clientPhone || "";
pickupInput.value = draft.pickup || "";
dropoffInput.value = draft.dropoff || "";
tripDate.value = draft.tripDate || "";
tripTime.value = draft.tripTime || "";
notes.value = draft.notes || "";

(draft.stops || []).forEach(stop=>{
  createStopInput(stop);
});
const sharedDraft =
JSON.parse(
  localStorage.getItem("dispatchSharedDraft") || "{}"
);
if(sharedDraft.entryName) sharedEntryName.value = sharedDraft.entryName;
if(sharedDraft.entryPhone) sharedEntryPhone.value = sharedDraft.entryPhone;
passengerCount.value =
  sharedDraft.passengerCount || "";

sharedDate.value =
  sharedDraft.sharedDate || "";

sharedTime.value =
  sharedDraft.sharedTime || "";

sharedNotes.value =
  sharedDraft.sharedNotes || "";

if(sharedDraft.passengerCount){

  renderSharedPassengers(
    Number(sharedDraft.passengerCount)
  );

  const cards =
    document.querySelectorAll(".passenger-card");

  (sharedDraft.passengers || [])
    .forEach((p,index)=>{

      const card = cards[index];
      if(!card) return;

      card.querySelector(".sharedClientName").value =
        p.clientName || "";

      card.querySelector(".sharedClientPhone").value =
        p.clientPhone || "";

      card.querySelector(".sharedPickup").value =
        p.pickup || "";

      card.querySelector(".sharedDropoff").value =
        p.dropoff || "";
    });

}
await loadSystemTimezone();
await loadAdminServices();

});