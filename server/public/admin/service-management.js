console.log("SERVICE MANAGEMENT LOADED");

/* =========================
HEADER
========================= */

document.addEventListener(
"DOMContentLoaded",
async ()=>{

  const header =
  document.getElementById(
    "adminHeader"
  );

  if(header){

    const res =
    await fetch("header.html");

    const html =
    await res.text();

    header.innerHTML = html;

  }

  loadServices();

});

/* =========================
ELEMENT
========================= */

const servicesGrid =
document.getElementById(
"servicesGrid"
);

/* =========================
SERVICES
========================= */

let services = [];

/* =========================
LOAD
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

  }

  catch(err){

    console.log(err);

    alert("Failed To Load");

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

          <img
          src="${
            service.image ||
            "/assets/default-service.jpg"
          }">

        </div>

        <div>

          <div class="service-name">
            ${service.title || "Service"}
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

      <button class="
      toggle-btn
      ${
        service.enabled
        ? "toggle-on"
        : "toggle-off"
      }">

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
    }">

    ${
      service.enabled
      ? "Customers Can Book This Service"
      : "This Service Is Hidden"
    }

    </div>

    <div class="fields">

      <div class="field">

        <label>Base Fare</label>

        <input
        type="number"
        value="${
          service.baseFare || 0
        }">

      </div>

      <div class="field">

        <label>Per Mile</label>

        <input
        type="number"
        value="${
          service.perMile || 0
        }">

      </div>

      <div class="field">

        <label>Stop Fee</label>

        <input
        type="number"
        value="${
          service.stopFee || 0
        }">

      </div>

      <div class="field">

        <label>No Show Fee</label>

        <input
        type="number"
        value="${
          service.noShowFee || 0
        }">

      </div>

    </div>

    <div class="buttons">

      <button class="edit-btn">
        EDIT
      </button>

      <button class="save-btn">
        SAVE
      </button>

    </div>

    `;

    servicesGrid.appendChild(card);

  });

}