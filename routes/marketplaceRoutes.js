"use strict";

/*
DESTINATION PATH:
server/routes/marketplaceRoutes.js

PURPOSE:
Generic Marketplace backend for any Marketplace Portal broker connection.

IMPORTANT:
- Uses BrokerIntegration connectionId, NOT brokerCode=MT.
- Reads normalized trips from providerPortalBridgeRoutes per connectionId.
- Uses the existing Long / Short engine settings.
- Marketplace Portal scan remains READ ONLY for Claim/Accept until a
  broker-specific claim adapter is implemented and authorized.
- Activity is stored in the existing Marketplace Activity collection for
  compatibility, but every new row is scoped by connectionId.
*/

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const Settings =
  require("../models/MarketplaceSettings");

const Activity =
  require("../models/MarketplaceActivity");

const BrokerIntegration =
  require("../models/BrokerIntegration");

const longEngine =
  require("../services/mtm/mtmLongTripEngine");

const shortEngine =
  require("../services/mtm/mtmShortTripEngine");

const providerPortalBridgeRoutes =
  require("./providerPortalBridgeRoutes");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

const clean =
  value =>
    String(value ?? "").trim();

function bearerToken(req){

  const raw =
    clean(
      req.headers.authorization
    );

  if(
    !raw
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return raw
    .slice(7)
    .trim();
}

function auth(req,res,next){

  const raw =
    bearerToken(req);

  if(!raw){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const user =
      jwt.verify(
        raw,
        JWT_SECRET
      );

    const role =
      clean(
        user.role
      ).toUpperCase();

    if(
      ![
        "PLATFORM_ADMIN",
        "SUPER_ADMIN",
        "ADMIN"
      ].includes(role)
    ){
      return res.status(403).json({
        success:false,
        message:"Access Denied"
      });
    }

    req.authUser =
      user;

    next();

  }catch(_err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

router.use(
  auth
);

function tenantId(req){

  const role =
    clean(
      req.authUser?.role
    ).toUpperCase();

  if(
    role === "PLATFORM_ADMIN" &&
    clean(
      req.query?.tenantId ||
      req.body?.tenantId
    )
  ){
    return clean(
      req.query?.tenantId ||
      req.body?.tenantId
    );
  }

  return clean(
    req.authUser?.tenantId ||
    req.authUser?.companyId ||
    req.authUser?.organizationId
  );
}

function zipList(value){

  return (
    Array.isArray(value)
      ? value
      : String(value || "")
          .split(/[\s,]+/)
  )
  .map(clean)
  .filter(Boolean);
}

function normalizeEngine(value={}){

  return {
    enabled:
      value.enabled === true,

    autoAccept:
      value.autoAccept === true,

    milesMin:
      Math.max(
        0,
        Number(
          value.milesMin
        ) || 0
      ),

    milesMax:
      Math.max(
        0,
        Number(
          value.milesMax
        ) || 0
      ),

    dailyTripLimit:
      Math.max(
        0,
        Number(
          value.dailyTripLimit
        ) || 0
      ),

    pickupTimeFrom:
      clean(
        value.pickupTimeFrom
      ) || "00:00",

    pickupTimeTo:
      clean(
        value.pickupTimeTo
      ) || "23:59",

    dropoffTimeFrom:
      clean(
        value.dropoffTimeFrom
      ) || "00:00",

    dropoffTimeTo:
      clean(
        value.dropoffTimeTo
      ) || "23:59",

    pickupZipCodes:
      zipList(
        value.pickupZipCodes
      ),

    dropoffZipCodes:
      zipList(
        value.dropoffZipCodes
      ),

    zoneMatch:
      [
        "ANY",
        "PICKUP",
        "DROPOFF",
        "EITHER",
        "BOTH"
      ].includes(
        clean(
          value.zoneMatch
        ).toUpperCase()
      )
        ? clean(
            value.zoneMatch
          ).toUpperCase()
        : "ANY",

    modes:
      zipList(
        value.modes
      )
  };
}

async function getSettings(id){

  let doc =
    await Settings.findOne({
      tenantId:id
    });

  if(!doc){

    doc =
      await Settings.create({
        tenantId:id,
        enabled:true,
        connectionMethod:"MTM_PORTAL",
        dateWindowDays:7,
        totalDailyTripLimit:0
      });
  }

  return doc;
}

function tripForEngine(trip={}){

  const miles =
    Number(
      trip.tripMiles ??
      trip.miles ??
      0
    );

  return {
    ...trip,

    externalTripId:
      clean(
        trip.externalTripId ||
        trip.portalTripId
      ),

    tripNumber:
      clean(
        trip.tripNumber ||
        trip.portalTripId
      ),

    miles:
      Number.isFinite(miles)
        ? miles
        : 0,

    tripMiles:
      Number.isFinite(miles)
        ? miles
        : 0,

    pickup:
      trip.pickup ||
      trip.pickupAddress ||
      "",

    dropoff:
      trip.dropoff ||
      trip.dropoffAddress ||
      "",

    mode:
      clean(
        trip.mode ||
        trip.serviceType ||
        trip.levelOfService
      )
  };
}

function activityMeta(
  connection,
  trip={}
){

  return {
    connectionId:
      String(
        connection._id
      ),

    marketplaceConnectionId:
      String(
        connection._id
      ),

    brokerIntegrationId:
      String(
        connection._id
      ),

    brokerCode:
      clean(
        connection.brokerCode
      ),

    brokerName:
      clean(
        connection.brokerName
      ),

    accountLabel:
      clean(
        connection.accountLabel ||
        "Primary Account"
      ),

    sourceHost:
      clean(
        trip.sourceHost ||
        connection.sourceHost
      )
  };
}

async function logActivity(
  id,
  connection,
  action,
  data={}
){

  const trip =
    data.trip ||
    {};

  return Activity.create({

    tenantId:id,

    integrationId:
      connection._id,

    engine:
      clean(
        data.engine ||
        "SYSTEM"
      ),

    action:
      clean(
        action
      ),

    externalTripId:
      clean(
        trip.externalTripId ||
        trip.portalTripId ||
        trip.tripNumber ||
        data.externalTripId
      ),

    message:
      clean(
        data.message
      ),

    reason:
      clean(
        data.reason
      ),

    miles:
      Number.isFinite(
        Number(
          trip.tripMiles ??
          trip.miles
        )
      )
        ? Number(
            trip.tripMiles ??
            trip.miles
          )
        : null,

    tripDate:
      clean(
        trip.tripDate ||
        trip.appointmentDate ||
        trip.date
      ),

    pickupTime:
      clean(
        trip.pickupTime
      ),

    mode:
      clean(
        trip.mode
      ),

    meta:{
      ...activityMeta(
        connection,
        trip
      ),
      ...(data.meta || {})
    }
  });
}

async function marketplaceConnection(
  id,
  connectionId
){

  const connection =
    await BrokerIntegration.findOne({
      _id:connectionId,
      tenantId:id,
      connectionMode:"MARKETPLACE_PORTAL",
      enabled:true,
      featureVisible:true,
      billingEnabled:true
    });

  if(!connection){

    const err =
      new Error(
        "Marketplace broker connection was not found or is disabled"
      );

    err.statusCode =
      404;

    throw err;
  }

  return connection;
}

function selectedByEngine(
  trips,
  settings
){

  const longTrips =
    settings?.longEngine?.enabled
      ? longEngine.select(
          trips,
          settings.longEngine || {}
        )
      : [];

  const shortTrips =
    settings?.shortEngine?.enabled
      ? shortEngine.select(
          trips,
          settings.shortEngine || {}
        )
      : [];

  return {
    longTrips,
    shortTrips
  };
}

async function logEngineMatches(
  id,
  connection,
  engineName,
  trips,
  engineSettings
){

  const results = [];

  for(const trip of trips){

    await logActivity(
      id,
      connection,
      "MATCHED",
      {
        engine:engineName,
        trip,
        message:
          `${engineName} engine matched trip ${clean(trip.externalTripId || trip.portalTripId)}`
      }
    );

    /*
      Discovery, mapping, and action detection are generic now.
      Actual Claim/Accept remains disabled until the detected action profile
      has been validated for the authorized provider portal. This prevents an
      unknown portal from being clicked based only on a guessed selector.
    */
    const reason =
      engineSettings?.autoAccept === true
        ? "PORTAL_ACTION_NOT_VERIFIED"
        : "AUTO_ACCEPT_OFF";

    const message =
      engineSettings?.autoAccept === true
        ? `${engineName} matched trip ${clean(trip.externalTripId || trip.portalTripId)}; Accept/Claim action must be validated before execution is enabled`
        : `${engineName} matched trip ${clean(trip.externalTripId || trip.portalTripId)}; Auto Accept is OFF`;

    await logActivity(
      id,
      connection,
      "SKIPPED",
      {
        engine:engineName,
        trip,
        reason,
        message
      }
    );

    results.push({
      engine:engineName,
      externalTripId:
        clean(
          trip.externalTripId ||
          trip.portalTripId
        ),
      matched:true,
      claimed:false,
      reason
    });
  }

  return results;
}

/* =========================
   ENGINE SETTINGS
   Generic endpoint; retains the existing stored settings through the MarketplaceSettings compatibility model.
========================= */

router.get(
  "/settings",
  async (req,res) => {

    try{

      const id =
        tenantId(req);

      if(!id){

        return res.status(400).json({
          success:false,
          message:"Tenant is required"
        });
      }

      const settings =
        await getSettings(id);

      return res.json({
        success:true,
        settings
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to load Marketplace settings"
      });
    }
  }
);

router.put(
  "/settings",
  async (req,res) => {

    try{

      const id =
        tenantId(req);

      if(!id){

        return res.status(400).json({
          success:false,
          message:"Tenant is required"
        });
      }

      const body =
        req.body ||
        {};

      const update = {
        enabled:
          body.enabled !== false,

        connectionMethod:
          "MTM_PORTAL",

        dateWindowDays:
          Math.min(
            31,
            Math.max(
              1,
              Number(
                body.dateWindowDays
              ) || 7
            )
          ),

        totalDailyTripLimit:
          Math.max(
            0,
            Number(
              body.totalDailyTripLimit
            ) || 0
          ),

        longEngine:
          normalizeEngine(
            body.longEngine
          ),

        shortEngine:
          normalizeEngine(
            body.shortEngine
          )
      };

      const settings =
        await Settings.findOneAndUpdate(
          {
            tenantId:id
          },
          {
            $set:update
          },
          {
            new:true,
            upsert:true,
            setDefaultsOnInsert:true,
            runValidators:true
          }
        );

      return res.json({
        success:true,
        settings
      });

    }catch(err){

      return res.status(400).json({
        success:false,
        message:
          err.message ||
          "Failed to save Marketplace settings"
      });
    }
  }
);

/* =========================
   CONNECTION-SCOPED ACTIVITY
========================= */

router.get(
  "/activity",
  async (req,res) => {

    try{

      const id =
        tenantId(req);

      if(!id){

        return res.status(400).json({
          success:false,
          message:"Tenant is required"
        });
      }

      const connectionId =
        clean(
          req.query.connectionId
        );

      const limit =
        Math.min(
          300,
          Math.max(
            1,
            Number(
              req.query.limit
            ) || 100
          )
        );

      const filter = {
        tenantId:id
      };

      if(connectionId){

        filter["meta.connectionId"] =
          connectionId;
      }

      const rows =
        await Activity.find(
          filter
        )
        .sort({
          occurredAt:-1
        })
        .limit(limit)
        .lean();

      return res.json({
        success:true,
        activity:rows
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to load Marketplace activity"
      });
    }
  }
);

/*
  Remove only old unscoped Marketplace test/activity rows that pre-date
  connectionId isolation. Scoped/new rows are preserved.
*/
router.post(
  "/activity/cleanup-legacy",
  async (req,res) => {

    try{

      const id =
        tenantId(req);

      if(!id){

        return res.status(400).json({
          success:false,
          message:"Tenant is required"
        });
      }

      const result =
        await Activity.deleteMany({
          tenantId:id,
          $or:[
            {
              "meta.connectionId":{
                $exists:false
              }
            },
            {
              "meta.connectionId":""
            },
            {
              meta:{
                $exists:false
              }
            }
          ]
        });

      return res.json({
        success:true,
        deleted:
          Number(
            result?.deletedCount ||
            0
          ),
        message:"Legacy unscoped Marketplace activity cleared."
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to clear legacy Marketplace activity"
      });
    }
  }
);

/* =========================
   GENERIC MARKETPLACE SCAN
========================= */

router.post(
  "/scan",
  async (req,res) => {

    try{

      const id =
        tenantId(req);

      if(!id){

        return res.status(400).json({
          success:false,
          message:"Tenant is required"
        });
      }

      const connectionId =
        clean(
          req.body?.connectionId ||
          req.query?.connectionId
        );

      if(!connectionId){

        return res.status(400).json({
          success:false,
          message:"connectionId is required"
        });
      }

      const [
        connection,
        settings
      ] =
        await Promise.all([
          marketplaceConnection(
            id,
            connectionId
          ),
          getSettings(id)
        ]);

      if(
        settings.enabled === false
      ){

        return res.status(409).json({
          success:false,
          message:"Marketplace is disabled in Settings"
        });
      }

      const getTrips =
        providerPortalBridgeRoutes
          .getNormalizedTripsForConnection;

      if(
        typeof getTrips !==
        "function"
      ){

        return res.status(500).json({
          success:false,
          message:"Provider Portal Bridge connection accessor is unavailable"
        });
      }

      const rawTrips =
        getTrips(
          id,
          connectionId
        );

      if(
        !Array.isArray(rawTrips) ||
        rawTrips.length === 0
      ){

        return res.status(409).json({
          success:false,
          message:
            `No normalized trips are available for ${connection.brokerName || connection.brokerCode || "this broker"} yet`
        });
      }

      const trips =
        rawTrips
          .map(
            tripForEngine
          )
          .filter(
            trip =>
              Boolean(
                trip.externalTripId ||
                trip.tripNumber
              )
          );

      await logActivity(
        id,
        connection,
        "SCAN",
        {
          engine:"SYSTEM",
          message:
            `Marketplace scan started for ${connection.brokerName || connection.brokerCode || "broker"} / ${connection.accountLabel || "Primary Account"}`,
          meta:{
            scannedCount:
              trips.length
          }
        }
      );

      for(
        const trip
        of trips
      ){

        await logActivity(
          id,
          connection,
          "SEEN",
          {
            engine:"SYSTEM",
            trip,
            message:
              `Marketplace trip seen: ${clean(trip.externalTripId || trip.tripNumber)}`
          }
        );
      }

      const {
        longTrips,
        shortTrips
      } =
        selectedByEngine(
          trips,
          settings
        );

      const [
        longResults,
        shortResults
      ] =
        await Promise.all([
          logEngineMatches(
            id,
            connection,
            "LONG",
            longTrips,
            settings.longEngine || {}
          ),

          logEngineMatches(
            id,
            connection,
            "SHORT",
            shortTrips,
            settings.shortEngine || {}
          )
        ]);

      await Settings.updateOne(
        {
          tenantId:id
        },
        {
          $set:{
            lastScanAt:
              new Date(),

            lastSuccessfulScanAt:
              new Date(),

            lastError:
              ""
          }
        }
      );

      return res.json({
        success:true,
        readOnlyEvaluation:true,
        connectionId,
        brokerName:
          connection.brokerName,
        accountLabel:
          connection.accountLabel ||
          "Primary Account",
        result:{
          scanned:
            trips.length,
          longMatched:
            longTrips.length,
          shortMatched:
            shortTrips.length,
          longResults,
          shortResults
        },
        message:
          `${connection.brokerName || "Broker"} scan complete. Long/Short engines were evaluated for this connection only.`
      });

    }catch(err){

      const status =
        Number(
          err?.statusCode
        ) || 500;

      return res
        .status(status)
        .json({
          success:false,
          message:
            err.message ||
            "Marketplace scan failed"
        });
    }
  }
);

module.exports =
  router;
