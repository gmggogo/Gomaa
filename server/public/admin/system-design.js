استبدل ملف system-design.js كله بالكامل بده، ده فيه:

* BODY controls
* ABOUT controls
* QUOTE controls
* حفظ + تحميل + لايف بريفيو
* كل جزء مستقل لوحده
* بدون ما نرجع نعدل تاني في نفس النقطة

// =========================================
// FILE: public/admin/system-design.js
// COMPLETE SYSTEM DESIGN ENGINE
// =========================================
console.log("SYSTEM DESIGN LOADED");
let systemDesign = {};
/* =========================
DEFAULT DATA
========================= */
const defaultSystemDesign = {
  companyName:"Sunbeam Transportation",
  timezone:"America/Phoenix",
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
  aboutTextAlign:"center",
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
  quoteTextAlign:"center",
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
  extraBoxAlign:"center",
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
  footerText:"© Sunbeam Transportation",
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
LOAD VALUES
========================= */
function loadFormValues(){
  /* BASIC */
  setValue(
    "companyNameInput",
    systemDesign.companyName
  );
  setValue(
    "timezoneInput",
    systemDesign.timezone
  );
  /* IMAGES */
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
  /* BODY */
  setValue(
    "bodyBgInput",
    systemDesign.bodyBg
  );
  setValue(
    "bodyTextColorInput",
    systemDesign.bodyTextColor
  );
  /* ABOUT */
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
  setValue(
    "aboutTitleAlignInput",
    systemDesign.aboutTitleAlign
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
  setValue(
    "aboutTextAlignInput",
    systemDesign.aboutTextAlign
  );
  /* QUOTE */
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
  setValue(
    "quoteTitleAlignInput",
    systemDesign.quoteTitleAlign
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
  setValue(
    "quoteTextAlignInput",
    systemDesign.quoteTextAlign
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
  const formData =
  new FormData();
  formData.append("image",file);
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
}
window.uploadMainLogo =
input =>
uploadMainImage(
  input,
  "mainLogo",
  "mainLogoPreview"
);
window.uploadDriverLogo =
input =>
uploadMainImage(
  input,
  "driverLogo",
  "driverLogoPreview"
);
window.uploadHeroImage =
input =>
uploadMainImage(
  input,
  "heroImage",
  "heroImagePreview"
);
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
SAVE ALL
========================= */
window.saveAllSystemDesign =
async function(){
  /* BASIC */
  systemDesign.companyName =
  document.getElementById(
  "companyNameInput"
  )?.value || "";
  systemDesign.timezone =
  document.getElementById(
  "timezoneInput"
  )?.value || "";
  /* BODY */
  systemDesign.bodyBg =
  document.getElementById(
  "bodyBgInput"
  )?.value || "";
  systemDesign.bodyTextColor =
  document.getElementById(
  "bodyTextColorInput"
  )?.value || "";
  /* ABOUT */
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
  document.getElementById(
  "aboutTitleAlignInput"
  )?.value || "";
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
  document.getElementById(
  "aboutTextAlignInput"
  )?.value || "";
  /* QUOTE */
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
  document.getElementById(
  "quoteTitleAlignInput"
  )?.value || "";
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
  document.getElementById(
  "quoteTextAlignInput"
  )?.value || "";
  await saveSystemDesign();
  alert("Saved");
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
    previewLive();
  }
);