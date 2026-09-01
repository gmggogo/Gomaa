/* =====================================================
   FILE: routes/companyAddStopRoutes.js
   COMPANY / FACILITY / GET QUOTE / INDIVIDUAL
   ADD STOP / ROUTE CHANGE REQUEST
   Saves request inside trip.addStopRequest
===================================================== */

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const Service =
  require("../models/Service");

const FacilityPricingOverride =
  require("../models/FacilityPricingOverride");

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
   TENANT AUTH
========================= */

function readBearerToken(req){
  const header =
    String(req.headers?.authorization || "").trim();

  if(!header.toLowerCase().startsWith("bearer ")){
    return "";
  }

  return header.slice(7).trim();
}

function requireTenantApi(req,res,next){

  const token = readBearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const verified =
      jwt.verify(token,JWT_SECRET);

    req.authUser = {
      id:verified.id || null,
      role:verified.role || "",
      tenantId:verified.tenantId || null
    };

    if(req.authUser.role === "PLATFORM_ADMIN"){
      return next();
    }

    if(!req.authUser.tenantId){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

function tenantFilter(req,extra={}){

  if(req.authUser?.role === "PLATFORM_ADMIN"){

    const requestedTenantId =
      clean(req.query?.tenantId || req.body?.tenantId || "");

    if(requestedTenantId){
      return {
        ...extra,
        tenantId:requestedTenantId
      };
    }

    return {...extra};
  }

  return {
    ...extra,
    tenantId:req.authUser.tenantId
  };
}

/* =========================
   MODELS
========================= */

const Trip =
  mongoose.models.Trip ||
  global.Trip;

if(!Trip){
  throw new Error("Trip model not loaded. Mount companyAddStopRoutes after Trip model in index.js");
}
/* =========================
   ROUTE TEST
========================= */

router.get("/add-stop/ping", (req,res)=>{
  return res.json({
    success:true,
    message:"companyAddStopRoutes connected"
  });
});

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function toNumber(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(v){
  return (
    v === true ||
    String(v ?? "").trim().toLowerCase() === "true" ||
    String(v ?? "").trim() === "1"
  );
}

function upper(v){
  return clean(v).toUpperCase();
}

function escapeRegex(v){
  return clean(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function normalizeServiceCode(v){
  const code = upper(v).replace(/[_-]/g," ").replace(/\s+/g," ").trim();
  if(code === "STANDARD" || code === "ST") return "ST";
  if(code === "WHEELCHAIR" || code === "WHEEL CHAIR" || code === "WC" || code === "WH") return "WH";
  if(code === "SHARED" || code === "SH") return "SH";
  if(code === "LIMO" || code === "LIMOUSINE" || code === "LM") return "LM";
  if(code === "TAXI" || code === "TX") return "TX";
  if(code === "XL") return "XL";
  return code;
}

function tripServiceCode(trip){
  const direct =
    clean(
      trip.serviceKey ||
      trip.serviceCode ||
      trip.serviceType ||
      trip.serviceSuffix ||
      trip.vehicle ||
      ""
    );

  if(direct){
    return normalizeServiceCode(direct);
  }

  const parts = clean(trip.tripNumber).split("-");
  return normalizeServiceCode(parts[parts.length - 1] || "");
}

function serviceMatches(entry, code){
  const values = [
    entry?.serviceKey,
    entry?.serviceCode,
    entry?.serviceType,
    entry?.serviceSuffix,
    entry?.suffix,
    entry?.companySuffix,
    entry?.title,
    entry?.name,
    entry?.serviceName
  ];

  return values.some(value =>
    normalizeServiceCode(value) === code
  );
}

async function resolveCompanyAddStopPolicy(trip,req){
  const code = tripServiceCode(trip);

  if(!code){
    throw new Error("Trip service is missing");
  }

  const facilityId =
    clean(
      trip.facilityId ||
      trip.companyId ||
      trip.userId ||
      ""
    );

  const facilityName =
    clean(
      trip.facilityName ||
      trip.companyName ||
      trip.company ||
      ""
    );

  const overrideOr = [];

  if(facilityId && mongoose.Types.ObjectId.isValid(facilityId)){
    overrideOr.push({facilityId:new mongoose.Types.ObjectId(facilityId)});
    overrideOr.push({_id:new mongoose.Types.ObjectId(facilityId)});
  }

  if(facilityId){
    overrideOr.push({facilityId:facilityId});
  }

  if(facilityName){
    const exactName = new RegExp("^" + escapeRegex(facilityName) + "$","i");
    overrideOr.push({facilityName:exactName});
    overrideOr.push({companyName:exactName});
  }

  if(overrideOr.length){
    const override =
      await FacilityPricingOverride
        .findOne(tenantFilter(req,{active:true,$or:overrideOr}))
        .lean();

    const entry =
      Array.isArray(override?.services)
        ? override.services.find(service => serviceMatches(service,code))
        : null;

    if(entry){
      return {
        source:"FACILITY_OVERRIDE",
        normalEnabled:bool(entry.addStopEnabled),
        customEnabled:bool(entry.addStopCustomTimeEnabled),
        cutoffMinutes:toNumber(entry.addStopCutoffMinutes)
      };
    }
  }

  const candidates = [code];
  if(code === "ST") candidates.push("STANDARD");
  if(code === "WH") candidates.push("WHEELCHAIR","WC");
  if(code === "SH") candidates.push("SHARED");
  if(code === "LM") candidates.push("LIMO","LIMOUSINE");
  if(code === "TX") candidates.push("TAXI");

  const regexes = candidates.map(value =>
    new RegExp("^" + escapeRegex(value) + "$","i")
  );

  const service = await Service.findOne(
    tenantFilter(req,{
      $or:[
        {serviceKey:{$in:candidates}},
        {serviceCode:{$in:candidates}},
        {serviceType:{$in:candidates}},
        {suffix:{$in:candidates}},
        {title:{$in:regexes}},
        {name:{$in:regexes}},
        {serviceName:{$in:regexes}}
      ]
    })
  ).lean();

  if(!service){
    throw new Error("Company service was not found");
  }

  return {
    source:"SERVICE_MANAGEMENT",
    normalEnabled:bool(
      service.companyAddStopEnabled ??
      service.addStopEnabled
    ),
    customEnabled:bool(
      service.companyAddStopCustomTimeEnabled ??
      service.addStopCustomTimeEnabled
    ),
    cutoffMinutes:toNumber(
      service.companyAddStopCutoffMinutes ??
      service.addStopCutoffMinutes
    )
  };
}

function minutesToTrip(trip){
  const date = clean(trip.tripDate);
  const time = clean(trip.tripTime);

  if(!date || !time){
    return null;
  }

  const startsAt = new Date(`${date}T${time}:00-07:00`);
  if(Number.isNaN(startsAt.getTime())){
    return null;
  }

  return (startsAt.getTime() - Date.now()) / 60000;
}

function enforceCompanyAddStopPolicy(trip,policy){
  if(policy.normalEnabled === true){
    return;
  }

  if(policy.customEnabled !== true){
    const err = new Error("Add Stop is disabled for this company service");
    err.statusCode = 403;
    throw err;
  }

  const mins = minutesToTrip(trip);
  if(mins === null){
    return;
  }

  const cutoff = Math.max(0,toNumber(policy.cutoffMinutes));

  if(mins <= cutoff){
    const err = new Error(
      cutoff > 0
        ? `Add Stop closed ${cutoff} minutes before the trip`
        : "The Add Stop time window has ended"
    );
    err.statusCode = 403;
    throw err;
  }
}

function isValidObjectId(id){
  return mongoose.Types.ObjectId.isValid(String(id || ""));
}

function getTripSource(trip, body){

  const source =
    clean(
      body.source ||
      trip.source ||
      trip.bookingSource ||
      trip.createdBy ||
      ""
    ).toLowerCase();

  const isCompany =
    trip.isCompany === true ||
    trip.company === true ||
    clean(trip.companyName) ||
    clean(trip.facilityName) ||
    source.includes("company") ||
    source.includes("facility");

  const isGetQuote =
    trip.isGetQuote === true ||
    trip.getQuote === true ||
    source.includes("getquote") ||
    source.includes("get quote") ||
    clean(trip.source).toLowerCase() === "gq";

  const isIndividual =
    !isCompany && !isGetQuote;

  if(isCompany){
    return "COMPANY";
  }

  if(isGetQuote){
    return "GET_QUOTE";
  }

  if(isIndividual){
    return "INDIVIDUAL";
  }

  return "UNKNOWN";
}

function tripIsClosed(trip){

  const status =
    clean(trip.status)
      .toLowerCase()
      .replace(/\s+/g,"")
      .replace(/-/g,"")
      .replace(/_/g,"");

  return (
    status.includes("complete") ||
    status.includes("cancel") ||
    status.includes("noshow") ||
    status.includes("notcompleted")
  );
}

function hasActiveRouteChange(trip){

  const req =
    trip.addStopRequest || {};

  const status =
    clean(req.status).toUpperCase();

  return (
    req.active === true &&
    ![
      "CANCELLED",
      "CANCELLED_BY_COMPANY",
      "CANCELLED_BY_CUSTOMER",
      "COMPLETED",
      "STOP_REACHED",
      "REJECTED"
    ].includes(status)
  );
}

function normalizeStringArray(arr){

  if(!Array.isArray(arr)){
    return [];
  }

  return arr
    .map(x => clean(x))
    .filter(Boolean);
}

function normalizeAddedStopsDetailed(arr){

  if(!Array.isArray(arr)){
    return [];
  }

  return arr
    .map((s,index)=>({
      address:clean(s.address || s.stop || s.location || ""),
      insertAfterIndex:toNumber(s.insertAfterIndex),
      rowIndex:toNumber(s.rowIndex ?? index)
    }))
    .filter(s => s.address);
}

function normalizeEditedExistingStops(arr){

  if(!Array.isArray(arr)){
    return [];
  }

  return arr
    .map(s=>({
      index:toNumber(s.index),
      oldAddress:clean(s.oldAddress),
      newAddress:clean(s.newAddress)
    }))
    .filter(s => s.newAddress);
}

/* =========================
   CONFIRM ROUTE CHANGE REQUEST
   POST /api/company/add-stop/:id/confirm
========================= */

router.post("/add-stop/:id/confirm", requireTenantApi, async (req,res)=>{

  try{

    const tripId =
      clean(req.params.id);

    if(!tripId || !isValidObjectId(tripId)){
      return res.status(400).json({
        success:false,
        message:"Invalid trip ID"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:tripId}));

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(tripIsClosed(trip)){
      return res.status(400).json({
        success:false,
        message:"This trip is closed and cannot be modified"
      });
    }

    if(
      trip.isShared === true ||
      upper(trip.tripType) === "SHARED" ||
      tripServiceCode(trip) === "SH"
    ){
      return res.status(400).json({
        success:false,
        message:"Add Stop is not available for shared trips"
      });
    }

    const addStopPolicy =
      await resolveCompanyAddStopPolicy(trip,req);

    const currentActiveRequest =
      hasActiveRouteChange(trip)
        ? trip.addStopRequest
        : null;

    if(
      currentActiveRequest &&
      clean(currentActiveRequest.source).toLowerCase() !== "company-add-stop"
    ){
      return res.status(409).json({
        success:false,
        message:"This trip already has an active route change request"
      });
    }

    if(!currentActiveRequest){
      enforceCompanyAddStopPolicy(
        trip,
        addStopPolicy
      );
    }

    const body =
      req.body || {};

    const tripSource =
      getTripSource(trip, body);

    const pickup =
      clean(
        body.pickup ||
        trip.pickup ||
        trip.pickupAddress ||
        ""
      );

    const dropoffBefore =
      clean(
        body.dropoffBefore ||
        trip.dropoff ||
        trip.dropoffAddress ||
        ""
      );

    const dropoffAfter =
      clean(
        body.dropoffAfter ||
        body.finalDropoff ||
        dropoffBefore
      );

    const existingStopsBefore =
      normalizeStringArray(
        body.existingStopsBefore ||
        trip.stops ||
        []
      );

    const editedExistingStops =
      normalizeEditedExistingStops(
        body.editedExistingStops
      );

    const addedStops =
      normalizeStringArray(
        body.addedStops
      );

    const addedStopsDetailed =
      normalizeAddedStopsDetailed(
        body.addedStopsDetailed
      );

    const finalStops =
      normalizeStringArray(
        body.finalStops
      );

    const routeStopsChanged =
      JSON.stringify(
        existingStopsBefore.map(value=>value.toLowerCase())
      ) !==
      JSON.stringify(
        finalStops.map(value=>value.toLowerCase())
      );

    if(!pickup){
      return res.status(400).json({
        success:false,
        message:"Pickup address missing"
      });
    }

    if(!dropoffBefore){
      return res.status(400).json({
        success:false,
        message:"Dropoff address missing"
      });
    }

    if(!routeStopsChanged && dropoffAfter === dropoffBefore){

      if(currentActiveRequest){
        trip.addStopRequest.active = false;
        trip.addStopRequest.status = "CANCELLED_BY_COMPANY";
        trip.addStopRequest.cancelledAt = new Date();
        trip.addStopRequest.updatedAt = new Date();
        trip.routeChangePending = false;
        trip.routeChangeStatus = "CANCELLED";
        trip.markModified("addStopRequest");
        await trip.save();

        return res.json({
          success:true,
          cancelled:true,
          message:"Company route change request cancelled",
          tripId:trip._id,
          tripNumber:trip.tripNumber || "",
          addStopRequest:trip.addStopRequest
        });
      }

      return res.status(400).json({
        success:false,
        message:"No route change detected"
      });
    }

    trip.addStopRequest = {
      active:true,

      status:
        body.status || "PENDING_REVIEW",

      requestType:
        body.requestType || "ROUTE_CHANGE",

      source:
        body.source || "company-add-stop",

      tripSource,

      addStopPolicy,

      calculatePriceOnReview:
        body.calculatePriceOnReview !== false,

      companyName:
        clean(
          body.companyName ||
          trip.companyName ||
          trip.facilityName ||
          ""
        ),

      facilityName:
        clean(
          body.facilityName ||
          trip.facilityName ||
          trip.companyName ||
          ""
        ),

      tripNumber:
        clean(
          body.tripNumber ||
          trip.tripNumber ||
          ""
        ),

      clientName:
        clean(
          body.clientName ||
          trip.clientName ||
          trip.name ||
          trip.customerName ||
          ""
        ),

      tripStatusAtConfirm:
        clean(
          body.tripStatusAtConfirm ||
          trip.status ||
          ""
        ),

      confirmedAt:
        body.confirmedAt || new Date(),

      mode:
        clean(body.mode || ""),

      maxStops:
        toNumber(body.maxStops || 5),

      pickup,

      dropoffBefore,
      dropoffAfter,

      existingStopsBefore,
      editedExistingStops,

      addedStops,
      addedStopsDetailed,

      finalStops,

      finalRoutePoints:
        Array.isArray(body.finalRoutePoints)
          ? body.finalRoutePoints
          : [],

      driverLocationAtConfirm:
        body.driverLocationAtConfirm || null,

      beforeStopChange:
        body.beforeStopChange || {
          pickup,
          dropoff:dropoffBefore,
          stops:existingStopsBefore,
          miles:toNumber(trip.miles),
          priceAmount:toNumber(trip.priceAmount),
          finalPrice:toNumber(trip.finalPrice)
        },

      originalRoutePoints:
        Array.isArray(body.originalRoutePoints)
          ? body.originalRoutePoints
          : [],

      newRoutePoints:
        Array.isArray(body.newRoutePoints)
          ? body.newRoutePoints
          : [],

      originalRemainingMiles:
        toNumber(body.originalRemainingMiles),

      newRemainingMiles:
        toNumber(body.newRemainingMiles),

      extraMiles:
        toNumber(body.extraMiles),

      originalRouteData:
        body.originalRouteData || {},

      newRouteData:
        body.newRouteData || {},

      createdAt:
        currentActiveRequest?.createdAt ||
        new Date(),

      updatedAt:
        new Date()
    };

    /*
      الرحلة نفسها لا تتعدل هنا.
      التعديل يفضل Pending للـ Review / Confirm.
    */

    trip.routeChangePending = true;
    trip.routeChangeStatus = "PENDING_REVIEW";

    trip.markModified("addStopRequest");

    await trip.save();

    return res.json({
      success:true,
      message:"Route change request saved for review",
      updated:Boolean(currentActiveRequest),
      tripId:trip._id,
      tripNumber:trip.tripNumber || "",
      tripSource,
      addStopPolicy,
      addStopRequest:trip.addStopRequest
    });

  }catch(err){

    console.error("ADD STOP CONFIRM ROUTE ERROR:",err);

    return res.status(err.statusCode || 500).json({
      success:false,
      message:"Failed to send added stop request",
      error:err.message
    });
  }
});

/* =========================
   GET ACTIVE ROUTE CHANGE
   GET /api/company/add-stop/:id/request
========================= */

router.get("/add-stop/:id/request", requireTenantApi, async (req,res)=>{

  try{

    const tripId =
      clean(req.params.id);

    if(!tripId || !isValidObjectId(tripId)){
      return res.status(400).json({
        success:false,
        message:"Invalid trip ID"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:tripId})).lean();

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    return res.json({
      success:true,
      tripId:trip._id,
      tripNumber:trip.tripNumber || "",
      addStopRequest:trip.addStopRequest || null
    });

  }catch(err){

    return res.status(500).json({
      success:false,
      message:"Failed to load route change request",
      error:err.message
    });
  }
});

/* =========================
   CANCEL ROUTE CHANGE
   POST /api/company/add-stop/:id/cancel
========================= */

router.post("/add-stop/:id/cancel", requireTenantApi, async (req,res)=>{

  try{

    const tripId =
      clean(req.params.id);

    if(!tripId || !isValidObjectId(tripId)){
      return res.status(400).json({
        success:false,
        message:"Invalid trip ID"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:tripId}));

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(!trip.addStopRequest){
      return res.status(404).json({
        success:false,
        message:"No active route change request found"
      });
    }

    trip.addStopRequest.active = false;
    trip.addStopRequest.status =
      req.body?.status || "CANCELLED_BY_COMPANY";
    trip.addStopRequest.cancelledAt = new Date();
    trip.addStopRequest.updatedAt = new Date();

    trip.routeChangePending = false;
    trip.routeChangeStatus = "CANCELLED";

    trip.markModified("addStopRequest");

    await trip.save();

    return res.json({
      success:true,
      message:"Route change request cancelled",
      tripId:trip._id
    });

  }catch(err){

    return res.status(500).json({
      success:false,
      message:"Failed to cancel route change request",
      error:err.message
    });
  }
});

module.exports = router;
