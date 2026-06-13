const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");

const Trip = mongoose.models.Trip;
const User = require("../models/User");
const DriverSchedule = require("../models/DriverSchedule");
const DispatchAssignment = require("../models/DispatchAssignment");

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

    const assignments =
      await DispatchAssignment
      .find({})
      .lean();

    const drivers =
      await User.find({
        role:"driver",
        active:true
      })
      .sort({ name:1 })
      .lean();

    const scheduleRows =
      await DriverSchedule
      .find({})
      .lean();

    const schedule = {};

    scheduleRows.forEach(row=>{

      schedule[row.driverId] = {

        phone:row.phone || "",
        address:row.address || "",
        lat:row.lat ?? null,
        lng:row.lng ?? null,
        vehicleNumber:
          row.vehicleNumber || "",

        enabled:
          row.enabled !== false,

        days:
          row.days || {},

        services:
          Array.isArray(row.services)
            ? row.services
            : ["ALL"]

      };

    });

    const finalTrips =
      trips.map(trip=>{

        const a =
          assignments.find(x=>
            String(x.tripId) ===
            String(trip._id)
          );

        return {

          ...trip,

          driverId:
            a?.driverId || "",

          driverName:
            a?.driverName || "",

          vehicle:
            a?.vehicleNumber || "",

          driverAddress:
            a?.driverAddress || "",

          dispatchStatus:
            a?.dispatchStatus ||
            "UNASSIGNED"

        };

      });

    res.json({
      trips:finalTrips,
      drivers,
      schedule
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
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
      String(req.params.tripId || "");

    const driverId =
      String(req.body.driverId || "");

    const driver =
      await User.findById(driverId);

    if(!driver){

      return res.status(404).json({
        success:false,
        message:"Driver not found"
      });

    }

    const schedule =
      await DriverSchedule.findOne({
        driverId
      }).lean();

    const assignment =
      await DispatchAssignment
      .findOneAndUpdate(

        {
          tripId
        },

        {
          $set:{

            tripId,

            driverId,

            driverName:
              driver.name ||
              driver.fullName ||
              "",

            vehicleNumber:
              schedule?.vehicleNumber ||
              "",

            driverAddress:
              schedule?.address ||
              "",

            dispatchStatus:
              "ASSIGNED"

          }
        },

        {
          upsert:true,
          new:true
        }

      );

    res.json({
      success:true,
      assignment
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      success:false,
      message:"Assign failed"
    });

  }

});

/* =========================
   SAVE NOTE
========================= */

router.patch("/:tripId/note", async (req,res)=>{

  try{

    const tripId =
      String(req.params.tripId);

    const note =
      String(req.body.note || "");

    await DispatchAssignment
      .findOneAndUpdate(

        {
          tripId
        },

        {
          $set:{
            note
          }
        },

        {
          upsert:true
        }

      );

    res.json({
      success:true
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      success:false
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

    if(!ids.length){

      return res.status(400).json({
        success:false,
        message:"No trips selected"
      });

    }

    await DispatchAssignment.updateMany(

      {
        tripId:{
          $in:ids
        }
      },

      {
        dispatchStatus:"SENT",
        sentAt:new Date()
      }

    );

    res.json({
      success:true
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      success:false
    });

  }

});

module.exports = router;