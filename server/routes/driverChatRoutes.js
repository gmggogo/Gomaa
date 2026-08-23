const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();

const DriverChat =
  require("../models/DriverChat");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function upper(v){
  return clean(v).toUpperCase();
}

function readToken(req){

  const auth =
    clean(
      req.headers?.authorization
    );

  if(
    auth
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return auth.slice(7).trim();
  }

  return clean(
    req.headers?.["x-access-token"]
  );
}

function auth(req,res,next){

  const token =
    readToken(req);

  if(!token){

    return res.status(401).json({
      ok:false,
      message:"Access Denied"
    });
  }

  try{

    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.chatUser = {
      id:
        clean(
          decoded.id
        ),

      role:
        upper(
          decoded.role
        ),

      tenantId:
        clean(
          decoded.tenantId
        )
    };

    if(
      req.chatUser.role !==
      "PLATFORM_ADMIN" &&
      !req.chatUser.tenantId
    ){

      return res.status(403).json({
        ok:false,
        message:"Tenant Required"
      });
    }

    next();

  }catch(err){

    return res.status(401).json({
      ok:false,
      message:"Invalid Token"
    });
  }
}

function UserModel(){

  return (
    global.User ||
    mongoose.models.User ||
    null
  );
}

function getRequestedDriverId(req){

  return clean(
    req.body?.driverId ||
    req.query?.driverId ||
    req.params?.driverId ||
    ""
  );
}

async function getDriverForRequest(
  req,
  driverId
){

  const User =
    UserModel();

  if(!User){
    return null;
  }

  if(
    !mongoose.Types.ObjectId
      .isValid(driverId)
  ){
    return null;
  }

  const filter = {
    _id:driverId,
    role:"driver"
  };

  if(
    req.chatUser.role !==
    "PLATFORM_ADMIN"
  ){
    filter.tenantId =
      req.chatUser.tenantId;
  }

  return await User
    .findOne(filter)
    .select(
      "_id tenantId name username email phone vehicleNumber active enabled"
    )
    .lean();
}

async function assertDriverAccess(
  req,
  res
){

  let driverId =
    getRequestedDriverId(req);

  if(
    req.chatUser.role ===
    "DRIVER"
  ){

    driverId =
      clean(
        req.chatUser.id
      );
  }

  if(!driverId){

    res.status(400).json({
      ok:false,
      message:"Driver ID is required."
    });

    return null;
  }

  if(
    req.chatUser.role ===
    "DRIVER" &&
    driverId !==
    clean(req.chatUser.id)
  ){

    res.status(403).json({
      ok:false,
      message:"Driver access denied."
    });

    return null;
  }

  const driver =
    await getDriverForRequest(
      req,
      driverId
    );

  if(!driver){

    res.status(404).json({
      ok:false,
      message:"Driver not found."
    });

    return null;
  }

  return {
    driverId,
    driver
  };
}

function senderType(req){

  if(
    req.chatUser.role ===
    "DRIVER"
  ){
    return "DRIVER";
  }

  return "DISPATCH";
}

function liveId(row){

  return clean(
    row?.driverId ||
    row?.userId ||
    row?._id ||
    row?.id ||
    ""
  );
}

/* =========================
   GET MESSAGES
========================= */

router.get(
  "/messages",
  auth,
  async(req,res)=>{

    try{

      const access =
        await assertDriverAccess(
          req,
          res
        );

      if(!access){
        return;
      }

      const messages =
        await DriverChat
          .find({
            driverId:
              access.driverId
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
        message:
          "Unable to load chat messages."
      });
    }
  }
);

/* =========================
   SEND MESSAGE
========================= */

router.post(
  "/messages",
  auth,
  async(req,res)=>{

    try{

      const access =
        await assertDriverAccess(
          req,
          res
        );

      if(!access){
        return;
      }

      const text =
        clean(
          req.body?.text
        );

      if(!text){

        return res.status(400).json({
          ok:false,
          message:
            "Message text is required."
        });
      }

      if(text.length > 2000){

        return res.status(400).json({
          ok:false,
          message:
            "Message is too long."
        });
      }

      const type =
        senderType(req);

      const senderName =
        clean(
          req.body?.senderName
        ) ||
        (
          type === "DRIVER"
            ? clean(
                access.driver?.name
              )
            : clean(
                req.body?.senderName ||
                "Dispatch"
              )
        );

      const message =
        await DriverChat.create({
          driverId:
            access.driverId,

          senderType:
            type,

          senderName,

          text,

          readByDriver:
            type === "DRIVER",

          readByDispatch:
            type === "DISPATCH"
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
        message:
          "Unable to send chat message."
      });
    }
  }
);

/* =========================
   ADMIN DRIVER LIST

   IMPORTANT:
   Returns ALL active drivers for THIS tenant.
   Online status is shown separately.
   This prevents unread messages from becoming
   inaccessible just because live location is stale.
========================= */

router.get(
  "/admin/online-drivers",
  auth,
  async(req,res)=>{

    try{

      if(
        req.chatUser.role ===
        "DRIVER"
      ){

        return res.status(403).json({
          ok:false,
          message:"Staff only."
        });
      }

      const User =
        UserModel();

      if(!User){

        return res.status(500).json({
          ok:false,
          message:
            "User model is not ready."
        });
      }

      const filter = {
        role:"driver",
        active:{
          $ne:false
        },
        enabled:{
          $ne:false
        }
      };

      if(
        req.chatUser.role !==
        "PLATFORM_ADMIN"
      ){
        filter.tenantId =
          req.chatUser.tenantId;
      }

      const users =
        await User
          .find(filter)
          .select(
            "_id name username email phone vehicleNumber active enabled tenantId"
          )
          .sort({
            name:1
          })
          .lean();

      const now =
        Date.now();

      const maxAge =
        1000 * 60 * 5;

      const liveMap =
        global.liveDrivers instanceof Map
          ? global.liveDrivers
          : new Map();

      const liveById =
        new Map();

      for(
        const row
        of liveMap.values()
      ){

        const id =
          liveId(row);

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
          now - timeValue >
          maxAge
        ){
          continue;
        }

        liveById.set(
          id,
          row
        );
      }

      const driverIds =
        users.map(
          user=>
            String(user._id)
        );

      const unreadRows =
        driverIds.length
          ? await DriverChat.aggregate([
              {
                $match:{
                  driverId:{
                    $in:driverIds
                  },
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
            ])
          : [];

      const unreadById = {};

      unreadRows.forEach(
        row=>{

          unreadById[
            clean(row._id)
          ] =
            Number(
              row.count ||
              0
            );
        }
      );

      const drivers =
        users
          .map(
            user=>{

              const id =
                String(
                  user._id
                );

              return {
                _id:id,
                driverId:id,

                name:
                  clean(
                    user.name ||
                    user.username ||
                    "Driver"
                  ),

                username:
                  clean(
                    user.username
                  ),

                email:
                  clean(
                    user.email
                  ),

                phone:
                  clean(
                    user.phone
                  ),

                vehicleNumber:
                  clean(
                    user.vehicleNumber
                  ),

                online:
                  liveById.has(id),

                unread:
                  Number(
                    unreadById[id] ||
                    0
                  )
              };
            }
          )
          .sort(
            (a,b)=>{

              if(
                a.unread !==
                b.unread
              ){
                return (
                  b.unread -
                  a.unread
                );
              }

              if(
                a.online !==
                b.online
              ){
                return a.online
                  ? -1
                  : 1;
              }

              return a.name
                .localeCompare(
                  b.name
                );
            }
          );

      return res.json({
        ok:true,
        drivers
      });

    }catch(error){

      console.error(
        "ADMIN CHAT DRIVER LIST ERROR:",
        error
      );

      return res.status(500).json({
        ok:false,
        message:
          "Unable to load chat drivers."
      });
    }
  }
);

/* =========================
   ADMIN UNREAD
========================= */

router.get(
  "/admin/unread",
  auth,
  async(req,res)=>{

    try{

      if(
        req.chatUser.role ===
        "DRIVER"
      ){

        return res.status(403).json({
          ok:false,
          message:"Staff only."
        });
      }

      const User =
        UserModel();

      if(!User){

        return res.status(500).json({
          ok:false,
          message:
            "User model is not ready."
        });
      }

      const driverFilter = {
        role:"driver",
        active:{
          $ne:false
        },
        enabled:{
          $ne:false
        }
      };

      if(
        req.chatUser.role !==
        "PLATFORM_ADMIN"
      ){
        driverFilter.tenantId =
          req.chatUser.tenantId;
      }

      const drivers =
        await User
          .find(driverFilter)
          .select("_id")
          .lean();

      const ids =
        drivers.map(
          row=>
            String(row._id)
        );

      const rows =
        ids.length
          ? await DriverChat.aggregate([
              {
                $match:{
                  driverId:{
                    $in:ids
                  },
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
            ])
          : [];

      const byDriver = {};

      let totalUnread = 0;

      rows.forEach(
        row=>{

          const id =
            clean(
              row._id
            );

          const count =
            Number(
              row.count ||
              0
            );

          if(!id){
            return;
          }

          byDriver[id] =
            count;

          totalUnread +=
            count;
        }
      );

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
        message:
          "Unable to load unread messages."
      });
    }
  }
);

/* =========================
   MARK READ
========================= */

router.patch(
  "/read",
  auth,
  async(req,res)=>{

    try{

      const access =
        await assertDriverAccess(
          req,
          res
        );

      if(!access){
        return;
      }

      const reader =
        upper(
          req.body?.reader
        );

      let filter = {
        driverId:
          access.driverId
      };

      let update = {};

      if(
        reader === "DISPATCH"
      ){

        filter.senderType =
          "DRIVER";

        filter.readByDispatch =
          false;

        update = {
          $set:{
            readByDispatch:true
          }
        };

      }else{

        filter.senderType =
          "DISPATCH";

        filter.readByDriver =
          false;

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
        message:
          "Unable to update chat read status."
      });
    }
  }
);

module.exports = router;