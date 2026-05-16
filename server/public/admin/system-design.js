// =========================================
// FILE: public/admin/system-design.js
// UNIFIED SYSTEM DESIGN ENGINE
// =========================================

console.log("SYSTEM DESIGN LOADED");

let systemDesign = {};

/* =========================
SAVE STORAGE
========================= */

function saveStorage(){

  saveSystemDesign();

}

/* =========================
DEFAULT DATA
========================= */

const defaultSystemDesign = {

  companyName:"Sunbeam Transportation",
  timezone:"America/Phoenix",

  mainLogo:"/assets/logo.png",
  driverLogo:"/assets/logo.png",
  heroImage:"/assets/hero.jpeg",

  aboutTitle:"About Us",
  aboutText:"Professional transportation services.",

  quoteTitle:"Get Quote & Book Your Ride",
  quoteText:"Select your service below",

  extra1Active:true,
  extra1Title:"Extra Information",
  extra1Text:"You can add pricing, announcements, promotions, or company information here.",

  extra2Active:true,
  extra2Title:"Additional Services",
  extra2Text:"This section can later be managed from the admin panel.",

  contactTitle:"Customer Support",
  contactPhone:"619-509-7197",
  contactEmail:"admin@sunbeamtransportationllc.com",

  footerText:"©️ Sunbeam Transportation",

  services:[

    {
      id:"standard",
      active:false,
      title:"Standard",
      description:"Standard transportation service",
      image:"/assets/business.jpeg",
      link:"getquote/index.html"
    },

    {
      id:"xl",
      active:false,
      title:"XL",
      description:"Large vehicle transportation",
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
      description:"Luxury transportation service",
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

  ]

};

/* =========================
LOAD FROM SERVER
========================= */

async function loadSystemDesign(){

  try{

    const res =
    await fetch(
      "/api/system-design"
    );

    const data =
    await res.json();

    systemDesign = {

      ...defaultSystemDesign,

      ...data,

      services:
      Array.isArray(data.services)
      && data.services.length
      ? data.services
      : defaultSystemDesign.services

    };

  }catch(err){

    console.log(
      "LOAD ERROR",
      err
    );

    systemDesign =
    defaultSystemDesign;

  }

}

/* =========================
SAVE TO SERVER
========================= */

async function saveSystemDesign(){

  try{

    const res =
    await fetch(
      "/api/system-design",
      {

        method:"POST",

        headers:{
          "Content-Type":
          "application/json"
        },

        body:JSON.stringify(
          systemDesign
        )

      }
    );

    return await res.json();

  }catch(err){

    console.log(
      "SAVE ERROR",
      err
    );

  }

}

/* =========================
FILE TO BASE64
========================= */

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

/* =========================
SAFE SET
========================= */

function setValue(id,value){

  const el =
  document.getElementById(id);

  if(el){
    el.value = value || "";
  }

}

function setChecked(id,value){

  const el =
  document.getElementById(id);

  if(el){
    el.checked = !!value;
  }

}

function setImage(id,value){

  const el =
  document.getElementById(id);

  if(el){
    el.src = value || "";
  }

}

/* =========================
LOAD FORM VALUES
========================= */

function loadFormValues(){

  setValue("companyNameInput",systemDesign.companyName);
  setValue("timezoneInput",systemDesign.timezone);

  setImage("mainLogoPreview",systemDesign.mainLogo);
  setImage("driverLogoPreview",systemDesign.driverLogo);
  setImage("heroImagePreview",systemDesign.heroImage);

  setValue("aboutTitleInput",systemDesign.aboutTitle);
  setValue("aboutTextInput",systemDesign.aboutText);

  setValue("quoteTitleInput",systemDesign.quoteTitle);
  setValue("quoteTextInput",systemDesign.quoteText);

  setChecked("extra1Active",systemDesign.extra1Active);
  setValue("extra1Title",systemDesign.extra1Title);
  setValue("extra1Text",systemDesign.extra1Text);

  setChecked("extra2Active",systemDesign.extra2Active);
  setValue("extra2Title",systemDesign.extra2Title);
  setValue("extra2Text",systemDesign.extra2Text);

  setValue("contactTitleInput",systemDesign.contactTitle);
  setValue("contactPhoneInput",systemDesign.contactPhone);
  setValue("contactEmailInput",systemDesign.contactEmail);

  setValue("footerTextInput",systemDesign.footerText);

}

/* =========================
UPLOAD MAIN IMAGES
========================= */

async function uploadMainImage(
  input,
  key,
  previewId
){

  const file =
  input.files[0];

  if(!file) return;

  try{

    const formData =
    new FormData();

    formData.append(
      "image",
      file
    );

    const res =
    await fetch(
      "/api/system-design/upload",
      {
        method:"POST",
        body:formData
      }
    );

    const data =
    await res.json();

    if(!data.success){

      alert("Upload Failed");

      return;

    }

    systemDesign[key] =
    data.image;

    setImage(
      previewId,
      data.image
    );

    await saveSystemDesign();

  }catch(err){

    console.log(err);

    alert("Upload Error");

  }

}

/* =========================
RENDER SERVICE CARDS
========================= */

function renderCardsEditor(){

  const container =
  document.getElementById("cardsEditor");

  if(!container) return;

  container.innerHTML = "";

  const services =
  systemDesign.services || [];

  services.forEach((service,index)=>{

    container.innerHTML += `

    <div class="service-card">

      <div class="service-top">

        <div class="service-title">
          ${service.title || ""}
        </div>

        <button
          class="${
            service.active
            ? "save-btn"
            : "disable-btn"
          }"
          onclick="toggleCard(${index})"
        >
          ${
            service.active
            ? "ACTIVE"
            : "DISABLED"
          }
        </button>

      </div>

      <div class="input-group">

        <label>
          Service Name
        </label>

        <input
          type="text"
          id="title-${index}"
          value="${service.title || ""}"
        >

      </div>

      <div class="input-group">

        <label>
          Description
        </label>

        <textarea
          id="desc-${index}"
        >${service.description || ""}</textarea>

      </div>

      <div class="input-group">

        <label>
          Card Image
        </label>

        <img
          src="${
            service.image ||
            "/assets/logo.png"
          }"
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
        class="save-btn card-save"
        onclick="saveCard(${index})"
      >

        Save Card

      </button>

    </div>

    `;

  });

}

/* =========================
CARD ACTIONS
========================= */

window.toggleCard =
function(index){

  systemDesign.services[index].active =
  !systemDesign.services[index].active;

  saveStorage();

  renderCardsEditor();

};

window.uploadCardImage =
async function(index,file){

  if(!file) return;

  try{

    const formData =
    new FormData();

    formData.append(
      "image",
      file
    );

    const res =
    await fetch(
      "/api/system-design/upload",
      {
        method:"POST",
        body:formData
      }
    );

    const data =
    await res.json();

    if(!data.success){

      alert("Upload Failed");

      return;

    }

    systemDesign.services[index].image =
    data.image;

    await saveSystemDesign();

    renderCardsEditor();

  }catch(err){

    console.log(err);

    alert("Upload Error");

  }

};

window.saveCard =
function(index){

  systemDesign.services[index].title =
  document.getElementById(`title-${index}`).value;

  systemDesign.services[index].description =
  document.getElementById(`desc-${index}`).value;

  saveStorage();

  alert("Card Saved");

};

/* =========================
SAVE ALL
========================= */

window.saveAllSystemDesign =
function(){

  systemDesign.companyName =
  document.getElementById("companyNameInput")?.value || "";

  systemDesign.timezone =
  document.getElementById("timezoneInput")?.value || "America/Phoenix";

  systemDesign.aboutTitle =
  document.getElementById("aboutTitleInput")?.value || "";

  systemDesign.aboutText =
  document.getElementById("aboutTextInput")?.value || "";

  systemDesign.quoteTitle =
  document.getElementById("quoteTitleInput")?.value || "";

  systemDesign.quoteText =
  document.getElementById("quoteTextInput")?.value || "";

  systemDesign.extra1Active =
  document.getElementById("extra1Active")?.checked || false;

  systemDesign.extra1Title =
  document.getElementById("extra1Title")?.value || "";

  systemDesign.extra1Text =
  document.getElementById("extra1Text")?.value || "";

  systemDesign.extra2Active =
  document.getElementById("extra2Active")?.checked || false;

  systemDesign.extra2Title =
  document.getElementById("extra2Title")?.value || "";

  systemDesign.extra2Text =
  document.getElementById("extra2Text")?.value || "";

  systemDesign.contactTitle =
  document.getElementById("contactTitleInput")?.value || "";

  systemDesign.contactPhone =
  document.getElementById("contactPhoneInput")?.value || "";

  systemDesign.contactEmail =
  document.getElementById("contactEmailInput")?.value || "";

  systemDesign.footerText =
  document.getElementById("footerTextInput")?.value || "";

  saveStorage();

  alert("All Settings Saved");

};

/* =========================
RESET
========================= */

window.resetSystemDesign =
function(){

  const ok =
  confirm("Reset System Design?");

  if(!ok) return;

  location.reload();

};

/* =========================
INIT
========================= */

window.addEventListener(
  "DOMContentLoaded",
  async ()=>{

    await loadSystemDesign();

    loadFormValues();

    renderCardsEditor();

  }
);