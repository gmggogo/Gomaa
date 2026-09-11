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

const {
  calculateBrokerPrice,
  normalizeServiceCode
} = require(
  "../services/brokerPricingEngine"
);

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

const SERVICE_CATALOG = [
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

function normalizeServiceInput(row={}){

  const serviceKey =
    normalizeServiceCode(
      row.serviceKey ||
      row.serviceName ||
      row.serviceSuffix
    );

  const shared =
    serviceKey === "SH" ||
    bool(row.shared) ||
    upper(row.pricingMode) ===
      "SHARED";

  const defaultName =
    SERVICE_CATALOG.find(
      item=>
        item.serviceKey ===
        serviceKey
    )?.serviceName ||
    serviceKey;

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
              : "MILE"
          ),
    baseFare:
      Math.max(0,num(row.baseFare)),
    includedMiles:
      Math.max(0,num(row.includedMiles)),
    perMile:
      Math.max(0,num(row.perMile)),
    hourlyRate:
      Math.max(0,num(row.hourlyRate)),
    hourlyBillingMode:
      upper(row.hourlyBillingMode) ===
      "QUARTER"
        ? "QUARTER"
        : "FULL",
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
      Math.max(0,num(row.stopFee)),
    noShowFee:
      Math.max(0,num(row.noShowFee)),
    sharedPrice:
      shared
        ? Math.max(
            0,
            num(row.sharedPrice)
          )
        : 0,
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
      Math.max(0,num(row.cancelFee)),
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

function defaultServices(){
  return SERVICE_CATALOG.map(
    item=>
      normalizeServiceInput({
        ...item,
        enabled:false
      })
  );
}

function mergeServices(saved=[]){

  const map =
    new Map();

  for(
    const service of
      defaultServices()
  ){
    map.set(
      service.serviceKey,
      service
    );
  }

  for(
    const raw of
      Array.isArray(saved)
        ? saved
        : []
  ){
    const service =
      normalizeServiceInput(raw);

    if(service.serviceKey){
      map.set(
        service.serviceKey,
        service
      );
    }
  }

  return [...map.values()];
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

        BrokerPricing
          .find({
            tenantId
          })
          .sort({
            brokerName:1
          })
          .lean()
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
      SERVICE_CATALOG.filter(
        service=>
          allowedServices.includes(
            service.serviceKey
          )
      );

    const visibleKeys =
      new Set(
        visibleCatalog.map(
          service=>service.serviceKey
        )
      );

    const pricingByBroker =
      new Map(
        pricingRows.map(
          row=>[
            String(row.brokerId),
            {
              ...row,
              services:
                mergeServices(
                  row.services
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
                  defaultServices()
                    .filter(
                      service=>
                        visibleKeys.has(
                          service.serviceKey
                        )
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

    const allowedSet =
      new Set(
        allowedServices
      );

    const services =
      mergeServices(
        req.body?.services
      ).filter(
        service=>
          allowedSet.has(
            service.serviceKey
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
