/* =====================================================
FILE: add-trip.js
PART 1
FINAL COMPLETE VERSION
===================================================== */

document.addEventListener("DOMContentLoaded", function(){

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

const companyName =
localStorage.getItem("name") || "";

if(
  !token ||
  role !== "company"
){
  window.location.replace(
    "company-login.html"
  );
  return;
}

/* =====================================================
STATE
===================================================== */

let COMPANY_SERVICES = [];

let activeService = "STANDARD";

let activeSuffix = "ST";

/* =====================================================
BILLING CHECK
===================================================== */

async function checkBillingLock(){

  try{

    const res = await fetch(

      "/api/company/billing?company=" +

      encodeURIComponent(companyName),

      {
        headers:{
          Authorization:
          "Bearer " + token
        }
      }

    );

    const data =
    await res.json();

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
          </p>

          <a
            href="/companies/payment.html"
            style="
              display:inline-block;
              margin-top:25px;
              background:#2563eb;
              color:#fff;
              text-decoration:none;
              padding:14px 22px;
              border-radius:12px;
              font-weight:800;
            "
          >
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

/* =====================================================
START
===================================================== */

(async()=>{

const ok =
await checkBillingLock();

if(!ok){
  return;
}

/* =====================================================
ELEMENTS
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

/* ================= INDIVIDUAL ================= */

const entryName =
document.getElementById(
  "entryName"
);

const entryPhone =
document.getElementById(
  "entryPhone"
);

const editEntryBtn =
document.getElementById(
  "editEntryBtn"
);

const saveEntryBtn =
document.getElementById(
  "saveEntryBtn"
);

const saveDraftBtn =
document.getElementById(
  "saveDraftBtn"
);

const clientName =
document.getElementById(
  "clientName"
);

const clientPhone =
document.getElementById(
  "clientPhone"
);

const pickupInput =
document.getElementById(
  "pickup"
);

const dropoffInput =
document.getElementById(
  "dropoff"
);

const tripDate =
document.getElementById(
  "tripDate"
);

const tripTime =
document.getElementById(
  "tripTime"
);

const notes =
document.getElementById(
  "notes"
);

const stopsBox =
document.getElementById(
  "stops"
);

const addStopBtn =
document.getElementById(
  "addStopBtn"
);

const submitTripBtn =
document.getElementById(
  "submitTrip"
);

/* ================= SHARED ================= */

const sharedEntryName =
document.getElementById(
  "sharedEntryName"
);

const sharedEntryPhone =
document.getElementById(
  "sharedEntryPhone"
);

const editSharedEntryBtn =
document.getElementById(
  "editSharedEntryBtn"
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

const saveSharedDraftBtn =
document.getElementById(
  "saveSharedDraftBtn"
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

/* =====================================================
CURRENT SERVICE
===================================================== */

function getCurrentServiceConfig(){

  return COMPANY_SERVICES.find(
    s =>
      s.serviceKey === activeService
  ) || {};

}

/* =====================================================
DYNAMIC WARNING
===================================================== */

function checkDynamicWarning(
  dateValue,
  timeValue
){

  const service =
    getCurrentServiceConfig();

  if(!service){
    return true;
  }

  const warningEnabled =

    service.companyWarningEnabled !== false &&
    service.warningEnabled !== false;

  if(!warningEnabled){
    return true;
  }

  const warningMinutes =
    Number(

      service.companyWarningMinutes ||

      service.warningMinutes ||

      120

    );

  if(
    !dateValue ||
    !timeValue
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
    (
      tripDateTime - now
    ) / 60000;

  if(diff <= warningMinutes){

    return confirm(

`WARNING

This trip is within ${warningMinutes} minutes.

Continue anyway?`

    );

  }

  return true;

}

/* =====================================================
ENTRY INFO
===================================================== */

function loadEntryInfo(){

  const saved = JSON.parse(

    localStorage.getItem(
      "entryInfo"
    ) || "{}"

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

      entryName:
      entryName.value,

      entryPhone:
      entryPhone.value

    })

  );

  showAlert(
    "Entry Info Saved ✔"
  );

}

let entryEditMode = false;

function toggleEntryEdit(){

  if(!entryEditMode){

    entryEditMode = true;

    entryName.removeAttribute(
      "readonly"
    );

    entryPhone.removeAttribute(
      "readonly"
    );

    sharedEntryName.removeAttribute(
      "readonly"
    );

    sharedEntryPhone.removeAttribute(
      "readonly"
    );

    if(editEntryBtn){
      editEntryBtn.innerText =
      "Save";
    }

    if(editSharedEntryBtn){
      editSharedEntryBtn.innerText =
      "Save";
    }

    entryName.focus();

  }else{

    saveEntryInfo();

    entryEditMode = false;

    entryName.setAttribute(
      "readonly",
      true
    );

    entryPhone.setAttribute(
      "readonly",
      true
    );

    sharedEntryName.setAttribute(
      "readonly",
      true
    );

    sharedEntryPhone.setAttribute(
      "readonly",
      true
    );

    if(editEntryBtn){
      editEntryBtn.innerText =
      "Edit";
    }

    if(editSharedEntryBtn){
      editSharedEntryBtn.innerText =
      "Edit";
    }

  }

}

if(editEntryBtn){
  editEntryBtn.onclick =
  toggleEntryEdit;
}

if(editSharedEntryBtn){
  editSharedEntryBtn.onclick =
  toggleEntryEdit;
}

if(saveEntryBtn){
  saveEntryBtn.onclick =
  saveEntryInfo;
}

loadEntryInfo();