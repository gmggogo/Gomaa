"use strict";

/*
DESTINATION PATH:
server/routes/brokerPricingRoutes.js
*/

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();

const BrokerIntegration =
  require("../models/BrokerIntegration");

const BrokerPricing =
  require("../models/BrokerPricing");

const Tenant =
  require("../models/Tenant");

const Service =
  require("../models/Service");

const serviceIdentity =
  require("../utils/serviceIdentityResolver");

const {
  calculateBrokerPrice,
  normalizeServiceCode
} = require(
  "../services/brokerPricingEngine"
);

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

const CORE_SERVICE_CATALOG = [
  {serviceKey:"ST",serviceName:"Standard",serviceSuffix:"ST",pricingMode:"MILE",shared:false},
  {serviceKey:"WH",serviceName:"Wheelchair",serviceSuffix:"WH",pricingMode:"MILE",shared:false},
  {serviceKey:"SH",serviceName:"Shared",serviceSuffix:"SH",pricingMode:"SHARED",shared:true},
  {serviceKey:"LM",serviceName:"Limousine",serviceSuffix:"LM",pricingMode:"HOURLY",shared:false},
  {serviceKey:"TX",serviceName:"Taxi",serviceSuffix:"TX",pricingMode:"MILE",shared:false},
  {serviceKey:"XL",serviceName:"XL",serviceSuffix:"XL",pricingMode:"MILE",shared:false}
];

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function num(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function bool(value){
  return (
    value === true ||
    String(value).toLowerCase() === "true" ||
    String(value) === "1"
  );
}

function readToken(req){
  const auth =
    clean(
      req.headers.authorization
    );

  if(
    auth
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return auth.slice(7).trim();
  }

  return "";
}

function requireStaff(req,res,next){

  const token =
    readToken(req);

  if(!token){
    return res.status(401).json({
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

    req.authUser = {
      id:decoded.id || "",
      name:decoded.name || "",
      username:decoded.username || "",
      email:decoded.email || "",
      role:upper(decoded.role),
      tenantId:decoded.tenantId || ""
    };

    if(
      ![
        "SUPER_ADMIN",
        "ADMIN",
        "PLATFORM_ADMIN"
      ].includes(
        req.authUser.role
      )
    ){
      return res.status(403).json({
        success:false,
        message:"Not allowed"
      });
    }

    if(
      req.authUser.role !==
        "PLATFORM_ADMIN" &&
      !req.authUser.tenantId
    ){
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

function tenantIdFromRequest(req){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){
    return clean(
      req.query?.tenantId ||
      req.body?.tenantId
    );
  }

  return clean(
    req.authUser?.tenantId
  );
}

function normalizeServiceInput(
  row={},
  catalog=[]
){

  const serviceKey =
    serviceIdentity
      .normalizeOperationalCode(
        row.serviceKey ||
        row.serviceCode ||
        row.serviceName ||
        row.serviceSuffix
      ) ||
    normalizeServiceCode(
      row.serviceKey ||
      row.serviceCode ||
      row.serviceName ||
      row.serviceSuffix
    );

  const shared =
    serviceKey === "SH" ||
    bool(row.shared) ||
    upper(row.pricingMode) ===
      "SHARED";

  const catalogRow =
    (
      Array.isArray(catalog)
        ? catalog
        : []
    ).find(
      item =>
        item.serviceKey ===
        serviceKey
    );

  const defaultName =
    catalogRow?.serviceName ||
    serviceKey;

  const defaultMode =
    upper(
      catalogRow?.pricingMode
    );

  return {
    serviceKey,

    serviceName:
      clean(row.serviceName) ||
      defaultName,

    serviceSuffix:
      serviceKey,

    enabled:
      bool(row.enabled),

    shared,

    pricingMode:
      shared
        ? "SHARED"
        : (
            ["MILE","HOURLY"].includes(
              upper(row.pricingMode)
            )
              ? upper(row.pricingMode)
              : (
                  ["MILE","HOURLY"].includes(
                    defaultMode
                  )
                    ? defaultMode
                    : "MILE"
                )
          ),

    baseFare:
      Math.max(
        0,
        num(row.baseFare)
      ),

    includedMiles:
      Math.max(
        0,
        num(row.includedMiles)
      ),

    perMile:
      Math.max(
        0,
        num(row.perMile)
      ),

    hourlyRate:
      Math.max(
        0,
        num(row.hourlyRate)
      ),

    hourlyBillingMode:
      upper(
        row.hourlyBillingMode
      ) === "QUARTER"
        ? "QUARTER"
        : "FULL",

    /*
      Keep the existing Limo-only initial package behavior unchanged.
      Custom hourly broker services use the normal hourly calculation.
    */
    initialDurationMinutes:
      serviceKey === "LM"
        ? Math.max(
            0,
            num(
              row.initialDurationMinutes
            )
          )
        : 0,

    initialPrice:
      serviceKey === "LM"
        ? Math.max(
            0,
            num(row.initialPrice)
          )
        : 0,

    stopFee:
      Math.max(
        0,
        num(row.stopFee)
      ),

    noShowFee:
      Math.max(
        0,
        num(row.noShowFee)
      ),

    sharedPrice:
      shared
        ? Math.max(
            0,
            num(row.sharedPrice)
          )
        : 0,

    sharedStopChargeEnabled:
      shared
        ? bool(
            row.sharedStopChargeEnabled
          )
        : false,

    cancelEnabled:
      row.cancelEnabled === undefined
        ? true
        : bool(row.cancelEnabled),

    warningMinutes:
      Math.max(
        0,
        num(row.warningMinutes)
      ),

    cancelFee:
      Math.max(
        0,
        num(row.cancelFee)
      ),

    addStopEnabled:
      shared
        ? false
        : bool(
            row.addStopEnabled
          ),

    addStopCustomTimeEnabled:
      shared
        ? false
        : bool(
            row.addStopCustomTimeEnabled
          ),

    addStopCutoffMinutes:
      shared
        ? 0
        : Math.max(
            0,
            num(
              row.addStopCutoffMinutes
            )
          )
  };
}

function normalizeAllowedGateSet(
  allowedServices
){

  return new Set(
    Array.isArray(allowedServices)
      ? allowedServices
          .map(
            serviceIdentity
              .normalizeServiceCode
          )
          .filter(Boolean)
      : []
  );
}

function coreVisibleCatalog(
  allowedServices
){

  const allowed =
    normalizeAllowedGateSet(
      allowedServices
    );

  return CORE_SERVICE_CATALOG
    .filter(
      item =>
        allowed.has(
          item.serviceKey
        )
    )
    .map(
      item => ({
        ...item,
        serviceIdentity:
          item.serviceKey,
        customSlot:0,
        custom:false
      })
    );
}

async function buildVisibleServiceCatalog(
  tenantId,
  allowedServices
){

  const visible =
    coreVisibleCatalog(
      allowedServices
    );

  const allowed =
    normalizeAllowedGateSet(
      allowedServices
    );

  const customServices =
    await Service
      .find({
        tenantId,
        customSlot:{
          $in:[1,2,3,4]
        }
      })
      .sort({
        customSlot:1
      })
      .lean();

  for(const service of customServices){

    const identity =
      serviceIdentity
        .resolveServiceIdentity(
          service
        );

    if(
      identity.isCustom !== true ||
      identity.configured !== true ||
      !identity.gateKey ||
      !identity.operationalCode ||
      !allowed.has(
        identity.gateKey
      )
    ){
      continue;
    }

    visible.push({
      serviceKey:
        identity.operationalCode,

      serviceName:
        identity.displayName ||
        identity.operationalCode,

      serviceSuffix:
        identity.operationalCode,

      /*
        Broker Pricing remains independent. This is only a UI/default
        mode and does not copy Get Quote/Company/Reserved prices.
      */
      pricingMode:
        "MILE",

      shared:false,

      serviceIdentity:
        identity.gateKey,

      customSlot:
        identity.customSlot,

      custom:true
    });
  }

  return visible;
}

function defaultServices(
  catalog=[]
){

  return (
    Array.isArray(catalog)
      ? catalog
      : []
  ).map(
    item =>
      normalizeServiceInput(
        {
          ...item,
          enabled:false
        },
        catalog
      )
  );
}

function mergeServices(
  saved=[],
  catalog=[]
){

  const map =
    new Map();

  for(
    const service of
      defaultServices(catalog)
  ){
    map.set(
      service.serviceKey,
      service
    );
  }

  const allowedKeys =
    new Set(
      (
        Array.isArray(catalog)
          ? catalog
          : []
      )
      .map(
        item =>
          serviceIdentity
            .normalizeOperationalCode(
              item?.serviceKey
            )
      )
      .filter(Boolean)
    );

  for(
    const raw of
      Array.isArray(saved)
        ? saved
        : []
  ){

    const service =
      normalizeServiceInput(
        raw,
        catalog
      );

    if(
      service.serviceKey &&
      allowedKeys.has(
        service.serviceKey
      )
    ){
      map.set(
        service.serviceKey,
        service
      );
    }
  }

  return [...map.values()];
}

function filterServicesByCatalog(
  services,
  catalog
){

  const visibleKeys =
    new Set(
      (
        Array.isArray(catalog)
          ? catalog
          : []
      )
      .map(
        item =>
          serviceIdentity
            .normalizeOperationalCode(
              item?.serviceKey
            )
      )
      .filter(Boolean)
    );

  return (
    Array.isArray(services)
      ? services
      : []
  ).filter(
    service =>
      visibleKeys.has(
        serviceIdentity
          .normalizeOperationalCode(
            service?.serviceKey
          )
      )
  );
}

router.use(requireStaff);

router.get("/bootstrap",async(req,res)=>{

  try{

    const tenantId =
      tenantIdFromRequest(req);

    if(
      !tenantId ||
      !mongoose.Types.ObjectId.isValid(
        tenantId
      )
    ){
      return res.status(400).json({
        success:false,
        message:"Valid tenant is required"
      });
    }

    const [
      tenant,
      brokers,
      pricingRows
    ] =
      await Promise.all([

        Tenant
          .findById(tenantId)
          .select("allowedServices")
          .lean(),

        BrokerIntegration
          .find({
            tenantId,
            enabled:true,
            featureVisible:{
              $ne:false
            }
          })
          .select(
            "_id brokerCode brokerName connectionType connectionStatus"
          )
          .sort({
            brokerName:1
          })
          .lean(),

        BrokerPricing.collection
          .find({
            tenantId:
              new mongoose.Types.ObjectId(
                tenantId
              )
          })
          .sort({
            brokerName:1
          })
          .toArray()
      ]);

    if(!tenant){
      return res.status(404).json({
        success:false,
        message:"Tenant not found"
      });
    }

    const allowedServices =
      Array.isArray(
        tenant.allowedServices
      )
        ? [
            ...new Set(
              tenant.allowedServices
                .map(
                  normalizeServiceCode
                )
                .filter(Boolean)
            )
          ]
        : [];

    const visibleCatalog =
      await buildVisibleServiceCatalog(
        tenantId,
        allowedServices
      );

    const pricingByBroker =
      new Map(
        pricingRows.map(
          row=>[
            String(row.brokerId),
            {
              ...row,
              services:
                filterServicesByCatalog(
                  mergeServices(
                    row.services,
                    visibleCatalog
                  ).map(
                    service => (
                      service.serviceKey === "SH"
                        ? {
                            ...service,
                            sharedStopChargeEnabled:
                              row.sharedStopChargeEnabled ===
                              true
                          }
                        : service
                    )
                  ),
                  visibleCatalog
                )
            }
          ]
        )
      );

    const normalizedBrokers =
      brokers.map(
        broker=>{

          const saved =
            pricingByBroker.get(
              String(broker._id)
            );

          return {
            _id:String(broker._id),
            brokerCode:
              upper(
                broker.brokerCode
              ),
            brokerName:
              clean(
                broker.brokerName
              ) ||
              upper(
                broker.brokerCode
              ),
            connectionType:
              broker.connectionType ||
              "",
            connectionStatus:
              broker.connectionStatus ||
              "",
            pricing:
              saved || {
                brokerId:
                  String(
                    broker._id
                  ),
                brokerCode:
                  upper(
                    broker.brokerCode
                  ),
                brokerName:
                  clean(
                    broker.brokerName
                  ),
                active:false,
                services:
                  filterServicesByCatalog(
                    defaultServices(
                      visibleCatalog
                    ),
                    visibleCatalog
                  )
              }
          };
        }
      );

    return res.json({
      success:true,
      brokers:
        normalizedBrokers,
      allowedServices,

      serviceCodes:
        visibleCatalog
          .map(
            item =>
              item.serviceKey
          ),

      serviceCatalog:
        visibleCatalog
    });

  }catch(err){

    console.log(
      "BROKER PRICING BOOTSTRAP ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Failed to load broker pricing"
    });
  }
});

router.patch("/:brokerId",async(req,res)=>{

  try{

    const tenantId =
      tenantIdFromRequest(req);

    const brokerId =
      clean(
        req.params.brokerId
      );

    if(
      !mongoose.Types.ObjectId.isValid(
        tenantId
      ) ||
      !mongoose.Types.ObjectId.isValid(
        brokerId
      )
    ){
      return res.status(400).json({
        success:false,
        message:"Invalid broker or tenant"
      });
    }

    const broker =
      await BrokerIntegration
        .findOne({
          _id:brokerId,
          tenantId,
          enabled:true,
          featureVisible:{
            $ne:false
          }
        })
        .select(
          "_id brokerCode brokerName"
        );

    if(!broker){
      return res.status(404).json({
        success:false,
        message:"Broker not found"
      });
    }

    const tenant =
      await Tenant
        .findById(tenantId)
        .select("allowedServices")
        .lean();

    if(!tenant){
      return res.status(404).json({
        success:false,
        message:"Tenant not found"
      });
    }

    const allowedServices =
      Array.isArray(
        tenant.allowedServices
      )
        ? [
            ...new Set(
              tenant.allowedServices
                .map(
                  normalizeServiceCode
                )
                .filter(Boolean)
            )
          ]
        : [];

    const visibleCatalog =
      await buildVisibleServiceCatalog(
        tenantId,
        allowedServices
      );

    const allowedSet =
      new Set(
        visibleCatalog
          .map(
            item =>
              serviceIdentity
                .normalizeOperationalCode(
                  item?.serviceKey
                )
          )
          .filter(Boolean)
      );

    const rawServices =
      Array.isArray(
        req.body?.services
      )
        ? req.body.services
        : [];

    const sharedInput =
      rawServices.find(
        service=>
          serviceIdentity
            .normalizeOperationalCode(
              service?.serviceKey ||
              service?.serviceCode ||
              service?.serviceName ||
              service?.serviceSuffix
            ) === "SH"
      ) || {};

    const sharedStopChargeEnabled =
      bool(
        sharedInput
          .sharedStopChargeEnabled
      );

    const services =
      mergeServices(
        rawServices,
        visibleCatalog
      ).filter(
        service =>
          allowedSet.has(
            serviceIdentity
              .normalizeOperationalCode(
                service.serviceKey
              )
          )
      );

    const active =
      bool(
        req.body?.active
      );

    const updatedBy =
      clean(
        req.authUser?.email ||
        req.authUser?.name ||
        req.authUser?.username ||
        req.authUser?.id
      );

    const pricing =
      await BrokerPricing
        .findOneAndUpdate(
          {
            tenantId,
            brokerId
          },
          {
            $set:{
              tenantId,
              brokerId,
              brokerCode:
                upper(
                  broker.brokerCode
                ),
              brokerName:
                clean(
                  broker.brokerName
                ),
              active,
              services,
              updatedBy
            }
          },
          {
            new:true,
            upsert:true,
            runValidators:true,
            setDefaultsOnInsert:true
          }
        );

    /*
      Broker-specific Shared Stop Charge switch.

      Stored at the BrokerPricing document level so each broker can have
      a different Shared-stop contract. Raw collection update keeps this
      compatible with older BrokerPricing schemas.
    */
    await BrokerPricing.collection.updateOne(
      {
        _id:pricing._id
      },
      {
        $set:{
          sharedStopChargeEnabled
        }
      }
    );

    pricing.set(
      "sharedStopChargeEnabled",
      sharedStopChargeEnabled,
      {
        strict:false
      }
    );

    return res.json({
      success:true,
      message:
        active
          ? "Broker pricing activated"
          : "Broker pricing saved",
      pricing
    });

  }catch(err){

    console.log(
      "BROKER PRICING SAVE ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Failed to save broker pricing"
    });
  }
});

router.post("/calculate/price",async(req,res)=>{

  try{

    const tenantId =
      tenantIdFromRequest(req);

    const result =
      await calculateBrokerPrice({
        tenantId,
        brokerId:
          req.body?.brokerId,
        brokerCode:
          req.body?.brokerCode,
        brokerName:
          req.body?.brokerName,
        serviceKey:
          req.body?.serviceKey,
        miles:
          req.body?.miles,
        minutes:
          req.body?.minutes,
        stops:
          req.body?.stops,
        passengersCount:
          req.body?.passengersCount
      });

    return res.json(result);

  }catch(err){

    return res.status(400).json({
      success:false,
      message:
        err.message ||
        "Broker pricing calculation failed"
    });
  }
});

module.exports = router;
