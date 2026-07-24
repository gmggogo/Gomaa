const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const User = require("../models/User");
const DriverSchedule = require("../models/DriverSchedule");
const DispatchAssignment = require("../models/DispatchAssignment");
const SmartDispatchEngine = require("../models/SmartDispatchEngine");

/*
  GH DISPATCH ROUTES — SERVICE OWNER PRIORITY — 2026-07-23

  AUTO ASSIGN ORDER:
  1) Active and eligible drivers who own the trip service.
  2) Active and eligible ALL-service drivers only when no service owner qualifies.
  3) Smart score, pickup distance, then driver name inside the selected group.

  Supported services:
  ST / WH / SH / TX / XL / LM
*/

function TripModel(){
  const Trip = global.Trip || mongoose.models.Trip;
  if(!Trip) throw new Error("Trip model not loaded");
  return Trip;
}

function clean(value){
  return String(value ?? "").trim();
}

function num(value, fallback = 0){
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function objectId(value){
  return mongoose.isValidObjectId(value)
    ? new mongoose.Types.ObjectId(value)
    : null;
}

function serviceCode(value){
  if(value && typeof value === "object"){
    value =
      value.serviceKey ||
      value.serviceCode ||
      value.code ||
      value.key ||
      value.title ||
      value.name ||
      "";
  }

  const valueCode = clean(value)
    .toUpperCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ");

  if(["ALL", "ANY", "ALL SERVICES"].includes(valueCode)) return "ALL";
  if(["ST", "STANDARD", "AMBULATORY"].includes(valueCode)) return "ST";
  if(["WH", "WC", "WHEELCHAIR", "WHEEL CHAIR"].includes(valueCode)) return "WH";
  if(["SH", "SHARED", "SHARE"].includes(valueCode)) return "SH";
  if(["TX", "TAXI"].includes(valueCode)) return "TX";
  if(["XL", "EXTRA LARGE"].includes(valueCode)) return "XL";
  if(["LM", "LIMO", "LIMOUSINE"].includes(valueCode)) return "LM";

  return valueCode;
}

function isSharedTrip(trip){
  if(!trip) return false;

  if(
    trip.isShared === true ||
    trip.shared === true ||
    trip.sharedTrip === true
  ){
    return true;
  }

  const serviceValues = [
    trip.serviceKey,
    trip.serviceCode,
    trip.service,
    trip.serviceType,
    trip.tripType,
    trip.type
  ];

  if(serviceValues.some(value => serviceCode(value) === "SH")){
    return true;
  }

  /*
    Individual trips can also carry a passengers array, including one
    passenger. The presence of that array alone must never turn ST/WH/etc.
    into SH. Shared is identified only by an explicit shared flag or an SH
    service value above.
  */
  return false;
}

function tripService(trip){
  if(isSharedTrip(trip)) return "SH";

  const serviceValues = [
    trip?.serviceKey,
    trip?.serviceCode,
    trip?.service,
    trip?.serviceType,
    trip?.tripType,
    trip?.type
  ];

  return serviceValues
    .map(serviceCode)
    .find(Boolean) || "";
}

function requiredService(trip){
  return isSharedTrip(trip)
    ? "SH"
    : tripService(trip);
}

function driverServices(row){
  const raw = Array.isArray(row?.services)
    ? row.services
    : clean(row?.services)
      ? clean(row.services).split(",")
      : ["ALL"];

  const normalized = [...new Set(raw.map(serviceCode).filter(Boolean))];
  return normalized.length ? normalized : ["ALL"];
}

function serviceTier(row, trip){
  const services = driverServices(row);
  const required = requiredService(trip);

  if(!required) return null;
  if(services.includes(required)) return 0;
  if(services.includes("ALL")) return 1;
  return null;
}

function point(lat, lng){
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  return Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
    ? {lat: parsedLat, lng: parsedLng}
    : null;
}

function pickupPoint(trip){
  if(requiredService(trip) === "SH"){
    const passenger = (trip.passengers || []).find(item =>
      point(item.pickupLat, item.pickupLng)
    );

    if(passenger){
      return point(passenger.pickupLat, passenger.pickupLng);
    }
  }

  return point(
    trip.pickupLat ?? trip.pickupLatitude,
    trip.pickupLng ?? trip.pickupLongitude
  );
}

function milesBetween(first, second){
  if(!first || !second) return null;

  const radians = value => value * Math.PI / 180;
  const deltaLat = radians(second.lat - first.lat);
  const deltaLng = radians(second.lng - first.lng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(first.lat)) *
    Math.cos(radians(second.lat)) *
    Math.sin(deltaLng / 2) ** 2;

  return 3958.7613 * 2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function tripDateTime(trip){
  const date = clean(trip?.tripDate);
  const time = clean(trip?.tripTime);
  if(!date || !time) return null;

  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function dayKey(date){
  const parsed = new Date(`${date}T12:00:00`);
  if(Number.isNaN(parsed.getTime())) return "";
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][parsed.getDay()];
}

function driverUserFilter(){
  return {
    role: /^driver$/i,
    enabled: {$ne: false},
    disabled: {$ne: true}
  };
}

function activeSchedule(row, settings){
  if(settings.requireActiveDriver === false) return true;

  const status = clean(row?.status).toUpperCase();
  return !(
    row?.enabled === false ||
    row?.active === false ||
    status === "INACTIVE" ||
    status === "DISABLED"
  );
}

function scheduleTimeAllows(row, trip, settings){
  if(settings.requireScheduleMatch === false) return true;

  const key = dayKey(trip.tripDate);
  const day = key ? row?.days?.[key] : null;

  if(day === false || day?.enabled === false) return false;

  if(day && typeof day === "object"){
    const time = clean(trip.tripTime);
    if(day.start && time < clean(day.start)) return false;
    if(day.end && time > clean(day.end)) return false;
  }

  return true;
}

function eligibleServiceTier(row, trip, settings){
  /*
    GH policy is stricter than the optional Smart Dispatch setting:
    the exact service owner must always rank first and ALL is the only
    fallback. A driver who owns another service is never eligible.
  */
  return serviceTier(row, trip);
}

async function buildContext(){
  const [drivers, scheduleRows, assignments, settings] = await Promise.all([
    User.find(driverUserFilter()).sort({name: 1}).lean(),
    DriverSchedule.find({}).lean(),
    DispatchAssignment.find({
      dispatchStatus: {$in: ["ASSIGNED", "SENT", "ACCEPTED", "ON_TRIP"]}
    }).lean(),
    SmartDispatchEngine.findOne().lean()
  ]);

  return {
    drivers,
    schedule: new Map(
      scheduleRows.map(row => [String(row.driverId), row])
    ),
    assignments,
    settings: settings || {}
  };
}

async function attachAssignedTrips(context){
  const Trip = TripModel();
  const tripIds = [
    ...new Set(
      context.assignments
        .map(assignment => String(assignment.tripId || ""))
        .filter(Boolean)
    )
  ];

  if(!tripIds.length) return;

  const trips = await Trip.find({_id: {$in: tripIds}}).lean();
  const tripMap = new Map(trips.map(trip => [String(trip._id), trip]));

  context.assignments.forEach(assignment => {
    assignment.__trip = tripMap.get(String(assignment.tripId));
  });
}

function driverTripCount(driverId, trip, context){
  return context.assignments.filter(assignment =>
    String(assignment.driverId) === String(driverId) &&
    clean(assignment.__trip?.tripDate) === clean(trip.tripDate)
  ).length;
}

function hasTimeConflict(driverId, trip, context){
  if(context.settings.enableTimeConflict === false) return false;

  const target = tripDateTime(trip);
  if(!target) return false;

  const bufferMilliseconds =
    Math.max(0, num(context.settings.minBufferMinutes, 30)) * 60000;

  return context.assignments.some(assignment => {
    if(String(assignment.driverId) !== String(driverId)) return false;

    const otherTrip = assignment.__trip;
    if(!otherTrip) return false;
    if(clean(otherTrip.tripDate) !== clean(trip.tripDate)) return false;

    const otherTime = tripDateTime(otherTrip);
    return otherTime &&
      Math.abs(otherTime.getTime() - target.getTime()) < bufferMilliseconds;
  });
}

function smartScore(distance, todayCount, settings){
  const maxTrips = Math.max(1, num(settings.maxTripsPerDriver, 20));
  const maxPickup = Math.max(1, num(settings.maxPickupDistanceMiles, 50));

  const distanceScore = distance === null
    ? 50
    : Math.max(0, 100 - (distance / maxPickup * 100));

  const travelScore = distance === null
    ? 50
    : Math.max(0, 100 - (distance * 2 / 60 * 100));

  const loadScore = Math.max(0, 100 - (todayCount / maxTrips * 100));
  const strategy = clean(settings.strategy || "SMART").toUpperCase();

  if(strategy === "DISTANCE"){
    return {score: distanceScore, reason: "Closest Driver"};
  }

  if(strategy === "TIME"){
    return {score: travelScore, reason: "Travel Time"};
  }

  if(strategy === "BALANCED"){
    return {score: loadScore, reason: "Balanced Load"};
  }

  const score =
    distanceScore * num(settings.distanceWeight, 40) / 100 +
    travelScore * num(settings.travelTimeWeight, 30) / 100 +
    loadScore * num(settings.loadWeight, 20) / 100 +
    100 * num(settings.conflictWeight, 10) / 100;

  return {score, reason: "Smart Score"};
}

function rankDrivers(trip, context){
  const maxTrips = Math.max(
    1,
    num(context.settings.maxTripsPerDriver, 20)
  );
  const maxPickup = Math.max(
    1,
    num(context.settings.maxPickupDistanceMiles, 50)
  );
  const pickup = pickupPoint(trip);

  const candidates = context.drivers.flatMap(driver => {
    const driverId = String(driver._id);
    const row = context.schedule.get(driverId) || {};

    if(!activeSchedule(row, context.settings)) return [];
    if(!scheduleTimeAllows(row, trip, context.settings)) return [];

    const tier = eligibleServiceTier(row, trip, context.settings);
    if(tier === null) return [];

    const todayCount = driverTripCount(driverId, trip, context);
    if(todayCount >= maxTrips) return [];
    if(hasTimeConflict(driverId, trip, context)) return [];

    const distance = milesBetween(point(row.lat, row.lng), pickup);
    if(distance !== null && distance > maxPickup) return [];

    const ranking = smartScore(distance, todayCount, context.settings);

    return [{
      driver,
      row,
      driverId,
      serviceTier: tier,
      serviceMatch: tier === 0 ? requiredService(trip) : "ALL",
      score: Math.round(ranking.score),
      reason: tier === 0
        ? `${ranking.reason} | Service ${requiredService(trip)}`
        : `${ranking.reason} | ALL fallback`,
      distance: distance === null ? null : Number(distance.toFixed(2))
    }];
  });

  const sortSelectedTier = list => list.sort((first, second) =>
    second.score - first.score ||
    (first.distance ?? Infinity) - (second.distance ?? Infinity) ||
    clean(first.driver.name || first.driver.fullName)
      .localeCompare(clean(second.driver.name || second.driver.fullName))
  );

  /*
    Two separate stages are intentional. ALL drivers never compete by score
    with an eligible owner of the requested service.
  */
  const serviceOwners = candidates.filter(item => item.serviceTier === 0);
  if(serviceOwners.length) return sortSelectedTier(serviceOwners);

  return sortSelectedTier(
    candidates.filter(item => item.serviceTier === 1)
  );
}

function rejectionReason(trip, context){
  const required = requiredService(trip);
  const activeRows = context.drivers
    .map(driver => ({
      driver,
      row: context.schedule.get(String(driver._id)) || {}
    }))
    .filter(item => activeSchedule(item.row, context.settings));

  if(!activeRows.length) return "No active drivers";

  const serviceRows = activeRows.filter(item =>
    eligibleServiceTier(item.row, trip, context.settings) !== null
  );

  if(!serviceRows.length){
    return `No ${required} or ALL driver`;
  }

  const scheduledRows = serviceRows.filter(item =>
    scheduleTimeAllows(item.row, trip, context.settings)
  );

  if(!scheduledRows.length){
    return `No ${required} or ALL driver matches the schedule`;
  }

  return `No eligible ${required} or ALL driver after limits/conflicts/distance`;
}

/*
  Internal server trigger used immediately after a new trip is confirmed.
  This does not depend on the Dispatch page or the Auto Assign button.
*/
async function autoAssignTripById(tripId, assignedBy = "SYSTEM"){
  const Trip = TripModel();
  const validTripId = objectId(tripId);

  if(!validTripId){
    return {
      success:false,
      assigned:false,
      reason:"Invalid trip id"
    };
  }

  const settings = await SmartDispatchEngine.findOne().lean();

  if(settings?.enabled === false){
    return {
      success:true,
      assigned:false,
      reason:"Smart Dispatch is disabled"
    };
  }

  const trip = await Trip.findOne({
    _id:validTripId,
    dispatchSelected:true,
    disabled:false
  }).lean();

  if(!trip){
    return {
      success:true,
      assigned:false,
      reason:"Trip is not available in Dispatch"
    };
  }

  const existing = await DispatchAssignment.findOne({
    tripId:trip._id,
    driverId:{$ne:null}
  }).lean();

  if(existing){
    return {
      success:true,
      assigned:false,
      skipped:true,
      reason:"Already assigned",
      driverId:String(existing.driverId),
      driverName:existing.driverName || ""
    };
  }

  const context = await buildContext();
  await attachAssignedTrips(context);

  const best = rankDrivers(trip,context)[0];

  if(!best){
    return {
      success:true,
      assigned:false,
      service:requiredService(trip),
      reason:rejectionReason(trip,context)
    };
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
      services:driverServices(best.row),
      dispatchStatus:"ASSIGNED",
      assignedBy:clean(assignedBy) || "SYSTEM",
      assignmentType:"AUTO",
      smartScore:best.score,
      smartReason:best.reason,
      smartDistance:best.distance,
      assignedAt:new Date()
    }},
    {upsert:true,new:true}
  );

  if(!assignment){
    return {
      success:true,
      assigned:false,
      service:requiredService(trip),
      reason:"Trip assignment changed before save"
    };
  }

  return {
    success:true,
    assigned:true,
    tripId:String(trip._id),
    service:requiredService(trip),
    driverId:best.driverId,
    driverName:assignment.driverName,
    serviceMatch:best.serviceMatch,
    score:best.score,
    reason:best.reason
  };
}

/*
  A Company Shared booking can be stored as several Trip documents. They are
  one physical route, so they must receive one driver together. Ranking is
  performed once on the first document, then the same assignment is copied to
  the remaining unassigned documents. Existing assignments are never
  overwritten.
*/
async function autoAssignTripGroupByIds(tripIds, assignedBy = "SYSTEM"){
  const Trip = TripModel();
  const ids = [...new Set(
    (Array.isArray(tripIds) ? tripIds : [])
      .map(objectId)
      .filter(Boolean)
      .map(value => String(value))
  )].map(value => new mongoose.Types.ObjectId(value));

  if(!ids.length){
    return {
      success:false,
      assigned:false,
      assignedCount:0,
      reason:"No valid shared trip ids"
    };
  }

  const trips = await Trip.find({
    _id:{$in:ids},
    dispatchSelected:true,
    disabled:false
  }).sort({passengerIndex:1,createdAt:1}).lean();

  if(!trips.length){
    return {
      success:true,
      assigned:false,
      assignedCount:0,
      reason:"Shared trip group is not available in Dispatch"
    };
  }

  const tripIdStrings = trips.map(trip => String(trip._id));
  let master = await DispatchAssignment.findOne({
    tripId:{$in:trips.map(trip => trip._id)},
    driverId:{$ne:null}
  }).sort({assignedAt:1}).lean();

  let primaryResult = null;

  if(!master){
    primaryResult = await autoAssignTripById(
      trips[0]._id,
      clean(assignedBy) || "SYSTEM"
    );

    if(!primaryResult?.assigned){
      return {
        ...primaryResult,
        group:true,
        tripIds:tripIdStrings,
        assignedCount:0
      };
    }

    master = await DispatchAssignment.findOne({
      tripId:trips[0]._id,
      driverId:{$ne:null}
    }).lean();
  }

  if(!master?.driverId){
    return {
      success:true,
      assigned:false,
      group:true,
      tripIds:tripIdStrings,
      assignedCount:0,
      reason:"Shared group driver was not saved"
    };
  }

  let assignedCount = primaryResult?.assigned ? 1 : 0;

  for(const trip of trips){
    if(String(trip._id) === String(master.tripId)) continue;

    const existingForTrip = await DispatchAssignment.findOne({
      tripId:trip._id,
      driverId:{$ne:null}
    }).lean();

    if(existingForTrip) continue;

    const assignment = await DispatchAssignment.findOneAndUpdate(
      {tripId:trip._id,driverId:null},
      {$set:{
        tripId:trip._id,
        driverId:master.driverId,
        driverName:master.driverName || "",
        driverPhone:master.driverPhone || "",
        vehicleNumber:master.vehicleNumber || "",
        driverAddress:master.driverAddress || "",
        services:Array.isArray(master.services)
          ? master.services
          : [requiredService(trip)],
        dispatchStatus:"ASSIGNED",
        assignedBy:clean(assignedBy) || "SYSTEM",
        assignmentType:master.assignmentType || "AUTO",
        smartScore:master.smartScore ?? null,
        smartReason:master.smartReason || "Shared group same driver",
        smartDistance:master.smartDistance ?? null,
        assignedAt:master.assignedAt || new Date()
      }},
      {upsert:true,new:true}
    );

    if(assignment) assignedCount += 1;
  }

  return {
    success:true,
    assigned:true,
    group:true,
    tripIds:tripIdStrings,
    assignedCount,
    driverId:String(master.driverId),
    driverName:master.driverName || "",
    service:"SH",
    serviceMatch:"SH",
    score:master.smartScore ?? null,
    reason:master.smartReason || "Shared group same driver"
  };
}

router.get("/", async (req, res) => {
  try{
    const Trip = TripModel();
    const [trips, assignments, drivers, scheduleRows] = await Promise.all([
      Trip.find({dispatchSelected: true, disabled: false})
        .sort({tripDate: 1, tripTime: 1, createdAt: 1})
        .lean(),
      DispatchAssignment.find({}).lean(),
      User.find(driverUserFilter()).sort({name: 1}).lean(),
      DriverSchedule.find({}).lean()
    ]);

    const assignmentMap = new Map(
      assignments.map(assignment => [
        String(assignment.tripId),
        assignment
      ])
    );
    const schedule = {};

    scheduleRows.forEach(row => {
      schedule[String(row.driverId)] = row;
    });

    res.json({
      trips: trips.map(trip => {
        const assignment = assignmentMap.get(String(trip._id));

        return {
          ...trip,
          driverId: assignment?.driverId || "",
          driverName: assignment?.driverName || "",
          vehicle: assignment?.vehicleNumber || "",
          driverAddress: assignment?.driverAddress || "",
          dispatchStatus: assignment?.dispatchStatus || "UNASSIGNED",
          assignmentType: assignment?.assignmentType || "",
          manualAssigned: assignment?.assignmentType === "MANUAL",
          smartScore: assignment?.smartScore ?? "",
          smartReason: assignment?.smartReason || "",
          smartDistance: assignment?.smartDistance ?? "",
          note: assignment?.note || "",
          sentAt: assignment?.sentAt || null
        };
      }),
      drivers,
      schedule
    });
  }catch(error){
    console.error("DISPATCH LOAD:", error);
    res.status(500).json({
      success: false,
      message: "Dispatch load error"
    });
  }
});

router.post("/auto-assign", async (req, res) => {
  try{
    const Trip = TripModel();
    const settings = await SmartDispatchEngine.findOne().lean();

    if(settings?.enabled === false){
      return res.status(400).json({
        success: false,
        message: "Smart Dispatch is disabled"
      });
    }

    const requestedIds = Array.isArray(req.body.ids)
      ? req.body.ids.map(objectId).filter(Boolean)
      : [];

    const filter = {
      dispatchSelected: true,
      disabled: false,
      ...(requestedIds.length ? {_id: {$in: requestedIds}} : {})
    };

    const trips = await Trip.find(filter)
      .sort({tripDate: 1, tripTime: 1, createdAt: 1})
      .lean();

    const existingAssignments = await DispatchAssignment.find({
      tripId: {$in: trips.map(trip => trip._id)},
      driverId: {$ne: null}
    }).lean();

    const existingAssignmentMap = new Map(
      existingAssignments.map(assignment => [
        String(assignment.tripId),
        assignment
      ])
    );

    const context = await buildContext();
    await attachAssignedTrips(context);

    const results = [];

    for(const trip of trips){
      const previousAssignment =
        existingAssignmentMap.get(String(trip._id));

      /*
        Never overwrite a manual decision or a trip already sent/started.
        An AUTO assignment that is still only ASSIGNED is re-evaluated, so an
        older ALL fallback can be corrected when a service owner is available.
      */
      const previousStatus =
        clean(previousAssignment?.dispatchStatus).toUpperCase();
      const previousType =
        clean(previousAssignment?.assignmentType).toUpperCase();

      if(
        previousAssignment &&
        (
          previousType === "MANUAL" ||
          ["SENT", "ACCEPTED", "ON_TRIP"].includes(previousStatus)
        )
      ){
        results.push({
          tripId: trip._id,
          assigned: false,
          skipped: true,
          reason: previousType === "MANUAL"
            ? "Manual assignment preserved"
            : `Assignment preserved because status is ${previousStatus}`
        });
        continue;
      }

      /*
        Shared is intentionally processed like every other service.
        No silent autoAssignSharedTrips skip exists here.
      */
      const best = rankDrivers(trip, context)[0];

      if(!best){
        results.push({
          tripId: trip._id,
          service: requiredService(trip),
          assigned: false,
          reason: rejectionReason(trip, context)
        });
        continue;
      }

      const assignmentFilter = previousAssignment
        ? {_id: previousAssignment._id}
        : {tripId: trip._id, driverId: null};

      const assignment = await DispatchAssignment.findOneAndUpdate(
        assignmentFilter,
        {$set: {
          tripId: trip._id,
          driverId: best.driver._id,
          driverName:
            best.driver.name ||
            best.driver.fullName ||
            "",
          driverPhone:
            best.row.phone ||
            best.driver.phone ||
            "",
          vehicleNumber: best.row.vehicleNumber || "",
          driverAddress: best.row.address || "",
          services: driverServices(best.row),
          dispatchStatus: "ASSIGNED",
          assignedBy: req.user?._id
            ? String(req.user._id)
            : "SYSTEM",
          assignmentType: "AUTO",
          smartScore: best.score,
          smartReason: best.reason,
          smartDistance: best.distance,
          assignedAt: new Date()
        }},
        {upsert: true, new: true}
      );

      if(!assignment){
        results.push({
          tripId: trip._id,
          service: tripService(trip),
          assigned: false,
          reason: "Trip assignment changed before save"
        });
        continue;
      }

      context.assignments.push({
        ...assignment.toObject(),
        __trip: trip
      });

      results.push({
        tripId: trip._id,
        service: tripService(trip),
        assigned: true,
        reassigned: !!previousAssignment &&
          String(previousAssignment.driverId) !== best.driverId,
        driverId: best.driverId,
        driverName: assignment.driverName,
        serviceMatch: best.serviceMatch,
        score: best.score,
        reason: best.reason
      });
    }

    res.json({
      success: true,
      assignedCount: results.filter(result => result.assigned).length,
      unassignedCount: results.filter(result =>
        !result.assigned && !result.skipped
      ).length,
      skippedCount: results.filter(result => result.skipped).length,
      results
    });
  }catch(error){
    console.error("AUTO ASSIGN:", error);
    res.status(500).json({
      success: false,
      message: "Smart assignment failed"
    });
  }
});

router.patch("/send", async (req, res) => {
  try{
    const ids = Array.isArray(req.body.ids)
      ? req.body.ids.map(objectId).filter(Boolean)
      : [];

    if(!ids.length){
      return res.status(400).json({
        success: false,
        message: "No trips selected"
      });
    }

    const assignments = await DispatchAssignment.find({
      tripId: {$in: ids}
    }).lean();

    const assignedTripIds = new Set(
      assignments
        .filter(assignment => assignment.driverId)
        .map(assignment => String(assignment.tripId))
    );

    const missing = ids
      .map(String)
      .filter(tripId => !assignedTripIds.has(tripId));

    if(missing.length){
      return res.status(400).json({
        success: false,
        message: "Assign a driver to every selected trip before sending",
        missing
      });
    }

    await DispatchAssignment.updateMany(
      {tripId: {$in: ids}},
      {$set: {
        dispatchStatus: "SENT",
        sentAt: new Date()
      }}
    );

    res.json({
      success: true,
      sentCount: ids.length
    });
  }catch(error){
    console.error("SEND TRIPS:", error);
    res.status(500).json({
      success: false,
      message: "Send failed"
    });
  }
});

router.patch("/:tripId/selection", async (req, res) => {
  try{
    const tripId = objectId(req.params.tripId);

    if(!tripId){
      return res.status(400).json({
        success: false,
        message: "Invalid trip id"
      });
    }

    if(typeof req.body.dispatchSelected !== "boolean"){
      return res.status(400).json({
        success: false,
        message: "dispatchSelected must be true or false"
      });
    }

    const Trip = TripModel();
    const dispatchSelected = req.body.dispatchSelected;
    const trip = await Trip.findByIdAndUpdate(
      tripId,
      {$set: {dispatchSelected}},
      {new: true, runValidators: true}
    ).lean();

    if(!trip){
      return res.status(404).json({
        success: false,
        message: "Trip not found"
      });
    }

    if(!dispatchSelected){
      await DispatchAssignment.deleteOne({
        tripId,
        dispatchStatus: {$in: ["UNASSIGNED", "ASSIGNED"]}
      });
    }

    let autoAssignment = null;

    if(dispatchSelected){
      autoAssignment = await autoAssignTripById(
        trip._id,
        req.user?._id ? String(req.user._id) : "SYSTEM_SELECTION"
      );
    }

    res.json({
      success: true,
      tripId: String(trip._id),
      dispatchSelected: trip.dispatchSelected === true,
      autoAssignment
    });
  }catch(error){
    console.error("SAVE DISPATCH SELECT:", error);
    res.status(500).json({
      success: false,
      message: "Dispatch selection save failed"
    });
  }
});

router.patch("/:tripId/driver", async (req, res) => {
  try{
    const tripId = objectId(req.params.tripId);
    const driverId = objectId(req.body.driverId);

    if(!tripId){
      return res.status(400).json({
        success: false,
        message: "Invalid trip id"
      });
    }

    const Trip = TripModel();
    const trip = await Trip.findOne({
      _id: tripId,
      dispatchSelected: true,
      disabled: false
    }).lean();

    if(!trip){
      return res.status(404).json({
        success: false,
        message: "Trip not found"
      });
    }

    if(!driverId){
      const assignment = await DispatchAssignment.findOneAndUpdate(
        {tripId},
        {$set: {
          driverId: null,
          driverName: "",
          driverPhone: "",
          vehicleNumber: "",
          driverAddress: "",
          services: [],
          dispatchStatus: "UNASSIGNED",
          assignmentType: "MANUAL",
          smartScore: null,
          smartReason: "",
          smartDistance: null,
          assignedAt: null
        }},
        {upsert: true, new: true}
      );

      return res.json({
        success: true,
        assignment
      });
    }

    /*
      Manual Assign intentionally allows every active driver.
      Service, schedule and smart-score filters belong to Auto Assign.
    */
    const driver = await User.findOne({
      _id: driverId,
      ...driverUserFilter()
    }).lean();

    if(!driver){
      return res.status(404).json({
        success: false,
        message: "Active driver not found"
      });
    }

    const row = await DriverSchedule.findOne({driverId}).lean();
    const assignment = await DispatchAssignment.findOneAndUpdate(
      {tripId},
      {$set: {
        tripId,
        driverId,
        driverName: driver.name || driver.fullName || "",
        driverPhone: row?.phone || driver.phone || "",
        vehicleNumber: row?.vehicleNumber || "",
        driverAddress: row?.address || "",
        services: driverServices(row),
        dispatchStatus: "ASSIGNED",
        assignedBy: req.user?._id
          ? String(req.user._id)
          : "DISPATCH",
        assignmentType: "MANUAL",
        smartScore: null,
        smartReason: "Manual Override",
        smartDistance: null,
        assignedAt: new Date()
      }},
      {upsert: true, new: true}
    );

    res.json({
      success: true,
      assignment
    });
  }catch(error){
    console.error("ASSIGN DRIVER:", error);
    res.status(500).json({
      success: false,
      message: "Assign failed"
    });
  }
});

router.patch("/:tripId/note", async (req, res) => {
  try{
    const tripId = objectId(req.params.tripId);

    if(!tripId){
      return res.status(400).json({
        success: false,
        message: "Invalid trip id"
      });
    }

    await DispatchAssignment.findOneAndUpdate(
      {tripId},
      {$set: {note: clean(req.body.note)}},
      {upsert: true, new: true}
    );

    res.json({success: true});
  }catch(error){
    console.error("SAVE DISPATCH NOTE:", error);
    res.status(500).json({
      success: false,
      message: "Note save failed"
    });
  }
});

router.autoAssignTripById = autoAssignTripById;
router.autoAssignTripGroupByIds = autoAssignTripGroupByIds;

module.exports = router;