console.log("SERVICE JS LOADED");

const servicesGrid =
document.getElementById("servicesGrid");

/* =========================
   SERVICES
========================= */

let services = [];

/* =========================
   LOAD SERVICES
========================= */

async function loadServices(){

  try{

    const res =
      await fetch(
        "/api/pricing/services"
      );

    services =
      await res.json();

    renderServices();

  }catch(err){

    console.log(err);

    alert("Failed To Load Services");

  }

}

/* =========================
   RENDER
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
            toggleService('${service.serviceKey}')
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
            id="mode-${service.serviceKey}"
            disabled
          >

            <option
              value="MILE"
              ${
                String(service.pricingMode)
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
                String(service.pricingMode)
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
                String(service.pricingMode)
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
            id="base-${service.serviceKey}"
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
            id="included-${service.serviceKey}"
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
            id="mile-${service.serviceKey}"
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
            id="hour-${service.serviceKey}"
            value="${service.hourlyRate || 0}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Stop Fee
          </label>

          <input
            type="number"
            id="stop-${service.serviceKey}"
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
            id="noshow-${service.serviceKey}"
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
            id="shared-${service.serviceKey}"
            value="${service.sharedPrice || 0}"
            disabled
          >

        </div>

      </div>

      <div class="buttons">

        <button
          class="edit-btn"
          onclick="
            enableEdit('${service.serviceKey}')
          "
        >
          EDIT
        </button>

        <button
          class="save-btn"
          onclick="
            saveService('${service.serviceKey}')
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
   ENABLE EDIT
========================= */

function enableEdit(key){

  const fields = [

    `mode-${key}`,
    `base-${key}`,
    `included-${key}`,
    `mile-${key}`,
    `hour-${key}`,
    `stop-${key}`,
    `noshow-${key}`,
    `shared-${key}`

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

async function saveService(key){

  try{

    const payload = {

      pricingMode:
      document.getElementById(
        `mode-${key}`
      ).value,

      baseFare:Number(
        document.getElementById(
          `base-${key}`
        ).value
      ),

      includedMiles:Number(
        document.getElementById(
          `included-${key}`
        ).value
      ),

      perMile:Number(
        document.getElementById(
          `mile-${key}`
        ).value
      ),

      hourlyRate:Number(
        document.getElementById(
          `hour-${key}`
        ).value
      ),

      stopFee:Number(
        document.getElementById(
          `stop-${key}`
        ).value
      ),

      noShowFee:Number(
        document.getElementById(
          `noshow-${key}`
        ).value
      ),

      sharedPrice:Number(
        document.getElementById(
          `shared-${key}`
        ).value
      )

    };

    const res =
      await fetch(

        `/api/pricing/services/${key}`,

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
   TOGGLE
========================= */

async function toggleService(key){

  const service =
  services.find(
    s=>s.serviceKey===key
  );

  if(!service) return;

  const ok =
  confirm(

    service.enabled

    ? `Disable ${service.title}?\n\nCustomers Will NOT See This Service.`

    : `Enable ${service.title}?\n\nCustomers CAN Book This Service.`

  );

  if(!ok) return;

  try{

    await fetch(

      `/api/pricing/services/${key}`,

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