const servicesGrid =
document.getElementById("servicesGrid");

/* =========================
   LOAD SERVICES
========================= */

async function loadServices(){

  try{

    const res =
    await fetch("/api/services");

    const services =
    await res.json();

    renderServices(services);

  }catch(err){

    console.error(err);

    alert("Failed To Load Services");

  }

}

/* =========================
   RENDER SERVICES
========================= */

function renderServices(services){

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
            ${service.icon || "🚗"}
          </div>

          <div class="service-name">
            ${service.name || "Service"}
          </div>

        </div>

        <div
          class="toggle ${service.enabled ? "active":"inactive"}"
          onclick="toggleService('${service._id}')"
        >
          <div class="toggle-ball"></div>
        </div>

      </div>

      <div class="fields">

        <div class="field">

          <label>
            Pricing Mode
          </label>

          <select id="mode-${service._id}">

            <option
              value="MILE"
              ${service.pricingMode==="MILE"
                ? "selected"
                : ""
              }
            >
              Per Mile
            </option>

            <option
              value="HOURLY"
              ${service.pricingMode==="HOURLY"
                ? "selected"
                : ""
              }
            >
              Hourly
            </option>

            <option
              value="SHARED"
              ${service.pricingMode==="SHARED"
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
          >

        </div>

      </div>

      <button
        class="save-btn"
        onclick="saveService('${service._id}')"
      >
        Save Changes
      </button>

    `;

    servicesGrid.appendChild(card);

  });

}

/* =========================
   TOGGLE
========================= */

async function toggleService(id){

  try{

    await fetch(
      `/api/services/${id}/toggle`,
      {
        method:"PUT"
      }
    );

    loadServices();

  }catch(err){

    console.error(err);

    alert("Toggle Failed");

  }

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

      baseFare:
      Number(
        document.getElementById(
          `base-${id}`
        ).value
      ),

      includedMiles:
      Number(
        document.getElementById(
          `included-${id}`
        ).value
      ),

      perMile:
      Number(
        document.getElementById(
          `mile-${id}`
        ).value
      ),

      hourlyRate:
      Number(
        document.getElementById(
          `hour-${id}`
        ).value
      ),

      stopFee:
      Number(
        document.getElementById(
          `stop-${id}`
        ).value
      ),

      noShowFee:
      Number(
        document.getElementById(
          `noshow-${id}`
        ).value
      ),

      sharedPrice:
      Number(
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
          "Content-Type":
          "application/json"
        },

        body:
        JSON.stringify(payload)
      }
    );

    alert("Service Updated");

  }catch(err){

    console.error(err);

    alert("Save Failed");

  }

}

/* =========================
   START
========================= */

loadServices();