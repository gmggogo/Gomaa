// =========================================
// SYSTEM DESIGN ENGINE
// FILE:
// public/admin/system-design.js
// =========================================

console.log(
  "SYSTEM DESIGN LOADED"
);

/* =========================================
LOAD STORAGE
========================================= */

let systemDesign =
JSON.parse(
localStorage.getItem(
  "ghSystemDesign"
) || "{}"
);

/* =========================================
DEFAULT SERVICES
========================================= */

const defaultServices = [

{
  id:"nemt",
  active:false,
  title:"NEMT",
  description:"Medical appointments & clinics",
  image:"/assets/nemt.jpeg",
  link:"getquote/index.html"
},

{
  id:"airport",
  active:false,
  title:"Airport",
  description:"Airport pickup & drop-off",
  image:"/assets/airport.jpeg",
  link:"getquote/index.html"
},

{
  id:"business",
  active:false,
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

  saveStorage();

}

/* =========================================
SAVE STORAGE
========================================= */

function saveStorage(){

  localStorage.setItem(
    "ghSystemDesign",
    JSON.stringify(systemDesign)
  );

}

/* =========================================
BASE64
========================================= */

function fileToBase64(file){

  return new Promise(resolve=>{

    const reader =
    new FileReader();

    reader.onload = e=>{

      resolve(e.target.result);

    };

    reader.readAsDataURL(file);

  });

}

/* =========================================
RENDER
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

        <button
          class="
          ${service.active
          ? 'save-btn'
          : 'disable-btn'}
          "
          onclick="
          toggleCard(
            ${index}
          )
          "
        >

          ${service.active
          ? 'ACTIVE'
          : 'DISABLED'}

        </button>

      </div>

      <div class="input-group">

        <label>
          Title
        </label>

        <input
          type="text"
          id="title-${index}"
          value="${service.title}"
        >

      </div>

      <div class="input-group">

        <label>
          Description
        </label>

        <textarea
          id="desc-${index}"
        >${service.description}</textarea>

      </div>

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
          accept="image/*"
          id="upload-${index}"
          onchange="
          uploadCardImage(
            ${index},
            this.files[0]
          )
          "
        >

        <button
          class="upload-btn"
          type="button"
          onclick="
          document
          .getElementById(
            'upload-${index}'
          )
          .click()
          "
        >

          Upload Image

        </button>

      </div>

      <button
        class="
        save-btn
        card-save
        "
        onclick="
        saveCard(
          ${index}
        )
        "
      >

        Save Card

      </button>

    </div>

    `;

  });

}

/* =========================================
TOGGLE
========================================= */

window.toggleCard =
function(index){

  systemDesign
  .services[index]
  .active = !

  systemDesign
  .services[index]
  .active;

  saveStorage();

  renderCardsEditor();

};

/* =========================================
UPLOAD IMAGE
========================================= */

window.uploadCardImage =
async function(index,file){

  if(!file) return;

  const base64 =
  await fileToBase64(file);

  systemDesign
  .services[index]
  .image = base64;

  saveStorage();

  renderCardsEditor();

};

/* =========================================
SAVE CARD
========================================= */

window.saveCard =
function(index){

  systemDesign
  .services[index]
  .title =

  document.getElementById(
    `title-${index}`
  ).value;

  systemDesign
  .services[index]
  .description =

  document.getElementById(
    `desc-${index}`
  ).value;

  saveStorage();

  alert(
    "Card Saved"
  );

};

/* =========================================
SAVE ALL
========================================= */

window.saveAllSystemDesign =
function(){

  systemDesign.companyName =

  document.getElementById(
    "companyNameInput"
  ).value;

  systemDesign.timezone =

  document.getElementById(
    "timezoneInput"
  ).value;

  saveStorage();

  alert(
    "All Settings Saved"
  );

};

/* =========================================
RESET
========================================= */

window.resetSystemDesign =
function(){

  const ok =
  confirm(
    "Reset System Design?"
  );

  if(!ok) return;

  localStorage.removeItem(
    "ghSystemDesign"
  );

  location.reload();

};

/* =========================================
LOAD
========================================= */

window.addEventListener(
"DOMContentLoaded",
()=>{

  document.getElementById(
    "companyNameInput"
  ).value =

  systemDesign.companyName || "";

  document.getElementById(
    "timezoneInput"
  ).value =

  systemDesign.timezone
  || "America/Phoenix";

  renderCardsEditor();

});