// =========================
// FILE: models/SystemDesign.js
// COMPLETE FINAL THEME ENGINE MODEL
// =========================

const mongoose = require("mongoose");

/* =========================
SERVICE SCHEMA
========================= */

const ServiceSchema = new mongoose.Schema({

  id:String,

  active:{
    type:Boolean,
    default:false
  },

  title:String,

  titleEs:String,

  description:String,

  descriptionEs:String,

  button:String,

  buttonEs:String,

  image:String,

  link:String

});

/* =========================
SYSTEM DESIGN
========================= */

const SystemDesignSchema =
new mongoose.Schema({

  /* =========================
  COMPANY
  ========================= */

  companyName:{
    type:String,
    default:"Sunbeam Transportation"
  },

  timezone:{
    type:String,
    default:"America/Phoenix"
  },

  mainLogo:{
    type:String,
    default:"/assets/logo.png"
  },

  driverLogo:{
    type:String,
    default:"/assets/logo.png"
  },

  heroImage:{
    type:String,
    default:"/assets/hero.jpeg"
  },

  /* =========================
  ABOUT
  ========================= */

  aboutTitle:String,

  aboutTitleEs:String,

  aboutText:String,

  aboutTextEs:String,

  /* =========================
  QUOTE
  ========================= */

  quoteTitle:String,

  quoteTitleEs:String,

  quoteText:String,

  quoteTextEs:String,

  /* =========================
  EXTRA BOXES
  ========================= */

  extra1Active:{
    type:Boolean,
    default:true
  },

  extra1Title:String,

  extra1TitleEs:String,

  extra1Text:String,

  extra1TextEs:String,

  extra2Active:{
    type:Boolean,
    default:true
  },

  extra2Title:String,

  extra2TitleEs:String,

  extra2Text:String,

  extra2TextEs:String,

  /* =========================
  GLOBAL THEME ENGINE
  ========================= */

  /* BACKGROUNDS */

  pageBackground:{
    type:String,
    default:"#f3f4f6"
  },

  sectionBackground:{
    type:String,
    default:"#ffffff"
  },

  cardBackground:{
    type:String,
    default:"#ffffff"
  },

  extraBoxBg:{
    type:String,
    default:"#ffffff"
  },

  /* TEXT COLORS */

  titleColor:{
    type:String,
    default:"#1e3a6d"
  },

  textColor:{
    type:String,
    default:"#6b7280"
  },

  extraBoxTitleColor:{
    type:String,
    default:"#145cff"
  },

  extraBoxTextColor:{
    type:String,
    default:"#334155"
  },

  /* BUTTONS */

  buttonColor:{
    type:String,
    default:"#2563eb"
  },

  buttonTextColor:{
    type:String,
    default:"#ffffff"
  },

  /* BORDER */

  borderColor:{
    type:String,
    default:"#dbeafe"
  },

  extraBoxBorder:{
    type:String,
    default:"#dbeafe"
  },

  extraBoxBorderSize:{
    type:String,
    default:"2"
  },

  /* RADIUS */

  borderRadius:{
    type:String,
    default:"28"
  },

  extraBoxRadius:{
    type:String,
    default:"28"
  },

  /* PADDING */

  extraBoxPadding:{
    type:String,
    default:"40"
  },

  /* ALIGN */

  textAlign:{
    type:String,
    default:"center"
  },

  extraBoxAlign:{
    type:String,
    default:"center"
  },

  /* FONT SIZES */

  titleSize:{
    type:String,
    default:"42"
  },

  textSize:{
    type:String,
    default:"20"
  },

  extraBoxTitleSize:{
    type:String,
    default:"32"
  },

  extraBoxTextSize:{
    type:String,
    default:"18"
  },

  /* SHADOW */

  enableShadow:{
    type:Boolean,
    default:true
  },

  extraBoxShadow:{
    type:Boolean,
    default:true
  },

  /* =========================
  CONTACT
  ========================= */

  contactTitle:{
    type:String,
    default:"Customer Support"
  },

  contactTitleEs:String,

  contactPhone:{
    type:String,
    default:"619-509-7197"
  },

  contactEmail:{
    type:String,
    default:"admin@sunbeamtransportationllc.com"
  },

  /* =========================
  FOOTER
  ========================= */

  footerText:{
    type:String,
    default:"©️ Sunbeam Transportation"
  },

  footerTextEs:String,

  /* =========================
  SERVICES
  ========================= */

  services:[ServiceSchema]

},
{
  timestamps:true
});

module.exports =
mongoose.model(
  "SystemDesign",
  SystemDesignSchema
);