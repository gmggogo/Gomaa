const mongoose = require("mongoose");

/* =========================
SERVICES
========================= */

const ServiceSchema =
new mongoose.Schema({

  id:{
    type:String,
    default:""
  },

  active:{
    type:Boolean,
    default:false
  },

  title:{
    type:String,
    default:""
  },

  description:{
    type:String,
    default:""
  },

  image:{
    type:String,
    default:""
  },

  link:{
    type:String,
    default:"getquote/index.html"
  }

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

  /* =========================
  LOGOS
  ========================= */

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
  HOMEPAGE
  ========================= */

  aboutTitle:{
    type:String,
    default:"About Us"
  },

  aboutText:{
    type:String,
    default:"Professional transportation services."
  },

  quoteTitle:{
    type:String,
    default:"Get Quote & Book Your Ride"
  },

  quoteText:{
    type:String,
    default:"Select your service below"
  },

  /* =========================
  EXTRA BOXES
  ========================= */

  extra1Active:{
    type:Boolean,
    default:true
  },

  extra1Title:{
    type:String,
    default:"Extra Information"
  },

  extra1Text:{
    type:String,
    default:"You can add pricing, announcements, promotions, or company information here."
  },

  extra2Active:{
    type:Boolean,
    default:true
  },

  extra2Title:{
    type:String,
    default:"Additional Services"
  },

  extra2Text:{
    type:String,
    default:"This section can later be managed from the admin panel."
  },

  /* =========================
  EXTRA BOX THEME ENGINE
  ========================= */

  extraBoxBg:{
    type:String,
    default:"#ffffff"
  },

  extraBoxBorder:{
    type:String,
    default:"#dbeafe"
  },

  extraBoxTitleColor:{
    type:String,
    default:"#145cff"
  },

  extraBoxTextColor:{
    type:String,
    default:"#334155"
  },

  extraBoxRadius:{
    type:String,
    default:"28"
  },

  extraBoxPadding:{
    type:String,
    default:"40"
  },

  extraBoxAlign:{
    type:String,
    default:"center"
  },

  extraBoxTitleSize:{
    type:String,
    default:"32"
  },

  extraBoxTextSize:{
    type:String,
    default:"18"
  },

  extraBoxBorderSize:{
    type:String,
    default:"2"
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

  contactPhone:{
    type:String,
    default:"619-509-7197"
  },

  contactEmail:{
    type:String,
    default:"admin@sunbeamtransportationllc.com"
  },

  footerText:{
    type:String,
    default:"©️ Sunbeam Transportation"
  },

  /* =========================
  SERVICES
  ========================= */

  services:{
    type:[ServiceSchema],
    default:[]
  }

},
{
  timestamps:true
});

module.exports =
mongoose.model(
  "SystemDesign",
  SystemDesignSchema
);