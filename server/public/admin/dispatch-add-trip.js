/* =====================================================
FILE: dispatch-add-trip.js
DISPATCH ADD TRIP - CLEAN BUILD
ADD -> REVIEW -> CONFIRM -> CREATE RV
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

/* ================= STATE ================= */

let SERVICES = [];
let activeService = null;
let pendingTrips = JSON.parse(localStorage.getItem("dispatchReviewTrips") || "[]");
let editIndex = null;
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

function saveReview(){
  localStorage.setItem("dispatchReviewTrips", JSON.stringify(pendingTrips));
}

function makeLocalId(){
  return "RV_LOCAL_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

function normalizeCode(v){
  const c = normalizeText(v).toUpperCase();

  if(c === "STANDARD" || c === "ST") return "STANDARD";
  if(c === "WHEELCHAIR" || c === "WH") return "WHEELCHAIR";
  if(c === "SHARED" || c === "SH") return "SHARED";
  if(c === "LIMOUSINE" || c === "LIMO" || c === "LM") return "LIMO";
  if(c === "TAXI" || c === "TX") return "TAXI";
  if(c === "XL") return "XL";

  return c || "STANDARD";
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

  if(code === "STANDARD") return "Standard";
  if(code === "XL") return "XL";
  if(code === "TAXI") return "Taxi";
  if(code === "LIMO") return "Limousine";
  if(code === "WHEELCHAIR") return "Wheelchair";
  if(code === "SHARED") return "Shared";

  return service?.title || service?.name || service?.serviceName || code;
}

function getServiceSuffix(service){
  const code = getServiceCode(service);

  if(code === "STANDARD") return "ST";
  if(code === "WHEELCHAIR") return "WH";
  if(code === "SHARED") return "SH";
  if(code === "LIMO") return "LM";
  if(code === "TAXI") return "TX";
  if(code === "XL") return "XL";

  return service?.companySuffix || service?.suffix || "ST";
}

function serviceVisible(service){
  return service?.enabled === true || service?.companyEnabled === true;
}

function isSharedService(service){
  return getServiceCode(service) === "SHARED";
}

/* ================= TIMEZONE ================= */

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

/* ================= HEADER / REVIEW PAGE ================= */

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
        Dispatch Review (${pendingTrips.length})
      </button>
    </div>
  `;

  container.insertBefore(header, container.firstChild);

  document.getElementById("backToHubBtn").onclick = ()=>{
    window.location.href = "/admin/trips-hub.html";
  };

  document.getElementById("showAddBtn").onclick = showAddPage;
  document.getElementById("showReviewBtn").onclick = showReviewPage;
}

function updateReviewCounter(){
  const btn = document.getElementById("showReviewBtn");
  if(btn){
    btn.innerText = `Dispatch Review (${pendingTrips.length})`;
  }
}

function buildReviewPage(){
  if(document.getElementById("dispatchReviewPage")) return;

  const container = document.querySelector(".container");
  if(!container) return;

  const review = document.createElement("div");
  review.id = "dispatchReviewPage";
  review.style.display = "none";
  review.innerHTML = `
    <section style="background:#fff;border:1px solid #dbe3ee;border-radius:16px;padding:16px;">
      <h3 style="margin-top:0;">Dispatch Review</h3>
      <div id="dispatchReviewList"></div>
      <div class="actions" style="margin-top:14px;">
        <button id="backToAddFromReview" type="button" class="btn-orange">Back To Add Trip</button>
      </div>
    </section>
  `;

  container.appendChild(review);

  document.getElementById("backToAddFromReview").onclick = showAddPage;
}

function showAddPage(){
  const page = document.getElementById("dispatchReviewPage");
  if(page) page.style.display = "none";

  if(companyTabs) companyTabs.style.display = "flex";

  if(activeService && isSharedService(activeService)){
    if(individualSection) individualSection.style.display = "none";
    if(sharedSection) sharedSection.style.display = "block";
  }else{
    if(individualSection) individualSection.style.display = "block";
    if(sharedSection) sharedSection.style.display = "none";
  }
}

function showReviewPage(){
  if(companyTabs) companyTabs.style.display = "none";
  if(individualSection) individualSection.style.display = "none";
  if(sharedSection) sharedSection.style.display = "none";

  const page = document.getElementById("dispatchReviewPage");
  if(page) page.style.display = "block";

  renderPendingReview();
}

/* ================= ENTRY INFO ================= */

function loadEntryInfo(){
  const saved = JSON.parse(localStorage.getItem("dispatchEntryInfo") || "{}");

  if(entryName) entryName.value = saved.entryName || "";
  if(entryPhone) entryPhone.value = saved.entryPhone || "";
  if(sharedEntryName) sharedEntryName.value = saved.entryName || "";
  if(sharedEntryPhone) sharedEntryPhone.value = saved.entryPhone || "";
}

function saveEntryInfo(){
  const data = {
    entryName: entryName?.value || sharedEntryName?.value || "",
    entryPhone: entryPhone?.value || sharedEntryPhone?.value || ""
  };

  localStorage.setItem("dispatchEntryInfo", JSON.stringify(data));

  if(entryName) entryName.value = data.entryName;
  if(entryPhone) entryPhone.value = data.entryPhone;
  if(sharedEntryName) sharedEntryName.value = data.entryName;
  if(sharedEntryPhone) sharedEntryPhone.value = data.entryPhone;

  showAlert("Entry Info Saved ✔");
}

let entryEditMode = false;

function toggleEntryEdit(){
  if(!entryEditMode){
    entryEditMode = true;

    entryName?.removeAttribute("readonly");
    entryPhone?.removeAttribute("readonly");
    sharedEntryName?.removeAttribute("readonly");
    sharedEntryPhone?.removeAttribute("readonly");

    if(editEntryBtn) editEntryBtn.innerText = "Save";
    if(editSharedEntryBtn) editSharedEntryBtn.innerText = "Save";

    entryName?.focus();
    return;
  }

  saveEntryInfo();

  entryEditMode = false;

  entryName?.setAttribute("readonly", true);
  entryPhone?.setAttribute("readonly", true);
  sharedEntryName?.setAttribute("readonly", true);
  sharedEntryPhone?.setAttribute("readonly", true);

  if(editEntryBtn) editEntryBtn.innerText = "Edit";
  if(editSharedEntryBtn) editSharedEntryBtn.innerText = "Edit";
}

editEntryBtn?.addEventListener("click", toggleEntryEdit);
editSharedEntryBtn?.addEventListener("click", toggleEntryEdit);
saveEntryBtn?.addEventListener("click", saveEntryInfo);

/* ================= VALIDATION ================= */

function validateIndividualTrip(){
  if(!normalizeText(entryName?.value)) return showAlert("Entry Name Required"), false;
  if(!normalizeText(entryPhone?.value)) return showAlert("Entry Phone Required"), false;
  if(!normalizeText(clientName?.value)) return showAlert("Client Name Required"), false;
  if(!normalizeText(clientPhone?.value)) return showAlert("Client Phone Required"), false;
  if(!normalizeText(pickupInput?.value)) return showAlert("Pickup Required"), false;
  if(!normalizeText(dropoffInput?.value)) return showAlert("Dropoff Required"), false;
  if(!tripDate?.value) return showAlert("Trip Date Required"), false;
  if(!tripTime?.value) return showAlert("Trip Time Required"), false;

  const dt = new Date(`${tripDate.value}T${tripTime.value}:00`);
  if(dt <= getSystemNow()) return showAlert("Trip Date/Time Already Passed"), false;

  return true;
}

function validateSharedTrip(){
  if(!normalizeText(sharedEntryName?.value)) return showAlert("Entry Name Required"), false;
  if(!normalizeText(sharedEntryPhone?.value)) return showAlert("Entry Phone Required"), false;
  if(!sharedDate?.value) return showAlert("Trip Date Required"), false;
  if(!sharedTime?.value) return showAlert("Trip Time Required"), false;

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

/* ================= SERVICES ================= */

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
        unique.set(code, service);
      }
    });

    SERVICES = [...unique.values()];

    if(!SERVICES.length){
      SERVICES = [{
        serviceKey:"STANDARD",
        title:"Standard",
        suffix:"ST",
        enabled:true
      }];
    }

    buildServiceTabs();

  }catch(err){
    console.log(err);

    SERVICES = [{
      serviceKey:"STANDARD",
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

  companyTabs?.querySelectorAll("button").forEach(btn=>{
    btn.classList.remove("btn-blue");
    btn.classList.add("btn-gray");
  });

  const btn = companyTabs?.querySelectorAll("button")[index];
  if(btn){
    btn.classList.remove("btn-gray");
    btn.classList.add("btn-blue");
  }

  if(isSharedService(service)){
    if(individualSection) individualSection.style.display = "none";
    if(sharedSection) sharedSection.style.display = "block";
  }else{
    if(individualSection) individualSection.style.display = "block";
    if(sharedSection) sharedSection.style.display = "none";
  }
}

/* ================= INDIVIDUAL FORM ================= */

function createStopInput(value=""){
  const currentStops = stopsBox?.querySelectorAll(".stop-input").length || 0;

  if(currentStops >= 5){
    showAlert("Maximum 5 stops allowed.");
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "stop-row";
  wrapper.innerHTML = `
    <input type="text" class="stop-input" placeholder="Stop address" value="${String(value).replace(/"/g,"&quot;")}">
    <button type="button" class="remove-stop-btn">✕</button>
  `;

  wrapper.querySelector(".remove-stop-btn").onclick = ()=>wrapper.remove();
  stopsBox?.appendChild(wrapper);
}

addStopBtn?.addEventListener("click",()=>createStopInput());

function clearIndividualForm(){
  if(clientName) clientName.value = "";
  if(clientPhone) clientPhone.value = "";
  if(pickupInput) pickupInput.value = "";
  if(dropoffInput) dropoffInput.value = "";
  if(tripDate) tripDate.value = "";
  if(tripTime) tripTime.value = "";
  if(notes) notes.value = "";
  if(stopsBox) stopsBox.innerHTML = "";
  editIndex = null;

  if(submitTripBtn) submitTripBtn.innerText = "Add To Review";
}

/* ================= SHARED FORM ================= */

function renderSharedPassengers(count){
  if(!passengersContainer) return;

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

function clearSharedForm(){
  if(passengerCount) passengerCount.value = "";
  if(sharedDate) sharedDate.value = "";
  if(sharedTime) sharedTime.value = "";
  if(sharedNotes) sharedNotes.value = "";
  if(passengersContainer) passengersContainer.innerHTML = "";
  editIndex = null;

  if(submitSharedBtn) submitSharedBtn.innerText = "Add Shared To Review";
}

/* ================= BUILD PAYLOADS ================= */

function buildIndividualReviewTrip(){
  const stops = [...document.querySelectorAll(".stop-input")]
    .map(i=>normalizeText(i.value))
    .filter(Boolean);

  const serviceCode = getServiceCode(activeService);
  const suffix = getServiceSuffix(activeService);

  return {
    localId: makeLocalId(),

    type:"reserved",
    reservation:true,
    source:"RV",
    bookingSource:"RV",
    reviewOnly:true,

    tripType:"INDIVIDUAL",
    isShared:false,

    serviceKey:serviceCode,
    serviceType:serviceCode,
    serviceCode:serviceCode,
    serviceSuffix:suffix,
    serviceTitle:getServiceTitle(activeService),

    entryName:normalizeText(entryName.value),
    entryPhone:normalizeText(entryPhone.value),

    clientName:normalizeText(clientName.value),
    clientPhone:normalizeText(clientPhone.value),

    pickup:normalizeText(pickupInput.value),
    dropoff:normalizeText(dropoffInput.value),
    stops,

    tripDate:tripDate.value,
    tripTime:tripTime.value,
    notes:normalizeText(notes.value),

    status:"Review",
    dispatchSelected:false,
    disabled:false
  };
}

function buildSharedReviewTrip(){
  const passengers = [];

  document.querySelectorAll(".passenger-card").forEach((card,index)=>{
    passengers.push({
      passengerId:"P" + (index + 1),
      clientName:normalizeText(card.querySelector(".sharedClientName")?.value),
      clientPhone:normalizeText(card.querySelector(".sharedClientPhone")?.value),
      pickup:normalizeText(card.querySelector(".sharedPickup")?.value),
      dropoff:normalizeText(card.querySelector(".sharedDropoff")?.value),
      status:"Scheduled",
      priceAmount:0,
      finalPrice:0,
      cancelFee:0,
      noShowFee:0
    });
  });

  return {
    localId: makeLocalId(),

    type:"reserved",
    reservation:true,
    source:"RV",
    bookingSource:"RV",
    reviewOnly:true,

    isShared:true,
    tripType:"SHARED",

    serviceKey:"SHARED",
    serviceType:"SHARED",
    serviceCode:"SHARED",
    serviceSuffix:"SH",
    serviceTitle:"Shared",

    entryName:normalizeText(sharedEntryName.value),
    entryPhone:normalizeText(sharedEntryPhone.value),

    passengers,
    passengerCount:passengers.length,
    passengersCount:passengers.length,
    totalPassengers:passengers.length,

    pickup:passengers[0]?.pickup || "",
    dropoff:passengers[passengers.length - 1]?.dropoff || "",
    stops:passengers.slice(1,-1).map(p=>p.pickup).filter(Boolean),

    tripDate:sharedDate.value,
    tripTime:sharedTime.value,
    notes:normalizeText(sharedNotes.value),

    status:"Review",
    dispatchSelected:false,
    disabled:false
  };
}

/* ================= ADD TO REVIEW ================= */

submitTripBtn?.addEventListener("click", async function(){
  if(!activeService) return showAlert("Select Service");
  if(isSharedService(activeService)) return showAlert("Use Shared Form");
  if(!validateIndividualTrip()) return;

  const trip = buildIndividualReviewTrip();

const res = await fetch(API_URL,{
  method:"POST",
  headers:{
    "Content-Type":"application/json",
    Authorization:"Bearer " + token
  },
body:JSON.stringify({
  ...trip,
  status:"Review",
  reservationStatus:"Review",
  reviewOnly:true
})
});

const data = await res.json().catch(()=>({}));

if(!res.ok){
  throw new Error(data.message || "Create trip failed");
}

const createdTrip = data.trip || data.data || data;

pendingTrips.push({
  ...createdTrip,
  localId: createdTrip._id || createdTrip.id || makeLocalId()
});

saveReview();
  updateReviewCounter();
  renderPendingReview();

  clearIndividualForm();
  localStorage.removeItem("dispatchTripDraft");

  showAlert("Trip Added To Dispatch Review ✔");
});

submitSharedBtn?.addEventListener("click", async function(){
  if(!activeService) return showAlert("Select Service");
  if(!validateSharedTrip()) return;

  const trip = buildSharedReviewTrip();

 const res = await fetch(API_URL,{
  method:"POST",
  headers:{
    "Content-Type":"application/json",
    Authorization:"Bearer " + token
  },
body:JSON.stringify({
  ...trip,
  status:"Review",
  reservationStatus:"Review",
  reviewOnly:true
})
});

const data = await res.json().catch(()=>({}));

if(!res.ok){
  throw new Error(data.message || "Create shared trip failed");
}

const createdTrip = data.trip || data.data || data;

pendingTrips.push({
  ...createdTrip,
  localId: createdTrip._id || createdTrip.id || makeLocalId()
});

saveReview();
  updateReviewCounter();
  renderPendingReview();

  clearSharedForm();
  localStorage.removeItem("dispatchSharedDraft");

  showAlert("Shared Trip Added To Dispatch Review ✔");
});

/* ================= REVIEW ACTIONS ================= */

function renderPendingReview(){
  const box = document.getElementById("dispatchReviewList");
  if(!box) return;

  updateReviewCounter();

  if(!pendingTrips.length){
    box.innerHTML = `<div style="font-weight:900;color:#64748b;">No trips in review yet.</div>`;
    return;
  }

  box.innerHTML = pendingTrips.map((t,i)=>{
    const isShared = t.isShared === true;

    const passengersHtml = isShared
      ? `
        <div style="margin-top:8px;">
          ${(t.passengers || []).map((p,idx)=>`
            <div style="padding:6px 0;border-top:1px dashed #dbe3ee;">
              <b>P${idx + 1}</b> ${p.clientName || "-"} / ${p.clientPhone || "-"}<br>
              ${p.pickup || "-"} → ${p.dropoff || "-"}
            </div>
          `).join("")}
        </div>
      `
      : "";

    return `
      <div style="background:#f8fafc;border:1px solid #dbe3ee;border-radius:12px;padding:12px;margin-bottom:10px;">
        <b>${i + 1}. ${isShared ? "Shared RV" : "Individual RV"} - ${t.serviceTitle || t.serviceType || "-"}</b><br>
        <b>Date:</b> ${t.tripDate || "-"} |
        <b>Time:</b> ${t.tripTime || "-"}<br>
        <b>Entry:</b> ${t.entryName || "-"} / ${t.entryPhone || "-"}<br>
        ${
          isShared
            ? `<b>Passengers:</b> ${(t.passengers || []).length}`
            : `<b>Client:</b> ${t.clientName || "-"} / ${t.clientPhone || "-"}<br>
               <b>Route:</b> ${t.pickup || "-"} → ${t.dropoff || "-"}`
        }
        ${passengersHtml}

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button type="button" onclick="editPendingTrip(${i})" style="background:#2563eb;color:#fff;">
            Edit
          </button>
          <button type="button" onclick="createTripFromReview(${i})" style="background:#16a34a;color:#fff;">
            Confirm
          </button>
          <button type="button" onclick="deletePendingTrip(${i})" style="background:#ef4444;color:#fff;">
            Delete
          </button>
        </div>
      </div>
    `;
  }).join("");
}

window.deletePendingTrip = function(index){
  if(!confirm("Delete this review trip?")) return;

  pendingTrips.splice(index,1);
  saveReview();
  renderPendingReview();
};

window.editPendingTrip = function(index){
  const trip = pendingTrips[index];
  if(!trip) return;

  editIndex = index;

  const serviceIndex = SERVICES.findIndex(s=>{
    return getServiceCode(s) === normalizeCode(trip.serviceKey || trip.serviceType);
  });

  if(serviceIndex >= 0){
    setActiveService(SERVICES[serviceIndex], serviceIndex);
  }

  if(trip.isShared){
    showAddPage();

    if(sharedEntryName) sharedEntryName.value = trip.entryName || "";
    if(sharedEntryPhone) sharedEntryPhone.value = trip.entryPhone || "";
    if(passengerCount) passengerCount.value = trip.passengers?.length || 2;
    if(sharedDate) sharedDate.value = trip.tripDate || "";
    if(sharedTime) sharedTime.value = trip.tripTime || "";
    if(sharedNotes) sharedNotes.value = trip.notes || "";

    renderSharedPassengers(trip.passengers?.length || 2);

    const cards = document.querySelectorAll(".passenger-card");
    (trip.passengers || []).forEach((p,i)=>{
      const card = cards[i];
      if(!card) return;

      card.querySelector(".sharedClientName").value = p.clientName || "";
      card.querySelector(".sharedClientPhone").value = p.clientPhone || "";
      card.querySelector(".sharedPickup").value = p.pickup || "";
      card.querySelector(".sharedDropoff").value = p.dropoff || "";
    });

    if(submitSharedBtn) submitSharedBtn.innerText = "Update Review Trip";
  }else{
    showAddPage();

    if(entryName) entryName.value = trip.entryName || "";
    if(entryPhone) entryPhone.value = trip.entryPhone || "";
    if(clientName) clientName.value = trip.clientName || "";
    if(clientPhone) clientPhone.value = trip.clientPhone || "";
    if(pickupInput) pickupInput.value = trip.pickup || "";
    if(dropoffInput) dropoffInput.value = trip.dropoff || "";
    if(tripDate) tripDate.value = trip.tripDate || "";
    if(tripTime) tripTime.value = trip.tripTime || "";
    if(notes) notes.value = trip.notes || "";

    if(stopsBox) stopsBox.innerHTML = "";
    (trip.stops || []).forEach(stop=>createStopInput(stop));

    if(submitTripBtn) submitTripBtn.innerText = "Update Review Trip";
  }
};

window.createTripFromReview = async function(index){
  const trip = pendingTrips[index];
  if(!trip) return;

  const tripId = trip._id || trip.id;

  if(!tripId){
    return showAlert("Trip ID missing. This trip was not created in database.");
  }

  if(!confirm("Confirm this RV trip?")) return;

  try{
    const res = await fetch(`${API_URL}/${tripId}`,{
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:JSON.stringify({
        status:"Confirmed",
        reservationStatus:"RV",
        dispatchSelected:false,
        driverAssigned:false,
        disabled:false
      })
    });

    const data = await res.json().catch(()=>({}));

    if(!res.ok){
      throw new Error(data.message || "Confirm trip failed");
    }

    pendingTrips.splice(index,1);
    saveReview();
    renderPendingReview();

    showAlert("Trip Confirmed And Sent To Trips Hub ✔");

  }catch(err){
    console.error(err);
    showAlert(err.message || "Confirm failed");
  }
};

/* ================= DRAFTS ================= */

saveDraftBtn?.addEventListener("click",()=>{
  const draft = {
    serviceKey:getServiceCode(activeService),
    clientName:clientName?.value || "",
    clientPhone:clientPhone?.value || "",
    pickup:pickupInput?.value || "",
    dropoff:dropoffInput?.value || "",
    tripDate:tripDate?.value || "",
    tripTime:tripTime?.value || "",
    notes:notes?.value || "",
    stops:[...document.querySelectorAll(".stop-input")].map(i=>i.value)
  };

  localStorage.setItem("dispatchTripDraft", JSON.stringify(draft));
  showAlert("Draft Saved ✔");
});

saveSharedDraftBtn?.addEventListener("click",()=>{
  const passengers = [];

  document.querySelectorAll(".passenger-card").forEach(card=>{
    passengers.push({
      clientName:card.querySelector(".sharedClientName")?.value || "",
      clientPhone:card.querySelector(".sharedClientPhone")?.value || "",
      pickup:card.querySelector(".sharedPickup")?.value || "",
      dropoff:card.querySelector(".sharedDropoff")?.value || ""
    });
  });

  localStorage.setItem("dispatchSharedDraft", JSON.stringify({
    passengerCount: passengerCount?.value || "",
    sharedDate: sharedDate?.value || "",
    sharedTime: sharedTime?.value || "",
    sharedNotes: sharedNotes?.value || "",
    entryName: sharedEntryName?.value || "",
    entryPhone: sharedEntryPhone?.value || "",
    passengers
  }));

  showAlert("Shared Draft Saved ✔");
});

function loadDrafts(){
  const draft = JSON.parse(localStorage.getItem("dispatchTripDraft") || "{}");

  if(clientName) clientName.value = draft.clientName || "";
  if(clientPhone) clientPhone.value = draft.clientPhone || "";
  if(pickupInput) pickupInput.value = draft.pickup || "";
  if(dropoffInput) dropoffInput.value = draft.dropoff || "";
  if(tripDate) tripDate.value = draft.tripDate || "";
  if(tripTime) tripTime.value = draft.tripTime || "";
  if(notes) notes.value = draft.notes || "";

  (draft.stops || []).forEach(stop=>createStopInput(stop));

  const sharedDraft = JSON.parse(localStorage.getItem("dispatchSharedDraft") || "{}");

  if(sharedDraft.entryName && sharedEntryName) sharedEntryName.value = sharedDraft.entryName;
  if(sharedDraft.entryPhone && sharedEntryPhone) sharedEntryPhone.value = sharedDraft.entryPhone;
  if(passengerCount) passengerCount.value = sharedDraft.passengerCount || "";
  if(sharedDate) sharedDate.value = sharedDraft.sharedDate || "";
  if(sharedTime) sharedTime.value = sharedDraft.sharedTime || "";
  if(sharedNotes) sharedNotes.value = sharedDraft.sharedNotes || "";

  if(sharedDraft.passengerCount){
    renderSharedPassengers(Number(sharedDraft.passengerCount));

    const cards = document.querySelectorAll(".passenger-card");

    (sharedDraft.passengers || []).forEach((p,index)=>{
      const card = cards[index];
      if(!card) return;

      card.querySelector(".sharedClientName").value = p.clientName || "";
      card.querySelector(".sharedClientPhone").value = p.clientPhone || "";
      card.querySelector(".sharedPickup").value = p.pickup || "";
      card.querySelector(".sharedDropoff").value = p.dropoff || "";
    });
  }
}

/* ================= INIT ================= */

buildTopHeader();
buildReviewPage();

loadEntryInfo();
loadDrafts();

await loadSystemTimezone();
await loadAdminServices();

renderPendingReview();

});