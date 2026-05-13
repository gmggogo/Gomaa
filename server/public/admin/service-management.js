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
      await fetch("/api/services");

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
              ${service.name || ""}
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
                service.pricingMode==="MILE"
                ? "selected"
                : ""
              }
            >
              Per Mile
            </option>

            <option
              value="HOURLY"
              ${
                service.pricingMode==="HOURLY"
                ? "selected"
                : ""
              }
            >
              Hourly
            </option>

            <option
              value="SHARED"
              ${
                service.pricingMode==="SHARED"
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
   ENABLE EDIT
========================= */

function enableEdit(id){

  const fields = [

    `mode-${id}`,
    `base-${id}`,
    `included-${id}`,
    `mile-${id}`,
    `hour-${id}`,
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
   SAVE SERVICE
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
      )

    };

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

async function toggleService(id){

  const service =
  services.find(
    s=>s._id===id
  );

  if(!service) return;

  const ok =
  confirm(

    service.enabled

    ? `Disable ${service.name}?\n\nCustomers Will NOT See This Service.`

    : `Enable ${service.name}?\n\nCustomers CAN Book This Service.`

  );

  if(!ok) return;

  try{

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