/* =====================================================
FILE: add-trip.js
FINAL COMPLETE VERSION
Facility Override First
Service Code Fixed From Company Suffix
Address Lat/Lng Save Fixed
- Saves pickup/dropoff/stops as address objects with lat/lng
- Saves shared passenger pickup/dropoff as address objects with lat/lng
- Uses Google Places Autocomplete when available
- Prevents submit if address is typed only and no lat/lng selected
===================================================== */

document.addEventListener("DOMContentLoaded", function(){

const token =
  localStorage.getItem("token");

const role =
  localStorage.getItem("role");

const companyName =
  localStorage.getItem("name") || "";

const companyId =
  localStorage.getItem("facilityId") ||
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

let activeService = "ST";
let activeSuffix  = "ST";

let SYSTEM_TIMEZONE = "America/Phoenix";

/*
  IMPORTANT:
  These variables store the Google Places result selected by the user.
  Inputs alone only contain text. These objects carry lat/lng.
*/

let pickupPoint = null;
let dropoffPoint = null;

const stopPoints =
  new WeakMap();

const sharedPickupPoints =
  new WeakMap();

const sharedDropoffPoints =
  new WeakMap();

/* ================= BILLING ================= */

async function checkBillingLock(){

  try{

    const res =
      await fetch(
        "/api/company/billing?company=" + encodeURIComponent(companyName),
        {
          headers:{
            Authorization:"Bearer " + token
          }
        }
      );

    const data =
      await res.json();

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

const ok =
  await checkBillingLock();

if(!ok) return;

/* ================= ELEMENTS ================= */

const companyTabs =
  document.getElementById("companyTabs");

const individualSection =
  document.getElementById("individualSection");

const sharedSection =
  document.getElementById("sharedSection");

const entryName =
  document.getElementById("entryName");

const entryPhone =
  document.getElementById("entryPhone");

const editEntryBtn =
  document.getElementById("editEntryBtn");

const saveEntryBtn =
  document.getElementById("saveEntryBtn");

const saveDraftBtn =
  document.getElementById("saveDraftBtn");

const clientName =
  document.getElementById("clientName");

const clientPhone =
  document.getElementById("clientPhone");

const pickupInput =
  document.getElementById("pickup");

const dropoffInput =
  document.getElementById("dropoff");

const tripDate =
  document.getElementById("tripDate");

const tripTime =
  document.getElementById("tripTime");

const notes =
  document.getElementById("notes");

const stopsBox =
  document.getElementById("stops");

const addStopBtn =
  document.getElementById("addStopBtn");

const submitTripBtn =
  document.getElementById("submitTrip");

const sharedEntryName =
  document.getElementById("sharedEntryName");

const sharedEntryPhone =
  document.getElementById("sharedEntryPhone");

const editSharedEntryBtn =
  document.getElementById("editSharedEntryBtn");

const passengerCount =
  document.getElementById("passengerCount");

const sharedDate =
  document.getElementById("sharedDate");

const sharedTime =
  document.getElementById("sharedTime");

const sharedNotes =
  document.getElementById("sharedNotes");

const passengersContainer =
  document.getElementById("passengersContainer");

const submitSharedBtn =
  document.getElementById("submitShared");

const saveSharedDraftBtn =
  document.getElementById("saveSharedDraftBtn");

/* ================= HELPERS ================= */

function normalizeText(v){
  return String(v ?? "").trim();
}

function showAlert(msg){
  alert(msg);
}

function bool(v){
  return (
    v === true ||
    String(v).toLowerCase() === "true" ||
    String(v).toLowerCase() === "yes" ||
    String(v).toLowerCase() === "1"
  );
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function cleanNumberOrNull(v){

  if(v === "" || v === null || v === undefined){
    return null;
  }

  const n =
    Number(v);

  return Number.isFinite(n)
    ? n
    : null;
}

function hasValidLatLng(point){

  if(!point) return false;

  const lat =
    cleanNumberOrNull(
      point.lat ??
      point.latitude
    );

  const lng =
    cleanNumberOrNull(
      point.lng ??
      point.longitude
    );

  return (
    lat !== null &&
    lng !== null
  );
}

function normalizeAddressPoint(point){

  if(!point){
    return {
      address:"",
      fullAddress:"",
      lat:null,
      lng:null,
      latitude:null,
      longitude:null,
      placeId:"",
      city:"",
      state:"",
      zip:""
    };
  }

  const address =
    normalizeText(
      point.address ||
      point.fullAddress ||
      point.formattedAddress ||
      point.formatted_address ||
      point.name ||
      ""
    );

  const lat =
    cleanNumberOrNull(
      point.lat ??
      point.latitude
    );

  const lng =
    cleanNumberOrNull(
      point.lng ??
      point.longitude
    );

  return {
    address,
    fullAddress:
      normalizeText(point.fullAddress) ||
      address,

    lat,
    lng,

    latitude:
      lat,
    longitude:
      lng,

    placeId:
      normalizeText(
        point.placeId ||
        point.place_id ||
        ""
      ),

    city:
      normalizeText(point.city),

    state:
      normalizeText(point.state),

    zip:
      normalizeText(
        point.zip ||
        point.postalCode ||
        point.postal_code ||
        ""
      )
  };
}

function buildAddressPoint(input, savedPoint){

  const address =
    normalizeText(input?.value);

  const normalized =
    normalizeAddressPoint(savedPoint || {});

  return {
    address,
    fullAddress:
      address,

    lat:
      normalized.lat,

    lng:
      normalized.lng,

    latitude:
      normalized.latitude,

    longitude:
      normalized.longitude,

    placeId:
      normalized.placeId,

    city:
      normalized.city,

    state:
      normalized.state,

    zip:
      normalized.zip
  };
}

function getGoogleAddressComponent(place,type,shortName=false){

  const components =
    place?.address_components || [];

  const found =
    components.find(c =>
      Array.isArray(c.types) &&
      c.types.includes(type)
    );

  if(!found){
    return "";
  }

  return shortName
    ? found.short_name || found.long_name || ""
    : found.long_name || found.short_name || "";
}

function extractGoogleAddress(place){

  const loc =
    place?.geometry?.location;

  const lat =
    loc && typeof loc.lat === "function"
      ? loc.lat()
      : null;

  const lng =
    loc && typeof loc.lng === "function"
      ? loc.lng()
      : null;

  const address =
    normalizeText(
      place?.formatted_address ||
      place?.name ||
      ""
    );

  return normalizeAddressPoint({
    address,
    fullAddress:address,
    lat,
    lng,
    placeId:place?.place_id || "",
    city:
      getGoogleAddressComponent(place,"locality") ||
      getGoogleAddressComponent(place,"sublocality") ||
      getGoogleAddressComponent(place,"administrative_area_level_2"),
    state:
      getGoogleAddressComponent(place,"administrative_area_level_1",true),
    zip:
      getGoogleAddressComponent(place,"postal_code")
  });
}

function googlePlacesReady(){

  return (
    window.google &&
    google.maps &&
    google.maps.places &&
    typeof google.maps.places.Autocomplete === "function"
  );
}

function attachAutocomplete(input,onSelect){

  if(!input){
    return false;
  }

  if(!googlePlacesReady()){

    console.warn(
      "Google Places Autocomplete not loaded. Address lat/lng cannot be selected from this file."
    );

    return false;
  }

  const autocomplete =
    new google.maps.places.Autocomplete(
      input,
      {
        fields:[
          "formatted_address",
          "geometry",
          "place_id",
          "address_components",
          "name"
        ],
        componentRestrictions:{
          country:"us"
        }
      }
    );

  autocomplete.addListener("place_changed",()=>{

    const place =
      autocomplete.getPlace();

    const point =
      extractGoogleAddress(place);

    if(point.address){
      input.value = point.address;
    }

    if(hasValidLatLng(point)){
      onSelect(point);
      input.dataset.hasLatLng = "1";
    }else{
      onSelect(null);
      input.dataset.hasLatLng = "";
      showAlert("Selected address has no lat/lng. Please choose another address from suggestions.");
    }
  });

  input.addEventListener("input",()=>{
    onSelect(null);
    input.dataset.hasLatLng = "";
  });

  input.dataset.autocompleteAttached = "1";

  return true;
}

function restoreAddressInput(input,point,setter){

  const p =
    normalizeAddressPoint(point);

  if(input){
    input.value =
      p.address || "";
  }

  if(hasValidLatLng(p)){
    setter(p);
    if(input) input.dataset.hasLatLng = "1";
  }else{
    setter(null);
    if(input) input.dataset.hasLatLng = "";
  }
}

function normalizeServiceCode(v){

  const c =
    normalizeText(v)
      .toUpperCase()
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(!c) return "";

  if(c === "STANDARD" || c === "ST") return "ST";

  if(
    c === "WHEELCHAIR" ||
    c === "WHEEL CHAIR" ||
    c === "WC" ||
    c === "WH"
  ){
    return "WH";
  }

  if(c === "SHARED" || c === "SHARE" || c === "SH") return "SH";
  if(c === "LIMO" || c === "LIMOUSINE" || c === "LM") return "LM";
  if(c === "TAXI" || c === "TX") return "TX";
  if(c === "XL") return "XL";

  return c;
}

function isValidServiceCode(code){

  return [
    "ST",
    "WH",
    "XL",
    "LM",
    "TX",
    "SH"
  ].includes(
    normalizeServiceCode(code)
  );
}

function resolveServiceCode(service){

  if(!service) return "";

  const directFields = [

    service.companySuffix,
    service.serviceSuffix,
    service.suffix,

    service.reservedSuffix,
    service.getQuoteSuffix,

    service.companyServiceSuffix,
    service.facilitySuffix,
    service.facilityServiceSuffix,

    service.companyServiceCode,
    service.serviceCode,
    service.code,

    service.companyServiceKey,
    service.serviceKey,
    service.serviceType,

    service.vehicle
  ];

  for(const field of directFields){

    const code =
      normalizeServiceCode(field);

    if(isValidServiceCode(code)){
      return code;
    }
  }

  const name =
    normalizeServiceCode(
      service.serviceName ||
      service.title ||
      service.name ||
      ""
    );

  if(name.includes("WHEEL")) return "WH";
  if(name.includes("CHAIR")) return "WH";
  if(name.includes("SHARED")) return "SH";
  if(name.includes("LIMO")) return "LM";
  if(name.includes("TAXI")) return "TX";
  if(name.includes("XL")) return "XL";
  if(name.includes("STANDARD")) return "ST";

  return "";
}

function serviceDisplayName(service,code){

  return (
    service?.serviceName ||
    service?.title ||
    service?.name ||
    (
      code === "ST" ? "Standard" :
      code === "WH" ? "Wheelchair" :
      code === "XL" ? "XL" :
      code === "LM" ? "Limo" :
      code === "TX" ? "Taxi" :
      code === "SH" ? "Shared" :
      code || "Service"
    )
  );
}

async function loadSystemTimezone(){

  try{

    const res =
      await fetch("/api/system-design");

    const data =
      await res.json();

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

  const code =
    normalizeServiceCode(activeService);

  return COMPANY_SERVICES.find(s => {

    const serviceCode =
      resolveServiceCode(s);

    return serviceCode === code;

  }) || {};
}

function isSharedService(service){

  if(!service) return false;

  const code =
    resolveServiceCode(service);

  const key =
    normalizeServiceCode(service.serviceKey);

  const suffix =
    normalizeServiceCode(
      service.companySuffix ||
      service.suffix ||
      service.serviceSuffix ||
      service.reservedSuffix ||
      service.getQuoteSuffix
    );

  const title =
    normalizeServiceCode(
      service.title ||
      service.name ||
      service.serviceName
    );

  const pricing =
    normalizeServiceCode(
      service.companyPricingMode ||
      service.reservedPricingMode ||
      service.pricingMode
    );

  return (
    service.companyShared === true ||
    service.reservedShared === true ||
    service.shared === true ||
    code === "SH" ||
    key === "SH" ||
    suffix === "SH" ||
    title === "SH" ||
    title === "SHARED" ||
    pricing === "SH" ||
    pricing === "SHARED"
  );
}

function mapFacilityOverrideService(s){

  const code =
    resolveServiceCode(s);

  if(!code){
    console.warn("FACILITY OVERRIDE SERVICE CODE MISSING:", s);
  }

  const finalCode =
    code || "ST";

  const serviceName =
    serviceDisplayName(s, finalCode);

  const shared =
    bool(s.shared) ||
    finalCode === "SH" ||
    normalizeServiceCode(s.pricingMode) === "SHARED";

  return {

    ...s,

    _id:
      finalCode,

    title:
      serviceName,

    name:
      serviceName,

    serviceName:
      serviceName,

    serviceKey:
      finalCode,

    serviceCode:
      finalCode,

    serviceType:
      finalCode,

    code:
      finalCode,

    companySuffix:
      finalCode,

    suffix:
      finalCode,

    serviceSuffix:
      finalCode,

    companyShared:
      shared,

    shared:
      shared,

    companyPricingMode:
      s.pricingMode || "MILE",

    companyBaseFare:
      num(s.baseFare),

    companyIncludedMiles:
      num(s.includedMiles),

    companyPerMile:
      num(s.perMile),

    companyHourlyRate:
      num(s.hourlyRate),

    companyHourlyBillingMode:
      s.hourlyBillingMode || "FULL",

    companyStopFee:
      num(s.stopFee),

    companyNoShowFee:
      num(s.noShowFee),

    companySharedPrice:
      num(s.sharedPrice),

    companyDisableCancel:
      bool(s.disableCancel),

    companyWarningMinutes:
      num(s.warningMinutes),

    companyCancelFee:
      num(s.cancelFee),

    companyAddStopEnabled:
      shared ? false : bool(s.addStopEnabled),

    companyAddStopCustomTimeEnabled:
      shared ? false : bool(s.addStopCustomTimeEnabled),

    companyAddStopCutoffMinutes:
      shared ? 0 : num(s.addStopCutoffMinutes),

    __pricingSource:
      "FACILITY_OVERRIDE"
  };
}

function mapServiceManagementService(s){

  const code =
    resolveServiceCode(s);

  if(!code){
    console.warn("SERVICE MANAGEMENT CODE MISSING:", s);
  }

  const finalCode =
    code || "ST";

  const serviceName =
    serviceDisplayName(s, finalCode);

  const shared =
    bool(s.companyShared) ||
    bool(s.reservedShared) ||
    bool(s.shared) ||
    finalCode === "SH" ||
    normalizeServiceCode(
      s.companyPricingMode ||
      s.reservedPricingMode ||
      s.pricingMode
    ) === "SHARED";

  return {

    ...s,

    title:
      serviceName,

    name:
      serviceName,

    serviceName:
      serviceName,

    serviceKey:
      finalCode,

    serviceCode:
      finalCode,

    serviceType:
      finalCode,

    code:
      finalCode,

    companySuffix:
      finalCode,

    suffix:
      finalCode,

    serviceSuffix:
      finalCode,

    companyShared:
      shared,

    shared:
      shared,

    __pricingSource:
      "SERVICE_MANAGEMENT"
  };
}

function selectedServicePayload(){

  const service =
    getCurrentServiceConfig();

  const serviceKey =
    resolveServiceCode(service) ||
    normalizeServiceCode(activeSuffix) ||
    normalizeServiceCode(activeService);

  if(!serviceKey){
    console.log("BAD SELECTED SERVICE:", service);
    showAlert("Service code missing");
    throw new Error("Service code missing");
  }

  const serviceName =
    serviceDisplayName(service, serviceKey);

  const fromOverride =
    service.__pricingSource === "FACILITY_OVERRIDE";

  return {
    service,

    serviceKey,
    serviceCode:serviceKey,
    serviceType:serviceKey,
    serviceSuffix:serviceKey,

    serviceName,

    serviceId:
      fromOverride
        ? ""
        : String(service._id || ""),

    pricingSource:
      fromOverride
        ? "FACILITY_OVERRIDE"
        : "SERVICE_MANAGEMENT",

    facilityOverrideActive:
      fromOverride
  };
}

/* ================= WARNING ================= */

function checkDynamicWarning(dateValue,timeValue){

  if(!dateValue || !timeValue){
    return true;
  }

  const service =
    getCurrentServiceConfig();

  const warningOn =
    service.companyDisableCancel !== true &&
    service.disableCancel !== true;

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

function validateAddressPoint(input,point,label){

  if(!normalizeText(input?.value)){
    showAlert(label + " Required");
    return false;
  }

  if(!hasValidLatLng(point)){
    showAlert(label + " must be selected from address suggestions so lat/lng can be saved.");
    return false;
  }

  return true;
}

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

  if(!validateAddressPoint(pickupInput,pickupPoint,"Pickup")){
    return false;
  }

  if(!validateAddressPoint(dropoffInput,dropoffPoint,"Dropoff")){
    return false;
  }

  const stopInputs =
    [...document.querySelectorAll(".stop-input")];

  for(let i = 0; i < stopInputs.length; i++){

    const stopInput =
      stopInputs[i];

    if(!normalizeText(stopInput.value)){
      continue;
    }

    const stopPoint =
      stopPoints.get(stopInput);

    if(!hasValidLatLng(stopPoint)){
      showAlert(`Stop ${i + 1} must be selected from address suggestions so lat/lng can be saved.`);
      return false;
    }
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
    showAlert("Trip Date/Time Already Passed");
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
    showAlert("Trip Date/Time Already Passed");
    return false;
  }

  const cards =
    document.querySelectorAll(".passenger-card");

  if(cards.length < 2){
    showAlert("Minimum 2 Passengers");
    return false;
  }

  for(const [index,card] of [...cards].entries()){

    if(!normalizeText(card.querySelector(".sharedClientName").value)){
      showAlert("Passenger Name Required");
      return false;
    }

    if(!normalizeText(card.querySelector(".sharedClientPhone").value)){
      showAlert("Passenger Phone Required");
      return false;
    }

    const pickupEl =
      card.querySelector(".sharedPickup");

    const dropoffEl =
      card.querySelector(".sharedDropoff");

    if(!validateAddressPoint(
      pickupEl,
      sharedPickupPoints.get(pickupEl),
      `Passenger ${index + 1} Pickup`
    )){
      return false;
    }

    if(!validateAddressPoint(
      dropoffEl,
      sharedDropoffPoints.get(dropoffEl),
      `Passenger ${index + 1} Dropoff`
    )){
      return false;
    }
  }

  return true;
}

/* ================= ENTRY ================= */

function loadEntryInfo(){

  const saved =
    JSON.parse(
      localStorage.getItem("entryInfo") || "{}"
    );

  entryName.value =
    saved.entryName || "";

  entryPhone.value =
    saved.entryPhone || "";

  sharedEntryName.value =
    saved.entryName || "";

  sharedEntryPhone.value =
    saved.entryPhone || "";
}

function saveEntryInfo(){

  localStorage.setItem(
    "entryInfo",
    JSON.stringify({
      entryName:entryName.value,
      entryPhone:entryPhone.value
    })
  );

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

  const draft =
    JSON.parse(
      localStorage.getItem("companyTripDraft") || "{}"
    );

  clientName.value =
    draft.clientName || "";

  clientPhone.value =
    draft.clientPhone || "";

  restoreAddressInput(
    pickupInput,
    draft.pickupPoint || draft.pickup,
    p => pickupPoint = p
  );

  restoreAddressInput(
    dropoffInput,
    draft.dropoffPoint || draft.dropoff,
    p => dropoffPoint = p
  );

  tripDate.value =
    draft.tripDate || "";

  tripTime.value =
    draft.tripTime || "";

  notes.value =
    draft.notes || "";
}

function saveDraft(){

  localStorage.setItem(
    "companyTripDraft",
    JSON.stringify({
      clientName:clientName.value,
      clientPhone:clientPhone.value,
      pickup:pickupInput.value,
      pickupPoint:buildAddressPoint(pickupInput,pickupPoint),
      dropoff:dropoffInput.value,
      dropoffPoint:buildAddressPoint(dropoffInput,dropoffPoint),
      tripDate:tripDate.value,
      tripTime:tripTime.value,
      notes:notes.value
    })
  );

  showAlert("Draft Saved ✔");
}

if(saveDraftBtn) saveDraftBtn.onclick = saveDraft;

function loadSharedDraft(){

  const draft =
    JSON.parse(
      localStorage.getItem("companySharedDraft") || "{}"
    );

  passengerCount.value =
    draft.passengerCount || "";

  sharedDate.value =
    draft.sharedDate || "";

  sharedTime.value =
    draft.sharedTime || "";

  sharedNotes.value =
    draft.sharedNotes || "";

  if(Number(draft.passengerCount) >= 2){

    renderSharedPassengers(
      Number(draft.passengerCount)
    );

    setTimeout(()=>{

      const cards =
        document.querySelectorAll(".passenger-card");

      (draft.passengers || []).forEach((p,index)=>{

        const card =
          cards[index];

        if(!card) return;

        card.querySelector(".sharedClientName").value =
          p.clientName || "";

        card.querySelector(".sharedClientPhone").value =
          p.clientPhone || "";

        const pickupEl =
          card.querySelector(".sharedPickup");

        const dropoffEl =
          card.querySelector(".sharedDropoff");

        restoreAddressInput(
          pickupEl,
          p.pickupPoint || p.pickup,
          point => {
            if(point) sharedPickupPoints.set(pickupEl,point);
            else sharedPickupPoints.delete(pickupEl);
          }
        );

        restoreAddressInput(
          dropoffEl,
          p.dropoffPoint || p.dropoff,
          point => {
            if(point) sharedDropoffPoints.set(dropoffEl,point);
            else sharedDropoffPoints.delete(dropoffEl);
          }
        );
      });

    },50);
  }
}

function saveSharedDraft(){

  const passengers = [];

  document.querySelectorAll(".passenger-card").forEach(card=>{

    const pickupEl =
      card.querySelector(".sharedPickup");

    const dropoffEl =
      card.querySelector(".sharedDropoff");

    passengers.push({
      clientName:card.querySelector(".sharedClientName").value,
      clientPhone:card.querySelector(".sharedClientPhone").value,
      pickup:pickupEl.value,
      pickupPoint:buildAddressPoint(
        pickupEl,
        sharedPickupPoints.get(pickupEl)
      ),
      dropoff:dropoffEl.value,
      dropoffPoint:buildAddressPoint(
        dropoffEl,
        sharedDropoffPoints.get(dropoffEl)
      )
    });
  });

  localStorage.setItem(
    "companySharedDraft",
    JSON.stringify({
      passengerCount:passengerCount.value,
      passengers,
      sharedDate:sharedDate.value,
      sharedTime:sharedTime.value,
      sharedNotes:sharedNotes.value
    })
  );

  showAlert("Shared Draft Saved ✔");
}

if(saveSharedDraftBtn) saveSharedDraftBtn.onclick = saveSharedDraft;

/* ================= SERVICES ================= */

function defaultStandardService(){

  return {
    serviceKey:"ST",
    serviceCode:"ST",
    serviceType:"ST",
    serviceSuffix:"ST",
    companySuffix:"ST",
    suffix:"ST",

    title:"Standard",
    name:"Standard",
    serviceName:"Standard",

    companyShared:false,
    shared:false,

    companyWarningMinutes:120,
    companyDisableCancel:false,

    __pricingSource:"DEFAULT"
  };
}

async function loadCompanyServices(){
  try{

    COMPANY_SERVICES = [];

    const facilityName =
      companyName || "";

    const facilityId =
      companyId || "";

    const bootRes =
      await fetch("/api/facility-pricing-override/bootstrap",{
        headers:{
          Authorization:"Bearer " + token
        }
      });

    const bootData =
      await bootRes.json().catch(()=>({}));

    console.log(
      "ADD TRIP FACILITY BOOTSTRAP RESULT:",
      bootData
    );

    let override = null;

    if(
      bootRes.ok &&
      bootData.success === true &&
      Array.isArray(bootData.overrides)
    ){

      const fid =
        String(facilityId || "").trim();

      const fname =
        String(facilityName || "")
          .trim()
          .toLowerCase();

      override =
        bootData.overrides.find(o=>{

          const oid =
            String(o.facilityId || "").trim();

          const oname =
            String(o.facilityName || "")
              .trim()
              .toLowerCase();

          return (
            (
              fid &&
              oid &&
              oid === fid
            ) ||
            (
              fname &&
              oname &&
              oname === fname
            )
          );

        }) || null;
    }

    if(
      override &&
      override.active === true &&
      Array.isArray(override.services) &&
      override.services.length
    ){

      COMPANY_SERVICES =
        override.services
          .map(mapFacilityOverrideService)
          .filter(s=>s.serviceKey);

      console.log(
        "ADD TRIP SERVICES FROM ACTIVE FACILITY OVERRIDE:",
        COMPANY_SERVICES
      );

      buildDynamicTabs();

      return;
    }

    const res =
      await fetch(
        "/api/services?company=true",
        {
          headers:{
            Authorization:"Bearer " + token
          }
        }
      );

    if(!res.ok){
      throw new Error("Failed loading services");
    }

    const data =
      await res.json().catch(()=>[]);

    COMPANY_SERVICES =
      Array.isArray(data)
        ? data.map(mapServiceManagementService)
        : [];

    console.log(
      "ADD TRIP SERVICES FROM SERVICE MANAGEMENT:",
      COMPANY_SERVICES
    );

    if(!COMPANY_SERVICES.length){
      COMPANY_SERVICES = [defaultStandardService()];
    }

    buildDynamicTabs();

  }catch(err){

    console.log("LOAD COMPANY SERVICES ERROR:", err);

    COMPANY_SERVICES = [defaultStandardService()];

    buildDynamicTabs();
  }
}

function setActiveService(service,index){

  activeService =
    resolveServiceCode(service);

  if(!activeService){
    showAlert("Service code missing");
    return;
  }

  activeSuffix =
    activeService;

  companyTabs.querySelectorAll("button").forEach(b=>{
    b.classList.remove("btn-blue");
    b.classList.add("btn-gray");
  });

  const btn =
    companyTabs.querySelectorAll("button")[index];

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

  console.log("ACTIVE SERVICE:", {
    activeService,
    activeSuffix,
    pricingSource:service.__pricingSource,
    warning:service.companyWarningMinutes,
    addStop:service.companyAddStopEnabled,
    rawService:service
  });
}

function buildDynamicTabs(){

  if(!companyTabs) return;

  companyTabs.innerHTML = "";

  COMPANY_SERVICES.forEach((service,index)=>{

    const btn =
      document.createElement("button");

    btn.type =
      "button";

    btn.innerText =
      service.title ||
      service.name ||
      service.serviceName ||
      service.serviceKey ||
      "Service";

    btn.className =
      index === 0
        ? "btn-blue"
        : "btn-gray";

    btn.onclick = ()=>{
      setActiveService(service,index);
    };

    companyTabs.appendChild(btn);
  });

  if(COMPANY_SERVICES.length > 0){
    setActiveService(COMPANY_SERVICES[0],0);
  }
}

/* ================= AUTOCOMPLETE INIT ================= */

function initBaseAutocompletes(){

  attachAutocomplete(
    pickupInput,
    p => pickupPoint = p
  );

  attachAutocomplete(
    dropoffInput,
    p => dropoffPoint = p
  );
}

/* ================= STOPS ================= */

function createStopInput(value="",savedPoint=null){

  const currentStops =
    stopsBox.querySelectorAll(".stop-input").length;

  if(currentStops >= 5){
    showAlert("Maximum 5 stops allowed.");
    return;
  }

  const wrapper =
    document.createElement("div");

  wrapper.className =
    "stop-row";

  wrapper.innerHTML = `
    <input
      type="text"
      class="stop-input"
      placeholder="Stop address"
      value=""
    >
    <button
      type="button"
      class="remove-stop-btn"
    >
      ✕
    </button>
  `;

  const stopInput =
    wrapper.querySelector(".stop-input");

  stopInput.value =
    normalizeText(
      typeof value === "string"
        ? value
        : value?.address || value?.fullAddress || ""
    );

  wrapper.querySelector(".remove-stop-btn").onclick = ()=>{
    stopPoints.delete(stopInput);
    wrapper.remove();
  };

  stopsBox.appendChild(wrapper);

  attachAutocomplete(
    stopInput,
    p => {
      if(p) stopPoints.set(stopInput,p);
      else stopPoints.delete(stopInput);
    }
  );

  restoreAddressInput(
    stopInput,
    savedPoint || value,
    p => {
      if(p) stopPoints.set(stopInput,p);
      else stopPoints.delete(stopInput);
    }
  );
}

if(addStopBtn){
  addStopBtn.onclick = ()=>createStopInput();
}

/* ================= SHARED PASSENGERS ================= */

function renderSharedPassengers(count){

  passengersContainer.innerHTML = "";

  if(count < 2) return;

  for(let i = 1; i <= count; i++){

    const card =
      document.createElement("div");

    card.className =
      "passenger-card";

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

    const sharedPickupInput =
      card.querySelector(".sharedPickup");

    const sharedDropoffInput =
      card.querySelector(".sharedDropoff");

    attachAutocomplete(
      sharedPickupInput,
      p => {
        if(p) sharedPickupPoints.set(sharedPickupInput,p);
        else sharedPickupPoints.delete(sharedPickupInput);
      }
    );

    attachAutocomplete(
      sharedDropoffInput,
      p => {
        if(p) sharedDropoffPoints.set(sharedDropoffInput,p);
        else sharedDropoffPoints.delete(sharedDropoffInput);
      }
    );
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
  }

  submitTripBtn.disabled = true;
  submitTripBtn.innerText = "Submitting...";

  try{

    const stops =
      [...document.querySelectorAll(".stop-input")]
        .map(input =>
          buildAddressPoint(
            input,
            stopPoints.get(input)
          )
        )
        .filter(p => p.address);

    const selected =
      selectedServicePayload();

    console.log("===== DEBUG SELECTED SERVICE BEFORE CREATE =====");
    console.log("activeService:", activeService);
    console.log("activeSuffix:", activeSuffix);
    console.log("selected:", selected);
    console.log("selected service object:", selected.service);
    console.log("===============================================");

    const pickup =
      buildAddressPoint(
        pickupInput,
        pickupPoint
      );

    const dropoff =
      buildAddressPoint(
        dropoffInput,
        dropoffPoint
      );

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

      serviceKey:selected.serviceKey,
      serviceCode:selected.serviceCode,
      serviceType:selected.serviceType,
      serviceSuffix:selected.serviceSuffix,
      serviceName:selected.serviceName,
      serviceId:selected.serviceId,

      pricingSource:selected.pricingSource,
      facilityOverrideActive:selected.facilityOverrideActive,

      entryName:entryName.value,
      entryPhone:entryPhone.value,

      clientName:clientName.value,
      clientPhone:clientPhone.value,

      pickup,
      dropoff,
      stops,

      pickupAddress:pickup.address,
      dropoffAddress:dropoff.address,

      pickupLat:pickup.lat,
      pickupLng:pickup.lng,
      dropoffLat:dropoff.lat,
      dropoffLng:dropoff.lng,

      tripDate:tripDate.value,
      tripTime:tripTime.value,
      notes:notes.value,

      status:"Scheduled"
    };

    console.log("CREATE INDIVIDUAL TRIP PAYLOAD:", trip);

    const res =
      await fetch("/api/trips",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          Authorization:"Bearer " + token
        },
        body:JSON.stringify(trip)
      });

    if(!res.ok){
      const err =
        await res.json().catch(()=>({}));
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

    pickupPoint = null;
    dropoffPoint = null;

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

    const pickupEl =
      card.querySelector(".sharedPickup");

    const dropoffEl =
      card.querySelector(".sharedDropoff");

    const pickup =
      buildAddressPoint(
        pickupEl,
        sharedPickupPoints.get(pickupEl)
      );

    const dropoff =
      buildAddressPoint(
        dropoffEl,
        sharedDropoffPoints.get(dropoffEl)
      );

    passengers.push({
      passengerId:"P" + (index + 1),
      clientName:card.querySelector(".sharedClientName").value,
      clientPhone:card.querySelector(".sharedClientPhone").value,

      pickup,
      dropoff,

      pickupAddress:pickup.address,
      dropoffAddress:dropoff.address,
      pickupLat:pickup.lat,
      pickupLng:pickup.lng,
      dropoffLat:dropoff.lat,
      dropoffLng:dropoff.lng,

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

    const selected =
      selectedServicePayload();

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

      serviceKey:selected.serviceKey,
      serviceCode:selected.serviceCode,
      serviceType:selected.serviceType,
      serviceSuffix:selected.serviceSuffix,
      serviceName:selected.serviceName,
      serviceId:selected.serviceId,

      pricingSource:selected.pricingSource,
      facilityOverrideActive:selected.facilityOverrideActive,

      passengers,
      passengersCount:passengers.length,
      totalPassengers:passengers.length,

      pickup:
        passengers[0]?.pickup || null,

      dropoff:
        passengers[passengers.length - 1]?.dropoff || null,

      pickupAddress:
        passengers[0]?.pickup?.address || "",

      dropoffAddress:
        passengers[passengers.length - 1]?.dropoff?.address || "",

      entryName:sharedEntryName.value,
      entryPhone:sharedEntryPhone.value,

      tripDate:sharedDate.value,
      tripTime:sharedTime.value,
      notes:sharedNotes.value,

      status:"Scheduled"
    };

    console.log("CREATE SHARED TRIP PAYLOAD:", sharedTrip);

    const res =
      await fetch("/api/trips",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          Authorization:"Bearer " + token
        },
        body:JSON.stringify(sharedTrip)
      });

    if(!res.ok){
      const err =
        await res.json().catch(()=>({}));
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

initBaseAutocompletes();

loadDraft();
loadSharedDraft();

await loadSystemTimezone();
await loadCompanyServices();

})();

});