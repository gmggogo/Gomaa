أيوه كان ناقص. ده الملف كامل من أوله لآخره:

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
  bodyBg:"#f1f5f9",
  bodyTextColor:"#0f172a",
  aboutBg:"#ffffff",
  aboutBorder:"#dbeafe",
  aboutRadius:"28",
  aboutPadding:"40",
  aboutTitle:"About Us",
  aboutTitleColor:"#145cff",
  aboutTitleSize:"34",
  aboutTitleAlign:"center",
  aboutText:"Professional transportation services.",
  aboutTextColor:"#334155",
  aboutTextSize:"18",
  aboutTextAlign:"center",
  quoteBg:"#ffffff",
  quoteBorder:"#dbeafe",
  quoteRadius:"28",
  quotePadding:"40",
  quoteTitle:"Get Quote & Book Your Ride",
  quoteTitleColor:"#145cff",
  quoteTitleSize:"34",
  quoteTitleAlign:"center",
  quoteText:"Select your service below",
  quoteTextColor:"#334155",
  quoteTextSize:"18",
  quoteTextAlign:"center",
  extra1Active:true,
  extra1Title:"Extra Information",
  extra1Text:"You can add pricing, announcements, promotions, or company information here.",
  extra2Active:true,
  extra2Title:"Additional Services",
  extra2Text:"This section can later be managed from the admin panel.",
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
      Array.isArray(data.services) && data.services.length
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
SAVE
========================= */
async function saveSystemDesign(){
  try{
    await fetch(
      "/api/system-design",
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify(systemDesign)
      }
    );
  }catch(err){
    console.log("SAVE ERROR",err);
  }
}
/* =========================
HELPERS
========================= */
function setValue(id,value){
  const el =
  document.getElementById(id);
  if(el){
    el.value = value ?? "";
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
function getValue(id,fallback=""){
  return document.getElementById(id)?.value || fallback;
}
function getChecked(id){
  return document.getElementById(id)?.checked || false;
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
  setValue("bodyBgInput",systemDesign.bodyBg);
  setValue("bodyTextColorInput",systemDesign.bodyTextColor);
  setValue("aboutBgInput",systemDesign.aboutBg);
  setValue("aboutBorderInput",systemDesign.aboutBorder);
  setValue("aboutRadiusInput",systemDesign.aboutRadius);
  setValue("aboutPaddingInput",systemDesign.aboutPadding);
  setValue("aboutTitleInput",systemDesign.aboutTitle);
  setValue("aboutTitleColorInput",systemDesign.aboutTitleColor);
  setValue("aboutTitleSizeInput",systemDesign.aboutTitleSize);
  setValue("aboutTitleAlignInput",systemDesign.aboutTitleAlign);
  setValue("aboutTextInput",systemDesign.aboutText);
  setValue("aboutTextColorInput",systemDesign.aboutTextColor);
  setValue("aboutTextSizeInput",systemDesign.aboutTextSize);
  setValue("aboutTextAlignInput",systemDesign.aboutTextAlign);
  setValue("quoteBgInput",systemDesign.quoteBg);
  setValue("quoteBorderInput",systemDesign.quoteBorder);
  setValue("quoteRadiusInput",systemDesign.quoteRadius);
  setValue("quotePaddingInput",systemDesign.quotePadding);
  setValue("quoteTitleInput",systemDesign.quoteTitle);
  setValue("quoteTitleColorInput",systemDesign.quoteTitleColor);
  setValue("quoteTitleSizeInput",systemDesign.quoteTitleSize);
  setValue("quoteTitleAlignInput",systemDesign.quoteTitleAlign);
  setValue("quoteTextInput",systemDesign.quoteText);
  setValue("quoteTextColorInput",systemDesign.quoteTextColor);
  setValue("quoteTextSizeInput",systemDesign.quoteTextSize);
  setValue("quoteTextAlignInput",systemDesign.quoteTextAlign);
  setValue("extra1Title",systemDesign.extra1Title);
  setValue("extra1Text",systemDesign.extra1Text);
  setChecked("extra1Active",systemDesign.extra1Active);
  setValue("extra2Title",systemDesign.extra2Title);
  setValue("extra2Text",systemDesign.extra2Text);
  setChecked("extra2Active",systemDesign.extra2Active);
  setValue("extraBoxBgInput",systemDesign.extraBoxBg);
  setValue("extraBoxBorderInput",systemDesign.extraBoxBorder);
  setValue("extraBoxTitleColorInput",systemDesign.extraBoxTitleColor);
  setValue("extraBoxTextColorInput",systemDesign.extraBoxTextColor);
  setValue("extraBoxRadiusInput",systemDesign.extraBoxRadius);
  setValue("extraBoxPaddingInput",systemDesign.extraBoxPadding);
  setValue("extraBoxAlignInput",systemDesign.extraBoxAlign);
  setValue("extraBoxTitleSizeInput",systemDesign.extraBoxTitleSize);
  setValue("extraBoxTextSizeInput",systemDesign.extraBoxTextSize);
  setValue("extraBoxBorderSizeInput",systemDesign.extraBoxBorderSize);
  setChecked("extraBoxShadowInput",systemDesign.extraBoxShadow);
  setValue("contactTitleInput",systemDesign.contactTitle);
  setValue("contactPhoneInput",systemDesign.contactPhone);
  setValue("contactEmailInput",systemDesign.contactEmail);
  setValue("footerTextInput",systemDesign.footerText);
}
/* =========================
UPLOADS
========================= */
async function uploadMainImage(input,key,previewId){
  const file =
  input.files[0];
  if(!file) return;
  try{
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
    setImage(previewId,data.image);
    await saveSystemDesign();
    alert("Uploaded");
  }catch(err){
    console.log("UPLOAD ERROR",err);
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
  getValue("bodyBgInput","#f1f5f9");
  document.body.style.color =
  getValue("bodyTextColorInput","#0f172a");
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
          style="
            width:100%;
            height:180px;
            object-fit:cover;
            border-radius:14px;
            margin-top:10px;
          "
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
async function(index){
  systemDesign.services[index].active =
  !systemDesign.services[index].active;
  await saveSystemDesign();
  renderCardsEditor();
};
window.saveCard =
async function(index){
  systemDesign.services[index].title =
  getValue(`title-${index}`);
  systemDesign.services[index].description =
  getValue(`desc-${index}`);
  await saveSystemDesign();
  alert("Card Saved");
};
/* =========================
SAVE ALL
========================= */
window.saveAllSystemDesign =
async function(){
  systemDesign.companyName =
  getValue("companyNameInput");
  systemDesign.timezone =
  getValue("timezoneInput");
  systemDesign.bodyBg =
  getValue("bodyBgInput");
  systemDesign.bodyTextColor =
  getValue("bodyTextColorInput");
  systemDesign.aboutBg =
  getValue("aboutBgInput");
  systemDesign.aboutBorder =
  getValue("aboutBorderInput");
  systemDesign.aboutRadius =
  getValue("aboutRadiusInput");
  systemDesign.aboutPadding =
  getValue("aboutPaddingInput");
  systemDesign.aboutTitle =
  getValue("aboutTitleInput");
  systemDesign.aboutTitleColor =
  getValue("aboutTitleColorInput");
  systemDesign.aboutTitleSize =
  getValue("aboutTitleSizeInput");
  systemDesign.aboutTitleAlign =
  getValue("aboutTitleAlignInput");
  systemDesign.aboutText =
  getValue("aboutTextInput");
  systemDesign.aboutTextColor =
  getValue("aboutTextColorInput");
  systemDesign.aboutTextSize =
  getValue("aboutTextSizeInput");
  systemDesign.aboutTextAlign =
  getValue("aboutTextAlignInput");
  systemDesign.quoteBg =
  getValue("quoteBgInput");
  systemDesign.quoteBorder =
  getValue("quoteBorderInput");
  systemDesign.quoteRadius =
  getValue("quoteRadiusInput");
  systemDesign.quotePadding =
  getValue("quotePaddingInput");
  systemDesign.quoteTitle =
  getValue("quoteTitleInput");
  systemDesign.quoteTitleColor =
  getValue("quoteTitleColorInput");
  systemDesign.quoteTitleSize =
  getValue("quoteTitleSizeInput");
  systemDesign.quoteTitleAlign =
  getValue("quoteTitleAlignInput");
  systemDesign.quoteText =
  getValue("quoteTextInput");
  systemDesign.quoteTextColor =
  getValue("quoteTextColorInput");
  systemDesign.quoteTextSize =
  getValue("quoteTextSizeInput");
  systemDesign.quoteTextAlign =
  getValue("quoteTextAlignInput");
  systemDesign.extra1Title =
  getValue("extra1Title");
  systemDesign.extra1Text =
  getValue("extra1Text");
  systemDesign.extra1Active =
  getChecked("extra1Active");
  systemDesign.extra2Title =
  getValue("extra2Title");
  systemDesign.extra2Text =
  getValue("extra2Text");
  systemDesign.extra2Active =
  getChecked("extra2Active");
  systemDesign.extraBoxBg =
  getValue("extraBoxBgInput");
  systemDesign.extraBoxBorder =
  getValue("extraBoxBorderInput");
  systemDesign.extraBoxTitleColor =
  getValue("extraBoxTitleColorInput");
  systemDesign.extraBoxTextColor =
  getValue("extraBoxTextColorInput");
  systemDesign.extraBoxRadius =
  getValue("extraBoxRadiusInput");
  systemDesign.extraBoxPadding =
  getValue("extraBoxPaddingInput");
  systemDesign.extraBoxAlign =
  getValue("extraBoxAlignInput","center");
  systemDesign.extraBoxTitleSize =
  getValue("extraBoxTitleSizeInput");
  systemDesign.extraBoxTextSize =
  getValue("extraBoxTextSizeInput");
  systemDesign.extraBoxBorderSize =
  getValue("extraBoxBorderSizeInput");
  systemDesign.extraBoxShadow =
  getChecked("extraBoxShadowInput");
  systemDesign.contactTitle =
  getValue("contactTitleInput");
  systemDesign.contactPhone =
  getValue("contactPhoneInput");
  systemDesign.contactEmail =
  getValue("contactEmailInput");
  systemDesign.footerText =
  getValue("footerTextInput");
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
    renderCardsEditor();
    previewLive();
  }
);