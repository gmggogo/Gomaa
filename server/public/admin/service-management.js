console.log("SERVICE JS LOADED");

const servicesGrid =
document.getElementById("servicesGrid");

const companyServicesGrid =
document.getElementById("companyServicesGrid");

/* =========================
   INDIVIDUAL SERVICES
========================= */

let services = [];

/* =========================
   COMPANY SERVICES
========================= */

let companyServices = [

  {
    _id:"company-standard",
    title:"Standard",
    icon:"🚘",
    suffix:"ST",

    enabled:true,
    shared:false,

    pricingMode:"MILE",

    baseFare:0,
    includedMiles:0,
    perMile:0,
    hourlyRate:0,

    hourlyBillingMode:"FULL",

    stopFee:0,
    noShowFee:15,
    sharedPrice:0,

    warningEnabled:true,
    warningMinutes:120,
    cancelFee:15
  },

  {
    _id:"company-xl",
    title:"XL",
    icon:"🚐",
    suffix:"XL",

    enabled:true,
    shared:false,

    pricingMode:"MILE",

    baseFare:0,
    includedMiles:0,
    perMile:0,
    hourlyRate:0,

    hourlyBillingMode:"FULL",

    stopFee:0,
    noShowFee:25,
    sharedPrice:0,

    warningEnabled:true,
    warningMinutes:180,
    cancelFee:25
  },

  {
    _id:"company-wheelchair",
    title:"Wheelchair",
    icon:"♿",
    suffix:"WH",

    enabled:true,
    shared:false,

    pricingMode:"MILE",

    baseFare:0,
    includedMiles:0,
    perMile:0,
    hourlyRate:0,

    hourlyBillingMode:"FULL",

    stopFee:0,
    noShowFee:30,
    sharedPrice:0,

    warningEnabled:true,
    warningMinutes:240,
    cancelFee:30
  },

  {
    _id:"company-taxi",
    title:"Taxi",
    icon:"🚕",
    suffix:"TX",

    enabled:true,
    shared:false,

    pricingMode:"MILE",

    baseFare:0,
    includedMiles:0,
    perMile:0,
    hourlyRate:0,

    hourlyBillingMode:"FULL",

    stopFee:0,
    noShowFee:0,
    sharedPrice:0,

    warningEnabled:false,
    warningMinutes:0,
    cancelFee:0
  },

  {
    _id:"company-limo",
    title:"Limousine",
    icon:"🥂",
    suffix:"LM",

    enabled:true,
    shared:false,

    pricingMode:"HOURLY",

    baseFare:0,
    includedMiles:0,
    perMile:0,
    hourlyRate:0,

    hourlyBillingMode:"FULL",

    stopFee:0,
    noShowFee:50,
    sharedPrice:0,

    warningEnabled:true,
    warningMinutes:360,
    cancelFee:50
  },

  {
    _id:"company-shared",
    title:"Shared",
    icon:"👥",
    suffix:"SH",

    enabled:true,
    shared:true,

    pricingMode:"SHARED",

    baseFare:0,
    includedMiles:0,
    perMile:0,
    hourlyRate:0,

    hourlyBillingMode:"FULL",

    stopFee:0,
    noShowFee:15,
    sharedPrice:0,

    warningEnabled:true,
    warningMinutes:120,
    cancelFee:15
  }

];

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

          <label>
            Pricing Mode
          </label>

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

          <label>
            Base Fare
          </label>

          <input
            type="number"
            id="base-${service._id}"
            value="${service.baseFare || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Included Miles
          </label>

          <input
            type="number"
            id="included-${service._id}"
            value="${service.includedMiles || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Per Mile
          </label>

          <input
            type="number"
            id="mile-${service._id}"
            value="${service.perMile || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Hourly Rate
          </label>

          <input
            type="number"
            id="hour-${service._id}"
            value="${service.hourlyRate || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Hourly Billing
          </label>

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

        <!-- =========================
             FUTURE WARNING POLICY
        ========================== -->

        <div class="field">

          <label>
            Warning Enabled
          </label>

          <select
            disabled
          >

            <option selected>
              Future Feature
            </option>

          </select>

        </div>

        <div class="field">

          <label>
            Warning Minutes
          </label>

          <input
            type="number"
            value="120"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Cancel Fee
          </label>

          <input
            type="number"
            value="15"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Stop Fee
          </label>

          <input
            type="number"
            id="stop-${service._id}"
            value="${service.stopFee || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            No Show Fee
          </label>

          <input
            type="number"
            id="noshow-${service._id}"
            value="${service.noShowFee || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Shared Price
          </label>

          <input
            type="number"
            id="shared-${service._id}"
            value="${service.sharedPrice || 0}"
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

        <div class="field">

          <label>
            Service Suffix
          </label>

          <input
            type="text"
            id="company-suffix-${service._id}"
            value="${service.suffix || ""}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Shared Service
          </label>

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

        <div class="field">

          <label>
            Pricing Mode
          </label>

          <select
            id="company-mode-${service._id}"
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

          <label>
            Base Fare
          </label>

          <input
            type="number"
            id="company-base-${service._id}"
            value="${service.baseFare || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Included Miles
          </label>

          <input
            type="number"
            id="company-included-${service._id}"
            value="${service.includedMiles || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Per Mile
          </label>

          <input
            type="number"
            id="company-mile-${service._id}"
            value="${service.perMile || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Hourly Rate
          </label>

          <input
            type="number"
            id="company-hour-${service._id}"
            value="${service.hourlyRate || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Hourly Billing
          </label>

          <select
            id="company-hourmode-${service._id}"
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

          <label>
            Warning Enabled
          </label>

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

          <label>
            Warning Minutes
          </label>

          <input
            type="number"
            id="company-minutes-${service._id}"
            value="${service.warningMinutes || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Cancel Fee
          </label>

          <input
            type="number"
            id="company-cancel-${service._id}"
            value="${service.cancelFee || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Stop Fee
          </label>

          <input
            type="number"
            id="company-stop-${service._id}"
            value="${service.stopFee || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            No Show Fee
          </label>

          <input
            type="number"
            id="company-noshow-${service._id}"
            value="${service.noShowFee || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Shared Price
          </label>

          <input
            type="number"
            id="company-sharedprice-${service._id}"
            value="${service.sharedPrice || 0}"
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
    `shared-${id}`

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

    `company-suffix-${id}`,
    `company-shared-${id}`,
    `company-mode-${id}`,
    `company-base-${id}`,
    `company-included-${id}`,
    `company-mile-${id}`,
    `company-hour-${id}`,
    `company-hourmode-${id}`,
    `company-warning-${id}`,
    `company-minutes-${id}`,
    `company-cancel-${id}`,
    `company-stop-${id}`,
    `company-noshow-${id}`,
    `company-sharedprice-${id}`

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
   SAVE SERVICE
========================= */

async function saveService(id){

  alert(
    "Individual Services Save Ready"
  );

}

/* =========================
   SAVE COMPANY SERVICE
========================= */

async function saveCompanyService(id){

  alert(
    "Company Service Saved"
  );

}

/* =========================
   TOGGLE
========================= */

async function toggleService(id){

  const service =
  services.find(
    s=>s._id===id
  );

  if(!service) return;

  service.enabled =
  !service.enabled;

  renderServices();

}

/* =========================
   TOGGLE COMPANY
========================= */

async function toggleCompanyService(id){

  const service =
  companyServices.find(
    s=>s._id===id
  );

  if(!service) return;

  service.enabled =
  !service.enabled;

  renderCompanyServices();

}

/* =========================
   START
========================= */

loadServices();