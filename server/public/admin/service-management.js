// =========================
// FILE: public/admin/service-management.js
// FULL FINAL VERSION
// =========================

console.log("SERVICE JS LOADED");

const servicesGrid =
document.getElementById("servicesGrid");

const companyServicesGrid =
document.getElementById("companyServicesGrid");

/* =========================
   SERVICES
========================= */

let services = [];
let companyServices = [];

/* =========================
   LOAD SERVICES
========================= */

async function loadServices(){

  try{

    const res =
    await fetch("/api/services");

    services =
    await res.json();

    if(!Array.isArray(services)){
      services = [];
    }

    /* =========================
       COMPANY SERVICES
    ========================== */

    companyServices =
    services.map(service=>({

      ...service,

      enabled:
      service.companyEnabled === true,

      shared:
      service.companyShared === true,

      suffix:
      service.companySuffix || "ST",

      warningEnabled:
      service.companyWarningEnabled === true,

      warningMinutes:
      Number(
        service.companyWarningMinutes || 0
      ),

      cancelFee:
      Number(
        service.companyCancelFee || 0
      )

    }));

    renderServices();

    renderCompanyServices();

  }catch(err){

    console.log(err);

    alert("Failed To Load Services");

  }

}

/* =========================
   RENDER INDIVIDUAL
========================= */

function renderServices(){

  servicesGrid.innerHTML = "";

  services.forEach(service=>{

    const card =
    document.createElement("div");

    card.className =
    "service-card";

    card.innerHTML = `

      <div class="service-top">

        <div class="service-info">

          <div class="service-icon">
            ${service.icon || "🚘"}
          </div>

          <div>

            <div class="service-name">
              ${service.title || ""}
            </div>

            <div class="service-status">

              ${
                service.enabled
                ? "Visible To Customers"
                : "Hidden From Customers"
              }

            </div>

          </div>

        </div>

        <button
          class="
            toggle-btn
            ${
              service.enabled
              ? "toggle-on"
              : "toggle-off"
            }
          "
          onclick="
            toggleService('${service._id}')
          "
        >

          ${
            service.enabled
            ? "ACTIVE"
            : "DISABLED"
          }

        </button>

      </div>

      <div class="
        warning-box
        ${
          service.enabled
          ? "warning-green"
          : "warning-red"
        }
      ">

        ${
          service.enabled
          ? "Customers Can Book This Service"
          : "This Service Is Hidden"
        }

      </div>

      <div class="fields">

        <div class="field">

          <label>Pricing Mode</label>

          <select
            id="mode-${service._id}"
            disabled
          >

            <option
              value="MILE"
              ${
                String(service.pricingMode || "")
                .toUpperCase()==="MILE"
                ? "selected"
                : ""
              }
            >
              Per Mile
            </option>

            <option
              value="HOURLY"
              ${
                String(service.pricingMode || "")
                .toUpperCase()==="HOURLY"
                ? "selected"
                : ""
              }
            >
              Hourly
            </option>

            <option
              value="SHARED"
              ${
                String(service.pricingMode || "")
                .toUpperCase()==="SHARED"
                ? "selected"
                : ""
              }
            >
              Shared
            </option>

          </select>

        </div>

        <div class="field">

          <label>Base Fare</label>

          <input
            type="number"
            id="base-${service._id}"
            value="${service.baseFare || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>Included Miles</label>

          <input
            type="number"
            id="included-${service._id}"
            value="${service.includedMiles || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>Per Mile</label>

          <input
            type="number"
            id="mile-${service._id}"
            value="${service.perMile || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>Hourly Rate</label>

          <input
            type="number"
            id="hour-${service._id}"
            value="${service.hourlyRate || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>Hourly Billing</label>

          <select
            id="hourmode-${service._id}"
            disabled
          >

            <option
              value="FULL"
              ${
                String(
                  service.hourlyBillingMode || ""
                ).toUpperCase()==="FULL"
                ? "selected"
                : ""
              }
            >
              Full Hour
            </option>

            <option
              value="QUARTER"
              ${
                String(
                  service.hourlyBillingMode || ""
                ).toUpperCase()==="QUARTER"
                ? "selected"
                : ""
              }
            >
              Quarter Hour
            </option>

          </select>

        </div>

        <div class="field">

          <label>Stop Fee</label>

          <input
            type="number"
            id="stop-${service._id}"
            value="${service.stopFee || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>No Show Fee</label>

          <input
            type="number"
            id="noshow-${service._id}"
            value="${service.noShowFee || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>Shared Price</label>

          <input
            type="number"
            id="shared-${service._id}"
            value="${service.sharedPrice || 0}"
            disabled
          >

        </div>

        <!-- WARNING POLICY -->

        <div class="policy-title">
          Warning Policy
        </div>

        <div class="field">

          <label>Warning Enabled</label>

          <select
            id="warning-${service._id}"
            disabled
          >

            <option
              value="true"
              ${service.warningEnabled ? "selected" : ""}
            >
              Enabled
            </option>

            <option
              value="false"
              ${!service.warningEnabled ? "selected" : ""}
            >
              Disabled
            </option>

          </select>

        </div>

        <div class="field">

          <label>Warning Minutes</label>

          <input
            type="number"
            id="minutes-${service._id}"
            value="${service.warningMinutes || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>Cancel Fee</label>

          <input
            type="number"
            id="cancel-${service._id}"
            value="${service.cancelFee || 0}"
            disabled
          >

        </div>

      </div>

      <div class="buttons">

        <button
          class="edit-btn"
          onclick="
            enableEdit('${service._id}')
          "
        >
          EDIT
        </button>

        <button
          class="save-btn"
          onclick="
            saveService('${service._id}')
          "
        >
          SAVE
        </button>

      </div>

    `;

    servicesGrid.appendChild(card);

  });

}

/* =========================
   RENDER COMPANY
========================= */

function renderCompanyServices(){

  companyServicesGrid.innerHTML = "";

  companyServices.forEach(service=>{

    const card =
    document.createElement("div");

    card.className =
    "service-card";

    card.innerHTML = `

      <div class="service-top">

        <div class="service-info">

          <div class="service-icon">
            ${service.icon || "🚘"}
          </div>

          <div>

            <div class="service-name">
              ${service.title || ""}
            </div>

            <div class="service-status">

              ${
                service.enabled
                ? "Visible To Companies"
                : "Hidden From Companies"
              }

            </div>

          </div>

        </div>

        <button
          class="
            toggle-btn
            ${
              service.enabled
              ? "toggle-on"
              : "toggle-off"
            }
          "
          onclick="
            toggleCompanyService('${service._id}')
          "
        >

          ${
            service.enabled
            ? "ACTIVE"
            : "DISABLED"
          }

        </button>

      </div>

      <div class="
        warning-box
        ${
          service.enabled
          ? "warning-green"
          : "warning-red"
        }
      ">

        ${
          service.enabled
          ? "Companies Can Use This Service"
          : "This Company Service Is Hidden"
        }

      </div>

      <div class="fields">

        <!-- SERVICE SUFFIX -->

        <div class="field">

          <label>Service Suffix</label>

          <input
            type="text"
            id="company-suffix-${service._id}"
            value="${service.suffix || ""}"
            disabled
          >

        </div>

        <!-- SHARED SERVICE -->

        <div class="field">

          <label>Shared Service</label>

          <select
            id="company-shared-${service._id}"
            disabled
          >

            <option
              value="false"
              ${!service.shared ? "selected" : ""}
            >
              No
            </option>

            <option
              value="true"
              ${service.shared ? "selected" : ""}
            >
              Yes
            </option>

          </select>

        </div>

        <!-- PRICING MODE -->

        <div class="field">

          <label>Pricing Mode</label>

          <select
            id="company-mode-${service._id}"
            disabled
          >

            <option
              value="MILE"
              ${
                String(
                  service.companyPricingMode ||
                  service.pricingMode ||
                  ""
                ).toUpperCase()==="MILE"
                ? "selected"
                : ""
              }
            >
              Per Mile
            </option>

            <option
              value="HOURLY"
              ${
                String(
                  service.companyPricingMode ||
                  service.pricingMode ||
                  ""
                ).toUpperCase()==="HOURLY"
                ? "selected"
                : ""
              }
            >
              Hourly
            </option>

            <option
              value="SHARED"
              ${
                String(
                  service.companyPricingMode ||
                  service.pricingMode ||
                  ""
                ).toUpperCase()==="SHARED"
                ? "selected"
                : ""
              }
            >
              Shared
            </option>

          </select>

        </div>

        <!-- BASE FARE -->

        <div class="field">

          <label>Base Fare</label>

          <input
            type="number"
            id="company-base-${service._id}"
            value="${
              service.companyBaseFare ??
              service.baseFare ??
              0
            }"
            disabled
          >

        </div>

        <!-- INCLUDED MILES -->

        <div class="field">

          <label>Included Miles</label>

          <input
            type="number"
            id="company-included-${service._id}"
            value="${
              service.companyIncludedMiles ??
              service.includedMiles ??
              0
            }"
            disabled
          >

        </div>

        <!-- PER MILE -->

        <div class="field">

          <label>Per Mile</label>

          <input
            type="number"
            id="company-mile-${service._id}"
            value="${
              service.companyPerMile ??
              service.perMile ??
              0
            }"
            disabled
          >

        </div>

        <!-- HOURLY RATE -->

        <div class="field">

          <label>Hourly Rate</label>

          <input
            type="number"
            id="company-hour-${service._id}"
            value="${
              service.companyHourlyRate ??
              service.hourlyRate ??
              0
            }"
            disabled
          >

        </div>

        <!-- HOURLY BILLING -->

        <div class="field">

          <label>Hourly Billing</label>

          <select
            id="company-hourmode-${service._id}"
            disabled
          >

            <option
              value="FULL"
              ${
                String(
                  service.companyHourlyBillingMode ||
                  service.hourlyBillingMode ||
                  ""
                ).toUpperCase()==="FULL"
                ? "selected"
                : ""
              }
            >
              Full Hour
            </option>

            <option
              value="QUARTER"
              ${
                String(
                  service.companyHourlyBillingMode ||
                  service.hourlyBillingMode ||
                  ""
                ).toUpperCase()==="QUARTER"
                ? "selected"
                : ""
              }
            >
              Quarter Hour
            </option>

          </select>

        </div>

        <!-- STOP FEE -->

        <div class="field">

          <label>Stop Fee</label>

          <input
            type="number"
            id="company-stop-${service._id}"
            value="${
              service.companyStopFee ??
              service.stopFee ??
              0
            }"
            disabled
          >

        </div>

        <!-- NO SHOW -->

        <div class="field">

          <label>No Show Fee</label>

          <input
            type="number"
            id="company-noshow-${service._id}"
            value="${
              service.companyNoShowFee ??
              service.noShowFee ??
              0
            }"
            disabled
          >

        </div>

        <!-- SHARED PRICE -->

        <div class="field">

          <label>Shared Price</label>

          <input
            type="number"
            id="company-sharedprice-${service._id}"
            value="${
              service.companySharedPrice ??
              service.sharedPrice ??
              0
            }"
            disabled
          >

        </div>

        <!-- WARNING POLICY -->

        <div class="policy-title">
          Company Warning Policy
        </div>

        <div class="field">

          <label>Warning Enabled</label>

          <select
            id="company-warning-${service._id}"
            disabled
          >

            <option
              value="true"
              ${service.warningEnabled ? "selected" : ""}
            >
              Enabled
            </option>

            <option
              value="false"
              ${!service.warningEnabled ? "selected" : ""}
            >
              Disabled
            </option>

          </select>

        </div>

        <div class="field">

          <label>Warning Minutes</label>

          <input
            type="number"
            id="company-minutes-${service._id}"
            value="${service.warningMinutes || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>Cancel Fee</label>

          <input
            type="number"
            id="company-cancel-${service._id}"
            value="${service.cancelFee || 0}"
            disabled
          >

        </div>

      </div>

      <div class="buttons">

        <button
          class="edit-btn"
          onclick="
            enableCompanyEdit('${service._id}')
          "
        >
          EDIT
        </button>

        <button
          class="save-btn"
          onclick="
            saveCompanyService('${service._id}')
          "
        >
          SAVE
        </button>

      </div>

    `;

    companyServicesGrid.appendChild(card);

  });

}

/* =========================
   ENABLE EDIT
========================= */

function enableEdit(id){

  const fields = [

    `mode-${id}`,
    `base-${id}`,
    `included-${id}`,
    `mile-${id}`,
    `hour-${id}`,
    `hourmode-${id}`,
    `stop-${id}`,
    `noshow-${id}`,
    `shared-${id}`,

    `warning-${id}`,
    `minutes-${id}`,
    `cancel-${id}`

  ];

  fields.forEach(fieldId=>{

    const el =
    document.getElementById(fieldId);

    if(el){

      el.disabled = false;

      el.style.background =
      "#fff";

      el.style.border =
      "2px solid #145cff";

    }

  });

}

/* =========================
   ENABLE COMPANY EDIT
========================= */

function enableCompanyEdit(id){

  const fields = [

    /* BASIC */

    `company-suffix-${id}`,
    `company-shared-${id}`,

    /* PRICING */

    `company-mode-${id}`,
    `company-base-${id}`,
    `company-included-${id}`,
    `company-mile-${id}`,
    `company-hour-${id}`,
    `company-hourmode-${id}`,
    `company-stop-${id}`,
    `company-noshow-${id}`,
    `company-sharedprice-${id}`,

    /* WARNING POLICY */

    `company-warning-${id}`,
    `company-minutes-${id}`,
    `company-cancel-${id}`

  ];

  fields.forEach(fieldId=>{

    const el =
    document.getElementById(fieldId);

    if(el){

      el.disabled = false;

      el.readOnly = false;

      el.removeAttribute(
        "disabled"
      );

      el.removeAttribute(
        "readonly"
      );

      el.style.background =
      "#fff";

      el.style.border =
      "2px solid #145cff";

      el.style.opacity =
      "1";

      el.style.cursor =
      "text";

    }

  });

}

/* =========================
   SAVE INDIVIDUAL
========================= */

async function saveService(id){

  try{

    const payload = {

      pricingMode:
      document.getElementById(
        `mode-${id}`
      ).value,

      baseFare:Number(
        document.getElementById(
          `base-${id}`
        ).value
      ),

      includedMiles:Number(
        document.getElementById(
          `included-${id}`
        ).value
      ),

      perMile:Number(
        document.getElementById(
          `mile-${id}`
        ).value
      ),

      hourlyRate:Number(
        document.getElementById(
          `hour-${id}`
        ).value
      ),

      hourlyBillingMode:
      document.getElementById(
        `hourmode-${id}`
      ).value,

      stopFee:Number(
        document.getElementById(
          `stop-${id}`
        ).value
      ),

      noShowFee:Number(
        document.getElementById(
          `noshow-${id}`
        ).value
      ),

      sharedPrice:Number(
        document.getElementById(
          `shared-${id}`
        ).value
      ),

      warningEnabled:
      document.getElementById(
        `warning-${id}`
      ).value === "true",

      warningMinutes:Number(
        document.getElementById(
          `minutes-${id}`
        ).value
      ),

      cancelFee:Number(
        document.getElementById(
          `cancel-${id}`
        ).value
      )

    };

    const res =
    await fetch(

      `/api/services/${id}`,

      {
        method:"PUT",

        headers:{
          "Content-Type":"application/json"
        },

        body:JSON.stringify(payload)

      }

    );

    const data =
    await res.json();

    if(!data.success){

      alert("Save Failed");
      return;

    }

    alert("Service Saved");

    await loadServices();

  }catch(err){

    console.log(err);

    alert("Save Failed");

  }

}

/* =========================
   SAVE COMPANY
========================= */

async function saveCompanyService(id){

  try{

    const payload = {

      /* BASIC */

      companySuffix:
      document.getElementById(
        `company-suffix-${id}`
      ).value,

      companyShared:
      document.getElementById(
        `company-shared-${id}`
      ).value === "true",

      /* PRICING */

      companyPricingMode:
      document.getElementById(
        `company-mode-${id}`
      ).value,

      companyBaseFare:Number(
        document.getElementById(
          `company-base-${id}`
        ).value
      ),

      companyIncludedMiles:Number(
        document.getElementById(
          `company-included-${id}`
        ).value
      ),

      companyPerMile:Number(
        document.getElementById(
          `company-mile-${id}`
        ).value
      ),

      companyHourlyRate:Number(
        document.getElementById(
          `company-hour-${id}`
        ).value
      ),

      companyHourlyBillingMode:
      document.getElementById(
        `company-hourmode-${id}`
      ).value,

      companyStopFee:Number(
        document.getElementById(
          `company-stop-${id}`
        ).value
      ),

      companyNoShowFee:Number(
        document.getElementById(
          `company-noshow-${id}`
        ).value
      ),

      companySharedPrice:Number(
        document.getElementById(
          `company-sharedprice-${id}`
        ).value
      ),

      /* WARNING POLICY */

      companyWarningEnabled:
      document.getElementById(
        `company-warning-${id}`
      ).value === "true",

      companyWarningMinutes:Number(
        document.getElementById(
          `company-minutes-${id}`
        ).value
      ),

      companyCancelFee:Number(
        document.getElementById(
          `company-cancel-${id}`
        ).value
      )

    };

    const res =
    await fetch(

      `/api/services/${id}`,

      {
        method:"PUT",

        headers:{
          "Content-Type":"application/json"
        },

        body:JSON.stringify(payload)

      }

    );

    const data =
    await res.json();

    if(!data.success){

      alert("Save Failed");

      return;

    }

    alert("Company Service Saved");

    await loadServices();

  }catch(err){

    console.log(err);

    alert("Save Failed");

  }

}

/* =========================
   TOGGLE INDIVIDUAL
========================= */

async function toggleService(id){

  try{

    const service =
    services.find(
      s=>s._id===id
    );

    if(!service) return;

    const res =
    await fetch(

      `/api/services/${id}`,

      {
        method:"PUT",

        headers:{
          "Content-Type":"application/json"
        },

        body:JSON.stringify({
          enabled:!service.enabled
        })

      }

    );

    const data =
    await res.json();

    if(!data.success){

      alert("Toggle Failed");
      return;

    }

    await loadServices();

  }catch(err){

    console.log(err);

    alert("Toggle Failed");

  }

}

/* =========================
   TOGGLE COMPANY
========================= */

async function toggleCompanyService(id){

  try{

    const service =
    companyServices.find(
      s=>s._id===id
    );

    if(!service) return;

    const res =
    await fetch(

      `/api/services/${id}`,

      {
        method:"PUT",

        headers:{
          "Content-Type":"application/json"
        },

        body:JSON.stringify({
          companyEnabled:
          !service.enabled
        })

      }

    );

    const data =
    await res.json();

    if(!data.success){

      alert("Toggle Failed");
      return;

    }

    await loadServices();

  }catch(err){

    console.log(err);

    alert("Toggle Failed");

  }

}

/* =========================
   START
========================= */

loadServices();