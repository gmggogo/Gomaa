const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const LiveDriver = require("../models/LiveDriver");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
   TENANT AUTH
========================= */

function readBearerToken(req){

  const header =
    String(
      req.headers?.authorization ||
      ""
    ).trim();

  if(
    !header
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return header
    .slice(7)
    .trim();
}

function requireTenantApi(
  req,
  res,
  next
){

  const token =
    readBearerToken(req);

  if(!token){

    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const verified =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.authUser = {
      id:
        verified.id || null,

      role:
        verified.role || "",

      tenantId:
        verified.tenantId || null
    };

    if(
      req.authUser.role ===
      "PLATFORM_ADMIN"
    ){
      return next();
    }

    if(!req.authUser.tenantId){

      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

function tenantFilter(
  req,
  extra={}
){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){

    const requestedTenantId =
      String(
        req.query?.tenantId ||
        req.body?.tenantId ||
        ""
      ).trim();

    if(requestedTenantId){

      return {
        ...extra,
        tenantId:requestedTenantId
      };
    }

    return {
      ...extra
    };
  }

  return {
    ...extra,
    tenantId:
      req.authUser.tenantId
  };
}

function tenantIdForWrite(req){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){
    return String(
      req.body?.tenantId ||
      req.query?.tenantId ||
      ""
    ).trim();
  }

  return String(
    req.authUser?.tenantId ||
    ""
  ).trim();
}

/* =========================
   RECEIVE DRIVER LOCATION
   POST /api/driver/location
========================= */

router.post(
  "/",
  requireTenantApi,
  async (req, res) => {

    try {

      const {
        driverId,
        name,
        phone,
        vehicleNumber,
        lat,
        lng,
        tripId,
        routeMode
      } = req.body;

      if (
        !driverId ||
        lat === undefined ||
        lng === undefined
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Missing driverId / lat / lng"
        });
      }

      const numLat =
        Number(lat);

      const numLng =
        Number(lng);

      if (
        !Number.isFinite(numLat) ||
        !Number.isFinite(numLng)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid coordinates"
        });
      }

      const tenantId =
        tenantIdForWrite(req);

      if(!tenantId){

        return res.status(403).json({
          success:false,
          message:"Tenant Required"
        });
      }

      const id =
        String(driverId);

      const driver =
        await LiveDriver.findOneAndUpdate(
          {
            tenantId,
            driverId:id
          },
          {
            $set:{
              tenantId,
              driverId:id,
              name:name || "",
              phone:phone || "",
              vehicleNumber:
                vehicleNumber || "",
              tripId:tripId || "",
              routeMode:
                routeMode || "",
              lat:numLat,
              lng:numLng,
              online:true,
              lastSeen:new Date()
            }
          },
          {
            new:true,
            upsert:true,
            setDefaultsOnInsert:true
          }
        );

      return res.json({
        success:true,
        message:
          "Driver location saved",
        driver
      });

    } catch (err) {

      console.log(
        "DRIVER LOCATION SAVE ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Server error"
      });

    }

  }
);

/* =========================
   GET LIVE DRIVERS
   GET /api/driver/location/live
========================= */

router.get(
  "/live",
  requireTenantApi,
  async (req, res) => {

    try {

      const ONLINE_LIMIT_MS =
        1000 * 60 * 5;

      const since =
        new Date(
          Date.now() -
          ONLINE_LIMIT_MS
        );

      const drivers =
        await LiveDriver.find(
          tenantFilter(req,{
            lastSeen:{
              $gte:since
            }
          })
        )
        .sort({
          lastSeen:-1
        })
        .lean();

      return res.json({
        success:true,
        count:
          drivers.length,

        drivers:
          drivers.map(d => ({
            tenantId:
              d.tenantId || "",
            driverId:
              d.driverId,
            name:
              d.name || "",
            phone:
              d.phone || "",
            vehicleNumber:
              d.vehicleNumber || "",
            tripId:
              d.tripId || "",
            routeMode:
              d.routeMode || "",
            lat:
              Number(d.lat),
            lng:
              Number(d.lng),
            lastSeen:
              d.lastSeen,
            online:true
          }))
      });

    } catch (err) {

      console.log(
        "LIVE DRIVERS LOAD ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        count:0,
        drivers:[]
      });

    }

  }
);

/* =========================
   GET ONE DRIVER
   GET /api/driver/location/:driverId
========================= */

router.get(
  "/:driverId",
  requireTenantApi,
  async (req, res) => {

    try {

      const driverId =
        String(
          req.params.driverId ||
          ""
        );

      const driver =
        await LiveDriver.findOne(
          tenantFilter(req,{
            driverId
          })
        )
        .lean();

      if (!driver) {

        return res.status(404).json({
          success:false,
          message:"Driver not found"
        });
      }

      return res.json({
        success:true,
        driver
      });

    } catch (err) {

      console.log(
        "ONE DRIVER LOCATION ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Server error"
      });

    }

  }
);

/* =========================
   SET DRIVER OFFLINE
   DELETE /api/driver/location/:driverId
========================= */

router.delete(
  "/:driverId",
  requireTenantApi,
  async (req, res) => {

    try {

      const driverId =
        String(
          req.params.driverId ||
          ""
        );

      const result =
        await LiveDriver.deleteOne(
          tenantFilter(req,{
            driverId
          })
        );

      if(
        !result.deletedCount
      ){

        return res.status(404).json({
          success:false,
          message:"Driver not found"
        });
      }

      return res.json({
        success:true,
        message:
          "Driver removed from live map"
      });

    } catch (err) {

      console.log(
        "DELETE LIVE DRIVER ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Server error"
      });

    }

  }
);

module.exports = router;