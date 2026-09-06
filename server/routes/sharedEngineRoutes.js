"use strict";

/*
DESTINATION PATH:
server/routes/sharedEngineRoutes.js

PURPOSE:
Shared Engine API.

ENDPOINTS AFTER MOUNT:
GET  /api/shared-engine/settings
POST /api/shared-engine/settings
POST /api/shared-engine/plan

IMPORTANT:
The plan endpoint returns proposals only.
It does not modify original trips.
*/

const express =
  require("express");

const jwt =
  require("jsonwebtoken");

const mongoose =
  require("mongoose");

const router =
  express.Router();

const SharedEngineSettings =
  require(
    "../models/SharedEngineSettings"
  );

const BrokerIntegration =
  require(
    "../models/BrokerIntegration"
  );

const Service =
  require(
    "../models/Service"
  );

const {
  DEFAULT_SETTINGS,
  mergeSettings,
  planSharedTrips
} =
  require(
    "../services/sharedEngine"
  );

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function clean(value){
  return String(value ?? "").trim();
}

function bearerToken(req){
  const auth =
    clean(
      req.headers.authorization
    );

  if(
    !auth
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return auth
    .slice(7)
    .trim();
}

function requireStaff(
  req,
  res,
  next
){
  const token =
    bearerToken(req);

  if(!token){
    return res
      .status(401)
      .json({
        success:false,
        message:"Access Denied"
      });
  }

  try{
    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    const role =
      String(
        decoded.role ||
        ""
      ).toUpperCase();

    if(
      ![
        "SUPER_ADMIN",
        "ADMIN",
        "DISPATCHER"
      ].includes(role)
    ){
      return res
        .status(403)
        .json({
          success:false,
          message:"Not allowed"
        });
    }

    if(!decoded.tenantId){
      return res
        .status(403)
        .json({
          success:false,
          message:"Tenant Required"
        });
    }

    req.authUser =
      decoded;

    next();

  }catch(err){
    return res
      .status(401)
      .json({
        success:false,
        message:"Invalid Token"
      });
  }
}

router.use(
  requireStaff
);

function tenantObjectId(
  tenantId
){
  const value =
    clean(tenantId);

  if(
    !mongoose.Types
      .ObjectId
      .isValid(value)
  ){
    return null;
  }

  return new mongoose.Types
    .ObjectId(value);
}

function bool(value){
  return (
    value === true ||
    String(value)
      .toLowerCase() ===
      "true" ||
    String(value) === "1"
  );
}

function numberOr(
  value,
  fallback
){
  const num =
    Number(value);

  return Number.isFinite(num)
    ? num
    : fallback;
}

function sharedServiceCode(service){
  return String(
    service?.serviceKey ||
    service?.serviceCode ||
    service?.serviceType ||
    service?.suffix ||
    service?.companySuffix ||
    service?.reservedSuffix ||
    service?.title ||
    service?.name ||
    service?.serviceName ||
    ""
  )
    .trim()
    .toUpperCase();
}

function serviceVisibleAndEnabled(service){
  if(!service){
    return false;
  }

  if(service.featureVisible === false){
    return false;
  }

  if(service.active === false){
    return false;
  }

  if(service.enabled === false){
    return false;
  }

  return true;
}

async function getCapabilities(
  tenantId
){
  const id =
    tenantObjectId(
      tenantId
    );

  if(!id){
    return {
      brokerContractEnabled:false,
      sharedServiceEnabled:false,
      sharedServiceFound:false
    };
  }

  let brokerContractEnabled =
    false;

  let sharedServiceEnabled =
    false;

  try{
    const broker =
      await BrokerIntegration
        .findOne({
          tenantId:id,
          enabled:true,
          featureVisible:{
            $ne:false
          }
        })
        .select(
          "_id enabled featureVisible"
        )
        .lean();

    brokerContractEnabled =
      Boolean(broker);

  }catch(err){
    brokerContractEnabled =
      false;
  }

  try{
    const services =
      await Service
        .find({
          tenantId:id
        })
        .lean();

    sharedServiceEnabled =
      services.some(service=>{
        const code =
          sharedServiceCode(
            service
          );

        return (
          (
            code === "SH" ||
            code === "SHARED" ||
            code.includes("SHARED")
          ) &&
          serviceVisibleAndEnabled(
            service
          )
        );
      });

  }catch(err){
    sharedServiceEnabled =
      false;
  }

  return {
    brokerContractEnabled,
    sharedServiceEnabled,

    /*
      Backward-compatible alias used by the current frontend.
    */
    sharedServiceFound:
      sharedServiceEnabled
  };
}

async function getSettings(
  tenantId
){
  const id =
    tenantObjectId(
      tenantId
    );

  if(!id){
    throw new Error(
      "Invalid tenant"
    );
  }

  const saved =
    await SharedEngineSettings
      .findOne({
        tenantId:id
      })
      .lean();

  return mergeSettings(
    saved ||
    DEFAULT_SETTINGS
  );
}

router.get(
  "/settings",
  async (
    req,
    res
  )=>{
    try{
      const tenantId =
        req.authUser.tenantId;

      const [
        settings,
        capabilities
      ] =
        await Promise.all([
          getSettings(
            tenantId
          ),
          getCapabilities(
            tenantId
          )
        ]);

      return res.json({
        success:true,
        settings,
        capabilities
      });

    }catch(err){
      console.log(
        "SHARED ENGINE SETTINGS GET ERROR:",
        err
      );

      return res
        .status(500)
        .json({
          success:false,
          message:
            err.message ||
            "Failed to load Shared Engine settings"
        });
    }
  }
);

router.post(
  "/settings",
  async (
    req,
    res
  )=>{
    try{
      const tenantId =
        tenantObjectId(
          req.authUser.tenantId
        );

      if(!tenantId){
        return res
          .status(400)
          .json({
            success:false,
            message:"Invalid tenant"
          });
      }

      const body =
        req.body ||
        {};

      const update = {
        enabled:
          body.enabled === undefined
            ? true
            : bool(
                body.enabled
              ),

        sources:{
          company:{
            enabled:
              body?.sources
                ?.company
                ?.enabled ===
                undefined
                ? true
                : bool(
                    body.sources
                      .company
                      .enabled
                  )
          },

          reserved:{
            enabled:
              body?.sources
                ?.reserved
                ?.enabled ===
                undefined
                ? true
                : bool(
                    body.sources
                      .reserved
                      .enabled
                  )
          },

          broker:{
            enabled:
              body?.sources
                ?.broker
                ?.enabled ===
                undefined
                ? true
                : bool(
                    body.sources
                      .broker
                      .enabled
                  )
          }
        },

        maxGroupDistanceMiles:
          Math.max(
            0,
            numberOr(
              body
                .maxGroupDistanceMiles,
              10
            )
          ),

        maxExtraMiles:
          Math.max(
            0,
            numberOr(
              body.maxExtraMiles,
              10
            )
          ),

        maxExtraMinutes:
          Math.max(
            0,
            numberOr(
              body.maxExtraMinutes,
              30
            )
          ),

        appointmentBufferMinutes:
          Math.max(
            0,
            numberOr(
              body
                .appointmentBufferMinutes,
              10
            )
          ),

        pickupLateToleranceMinutes:
          Math.max(
            0,
            numberOr(
              body
                .pickupLateToleranceMinutes,
              5
            )
          ),

        pickupEarlyWindowMinutes:
          Math.max(
            0,
            numberOr(
              body
                .pickupEarlyWindowMinutes,
              20
            )
          ),

        maxRidersPerGroup:
          Math.max(
            2,
            Math.min(
              20,
              numberOr(
                body
                  .maxRidersPerGroup,
                4
              )
            )
          ),

        samePickupPriority:
          body
            .samePickupPriority ===
            undefined
            ? true
            : bool(
                body
                  .samePickupPriority
              ),

        sameDropoffPriority:
          body
            .sameDropoffPriority ===
            undefined
            ? true
            : bool(
                body
                  .sameDropoffPriority
              ),

        updatedBy:
          clean(
            req.authUser?.email ||
            req.authUser?.id ||
            req.authUser?._id ||
            ""
          )
      };

      const saved =
        await SharedEngineSettings
          .findOneAndUpdate(
            {
              tenantId
            },
            {
              $set:update
            },
            {
              new:true,
              upsert:true,
              setDefaultsOnInsert:true
            }
          )
          .lean();

      const capabilities =
        await getCapabilities(
          tenantId
        );

      return res.json({
        success:true,
        settings:
          mergeSettings(
            saved
          ),
        capabilities
      });

    }catch(err){
      console.log(
        "SHARED ENGINE SETTINGS SAVE ERROR:",
        err
      );

      return res
        .status(500)
        .json({
          success:false,
          message:
            err.message ||
            "Failed to save Shared Engine settings"
        });
    }
  }
);

router.post(
  "/plan",
  async (
    req,
    res
  )=>{
    try{
      const source =
        String(
          req.body?.source ||
          ""
        )
          .trim()
          .toUpperCase();

      if(
        ![
          "COMPANY",
          "RESERVED",
          "BROKER"
        ].includes(source)
      ){
        return res
          .status(400)
          .json({
            success:false,
            message:
              "source must be COMPANY, RESERVED, or BROKER"
          });
      }

      const trips =
        Array.isArray(
          req.body?.trips
        )
          ? req.body.trips
          : [];

      if(!trips.length){
        return res
          .status(400)
          .json({
            success:false,
            message:
              "At least one trip is required"
          });
      }

      const savedSettings =
        await getSettings(
          req.authUser.tenantId
        );

      const settings =
        mergeSettings({
          ...savedSettings,
          ...(
            req.body
              ?.settingsOverride ||
            {}
          )
        });

      const result =
        await planSharedTrips({
          trips,
          source,
          settings
        });

      return res.json(
        result
      );

    }catch(err){
      console.log(
        "SHARED ENGINE PLAN ERROR:",
        err
      );

      return res
        .status(500)
        .json({
          success:false,
          message:
            err.message ||
            "Shared Engine failed"
        });
    }
  }
);

module.exports =
  router;
