// =========================================
// FILE:
// public/admin/system-design.js
// =========================================

let systemDesign =
JSON.parse(
localStorage.getItem("ghSystemDesign")
|| "{}"
);

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

  return new Promise((resolve)=>{

    const reader = new FileReader();

    reader.onload = e=>{

      resolve(e.target.result);

    };

    reader.readAsDataURL(file);

  });

}

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

  saveStorage();

};

/* =========================================
TOGGLE
========================================= */

window.toggleCard =
function(index,state){

  systemDesign
  .services[index]
  .active = state;

  saveStorage();

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

  document.getElementById(
    `preview-${index}`
  ).src = base64;

  saveStorage();

};

/* =========================================
SAVE
========================================= */

window.saveSystemDesign =
function(){

  systemDesign.companyName =
  document.getElementById(
    "companyNameInput"
  ).value;

  saveStorage();

  alert("Saved");

};

/* =========================================
RESET
========================================= */

window.resetSystemDesign =
function(){

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

  renderCardsEditor();

});