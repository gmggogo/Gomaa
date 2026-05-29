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
region:{
  type:String,
  default:"Arizona"
},

country:{
  type:String,
  default:"USA"
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
  BODY
  ========================= */

  bodyBg:{
    type:String,
    default:"#f1f5f9"
  },

  bodyTextColor:{
    type:String,
    default:"#0f172a"
  },

  /* =========================
  ABOUT
  ========================= */

  aboutBg:{
    type:String,
    default:"#ffffff"
  },

  aboutBorder:{
    type:String,
    default:"#dbeafe"
  },

  aboutRadius:{
    type:String,
    default:"28"
  },

  aboutPadding:{
    type:String,
    default:"40"
  },

  aboutTitle:{
    type:String,
    default:"About Us"
  },

  aboutTitleColor:{
    type:String,
    default:"#145cff"
  },

  aboutTitleSize:{
    type:String,
    default:"34"
  },

  aboutTitleAlign:{
    type:String,
    default:"center"
  },

  aboutText:{
    type:String,
    default:"Professional transportation services."
  },

  aboutTextColor:{
    type:String,
    default:"#334155"
  },

  aboutTextSize:{
    type:String,
    default:"18"
  },

  aboutTextAlign:{
    type:String,
    default:"center"
  },

  /* =========================
  QUOTE
  ========================= */

  quoteBg:{
    type:String,
    default:"#ffffff"
  },

  quoteBorder:{
    type:String,
    default:"#dbeafe"
  },

  quoteRadius:{
    type:String,
    default:"28"
  },

  quotePadding:{
    type:String,
    default:"40"
  },

  quoteTitle:{
    type:String,
    default:"Get Quote & Book Your Ride"
  },

  quoteTitleColor:{
    type:String,
    default:"#145cff"
  },

  quoteTitleSize:{
    type:String,
    default:"34"
  },

  quoteTitleAlign:{
    type:String,
    default:"center"
  },

  quoteText:{
    type:String,
    default:"Select your service below"
  },

  quoteTextColor:{
    type:String,
    default:"#334155"
  },

  quoteTextSize:{
    type:String,
    default:"18"
  },

  quoteTextAlign:{
    type:String,
    default:"center"
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
  EXTRA BOX DESIGN
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
  CONTACT DESIGN
  ========================= */

  contactTitleColor:{
    type:String,
    default:"#145cff"
  },

  contactTitleSize:{
    type:String,
    default:"30"
  },

  contactBg:{
    type:String,
    default:"#ffffff"
  },

  contactBorder:{
    type:String,
    default:"#dbeafe"
  },

  contactRadius:{
    type:String,
    default:"28"
  },

  contactPadding:{
    type:String,
    default:"40"
  },

  contactBorderSize:{
    type:String,
    default:"2"
  },

  contactTextColor:{
    type:String,
    default:"#334155"
  },

  contactAlign:{
    type:String,
    default:"center"
  },

  contactJustify:{
    type:String,
    default:"space-between"
  },
/* =========================
EMAIL SETTINGS
========================= */

invoiceEmail:{
  type:String,
  default:"billing@sunbeamtransportation.com"
},

smtpHost:{
  type:String,
  default:"smtp.zoho.com"
},

smtpPort:{
  type:String,
  default:"465"
},

smtpSecure:{
  type:Boolean,
  default:true
},

smtpUser:{
  type:String,
  default:""
},

smtpPass:{
  type:String,
  default:""
},

bookingEmailSubject:{
  type:String,
  default:"Booking Confirmation"
},

bookingEmailMessage:{
  type:String,
  default:"Your trip is confirmed."
},

cancelPolicyText:{
  type:String,
  default:"Free cancellation up to 2 hours before trip time."
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