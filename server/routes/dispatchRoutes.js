const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const User = require("../models/User");
const DriverSchedule = require("../models/DriverSchedule");
const DispatchAssignment = require("../models/DispatchAssignment");
const SmartDispatchEngine = require("../models/SmartDispatchEngine");

function TripModel(){
  const Trip = global.Trip || mongoose.models.Trip;
  if(!Trip) throw new Error("Trip model not loaded");
  return Trip;
}

function clean(v){ return String(v ?? "").trim(); }
function num(v,d=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function id(v){
  return mongoose.isValidObjectId(v)
    ? new mongoose.Types.ObjectId(v)
    : null;
}
function code(v){
  const c = clean(v).toUpperCase().replace(/[_-]/g," ");
  if(c === "STANDARD") return "ST";
  if(c === "WHEELCHAIR" || c === "WHEEL CHAIR" || c === "WC") return "WH";
  if(c === "SHARED") return "SH";
  if(c === "LIMO" || c === "LIMOUSINE") return "LM";
  if(c === "TAXI") return "TX";
  return c;
}
function tripService(trip){
  return code(
    trip.serviceCode ||
    trip.serviceKey ||
    trip.service ||
    trip.tripType
  );
}
function isShared(trip){
  return trip.isShared === true ||
    code(trip.tripType) === "SH" ||
    tripService(trip) === "SH";
}
function point(lat,lng){
  lat = Number(lat);
  lng = Number(lng);
  return Number.isFinite(lat) && Number.isFinite(lng)
    ? {lat,lng}
    : null;
}
function pickupPoint(trip){
  if(isShared(trip)){
    const passenger = (trip.passengers || []).find(p=>
      point(p.pickupLat,p.pickupLng)
    );
    if(passenger) return point(passenger.pickupLat,passenger.pickupLng);
  }
  return point(
    trip.pickupLat ?? trip.pickupLatitude,
    trip.pickupLng ?? trip.pickupLongitude
  );
}
function miles(a,b){
  if(!a || !b) return null;
  const rad = x=>x*Math.PI/180;
  const dLat = rad(b.lat-a.lat);
  const dLng = rad(b.lng-a.lng);
  const h =
    Math.sin(dLat/2)**2 +
    Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*
    Math.sin(dLng/2)**2;
  return 3958.7613*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
function tripDateTime(trip){
  const date = clean(trip.tripDate);
  const time = clean(trip.tripTime);
  if(!date || !time) return null;
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}
function dayKey(date){
  const d = new Date(`${date}T12:00:00`);
  return ["sun","mon","tue","wed","thu","fri","sat"][d.getDay()];
}
function scheduleAllows(row,trip,settings){
  if(settings.requireActiveDriver !== false && row.enabled === false) return false;
  if(settings.requireScheduleMatch !== false){
    const day = row.days?.[dayKey(trip.tripDate)];
    if(day === false || day?.enabled === false) return false;
    if(day && typeof day === "object"){
      const t = clean(trip.tripTime);
      if(day.start && t < day.start) return false;
      if(day.end && t > day.end) return false;
    }
  }
  if(settings.requireServiceMatch !== false){
    const services = Array.isArray(row.services)
      ? row.services.map(code)
      : ["ALL"];
    if(!services.includes("ALL") && !services.includes(tripService(trip))){
      return false;
    }
  }
  return true;
}

async function buildContext(){
  const [drivers,rows,assignments,settings] = await Promise.all([
    User.find({role:"driver",enabled:true}).sort({name:1}).lean(),
    DriverSchedule.find({}).lean(),
    DispatchAssignment.find({
      dispatchStatus:{$in:["ASSIGNED","SENT","ACCEPTED","ON_TRIP"]}
    }).lean(),
    SmartDispatchEngine.findOne().lean()
  ]);
  const schedule = new Map(rows.map(r=>[String(r.driverId),r]));
  return {drivers,schedule,assignments,settings:settings || {}};
}

function hasConflict(driverId,trip,ctx){
  if(ctx.settings.enableTimeConflict === false) return false;
  const target = tripDateTime(trip);
  if(!target) return false;
  const buffer = num(ctx.settings.minBufferMinutes,30)*60000;
  return ctx.assignments.some(a=>{
    if(String(a.driverId) !== String(driverId)) return false;
    const other = a.__trip;
    if(!other || clean(other.tripDate) !== clean(trip.tripDate)) return false;
    const dt = tripDateTime(other);
    return dt && Math.abs(dt-target) < buffer;
  });
}

function rankDrivers(trip,ctx){
  const maxTrips = Math.max(1,num(ctx.settings.maxTripsPerDriver,20));
  const maxPickup = Math.max(1,num(ctx.settings.maxPickupDistanceMiles,50));
  const pickup = pickupPoint(trip);

  return ctx.drivers.flatMap(driver=>{
    const driverId = String(driver._id);
    const row = ctx.schedule.get(driverId) || {};
    if(!scheduleAllows(row,trip,ctx.settings)) return [];

    const today = ctx.assignments.filter(a=>
      String(a.driverId) === driverId &&
      clean(a.__trip?.tripDate) === clean(trip.tripDate)
    ).length;
    if(today >= maxTrips || hasConflict(driverId,trip,ctx)) return [];

    const distance = miles(point(row.lat,row.lng),pickup);
    if(distance !== null && distance > maxPickup) return [];

    const distanceScore = distance === null
      ? 50
      : Math.max(0,100-(distance/maxPickup*100));
    const travelScore = distance === null
      ? 50
      : Math.max(0,100-(distance*2/60*100));
    const loadScore = Math.max(0,100-(today/maxTrips*100));
    const strategy = clean(ctx.settings.strategy || "SMART").toUpperCase();

    let score;
    let reason;
    if(strategy === "DISTANCE"){
      score=distanceScore; reason="Closest Driver";
    }else if(strategy === "TIME"){
      score=travelScore; reason="Travel Time";
    }else if(strategy === "BALANCED"){
      score=loadScore; reason="Balanced Load";
    }else{
      score =
        distanceScore*num(ctx.settings.distanceWeight,40)/100 +
        travelScore*num(ctx.settings.travelTimeWeight,30)/100 +
        loadScore*num(ctx.settings.loadWeight,20)/100 +
        100*num(ctx.settings.conflictWeight,10)/100;
      reason="Smart Score";
    }

    return [{
      driver,row,
      driverId,
      score:Math.round(score),
      reason,
      distance:distance === null ? null : Number(distance.toFixed(2))
    }];
  }).sort((a,b)=>
    b.score-a.score ||
    (a.distance ?? Infinity)-(b.distance ?? Infinity) ||
    clean(a.driver.name).localeCompare(clean(b.driver.name))
  );
}

async function attachTrips(ctx){
  const Trip = TripModel();
  const tripIds = [...new Set(ctx.assignments.map(a=>String(a.tripId)))];
  const rows = await Trip.find({_id:{$in:tripIds}}).lean();
  const map = new Map(rows.map(t=>[String(t._id),t]));
  ctx.assignments.forEach(a=>{ a.__trip=map.get(String(a.tripId)); });
}

router.get("/",async(req,res)=>{
  try{
    const Trip = TripModel();
    const [trips,assignments,drivers,scheduleRows] = await Promise.all([
      Trip.find({dispatchSelected:true,disabled:false})
        .sort({tripDate:1,tripTime:1,createdAt:1}).lean(),
      DispatchAssignment.find({}).lean(),
      User.find({role:"driver",enabled:true}).sort({name:1}).lean(),
      DriverSchedule.find({}).lean()
    ]);
    const assignmentMap = new Map(
      assignments.map(a=>[String(a.tripId),a])
    );
    const schedule = {};
    scheduleRows.forEach(row=>{
      schedule[String(row.driverId)] = row;
    });
    res.json({
      trips:trips.map(trip=>{
        const a=assignmentMap.get(String(trip._id));
        return {
          ...trip,
          driverId:a?.driverId || "",
          driverName:a?.driverName || "",
          vehicle:a?.vehicleNumber || "",
          driverAddress:a?.driverAddress || "",
          dispatchStatus:a?.dispatchStatus || "UNASSIGNED",
          assignmentType:a?.assignmentType || "",
          manualAssigned:a?.assignmentType === "MANUAL",
          smartScore:a?.smartScore ?? "",
          smartReason:a?.smartReason || "",
          smartDistance:a?.smartDistance ?? "",
          note:a?.note || "",
          sentAt:a?.sentAt || null
        };
      }),
      drivers,
      schedule
    });
  }catch(err){
    console.error("DISPATCH LOAD:",err);
    res.status(500).json({success:false,message:"Dispatch load error"});
  }
});

router.post("/auto-assign",async(req,res)=>{
  try{
    const Trip = TripModel();
    const settings = await SmartDispatchEngine.findOne().lean();
    if(settings?.enabled === false){
      return res.status(400).json({
        success:false,
        message:"Smart Dispatch is disabled"
      });
    }
    const requested = Array.isArray(req.body.ids)
      ? req.body.ids.map(id).filter(Boolean)
      : [];
    const filter = {
      dispatchSelected:true,
      disabled:false,
      ...(requested.length ? {_id:{$in:requested}} : {})
    };
    const trips = await Trip.find(filter)
      .sort({tripDate:1,tripTime:1,createdAt:1}).lean();
    const existing = await DispatchAssignment.find({
      tripId:{$in:trips.map(t=>t._id)},
      driverId:{$ne:null}
    }).select("tripId").lean();
    const assignedIds = new Set(existing.map(a=>String(a.tripId)));
    const ctx = await buildContext();
    await attachTrips(ctx);
    const results = [];

    for(const trip of trips){
      if(assignedIds.has(String(trip._id))) continue;
      if(isShared(trip) && ctx.settings.autoAssignSharedTrips === false) continue;
      const best = rankDrivers(trip,ctx)[0];
      if(!best){
        results.push({tripId:trip._id,assigned:false,reason:"No eligible driver"});
        continue;
      }
      const assignment = await DispatchAssignment.findOneAndUpdate(
        {tripId:trip._id,driverId:null},
        {$set:{
          tripId:trip._id,
          driverId:best.driver._id,
          driverName:best.driver.name || best.driver.fullName || "",
          driverPhone:best.row.phone || best.driver.phone || "",
          vehicleNumber:best.row.vehicleNumber || "",
          driverAddress:best.row.address || "",
          services:Array.isArray(best.row.services) ? best.row.services : ["ALL"],
          dispatchStatus:"ASSIGNED",
          assignedBy:req.user?._id ? String(req.user._id) : "SYSTEM",
          assignmentType:"AUTO",
          smartScore:best.score,
          smartReason:best.reason,
          smartDistance:best.distance,
          assignedAt:new Date()
        }},
        {upsert:true,new:true}
      );
      ctx.assignments.push({...assignment.toObject(),__trip:trip});
      results.push({
        tripId:trip._id,
        assigned:true,
        driverId:best.driverId,
        driverName:assignment.driverName,
        score:best.score
      });
    }
    res.json({
      success:true,
      assignedCount:results.filter(x=>x.assigned).length,
      unassignedCount:results.filter(x=>!x.assigned).length,
      results
    });
  }catch(err){
    console.error("AUTO ASSIGN:",err);
    res.status(500).json({success:false,message:"Smart assignment failed"});
  }
});

router.patch("/send",async(req,res)=>{
  try{
    const ids = Array.isArray(req.body.ids)
      ? req.body.ids.map(id).filter(Boolean)
      : [];
    if(!ids.length){
      return res.status(400).json({success:false,message:"No trips selected"});
    }
    const assignments = await DispatchAssignment.find({
      tripId:{$in:ids}
    }).lean();
    const assigned = new Set(
      assignments.filter(a=>a.driverId).map(a=>String(a.tripId))
    );
    const missing = ids.filter(x=>!assigned.has(String(x)));
    if(missing.length){
      return res.status(400).json({
        success:false,
        message:"Assign a driver to every selected trip before sending",
        missing
      });
    }
    await DispatchAssignment.updateMany(
      {tripId:{$in:ids}},
      {$set:{dispatchStatus:"SENT",sentAt:new Date()}}
    );
    res.json({success:true,sentCount:ids.length});
  }catch(err){
    console.error("SEND TRIPS:",err);
    res.status(500).json({success:false,message:"Send failed"});
  }
});

/* =========================
   SAVE TRIP DISPATCH SELECT
========================= */

router.patch("/:tripId/selection",async(req,res)=>{
  try{
    const tripId=id(req.params.tripId);

    if(!tripId){
      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    if(typeof req.body.dispatchSelected !== "boolean"){
      return res.status(400).json({
        success:false,
        message:"dispatchSelected must be true or false"
      });
    }

    const Trip=TripModel();
    const dispatchSelected=req.body.dispatchSelected;

    const trip=await Trip.findByIdAndUpdate(
      tripId,
      {$set:{dispatchSelected}},
      {new:true,runValidators:true}
    ).lean();

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    /*
      Removing Select must also remove any unsent assignment, otherwise an
      old driver assignment can return if the trip is selected again later.
      Sent/accepted/on-trip/completed history is kept intact.
    */
    if(!dispatchSelected){
      await DispatchAssignment.deleteOne({
        tripId,
        dispatchStatus:{$in:["UNASSIGNED","ASSIGNED"]}
      });
    }

    res.json({
      success:true,
      tripId:String(trip._id),
      dispatchSelected:trip.dispatchSelected === true
    });

  }catch(err){
    console.error("SAVE DISPATCH SELECT:",err);
    res.status(500).json({
      success:false,
      message:"Dispatch selection save failed"
    });
  }
});

router.patch("/:tripId/driver",async(req,res)=>{
  try{
    const tripId=id(req.params.tripId);
    const driverId=id(req.body.driverId);
    if(!tripId){
      return res.status(400).json({success:false,message:"Invalid trip id"});
    }
    const Trip=TripModel();
    const trip=await Trip.findOne({
      _id:tripId,dispatchSelected:true,disabled:false
    }).lean();
    if(!trip){
      return res.status(404).json({success:false,message:"Trip not found"});
    }
    if(!driverId){
      const assignment=await DispatchAssignment.findOneAndUpdate(
        {tripId},
        {$set:{
          driverId:null,driverName:"",driverPhone:"",
          vehicleNumber:"",driverAddress:"",
          dispatchStatus:"UNASSIGNED",
          assignmentType:"MANUAL",
          smartScore:null,smartReason:"",smartDistance:null,
          assignedAt:null
        }},
        {upsert:true,new:true}
      );
      return res.json({success:true,assignment});
    }
    const driver=await User.findOne({
      _id:driverId,role:"driver",enabled:true
    }).lean();
    if(!driver){
      return res.status(404).json({success:false,message:"Active driver not found"});
    }
    const row=await DriverSchedule.findOne({driverId}).lean();
    const assignment=await DispatchAssignment.findOneAndUpdate(
      {tripId},
      {$set:{
        tripId,driverId,
        driverName:driver.name || driver.fullName || "",
        driverPhone:row?.phone || driver.phone || "",
        vehicleNumber:row?.vehicleNumber || "",
        driverAddress:row?.address || "",
        services:Array.isArray(row?.services) ? row.services : ["ALL"],
        dispatchStatus:"ASSIGNED",
        assignedBy:req.user?._id ? String(req.user._id) : "DISPATCH",
        assignmentType:"MANUAL",
        smartScore:null,smartReason:"Manual Override",smartDistance:null,
        assignedAt:new Date()
      }},
      {upsert:true,new:true}
    );
    res.json({success:true,assignment});
  }catch(err){
    console.error("ASSIGN DRIVER:",err);
    res.status(500).json({success:false,message:"Assign failed"});
  }
});

router.patch("/:tripId/note",async(req,res)=>{
  try{
    const tripId=id(req.params.tripId);
    if(!tripId){
      return res.status(400).json({success:false,message:"Invalid trip id"});
    }
    await DispatchAssignment.findOneAndUpdate(
      {tripId},
      {$set:{note:clean(req.body.note)}},
      {upsert:true,new:true}
    );
    res.json({success:true});
  }catch(err){
    res.status(500).json({success:false,message:"Note save failed"});
  }
});

module.exports=router;