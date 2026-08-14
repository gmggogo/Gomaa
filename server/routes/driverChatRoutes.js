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

  return (
    req.user?._id ||
    req.user?.id ||
    req.user?.driverId ||
    req.driver?._id ||
    req.driver?.id ||
    req.driver?.driverId ||
    req.body?.driverId ||
    req.query?.driverId ||
    null
  );
}

function getSenderRole(req){

  const raw = clean(
    req.user?.role ||
    req.driver?.role ||
    req.body?.senderType ||
    req.body?.senderRole ||
    "DRIVER"
  ).toUpperCase();

  if(raw === "ADMIN" || raw === "DISPATCH"){
    return "DISPATCH";
  }

  return "DRIVER";
}

/* =========================
   GET DRIVER CHAT MESSAGES
   GET /api/driver-chat/messages
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
        driverId:driverId
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
      req.user?.name ||
      req.user?.fullName ||
      req.driver?.name ||
      req.driver?.fullName ||
      req.body?.senderName ||
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
   MARK DRIVER CHAT READ
   PATCH /api/driver-chat/read
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

    const result = await DriverChat.updateMany(
      {
        driverId,
        senderType:"DISPATCH",
        readByDriver:false
      },
      {
        $set:{
          readByDriver:true
        }
      }
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