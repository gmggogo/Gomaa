const mongoose = require("mongoose");

/* =====================================================
   FACILITY PRICING OVERRIDE MODEL
   Same pricing fields as Facility section in Service Management
   FIXED:
   - Prevent individual services from falling back to ST
   - Wheelchair => WH
   - Shared => SH
   - Taxi => TX
   - Limo => LM
   - XL => XL
===================================================== */

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function normalizeServiceCode(v){

  const c =
    clean(v)
      .toUpperCase()
      .replace(/[_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  if(!c) return "";

  if(c === "STANDARD" || c === "ST") return "ST";

  if(
    c === "WHEELCHAIR" ||
    c === "WHEEL CHAIR" ||
    c === "WH"
  ){
    return "WH";
  }

  if(c === "SHARED" || c === "SH"){
    return "SH";
  }

  if(
    c === "LIMO" ||
    c === "LIMOUSINE" ||
    c === "LM"
  ){
    return "LM";
  }

  if(c === "TAXI" || c === "TX"){
    return "TX";
  }

  if(c === "XL"){
    return "XL";
  }

  return c;
}

function detectServiceCode(service){

  const raw =
    [
      service?.serviceName,
      service?.serviceSuffix,
      service?.serviceKey
    ]
    .map(clean)
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if(!raw){
    return "";
  }

  if(
    raw.includes("WHEELCHAIR") ||
    raw.includes("WHEEL CHAIR") ||
    raw === "WH" ||
    raw.startsWith("WH ") ||
    raw.endsWith(" WH") ||
    raw.includes(" WH ")
  ){
    return "WH";
  }

  if(
    raw.includes("SHARED") ||
    raw === "SH" ||
    raw.startsWith("SH ") ||
    raw.endsWith(" SH") ||
    raw.includes(" SH ")
  ){
    return "SH";
  }

  if(
    raw.includes("LIMOUSINE") ||
    raw.includes("LIMO") ||
    raw === "LM" ||
    raw.startsWith("LM ") ||
    raw.endsWith(" LM") ||
    raw.includes(" LM ")
  ){
    return "LM";
  }

  if(
    raw.includes("TAXI") ||
    raw === "TX" ||
    raw.startsWith("TX ") ||
    raw.endsWith(" TX") ||
    raw.includes(" TX ")
  ){
    return "TX";
  }

  if(
    raw === "XL" ||
    raw.startsWith("XL ") ||
    raw.endsWith(" XL") ||
    raw.includes(" XL ")
  ){
    return "XL";
  }

  return (
    normalizeServiceCode(service?.serviceKey) ||
    normalizeServiceCode(service?.serviceSuffix) ||
    normalizeServiceCode(service?.serviceName) ||
    ""
  );
}

/* =========================
   SERVICE PRICING SUB SCHEMA
========================= */

const servicePricingSchema = new mongoose.Schema(
  {
    serviceKey: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },

    serviceName: {
      type: String,
      default: "",
      trim: true
    },

    serviceSuffix: {
      type: String,
      default: "",
      trim: true,
      uppercase: true
    },

    shared: {
      type: Boolean,
      default: false
    },

    pricingMode: {
      type: String,
      enum: ["MILE", "HOURLY", "SHARED"],
      default: "MILE"
    },

    baseFare: {
      type: Number,
      default: 0
    },

    includedMiles: {
      type: Number,
      default: 0
    },

    perMile: {
      type: Number,
      default: 0
    },

    hourlyRate: {
      type: Number,
      default: 0
    },

    hourlyBillingMode: {
      type: String,
      enum: ["FULL", "QUARTER"],
      default: "FULL"
    },

    stopFee: {
      type: Number,
      default: 0
    },

    noShowFee: {
      type: Number,
      default: 0
    },

    sharedPrice: {
      type: Number,
      default: 0
    },

    disableCancel: {
      type: Boolean,
      default: false
    },

    warningMinutes: {
      type: Number,
      default: 0
    },

    cancelFee: {
      type: Number,
      default: 0
    },

    addStopEnabled: {
      type: Boolean,
      default: false
    },

    addStopCustomTimeEnabled: {
      type: Boolean,
      default: false
    },

    addStopCutoffMinutes: {
      type: Number,
      default: 0
    }
  },
  {
    _id:false
  }
);

/* =========================
   MAIN SCHEMA
========================= */

const facilityPricingOverrideSchema = new mongoose.Schema(
  {
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    facilityName: {
      type: String,
      required: true,
      trim: true
    },

    active: {
      type: Boolean,
      default: false
    },

    services: {
      type: [servicePricingSchema],
      default: []
    },

    updatedBy: {
      type: String,
      default: ""
    }
  },
  {
    timestamps:true
  }
);

/* =========================
   NORMALIZE BEFORE VALIDATE
========================= */

facilityPricingOverrideSchema.pre("validate", function(next){

  if(!Array.isArray(this.services)){
    this.services = [];
  }

  this.services = this.services.map(service => {

    const code =
      detectServiceCode(service);

    if(code){
      service.serviceKey = code;
    }

    if(!service.serviceSuffix){
      service.serviceSuffix =
        code ||
        service.serviceKey;
    }else{
      service.serviceSuffix =
        normalizeServiceCode(service.serviceSuffix) ||
        code ||
        service.serviceKey;
    }

    if(!service.serviceName){
      service.serviceName =
        service.serviceKey ||
        code ||
        "";
    }

    if(service.serviceKey === "SH" || service.shared === true){

      service.serviceKey = "SH";
      service.serviceSuffix = "SH";
      service.shared = true;
      service.pricingMode = "SHARED";

      service.addStopEnabled = false;
      service.addStopCustomTimeEnabled = false;
      service.addStopCutoffMinutes = 0;
    }

    if(service.serviceKey !== "SH"){

      service.shared = false;

      if(service.pricingMode === "SHARED"){
        service.pricingMode = "MILE";
      }
    }

    return service;
  });

  next();
});

/* =========================
   INDEX
========================= */

facilityPricingOverrideSchema.index(
  { facilityId:1 },
  { unique:true }
);

/* =========================
   EXPORT
========================= */

module.exports =
  mongoose.models.FacilityPricingOverride ||
  mongoose.model(
    "FacilityPricingOverride",
    facilityPricingOverrideSchema
  );