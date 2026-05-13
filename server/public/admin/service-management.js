const servicesGrid =
document.getElementById("servicesGrid");

/* =========================
   TEST SERVICES
========================= */

let services = [

  {
    _id:"1",
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
    _id:"2",
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
    _id:"3",
    name:"Wheelchair",
    icon:"🦽",
    enabled:false,
    pricingMode:"MILE",
    baseFare:50,
    includedMiles:5,
    perMile:4,
    hourlyRate:0,
    stopFee:10,
    noShowFee:25,
    sharedPrice:0
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

      <!-- =====================
           TOP
      ====================== -->

      <div class="service-top">

        <div class="service-info">

          <div class="service-icon">
            ${service.icon}
          </div>

          <div>

            <div class="service-name">
              ${service.name}
            </div>

            <div style="
              font-size:13px;
              color:#64748b;
              margin-top:4px;
              font-weight:600;
            ">

              ${
                service.enabled
                ? "Service Visible To Customers"
                : "Service Hidden From Customers"
              }

            </div>

          </div>

        </div>

        <!-- =====================
             ENABLE BUTTON
        ====================== -->

        <button
          class="
            service-toggle-btn
            ${service.enabled ? "enabled" : "disabled"}
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

      <!-- =====================
           WARNING
      ====================== -->

      <div class="
        warning-box
        ${service.enabled ? "green":"red"}
      ">

        ${
          service.enabled
          ? "Customers Can See And Book This Service"
          : "This Service Is Hidden From Customers"
        }

      </div>

      <!-- =====================
           FIELDS
      ====================== -->

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
            id="included-${service._id}"
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
            id="mile-${service._id}"
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
            id="hour-${service._id}"
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
            id="stop-${service._id}"
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
            id="noshow-${service._id}"
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
            id="shared-${service._id}"
            value="${service.sharedPrice}"
            disabled
          >

        </div>

      </div>

      <!-- =====================
           BUTTONS
      ====================== -->

      <div class="action-buttons">

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
   SAVE
========================= */

function saveService(id){

  const service =
  services.find(s=>s._id===id);

  if(!service) return;

  service.pricingMode =
  document.getElementById(
    `mode-${id}`
  ).value;

  service.baseFare =
  Number(
    document.getElementById(
      `base-${id}`
    ).value
  );

  service.includedMiles =
  Number(
    document.getElementById(
      `included-${id}`
    ).value
  );

  service.perMile =
  Number(
    document.getElementById(
      `mile-${id}`
    ).value
  );

  service.hourlyRate =
  Number(
    document.getElementById(
      `hour-${id}`
    ).value
  );

  service.stopFee =
  Number(
    document.getElementById(
      `stop-${id}`
    ).value
  );

  service.noShowFee =
  Number(
    document.getElementById(
      `noshow-${id}`
    ).value
  );

  service.sharedPrice =
  Number(
    document.getElementById(
      `shared-${id}`
    ).value
  );

  alert(
    `${service.name} Updated Successfully`
  );

  renderServices();

}

/* =========================
   TOGGLE SERVICE
========================= */

function toggleService(id){

  const service =
  services.find(s=>s._id===id);

  if(!service) return;

  const confirmed =
  confirm(

    service.enabled

    ? `Disable ${service.name}?\n\nCustomers Will NOT See This Service.`

    : `Enable ${service.name}?\n\nCustomers Will Be Able To Book This Service.`

  );

  if(!confirmed) return;

  service.enabled =
  !service.enabled;

  renderServices();

}

/* =========================
   START
========================= */

renderServices();