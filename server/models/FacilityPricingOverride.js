"use strict";

const mongoose =
  require("mongoose");

/* =========================
   HELPERS
========================= */

function clean(value){
  return String(value ?? "").trim();
}

function normalizeServiceCode(value){

  const c =
    clean(value)
      .toUpperCase()
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(!c){
    return "";
  }

  if(
    c === "STANDARD" ||
    c === "ST"
  ){
    return "ST";
  }

  if(
    c === "WHEELCHAIR" ||
    c === "WHEEL CHAIR" ||
    c === "WH" ||
    c === "WC"
  ){
    return "WH";
  }

  if(
    c === "SHARED" ||
    c === "SH"
  ){
    return "SH";
  }

  if(
    c === "LIMO" ||
    c === "LIMOUSINE" ||
    c === "LM"
  ){
    return "LM";
  }

  if(
    c === "TAXI" ||
    c === "TX"
  ){
    return "TX";
  }

  if(c === "XL"){
    return "XL";
  }

  return c;
}

function detectServiceCode(service){

  const values = [
    service?.serviceKey,
    service?.serviceSuffix,
    service?.serviceName
  ];

  for(const value of values){

    const code =
      normalizeServiceCode(
        value
      );

    if(
      ["ST","WH","SH","LM","TX","XL"]
        .includes(code)
    ){
      return code;
    }
  }

  return normalizeServiceCode(
    values.find(Boolean)
  );
}

/* =========================
   SERVICE PRICING
========================= */

const servicePricingSchema =
  new mongoose.Schema(
    {
      serviceKey:{
        type:String,
        required:true,
        trim:true,
        uppercase:true
      },

      serviceName:{
        type:String,
        default:"",
        trim:true
      },

      serviceSuffix:{
        type:String,
        default:"",
        trim:true,
        uppercase:true
      },

      shared:{
        type:Boolean,
        default:false
      },

      pricingMode:{
        type:String,
        enum:[
          "MILE",
          "HOURLY",
          "SHARED"
        ],
        default:"MILE"
      },

      baseFare:{
        type:Number,
        default:0
      },

      includedMiles:{
        type:Number,
        default:0
      },

      perMile:{
        type:Number,
        default:0
      },

      hourlyRate:{
        type:Number,
        default:0
      },

      hourlyBillingMode:{
        type:String,
        enum:[
          "FULL",
          "QUARTER"
        ],
        default:"FULL"
      },

      initialDurationMinutes:{
        type:Number,
        default:0,
        min:0
      },

      initialPrice:{
        type:Number,
        default:0,
        min:0
      },

      stopFee:{
        type:Number,
        default:0
      },

      noShowFee:{
        type:Number,
        default:0
      },

      sharedPrice:{
        type:Number,
        default:0
      },

      disableCancel:{
        type:Boolean,
        default:false
      },

      warningMinutes:{
        type:Number,
        default:0
      },

      cancelFee:{
        type:Number,
        default:0
      },

      addStopEnabled:{
        type:Boolean,
        default:false
      },

      addStopCustomTimeEnabled:{
        type:Boolean,
        default:false
      },

      addStopCutoffMinutes:{
        type:Number,
        default:0
      }
    },
    {
      _id:false
    }
  );

/* =========================
   MAIN SCHEMA
========================= */

const facilityPricingOverrideSchema =
  new mongoose.Schema(
    {
      tenantId:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"Tenant",
        index:true,
        default:null
      },

      facilityId:{
        type:
          mongoose.Schema.Types.ObjectId,
        required:true,
        index:true
      },

      facilityName:{
        type:String,
        required:true,
        trim:true
      },

      active:{
        type:Boolean,
        default:false
      },

      services:{
        type:[
          servicePricingSchema
        ],
        default:[]
      },

      updatedBy:{
        type:String,
        default:""
      }
    },
    {
      timestamps:true
    }
  );

/* =========================
   NORMALIZE
========================= */

facilityPricingOverrideSchema.pre(
  "validate",
  function(next){

    if(
      !Array.isArray(
        this.services
      )
    ){
      this.services = [];
    }

    this.services =
      this.services.map(
        service=>{

          const code =
            detectServiceCode(
              service
            );

          if(code){
            service.serviceKey =
              code;
          }

          service.serviceSuffix =
            normalizeServiceCode(
              service.serviceSuffix ||
              code ||
              service.serviceKey
            ) ||
            code ||
            service.serviceKey;

          if(!service.serviceName){

            service.serviceName =
              service.serviceKey ||
              code ||
              "";
          }

          if(
            service.serviceKey ===
              "SH" ||
            service.shared === true
          ){

            service.serviceKey =
              "SH";

            service.serviceSuffix =
              "SH";

            service.shared =
              true;

            service.pricingMode =
              "SHARED";

            service.addStopEnabled =
              false;

            service.addStopCustomTimeEnabled =
              false;

            service.addStopCutoffMinutes =
              0;

          }else{

            service.shared =
              false;

            if(
              service.pricingMode ===
              "SHARED"
            ){
              service.pricingMode =
                "MILE";
            }
          }

          return service;
        }
      );

    next();
  }
);

/*
  Keep the existing unique facilityId rule.
  Facility user ObjectIds are globally unique and this also keeps
  compatibility with legacy records already using this index.
*/

facilityPricingOverrideSchema.index(
  {
    facilityId:1
  },
  {
    unique:true
  }
);

module.exports =
  mongoose.models
    .FacilityPricingOverride ||
  mongoose.model(
    "FacilityPricingOverride",
    facilityPricingOverrideSchema
  );
