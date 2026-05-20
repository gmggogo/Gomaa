// =========================================
// FILE: public/admin/system-design.js
// FINAL LIVE THEME ENGINE
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

  /* =========================
  EXTRA BOX THEME ENGINE
  ========================= */

  extraBoxBg:"#ffffff",

  extraBoxBorder:"#dbeafe",

  extraBoxTitleColor:"#145cff",

  extraBoxTextColor:"#334155",

  extraBoxRadius:"28",

  extraBoxPadding:"40",

  extraBoxAlign:"center",

  extraBoxTitleSize:"32",

  extraBoxTextSize:"18",

  extraBoxBorderSize:"2",

  extraBoxShadow:true,

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
    await fetch("/api/system-design");

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

    console.log("LOAD ERROR",err);

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

    console.log("SAVE ERROR",err);

  }

}

/* =========================
SAFE SET
========================= */

function setValue(id,value){

  const el =
  document.getElementById(id);

  if(el){

    el.value =
    value || "";

  }

}

function setChecked(id,value){

  const el =
  document.getElementById(id);

  if(el){

    el.checked =
    !!value;

  }

}

function setImage(id,value){

  const el =
  document.getElementById(id);

  if(el){

    el.src =
    value || "";

  }

}

/* =========================
LOAD FORM VALUES
========================= */

function loadFormValues(){

  setValue(
    "companyNameInput",
    systemDesign.companyName
  );

  setValue(
    "timezoneInput",
    systemDesign.timezone
  );

  setImage(
    "mainLogoPreview",
    systemDesign.mainLogo
  );

  setImage(
    "driverLogoPreview",
    systemDesign.driverLogo
  );

  setImage(
    "heroImagePreview",
    systemDesign.heroImage
  );

  setValue(
    "aboutTitleInput",
    systemDesign.aboutTitle
  );

  setValue(
    "aboutTextInput",
    systemDesign.aboutText
  );

  setValue(
    "quoteTitleInput",
    systemDesign.quoteTitle
  );

  setValue(
    "quoteTextInput",
    systemDesign.quoteText
  );

  setChecked(
    "extra1Active",
    systemDesign.extra1Active
  );

  setValue(
    "extra1Title",
    systemDesign.extra1Title
  );

  setValue(
    "extra1Text",
    systemDesign.extra1Text
  );

  setChecked(
    "extra2Active",
    systemDesign.extra2Active
  );

  setValue(
    "extra2Title",
    systemDesign.extra2Title
  );

  setValue(
    "extra2Text",
    systemDesign.extra2Text
  );

  /* =========================
  THEME ENGINE LOAD
  ========================= */

  setValue(
    "extraBoxBgInput",
    systemDesign.extraBoxBg
  );

  setValue(
    "extraBoxBorderInput",
    systemDesign.extraBoxBorder
  );

  setValue(
    "extraBoxTitleColorInput",
    systemDesign.extraBoxTitleColor
  );

  setValue(
    "extraBoxTextColorInput",
    systemDesign.extraBoxTextColor
  );

  setValue(
    "extraBoxRadiusInput",
    systemDesign.extraBoxRadius
  );

  setValue(
    "extraBoxPaddingInput",
    systemDesign.extraBoxPadding
  );

  setValue(
    "extraBoxAlignInput",
    systemDesign.extraBoxAlign
  );

  setValue(
    "extraBoxTitleSizeInput",
    systemDesign.extraBoxTitleSize
  );

  setValue(
    "extraBoxTextSizeInput",
    systemDesign.extraBoxTextSize
  );

  setValue(
    "extraBoxBorderSizeInput",
    systemDesign.extraBoxBorderSize
  );

  setChecked(
    "extraBoxShadowInput",
    systemDesign.extraBoxShadow
  );

}

/* =========================
UPLOAD MAIN IMAGE
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

    alert("Image Uploaded");

  }catch(err){

    console.log(err);

    alert("Upload Error");

  }

}

/* =========================
WINDOW UPLOAD HANDLERS
========================= */

window.uploadMainLogo =
function(input){

  uploadMainImage(
    input,
    "mainLogo",
    "mainLogoPreview"
  );

};

window.uploadDriverLogo =
function(input){

  uploadMainImage(
    input,
    "driverLogo",
    "driverLogoPreview"
  );

};

window.uploadHeroImage =
function(input){

  uploadMainImage(
    input,
    "heroImage",
    "heroImagePreview"
  );

};

/* =========================
LIVE PREVIEW ENGINE
========================= */

function previewExtraBoxes(){

  const bg =
  document.getElementById(
  "extraBoxBgInput"
  )?.value || "#ffffff";

  const border =
  document.getElementById(
  "extraBoxBorderInput"
  )?.value || "#dbeafe";

  const titleColor =
  document.getElementById(
  "extraBoxTitleColorInput"
  )?.value || "#145cff";

  const textColor =
  document.getElementById(
  "extraBoxTextColorInput"
  )?.value || "#334155";

  const radius =
  document.getElementById(
  "extraBoxRadiusInput"
  )?.value || 28;

  const padding =
  document.getElementById(
  "extraBoxPaddingInput"
  )?.value || 40;

  const borderSize =
  document.getElementById(
  "extraBoxBorderSizeInput"
  )?.value || 2;

  const titleSize =
  document.getElementById(
  "extraBoxTitleSizeInput"
  )?.value || 32;

  const align =
  document.getElementById(
  "extraBoxAlignInput"
  )?.value || "center";

  const shadow =
  document.getElementById(
  "extraBoxShadowInput"
  )?.checked;

  document
  .querySelectorAll(".service-card")
  .forEach(card=>{

    card.style.background = bg;

    card.style.border =
    `${borderSize}px solid ${border}`;

    card.style.borderRadius =
    `${radius}px`;

    card.style.padding =
    `${padding}px`;

    card.style.textAlign =
    align;

    card.style.boxShadow =
    shadow
    ? "0 12px 35px rgba(0,0,0,.10)"
    : "none";

  });

  document
  .querySelectorAll(".service-title")
  .forEach(title=>{

    title.style.color =
    titleColor;

    title.style.fontSize =
    `${titleSize}px`;

  });

  document
  .querySelectorAll(".service-card label")
  .forEach(label=>{

    label.style.color =
    textColor;

  });

}

/* =========================
LIVE EVENTS
========================= */

function initLivePreview(){

  const ids = [

    "extraBoxBgInput",
    "extraBoxBorderInput",
    "extraBoxTitleColorInput",
    "extraBoxTextColorInput",
    "extraBoxRadiusInput",
    "extraBoxPaddingInput",
    "extraBoxBorderSizeInput",
    "extraBoxTitleSizeInput",
    "extraBoxTextSizeInput",
    "extraBoxAlignInput",
    "extraBoxShadowInput"

  ];

  ids.forEach(id=>{

    const el =
    document.getElementById(id);

    if(!el) return;

    el.addEventListener(
      "input",
      previewExtraBoxes
    );

    el.addEventListener(
      "change",
      previewExtraBoxes
    );

  });

}

/* =========================
RENDER SERVICE CARDS
========================= */

function renderCardsEditor(){

  const container =
  document.getElementById(
    "cardsEditor"
  );

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
        >

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

  previewExtraBoxes();

};

window.saveCard =
function(index){

  systemDesign.services[index].title =
  document.getElementById(
    `title-${index}`
  ).value;

  systemDesign.services[index].description =
  document.getElementById(
    `desc-${index}`
  ).value;

  saveStorage();

  alert("Card Saved");

};

/* =========================
SAVE ALL
========================= */

window.saveAllSystemDesign =
function(){

  /* =========================
  BASIC INFO
  ========================= */

  systemDesign.companyName =
  document.getElementById(
  "companyNameInput"
  )?.value || "";

  systemDesign.timezone =
  document.getElementById(
  "timezoneInput"
  )?.value || "";

  systemDesign.aboutTitle =
  document.getElementById(
  "aboutTitleInput"
  )?.value || "";

  systemDesign.aboutText =
  document.getElementById(
  "aboutTextInput"
  )?.value || "";

  systemDesign.quoteTitle =
  document.getElementById(
  "quoteTitleInput"
  )?.value || "";

  systemDesign.quoteText =
  document.getElementById(
  "quoteTextInput"
  )?.value || "";

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

  systemDesign.contactTitle =
  document.getElementById(
  "contactTitleInput"
  )?.value || "";

  systemDesign.contactPhone =
  document.getElementById(
  "contactPhoneInput"
  )?.value || "";

  systemDesign.contactEmail =
  document.getElementById(
  "contactEmailInput"
  )?.value || "";

  systemDesign.footerText =
  document.getElementById(
  "footerTextInput"
  )?.value || "";

  /* =========================
  THEME ENGINE
  ========================= */

  systemDesign.extraBoxBg =
  document.getElementById(
  "extraBoxBgInput"
  )?.value || "#ffffff";

  systemDesign.extraBoxBorder =
  document.getElementById(
  "extraBoxBorderInput"
  )?.value || "#dbeafe";

  systemDesign.extraBoxTitleColor =
  document.getElementById(
  "extraBoxTitleColorInput"
  )?.value || "#145cff";

  systemDesign.extraBoxTextColor =
  document.getElementById(
  "extraBoxTextColorInput"
  )?.value || "#334155";

  systemDesign.extraBoxRadius =
  document.getElementById(
  "extraBoxRadiusInput"
  )?.value || "28";

  systemDesign.extraBoxPadding =
  document.getElementById(
  "extraBoxPaddingInput"
  )?.value || "40";

  systemDesign.extraBoxAlign =
  document.getElementById(
  "extraBoxAlignInput"
  )?.value || "center";

  systemDesign.extraBoxTitleSize =
  document.getElementById(
  "extraBoxTitleSizeInput"
  )?.value || "32";

  systemDesign.extraBoxTextSize =
  document.getElementById(
  "extraBoxTextSizeInput"
  )?.value || "18";

  systemDesign.extraBoxBorderSize =
  document.getElementById(
  "extraBoxBorderSizeInput"
  )?.value || "2";

  systemDesign.extraBoxShadow =
  document.getElementById(
  "extraBoxShadowInput"
  )?.checked || false;

  /* =========================
  SAVE
  ========================= */

  saveStorage();

  alert("All Settings Saved");

};

/* =========================
RESET
========================= */

window.resetSystemDesign =
function(){

  const ok =
  confirm(
    "Reset System Design?"
  );

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

    initLivePreview();

    previewExtraBoxes();

  }
);