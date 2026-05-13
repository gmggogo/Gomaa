const servicesGrid =
document.getElementById("servicesGrid");

/* =========================
   SERVICES
========================= */

const services = [

  {
    id:"1",
    name:"Standard",
    icon:"🚗",
    enabled:true,
    pricingMode:"MILE",
    baseFare:20,
    includedMiles:5,
    perMile:2,
    hourlyRate:0,
    stopFee:5,
    noShowFee:15,
    sharedPrice:0
  },

  {
    id:"2",
    name:"XL",
    icon:"🚐",
    enabled:true,
    pricingMode:"MILE",
    baseFare:30,
    includedMiles:5,
    perMile:2.5,
    hourlyRate:0,
    stopFee:5,
    noShowFee:15,
    sharedPrice:0
  },

  {
    id:"3",
    name:"Taxi",
    icon:"🚕",
    enabled:false,
    pricingMode:"MILE",
    baseFare:15,
    includedMiles:3,
    perMile:2,
    hourlyRate:0,
    stopFee:3,
    noShowFee:10,
    sharedPrice:0
  },

  {
    id:"4",
    name:"Limousine",
    icon:"🖤",
    enabled:false,
    pricingMode:"HOURLY",
    baseFare:0,
    includedMiles:0,
    perMile:0,
    hourlyRate:80,
    stopFee:0,
    noShowFee:40,
    sharedPrice:0
  },

  {
    id:"5",
    name:"Wheelchair",
    icon:"🦽",
    enabled:true,
    pricingMode:"MILE",
    baseFare:50,
    includedMiles:5,
    perMile:4,
    hourlyRate:0,
    stopFee:10,
    noShowFee:25,
    sharedPrice:0
  },

  {
    id:"6",
    name:"Shared",
    icon:"👥",
    enabled:true,
    pricingMode:"SHARED",
    baseFare:0,
    includedMiles:0,
    perMile:0,
    hourlyRate:0,
    stopFee:5,
    noShowFee:10,
    sharedPrice:15
  }

];

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
            ${service.icon}
          </div>

          <div>

            <div class="service-name">
              ${service.name}
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
            ${service.enabled
              ? "toggle-on"
              : "toggle-off"
            }
          "
          onclick="
            toggleService('${service.id}')
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
            id="mode-${service.id}"
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
            id="base-${service.id}"
            value="${service.baseFare}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Included Miles
          </label>

          <input
            type="number"
            id="included-${service.id}"
            value="${service.includedMiles}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Per Mile
          </label>

          <input
            type="number"
            id="mile-${service.id}"
            value="${service.perMile}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Hourly Rate
          </label>

          <input
            type="number"
            id="hour-${service.id}"
            value="${service.hourlyRate}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Stop Fee
          </label>

          <input
            type="number"
            id="stop-${service.id}"
            value="${service.stopFee}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            No Show Fee
          </label>

          <input
            type="number"
            id="noshow-${service.id}"
            value="${service.noShowFee}"
            disabled
          >

        </div>

        <div class="field">

          <label>
            Shared Price
          </label>

          <input
            type="number"
            id="shared-${service.id}"
            value="${service.sharedPrice}"
            disabled
          >

        </div>

      </div>

      <div class="buttons">

        <button
          class="edit-btn"
          onclick="
            enableEdit('${service.id}')
          "
        >
          EDIT
        </button>

        <button
          class="save-btn"
          onclick="
            saveService('${service.id}')
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
   SAVE
========================= */

function saveService(id){

  alert(
    "Service Saved Successfully"
  );

  renderServices();

}

/* =========================
   TOGGLE
========================= */

function toggleService(id){

  const service =
  services.find(s=>s.id===id);

  if(!service) return;

  const ok =
  confirm(

    service.enabled

    ? `Disable ${service.name}?\n\nCustomers Will NOT See This Service.`

    : `Enable ${service.name}?\n\nCustomers CAN Book This Service.`

  );

  if(!ok) return;

  service.enabled =
  !service.enabled;

  renderServices();

}

/* =========================
   START
========================= */

renderServices();