"use strict";

/* =====================================================
   FILE: routes/reservedAddStopRoutes.js
   ADMIN RESERVED ADD STOP / ROUTE CHANGE REQUEST
   Mounted on /api/reserved
===================================================== */

const express = require("express");
const mongoose = require("mongoose");
const Service = require("../models/Service");

const router = express.Router();

function getTripModel(){
  const Trip = mongoose.models.Trip || global.Trip;
  if(!Trip){
    throw new Error("Trip model not loaded. Mount reservedAddStopRoutes after Trip model");
  }
  return Trip;
}

function clean(v){ return String(v ?? "").trim(); }
function upper(v){ return clean(v).toUpperCase(); }
function n(v){ const x = Number(v); return Number.isFinite(x) ? x : 0; }
function bool(v){ return v === true || ["true","1","yes"].includes(clean(v).toLowerCase()); }

function normalizeCode(v){
  const c = upper(v).replace(/[_-]/g," ").replace(/\s+/g," ").trim();
  if(c === "STANDARD" || c === "ST") return "ST";
  if(["WHEELCHAIR","WHEEL CHAIR","WC","WH"].includes(c)) return "WH";
  if(c === "SHARED" || c === "SH") return "SH";
  if(["LIMO","LIMOUSINE","LM"].includes(c)) return "LM";
  if(c === "TAXI" || c === "TX") return "TX";
  if(c === "XL") return "XL";
  return c;
}

function isValidCode(code){
  return ["ST","WH","XL","LM","TX","SH"].includes(normalizeCode(code));
}

function tripServiceCode(trip){
  const candidates = [
    trip?.serviceKey, trip?.serviceCode, trip?.serviceType,
    trip?.serviceName, trip?.serviceTitle, trip?.vehicleType,
    trip?.serviceSuffix, trip?.tripNumberSuffix
  ];
  for(const value of candidates){
    const code = normalizeCode(value);
    if(isValidCode(code)) return code;
  }
  const parts = upper(trip?.tripNumber).split("-");
  for(let i = parts.length - 1; i >= 0; i--){
    const code = normalizeCode(parts[i]);
    if(isValidCode(code)) return code;
  }
  return "";
}

function serviceCode(service){
  return normalizeCode(
    service?.serviceKey || service?.serviceCode || service?.serviceType ||
    service?.title || service?.name || ""
  );
}

async function resolveReservedPolicy(trip){
  const code = tripServiceCode(trip);
  if(!code) throw new Error("Reserved trip service is missing");

  let service = null;
  const savedId = clean(trip.serviceId || trip.reservedServiceId);
  if(savedId && mongoose.Types.ObjectId.isValid(savedId)){
    service = await Service.findById(savedId).lean();
  }
  if(!service){
    const all = await Service.find({reservedEnabled:true}).lean();
    service = all.find(item => serviceCode(item) === code) || null;
  }
  if(!service) throw new Error("Reserved service was not found");

  return {
    source:"RESERVED_SERVICE_MANAGEMENT",
    serviceId:String(service._id || ""),
    serviceCode:code,
    normalEnabled:bool(service.reservedAddStopEnabled),
    customEnabled:bool(service.reservedAddStopCustomTimeEnabled),
    cutoffMinutes:Math.max(0,n(service.reservedAddStopCutoffMinutes))
  };
}

function minutesToTrip(trip){
  const date = clean(trip.tripDate);
  const time = clean(trip.tripTime);
  if(!date || !time) return null;
  const startsAt = new Date(`${date}T${time}:00-07:00`);
  return Number.isNaN(startsAt.getTime()) ? null : (startsAt.getTime() - Date.now()) / 60000;
}

function enforcePolicy(trip,policy){
  if(policy.normalEnabled) return;
  if(!policy.customEnabled){
    const err = new Error("Reserved Add Stop is disabled for this service");
    err.statusCode = 403;
    throw err;
  }
  const mins = minutesToTrip(trip);
  if(mins !== null && mins <= policy.cutoffMinutes){
    const err = new Error(
      policy.cutoffMinutes > 0
        ? `Add Stop closed ${policy.cutoffMinutes} minutes before the trip`
        : "The Add Stop time window has ended"
    );
    err.statusCode = 403;
    throw err;
  }
}

function tripClosed(trip){
  const s = clean(trip?.status).toLowerCase().replace(/[\s_-]/g,"");
  return s.includes("complete") || s.includes("cancel") || s.includes("noshow") || s.includes("notcompleted");
}

function activeRequest(trip){
  const req = trip?.addStopRequest || {};
  const status = upper(req.status);
  return req.active === true && ![
    "CANCELLED","CANCELLED_BY_DISPATCH","COMPLETED","STOP_REACHED","REJECTED"
  ].includes(status);
}

function strings(arr){
  return Array.isArray(arr) ? arr.map(clean).filter(Boolean) : [];
}

function detailed(arr){
  return Array.isArray(arr) ? arr.map((item,index)=>({
    address:clean(item?.address || item?.stop || item?.location),
    insertAfterIndex:n(item?.insertAfterIndex),
    rowIndex:n(item?.rowIndex ?? index)
  })).filter(item=>item.address) : [];
}

function edits(arr){
  return Array.isArray(arr) ? arr.map((item,index)=>({
    index:n(item?.index ?? index),
    oldAddress:clean(item?.oldAddress),
    newAddress:clean(item?.newAddress || (typeof item === "string" ? item : ""))
  })).filter(item=>item.newAddress) : [];
}

router.get("/add-stop/ping",(req,res)=>{
  res.json({success:true,message:"reservedAddStopRoutes connected"});
});

router.post("/add-stop/:id/confirm",async (req,res)=>{
  try{
    const id = clean(req.params.id);
    if(!mongoose.Types.ObjectId.isValid(id)){
      return res.status(400).json({success:false,message:"Invalid trip ID"});
    }
    const Trip = getTripModel();
    const trip = await Trip.findById(id);
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    if(tripClosed(trip)) return res.status(400).json({success:false,message:"This trip is closed"});
    if(trip.isShared === true || upper(trip.tripType) === "SHARED" || tripServiceCode(trip) === "SH"){
      return res.status(400).json({success:false,message:"Add Stop is not available for shared trips"});
    }

    const policy = await resolveReservedPolicy(trip);
    enforcePolicy(trip,policy);
    if(activeRequest(trip)){
      return res.status(409).json({success:false,message:"This trip already has an active route change request"});
    }

    const body = req.body || {};
    const pickup = clean(body.pickup || trip.pickup || trip.pickupAddress);
    const dropoffBefore = clean(body.dropoffBefore || trip.dropoff || trip.dropoffAddress);
    const dropoffAfter = clean(body.dropoffAfter || body.finalDropoff || dropoffBefore);
    const existingStopsBefore = strings(body.existingStopsBefore || trip.stops);
    const editedExistingStops = edits(body.editedExistingStops);
    const addedStops = strings(body.addedStops);
    const addedStopsDetailed = detailed(body.addedStopsDetailed);
    const finalStops = strings(body.finalStops);

    if(!pickup || !dropoffBefore){
      return res.status(400).json({success:false,message:"Pickup or dropoff address missing"});
    }
    if(!addedStops.length && !editedExistingStops.length && dropoffAfter === dropoffBefore){
      return res.status(400).json({success:false,message:"No route change detected"});
    }

    trip.addStopRequest = {
      active:true,
      status:body.status || "PENDING_REVIEW",
      requestType:body.requestType || "ROUTE_CHANGE",
      source:"reserved-add-stop",
      tripSource:"RESERVED",
      addStopPolicy:policy,
      calculatePriceOnReview:true,
      adminName:clean(body.adminName),
      tripNumber:clean(body.tripNumber || trip.tripNumber),
      clientName:clean(body.clientName || trip.clientName),
      tripStatusAtConfirm:clean(body.tripStatusAtConfirm || trip.status),
      confirmedAt:body.confirmedAt || new Date(),
      mode:clean(body.mode),
      maxStops:Math.min(5,Math.max(0,n(body.maxStops || 5))),
      pickup,dropoffBefore,dropoffAfter,
      existingStopsBefore,editedExistingStops,addedStops,addedStopsDetailed,finalStops,
      finalRoutePoints:Array.isArray(body.finalRoutePoints) ? body.finalRoutePoints : [],
      driverLocationAtConfirm:body.driverLocationAtConfirm || null,
      beforeStopChange:body.beforeStopChange || {},
      originalRoutePoints:Array.isArray(body.originalRoutePoints) ? body.originalRoutePoints : [],
      newRoutePoints:Array.isArray(body.newRoutePoints) ? body.newRoutePoints : [],
      originalRemainingMiles:n(body.originalRemainingMiles),
      newRemainingMiles:n(body.newRemainingMiles),
      extraMiles:n(body.extraMiles),
      originalRouteData:body.originalRouteData || {},
      newRouteData:body.newRouteData || {},
      createdAt:new Date(),updatedAt:new Date()
    };

    trip.routeChangePending = true;
    trip.routeChangeStatus = "PENDING_REVIEW";
    trip.routeLocked = false;
    trip.routeFinalized = false;
    trip.markModified("addStopRequest");
    await trip.save();

    return res.json({
      success:true,
      message:"Reserved route change request saved for Dispatch Review",
      tripId:trip._id,
      tripNumber:trip.tripNumber,
      addStopPolicy:policy,
      addStopRequest:trip.addStopRequest
    });
  }catch(err){
    console.error("RESERVED ADD STOP CONFIRM ERROR:",err);
    return res.status(err.statusCode || 500).json({
      success:false,message:err.message || "Failed to save Reserved Add Stop request"
    });
  }
});

router.get("/add-stop/:id/request",async (req,res)=>{
  try{
    const Trip = getTripModel();
    const trip = await Trip.findById(req.params.id).lean();
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    return res.json({success:true,tripId:trip._id,tripNumber:trip.tripNumber,addStopRequest:trip.addStopRequest || null});
  }catch(err){
    return res.status(500).json({success:false,message:err.message || "Failed to load request"});
  }
});

router.post("/add-stop/:id/cancel",async (req,res)=>{
  try{
    const Trip = getTripModel();
    const trip = await Trip.findById(req.params.id);
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    if(!trip.addStopRequest) return res.status(404).json({success:false,message:"No route change request found"});
    trip.addStopRequest.active = false;
    trip.addStopRequest.status = req.body?.status || "CANCELLED_BY_DISPATCH";
    trip.addStopRequest.cancelledAt = new Date();
    trip.addStopRequest.updatedAt = new Date();
    trip.routeChangePending = false;
    trip.routeChangeStatus = "CANCELLED";
    trip.markModified("addStopRequest");
    await trip.save();
    return res.json({success:true,message:"Reserved route change request cancelled",tripId:trip._id});
  }catch(err){
    return res.status(500).json({success:false,message:err.message || "Failed to cancel request"});
  }
});

module.exports = router;