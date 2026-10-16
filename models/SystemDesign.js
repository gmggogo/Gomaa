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


  serviceKey:{
    type:String,
    default:"",
    trim:true,
    uppercase:true
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
SERVICE ZONE
Each booking source has its own independent operating radius.
========================= */

const ServiceZoneSchema =
new mongoose.Schema({

  enabled:{
    type:Boolean,
    default:false
  },

  country:{
    type:String,
    default:""
  },

  stateProvince:{
    type:String,
    default:""
  },

  city:{
    type:String,
    default:""
  },

  postalCode:{
    type:String,
    default:""
  },

  radiusMiles:{
    type:Number,
    default:50,
    min:1
  },

  // Null preserves the legacy one-radius policy until explicitly configured.
  pickupRadiusMiles:{
    type:Number,
    default:null,
    min:1
  },

  centerLat:{
    type:Number,
    default:null
  },

  centerLng:{
    type:Number,
    default:null
  },

  centerAddress:{
    type:String,
    default:""
  }

},{
  _id:false
});

/* =========================
SYSTEM DESIGN
========================= */

const SystemDesignSchema =
new mongoose.Schema({

  // Optional homepage content; existing tenants retain their current layout.
  aboutActive:{type:Boolean,default:true},
  quoteActive:{type:Boolean,default:true},
  extra3Active:{type:Boolean,default:false},
  extra3Title:{type:String,default:"More Information"},
  extra3Text:{type:String,default:""},
  homeImagesGap:{type:String,default:"24"},
  homeImagesMobileGap:{type:String,default:"12"},
  homeImage1:{type:String,default:""},
  homeImage1Active:{type:Boolean,default:false},
  homeImage1Alt:{type:String,default:""},
  homeImage1Width:{type:String,default:"50"},
  homeImage1Height:{type:String,default:"0"},
  homeImage1Fit:{type:String,default:"contain"},
  homeImage1MobileWidth:{type:String,default:"100"},
  homeImage1MobileHeight:{type:String,default:"0"},
  homeImage2:{type:String,default:""},
  homeImage2Active:{type:Boolean,default:false},
  homeImage2Alt:{type:String,default:""},
  homeImage2Width:{type:String,default:"50"},
  homeImage2Height:{type:String,default:"0"},
  homeImage2Fit:{type:String,default:"contain"},
  homeImage2MobileWidth:{type:String,default:"100"},
  homeImage2MobileHeight:{type:String,default:"0"},
  homeImage3:{type:String,default:""},
  homeImage3Active:{type:Boolean,default:false},
  homeImage3Alt:{type:String,default:""},
  homeImage3Width:{type:String,default:"50"},
  homeImage3Height:{type:String,default:"0"},
  homeImage3Fit:{type:String,default:"contain"},
  homeImage3MobileWidth:{type:String,default:"100"},
  homeImage3MobileHeight:{type:String,default:"0"},
  homeImage4:{type:String,default:""},
  homeImage4Active:{type:Boolean,default:false},
  homeImage4Alt:{type:String,default:""},
  homeImage4Width:{type:String,default:"50"},
  homeImage4Height:{type:String,default:"0"},
  homeImage4Fit:{type:String,default:"contain"},
  homeImage4MobileWidth:{type:String,default:"100"},
  homeImage4MobileHeight:{type:String,default:"0"},
  homeImage5:{type:String,default:""},
  homeImage5Active:{type:Boolean,default:false},
  homeImage5Alt:{type:String,default:""},
  homeImage5Width:{type:String,default:"50"},
  homeImage5Height:{type:String,default:"0"},
  homeImage5Fit:{type:String,default:"contain"},
  homeImage5MobileWidth:{type:String,default:"100"},
  homeImage5MobileHeight:{type:String,default:"0"},
  homeImage6:{type:String,default:""},
  homeImage6Active:{type:Boolean,default:false},
  homeImage6Alt:{type:String,default:""},
  homeImage6Width:{type:String,default:"50"},
  homeImage6Height:{type:String,default:"0"},
  homeImage6Fit:{type:String,default:"contain"},
  homeImage6MobileWidth:{type:String,default:"100"},
  homeImage6MobileHeight:{type:String,default:"0"},
  homeImage7:{type:String,default:""},
  homeImage7Active:{type:Boolean,default:false},
  homeImage7Alt:{type:String,default:""},
  homeImage7Width:{type:String,default:"50"},
  homeImage7Height:{type:String,default:"0"},
  homeImage7Fit:{type:String,default:"contain"},
  homeImage7MobileWidth:{type:String,default:"100"},
  homeImage7MobileHeight:{type:String,default:"0"},
  homeImage8:{type:String,default:""},
  homeImage8Active:{type:Boolean,default:false},
  homeImage8Alt:{type:String,default:""},
  homeImage8Width:{type:String,default:"50"},
  homeImage8Height:{type:String,default:"0"},
  homeImage8Fit:{type:String,default:"contain"},
  homeImage8MobileWidth:{type:String,default:"100"},
  homeImage8MobileHeight:{type:String,default:"0"},

  /* =========================
  MULTI TENANT
  One System Design per company
  ========================= */

  tenantId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Tenant",
    default:null
  },

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
  SERVICE ZONES
  Independent limits for Get Quote, Companies and Reserved.
  ========================= */

  getQuoteZone:{
    type:ServiceZoneSchema,
    default:()=>({
      enabled:false,
      radiusMiles:50
    })
  },

  companiesZone:{
    type:ServiceZoneSchema,
    default:()=>({
      enabled:false,
      radiusMiles:50
    })
  },

  reservedZone:{
    type:ServiceZoneSchema,
    default:()=>({
      enabled:false,
      radiusMiles:50
    })
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

  heroImageActive:{type:Boolean,default:true},
  heroImageAlt:{type:String,default:""},
  heroImageWidth:{type:String,default:"100"},
  heroImageHeight:{type:String,default:"0"},
  heroImageFit:{type:String,default:"contain"},
  heroImageMobileWidth:{type:String,default:"100"},
  heroImageMobileHeight:{type:String,default:"0"},
  heroImageMobileFit:{type:String,default:"cover"},

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
  ABOUT - MOBILE
  ========================= */

  aboutMobilePadding:{
    type:String,
    default:"18"
  },

  aboutTitleMobileSize:{
    type:String,
    default:"20"
  },

  aboutTitleMobileAlign:{
    type:String,
    default:"center"
  },

  aboutTextMobileSize:{
    type:String,
    default:"14"
  },

  aboutTextMobileAlign:{
    type:String,
    default:"left"
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
  QUOTE - MOBILE
  ========================= */

  quoteMobilePadding:{
    type:String,
    default:"18"
  },

  quoteTitleMobileSize:{
    type:String,
    default:"20"
  },

  quoteTitleMobileAlign:{
    type:String,
    default:"center"
  },

  quoteTextMobileSize:{
    type:String,
    default:"14"
  },

  quoteTextMobileAlign:{
    type:String,
    default:"left"
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

  /* =========================
  EXTRA BOX DESIGN - MOBILE
  ========================= */

  extraBoxMobilePadding:{
    type:String,
    default:"18"
  },

  extraBoxTitleMobileSize:{
    type:String,
    default:"20"
  },

  extraBoxTitleMobileAlign:{
    type:String,
    default:"center"
  },

  extraBoxTextMobileSize:{
    type:String,
    default:"14"
  },

  extraBoxTextMobileAlign:{
    type:String,
    default:"left"
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

/* =========================
MULTI TENANT INDEX
Only one SystemDesign document per tenant.

Legacy documents that were saved before tenantId
was added are ignored by this partial index.
========================= */

SystemDesignSchema.index(
  {
    tenantId:1
  },
  {
    unique:true,
    name:"system_design_tenant_unique",
    partialFilterExpression:{
      tenantId:{
        $type:"objectId"
      }
    }
  }
);

const SystemDesign =
  mongoose.models.SystemDesign ||
  mongoose.model(
    "SystemDesign",
    SystemDesignSchema
  );

module.exports =
  SystemDesign;