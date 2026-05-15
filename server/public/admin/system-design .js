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
        >

      </div>

    </div>

    `;

  });

}

/* =========================================
UPDATE
========================================= */

window.updateCard =
function(index,key,value){

  systemDesign.services[index][key] =
  value;

};

/* =========================================
TOGGLE
========================================= */

window.toggleCard =
function(index,state){

  systemDesign.services[index].active =
  state;

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

  localStorage.setItem(
    "ghSystemDesign",
    JSON.stringify(systemDesign)
  );

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