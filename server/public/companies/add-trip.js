/* =====================================================
FILE: add-trip.js
FINAL DYNAMIC COMPANY SERVICES VERSION
===================================================== */

document.addEventListener("DOMContentLoaded", function(){

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const companyName = localStorage.getItem("name") || "";

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}

/* =====================================================
   COMPANY SERVICES
===================================================== */

let COMPANY_SERVICES = [

  {
    key:"STANDARD",
    title:"Standard",
    suffix:"ST",
    shared:false,
    active:true,

    warningEnabled:true,
    warningMinutes:120,

    warningMessage:
    "Trip is within 120 minutes.\nEditing may be restricted.\nContinue?",

    cancelFee:15
  },

  {
    key:"XL",
    title:"XL",
    suffix:"XL",
    shared:false,
    active:true,

    warningEnabled:true,
    warningMinutes:180,

    warningMessage:
    "XL trip is within 180 minutes.\nContinue?",

    cancelFee:25
  },

  {
    key:"TAXI",
    title:"Taxi",
    suffix:"TX",
    shared:false,
    active:true,

    warningEnabled:false,
    warningMinutes:0,

    warningMessage:"",

    cancelFee:0
  },

  {
    key:"LIMO",
    title:"Limousine",
    suffix:"LM",
    shared:false,
    active:true,

    warningEnabled:true,
    warningMinutes:360,

    warningMessage:
    "Limousine booking is within 6 hours.\nContinue?",

    cancelFee:50
  },

  {
    key:"WHEELCHAIR",
    title:"Wheelchair",
    suffix:"WH",
    shared:false,
    active:true,

    warningEnabled:true,
    warningMinutes:240,

    warningMessage:
    "Wheelchair trip is within restricted time.\nContinue?",

    cancelFee:30
  },

  {
    key:"SHARED",
    title:"Shared",
    suffix:"SH",
    shared:true,
    active:true,

    warningEnabled:true,
    warningMinutes:120,

    warningMessage:
    "Shared trip is within 120 minutes.\nContinue?",

    cancelFee:15
  }

];

let activeService = "STANDARD";
let activeSuffix  = "ST";

/* =====================================================
   BILLING CHECK
===================================================== */

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

const ok = await checkBillingLock();

if(!ok){
  return;
}

/* =====================================================
   DYNAMIC TABS
===================================================== */

const companyTabs =
document.getElementById(
  "companyTabs"
);

const individualSection =
document.getElementById(
  "individualSection"
);

const sharedSection =
document.getElementById(
  "sharedSection"
);

function buildDynamicTabs(){

  if(!companyTabs) return;

  companyTabs.innerHTML = "";

  const activeTabs =
  COMPANY_SERVICES.filter(
    s => s.active === true
  );

  activeTabs.forEach(
    (service,index)=>{

      const btn =
      document.createElement(
        "button"
      );

      btn.type = "button";

      btn.innerText =
      service.title;

      btn.dataset.service =
      service.key;

      btn.dataset.suffix =
      service.suffix;

      btn.className =
        index === 0
        ? "btn-blue"
        : "btn-gray";

      if(index === 0){

        activeService =
        service.key;

        activeSuffix =
        service.suffix;

        if(service.shared){

          individualSection.style.display =
          "none";

          sharedSection.style.display =
          "block";

        }else{

          individualSection.style.display =
          "block";

          sharedSection.style.display =
          "none";

        }

      }

      companyTabs.appendChild(
        btn
      );

      btn.addEventListener(
        "click",
        function(){

          companyTabs
          .querySelectorAll(
            "button"
          )
          .forEach(b=>{

            b.classList.remove(
              "btn-blue"
            );

            b.classList.add(
              "btn-gray"
            );

          });

          btn.classList.remove(
            "btn-gray"
          );

          btn.classList.add(
            "btn-blue"
          );

          activeService =
          service.key;

          activeSuffix =
          service.suffix;

          if(service.shared){

            individualSection.style.display =
            "none";

            sharedSection.style.display =
            "block";

          }else{

            individualSection.style.display =
            "block";

            sharedSection.style.display =
            "none";

          }

        }
      );

    }
  );

}

buildDynamicTabs();

/* =====================================================
   ELEMENTS
===================================================== */

const entryName   = document.getElementById("entryName");
const entryPhone  = document.getElementById("entryPhone");

const clientName  = document.getElementById("clientName");
const clientPhone = document.getElementById("clientPhone");

const pickupInput  = document.getElementById("pickup");
const dropoffInput = document.getElementById("dropoff");

const tripDate = document.getElementById("tripDate");
const tripTime = document.getElementById("tripTime");
const notes    = document.getElementById("notes");

const stopsBox   = document.getElementById("stops");
const addStopBtn = document.getElementById("addStopBtn");

const submitTripBtn = document.getElementById("submitTrip");

/* SHARED */

const sharedEntryName =
document.getElementById(
  "sharedEntryName"
);

const sharedEntryPhone =
document.getElementById(
  "sharedEntryPhone"
);

const passengerCount =
document.getElementById(
  "passengerCount"
);

const sharedDate =
document.getElementById(
  "sharedDate"
);

const sharedTime =
document.getElementById(
  "sharedTime"
);

const sharedNotes =
document.getElementById(
  "sharedNotes"
);

const passengersContainer =
document.getElementById(
  "passengersContainer"
);

const submitSharedBtn =
document.getElementById(
  "submitShared"
);

/* =====================================================
   HELPERS
===================================================== */

function getArizonaNow(){

  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone:
        "America/Phoenix"
      }
    )
  );

}

function normalizeText(value){

  return String(
    value ?? ""
  ).trim();

}

function showAlert(msg){

  alert(msg);

}

function getCurrentServiceConfig(){

  return COMPANY_SERVICES.find(
    s => s.key === activeService
  ) || {};

}

function validateFutureTime(
  dateValue,
  timeValue
){

  if(!dateValue || !timeValue){

    showAlert(
      "Please select trip date and time."
    );

    return false;

  }

  const tripDateTime =
  new Date(
    `${dateValue}T${timeValue}:00`
  );

  const now =
  getArizonaNow();

  if(
    isNaN(
      tripDateTime.getTime()
    )
  ){

    showAlert(
      "Invalid trip date/time."
    );

    return false;

  }

  if(tripDateTime <= now){

    showAlert(
      "Trip time already passed."
    );

    return false;

  }

  return true;

}

function checkDynamicWarning(
  dateValue,
  timeValue
){

  const config =
  getCurrentServiceConfig();

  if(
    config.warningEnabled === false
  ){
    return true;
  }

  const tripDateTime =
  new Date(
    `${dateValue}T${timeValue}:00`
  );

  const now =
  getArizonaNow();

  const diff =
  (tripDateTime - now) / 60000;

  const warningMinutes =
  Number(
    config.warningMinutes || 0
  );

  if(diff < warningMinutes){

    return confirm(

      config.warningMessage ||

      `Trip is within ${warningMinutes} minutes.\nContinue?`

    );

  }

  return true;

}

/* =====================================================
   STOPS
===================================================== */

function createStopInput(
  value = ""
){

  const currentStops =
  stopsBox.querySelectorAll(
    ".stop-input"
  ).length;

  if(currentStops >= 5){

    showAlert(
      "Maximum 5 stops allowed."
    );

    return;

  }

  const wrapper =
  document.createElement("div");

  wrapper.className =
  "stop-row";

  const input =
  document.createElement("input");

  input.type = "text";

  input.className =
  "stop-input";

  input.placeholder =
  "Stop address";

  input.value = value;

  const removeBtn =
  document.createElement(
    "button"
  );

  removeBtn.type = "button";

  removeBtn.className =
  "remove-stop-btn";

  removeBtn.innerText = "✕";

  removeBtn.onclick = ()=>{
    wrapper.remove();
  };

  wrapper.appendChild(input);

  wrapper.appendChild(
    removeBtn
  );

  stopsBox.appendChild(
    wrapper
  );

}

if(addStopBtn){

  addStopBtn.addEventListener(
    "click",
    function(){

      createStopInput();

    }
  );

}

/* =====================================================
   SHARED PASSENGERS
===================================================== */

function renderSharedPassengers(
  count
){

  passengersContainer.innerHTML =
  "";

  for(
    let i = 1;
    i <= count;
    i++
  ){

    const card =
    document.createElement("div");

    card.className =
    "passenger-card";

    card.innerHTML = `

      <div class="passenger-header">

        <h4>
          Passenger ${i}
        </h4>

        <button
          type="button"
          class="remove-passenger"
        >
          ✕
        </button>

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

    card.querySelector(
      ".remove-passenger"
    ).onclick = ()=>{

      card.remove();

    };

    passengersContainer.appendChild(
      card
    );

  }

}

if(passengerCount){

  passengerCount.addEventListener(
    "change",
    function(){

      renderSharedPassengers(
        Number(this.value)
      );

    }
  );

}

/* =====================================================
   SUBMIT INDIVIDUAL
===================================================== */

if(submitTripBtn){

submitTripBtn.addEventListener(
"click",
async function(){

if(
  !validateFutureTime(
    tripDate.value,
    tripTime.value
  )
){
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

submitTripBtn.innerText =
"Saving...";

try{

const stops =
[
  ...document.querySelectorAll(
    ".stop-input"
  )
]
.map(i=>normalizeText(i.value))
.filter(Boolean);

const trip = {

  company:companyName,

  type:"company",

  tripType:"INDIVIDUAL",

  isShared:false,

  serviceType:
  activeService,

  serviceSuffix:
  activeSuffix,

  entryName:
  entryName.value,

  entryPhone:
  entryPhone.value,

  clientName:
  clientName.value,

  clientPhone:
  clientPhone.value,

  pickup:
  pickupInput.value,

  dropoff:
  dropoffInput.value,

  stops:stops,

  tripDate:
  tripDate.value,

  tripTime:
  tripTime.value,

  notes:
  notes.value,

  priceAmount:0,

  miles:0,

  estimatedMinutes:0,

  durationSeconds:0,

  distanceMeters:0,

  status:"Scheduled"

};

const res =
await fetch(
  "/api/trips",
  {
    method:"POST",
    headers:{
      "Content-Type":
      "application/json",

      Authorization:
      "Bearer " + token
    },
    body:JSON.stringify(trip)
  }
);

if(!res.ok){

  const err =
  await res.json()
  .catch(()=>({}));

  throw new Error(
    err.message ||
    "Server Error"
  );

}

const savedTrip =
await res.json();

showAlert(
  `Trip Saved ✔\n\nTrip #: ${savedTrip.tripNumber}`
);

clientName.value = "";
clientPhone.value = "";
pickupInput.value = "";
dropoffInput.value = "";
tripDate.value = "";
tripTime.value = "";
notes.value = "";

stopsBox.innerHTML = "";

}catch(err){

showAlert(
  err.message ||
  "Server Error"
);

console.log(err);

}finally{

submitTripBtn.disabled =
false;

submitTripBtn.innerText =
"Submit Trip";

}

});
}

/* =====================================================
   SUBMIT SHARED
===================================================== */

if(submitSharedBtn){

submitSharedBtn.addEventListener(
"click",
async function(){

if(
  !validateFutureTime(
    sharedDate.value,
    sharedTime.value
  )
){
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

const passengers = [];

document
.querySelectorAll(
  ".passenger-card"
)
.forEach((card,index)=>{

  passengers.push({

    passengerId:
    "P" + (index + 1),

    name:
    card.querySelector(
      ".sharedClientName"
    ).value,

    phone:
    card.querySelector(
      ".sharedClientPhone"
    ).value,

    clientName:
    card.querySelector(
      ".sharedClientName"
    ).value,

    clientPhone:
    card.querySelector(
      ".sharedClientPhone"
    ).value,

    pickup:
    card.querySelector(
      ".sharedPickup"
    ).value,

    dropoff:
    card.querySelector(
      ".sharedDropoff"
    ).value,

    status:"Scheduled"

  });

});

submitSharedBtn.disabled =
true;

submitSharedBtn.innerText =
"Saving...";

try{

const sharedTrip = {

  company:companyName,

  type:"company",

  isShared:true,

  tripType:"SHARED",

  serviceType:"SHARED",

  serviceSuffix:"SH",

  sharedSuffix:"-SH",

  entryName:
  sharedEntryName.value,

  entryPhone:
  sharedEntryPhone.value,

  clientName:
  "Shared Trip",

  clientPhone:
  passengers[0]?.phone || "",

  pickup:
  passengers[0]?.pickup || "",

  dropoff:
  passengers[
    passengers.length - 1
  ]?.dropoff || "",

  passengers:
  passengers,

  totalPassengers:
  passengers.length,

  tripDate:
  sharedDate.value,

  tripTime:
  sharedTime.value,

  notes:
  sharedNotes.value,

  priceAmount:0,

  miles:0,

  estimatedMinutes:0,

  durationSeconds:0,

  distanceMeters:0,

  status:"Scheduled"

};

const res =
await fetch(
  "/api/trips",
  {
    method:"POST",
    headers:{
      "Content-Type":
      "application/json",

      Authorization:
      "Bearer " + token
    },
    body:JSON.stringify(
      sharedTrip
    )
  }
);

if(!res.ok){

  const err =
  await res.json()
  .catch(()=>({}));

  throw new Error(
    err.message ||
    "Server Error"
  );

}

const savedTrip =
await res.json();

showAlert(
  `Shared Trip Saved ✔\n\nTrip #: ${savedTrip.tripNumber}`
);

passengersContainer.innerHTML =
"";

sharedNotes.value = "";

sharedDate.value = "";

sharedTime.value = "";

passengerCount.value = "";

}catch(err){

showAlert(
  err.message ||
  "Server Error"
);

console.log(err);

}finally{

submitSharedBtn.disabled =
false;

submitSharedBtn.innerText =
"Submit Shared";

}

});
}

})(); // END ASYNC

}); // END DOM