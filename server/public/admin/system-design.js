// =========================================
// FILE: public/admin/system-design.js
// COMPLETE SYSTEM DESIGN ENGINE
// FINAL FIXED VERSION
// =========================================

console.log("SYSTEM DESIGN LOADED");

let systemDesign = {};

/* =========================
DEFAULT DATA
========================= */

const defaultSystemDesign = {

  companyName:"Sunbeam Transportation",

timezone:"America/Phoenix",
region:"Arizona",

country:"USA",
invoiceEmail:"billing@sunbeamtransportation.com",

smtpHost:"smtp.zoho.com",

smtpPort:"465",

smtpSecure:true,

smtpUser:"",

smtpPass:"",

bookingEmailSubject:
"Booking Confirmation",

bookingEmailMessage:
"Your trip is confirmed.",

cancelPolicyText:
"Free cancellation up to 2 hours before trip time.",

mainLogo:"/assets/logo.png",
  driverLogo:"/assets/logo.png",

  heroImage:"/assets/hero.jpeg",

  /* =========================
  BODY
  ========================= */

  bodyBg:"#f1f5f9",

  bodyTextColor:"#0f172a",

  /* =========================
  ABOUT
  ========================= */

  aboutBg:"#ffffff",

  aboutBorder:"#dbeafe",

  aboutRadius:"28",

  aboutPadding:"40",

  aboutTitle:"About Us",

  aboutTitleColor:"#145cff",

  aboutTitleSize:"34",

  aboutTitleAlign:"center",

  aboutText:
  "Professional transportation services.",

  aboutTextColor:"#334155",

  aboutTextSize:"18",

  aboutTextAlign:"justify-center",


  /* =========================
  QUOTE
  ========================= */

  quoteBg:"#ffffff",

  quoteBorder:"#dbeafe",

  quoteRadius:"28",

  quotePadding:"40",

  quoteTitle:
  "Get Quote & Book Your Ride",

  quoteTitleColor:"#145cff",

  quoteTitleSize:"34",

  quoteTitleAlign:"center",

  quoteText:
  "Select your service below",

  quoteTextColor:"#334155",

  quoteTextSize:"18",

  quoteTextAlign:"justify-center",


  /* =========================
  EXTRA BOXES
  ========================= */

  extra1Active:true,

  extra1Title:"Extra Information",

  extra1Text:
  "You can add pricing, announcements, promotions, or company information here.",

  extra2Active:true,

  extra2Title:"Additional Services",

  extra2Text:
  "This section can later be managed from the admin panel.",

  /* =========================
  EXTRA BOX DESIGN
  ========================= */

  extraBoxBg:"#ffffff",

  extraBoxBorder:"#dbeafe",

  extraBoxTitleColor:"#145cff",

  extraBoxTextColor:"#334155",

  extraBoxRadius:"28",

  extraBoxPadding:"40",

  extraBoxAlign:"justify-center",

  extraBoxTitleSize:"32",

  extraBoxTextSize:"18",

  extraBoxBorderSize:"2",

  extraBoxShadow:true,

/* =========================
CONTACT
========================= */

contactTitle:"Customer Support",

contactPhone:"619-509-7197",

contactEmail:
"admin@sunbeamtransportationllc.com",

footerText:"©️ Sunbeam Transportation",

contactTitleColor:"#145cff",

contactTitleSize:"34",

contactBg:"#ffffff",

contactBorder:"#dbeafe",

contactRadius:"28",
contactAlign:"center",

contactJustify:"justify-center",

cardTextAlign:"center",

cardTextJustify:"justify-center",
/* =========================
SERVICES
========================= */

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
LOAD
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

    console.log(err);

    systemDesign =
    defaultSystemDesign;

  }

}

/* =========================
SAVE
========================= */

async function saveSystemDesign(){

  try{

    await fetch(
      "/api/system-design",
      {

        method:"POST",

        headers:{
          "Content-Type":
          "application/json"
        },

        body:
        JSON.stringify(systemDesign)

      }
    );

  }catch(err){

    console.log(err);

  }

}

/* =========================
HELPERS
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
WORD ALIGN HELPERS
========================= */

const WORD_ALIGN_OPTIONS = [
  { value:"left", label:"Left" },
  { value:"center", label:"Center" },
  { value:"right", label:"Right" },
  { value:"justify", label:"Justify" },
  { value:"justify-left", label:"Justify Left" },
  { value:"justify-center", label:"Justify Center" },
  { value:"justify-right", label:"Justify Right" }
];

function normalizeWordAlign(value, fallback = "center"){

  const clean =
  String(value || "")
  .toLowerCase()
  .trim();

  const allowed =
  WORD_ALIGN_OPTIONS.map(item=>item.value);

  return allowed.includes(clean)
  ? clean
  : fallback;

}

function setupAlignSelect(id, value, fallback = "center"){

  const el =
  document.getElementById(id);

  if(!el) return;

  const finalValue =
  normalizeWordAlign(value, fallback);

  el.innerHTML = "";

  WORD_ALIGN_OPTIONS.forEach(item=>{

    const option =
    document.createElement("option");

    option.value =
    item.value;

    option.innerText =
    item.label;

    if(item.value === finalValue){
      option.selected = true;
    }

    el.appendChild(option);

  });

}

function getAlignValue(id, fallback = "center"){

  return normalizeWordAlign(
    document.getElementById(id)?.value,
    fallback
  );

}

/* =========================
LOAD VALUES
========================= */

function loadFormValues(){

  /* =========================
     BASIC
  ========================= */

  setValue(
    "companyNameInput",
    systemDesign.companyName
  );

  setValue(
    "timezoneInput",
    systemDesign.timezone
  );

  setValue(
    "regionInput",
    systemDesign.region
  );

  setValue(
    "countryInput",
    systemDesign.country
  );

  setValue(
    "invoiceEmailInput",
    systemDesign.invoiceEmail
  );

  setValue(
    "smtpHostInput",
    systemDesign.smtpHost
  );

  setValue(
    "smtpPortInput",
    systemDesign.smtpPort
  );

  setValue(
    "smtpUserInput",
    systemDesign.smtpUser
  );

  setValue(
    "smtpPassInput",
    systemDesign.smtpPass
  );

  setValue(
    "bookingEmailSubjectInput",
    systemDesign.bookingEmailSubject
  );

  setValue(
    "bookingEmailMessageInput",
    systemDesign.bookingEmailMessage
  );

  setValue(
    "cancelPolicyTextInput",
    systemDesign.cancelPolicyText
  );

  /* =========================
     IMAGES
  ========================= */

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

  /* =========================
     BODY
  ========================= */

  setValue(
    "bodyBgInput",
    systemDesign.bodyBg
  );

  setValue(
    "bodyTextColorInput",
    systemDesign.bodyTextColor
  );

  /* =========================
     ABOUT
  ========================= */

  setValue(
    "aboutBgInput",
    systemDesign.aboutBg
  );

  setValue(
    "aboutBorderInput",
    systemDesign.aboutBorder
  );

  setValue(
    "aboutRadiusInput",
    systemDesign.aboutRadius
  );

  setValue(
    "aboutPaddingInput",
    systemDesign.aboutPadding
  );

  setValue(
    "aboutTitleInput",
    systemDesign.aboutTitle
  );

  setValue(
    "aboutTitleColorInput",
    systemDesign.aboutTitleColor
  );

  setValue(
    "aboutTitleSizeInput",
    systemDesign.aboutTitleSize
  );

  setupAlignSelect(
    "aboutTitleAlignInput",
    systemDesign.aboutTitleAlign,
    "center"
  );

  setValue(
    "aboutTextInput",
    systemDesign.aboutText
  );

  setValue(
    "aboutTextColorInput",
    systemDesign.aboutTextColor
  );

  setValue(
    "aboutTextSizeInput",
    systemDesign.aboutTextSize
  );

  setupAlignSelect(
    "aboutTextAlignInput",
    systemDesign.aboutTextAlign,
    "justify-center"
  );

  /* =========================
     QUOTE
  ========================= */

  setValue(
    "quoteBgInput",
    systemDesign.quoteBg
  );

  setValue(
    "quoteBorderInput",
    systemDesign.quoteBorder
  );

  setValue(
    "quoteRadiusInput",
    systemDesign.quoteRadius
  );

  setValue(
    "quotePaddingInput",
    systemDesign.quotePadding
  );

  setValue(
    "quoteTitleInput",
    systemDesign.quoteTitle
  );

  setValue(
    "quoteTitleColorInput",
    systemDesign.quoteTitleColor
  );

  setValue(
    "quoteTitleSizeInput",
    systemDesign.quoteTitleSize
  );

  setupAlignSelect(
    "quoteTitleAlignInput",
    systemDesign.quoteTitleAlign,
    "center"
  );

  setValue(
    "quoteTextInput",
    systemDesign.quoteText
  );

  setValue(
    "quoteTextColorInput",
    systemDesign.quoteTextColor
  );

  setValue(
    "quoteTextSizeInput",
    systemDesign.quoteTextSize
  );

  setupAlignSelect(
    "quoteTextAlignInput",
    systemDesign.quoteTextAlign,
    "justify-center"
  );

  /* =========================
     EXTRA BOXES CONTENT
  ========================= */

  setValue(
    "extra1Title",
    systemDesign.extra1Title
  );

  setValue(
    "extra1Text",
    systemDesign.extra1Text
  );

  setChecked(
    "extra1Active",
    systemDesign.extra1Active
  );

  setValue(
    "extra2Title",
    systemDesign.extra2Title
  );

  setValue(
    "extra2Text",
    systemDesign.extra2Text
  );

  setChecked(
    "extra2Active",
    systemDesign.extra2Active
  );

  /* =========================
     EXTRA BOX DESIGN
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

  setupAlignSelect(
    "extraBoxAlignInput",
    systemDesign.extraBoxAlign,
    "justify-center"
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

  /* =========================
     CONTACT
  ========================= */

  setValue(
    "contactTitleInput",
    systemDesign.contactTitle
  );

  setValue(
    "contactPhoneInput",
    systemDesign.contactPhone
  );

  setValue(
    "contactEmailInput",
    systemDesign.contactEmail
  );

  setValue(
    "footerTextInput",
    systemDesign.footerText
  );

  setValue(
    "contactTitleColorInput",
    systemDesign.contactTitleColor
  );

  setValue(
    "contactTitleSizeInput",
    systemDesign.contactTitleSize
  );

  setValue(
    "contactBgInput",
    systemDesign.contactBg
  );

  setValue(
    "contactBorderInput",
    systemDesign.contactBorder
  );

  setValue(
    "contactRadiusInput",
    systemDesign.contactRadius
  );

  setupAlignSelect(
    "contactAlignInput",
    systemDesign.contactAlign,
    "center"
  );

  setupAlignSelect(
    "contactJustifyInput",
    systemDesign.contactJustify,
    "justify-center"
  );

}

/* =========================
UPLOADS
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

formData.append(
  "key",
  key
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

    alert("Uploaded");

  }catch(err){

    console.log(err);

    alert("Upload Error");

  }

}

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
LIVE PREVIEW
========================= */

function previewLive(){

  document.body.style.background =
  document.getElementById(
    "bodyBgInput"
  )?.value || "#f1f5f9";

  document.body.style.color =
  document.getElementById(
    "bodyTextColorInput"
  )?.value || "#0f172a";

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
    style="
      width:100%;
      height:180px;
      object-fit:cover;
      border-radius:14px;
      margin-top:10px;
    "
  >

  <input
    type="file"
    hidden
    accept="image/*"
    id="cardUpload-${index}"
    onchange="uploadCardImage(this,${index})"
  >

  <button
    class="upload-btn"
    type="button"
    onclick="
    document.getElementById(
      'cardUpload-${index}'
    ).click()
    "
  >
    Upload Card Image
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

  saveSystemDesign();

  renderCardsEditor();

};

window.saveCard =
async function(index){

  systemDesign.services[index].title =
  document.getElementById(
    `title-${index}`
  ).value;

  systemDesign.services[index].description =
  document.getElementById(
    `desc-${index}`
  ).value;

  await saveSystemDesign();

  alert("Card Saved");

};

/* =========================
SAVE ALL
========================= */

window.saveAllSystemDesign =
async function(){

  /* =========================
     BASIC
  ========================= */

  systemDesign.companyName =
  document.getElementById(
    "companyNameInput"
  )?.value || "";

  systemDesign.timezone =
  document.getElementById(
    "timezoneInput"
  )?.value || "";

  systemDesign.region =
  document.getElementById(
    "regionInput"
  )?.value || "";

  systemDesign.country =
  document.getElementById(
    "countryInput"
  )?.value || "";

  systemDesign.invoiceEmail =
  document.getElementById(
    "invoiceEmailInput"
  )?.value || "";

  systemDesign.smtpHost =
  document.getElementById(
    "smtpHostInput"
  )?.value || "";

  systemDesign.smtpPort =
  document.getElementById(
    "smtpPortInput"
  )?.value || "";

  systemDesign.smtpUser =
  document.getElementById(
    "smtpUserInput"
  )?.value || "";

  systemDesign.smtpPass =
  document.getElementById(
    "smtpPassInput"
  )?.value || "";

  systemDesign.bookingEmailSubject =
  document.getElementById(
    "bookingEmailSubjectInput"
  )?.value || "";

  systemDesign.bookingEmailMessage =
  document.getElementById(
    "bookingEmailMessageInput"
  )?.value || "";

  systemDesign.cancelPolicyText =
  document.getElementById(
    "cancelPolicyTextInput"
  )?.value || "";

  /* =========================
     BODY
  ========================= */

  systemDesign.bodyBg =
  document.getElementById(
    "bodyBgInput"
  )?.value || "";

  systemDesign.bodyTextColor =
  document.getElementById(
    "bodyTextColorInput"
  )?.value || "";

  /* =========================
     ABOUT
  ========================= */

  systemDesign.aboutBg =
  document.getElementById(
    "aboutBgInput"
  )?.value || "";

  systemDesign.aboutBorder =
  document.getElementById(
    "aboutBorderInput"
  )?.value || "";

  systemDesign.aboutRadius =
  document.getElementById(
    "aboutRadiusInput"
  )?.value || "";

  systemDesign.aboutPadding =
  document.getElementById(
    "aboutPaddingInput"
  )?.value || "";

  systemDesign.aboutTitle =
  document.getElementById(
    "aboutTitleInput"
  )?.value || "";

  systemDesign.aboutTitleColor =
  document.getElementById(
    "aboutTitleColorInput"
  )?.value || "";

  systemDesign.aboutTitleSize =
  document.getElementById(
    "aboutTitleSizeInput"
  )?.value || "";

  systemDesign.aboutTitleAlign =
  getAlignValue(
    "aboutTitleAlignInput",
    "center"
  );

  systemDesign.aboutText =
  document.getElementById(
    "aboutTextInput"
  )?.value || "";

  systemDesign.aboutTextColor =
  document.getElementById(
    "aboutTextColorInput"
  )?.value || "";

  systemDesign.aboutTextSize =
  document.getElementById(
    "aboutTextSizeInput"
  )?.value || "";

  systemDesign.aboutTextAlign =
  getAlignValue(
    "aboutTextAlignInput",
    "justify-center"
  );

  /* =========================
     QUOTE
  ========================= */

  systemDesign.quoteBg =
  document.getElementById(
    "quoteBgInput"
  )?.value || "";

  systemDesign.quoteBorder =
  document.getElementById(
    "quoteBorderInput"
  )?.value || "";

  systemDesign.quoteRadius =
  document.getElementById(
    "quoteRadiusInput"
  )?.value || "";

  systemDesign.quotePadding =
  document.getElementById(
    "quotePaddingInput"
  )?.value || "";

  systemDesign.quoteTitle =
  document.getElementById(
    "quoteTitleInput"
  )?.value || "";

  systemDesign.quoteTitleColor =
  document.getElementById(
    "quoteTitleColorInput"
  )?.value || "";

  systemDesign.quoteTitleSize =
  document.getElementById(
    "quoteTitleSizeInput"
  )?.value || "";

  systemDesign.quoteTitleAlign =
  getAlignValue(
    "quoteTitleAlignInput",
    "center"
  );

  systemDesign.quoteText =
  document.getElementById(
    "quoteTextInput"
  )?.value || "";

  systemDesign.quoteTextColor =
  document.getElementById(
    "quoteTextColorInput"
  )?.value || "";

  systemDesign.quoteTextSize =
  document.getElementById(
    "quoteTextSizeInput"
  )?.value || "";

  systemDesign.quoteTextAlign =
  getAlignValue(
    "quoteTextAlignInput",
    "justify-center"
  );

  /* =========================
     EXTRA BOXES CONTENT
  ========================= */

  systemDesign.extra1Title =
  document.getElementById(
    "extra1Title"
  )?.value || "";

  systemDesign.extra1Text =
  document.getElementById(
    "extra1Text"
  )?.value || "";

  systemDesign.extra1Active =
  document.getElementById(
    "extra1Active"
  )?.checked || false;

  systemDesign.extra2Title =
  document.getElementById(
    "extra2Title"
  )?.value || "";

  systemDesign.extra2Text =
  document.getElementById(
    "extra2Text"
  )?.value || "";

  systemDesign.extra2Active =
  document.getElementById(
    "extra2Active"
  )?.checked || false;

  /* =========================
     EXTRA BOX DESIGN
  ========================= */

  systemDesign.extraBoxBg =
  document.getElementById(
    "extraBoxBgInput"
  )?.value || "";

  systemDesign.extraBoxBorder =
  document.getElementById(
    "extraBoxBorderInput"
  )?.value || "";

  systemDesign.extraBoxTitleColor =
  document.getElementById(
    "extraBoxTitleColorInput"
  )?.value || "";

  systemDesign.extraBoxTextColor =
  document.getElementById(
    "extraBoxTextColorInput"
  )?.value || "";

  systemDesign.extraBoxRadius =
  document.getElementById(
    "extraBoxRadiusInput"
  )?.value || "";

  systemDesign.extraBoxPadding =
  document.getElementById(
    "extraBoxPaddingInput"
  )?.value || "";

  systemDesign.extraBoxAlign =
  getAlignValue(
    "extraBoxAlignInput",
    "justify-center"
  );

  systemDesign.extraBoxTitleSize =
  document.getElementById(
    "extraBoxTitleSizeInput"
  )?.value || "";

  systemDesign.extraBoxTextSize =
  document.getElementById(
    "extraBoxTextSizeInput"
  )?.value || "";

  systemDesign.extraBoxBorderSize =
  document.getElementById(
    "extraBoxBorderSizeInput"
  )?.value || "";

  systemDesign.extraBoxShadow =
  document.getElementById(
    "extraBoxShadowInput"
  )?.checked || false;

  /* =========================
     CONTACT
  ========================= */

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

  systemDesign.contactTitleColor =
  document.getElementById(
    "contactTitleColorInput"
  )?.value || "";

  systemDesign.contactTitleSize =
  document.getElementById(
    "contactTitleSizeInput"
  )?.value || "";

  systemDesign.contactBg =
  document.getElementById(
    "contactBgInput"
  )?.value || "";

  systemDesign.contactBorder =
  document.getElementById(
    "contactBorderInput"
  )?.value || "";

  systemDesign.contactRadius =
  document.getElementById(
    "contactRadiusInput"
  )?.value || "";

  systemDesign.contactAlign =
  getAlignValue(
    "contactAlignInput",
    "center"
  );

  systemDesign.contactJustify =
  getAlignValue(
    "contactJustifyInput",
    "justify-center"
  );

  await saveSystemDesign();

  alert("Saved");

};

/* =========================
UPLOAD CARD IMAGE
========================= */

window.uploadCardImage =
async function(input,index){

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

formData.append(
  "key",
  `services.${index}.image`
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

    alert("Card Image Updated");

  }catch(err){

    console.log(err);

    alert("Upload Error");

  }

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

    previewLive();

  }
);