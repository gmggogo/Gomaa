const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({

  /* =========================
     MULTI TENANT
  ========================= */

  tenantId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Tenant",
    default:null,
    index:true
  },

  /* =========================
     CUSTOM SERVICE SLOT
     Slots 1-4 are tenant-owned and start disabled.
     The generated two-letter code is persisted once.
  ========================= */

  customSlot:{
    type:Number,
    default:null,
    min:1,
    max:4
  },

  customConfigured:{
    type:Boolean,
    default:false
  },

  customServiceCode:{
    type:String,
    default:"",
    trim:true,
    uppercase:true
  },

  /* =========================
     BASIC INFO
  ========================= */

  serviceKey:{
    type:String,
    required:true,
    trim:true,
    uppercase:true
  },

  title:{
    type:String,
    required:true
  },

  icon:{
    type:String,
    default:"🚘"
  },

  /* TRANSPORT / VEHICLE PROFILE */
  iconKey:{ type:String, default:"", trim:true, uppercase:true },

  serviceCategory:{
    type:String,
    default:"PASSENGER",
    trim:true,
    uppercase:true
  },

  vehicleCategory:{
    type:String,
    default:"GENERIC",
    trim:true,
    uppercase:true
  },

  requiresCDL:{ type:Boolean, default:false },

  cdlClass:{
    type:String,
    default:"",
    trim:true,
    uppercase:true
  },

  minimumVehicleCapacityLb:{
    type:Number,
    default:0,
    min:0
  },

  requiresLiftGate:{ type:Boolean, default:false },
  refrigeratedRequired:{ type:Boolean, default:false },
  hazmatRequired:{ type:Boolean, default:false },

  enabled:{
    type:Boolean,
    default:true
  },

  showPricingCard:{
    type:Boolean,
    default:true
  },

  /* =========================
     DRIVER WAIT TIMERS
  ========================= */

  driverPickupWaitEnabled:{
    type:Boolean,
    default:true
  },

  driverPickupWaitMinutes:{
    type:Number,
    default:10,
    min:0
  },

  driverStopWaitEnabled:{
    type:Boolean,
    default:true
  },

  driverStopWaitMinutes:{
    type:Number,
    default:5,
    min:0
  },

  /* =========================
     GET QUOTE PRICING
  ========================= */

  pricingMode:{
    type:String,
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

  /* =========================
     GET QUOTE WARNING POLICY
  ========================= */

  warningEnabled:{
    type:Boolean,
    default:true
  },

  warningMinutes:{
    type:Number,
    default:120
  },

  cancelFee:{
    type:Number,
    default:15
  },

  disableCancel:{
    type:Boolean,
    default:false
  },

  /* =========================
     ADD STOP - GET QUOTE
  ========================= */

  getQuoteAddStopEnabled:{
    type:Boolean,
    default:false
  },

  getQuoteAddStopCustomTimeEnabled:{
    type:Boolean,
    default:false
  },

  getQuoteAddStopCutoffMinutes:{
    type:Number,
    default:0
  },

  /* =========================
     FACILITY SETTINGS
  ========================= */

  companyEnabled:{
    type:Boolean,
    default:true
  },

  companyShared:{
    type:Boolean,
    default:false
  },

  companySuffix:{
    type:String,
    default:"ST"
  },

  /* =========================
     FACILITY PRICING
  ========================= */

  companyPricingMode:{
    type:String,
    default:"MILE"
  },

  companyBaseFare:{
    type:Number,
    default:0
  },

  companyIncludedMiles:{
    type:Number,
    default:0
  },

  companyPerMile:{
    type:Number,
    default:0
  },

  companyHourlyRate:{
    type:Number,
    default:0
  },

  companyHourlyBillingMode:{
    type:String,
    default:"FULL"
  },

  companyInitialDurationMinutes:{
    type:Number,
    default:0,
    min:0
  },

  companyInitialPrice:{
    type:Number,
    default:0,
    min:0
  },

  companyStopFee:{
    type:Number,
    default:0
  },

  companyNoShowFee:{
    type:Number,
    default:0
  },

  companySharedPrice:{
    type:Number,
    default:0
  },

  /* =========================
     FACILITY WARNING POLICY
  ========================= */

  companyWarningEnabled:{
    type:Boolean,
    default:true
  },

  companyWarningMinutes:{
    type:Number,
    default:120
  },

  companyCancelFee:{
    type:Number,
    default:15
  },

  companyDisableCancel:{
    type:Boolean,
    default:false
  },

  /* =========================
     ADD STOP - FACILITY
  ========================= */

  companyAddStopEnabled:{
    type:Boolean,
    default:false
  },

  companyAddStopCustomTimeEnabled:{
    type:Boolean,
    default:false
  },

  companyAddStopCutoffMinutes:{
    type:Number,
    default:0
  },

  /* =========================
     RESERVED SETTINGS
  ========================= */

  reservedEnabled:{
    type:Boolean,
    default:false
  },

  reservedShared:{
    type:Boolean,
    default:false
  },

  reservedSuffix:{
    type:String,
    default:"RV"
  },

  /* =========================
     RESERVED PRICING
  ========================= */

  reservedPricingMode:{
    type:String,
    default:"MILE"
  },

  reservedBaseFare:{
    type:Number,
    default:0
  },

  reservedIncludedMiles:{
    type:Number,
    default:0
  },

  reservedPerMile:{
    type:Number,
    default:0
  },

  reservedHourlyRate:{
    type:Number,
    default:0
  },

  reservedHourlyBillingMode:{
    type:String,
    default:"FULL"
  },

  reservedInitialDurationMinutes:{
    type:Number,
    default:0,
    min:0
  },

  reservedInitialPrice:{
    type:Number,
    default:0,
    min:0
  },

  reservedStopFee:{
    type:Number,
    default:0
  },

  reservedNoShowFee:{
    type:Number,
    default:0
  },

  reservedSharedPrice:{
    type:Number,
    default:0
  },

  /* =========================
     RESERVED WARNING POLICY
  ========================= */

  reservedWarningEnabled:{
    type:Boolean,
    default:true
  },

  reservedWarningMinutes:{
    type:Number,
    default:120
  },

  reservedCancelFee:{
    type:Number,
    default:15
  },

  reservedDisableCancel:{
    type:Boolean,
    default:false
  },

  /* =========================
     ADD STOP - RESERVED
  ========================= */

  reservedAddStopEnabled:{
    type:Boolean,
    default:false
  },

  reservedAddStopCustomTimeEnabled:{
    type:Boolean,
    default:false
  },

  reservedAddStopCutoffMinutes:{
    type:Number,
    default:0
  },

  /* =========================
     BOOKING HOURS BY SOURCE
     24_HOURS / CUSTOM / DISABLED
  ========================= */

  bookingHours:{

    getQuote:{
      mode:{
        type:String,
        enum:["24_HOURS","CUSTOM","DISABLED"],
        default:"24_HOURS"
      },
      from:{ type:String, default:"00:00" },
      to:{ type:String, default:"23:59" }
    },

    facility:{
      mode:{
        type:String,
        enum:["24_HOURS","CUSTOM","DISABLED"],
        default:"24_HOURS"
      },
      from:{ type:String, default:"00:00" },
      to:{ type:String, default:"23:59" }
    },

    reserved:{
      mode:{
        type:String,
        enum:["24_HOURS","CUSTOM","DISABLED"],
        default:"24_HOURS"
      },
      from:{ type:String, default:"00:00" },
      to:{ type:String, default:"23:59" }
    },

    facilityOverride:{
      mode:{
        type:String,
        enum:["24_HOURS","CUSTOM","DISABLED"],
        default:"24_HOURS"
      },
      from:{ type:String, default:"00:00" },
      to:{ type:String, default:"23:59" }
    },

  }

},{
  timestamps:true
});

/* =========================
   MULTI TENANT UNIQUE INDEX

   Same service code may exist in many tenants.
   It must only be unique inside one tenant.
========================= */

serviceSchema.index(
  {
    tenantId:1,
    serviceKey:1
  },
  {
    unique:true,
    name:"tenant_serviceKey_unique"
  }
);

const Service =
  mongoose.models.Service ||
  mongoose.model(
    "Service",
    serviceSchema
  );

/* =========================
   LEGACY INDEX MIGRATION

   Old schema had:
   serviceKey: { unique:true }

   MongoDB keeps that old index even after
   removing unique:true from the schema.

   We remove ONLY the old global serviceKey
   unique index, then create the tenant-scoped
   unique index above.
========================= */

let indexMigrationStarted = false;

async function ensureMultiTenantIndexes(){

  if(indexMigrationStarted){
    return;
  }

  indexMigrationStarted = true;

  try{

    const indexes =
      await Service.collection.indexes();

    for(const index of indexes){

      const keys =
        Object.keys(
          index.key || {}
        );

      const isOldGlobalServiceKeyIndex =
        index.unique === true &&
        keys.length === 1 &&
        keys[0] === "serviceKey";

      if(
        isOldGlobalServiceKeyIndex &&
        index.name !== "_id_"
      ){

        await Service.collection.dropIndex(
          index.name
        );

        console.log(
          "✅ DROPPED LEGACY SERVICE INDEX:",
          index.name
        );
      }
    }

    await Service.collection.createIndex(
      {
        tenantId:1,
        serviceKey:1
      },
      {
        unique:true,
        name:"tenant_serviceKey_unique"
      }
    );

    console.log(
      "✅ SERVICE TENANT INDEX READY"
    );

  }catch(err){

    /*
      Do not crash the whole server because of
      index maintenance. Log the exact reason.
    */
    console.log(
      "SERVICE INDEX MIGRATION ERROR:",
      err.message
    );
  }
}

function startIndexMigration(){

  if(
    mongoose.connection.readyState === 1
  ){
    ensureMultiTenantIndexes();
    return;
  }

  mongoose.connection.once(
    "open",
    ensureMultiTenantIndexes
  );
}

startIndexMigration();


serviceSchema.index(
  { tenantId:1, customSlot:1 },
  { unique:true, partialFilterExpression:{ customSlot:{ $type:"number" } } }
);

serviceSchema.index(
  { tenantId:1, customServiceCode:1 },
  { unique:true, partialFilterExpression:{ customServiceCode:{ $type:"string", $gt:"" } } }
);
module.exports = Service;