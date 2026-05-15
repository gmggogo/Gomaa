// =========================================
// FILE: public/admin/system-design.js
// =========================================

let systemDesign =
JSON.parse(
localStorage.getItem("ghSystemDesign")
|| "{}"
);

/* =========================================
DEFAULT SERVICES
========================================= */

const defaultServices = [

{
  id:"nemt",
  active:true,
  title:"NEMT",
  description:"Medical appointments & clinics",
  image:"/assets/nemt.jpeg",
  link:"getquote/index.html"
},

{
  id:"airport",
  active:true,
  title:"Airport",
  description:"Airport pickup & drop-off",
  image:"/assets/airport.jpeg",
  link:"getquote/index.html"
},

{
  id:"business",
  active:true,
  title:"Business",
  description:"Corporate & private rides",
  image:"/assets/business.jpeg",
  link:"getquote/index.html"
},

{
  id:"taxi",
  active:false,
  title:"Taxi",
  description:"Daily city transportation",
  image:"/assets/business.jpeg",
  link:"getquote/index.html"
},

{
  id:"limo",
  active:false,
  title:"Limo",
  description:"Luxury transportation",
  image:"/assets/business.jpeg",
  link:"getquote/index.html"
},

{
  id:"xl",
  active:false,
  title:"XL",
  description:"Large family transportation",
  image:"/assets/business.jpeg",
  link:"getquote/index.html"
},

{
  id:"wheelchair",
  active:false,
  title:"Wheelchair",
  description:"Wheelchair accessible rides",
  image:"/assets/nemt.jpeg",
  link:"getquote/index.html"
},

{
  id:"shared",
  active:false,
  title:"Shared Ride",
  description:"Affordable shared rides",
  image:"/assets/airport.jpeg",
  link:"getquote/index.html"
}

];

/* =========================================
INIT
========================================= */

if(!systemDesign.services){

  systemDesign.services =
  defaultServices;

}

/* =========================================
RENDER CARDS
========================================= */

function renderCardsEditor(){

  const container =
  document.getElementById(
    "cardsEditor"
  );

  if(!container) return;

  container.innerHTML = "";

  systemDesign.services
  .forEach((service,index)=>{

    container.innerHTML += `

    <div class="service-card">

      <div class="service-top">

        <div class="service-title">
          ${service.title}
        </div>

        <label>

          <input
            type="checkbox"
            ${service.active ? "checked" : ""}
            onchange="
            toggleCard(
              ${index},
              this.checked
            )
            "
          >

          Active

        </label>

      </div>

      <!-- TITLE -->

      <div class="input-group">

        <label>
          Title
        </label>

        <input
          type="text"
          value="${service.title}"
          onchange="
          updateCard(
            ${index},
            'title',
            this.value
          )
          "
        >

      </div>

      <!-- DESCRIPTION -->

      <div class="input-group">

        <label>
          Description
        </label>

        <textarea
          onchange="
          updateCard(
            ${index},
            'description',
            this.value
          )
          "
        >${service.description}</textarea>

      </div>

      <!-- IMAGE -->

      <div class="input-group">

        <label>
          Image
        </label>

        <img
          src="${service.image}"
          class="preview-image"
          id="preview-${index}"
        >

        <input
          type="file"
          hidden
          id="imageInput-${index}"
          accept="image/*"
          onchange="
          uploadCardImage(
            ${index},
            this
          )
          "
        >

        <button
          class="upload-btn"
          type="button"
          onclick="
          document
          .getElementById(
            'imageInput-${index}'
          )
          .click()
          "
        >

          Upload Image

        </button>

      </div>

    </div>

    `;

  });

}

/* =========================================
UPDATE CARD
========================================= */

window.updateCard =
function(index,key,value){

  systemDesign
  .services[index][key] =
  value;

};

/* =========================================
TOGGLE CARD
========================================= */

window.toggleCard =
function(index,state){

  systemDesign
  .services[index]
  .active = state;

};

/* =========================================
UPLOAD IMAGE
========================================= */

window.uploadCardImage =
function(index,input){

  const file =
  input.files[0];

  if(!file) return;

  const reader =
  new FileReader();

  reader.onload =
  function(e){

    systemDesign
    .services[index]
    .image =
    e.target.result;

    const preview =
    document.getElementById(
      `preview-${index}`
    );

    if(preview){

      preview.src =
      e.target.result;

    }

  };

  reader.readAsDataURL(file);

};

/* =========================================
SAVE
========================================= */

window.saveSystemDesign =
function(){

  systemDesign.companyName =
  document.getElementById(
    "companyNameInput"
  )?.value || "";

  systemDesign.timezone =
  document.getElementById(
    "timezoneInput"
  )?.value || "America/Phoenix";

  systemDesign.extra1Title =
  document.getElementById(
    "extra1Title"
  )?.value || "";

  systemDesign.extra1Text =
  document.getElementById(
    "extra1Text"
  )?.value || "";

  systemDesign.extra2Title =
  document.getElementById(
    "extra2Title"
  )?.value || "";

  systemDesign.extra2Text =
  document.getElementById(
    "extra2Text"
  )?.value || "";

  systemDesign.extra1Active =
  document.getElementById(
    "extra1Active"
  )?.checked || false;

  systemDesign.extra2Active =
  document.getElementById(
    "extra2Active"
  )?.checked || false;

  localStorage.setItem(
    "ghSystemDesign",
    JSON.stringify(systemDesign)
  );

  alert(
    "System Design Saved"
  );

};

/* =========================================
RESET
========================================= */

window.resetSystemDesign =
function(){

  const ok =
  confirm(
    "Reset all system design settings?"
  );

  if(!ok) return;

  localStorage.removeItem(
    "ghSystemDesign"
  );

  location.reload();

};

/* =========================================
LOAD FORM
========================================= */

function loadFormValues(){

  document.getElementById(
    "companyNameInput"
  ).value =
  systemDesign.companyName || "";

  document.getElementById(
    "timezoneInput"
  ).value =
  systemDesign.timezone
  || "America/Phoenix";

  document.getElementById(
    "extra1Title"
  ).value =
  systemDesign.extra1Title || "";

  document.getElementById(
    "extra1Text"
  ).value =
  systemDesign.extra1Text || "";

  document.getElementById(
    "extra2Title"
  ).value =
  systemDesign.extra2Title || "";

  document.getElementById(
    "extra2Text"
  ).value =
  systemDesign.extra2Text || "";

  document.getElementById(
    "extra1Active"
  ).checked =
  systemDesign.extra1Active || false;

  document.getElementById(
    "extra2Active"
  ).checked =
  systemDesign.extra2Active || false;

}

/* =========================================
LOAD
========================================= */

window.addEventListener(
"DOMContentLoaded",
()=>{

  loadFormValues();

  renderCardsEditor();

});