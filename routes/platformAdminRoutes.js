const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const router = express.Router();

const User = require("../models/User");
const Tenant = require("../models/Tenant");
const Service = require("../models/Service");
const BookingDataConfig = require("../models/BookingDataConfig");
const BrokerDynamicField = require("../models/BrokerDynamicField");

const {
  verifyToken,
  requireRole
} = require("../middleware/authmiddleware");

/* =========================================
   PLATFORM ADMIN SECURITY
========================================= */

router.use(
  verifyToken,
  requireRole("PLATFORM_ADMIN")
);


/* =========================================
   TENANT SERVICE CATALOG
========================================= */

const SERVICE_CATALOG = [
  { serviceKey:"ST", title:"Standard", isCustom:false },
  { serviceKey:"WH", title:"Wheelchair", isCustom:false },
  { serviceKey:"SH", title:"Shared", isCustom:false },
  { serviceKey:"LM", title:"Limousine", isCustom:false },
  { serviceKey:"TX", title:"Taxi", isCustom:false },
  { serviceKey:"XL", title:"XL", isCustom:false },

  /*
    CUSTOM SERVICE MASTER GATES
    ---------------------------
    These four keys are platform-level permissions only.
    The Platform Admin decides which slots a tenant may use and
    assigns the permanent customer-facing name before activation.
    Tenant Super Admin can configure pricing/surfaces later, but cannot
    rename the service.

    IMPORTANT:
    - CUSTOM_1..CUSTOM_4 are permanent internal slot identities.
    - They are NOT the customer-facing two-letter service code.
    - Renaming a custom service must never change these gate keys.
  */
  {
    serviceKey:"CUSTOM_1",
    title:"Custom Service 1",
    isCustom:true,
    customSlot:1
  },
  {
    serviceKey:"CUSTOM_2",
    title:"Custom Service 2",
    isCustom:true,
    customSlot:2
  },
  {
    serviceKey:"CUSTOM_3",
    title:"Custom Service 3",
    isCustom:true,
    customSlot:3
  },
  {
    serviceKey:"CUSTOM_4",
    title:"Custom Service 4",
    isCustom:true,
    customSlot:4
  }
];

const SERVICE_CATALOG_KEYS =
  new Set(
    SERVICE_CATALOG.map(
      service => service.serviceKey
    )
  );

function clean(value){
  return String(value ?? "").trim();
}

function normalizeServiceKey(value){

  const key =
    clean(value)
      .toUpperCase()
      .replace(/\s+/g,"");

  if(key === "STANDARD") return "ST";
  if(key === "WHEELCHAIR" || key === "WC") return "WH";
  if(key === "SHARED") return "SH";
  if(key === "LIMO" || key === "LIMOUSINE") return "LM";
  if(key === "TAXI") return "TX";

  /*
    Accept harmless formatting variants from the browser while storing
    one canonical platform gate key in Tenant.allowedServices.
  */
  if(key === "CUSTOM1" || key === "CUSTOM-1") return "CUSTOM_1";
  if(key === "CUSTOM2" || key === "CUSTOM-2") return "CUSTOM_2";
  if(key === "CUSTOM3" || key === "CUSTOM-3") return "CUSTOM_3";
  if(key === "CUSTOM4" || key === "CUSTOM-4") return "CUSTOM_4";

  return key;
}

function normalizeAllowedServices(values){

  if(!Array.isArray(values)){
    return [];
  }

  return [
    ...new Set(
      values
        .map(normalizeServiceKey)
        .filter(Boolean)
        /*
          Platform Admin is the master gate.
          Never persist arbitrary service codes here (for example a
          tenant-facing custom code such as ME). Only the six built-in
          services and the four permanent custom slots belong in
          Tenant.allowedServices.
        */
        .filter(key =>
          SERVICE_CATALOG_KEYS.has(key)
        )
    )
  ];
}


const CORE_SERVICE_CODES =
  new Set(["ST","WH","SH","LM","TX","XL"]);

function customGateSlot(value){
  const key = normalizeServiceKey(value);
  const match = key.match(/^CUSTOM_([1-4])$/);
  return match ? Number(match[1]) : 0;
}

function customGateFromSlot(slot){
  const n = Number(slot);
  return n >= 1 && n <= 4 ? `CUSTOM_${n}` : "";
}

function normalizeCustomServiceNames(value){

  const input =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value
      : {};

  const out = {};

  for(let slot = 1; slot <= 4; slot++){

    const gate = customGateFromSlot(slot);

    out[gate] =
      clean(
        input[gate] ??
        input[`C${slot}`] ??
        input[String(slot)] ??
        ""
      );
  }

  return out;
}

function generatedCustomCode(title){

  return clean(title)
    .toUpperCase()
    .replace(/[^A-Z]/g,"")
    .slice(0,2);
}

async function currentTenantCustomServices(tenantId){

  const rows =
    await Service.find({
      tenantId,
      customSlot:{ $in:[1,2,3,4] }
    })
    .select({
      _id:1,
      tenantId:1,
      customSlot:1,
      customConfigured:1,
      customServiceCode:1,
      serviceKey:1,
      title:1,
      companySuffix:1,
      reservedSuffix:1,
      enabled:1,
      companyEnabled:1,
      reservedEnabled:1,
      showPricingCard:1
    })
    .lean();

  const byGate = {};

  for(const row of rows){
    const gate = customGateFromSlot(row.customSlot);
    if(gate){
      byGate[gate] = row;
    }
  }

  return byGate;
}

function publicCustomServiceNames(customRows){

  const out = {};

  for(let slot = 1; slot <= 4; slot++){
    const gate = customGateFromSlot(slot);
    const row = customRows?.[gate] || null;
    const title = clean(row?.title);

    out[gate] =
      row?.customConfigured === false &&
      title.toLowerCase() === `custom service ${slot}`.toLowerCase()
        ? ""
        : title;
  }

  return out;
}

async function validateAndPrepareCustomServices({
  tenantId,
  allowedServices,
  previousAllowedServices,
  customServiceNames
}){

  const customRows =
    await currentTenantCustomServices(tenantId);

  const names =
    normalizeCustomServiceNames(customServiceNames);

  const prepared = [];
  const disabledUpdates = [];

  const previousAllowed =
    new Set(
      normalizeAllowedServices(
        previousAllowedServices || []
      )
    );

  const nextAllowed =
    new Set(
      normalizeAllowedServices(
        allowedServices || []
      )
    );

  for(let slot = 1; slot <= 4; slot++){

    const gate =
      customGateFromSlot(slot);

    const existing =
      customRows[gate] || null;

    const requestedName =
      clean(names[gate]);

    const wasEnabled =
      previousAllowed.has(gate);

    const willBeEnabled =
      nextAllowed.has(gate);

    /*
      SLOT OFF:
      - Name is editable.
      - Blank name clears the slot draft.
      - Changed name resets identity to CUSTOM_n until next activation.
      - Unchanged disabled service keeps old identity/settings.
    */
    if(!willBeEnabled){

      const existingTitle =
        clean(existing?.title);

      const changed =
        requestedName.toLowerCase() !==
        existingTitle.toLowerCase();

      if(!existing){

        if(requestedName){
          disabledUpdates.push({
            gate,
            slot,
            title:requestedName,
            existing:null
          });
        }

        continue;
      }

      if(changed){
        disabledUpdates.push({
          gate,
          slot,
          title:requestedName,
          existing
        });
      }

      continue;
    }

    if(requestedName.length < 2){
      const err = new Error(
        `Service name is required before enabling ${gate}`
      );
      err.statusCode = 400;
      throw err;
    }

    /*
      Only a service that was already ENABLED before this save is locked.
      If it was OFF, Platform Admin may rename it and activate it again.
    */
    if(
      wasEnabled &&
      existing?.customConfigured === true &&
      clean(existing.title)
    ){

      if(
        clean(existing.title).toLowerCase() !==
        requestedName.toLowerCase()
      ){
        const err = new Error(
          `${gate} is currently enabled as "${clean(existing.title)}". Turn the slot OFF and save before renaming it.`
        );
        err.statusCode = 409;
        throw err;
      }

      prepared.push({
        gate,
        slot,
        title:clean(existing.title),
        code:clean(
          existing.customServiceCode ||
          existing.serviceKey
        ).toUpperCase(),
        existing
      });

      continue;
    }

    const code =
      generatedCustomCode(requestedName);

    if(code.length !== 2){
      const err = new Error(
        `Unable to generate a two-letter service code for "${requestedName}"`
      );
      err.statusCode = 400;
      throw err;
    }

    if(CORE_SERVICE_CODES.has(code)){
      const err = new Error(
        `Service code ${code} is reserved. Choose another service name.`
      );
      err.statusCode = 409;
      throw err;
    }

    if(
      prepared.some(
        item => item.code === code
      )
    ){
      const err = new Error(
        `Service code ${code} is already used by another enabled custom service.`
      );
      err.statusCode = 409;
      throw err;
    }

    const duplicateDb =
      await Service.findOne({
        tenantId,
        ...(existing?._id
          ? { _id:{ $ne:existing._id } }
          : {}),
        customConfigured:true,
        $or:[
          { serviceKey:code },
          { customServiceCode:code },
          { companySuffix:code },
          { reservedSuffix:code }
        ]
      })
      .select({ _id:1 })
      .lean();

    if(duplicateDb){
      const err = new Error(
        `Service code ${code} is already in use. Choose another service name.`
      );
      err.statusCode = 409;
      throw err;
    }

    prepared.push({
      gate,
      slot,
      title:requestedName,
      code,
      existing
    });
  }

  return {
    customRows,
    names,
    prepared,
    disabledUpdates
  };
}

async function persistDisabledCustomServiceDrafts({
  tenantId,
  updates
}){

  for(const item of updates || []){

    const existing =
      item.existing || {};

    const title =
      clean(item.title) ||
      `Custom Service ${item.slot}`;

    await Service.findOneAndUpdate(
      {
        tenantId,
        customSlot:item.slot
      },
      {
        $set:{
          tenantId,
          customSlot:item.slot,
          customConfigured:false,
          title,
          serviceKey:`CUSTOM_${item.slot}`,
          customServiceCode:"",
          companySuffix:"",
          reservedSuffix:"",
          enabled:false,
          companyEnabled:false,
          reservedEnabled:false,
          showPricingCard:false,
          icon:existing.icon || "🚘"
        }
      },
      {
        upsert:true,
        new:true,
        runValidators:true,
        setDefaultsOnInsert:true
      }
    );
  }
}

async function persistPreparedCustomServices({
  tenantId,
  prepared
}){

  for(const item of prepared){

    const existing =
      item.existing || {};

    await Service.findOneAndUpdate(
      {
        tenantId,
        customSlot:item.slot
      },
      {
        $set:{
          tenantId,
          customSlot:item.slot,
          customConfigured:true,

          title:item.title,
          serviceKey:item.code,
          customServiceCode:item.code,
          companySuffix:item.code,
          reservedSuffix:item.code,

          enabled:existing.enabled === true,
          companyEnabled:existing.companyEnabled === true,
          reservedEnabled:existing.reservedEnabled === true,
          showPricingCard:existing.showPricingCard === true
        }
      },
      {
        upsert:true,
        new:true,
        runValidators:true,
        setDefaultsOnInsert:true
      }
    );
  }
}

/* =========================================
   GET PLATFORM SERVICE CATALOG
========================================= */

router.get(
  "/service-catalog",
  async (req,res)=>{

    return res.json({
      success:true,
      services:SERVICE_CATALOG
    });

  }
);

/* =========================================
   GET ALL TENANTS
========================================= */

router.get("/tenants", async (req, res) => {
  try {

    const tenants =
      await Tenant.find({})
        .sort({ createdAt: -1 })
        .lean();

    return res.json(tenants);

  } catch (err) {

    console.error(
      "PLATFORM TENANTS ERROR:",
      err
    );

    return res.status(500).json({
      message: "Server error"
    });

  }
});

/* =========================================
   CREATE TENANT + FIRST SUPER ADMIN
========================================= */

router.post("/tenants", async (req, res) => {
  try {

    const {
      name,
      slug,
      timezone,
      subscriptionStatus,
      allowedServices
    } = req.body || {};

    if (
      !name ||
      !slug
    ) {
      return res.status(400).json({
        message:
          "name and slug are required"
      });
    }

    const cleanName =
      String(name).trim();

    const cleanSlug =
      String(slug)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    if (!cleanSlug) {
      return res.status(400).json({
        message: "Invalid tenant slug"
      });
    }

    const existingTenant =
      await Tenant.findOne({
        slug: cleanSlug
      });

    if (existingTenant) {
      return res.status(409).json({
        message: "Tenant slug already exists"
      });
    }

    const allowedStatus = [
      "ACTIVE",
      "TRIAL",
      "SUSPENDED",
      "CANCELED"
    ];

    const finalStatus =
      allowedStatus.includes(
        String(
          subscriptionStatus ||
          "ACTIVE"
        ).toUpperCase()
      )
        ? String(
            subscriptionStatus ||
            "ACTIVE"
          ).toUpperCase()
        : "ACTIVE";

    const tenant =
      await Tenant.create({
        name:
          cleanName,

        slug:
          cleanSlug,

        enabled:
          true,

        subscriptionStatus:
          finalStatus,

        timezone:
          timezone
            ? String(timezone).trim()
            : "America/Phoenix",

        allowedServices:
          normalizeAllowedServices(
            allowedServices
          ),

        branding: {
          companyName:
            cleanName
        }
      });

    return res.status(201).json({
      message:
        "Company created successfully",

      tenant: {
        id:
          tenant._id,

        name:
          tenant.name,

        slug:
          tenant.slug,

        enabled:
          tenant.enabled,

        subscriptionStatus:
          tenant.subscriptionStatus,

        timezone:
          tenant.timezone,

        allowedServices:
          tenant.allowedServices || []
      }
    });

  } catch (err) {

    console.error(
      "CREATE TENANT ERROR:",
      err
    );

    if (err?.code === 11000) {
      return res.status(409).json({
        message:
          "Tenant slug already exists"
      });
    }

    return res.status(500).json({
      message: "Server error"
    });

  }
});

/* =========================================
   UPDATE TENANT STATUS
========================================= */

router.patch(
  "/tenants/:tenantId/status",
  async (req, res) => {
    try {

      const {
        enabled,
        subscriptionStatus
      } = req.body || {};

      const update = {};

      if (typeof enabled === "boolean") {
        update.enabled = enabled;
      }

      if (
        subscriptionStatus !== undefined
      ) {

        const allowed = [
          "ACTIVE",
          "TRIAL",
          "SUSPENDED",
          "CANCELED"
        ];

        if (
          !allowed.includes(
            subscriptionStatus
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid subscriptionStatus"
          });
        }

        update.subscriptionStatus =
          subscriptionStatus;
      }

      if (
        Object.keys(update).length === 0
      ) {
        return res.status(400).json({
          message: "Nothing to update"
        });
      }

      const tenant =
        await Tenant.findByIdAndUpdate(
          req.params.tenantId,
          update,
          {
            new: true,
            runValidators: true
          }
        );

      if (!tenant) {
        return res.status(404).json({
          message: "Tenant not found"
        });
      }

      return res.json({
        message: "Tenant updated",
        tenant
      });

    } catch (err) {

      console.error(
        "UPDATE TENANT ERROR:",
        err
      );

      return res.status(500).json({
        message: "Server error"
      });

    }
  }
);


/* =========================================
   GET TENANT ALLOWED SERVICES
========================================= */

router.get(
  "/tenants/:tenantId/services",
  async (req,res)=>{

    try{

      const tenant =
        await Tenant.findById(
          req.params.tenantId
        )
        .lean();

      if(!tenant){

        return res.status(404).json({
          message:"Tenant not found"
        });

      }

      const customRows =
        await currentTenantCustomServices(
          tenant._id
        );

      return res.json({
        success:true,

        tenant:{
          id:tenant._id,
          name:tenant.name,
          slug:tenant.slug
        },

        serviceCatalog:
          SERVICE_CATALOG,

        allowedServices:
          Array.isArray(
            tenant.allowedServices
          )
            ? tenant.allowedServices
            : [],

        customServiceNames:
          publicCustomServiceNames(
            customRows
          )
      });

    }catch(err){

      console.error(
        "GET TENANT SERVICES ERROR:",
        err
      );

      return res.status(500).json({
        message:"Server error"
      });

    }

  }
);

/* =========================================
   SAVE TENANT ALLOWED SERVICES
========================================= */

router.patch(
  "/tenants/:tenantId/services",
  async (req,res)=>{

    try{

      if(
        !Array.isArray(
          req.body?.allowedServices
        )
      ){
        return res.status(400).json({
          message:"allowedServices array is required"
        });
      }

      const tenant =
        await Tenant.findById(
          req.params.tenantId
        );

      if(!tenant){
        return res.status(404).json({
          message:"Tenant not found"
        });
      }

      const allowedServices =
        normalizeAllowedServices(
          req.body.allowedServices
        );

      const previousAllowedServices =
        normalizeAllowedServices(
          tenant.allowedServices || []
        );

      const preparedCustom =
        await validateAndPrepareCustomServices({
          tenantId:tenant._id,
          allowedServices,
          previousAllowedServices,
          customServiceNames:
            req.body?.customServiceNames
        });

      await persistDisabledCustomServiceDrafts({
        tenantId:tenant._id,
        updates:preparedCustom.disabledUpdates
      });

      await persistPreparedCustomServices({
        tenantId:tenant._id,
        prepared:preparedCustom.prepared
      });

      tenant.allowedServices =
        allowedServices;

      await tenant.save();

      const refreshedCustomRows =
        await currentTenantCustomServices(
          tenant._id
        );

      return res.json({
        success:true,
        message:"Tenant services updated",

        tenant:{
          id:tenant._id,
          name:tenant.name,
          slug:tenant.slug,
          allowedServices:
            tenant.allowedServices || []
        },

        customServiceNames:
          publicCustomServiceNames(
            refreshedCustomRows
          )
      });

    }catch(err){

      console.error(
        "UPDATE TENANT SERVICES ERROR:",
        err
      );

      return res
        .status(
          Number(err?.statusCode) ||
          500
        )
        .json({
          message:
            err?.message ||
            "Server error"
        });
    }
  }
);


/* =========================================
   BOOKING DATA MATRIX
   PLATFORM ADMIN ONLY

   CORE:
   - Fixed and locked.
   - Never renamed/deleted here.

   OPTIONAL STANDARD:
   - Known GH Mobility / broker fields.
   - Platform Admin decides where each appears.

   CUSTOM:
   - 10 blank slots.
   - Can be named for any industry:
     MC Number, USDOT, ADOT, Room Number, Guest Name, etc.

   MATRIX RULES:
   GET QUOTE:
     showField + required only.

   FACILITY / RESERVED:
     showField + showColumn + showEye + required.
     showField and showEye are mutually exclusive.
     showColumn is independent.

   BROKER:
     showColumn OR showEye.
     No booking-form field because broker data arrives externally.
========================================= */

const BOOKING_DATA_FIELD_TYPES =
  new Set([
    "TEXT",
    "NUMBER",
    "YES_NO",
    "DROPDOWN",
    "DATE",
    "TIME",
    "PHONE",
    "EMAIL",
    "LONG_TEXT"
  ]);

const BOOKING_DATA_CORE_FIELDS = [
  { key:"tripNumber", label:"Trip Number" },
  { key:"clientName", label:"Passenger / Client Name" },
  { key:"clientPhone", label:"Phone" },
  { key:"pickup", label:"Pickup" },
  { key:"stops", label:"Stops" },
  { key:"dropoff", label:"Drop-off" },
  { key:"tripDate", label:"Date" },
  { key:"tripTime", label:"Time" },
  { key:"notes", label:"Notes" }
];

const BOOKING_DATA_STANDARD_FIELDS = [
  { key:"appointmentTime", label:"Appointment Time", type:"TIME" },
  { key:"returnTime", label:"Return Time", type:"TIME" },
  { key:"clientEmail", label:"Passenger Email", type:"EMAIL" },
  { key:"memberId", label:"Member ID", type:"TEXT" },
  { key:"serviceType", label:"Service Type", type:"TEXT" },
  { key:"tripType", label:"Trip Type", type:"TEXT" },
  { key:"company", label:"Company / Facility Name", type:"TEXT" },
  { key:"entryName", label:"Data Entry Name", type:"TEXT" },
  { key:"entryPhone", label:"Data Entry Phone", type:"PHONE" },
  { key:"brokerName", label:"Broker Name", type:"TEXT" },
  { key:"brokerCode", label:"Broker Code", type:"TEXT" },
  { key:"brokerTripId", label:"Broker Trip ID", type:"TEXT" },
  { key:"externalSource", label:"External Source", type:"TEXT" },
  { key:"brokerNotes", label:"Broker Notes", type:"LONG_TEXT" },
  { key:"totalPassengers", label:"Total Passengers", type:"NUMBER" }
];

const BOOKING_DATA_STANDARD_KEYS =
  new Set(
    BOOKING_DATA_STANDARD_FIELDS
      .map(field => field.key)
  );

function defaultBookingMatrix(){
  return {
    getQuote:{
      showField:false,
      required:false
    },

    facility:{
      showField:false,
      showColumn:false,
      showEye:false,
      required:false
    },

    reserved:{
      showField:false,
      showColumn:false,
      showEye:false,
      required:false
    },

    broker:{
      showColumn:false,
      showEye:false
    }
  };
}

function bool(value){
  return value === true;
}

function normalizeMatrix(raw){

  const matrix =
    defaultBookingMatrix();

  matrix.getQuote.showField =
    bool(raw?.getQuote?.showField);

  matrix.getQuote.required =
    matrix.getQuote.showField &&
    bool(raw?.getQuote?.required);

  matrix.facility.showField =
    bool(raw?.facility?.showField);

  matrix.facility.showColumn =
    bool(raw?.facility?.showColumn);

  matrix.facility.showEye =
    bool(raw?.facility?.showEye);

  /*
    Facility:
    Field is independent.
    Column and Eye are alternate display modes and are mutually exclusive.
    If malformed input contains both, Column wins.
  */
  if(
    matrix.facility.showColumn &&
    matrix.facility.showEye
  ){
    matrix.facility.showEye = false;
  }

  matrix.facility.required =
    matrix.facility.showField &&
    bool(raw?.facility?.required);

  matrix.reserved.showField =
    bool(raw?.reserved?.showField);

  matrix.reserved.showColumn =
    bool(raw?.reserved?.showColumn);

  matrix.reserved.showEye =
    bool(raw?.reserved?.showEye);

  /*
    Reserved:
    Field is independent.
    Column and Eye are alternate display modes and are mutually exclusive.
    If malformed input contains both, Column wins.
  */
  if(
    matrix.reserved.showColumn &&
    matrix.reserved.showEye
  ){
    matrix.reserved.showEye = false;
  }

  matrix.reserved.required =
    matrix.reserved.showField &&
    bool(raw?.reserved?.required);

  matrix.broker.showColumn =
    bool(raw?.broker?.showColumn);

  matrix.broker.showEye =
    bool(raw?.broker?.showEye);

  /*
    Broker chooses Column OR Eye.
    Column wins if malformed input contains both.
  */
  if(
    matrix.broker.showColumn &&
    matrix.broker.showEye
  ){
    matrix.broker.showEye = false;
  }

  return matrix;
}

function bookingMatrixHasAnySelection(matrix){

  return Boolean(
    matrix?.getQuote?.showField ||
    matrix?.facility?.showField ||
    matrix?.facility?.showColumn ||
    matrix?.facility?.showEye ||
    matrix?.reserved?.showField ||
    matrix?.reserved?.showColumn ||
    matrix?.reserved?.showEye ||
    matrix?.broker?.showColumn ||
    matrix?.broker?.showEye
  );
}

function normalizeOptions(value){

  const list =
    Array.isArray(value)
      ? value
      : clean(value).split(/\r?\n|,/);

  return [
    ...new Set(
      list
        .map(clean)
        .filter(Boolean)
        .slice(0,50)
    )
  ];
}

function normalizeStandardFields(input){

  const source =
    Array.isArray(input)
      ? input
      : [];

  const byKey =
    new Map();

  for(const item of source){

    const key =
      clean(item?.key);

    if(
      !BOOKING_DATA_STANDARD_KEYS.has(key) ||
      byKey.has(key)
    ){
      continue;
    }

    byKey.set(
      key,
      {
        key,
        matrix:
          normalizeMatrix(
            item?.matrix
          )
      }
    );
  }

  return BOOKING_DATA_STANDARD_FIELDS
    .map(field => (
      byKey.get(field.key) || {
        key:field.key,
        matrix:
          defaultBookingMatrix()
      }
    ));
}

function defaultCustomFields(){

  return Array.from(
    { length:10 },
    (_,index)=>({
      slot:index + 1,
      label:"",
      fieldType:"TEXT",
      options:[],
      placeholder:"",
      matrix:
        defaultBookingMatrix()
    })
  );
}

function normalizeCustomFields(input){

  const source =
    Array.isArray(input)
      ? input
      : [];

  const bySlot =
    new Map();

  for(const item of source){

    const slot =
      Number(item?.slot);

    if(
      !Number.isInteger(slot) ||
      slot < 1 ||
      slot > 10 ||
      bySlot.has(slot)
    ){
      continue;
    }

    const label =
      clean(item?.label)
        .slice(0,80);

    const typeCandidate =
      clean(item?.fieldType)
        .toUpperCase();

    const fieldType =
      BOOKING_DATA_FIELD_TYPES.has(
        typeCandidate
      )
        ? typeCandidate
        : "TEXT";

    const matrix =
      normalizeMatrix(
        item?.matrix
      );

    const options =
      fieldType === "DROPDOWN"
        ? normalizeOptions(
            item?.options
          )
        : [];

    const placeholder =
      clean(item?.placeholder)
        .slice(0,120);

    if(
      bookingMatrixHasAnySelection(matrix) &&
      !label
    ){
      const err =
        new Error(
          `Custom Field ${slot} needs a name before it can be used`
        );

      err.statusCode = 400;
      throw err;
    }

    if(
      bookingMatrixHasAnySelection(matrix) &&
      fieldType === "DROPDOWN" &&
      options.length < 1
    ){
      const err =
        new Error(
          `${label || `Custom Field ${slot}`} needs at least one dropdown option`
        );

      err.statusCode = 400;
      throw err;
    }

    bySlot.set(
      slot,
      {
        slot,
        label,
        fieldType,
        options,
        placeholder,
        matrix
      }
    );
  }

  return defaultCustomFields()
    .map(item =>
      bySlot.get(item.slot) ||
      item
    );
}

function normalizeBookingDataConfig(doc){

  return {
    standardFields:
      normalizeStandardFields(
        doc?.standardFields
      ),

    customFields:
      normalizeCustomFields(
        doc?.customFields
      )
  };
}


function normalizeBrokerAutoFieldUpdates(input){

  const source =
    Array.isArray(input)
      ? input
      : [];

  const byKey =
    new Map();

  for(const item of source){

    const fieldKey =
      clean(
        item?.fieldKey ||
        item?.key
      );

    if(
      !fieldKey ||
      byKey.has(fieldKey)
    ){
      continue;
    }

    let showColumn =
      bool(item?.showColumn);

    let showEye =
      bool(item?.showEye);

    /*
      Broker Auto Fields:
      Column OR Eye. Never both.
      Column wins if malformed input contains both.
    */
    if(
      showColumn &&
      showEye
    ){
      showEye = false;
    }

    byKey.set(
      fieldKey,
      {
        fieldKey,
        showColumn,
        showEye
      }
    );
  }

  return [...byKey.values()];
}

function publicBrokerAutoFields(rows){

  return (
    Array.isArray(rows)
      ? rows
      : []
  ).map((field,index)=>({
    fieldKey:
      clean(field?.fieldKey),

    key:
      clean(field?.fieldKey),

    brokerCode:
      clean(field?.brokerCode)
        .toUpperCase(),

    brokerName:
      clean(field?.brokerName),

    fieldPath:
      clean(field?.fieldPath),

    label:
      clean(
        field?.label ||
        field?.fieldPath ||
        field?.fieldKey
      ),

    fieldType:
      clean(
        field?.fieldType ||
        "TEXT"
      ).toUpperCase(),

    showColumn:
      field?.showColumn !== false,

    showEye:
      field?.showEye !== false,

    sampleValue:
      clean(field?.sampleValue),

    order:
      10000 + index
  }))
  .filter(field=>field.fieldKey);
}

router.get(
  "/booking-data/:tenantId",
  async (req,res)=>{

    try{

      const tenant =
        await Tenant.findById(
          req.params.tenantId
        )
        .select({
          _id:1,
          name:1,
          slug:1
        })
        .lean();

      if(!tenant){
        return res.status(404).json({
          message:"Tenant not found"
        });
      }

      const [
        config,
        brokerAutoRows
      ] =
        await Promise.all([
          BookingDataConfig
            .findOne({
              tenantId:tenant._id
            })
            .lean(),

          BrokerDynamicField
            .find({
              tenantId:tenant._id
            })
            .sort({
              brokerCode:1,
              label:1,
              createdAt:1
            })
            .lean()
        ]);

      const normalized =
        normalizeBookingDataConfig(
          config
        );

      const brokerAutoFields =
        publicBrokerAutoFields(
          brokerAutoRows
        );

      return res.json({
        success:true,

        tenant,

        coreFields:
          BOOKING_DATA_CORE_FIELDS,

        standardCatalog:
          BOOKING_DATA_STANDARD_FIELDS,

        config:
          normalized,

        /*
          Auto-discovered broker fields are shown in Platform Admin
          so Column/Eye visibility can be controlled without deleting data.
        */
        brokerAutoFields,

        matrixRules:{
          getQuote:{
            showField:true,
            required:true,
            column:false,
            eye:false
          },

          facility:{
            showField:true,
            required:true,
            column:true,
            eye:true,
            columnEyeExclusive:true
          },

          reserved:{
            showField:true,
            required:true,
            column:true,
            eye:true,
            columnEyeExclusive:true
          },

          broker:{
            showField:false,
            required:false,
            column:true,
            eye:true,
            columnEyeExclusive:true
          }
        },

        updatedAt:
          config?.updatedAt ||
          null
      });

    }catch(err){

      console.error(
        "GET BOOKING DATA MATRIX ERROR:",
        err
      );

      return res.status(500).json({
        message:
          err?.message ||
          "Server error"
      });
    }
  }
);

router.put(
  "/booking-data/:tenantId",
  async (req,res)=>{

    try{

      const tenant =
        await Tenant.findById(
          req.params.tenantId
        )
        .select({
          _id:1,
          name:1,
          slug:1
        });

      if(!tenant){
        return res.status(404).json({
          message:"Tenant not found"
        });
      }

      const standardFields =
        normalizeStandardFields(
          req.body?.standardFields
        );

      const customFields =
        normalizeCustomFields(
          req.body?.customFields
        );

      const brokerAutoFieldUpdates =
        normalizeBrokerAutoFieldUpdates(
          req.body?.brokerAutoFields
        );

      const actorId =
        req.authUser?._id ||
        req.authUser?.id ||
        req.user?._id ||
        req.user?.id ||
        null;

      const saved =
        await BookingDataConfig
          .findOneAndUpdate(
            {
              tenantId:tenant._id
            },
            {
              $set:{
                standardFields,
                customFields,
                updatedBy:actorId
              }
            },
            {
              upsert:true,
              new:true,
              runValidators:true,
              setDefaultsOnInsert:true
            }
          )
          .lean();

      if(brokerAutoFieldUpdates.length){

        await BrokerDynamicField.bulkWrite(
          brokerAutoFieldUpdates.map(item=>({
            updateOne:{
              filter:{
                tenantId:tenant._id,
                fieldKey:item.fieldKey
              },
              update:{
                $set:{
                  showColumn:item.showColumn,
                  showEye:item.showEye
                }
              }
            }
          })),
          {
            ordered:false
          }
        );
      }

      const brokerAutoRows =
        await BrokerDynamicField
          .find({
            tenantId:tenant._id
          })
          .sort({
            brokerCode:1,
            label:1,
            createdAt:1
          })
          .lean();

      const brokerAutoFields =
        publicBrokerAutoFields(
          brokerAutoRows
        );

      return res.json({
        success:true,
        message:
          "Booking Data configuration saved",

        tenant:{
          id:tenant._id,
          name:tenant.name,
          slug:tenant.slug
        },

        config:
          normalizeBookingDataConfig(
            saved
          ),

        brokerAutoFields,

        updatedAt:
          saved?.updatedAt ||
          null
      });

    }catch(err){

      console.error(
        "SAVE BOOKING DATA MATRIX ERROR:",
        err
      );

      return res
        .status(
          Number(err?.statusCode) ||
          500
        )
        .json({
          message:
            err?.message ||
            "Server error"
        });
    }
  }
);


module.exports = router;