const express = require("express");
const router = express.Router();

const DriverChat = require("../models/DriverChat");

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
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

function liveDriverId(row){

  return clean(
    row?.driverId ||
    row?.userId ||
    row?._id ||
    row?.id ||
    ""
  );
}

/* =========================
   GET DRIVER CHAT MESSAGES
   GET /api/driver-chat/messages?driverId=...
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
      .find({
        driverId
      })
      .sort({
        createdAt:1
      })
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
   POST /api/driver-chat/messages
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

      /*
        Sender has already "read" their own message.
        Receiver stays unread until that side opens the conversation.
      */
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
   ADMIN: ONLINE DRIVERS
   GET /api/driver-chat/admin/online-drivers
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

    const now = Date.now();
    const maxAge = 1000 * 60 * 5;

    const liveMap =
      global.liveDrivers instanceof Map
        ? global.liveDrivers
        : new Map();

    const liveIds = new Set();
    const liveById = new Map();

    for(const row of liveMap.values()){

      const id = clean(
        row?.driverId ||
        row?._id ||
        row?.id ||
        ""
      );

      if(!id){
        continue;
      }

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

      liveIds.add(id);
      liveById.set(id,row);
    }

    /*
      IMPORTANT:
      Do not hide a driver who has unread messages just because
      live-location tracking did not return them.
      The unread badge already proves the chat exists.
    */
    const unreadRows =
      await DriverChat.aggregate([
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

    const unreadById = {};
    const wantedIds = new Set(liveIds);

    unreadRows.forEach(row=>{

      const id = clean(row?._id);

      if(!id){
        return;
      }

      unreadById[id] =
        Number(row?.count || 0);

      wantedIds.add(id);
    });

    const ids =
      Array.from(wantedIds);

    if(!ids.length){
      return res.json({
        ok:true,
        drivers:[]
      });
    }

    const validObjectIds =
      ids.filter(id=>
        require("mongoose")
          .Types
          .ObjectId
          .isValid(id)
      );

    const users =
      validObjectIds.length
        ? await User
            .find({
              _id:{
                $in:validObjectIds
              },
              role:"driver",
              active:{
                $ne:false
              }
            })
            .select(
              "_id name username email phone vehicleNumber active"
            )
            .lean()
        : [];

    const userMap =
      new Map(
        users.map(user=>[
          String(user._id),
          user
        ])
      );

    const drivers =
      ids.map(id=>{

        const user =
          userMap.get(id) ||
          {};

        const live =
          liveById.get(id) ||
          {};

        return {
          _id:id,
          driverId:id,

          name:
            clean(
              user?.name ||
              live?.name ||
              live?.driverName ||
              "Driver"
            ),

          username:
            clean(user?.username),

          email:
            clean(user?.email),

          phone:
            clean(user?.phone),

          vehicleNumber:
            clean(user?.vehicleNumber),

          online:
            liveIds.has(id),

          unread:
            Number(
              unreadById[id] || 0
            )
        };
      })
      .sort((a,b)=>{

        if(a.unread !== b.unread){
          return b.unread - a.unread;
        }

        if(a.online !== b.online){
          return a.online ? -1 : 1;
        }

        return String(a.name)
          .localeCompare(
            String(b.name)
          );
      });

    return res.json({
      ok:true,
      drivers
    });

  }catch(error){

    console.error(
      "ADMIN CHAT ONLINE DRIVERS ERROR:",
      error
    );

    return res.status(500).json({
      ok:false,
      message:"Unable to load chat drivers."
    });

  }

});

/* =========================
   ADMIN: UNREAD COUNTERS
   GET /api/driver-chat/admin/unread
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
   MARK CHAT READ
   PATCH /api/driver-chat/read
   body: { driverId, reader:"DISPATCH" | "DRIVER" }
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