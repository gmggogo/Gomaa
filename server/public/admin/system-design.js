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

  /* =========================
  CARD THEME ENGINE
  ========================= */

  cardBg:"#ffffff",

  cardBorderColor:"#dbeafe",

  cardBorderSize:"0",

  cardRadius:"26",

  cardShadow:true,

  cardTitleColor:"#111827",

  cardTitleSize:"30",

  cardTextColor:"#6b7280",

  cardTextSize:"17",

  cardButtonBg:"#2563eb",

  cardButtonColor:"#ffffff",

  cardButtonRadius:"16",

  cardButtonSize:"20",

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
SAVE ALL
========================= */

window.saveAllSystemDesign =
function(){

  /* =========================
  EXTRA BOX SAVE
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
  CARD THEME SAVE
  ========================= */

  systemDesign.cardBg =
  document.getElementById(
  "cardBgInput"
  )?.value || "#ffffff";

  systemDesign.cardBorderColor =
  document.getElementById(
  "cardBorderColorInput"
  )?.value || "#dbeafe";

  systemDesign.cardBorderSize =
  document.getElementById(
  "cardBorderSizeInput"
  )?.value || "0";

  systemDesign.cardRadius =
  document.getElementById(
  "cardRadiusInput"
  )?.value || "26";

  systemDesign.cardTitleColor =
  document.getElementById(
  "cardTitleColorInput"
  )?.value || "#111827";

  systemDesign.cardTitleSize =
  document.getElementById(
  "cardTitleSizeInput"
  )?.value || "30";

  systemDesign.cardTextColor =
  document.getElementById(
  "cardTextColorInput"
  )?.value || "#6b7280";

  systemDesign.cardTextSize =
  document.getElementById(
  "cardTextSizeInput"
  )?.value || "17";

  systemDesign.cardButtonBg =
  document.getElementById(
  "cardButtonBgInput"
  )?.value || "#2563eb";

  systemDesign.cardButtonColor =
  document.getElementById(
  "cardButtonColorInput"
  )?.value || "#ffffff";

  systemDesign.cardButtonRadius =
  document.getElementById(
  "cardButtonRadiusInput"
  )?.value || "16";

  systemDesign.cardButtonSize =
  document.getElementById(
  "cardButtonSizeInput"
  )?.value || "20";

  systemDesign.cardShadow =
  document.getElementById(
  "cardShadowInput"
  )?.checked || false;

  saveStorage();

  alert("All Settings Saved");

};