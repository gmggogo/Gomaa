const express = require("express");
const router = express.Router();

const DriverSchedule =
require("../models/DriverSchedule");

/* =========================
   DEFAULT WEEKLY
========================= */

function defaultWeekly(){

  return {
    sun:false,
    mon:false,
    tue:false,
    wed:false,
    thu:false,
    fri:false,
    sat:false
  };

}

/* =========================
   GET ALL SCHEDULE
========================= */

router.get("/", async (req,res)=>{

  try{

    const items =
      await DriverSchedule.find({}).lean();

    const result = {};

    items.forEach(item=>{

      result[item.driverId] = {

        phone:item.phone || "",

        address:item.address || "",

        lat:item.lat ?? null,

        lng:item.lng ?? null,

        vehicleNumber:
          item.vehicleNumber || "",

        enabled:
          item.enabled === true,

        weekly:
          item.weekly || defaultWeekly(),

        services:
          Array.isArray(item.services)
          ? item.services
          : ["ALL"]

      };

    });

    return res.json(result);

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Load Driver Schedule"
    });

  }

});

/* =========================
   SAVE SCHEDULE
========================= */

router.post("/", async (req,res)=>{

  try{

    const payload =
      req.body || {};

    for(const driverId in payload){

      const data =
        payload[driverId] || {};

      await DriverSchedule.findOneAndUpdate(

        {
          driverId
        },

        {
          $set:{

            phone:
              data.phone || "",

            address:
              data.address || "",

            lat:
              data.lat ?? null,

            lng:
              data.lng ?? null,

            vehicleNumber:
              data.vehicleNumber || "",

            enabled:
              data.enabled === true,

            weekly:
              data.weekly ||
              defaultWeekly(),

            services:
              Array.isArray(data.services)
              ? data.services
              : ["ALL"]

          }
        },

        {
          upsert:true,
          new:true,
          setDefaultsOnInsert:true
        }

      );

    }

    return res.json({
      success:true
    });

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Save Driver Schedule"
    });

  }

});

module.exports = router;