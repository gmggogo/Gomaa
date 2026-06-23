/* =====================================================
FILE: public/admin/dispatch-add-trip.js
DISPATCH ADD TRIP - RESERVED RV FINAL BUILD
ADD -> LOCAL REVIEW -> CONFIRM -> ROUTE + RESERVED PRICE -> CREATE RV
BUTTON POLICY SAME AS COMPANY REVIEW
===================================================== */

document.addEventListener("DOMContentLoaded", async function(){

/* ================= CONFIG ================= */

const API_URL = "/api/trips";
const SERVICES_URL = "/api/services/admin";

const token = localStorage.getItem("token") || "";
const role  = localStorage.getItem("role") || "";

if(
  !token ||
  !["superadmin","admin","dispatcher"].includes(role)
){
  window.location.href = "/admin/login.html";
  return;
}

/* ================= STATE ================= */

let SERVICES = [];
let activeService = null;

let pendingTrips =
  JSON.parse(
    localStorage.getItem("dispatchReviewTrips") ||
    "[]"
  );

let editIndex = null;
let SYSTEM_TIMEZONE = "America/Phoenix";
let SYSTEM_REGION = "";
let SYSTEM_COUNTRY = "";
let googleLoadPromise = null;

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

/* ================= STYLE ================= */

(function injectDispatchReviewStyles(){

  if(document.getElementById("dispatch-add-trip-style")){
    return;
  }

  const style = document.createElement("style");
  style.id = "dispatch-add-trip-style";

  style.innerHTML = `
    .rv-review-card{
      background:#f8fafc;
      border:1px solid #dbe3ee;
      border-radius:14px;
      padding:12px;
      margin-bottom:10px;
    }

    .rv-review-card.confirmed{
      background:#dcfce7;
      border-color:#86efac;
    }

    .rv-review-card.cancelled{
      background:#fee2e2;
      border-color:#fca5a5;
    }

    .rv-review-card.past{
      background:#374151;
      color:#f8fafc;
      border-color:#111827;
    }

    .rv-review-title{
      font-weight:900;
      color:#0f172a;
      margin-bottom:6px;
    }

    .rv-review-card.past .rv-review-title{
      color:#fff;
    }

    .rv-line{
      margin:3px 0;
      font-size:13px;
      font-weight:700;
      color:#334155;
    }

    .rv-review-card.past .rv-line{
      color:#e5e7eb;
    }

    .rv-passenger{
      padding:7px 0;
      border-top:1px dashed #cbd5e1;
      font-size:13px;
      font-weight:700;
    }

    .rv-stops-box{
      margin-top:6px;
      padding:7px;
      background:#fff;
      border:1px dashed #94a3b8;
      border-radius:8px;
      font-size:12px;
      font-weight:800;
      color:#334155;
    }

    .rv-actions-wrap{
      display:flex;
      align-items:center;
      gap:7px;
      flex-wrap:wrap;
      margin-top:11px;
    }

    .rv-btn{
      border:none;
      padding:8px 12px;
      border-radius:8px;
      font-size:12px;
      font-weight:900;
      cursor:pointer;
      color:#fff;
    }

    .rv-btn.edit{background:#2563eb;}
    .rv-btn.delete{background:#111827;}
    .rv-btn.confirm{background:#16a34a;}
    .rv-btn.cancel{background:#dc2626;}
    .rv-btn.add-stop{background:#7c3aed;}
    .rv-btn.gray{background:#64748b;}

    .rv-badge{
      display:inline-block;
      margin-top:5px;
      padding:3px 7px;
      border-radius:999px;
      font-size:10px;
      font-weight:900;
      background:#fef3c7;
      color:#92400e;
      border:1px solid #fcd34d;
    }

    .rv-warning{
      background:#eff6ff;
      border:1px solid #bfdbfe;
      border-radius:12px;
      padding:10px;
      margin-bottom:12px;
      font-weight:900;
      color:#1e3a8a;
      font-size:13px;
      line-height:1.45;
    }
  `;

  document.head.appendChild(style);

})();

/* ================= HELPERS ================= */

function normalizeText(v){
  return String(v ?? "").trim();
}

function cleanStatus(v){
  return String(v || "")
    .replace(/\s+/g,"")
    .toLowerCase()
    .trim();
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/"/g,"&quot;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function showAlert(msg){
  alert(msg);
}

function saveReview(){
  localStorage.setItem(
    "dispatchReviewTrips",
    JSON.stringify(pendingTrips)
  );
}

function makeLocalId(){
  return (
    "RV_LOCAL_" +
    Date.now() +
    "_" +
    Math.random().toString(16).slice(2)
  );
}

function normalizeCode(v){

  const c =
    normalizeText(v)
      .toUpperCase()
      .replace(/\s+/g,"");

  if(c === "STANDARD" || c === "ST") return "STANDARD";
  if(c === "WHEELCHAIR" || c === "WH" || c === "WC") return "WHEELCHAIR";
  if(c === "SHARED" || c === "SH") return "SHARED";
  if(c === "LIMOUSINE" || c === "LIMO" || c === "LM") return "LIMO";
  if(c === "TAXI" || c === "TX") return "TAXI";
  if(c === "XL") return "XL";

  return c || "STANDARD";
}

function formatMoney(v){
  return Number(v || 0).toFixed(2);
}

function normalizeAddress(address){

  let v =
    normalizeText(address);

  if(!v){
    return "";
  }

  v =
    v.replace(/\s+/g," ").trim();

  const lower =
    v.toLowerCase();

  if(
    SYSTEM_REGION &&
    !lower.includes(SYSTEM_REGION.toLowerCase())
  ){
    v += ", " + SYSTEM_REGION;
  }

  if(
    SYSTEM_COUNTRY &&
    !lower.includes(SYSTEM_COUNTRY.toLowerCase())
  ){
    v += ", " + SYSTEM_COUNTRY;
  }

  return v;
}

/* ================= SERVICE HELPERS ================= */

function getServiceCode(service){

  return normalizeCode(
    service?.serviceKey ||
    service?.key ||
    service?.code ||
    service?.serviceCode ||
    service?.suffix ||
    service?.companySuffix ||
    service?.title ||
    service?.name ||
    ""
  );

}

function getServiceTitle(service){

  const code =
    getServiceCode(service);

  if(code === "STANDARD") return "Standard";
  if(code === "XL") return "XL";
  if(code === "TAXI") return "Taxi";
  if(code === "LIMO") return "Limousine";
  if(code === "WHEELCHAIR") return "Wheelchair";
  if(code === "SHARED") return "Shared";

  return (
    service?.title ||
    service?.name ||
    service?.serviceName ||
    code
  );
}

function getServiceSuffix(service){

  const code =
    getServiceCode(service);

  if(code === "STANDARD") return "ST";
  if(code === "WHEELCHAIR") return "WH";
  if(code === "SHARED") return "SH";
  if(code === "LIMO") return "LM";
  if(code === "TAXI") return "TX";
  if(code === "XL") return "XL";

  return "ST";
}

function serviceVisible(service){

  return (
    service?.reservedEnabled === true ||
    String(service?.reservedEnabled).toLowerCase() === "true"
  );

}

function isSharedService(service){

  if(!service){
    return false;
  }

  const code =
    getServiceCode(service);

  const title =
    normalizeText(
      service.title ||
      service.name ||
      service.serviceName
    ).toUpperCase();

  const reservedPricing =
    normalizeText(
      service.reservedPricingMode
    ).toUpperCase();

  const reservedSuffix =
    normalizeText(
      service.reservedSuffix
    ).toUpperCase();

  return (
    code === "SHARED" ||
    title === "SHARED" ||
    reservedPricing === "SHARED" ||
    reservedSuffix === "SH" ||
    service.reservedShared === true
  );
}

function getServiceByTrip(trip){

  if(!trip){
    return null;
  }

  const code =
    normalizeCode(
      trip.serviceKey ||
      trip.serviceCode ||
      trip.serviceType ||
      trip.serviceSuffix ||
      ""
    );

  if(
    trip.isShared === true ||
    code === "SHARED" ||
    code === "SH"
  ){
    return SERVICES.find(s=>isSharedService(s)) || null;
  }

  return SERVICES.find(s=>{
    return getServiceCode(s) === code;
  }) || null;

}

/* ================= RESERVED PRICING ================= */

function getReservedPricing(service){

  return {

    pricingMode:
      normalizeText(
        service?.reservedPricingMode ||
        "MILE"
      ).toUpperCase(),

    baseFare:
      Number(service?.reservedBaseFare || 0),

    includedMiles:
      Number(service?.reservedIncludedMiles || 0),

    perMile:
      Number(service?.reservedPerMile || 0),

    hourlyRate:
      Number(service?.reservedHourlyRate || 0),

    hourlyBillingMode:
      normalizeText(
        service?.reservedHourlyBillingMode ||
        "FULL"
      ).toUpperCase(),

    stopFee:
      Number(service?.reservedStopFee || 0),

    noShowFee:
      Number(service?.reservedNoShowFee || 0),

    cancelFee:
      Number(service?.reservedCancelFee || 0),

    sharedPrice:
      Number(service?.reservedSharedPrice || 0),

    warningMinutes:
      Number(
        service?.reservedWarningMinutes ??
        120
      ),

    disableCancel:
      service?.reservedDisableCancel === true

  };

}

function getWarningMinutes(service){

  const pricing =
    getReservedPricing(service);

  return Number(
    pricing.warningMinutes || 120
  );

}

function warningEnabled(service){

  const pricing =
    getReservedPricing(service);

  return pricing.disableCancel !== true;

}

function calculateReservedPrice({
  service,
  miles,
  minutes,
  stops,
  passengerCount
}){

  const p =
    getReservedPricing(service);

  const pricingMode =
    p.pricingMode;

  const stopCount =
    Number(stops || 0);

  const count =
    Math.max(
      1,
      Number(passengerCount || 1)
    );

  let total = 0;

  if(pricingMode === "SHARED"){

    if(p.sharedPrice > 0){

      total =
        p.sharedPrice * count;

    }else{

      const extraMiles =
        Math.max(
          0,
          Number(miles || 0) -
          Number(p.includedMiles || 0)
        );

      total =
        Number(p.baseFare || 0) +
        (extraMiles * Number(p.perMile || 0)) +
        (stopCount * Number(p.stopFee || 0));

    }

  }

  else if(pricingMode === "HOURLY"){

    const mins =
      Math.max(
        0,
        Number(minutes || 0)
      );

    let billableHours = 0;

    if(p.hourlyBillingMode === "QUARTER"){

      billableHours =
        Math.ceil(mins / 15) * 0.25;

    }else{

      billableHours =
        Math.ceil(mins / 60);

    }

    total =
      (billableHours * Number(p.hourlyRate || 0)) +
      (stopCount * Number(p.stopFee || 0));

  }

  else{

    const extraMiles =
      Math.max(
        0,
        Number(miles || 0) -
        Number(p.includedMiles || 0)
      );

    total =
      Number(p.baseFare || 0) +
      (extraMiles * Number(p.perMile || 0)) +
      (stopCount * Number(p.stopFee || 0));

  }

  return Number(
    Number(total || 0).toFixed(2)
  );

}

/* ================= TIME ================= */

async function loadSystemTimezone(){

  try{

    const res =
      await fetch("/api/system-design");

    const data =
      await res.json();

    SYSTEM_TIMEZONE =
      data?.timezone ||
      "America/Phoenix";

    SYSTEM_REGION =
      data?.region ||
      "";

    SYSTEM_COUNTRY =
      data?.country ||
      "";

  }catch(err){

    console.log(err);

    SYSTEM_TIMEZONE =
      "America/Phoenix";

  }

}

function getSystemNow(){

  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone:
          SYSTEM_TIMEZONE ||
          "America/Phoenix"
      }
    )
  );

}

function parseTripDateTime(tripDate, tripTime){

  const d =
    normalizeText(tripDate);

  let t =
    normalizeText(tripTime);

  if(!d || !t){
    return null;
  }

  const parts =
    d.split("-");

  if(parts.length < 3){
    return null;
  }

  if(/^\d{1,2}:\d{2}$/.test(t)){

    const [hh,mm] =
      t.split(":");

    const dt =
      new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2]),
        Number(hh),
        Number(mm),
        0
      );

    return Number.isNaN(dt.getTime()) ? null : dt;

  }

  const ampm =
    t.match(
      /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
    );

  if(ampm){

    let h =
      Number(ampm[1]);

    const m =
      Number(ampm[2]);

    const ap =
      ampm[3].toUpperCase();

    if(ap === "PM" && h < 12){
      h += 12;
    }

    if(ap === "AM" && h === 12){
      h = 0;
    }

    const dt =
      new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2]),
        h,
        m,
        0
      );

    return Number.isNaN(dt.getTime()) ? null : dt;

  }

  return null;

}

function minutesToTrip(t){

  const dt =
    parseTripDateTime(
      t.tripDate,
      t.tripTime
    );

  if(!dt){
    return null;
  }

  return (
    dt.getTime() -
    getSystemNow().getTime()
  ) / 60000;

}

/* ================= BUTTON POLICY SAME AS REVIEW.JS ================= */

function hasActiveAddStopRequest(trip){

  const req =
    trip?.addStopRequest || null;

  if(!req){
    return false;
  }

  const status =
    String(req.status || "").toUpperCase();

  return (
    req.active === true &&
    ![
      "CANCELLED",
      "CANCELLED_BY_DISPATCH",
      "COMPLETED",
      "REJECTED"
    ].includes(status)
  );

}

function reservedAllowsAddStop(trip){

  if(!trip){
    return false;
  }

  if(trip.isShared === true){
    return false;
  }

  const service =
    getServiceByTrip(trip);

  if(!service){
    return false;
  }

  if(service.reservedAddStopEnabled !== true){
    return false;
  }

  const customTime =
    service.reservedAddStopCustomTimeEnabled === true;

  if(!customTime){
    return true;
  }

  const mins =
    minutesToTrip(trip);

  if(mins === null){
    return true;
  }

  const cutoff =
    Number(
      service.reservedAddStopCutoffMinutes || 0
    );

  if(cutoff <= 0){
    return mins >= 0;
  }

  return mins >= cutoff;

}

function renderAddStopButton(trip,index){

  if(trip.isShared === true){
    return "";
  }

  if(hasActiveAddStopRequest(trip)){
    return `
      <button
        type="button"
        class="rv-btn cancel"
        onclick="cancelStopFromPendingTrip(${index})"
      >
        Cancel Stop
      </button>
    `;
  }

  if(!reservedAllowsAddStop(trip)){
    return "";
  }

  return `
    <button
      type="button"
      class="rv-btn add-stop"
      onclick="addStopToPendingTrip(${index})"
    >
      Add Stop
    </button>
  `;
}

function renderPendingTripButtons(trip,index){

  const service =
    getServiceByTrip(trip);

  const mins =
    minutesToTrip(trip);

  const warningMinutes =
    warningEnabled(service)
      ? getWarningMinutes(service)
      : 0;

  const status =
    cleanStatus(trip.status);

  const stopBtn =
    renderAddStopButton(trip,index);

  if(status.includes("cancel")){
    return `
      <div class="rv-actions-wrap">
        ${stopBtn}
      </div>
    `;
  }

  if(mins > warningMinutes || mins === null){
    return `
      <div class="rv-actions-wrap">
        <button
          type="button"
          class="rv-btn edit"
          onclick="editPendingTrip(${index})"
        >
          Edit
        </button>

        <button
          type="button"
          class="rv-btn delete"
          onclick="deletePendingTrip(${index})"
        >
          Delete
        </button>

        <button
          type="button"
          class="rv-btn confirm"
          onclick="createTripFromReview(${index}, this)"
        >
          Confirm
        </button>

        ${stopBtn}
      </div>
    `;
  }

  if(
    mins <= warningMinutes &&
    mins > 0 &&
    !status.includes("confirm")
  ){
    return `
      <div class="rv-actions-wrap">
        <button
          type="button"
          class="rv-btn confirm"
          onclick="createTripFromReview(${index}, this)"
        >
          Confirm
        </button>

        <button
          type="button"
          class="rv-btn delete"
          onclick="deletePendingTrip(${index})"
        >
          Delete
        </button>

        ${stopBtn}
      </div>
    `;
  }

  if(
    mins <= warningMinutes &&
    mins > 0 &&
    status.includes("confirm")
  ){
    return `
      <div class="rv-actions-wrap">
        <button
          type="button"
          class="rv-btn cancel"
          onclick="cancelPendingConfirmedTrip(${index}, this)"
        >
          Cancel
        </button>

        ${stopBtn}
      </div>
    `;
  }

  return `
    <div class="rv-actions-wrap">
      ${stopBtn}
    </div>
  `;
}

/* ================= GOOGLE ROUTE ================= */

async function ensureGoogleLoaded(){

  if(
    window.google &&
    google.maps &&
    google.maps.DirectionsService
  ){
    return;
  }

  if(googleLoadPromise){
    return googleLoadPromise;
  }

  googleLoadPromise =
    new Promise(async (resolve,reject)=>{

      try{

        const res =
          await fetch("/api/config");

        const data =
          await res.json();

        if(!data.googleKey){
          reject(new Error("Google key missing"));
          return;
        }

        const existing =
          document.querySelector(
            "script[data-google-maps='true']"
          );

        if(existing){

          if(
            window.google &&
            google.maps &&
            google.maps.DirectionsService
          ){
            resolve();
            return;
          }

          existing.addEventListener(
            "load",
            ()=>resolve()
          );

          existing.addEventListener(
            "error",
            ()=>reject(new Error("Google failed"))
          );

          return;
        }

        const script =
          document.createElement("script");

        script.src =
          "https://maps.googleapis.com/maps/api/js?key=" +
          encodeURIComponent(data.googleKey);

        script.async = true;
        script.defer = true;

        script.setAttribute(
          "data-google-maps",
          "true"
        );

        script.onload =
          ()=>resolve();

        script.onerror =
          ()=>reject(new Error("Google failed"));

        document.head.appendChild(script);

      }catch(err){

        reject(err);

      }

    });

  return googleLoadPromise;

}

function normalizeUniqueAddress(address){
  return normalizeAddress(address);
}

function addressKey(address){
  return normalizeUniqueAddress(address)
    .toLowerCase()
    .replace(/\s+/g," ")
    .trim();
}

function uniqueAddressList(list){

  const out = [];
  const seen = new Set();

  list.forEach(address=>{

    const v =
      normalizeUniqueAddress(address);

    if(!v){
      return;
    }

    const key =
      addressKey(v);

    if(seen.has(key)){
      return;
    }

    seen.add(key);
    out.push(v);

  });

  return out;

}

async function calculateRouteMiles(points){

  await ensureGoogleLoaded();

  const cleanPoints =
    Array.isArray(points)
      ? points
          .map(p=>normalizeUniqueAddress(p))
          .filter(Boolean)
      : [];

  if(cleanPoints.length < 2){

    return {
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      googleRoute:{}
    };

  }

  const origin =
    cleanPoints[0];

  const destination =
    cleanPoints[cleanPoints.length - 1];

  const waypoints =
    cleanPoints
      .slice(1,-1)
      .map(address=>({
        location:address,
        stopover:true
      }));

  return new Promise((resolve,reject)=>{

    const service =
      new google.maps.DirectionsService();

    service.route(
      {
        origin,
        destination,
        waypoints,
        optimizeWaypoints:false,
        travelMode:
          google.maps.TravelMode.DRIVING,
        unitSystem:
          google.maps.UnitSystem.IMPERIAL
      },
      function(response,status){

        if(
          status !== "OK" ||
          !response?.routes?.[0]
        ){
          reject(
            new Error(
              "Google route failed: " + status
            )
          );
          return;
        }

        const route =
          response.routes[0];

        let meters = 0;
        let seconds = 0;

        route.legs.forEach(leg=>{

          meters +=
            leg.distance
              ? Number(leg.distance.value || 0)
              : 0;

          seconds +=
            leg.duration
              ? Number(leg.duration.value || 0)
              : 0;

        });

        resolve({
          miles:
            Number(
              (meters * 0.000621371).toFixed(2)
            ),

          distanceMeters:
            meters,

          durationSeconds:
            seconds,

          estimatedMinutes:
            Math.ceil(seconds / 60),

          googleRoute:{
            summary:
              route.summary || "",

            waypointOrder:
              route.waypoint_order || [],

            legs:
              route.legs.map((leg,index)=>({
                legIndex:index,
                startAddress:
                  leg.start_address || "",
                endAddress:
                  leg.end_address || "",
                distanceText:
                  leg.distance?.text || "",
                distanceMeters:
                  leg.distance?.value || 0,
                durationText:
                  leg.duration?.text || "",
                durationSeconds:
                  leg.duration?.value || 0
              }))
          }
        });

      }
    );

  });

}

async function optimizeStopsFromOrigin(origin,stops){

  await ensureGoogleLoaded();

  const cleanOrigin =
    normalizeUniqueAddress(origin);

  const cleanStops =
    uniqueAddressList(stops);

  if(!cleanOrigin){
    return cleanStops;
  }

  if(!cleanStops.length){
    return [cleanOrigin];
  }

  if(cleanStops.length === 1){
    return [
      cleanOrigin,
      cleanStops[0]
    ];
  }

  return new Promise(resolve=>{

    const service =
      new google.maps.DirectionsService();

    service.route(
      {
        origin:cleanOrigin,
        destination:cleanOrigin,
        waypoints:
          cleanStops.map(address=>({
            location:address,
            stopover:true
          })),
        optimizeWaypoints:true,
        travelMode:
          google.maps.TravelMode.DRIVING,
        unitSystem:
          google.maps.UnitSystem.IMPERIAL
      },
      function(response,status){

        if(
          status !== "OK" ||
          !response?.routes?.[0]
        ){
          resolve([
            cleanOrigin,
            ...cleanStops
          ]);
          return;
        }

        const order =
          response.routes[0].waypoint_order || [];

        const orderedStops =
          order.map(i=>cleanStops[i])
            .filter(Boolean);

        resolve([
          cleanOrigin,
          ...orderedStops
        ]);

      }
    );

  });

}

function passengerIsActive(p){

  const s =
    cleanStatus(p.status);

  return (
    !s.includes("no") &&
    !s.includes("cancel") &&
    normalizeText(p.pickup) &&
    normalizeText(p.dropoff)
  );

}

function passengerPickup(p){
  return normalizeUniqueAddress(p.pickup);
}

function passengerDropoff(p){
  return normalizeUniqueAddress(p.dropoff);
}

function indexOfAddress(route,address){

  const key =
    addressKey(address);

  return route.findIndex(p=>{
    return addressKey(p) === key;
  });

}

async function buildFinalSharedRoute(trip){

  const sourcePassengers =
    Array.isArray(trip.passengers)
      ? trip.passengers
      : [];

  const passengers =
    sourcePassengers.map((p,index)=>({
      ...p,
      __originalIndex:index,
      __active:passengerIsActive(p),
      pickup:normalizeText(p.pickup),
      dropoff:normalizeText(p.dropoff)
    }));

  const activePassengers =
    passengers.filter(p=>p.__active);

  if(!activePassengers.length){
    return {
      routePoints:[],
      passengers,
      activePassengers:[],
      activeCount:0
    };
  }

  const pickupAddresses =
    uniqueAddressList(
      activePassengers.map(passengerPickup)
    );

  const dropoffAddresses =
    uniqueAddressList(
      activePassengers.map(passengerDropoff)
    );

  let pickupRoute = [];

  if(pickupAddresses.length === 1){

    pickupRoute =
      [pickupAddresses[0]];

  }else{

    const originPickup =
      pickupAddresses[0];

    const otherPickups =
      pickupAddresses.slice(1);

    pickupRoute =
      await optimizeStopsFromOrigin(
        originPickup,
        otherPickups
      );

  }

  const lastPickup =
    pickupRoute[pickupRoute.length - 1];

  let dropoffRouteWithOrigin = [];

  if(dropoffAddresses.length === 1){

    dropoffRouteWithOrigin =
      [
        lastPickup,
        dropoffAddresses[0]
      ];

  }else{

    dropoffRouteWithOrigin =
      await optimizeStopsFromOrigin(
        lastPickup,
        dropoffAddresses
      );

  }

  const dropoffRoute =
    dropoffRouteWithOrigin.slice(1);

  const finalRoutePoints =
    uniqueAddressList([
      ...pickupRoute,
      ...dropoffRoute
    ]);

  const routeWithOrders =
    passengers.map(p=>{

      if(!p.__active){
        return {
          ...p,
          routeOrder:9999,
          pickupOrder:9999,
          dropoffOrder:9999
        };
      }

      const pickupIndex =
        indexOfAddress(
          finalRoutePoints,
          p.pickup
        );

      const dropoffIndex =
        indexOfAddress(
          finalRoutePoints,
          p.dropoff
        );

      const pickupOrder =
        pickupIndex < 0
          ? 9999
          : pickupIndex + 1;

      const dropoffOrder =
        dropoffIndex < 0
          ? 9999
          : dropoffIndex + 1;

      return {
        ...p,
        routeOrder:pickupOrder,
        pickupOrder,
        dropoffOrder
      };

    });

  const sortedPassengers =
    routeWithOrders
      .sort((a,b)=>{

        if(a.__active !== b.__active){
          return a.__active ? -1 : 1;
        }

        if(
          Number(a.pickupOrder) !==
          Number(b.pickupOrder)
        ){
          return (
            Number(a.pickupOrder) -
            Number(b.pickupOrder)
          );
        }

        if(
          Number(a.dropoffOrder) !==
          Number(b.dropoffOrder)
        ){
          return (
            Number(a.dropoffOrder) -
            Number(b.dropoffOrder)
          );
        }

        return (
          Number(a.__originalIndex) -
          Number(b.__originalIndex)
        );

      })
      .map((p,index)=>{

        const cleaned =
          {...p};

        delete cleaned.__originalIndex;
        delete cleaned.__active;

        return {
          ...cleaned,
          routeOrder:index + 1
        };

      });

  return {
    routePoints:finalRoutePoints,
    passengers:sortedPassengers,
    activePassengers:
      sortedPassengers.filter(passengerIsActive),
    activeCount:
      activePassengers.length
  };

}

function buildIndividualRoutePoints(trip){

  const req =
    trip?.addStopRequest || null;

  const pickup =
    req?.pickup ||
    trip.pickup ||
    "";

  const stops =
    req?.active === true &&
    Array.isArray(req.finalStops)
      ? req.finalStops
      : Array.isArray(trip.stops)
        ? trip.stops
        : [];

  const dropoff =
    req?.dropoffAfter ||
    trip.dropoff ||
    "";

  return [
    pickup,
    ...stops,
    dropoff
  ]
  .map(v=>normalizeAddress(v))
  .filter(Boolean);

}

/* ================= VALIDATION ================= */

function validateIndividualTrip(){

  if(!normalizeText(entryName?.value)){
    showAlert("Entry Name Required");
    return false;
  }

  if(!normalizeText(entryPhone?.value)){
    showAlert("Entry Phone Required");
    return false;
  }

  if(!normalizeText(clientName?.value)){
    showAlert("Client Name Required");
    return false;
  }

  if(!normalizeText(clientPhone?.value)){
    showAlert("Client Phone Required");
    return false;
  }

  if(!normalizeText(pickupInput?.value)){
    showAlert("Pickup Required");
    return false;
  }

  if(!normalizeText(dropoffInput?.value)){
    showAlert("Dropoff Required");
    return false;
  }

  if(!tripDate?.value){
    showAlert("Trip Date Required");
    return false;
  }

  if(!tripTime?.value){
    showAlert("Trip Time Required");
    return false;
  }

  const dt =
    parseTripDateTime(
      tripDate.value,
      tripTime.value
    );

  if(!dt){
    showAlert("Invalid Trip Date/Time");
    return false;
  }

  if(dt <= getSystemNow()){
    showAlert("Trip Date/Time Already Passed");
    return false;
  }

  return true;

}

function validateSharedTrip(){

  if(!normalizeText(sharedEntryName?.value)){
    showAlert("Entry Name Required");
    return false;
  }

  if(!normalizeText(sharedEntryPhone?.value)){
    showAlert("Entry Phone Required");
    return false;
  }

  if(!sharedDate?.value){
    showAlert("Trip Date Required");
    return false;
  }

  if(!sharedTime?.value){
    showAlert("Trip Time Required");
    return false;
  }

  const dt =
    parseTripDateTime(
      sharedDate.value,
      sharedTime.value
    );

  if(!dt){
    showAlert("Invalid Trip Date/Time");
    return false;
  }

  if(dt <= getSystemNow()){
    showAlert("Trip Date/Time Already Passed");
    return false;
  }

  const cards =
    document.querySelectorAll(".passenger-card");

  if(cards.length < 2){
    showAlert("Minimum 2 Passengers");
    return false;
  }

  for(const card of cards){

    if(
      !normalizeText(
        card.querySelector(".sharedClientName")?.value
      )
    ){
      showAlert("Passenger Name Required");
      return false;
    }

    if(
      !normalizeText(
        card.querySelector(".sharedClientPhone")?.value
      )
    ){
      showAlert("Passenger Phone Required");
      return false;
    }

    if(
      !normalizeText(
        card.querySelector(".sharedPickup")?.value
      )
    ){
      showAlert("Passenger Pickup Required");
      return false;
    }

    if(
      !normalizeText(
        card.querySelector(".sharedDropoff")?.value
      )
    ){
      showAlert("Passenger Dropoff Required");
      return false;
    }

  }

  return true;

}

/* ================= HEADER / REVIEW PAGE ================= */

function buildTopHeader(){

  if(
    document.getElementById(
      "dispatchAddHeader"
    )
  ){
    return;
  }

  const container =
    document.querySelector(".container");

  if(!container){
    return;
  }

  const header =
    document.createElement("div");

  header.id =
    "dispatchAddHeader";

  header.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <button
        id="backToHubBtn"
        type="button"
        style="background:#64748b;color:#fff;flex:1;"
      >
        ← Back To Trips Hub
      </button>

      <button
        id="showAddBtn"
        type="button"
        style="background:#f97316;color:#fff;flex:1;"
      >
        Dispatch Add Trip
      </button>

      <button
        id="showReviewBtn"
        type="button"
        style="background:#16a34a;color:#fff;flex:1;"
      >
        Dispatch Review (${pendingTrips.length})
      </button>
    </div>
  `;

  container.insertBefore(
    header,
    container.firstChild
  );

  document.getElementById("backToHubBtn").onclick =
    ()=>{
      window.location.href =
        "/admin/trips-hub.html";
    };

  document.getElementById("showAddBtn").onclick =
    showAddPage;

  document.getElementById("showReviewBtn").onclick =
    showReviewPage;

}

function updateReviewCounter(){

  const btn =
    document.getElementById("showReviewBtn");

  if(btn){
    btn.innerText =
      `Dispatch Review (${pendingTrips.length})`;
  }

}

function buildReviewPage(){

  if(
    document.getElementById(
      "dispatchReviewPage"
    )
  ){
    return;
  }

  const container =
    document.querySelector(".container");

  if(!container){
    return;
  }

  const review =
    document.createElement("div");

  review.id =
    "dispatchReviewPage";

  review.style.display =
    "none";

  review.innerHTML = `
    <section style="background:#fff;border:1px solid #dbe3ee;border-radius:16px;padding:16px;">
      <h3 style="margin-top:0;">
        Dispatch Review
      </h3>

      <div class="rv-warning">
        Reserved trips stay here until Confirm.
        Confirm calculates route, miles, minutes, Reserved price, then creates RV trip.
        Button policy follows Company Review rules.
      </div>

      <div id="dispatchReviewList"></div>

      <div class="actions" style="margin-top:14px;">
        <button
          id="backToAddFromReview"
          type="button"
          class="btn-orange"
        >
          Back To Add Trip
        </button>
      </div>
    </section>
  `;

  container.appendChild(review);

  document.getElementById(
    "backToAddFromReview"
  ).onclick =
    showAddPage;

}

function showAddPage(){

  const page =
    document.getElementById(
      "dispatchReviewPage"
    );

  if(page){
    page.style.display = "none";
  }

  if(companyTabs){
    companyTabs.style.display = "flex";
  }

  if(
    activeService &&
    isSharedService(activeService)
  ){

    if(individualSection){
      individualSection.style.display = "none";
    }

    if(sharedSection){
      sharedSection.style.display = "block";
    }

  }else{

    if(individualSection){
      individualSection.style.display = "block";
    }

    if(sharedSection){
      sharedSection.style.display = "none";
    }

  }

}

function showReviewPage(){

  if(companyTabs){
    companyTabs.style.display = "none";
  }

  if(individualSection){
    individualSection.style.display = "none";
  }

  if(sharedSection){
    sharedSection.style.display = "none";
  }

  const page =
    document.getElementById(
      "dispatchReviewPage"
    );

  if(page){
    page.style.display = "block";
  }

  renderPendingReview();

}

/* ================= ENTRY INFO ================= */

function loadEntryInfo(){

  const saved =
    JSON.parse(
      localStorage.getItem("dispatchEntryInfo") ||
      "{}"
    );

  if(entryName){
    entryName.value = saved.entryName || "";
  }

  if(entryPhone){
    entryPhone.value = saved.entryPhone || "";
  }

  if(sharedEntryName){
    sharedEntryName.value = saved.entryName || "";
  }

  if(sharedEntryPhone){
    sharedEntryPhone.value = saved.entryPhone || "";
  }

}

function saveEntryInfo(){

  const data = {
    entryName:
      entryName?.value ||
      sharedEntryName?.value ||
      "",

    entryPhone:
      entryPhone?.value ||
      sharedEntryPhone?.value ||
      ""
  };

  localStorage.setItem(
    "dispatchEntryInfo",
    JSON.stringify(data)
  );

  if(entryName){
    entryName.value = data.entryName;
  }

  if(entryPhone){
    entryPhone.value = data.entryPhone;
  }

  if(sharedEntryName){
    sharedEntryName.value = data.entryName;
  }

  if(sharedEntryPhone){
    sharedEntryPhone.value = data.entryPhone;
  }

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

    if(editEntryBtn){
      editEntryBtn.innerText = "Save";
    }

    if(editSharedEntryBtn){
      editSharedEntryBtn.innerText = "Save";
    }

    entryName?.focus();

    return;

  }

  saveEntryInfo();

  entryEditMode = false;

  entryName?.setAttribute("readonly", true);
  entryPhone?.setAttribute("readonly", true);
  sharedEntryName?.setAttribute("readonly", true);
  sharedEntryPhone?.setAttribute("readonly", true);

  if(editEntryBtn){
    editEntryBtn.innerText = "Edit";
  }

  if(editSharedEntryBtn){
    editSharedEntryBtn.innerText = "Edit";
  }

}

editEntryBtn?.addEventListener(
  "click",
  toggleEntryEdit
);

editSharedEntryBtn?.addEventListener(
  "click",
  toggleEntryEdit
);

saveEntryBtn?.addEventListener(
  "click",
  saveEntryInfo
);

/* ================= SERVICES ================= */

async function loadAdminServices(){

  try{

    const res =
      await fetch(
        SERVICES_URL,
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
      await res.json();

    const raw =
      Array.isArray(data)
        ? data
        : Array.isArray(data.services)
          ? data.services
          : Array.isArray(data.data)
            ? data.data
            : [];

    const unique =
      new Map();

    raw
      .filter(serviceVisible)
      .forEach(service=>{

        const code =
          getServiceCode(service);

        if(
          code &&
          !unique.has(code)
        ){
          unique.set(code, service);
        }

      });

    SERVICES =
      [...unique.values()];

    if(!SERVICES.length){

      SERVICES = [];

      showAlert(
        "No Reserved services enabled. Enable Reserved services in Service Management."
      );

    }

    buildServiceTabs();

  }catch(err){

    console.log(err);

    SERVICES = [];

    buildServiceTabs();

    showAlert("Failed loading Reserved services");

  }

}

function buildServiceTabs(){

  if(!companyTabs){
    return;
  }

  companyTabs.innerHTML = "";

  if(!SERVICES.length){

    companyTabs.innerHTML = `
      <div style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;border-radius:12px;padding:12px;font-weight:900;width:100%;">
        No Reserved services enabled.
      </div>
    `;

    if(individualSection){
      individualSection.style.display = "none";
    }

    if(sharedSection){
      sharedSection.style.display = "none";
    }

    return;

  }

  SERVICES.forEach((service,index)=>{

    const btn =
      document.createElement("button");

    btn.type =
      "button";

    btn.innerText =
      getServiceTitle(service);

    btn.className =
      index === 0
        ? "btn-blue"
        : "btn-gray";

    btn.onclick =
      ()=>setActiveService(service,index);

    companyTabs.appendChild(btn);

  });

  setActiveService(SERVICES[0],0);

}

function setActiveService(service,index){

  activeService =
    service;

  companyTabs
    ?.querySelectorAll("button")
    .forEach(btn=>{

      btn.classList.remove("btn-blue");
      btn.classList.add("btn-gray");

    });

  const btn =
    companyTabs
      ?.querySelectorAll("button")[index];

  if(btn){

    btn.classList.remove("btn-gray");
    btn.classList.add("btn-blue");

  }

  if(isSharedService(service)){

    if(individualSection){
      individualSection.style.display = "none";
    }

    if(sharedSection){
      sharedSection.style.display = "block";
    }

  }else{

    if(individualSection){
      individualSection.style.display = "block";
    }

    if(sharedSection){
      sharedSection.style.display = "none";
    }

  }

}

/* ================= INDIVIDUAL FORM ================= */

function createStopInput(value=""){

  const currentStops =
    stopsBox
      ?.querySelectorAll(".stop-input")
      .length ||
    0;

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
      value="${escapeHtml(value)}"
    >
    <button
      type="button"
      class="remove-stop-btn"
    >
      ✕
    </button>
  `;

  wrapper
    .querySelector(".remove-stop-btn")
    .onclick =
      ()=>wrapper.remove();

  stopsBox?.appendChild(wrapper);

}

addStopBtn?.addEventListener(
  "click",
  ()=>{

    if(!activeService){
      return showAlert("Select Service");
    }

    if(isSharedService(activeService)){
      return showAlert("Add Stop is disabled for Shared service.");
    }

    if(activeService.reservedAddStopEnabled !== true){
      return showAlert("Add Stop is disabled for this Reserved service.");
    }

    createStopInput();

  }
);

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

  if(submitTripBtn){
    submitTripBtn.innerText = "Add To Review";
  }

}

/* ================= SHARED FORM ================= */

function renderSharedPassengers(count){

  if(!passengersContainer){
    return;
  }

  passengersContainer.innerHTML = "";

  if(count < 2){
    return;
  }

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
          <input
            class="sharedClientName"
            placeholder="Client Name"
          >
        </div>

        <div class="field-wrap">
          <input
            class="sharedClientPhone"
            placeholder="Client Phone"
          >
        </div>

        <div class="field-wrap">
          <input
            class="sharedPickup"
            placeholder="Pickup Address"
          >
        </div>

        <div class="field-wrap">
          <input
            class="sharedDropoff"
            placeholder="Dropoff Address"
          >
        </div>
      </div>
    `;

    passengersContainer.appendChild(card);

  }

}

passengerCount?.addEventListener(
  "change",
  function(){
    renderSharedPassengers(
      Number(this.value)
    );
  }
);

function clearSharedForm(){

  if(passengerCount) passengerCount.value = "";
  if(sharedDate) sharedDate.value = "";
  if(sharedTime) sharedTime.value = "";
  if(sharedNotes) sharedNotes.value = "";
  if(passengersContainer) passengersContainer.innerHTML = "";

  editIndex = null;

  if(submitSharedBtn){
    submitSharedBtn.innerText = "Add Shared To Review";
  }

}

/* ================= BUILD PAYLOADS ================= */

function buildIndividualReviewTrip(){

  const stops =
    [...document.querySelectorAll(".stop-input")]
      .map(i=>normalizeText(i.value))
      .filter(Boolean);

  const serviceCode =
    getServiceCode(activeService);

  const suffix =
    getServiceSuffix(activeService);

  return {

    localId:
      makeLocalId(),

    type:"reserved",
    reservation:true,
    source:"RV",
    bookingSource:"RV",
    reservationStatus:"Review",
    reviewOnly:true,

    tripType:"INDIVIDUAL",
    isShared:false,

    serviceKey:serviceCode,
    serviceType:serviceCode,
    serviceCode:serviceCode,
    serviceSuffix:suffix,
    serviceTitle:getServiceTitle(activeService),

    entryName:
      normalizeText(entryName.value),

    entryPhone:
      normalizeText(entryPhone.value),

    clientName:
      normalizeText(clientName.value),

    clientPhone:
      normalizeText(clientPhone.value),

    pickup:
      normalizeAddress(pickupInput.value),

    dropoff:
      normalizeAddress(dropoffInput.value),

    stops:
      stops.map(s=>normalizeAddress(s)),

    tripDate:
      tripDate.value,

    tripTime:
      tripTime.value,

    notes:
      normalizeText(notes.value),

    status:"Review",
    dispatchSelected:false,
    disabled:false,

    priceAmount:0,
    finalPrice:0,
    miles:0,
    estimatedMinutes:0,

    addStopRequest:null,
    routeChangePending:false,
    routeChangeStatus:""

  };

}

function buildSharedReviewTrip(){

  const passengers = [];

  document
    .querySelectorAll(".passenger-card")
    .forEach((card,index)=>{

      passengers.push({

        passengerId:
          "P" + (index + 1),

        clientName:
          normalizeText(
            card.querySelector(".sharedClientName")?.value
          ),

        clientPhone:
          normalizeText(
            card.querySelector(".sharedClientPhone")?.value
          ),

        pickup:
          normalizeAddress(
            card.querySelector(".sharedPickup")?.value
          ),

        dropoff:
          normalizeAddress(
            card.querySelector(".sharedDropoff")?.value
          ),

        status:"Scheduled",
        priceAmount:0,
        finalPrice:0,
        cancelFee:0,
        noShowFee:0

      });

    });

  return {

    localId:
      makeLocalId(),

    type:"reserved",
    reservation:true,
    source:"RV",
    bookingSource:"RV",
    reservationStatus:"Review",
    reviewOnly:true,

    isShared:true,
    tripType:"SHARED",

    serviceKey:"SHARED",
    serviceType:"SHARED",
    serviceCode:"SHARED",
    serviceSuffix:"SH",
    serviceTitle:"Shared",

    entryName:
      normalizeText(sharedEntryName.value),

    entryPhone:
      normalizeText(sharedEntryPhone.value),

    passengers,

    passengerCount:
      passengers.length,

    passengersCount:
      passengers.length,

    totalPassengers:
      passengers.length,

    pickup:
      passengers[0]?.pickup || "",

    dropoff:
      passengers[passengers.length - 1]?.dropoff || "",

    stops:[],

    tripDate:
      sharedDate.value,

    tripTime:
      sharedTime.value,

    notes:
      normalizeText(sharedNotes.value),

    status:"Review",
    dispatchSelected:false,
    disabled:false,

    priceAmount:0,
    finalPrice:0,
    miles:0,
    estimatedMinutes:0

  };

}

/* ================= ADD TO LOCAL REVIEW ================= */

submitTripBtn?.addEventListener(
  "click",
  async function(){

    if(!activeService){
      return showAlert("Select Service");
    }

    if(isSharedService(activeService)){
      return showAlert("Use Shared Form");
    }

    if(!validateIndividualTrip()){
      return;
    }

    const trip =
      buildIndividualReviewTrip();

    if(editIndex !== null){

      pendingTrips[editIndex] = {
        ...pendingTrips[editIndex],
        ...trip,
        localId:
          pendingTrips[editIndex].localId ||
          trip.localId
      };

    }else{

      pendingTrips.push(trip);

    }

    saveReview();
    updateReviewCounter();
    renderPendingReview();

    clearIndividualForm();

    localStorage.removeItem(
      "dispatchTripDraft"
    );

    showAlert("Trip Added To Dispatch Review ✔");

  }
);

submitSharedBtn?.addEventListener(
  "click",
  async function(){

    if(!activeService){
      return showAlert("Select Service");
    }

    if(!validateSharedTrip()){
      return;
    }

    const trip =
      buildSharedReviewTrip();

    if(editIndex !== null){

      pendingTrips[editIndex] = {
        ...pendingTrips[editIndex],
        ...trip,
        localId:
          pendingTrips[editIndex].localId ||
          trip.localId
      };

    }else{

      pendingTrips.push(trip);

    }

    saveReview();
    updateReviewCounter();
    renderPendingReview();

    clearSharedForm();

    localStorage.removeItem(
      "dispatchSharedDraft"
    );

    showAlert("Shared Trip Added To Dispatch Review ✔");

  }
);

/* ================= REVIEW RENDER ================= */

function getCardClass(trip){

  const status =
    cleanStatus(trip.status);

  const mins =
    minutesToTrip(trip);

  if(status.includes("cancel")){
    return "cancelled";
  }

  if(status.includes("confirm")){
    return "confirmed";
  }

  if(mins !== null && mins <= 0){
    return "past";
  }

  return "";

}

function renderPendingReview(){

  const box =
    document.getElementById(
      "dispatchReviewList"
    );

  if(!box){
    return;
  }

  updateReviewCounter();

  if(!pendingTrips.length){

    box.innerHTML = `
      <div style="font-weight:900;color:#64748b;">
        No trips in review yet.
      </div>
    `;

    return;

  }

  box.innerHTML =
    pendingTrips.map((t,i)=>{

      const isShared =
        t.isShared === true;

      const service =
        getServiceByTrip(t);

      const pricing =
        service
          ? getReservedPricing(service)
          : null;

      const stopsHtml =
        !isShared &&
        Array.isArray(t.stops) &&
        t.stops.length
          ? `
            <div class="rv-stops-box">
              <b>Stops:</b>
              ${t.stops.map(s=>escapeHtml(s)).join(" | ")}
            </div>
          `
          : "";

      const activeStopBadge =
        hasActiveAddStopRequest(t)
          ? `<div class="rv-badge">Stop Request Pending</div>`
          : "";

      const routeLockedBadge =
        t.routeLocked === true
          ? `<div class="rv-badge">Route Locked</div>`
          : "";

      const passengersHtml =
        isShared
          ? `
            <div style="margin-top:8px;">
              ${(t.passengers || []).map((p,idx)=>`
                <div class="rv-passenger">
                  <b>P${idx + 1}</b>
                  ${escapeHtml(p.clientName || "-")}
                  /
                  ${escapeHtml(p.clientPhone || "-")}
                  <br>
                  ${escapeHtml(p.pickup || "-")}
                  →
                  ${escapeHtml(p.dropoff || "-")}
                </div>
              `).join("")}
            </div>
          `
          : "";

      const priceLine =
        Number(t.priceAmount || 0) > 0
          ? `
            <b>Price:</b>
            $${formatMoney(t.priceAmount)}
            |
            <b>Miles:</b>
            ${Number(t.miles || 0).toFixed(2)}
          `
          : `
            <b>Price:</b>
            Will calculate on Confirm
          `;

      return `
        <div class="rv-review-card ${getCardClass(t)}">

          <div class="rv-review-title">
            ${i + 1}.
            ${isShared ? "Shared RV" : "Individual RV"}
            -
            ${escapeHtml(t.serviceTitle || t.serviceType || "-")}
          </div>

          ${routeLockedBadge}
          ${activeStopBadge}

          <div class="rv-line">
            <b>Date:</b>
            ${escapeHtml(t.tripDate || "-")}
            |
            <b>Time:</b>
            ${escapeHtml(t.tripTime || "-")}
          </div>

          <div class="rv-line">
            <b>Status:</b>
            ${escapeHtml(t.status || "Review")}
          </div>

          <div class="rv-line">
            <b>Entry:</b>
            ${escapeHtml(t.entryName || "-")}
            /
            ${escapeHtml(t.entryPhone || "-")}
          </div>

          ${
            isShared
              ? `
                <div class="rv-line">
                  <b>Passengers:</b>
                  ${(t.passengers || []).length}
                </div>
              `
              : `
                <div class="rv-line">
                  <b>Client:</b>
                  ${escapeHtml(t.clientName || "-")}
                  /
                  ${escapeHtml(t.clientPhone || "-")}
                </div>

                <div class="rv-line">
                  <b>Route:</b>
                  ${escapeHtml(t.pickup || "-")}
                  →
                  ${escapeHtml(t.dropoff || "-")}
                </div>

                ${stopsHtml}
              `
          }

          <div class="rv-line">
            ${priceLine}
          </div>

          ${
            pricing
              ? `
                <div class="rv-line">
                  <b>Reserved Mode:</b>
                  ${escapeHtml(pricing.pricingMode)}
                  |
                  <b>Warning:</b>
                  ${Number(pricing.warningMinutes || 0)} min
                </div>
              `
              : ""
          }

          ${passengersHtml}

          ${renderPendingTripButtons(t,i)}

        </div>
      `;

    }).join("");

}

/* ================= REVIEW ACTIONS ================= */

window.deletePendingTrip =
  function(index){

    if(
      !confirm("Delete this review trip?")
    ){
      return;
    }

    pendingTrips.splice(index,1);

    saveReview();
    renderPendingReview();

  };

window.editPendingTrip =
  function(index){

    const trip =
      pendingTrips[index];

    if(!trip){
      return;
    }

    const service =
      getServiceByTrip(trip);

    const mins =
      minutesToTrip(trip);

    if(
      warningEnabled(service) &&
      mins !== null &&
      mins <= getWarningMinutes(service) &&
      mins > 0
    ){

      const ok =
        confirm(
          `This trip is within ${getWarningMinutes(service)} minutes.\n\nContinue editing?`
        );

      if(!ok){
        return;
      }

    }

    editIndex =
      index;

    const serviceIndex =
      SERVICES.findIndex(s=>{
        return (
          getServiceCode(s) ===
          normalizeCode(
            trip.serviceKey ||
            trip.serviceType
          )
        );
      });

    if(serviceIndex >= 0){
      setActiveService(
        SERVICES[serviceIndex],
        serviceIndex
      );
    }

    if(trip.isShared){

      showAddPage();

      if(sharedEntryName){
        sharedEntryName.value =
          trip.entryName || "";
      }

      if(sharedEntryPhone){
        sharedEntryPhone.value =
          trip.entryPhone || "";
      }

      if(passengerCount){
        passengerCount.value =
          trip.passengers?.length || 2;
      }

      if(sharedDate){
        sharedDate.value =
          trip.tripDate || "";
      }

      if(sharedTime){
        sharedTime.value =
          trip.tripTime || "";
      }

      if(sharedNotes){
        sharedNotes.value =
          trip.notes || "";
      }

      renderSharedPassengers(
        trip.passengers?.length || 2
      );

      const cards =
        document.querySelectorAll(
          ".passenger-card"
        );

      (trip.passengers || [])
        .forEach((p,i)=>{

          const card =
            cards[i];

          if(!card){
            return;
          }

          card.querySelector(".sharedClientName").value =
            p.clientName || "";

          card.querySelector(".sharedClientPhone").value =
            p.clientPhone || "";

          card.querySelector(".sharedPickup").value =
            p.pickup || "";

          card.querySelector(".sharedDropoff").value =
            p.dropoff || "";

        });

      if(submitSharedBtn){
        submitSharedBtn.innerText =
          "Update Review Trip";
      }

    }else{

      showAddPage();

      if(entryName){
        entryName.value =
          trip.entryName || "";
      }

      if(entryPhone){
        entryPhone.value =
          trip.entryPhone || "";
      }

      if(clientName){
        clientName.value =
          trip.clientName || "";
      }

      if(clientPhone){
        clientPhone.value =
          trip.clientPhone || "";
      }

      if(pickupInput){
        pickupInput.value =
          trip.pickup || "";
      }

      if(dropoffInput){
        dropoffInput.value =
          trip.dropoff || "";
      }

      if(tripDate){
        tripDate.value =
          trip.tripDate || "";
      }

      if(tripTime){
        tripTime.value =
          trip.tripTime || "";
      }

      if(notes){
        notes.value =
          trip.notes || "";
      }

      if(stopsBox){
        stopsBox.innerHTML = "";
      }

      (trip.stops || [])
        .forEach(stop=>createStopInput(stop));

      if(submitTripBtn){
        submitTripBtn.innerText =
          "Update Review Trip";
      }

    }

  };

window.addStopToPendingTrip =
  function(index){

    const trip =
      pendingTrips[index];

    if(!trip){
      return;
    }

    if(trip.isShared === true){
      showAlert("Add Stop is disabled for Shared trips.");
      return;
    }

    if(!reservedAllowsAddStop(trip)){
      showAlert("Add Stop is not available for this Reserved trip.");
      return;
    }

    const stop =
      prompt("Enter stop address:");

    if(!normalizeText(stop)){
      return;
    }

    const currentStops =
      Array.isArray(trip.stops)
        ? [...trip.stops]
        : [];

    if(currentStops.length >= 5){
      showAlert("Maximum 5 stops allowed.");
      return;
    }

    const existingStopsBefore =
      [...currentStops];

    const finalStops =
      [
        ...currentStops,
        normalizeAddress(stop)
      ];

    pendingTrips[index] = {
      ...trip,

      stops:finalStops,

      priceAmount:0,
      finalPrice:0,
      miles:0,
      estimatedMinutes:0,
      distanceMeters:0,
      durationSeconds:0,
      googleRoute:{},
      routePoints:[],
      optimizedRoute:null,

      routeLocked:false,
      routeFinalized:false,

      addStopRequest:{
        active:true,
        status:"PENDING",
        source:"dispatch-add-trip",
        createdAt:new Date().toISOString(),

        pickup:trip.pickup,
        dropoffBefore:trip.dropoff,
        dropoffAfter:trip.dropoff,

        existingStopsBefore,
        addedStops:[
          normalizeAddress(stop)
        ],
        finalStops
      },

      routeChangePending:true,
      routeChangeStatus:"PENDING"
    };

    saveReview();
    renderPendingReview();

    showAlert("Stop Added ✔ Price will recalculate on Confirm.");

  };

window.cancelStopFromPendingTrip =
  function(index){

    const trip =
      pendingTrips[index];

    if(!trip){
      return;
    }

    const req =
      trip.addStopRequest || null;

    if(!req || req.active !== true){
      showAlert("There is no active stop request.");
      return;
    }

    if(!confirm("Cancel added stop request?")){
      return;
    }

    const restoredStops =
      Array.isArray(req.existingStopsBefore)
        ? req.existingStopsBefore
        : Array.isArray(trip.stops)
          ? trip.stops
          : [];

    pendingTrips[index] = {
      ...trip,

      stops:restoredStops,

      priceAmount:0,
      finalPrice:0,
      miles:0,
      estimatedMinutes:0,
      distanceMeters:0,
      durationSeconds:0,
      googleRoute:{},
      routePoints:[],
      optimizedRoute:null,

      routeLocked:false,
      routeFinalized:false,

      addStopRequest:{
        ...req,
        active:false,
        status:"CANCELLED_BY_DISPATCH",
        cancelledAt:new Date().toISOString()
      },

      routeChangePending:false,
      routeChangeStatus:"CANCELLED"
    };

    saveReview();
    renderPendingReview();

    showAlert("Stop Cancelled ✔ Price will recalculate on Confirm.");

  };

/* ================= CREATE PAYLOAD ================= */

function buildFinalCreatePayload({
  trip,
  service,
  routeData,
  routePoints,
  total,
  passengers,
  passengerCount,
  pricePerPassenger,
  stopsCount,
  statusOverride
}){

  const isShared =
    trip.isShared === true;

  const pricing =
    getReservedPricing(service);

  const serviceCode =
    isShared
      ? "SHARED"
      : getServiceCode(service);

  const serviceSuffix =
    isShared
      ? "SH"
      : getServiceSuffix(service);

  const serviceTitle =
    isShared
      ? "Shared"
      : getServiceTitle(service);

  const payload = {

    ...trip,

    type:"reserved",
    reservation:true,
    source:"RV",
    bookingSource:"RV",
    reservationStatus:"RV",
    reviewOnly:false,

    status:
      statusOverride || "Confirmed",

    dispatchSelected:
      statusOverride === "Cancelled"
        ? false
        : true,

    driverAssigned:false,
    disabled:false,

    isShared,
    tripType:
      isShared
        ? "SHARED"
        : "INDIVIDUAL",

    serviceKey:serviceCode,
    serviceType:serviceCode,
    serviceCode:serviceCode,
    serviceSuffix:serviceSuffix,
    serviceTitle:serviceTitle,

    vehicleTypeFromQuote:serviceCode,
    vehicleType:serviceCode,

    passengers:
      Array.isArray(passengers)
        ? passengers
        : [],

    totalPassengers:
      passengerCount,

    passengerCount:
      passengerCount,

    passengersCount:
      passengerCount,

    pickup:
      isShared
        ? passengers?.[0]?.pickup || trip.pickup || ""
        : trip.pickup,

    dropoff:
      isShared
        ? passengers?.[passengers.length - 1]?.dropoff || trip.dropoff || ""
        : trip.dropoff,

    stops:
      isShared
        ? []
        : Array.isArray(trip.stops)
          ? trip.stops
          : [],

    priceAmount:
      Number(total || 0),

    finalPrice:
      Number(total || 0),

    pricePerPassenger:
      Number(pricePerPassenger || 0),

    miles:
      Number(routeData?.miles || 0),

    distanceMeters:
      Number(routeData?.distanceMeters || 0),

    durationSeconds:
      Number(routeData?.durationSeconds || 0),

    estimatedMinutes:
      Number(routeData?.estimatedMinutes || 0),

    googleRoute:
      routeData?.googleRoute || {},

    routePoints:
      routePoints || [],

    optimizedRoute:
      routeData?.googleRoute || {},

    sharedStopsCount:
      isShared
        ? Number(stopsCount || 0)
        : 0,

    cancelFee:
      Number(pricing.cancelFee || 0),

    noShowFee:
      Number(pricing.noShowFee || 0),

    reservedPricingMode:
      pricing.pricingMode,

    reservedPriceSnapshot:{
      pricingMode:pricing.pricingMode,
      baseFare:pricing.baseFare,
      includedMiles:pricing.includedMiles,
      perMile:pricing.perMile,
      hourlyRate:pricing.hourlyRate,
      hourlyBillingMode:pricing.hourlyBillingMode,
      stopFee:pricing.stopFee,
      noShowFee:pricing.noShowFee,
      cancelFee:pricing.cancelFee,
      sharedPrice:pricing.sharedPrice,
      warningMinutes:pricing.warningMinutes,
      disableCancel:pricing.disableCancel
    },

    routeLocked:
      statusOverride === "Cancelled"
        ? false
        : true,

    routeFinalized:
      statusOverride === "Cancelled"
        ? false
        : true,

    routeSource:
      statusOverride === "Cancelled"
        ? "dispatch-add-trip-cancel"
        : "dispatch-add-trip",

    routeUpdatedAt:
      new Date().toISOString(),

    createdFrom:
      "dispatch-add-trip",

    bookedAt:
      new Date().toISOString()

  };

  delete payload.localId;
  delete payload._id;
  delete payload.id;

  return payload;

}

/* ================= CONFIRM CREATE RV ================= */

window.createTripFromReview =
  async function(index,btn){

    const trip =
      pendingTrips[index];

    if(!trip){
      return;
    }

    if(
      !confirm(
        "Confirm this RV trip and send it to Trips Hub?"
      )
    ){
      return;
    }

    const oldText =
      btn ? btn.innerText : "";

    try{

      if(btn){
        btn.disabled = true;
        btn.innerText = "Routing...";
      }

      const isShared =
        trip.isShared === true;

      const service =
        getServiceByTrip(trip);

      if(!service){
        throw new Error("Reserved service not found");
      }

      let routePoints = [];
      let passengers = [];
      let activeCount = 1;

      if(isShared){

        const finalRoute =
          await buildFinalSharedRoute(trip);

        routePoints =
          finalRoute.routePoints;

        passengers =
          finalRoute.passengers;

        activeCount =
          finalRoute.activeCount || 1;

      }else{

        routePoints =
          buildIndividualRoutePoints(trip);

        passengers = [];
        activeCount = 1;

      }

      if(routePoints.length < 2){
        throw new Error("Route is missing pickup/dropoff");
      }

      const routeData =
        await calculateRouteMiles(routePoints);

      if(btn){
        btn.innerText = "Pricing...";
      }

      const passengerCount =
        isShared
          ? Math.max(
              1,
              Number(
                trip.totalPassengers ||
                trip.passengers?.length ||
                activeCount ||
                1
              )
            )
          : 1;

      const stopsCount =
        isShared
          ? Math.max(0, activeCount - 1)
          : Array.isArray(trip.stops)
            ? trip.stops.length
            : 0;

      const pricing =
        getReservedPricing(service);

      const total =
        calculateReservedPrice({
          service,
          miles:routeData.miles,
          minutes:routeData.estimatedMinutes,
          stops:stopsCount,
          passengerCount:
            isShared
              ? activeCount
              : 1
        });

      let pricePerPassenger = 0;

      if(isShared){

        pricePerPassenger =
          Number(
            (
              Number(total || 0) /
              Math.max(1, activeCount)
            ).toFixed(2)
          );

        passengers =
          passengers.map(p=>{

            const s =
              cleanStatus(p.status);

            if(
              s.includes("no") ||
              s.includes("cancel")
            ){
              return p;
            }

            return {
              ...p,
              status:"Confirmed",
              priceAmount:pricePerPassenger,
              finalPrice:pricePerPassenger,
              cancelFee:Number(pricing.cancelFee || 0),
              noShowFee:Number(pricing.noShowFee || 0)
            };

          });

      }

      const payload =
        buildFinalCreatePayload({
          trip,
          service,
          routeData,
          routePoints,
          total,
          passengers,
          passengerCount,
          pricePerPassenger,
          stopsCount,
          statusOverride:"Confirmed"
        });

      if(btn){
        btn.innerText = "Creating...";
      }

      const res =
        await fetch(
          API_URL,
          {
            method:"POST",
            headers:{
              "Content-Type":"application/json",
              Authorization:"Bearer " + token
            },
            body:JSON.stringify(payload)
          }
        );

      const data =
        await res.json().catch(()=>({}));

      if(!res.ok){
        throw new Error(
          data.message ||
          "Create RV trip failed"
        );
      }

      pendingTrips.splice(index,1);

      saveReview();
      renderPendingReview();
      updateReviewCounter();

      showAlert(
        "RV Trip Confirmed And Sent To Trips Hub ✔"
      );

    }catch(err){

      console.error(err);

      showAlert(
        err.message ||
        "Confirm failed"
      );

      if(btn){
        btn.disabled = false;
        btn.innerText = oldText || "Confirm";
      }

    }

  };

/* ================= CANCEL CONFIRMED LOCAL RV ================= */

window.cancelPendingConfirmedTrip =
  async function(index,btn){

    const trip =
      pendingTrips[index];

    if(!trip){
      return;
    }

    if(!confirm("Cancel this RV trip?")){
      return;
    }

    const oldText =
      btn ? btn.innerText : "";

    try{

      if(btn){
        btn.disabled = true;
        btn.innerText = "Cancelling...";
      }

      const service =
        getServiceByTrip(trip);

      if(!service){
        throw new Error("Reserved service not found");
      }

      const pricing =
        getReservedPricing(service);

      const cancelFee =
        warningEnabled(service)
          ? Number(pricing.cancelFee || 0)
          : 0;

      const payload =
        buildFinalCreatePayload({
          trip:{
            ...trip,
            status:"Cancelled",
            cancelDateTime:new Date().toISOString()
          },
          service,
          routeData:{
            miles:0,
            distanceMeters:0,
            durationSeconds:0,
            estimatedMinutes:0,
            googleRoute:{}
          },
          routePoints:[],
          total:cancelFee,
          passengers:
            Array.isArray(trip.passengers)
              ? trip.passengers.map(p=>({
                  ...p,
                  status:"Cancelled",
                  cancelFee,
                  priceAmount:cancelFee,
                  finalPrice:cancelFee
                }))
              : [],
          passengerCount:
            trip.isShared
              ? Number(trip.totalPassengers || trip.passengers?.length || 1)
              : 1,
          pricePerPassenger:
            trip.isShared
              ? cancelFee
              : 0,
          stopsCount:0,
          statusOverride:"Cancelled"
        });

      const res =
        await fetch(
          API_URL,
          {
            method:"POST",
            headers:{
              "Content-Type":"application/json",
              Authorization:"Bearer " + token
            },
            body:JSON.stringify(payload)
          }
        );

      const data =
        await res.json().catch(()=>({}));

      if(!res.ok){
        throw new Error(
          data.message ||
          "Cancel RV failed"
        );
      }

      pendingTrips.splice(index,1);

      saveReview();
      renderPendingReview();
      updateReviewCounter();

      showAlert("RV Trip Cancelled ✔");

    }catch(err){

      console.error(err);

      showAlert(
        err.message ||
        "Cancel failed"
      );

      if(btn){
        btn.disabled = false;
        btn.innerText = oldText || "Cancel";
      }

    }

  };

/* ================= DRAFTS ================= */

saveDraftBtn?.addEventListener(
  "click",
  ()=>{

    const draft = {
      serviceKey:
        activeService
          ? getServiceCode(activeService)
          : "",

      clientName:
        clientName?.value || "",

      clientPhone:
        clientPhone?.value || "",

      pickup:
        pickupInput?.value || "",

      dropoff:
        dropoffInput?.value || "",

      tripDate:
        tripDate?.value || "",

      tripTime:
        tripTime?.value || "",

      notes:
        notes?.value || "",

      stops:
        [...document.querySelectorAll(".stop-input")]
          .map(i=>i.value)
    };

    localStorage.setItem(
      "dispatchTripDraft",
      JSON.stringify(draft)
    );

    showAlert("Draft Saved ✔");

  }
);

saveSharedDraftBtn?.addEventListener(
  "click",
  ()=>{

    const passengers = [];

    document
      .querySelectorAll(".passenger-card")
      .forEach(card=>{

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
        passengerCount:
          passengerCount?.value || "",

        sharedDate:
          sharedDate?.value || "",

        sharedTime:
          sharedTime?.value || "",

        sharedNotes:
          sharedNotes?.value || "",

        entryName:
          sharedEntryName?.value || "",

        entryPhone:
          sharedEntryPhone?.value || "",

        passengers
      })
    );

    showAlert("Shared Draft Saved ✔");

  }
);

function loadDrafts(){

  const draft =
    JSON.parse(
      localStorage.getItem("dispatchTripDraft") ||
      "{}"
    );

  if(clientName){
    clientName.value = draft.clientName || "";
  }

  if(clientPhone){
    clientPhone.value = draft.clientPhone || "";
  }

  if(pickupInput){
    pickupInput.value = draft.pickup || "";
  }

  if(dropoffInput){
    dropoffInput.value = draft.dropoff || "";
  }

  if(tripDate){
    tripDate.value = draft.tripDate || "";
  }

  if(tripTime){
    tripTime.value = draft.tripTime || "";
  }

  if(notes){
    notes.value = draft.notes || "";
  }

  (draft.stops || [])
    .forEach(stop=>createStopInput(stop));

  const sharedDraft =
    JSON.parse(
      localStorage.getItem("dispatchSharedDraft") ||
      "{}"
    );

  if(
    sharedDraft.entryName &&
    sharedEntryName
  ){
    sharedEntryName.value =
      sharedDraft.entryName;
  }

  if(
    sharedDraft.entryPhone &&
    sharedEntryPhone
  ){
    sharedEntryPhone.value =
      sharedDraft.entryPhone;
  }

  if(passengerCount){
    passengerCount.value =
      sharedDraft.passengerCount || "";
  }

  if(sharedDate){
    sharedDate.value =
      sharedDraft.sharedDate || "";
  }

  if(sharedTime){
    sharedTime.value =
      sharedDraft.sharedTime || "";
  }

  if(sharedNotes){
    sharedNotes.value =
      sharedDraft.sharedNotes || "";
  }

  if(sharedDraft.passengerCount){

    renderSharedPassengers(
      Number(sharedDraft.passengerCount)
    );

    const cards =
      document.querySelectorAll(
        ".passenger-card"
      );

    (sharedDraft.passengers || [])
      .forEach((p,index)=>{

        const card =
          cards[index];

        if(!card){
          return;
        }

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