const express = require("express");
const router = express.Router();

const DriverChat = require("../models/DriverChat");

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function escapeRegex(v){
  return clean(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function getDriverId(req){

  return clean(
    req.user?._id ||
    req.user?.id ||
    req.user?.driverId ||
    req.driver?._id ||
    req.driver?.id ||
    req.driver?.driverId ||
    req.body?.driverId ||
    req.query?.driverId ||
    ""
  );
}

function getSenderRole(req){

  const raw = clean(
    req.body?.senderType ||
    req.body?.senderRole ||
    req.user?.role ||
    req.driver?.role ||
    "DRIVER"
  ).toUpperCase();

  if(
    raw === "ADMIN" ||
    raw === "DISPATCH" ||
    raw === "DISPATCHER"
  ){
    return "DISPATCH";
  }

  return "DRIVER";
}

function getUserModel(){

  if(global.User){
    return global.User;
  }

  try{
    const mongoose = require("mongoose");
    return mongoose.model("User");
  }catch{
    return null;
  }
}

function getFreshLiveRows(){

  const liveMap =
    global.liveDrivers instanceof Map
      ? global.liveDrivers
      : new Map();

  const now = Date.now();
  const maxAge = 1000 * 60 * 5;

  const out = [];

  for(const [mapKey,row] of liveMap.entries()){

    const timeValue =
      Number(
        row?.time ||
        row?.updatedAt ||
        row?.lastSeen ||
        0
      );

    if(
      timeValue &&
      now - timeValue > maxAge
    ){
      continue;
    }

    out.push({
      mapKey:clean(mapKey),
      driverId:clean(
        row?.driverId ||
        row?.userId ||
        row?._id ||
        row?.id ||
        ""
      ),
      name:clean(
        row?.name ||
        row?.driverName ||
        ""
      ),
      lat:row?.lat ?? null,
      lng:row?.lng ?? null,
      time:timeValue || 0
    });
  }

  return out;
}

/* =========================
   GET MESSAGES
========================= */

router.get("/messages", async (req,res) => {

  try{

    const driverId = getDriverId(req);

    if(!driverId){
      return res.status(400).json({
        ok:false,
        message:"Driver ID is required."
      });
    }

    const messages = await DriverChat
      .find({ driverId })
      .sort({ createdAt:1 })
      .lean();

    return res.json({
      ok:true,
      messages
    });

  }catch(error){

    console.error(
      "DRIVER CHAT GET ERROR:",
      error
    );

    return res.status(500).json({
      ok:false,
      message:"Unable to load chat messages."
    });

  }

});

/* =========================
   SEND MESSAGE
========================= */

router.post("/messages", async (req,res) => {

  try{

    const driverId = getDriverId(req);
    const text = clean(req.body?.text);
    const senderType = getSenderRole(req);

    if(!driverId){
      return res.status(400).json({
        ok:false,
        message:"Driver ID is required."
      });
    }

    if(!text){
      return res.status(400).json({
        ok:false,
        message:"Message text is required."
      });
    }

    if(text.length > 2000){
      return res.status(400).json({
        ok:false,
        message:"Message is too long."
      });
    }

    const senderName = clean(
      req.body?.senderName ||
      req.user?.name ||
      req.user?.fullName ||
      req.driver?.name ||
      req.driver?.fullName ||
      (
        senderType === "DISPATCH"
          ? "Dispatch"
          : "Driver"
      )
    );

    const message = await DriverChat.create({
      driverId,
      senderType,
      senderName,
      text,

      readByDriver:
        senderType === "DRIVER",

      readByDispatch:
        senderType === "DISPATCH"
    });

    return res.status(201).json({
      ok:true,
      message
    });

  }catch(error){

    console.error(
      "DRIVER CHAT POST ERROR:",
      error
    );

    return res.status(500).json({
      ok:false,
      message:"Unable to send chat message."
    });

  }

});

/* =========================
   ADMIN ONLINE DRIVERS

   IMPORTANT:
   Driver location can be stored using:
   - driverId
   OR
   - driver name as fallback

   So this endpoint matches BOTH.
========================= */

router.get("/admin/online-drivers", async (req,res) => {

  try{

    const User = getUserModel();

    if(!User){
      return res.status(500).json({
        ok:false,
        message:"User model is not ready."
      });
    }

    const liveRows =
      getFreshLiveRows();

    if(!liveRows.length){
      return res.json({
        ok:true,
        drivers:[]
      });
    }

    const idSet = new Set();
    const nameSet = new Set();

    liveRows.forEach(row=>{

      if(row.driverId){
        idSet.add(row.driverId);
      }

      if(row.name){
        nameSet.add(row.name);
      }

      /*
        Some older location rows use the Map key
        as driver name when driverId is missing.
      */
      if(
        !row.driverId &&
        row.mapKey
      ){
        nameSet.add(row.mapKey);
      }

    });

    const orFilters = [];

    const ids =
      Array.from(idSet);

    const names =
      Array.from(nameSet);

    if(ids.length){

      const mongoose =
        require("mongoose");

      const validIds =
        ids.filter(id=>
          mongoose.Types.ObjectId.isValid(id)
        );

      if(validIds.length){
        orFilters.push({
          _id:{
            $in:validIds
          }
        });
      }
    }

    if(names.length){

      orFilters.push({
        name:{
          $in:names.map(name=>
            new RegExp(
              "^" +
              escapeRegex(name) +
              "$",
              "i"
            )
          )
        }
      });

      orFilters.push({
        username:{
          $in:names.map(name=>
            new RegExp(
              "^" +
              escapeRegex(name) +
              "$",
              "i"
            )
          )
        }
      });
    }

    if(!orFilters.length){
      return res.json({
        ok:true,
        drivers:[]
      });
    }

    const drivers = await User
      .find({
        role:"driver",
        active:{
          $ne:false
        },
        $or:orFilters
      })
      .select(
        "_id name fullName username email phone vehicleNumber active"
      )
      .sort({
        name:1
      })
      .lean();

    const liveById = new Map();
    const liveByName = new Map();

    liveRows.forEach(row=>{

      if(row.driverId){
        liveById.set(
          String(row.driverId),
          row
        );
      }

      if(row.name){
        liveByName.set(
          row.name.toLowerCase(),
          row
        );
      }

      if(row.mapKey){
        liveByName.set(
          row.mapKey.toLowerCase(),
          row
        );
      }

    });

    const result =
      drivers.map(driver=>{

        const id =
          String(driver._id);

        const name =
          clean(
            driver.name ||
            driver.fullName ||
            driver.username
          );

        const live =
          liveById.get(id) ||
          liveByName.get(
            name.toLowerCase()
          ) ||
          null;

        return {
          ...driver,
          online:true,
          liveLat:
            live?.lat ?? null,
          liveLng:
            live?.lng ?? null,
          liveTime:
            live?.time || 0
        };
      });

    return res.json({
      ok:true,
      drivers:result
    });

  }catch(error){

    console.error(
      "ADMIN CHAT ONLINE DRIVERS ERROR:",
      error
    );

    return res.status(500).json({
      ok:false,
      message:"Unable to load online drivers."
    });

  }

});

/* =========================
   ADMIN UNREAD
========================= */

router.get("/admin/unread", async (req,res) => {

  try{

    const rows = await DriverChat.aggregate([
      {
        $match:{
          senderType:"DRIVER",
          readByDispatch:false
        }
      },
      {
        $group:{
          _id:"$driverId",
          count:{
            $sum:1
          }
        }
      }
    ]);

    const byDriver = {};
    let totalUnread = 0;

    rows.forEach(row=>{

      const id =
        clean(row?._id);

      const count =
        Number(row?.count || 0);

      if(!id){
        return;
      }

      byDriver[id] = count;
      totalUnread += count;
    });

    return res.json({
      ok:true,
      totalUnread,
      byDriver
    });

  }catch(error){

    console.error(
      "ADMIN CHAT UNREAD ERROR:",
      error
    );

    return res.status(500).json({
      ok:false,
      message:"Unable to load unread messages."
    });

  }

});

/* =========================
   MARK READ
========================= */

router.patch("/read", async (req,res) => {

  try{

    const driverId = getDriverId(req);

    if(!driverId){
      return res.status(400).json({
        ok:false,
        message:"Driver ID is required."
      });
    }

    const reader =
      clean(req.body?.reader)
      .toUpperCase();

    let filter = {
      driverId
    };

    let update = {};

    if(reader === "DISPATCH"){

      filter.senderType = "DRIVER";
      filter.readByDispatch = false;

      update = {
        $set:{
          readByDispatch:true
        }
      };

    }else{

      filter.senderType = "DISPATCH";
      filter.readByDriver = false;

      update = {
        $set:{
          readByDriver:true
        }
      };

    }

    const result =
      await DriverChat.updateMany(
        filter,
        update
      );

    return res.json({
      ok:true,
      modifiedCount:
        result.modifiedCount ??
        result.nModified ??
        0
    });

  }catch(error){

    console.error(
      "DRIVER CHAT READ ERROR:",
      error
    );

    return res.status(500).json({
      ok:false,
      message:"Unable to update chat read status."
    });

  }

});

module.exports = router;