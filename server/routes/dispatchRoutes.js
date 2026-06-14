const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");

const Trip =
  mongoose.models.Trip ||
  mongoose.model("Trip");

const User = require("../models/User");
const DriverSchedule = require("../models/DriverSchedule");
const DispatchAssignment = require("../models/DispatchAssignment");
/* =========================
   HELPERS
========================= */

function isValidObjectId(id){
  return mongoose.Types.ObjectId.isValid(String(id || ""));
}

function toObjectId(id){
  return new mongoose.Types.ObjectId(String(id));
}

function clean(v){
  return String(v ?? "").trim();
}

function getTripServiceCode(trip){
  return (
    trip.serviceKey ||
    trip.serviceCode ||
    trip.serviceType ||
    trip.serviceSuffix ||
    trip.vehicle ||
    ""
  );
}

function getTripNumber(trip){
  return (
    trip.tripNumber ||
    trip.bookingNumber ||
    String(trip._id)
  );
}

function normalizeSchedule(row){
  return {
    phone:row.phone || "",
    address:row.address || "",
    lat:row.lat ?? null,
    lng:row.lng ?? null,
    vehicleNumber:row.vehicleNumber || "",
    enabled:row.enabled !== false,
    days:row.days || row.weekly || {},
    services:Array.isArray(row.services) && row.services.length
      ? row.services
      : ["ALL"]
  };
}

/* =========================
   GET DISPATCH
========================= */

router.get("/", async (req,res)=>{

  try{

    const trips =
      await Trip.find({
        dispatchSelected:true,
        disabled:false
      })
      .sort({
        tripDate:1,
        tripTime:1,
        createdAt:1
      })
      .lean();

    const tripIds =
      trips.map(t=>t._id);

    const assignments =
      await DispatchAssignment
      .find({
        tripId:{
          $in:tripIds
        }
      })
      .lean();

    const assignmentMap =
      new Map(
        assignments.map(a=>[
          String(a.tripId),
          a
        ])
      );

    const drivers =
      await User.find({
        role:"driver",
        enabled:true
      })
      .sort({ name:1 })
      .lean();

    const scheduleRows =
      await DriverSchedule
      .find({})
      .lean();

    const schedule = {};

    scheduleRows.forEach(row=>{

      const id =
        String(row.driverId || "");

      if(!id) return;

      schedule[id] =
        normalizeSchedule(row);

    });

    const finalTrips =
      trips.map(trip=>{

        const a =
          assignmentMap.get(
            String(trip._id)
          );

        return {
          ...trip,

          driverId:
            a?.driverId
              ? String(a.driverId)
              : "",

          driverName:
            a?.driverName || "",

          vehicle:
            a?.vehicleNumber || "",

          vehicleNumber:
            a?.vehicleNumber || "",

          driverAddress:
            a?.driverAddress || "",

          driverPhone:
            a?.driverPhone || "",

          dispatchStatus:
            a?.dispatchStatus ||
            "UNASSIGNED",

          smartScore:
            a?.smartScore || "",

          smartReason:
            a?.smartReason || "",

          smartDistance:
            a?.smartDistance || "",

          assignmentType:
            a?.assignmentType || "",

          assignedAt:
            a?.assignedAt || null,

          sentAt:
            a?.sentAt || null,

          dispatchNote:
            a?.note || ""
        };

      });

    return res.json({
      trips:finalTrips,
      drivers,
      schedule
    });

  }catch(err){

    console.log("DISPATCH LOAD ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Dispatch load error"
    });

  }

});

/* =========================
   ASSIGN DRIVER
========================= */

router.patch("/:tripId/driver", async (req,res)=>{

  try{

    const tripId =
      clean(req.params.tripId);

    const driverId =
      clean(req.body.driverId);

    if(!isValidObjectId(tripId)){

      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });

    }

    const tripObjectId =
      toObjectId(tripId);

    const trip =
      await Trip.findById(tripObjectId)
      .lean();

    if(!trip){

      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });

    }

    if(!driverId){

      await DispatchAssignment
      .findOneAndDelete({
        tripId:tripObjectId
      });

      return res.json({
        success:true,
        message:"Assignment removed"
      });

    }

    if(!isValidObjectId(driverId)){

      return res.status(400).json({
        success:false,
        message:"Invalid driver id"
      });

    }

    const driverObjectId =
      toObjectId(driverId);

    const driver =
      await User.findOne({
        _id:driverObjectId,
        role:"driver",
        enabled:true
      })
      .lean();

    if(!driver){

      return res.status(404).json({
        success:false,
        message:"Driver not found"
      });

    }

    const schedule =
      await DriverSchedule
      .findOne({
        driverId:driverObjectId
      })
      .lean();

    const assignment =
      await DispatchAssignment
      .findOneAndUpdate(

        {
          tripId:tripObjectId
        },

        {
          $set:{

            tripId:tripObjectId,

            tripNumber:
              getTripNumber(trip),

            serviceCode:
              getTripServiceCode(trip),

            driverId:
              driverObjectId,

            driverName:
              driver.name ||
              driver.fullName ||
              "",

            vehicleNumber:
              schedule?.vehicleNumber ||
              driver.vehicleNumber ||
              "",

            driverAddress:
              schedule?.address ||
              driver.address ||
              "",

            driverPhone:
              schedule?.phone ||
              driver.phone ||
              "",

            services:
              Array.isArray(schedule?.services)
                ? schedule.services
                : ["ALL"],

            dispatchStatus:
              "ASSIGNED",

            assignmentType:
              req.body.manual === true
                ? "MANUAL"
                : "AUTO",

            assignedBy:
              req.body.assignedBy ||
              "SYSTEM",

            smartScore:
              Number(req.body.smartScore || 0),

            smartReason:
              req.body.smartReason || "",

            smartDistance:
              Number(req.body.smartDistance || 0),

            assignedAt:
              new Date()

          }
        },

        {
          upsert:true,
          new:true,
          setDefaultsOnInsert:true
        }

      )
      .lean();

    return res.json({
      success:true,
      message:"Driver assigned",
      assignment
    });

  }catch(err){

    console.log("ASSIGN DRIVER ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Assign failed"
    });

  }

});

/* =========================
   REMOVE DRIVER
========================= */

router.delete("/:tripId/driver", async (req,res)=>{

  try{

    const tripId =
      clean(req.params.tripId);

    if(!isValidObjectId(tripId)){

      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });

    }

    await DispatchAssignment
    .findOneAndDelete({
      tripId:toObjectId(tripId)
    });

    return res.json({
      success:true,
      message:"Assignment removed"
    });

  }catch(err){

    console.log("REMOVE DRIVER ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Remove failed"
    });

  }

});

/* =========================
   SAVE NOTE
========================= */

router.patch("/:tripId/note", async (req,res)=>{

  try{

    const tripId =
      clean(req.params.tripId);

    const note =
      clean(req.body.note);

    if(!isValidObjectId(tripId)){

      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });

    }

    const tripObjectId =
      toObjectId(tripId);

    const trip =
      await Trip.findById(tripObjectId)
      .lean();

    if(!trip){

      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });

    }

    const assignment =
      await DispatchAssignment
      .findOneAndUpdate(

        {
          tripId:tripObjectId
        },

        {
          $set:{
            tripId:tripObjectId,
            tripNumber:getTripNumber(trip),
            serviceCode:getTripServiceCode(trip),
            note
          }
        },

        {
          upsert:true,
          new:true,
          setDefaultsOnInsert:true
        }

      )
      .lean();

    return res.json({
      success:true,
      assignment
    });

  }catch(err){

    console.log("SAVE NOTE ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Note save failed"
    });

  }

});

/* =========================
   SEND TRIPS
========================= */

router.patch("/send", async (req,res)=>{

  try{

    const ids =
      Array.isArray(req.body.ids)
        ? req.body.ids
        : [];

    const objectIds =
      ids
      .filter(isValidObjectId)
      .map(toObjectId);

    if(!objectIds.length){

      return res.status(400).json({
        success:false,
        message:"No valid trips selected"
      });

    }

    const assignments =
      await DispatchAssignment
      .find({
        tripId:{
          $in:objectIds
        },
        driverId:{
          $ne:null
        }
      })
      .lean();

    const assignedMap =
      new Map(
        assignments.map(a=>[
          String(a.tripId),
          a
        ])
      );

    const missing =
      objectIds.filter(id=>
        !assignedMap.has(String(id))
      );

    if(missing.length){

      return res.status(400).json({
        success:false,
        message:"Some trips have no driver"
      });

    }

    await DispatchAssignment
    .updateMany(

      {
        tripId:{
          $in:objectIds
        }
      },

      {
        $set:{
          dispatchStatus:"SENT",
          sentAt:new Date()
        }
      }

    );

    await Trip.updateMany(

      {
        _id:{
          $in:objectIds
        }
      },

      {
        $set:{
          status:"Dispatched",
          dispatchSelected:false
        }
      }

    );

    return res.json({
      success:true,
      message:"Trips sent"
    });

  }catch(err){

    console.log("SEND TRIPS ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Send failed"
    });

  }

});

/* =========================
   UPDATE DISPATCH STATUS
========================= */

router.patch("/:tripId/status", async (req,res)=>{

  try{

    const tripId =
      clean(req.params.tripId);

    const dispatchStatus =
      clean(req.body.dispatchStatus).toUpperCase();

    const allowed = [
      "UNASSIGNED",
      "ASSIGNED",
      "SENT",
      "ACCEPTED",
      "ON_TRIP",
      "COMPLETED",
      "CANCELLED"
    ];

    if(!isValidObjectId(tripId)){

      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });

    }

    if(!allowed.includes(dispatchStatus)){

      return res.status(400).json({
        success:false,
        message:"Invalid dispatch status"
      });

    }

    const update = {
      dispatchStatus
    };

    if(dispatchStatus === "ACCEPTED")
      update.acceptedAt = new Date();

    if(dispatchStatus === "ON_TRIP")
      update.startedAt = new Date();

    if(dispatchStatus === "COMPLETED")
      update.completedAt = new Date();

    const assignment =
      await DispatchAssignment
      .findOneAndUpdate(

        {
          tripId:toObjectId(tripId)
        },

        {
          $set:update
        },

        {
          new:true
        }

      )
      .lean();

    if(!assignment){

      return res.status(404).json({
        success:false,
        message:"Assignment not found"
      });

    }

    return res.json({
      success:true,
      assignment
    });

  }catch(err){

    console.log("STATUS UPDATE ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Status update failed"
    });

  }

});

module.exports = router;