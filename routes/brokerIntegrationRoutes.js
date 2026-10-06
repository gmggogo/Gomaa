"use strict";

/*
DESTINATION PATH:
server/routes/brokerIntegrationRoutes.js

PURPOSE:
Platform Admin only.
Creates, enables, disables, and tests broker connections per tenant.
*/

const express = require("express");
const jwt = require("jsonwebtoken");

const router =
  express.Router();

const BrokerIntegration =
  require("../models/BrokerIntegration");
const TenantSubscription =
  require("../models/TenantSubscription");
const MarketplaceConnection =
  require("../models/MarketplaceConnection");

const {
  upsertIntegration,
  sanitizeIntegrationForClient,
  testIntegration
} = require("../services/brokerIntegrationService");

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

function requirePlatformAdmin(req,res,next){

  const token =
    bearerToken(req);

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

    if(
      String(
        decoded.role ||
        ""
      ).toUpperCase() !==
      "PLATFORM_ADMIN"
    ){
      return res.status(403).json({
        success:false,
        message:"Platform Admin only"
      });
    }

    req.authUser = decoded;

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

router.use(
  requirePlatformAdmin
);

/* =========================
   LIST ALL / FILTER TENANT
========================= */

router.get(
  "/",
  async (req,res) => {

    try{

      const filter = {};

      if(req.query.tenantId){
        filter.tenantId =
          clean(
            req.query.tenantId
          );
      }

      const items =
        await BrokerIntegration.find(
          filter
        )
        .sort({
          tenantId:1,
          brokerName:1
        });

      return res.json({
        success:true,
        integrations:
          items.map(
            sanitizeIntegrationForClient
          )
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:"Failed to load broker integrations"
      });
    }
  }
);

/* =========================
   CREATE / UPDATE
========================= */

router.post(
  "/",
  async (req,res) => {

    try{

      const {
        tenantId,
        tenantSlug,
        brokerCode,
        brokerName,
        connectionType
      } = req.body || {};

      if(
        !tenantId ||
        !brokerCode ||
        !brokerName ||
        !connectionType
      ){
        return res.status(400).json({
          success:false,
          message:"tenantId, brokerCode, brokerName, and connectionType are required"
        });
      }

      const existingIntegration =
        await BrokerIntegration.findOne({
          tenantId,
          brokerCode:clean(brokerCode).toUpperCase()
        });

      if(!existingIntegration){
        const subscription =
          await TenantSubscription.findOne({ tenantId });

        const brokerLimit =
          Math.max(
            0,
            Math.floor(
              Number(subscription?.includedBrokers || 0)
            )
          );

        const currentBrokerCount =
          await BrokerIntegration.countDocuments({ tenantId });

        if(currentBrokerCount >= brokerLimit){
          return res.status(403).json({
            success:false,
            code:"BROKER_LIMIT_REACHED",
            message:
              "Broker limit reached. Increase Included Brokers in SaaS Billing before adding another broker.",
            brokerLimit,
            currentBrokerCount
          });
        }
      }

      const integration =
        await upsertIntegration({
          ...req.body,
          updatedBy:
            req.authUser?.id ||
            req.authUser?.email ||
            "PLATFORM_ADMIN"
        });

      return res.json({
        success:true,
        integration:
          sanitizeIntegrationForClient(
            integration
          )
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to save broker integration"
      });
    }
  }
);

/* =========================
   ENABLE / DISABLE FEATURE
========================= */

router.patch(
  "/:id/access",
  async (req,res) => {

    try{

      const integration =
        await BrokerIntegration.findById(
          req.params.id
        );

      if(!integration){
        return res.status(404).json({
          success:false,
          message:"Integration not found"
        });
      }

      if(
        Object.prototype
          .hasOwnProperty
          .call(
            req.body,
            "enabled"
          )
      ){
        integration.enabled =
          Boolean(
            req.body.enabled
          );
      }

      if(
        Object.prototype
          .hasOwnProperty
          .call(
            req.body,
            "featureVisible"
          )
      ){
        integration.featureVisible =
          Boolean(
            req.body.featureVisible
          );
      }

      if(
        Object.prototype
          .hasOwnProperty
          .call(
            req.body,
            "billingEnabled"
          )
      ){
        integration.billingEnabled =
          Boolean(
            req.body.billingEnabled
          );
      }

      if(
        Object.prototype
          .hasOwnProperty
          .call(
            req.body,
            "monthlyFlatFee"
          )
      ){
        integration.monthlyFlatFee =
          Number(
            req.body.monthlyFlatFee ||
            0
          );
      }

      integration.connectionStatus =
        integration.enabled
          ? (
              integration.connectionStatus === "DISABLED"
                ? "CONFIGURED"
                : integration.connectionStatus
            )
          : "DISABLED";

      await integration.save();

      return res.json({
        success:true,
        integration:
          sanitizeIntegrationForClient(
            integration
          )
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:"Failed to update integration access"
      });
    }
  }
);

/* =========================
   TEST CONFIGURATION
========================= */

router.post(
  "/:id/test",
  async (req,res) => {

    try{

      const integration =
        await BrokerIntegration.findById(
          req.params.id
        );

      if(!integration){

        return res.status(404).json({
          success:false,
          message:"Integration not found"
        });
      }

      const result =
        await testIntegration(
          integration
        );

      return res.json({
        success:true,
        result,
        integration:
          sanitizeIntegrationForClient(
            integration
          )
      });

    }catch(err){

      return res.status(400).json({
        success:false,
        message:
          err.message ||
          "Integration test failed"
      });
    }
  }
);


/* =========================
   MARKETPLACE CONNECTIONS
   Platform Admin controls paid portal access.
   Super Admin login/session is handled elsewhere.
========================= */

function validPortalUrl(value){
  try{
    const u=new URL(clean(value));
    return ["http:","https:"].includes(u.protocol);
  }catch(_){
    return false;
  }
}

router.get("/marketplace-connections",async(req,res)=>{
  try{
    const filter={};
    if(clean(req.query.tenantId)) filter.tenantId=clean(req.query.tenantId);
    if(clean(req.query.brokerIntegrationId)) filter.brokerIntegrationId=clean(req.query.brokerIntegrationId);
    const items=await MarketplaceConnection.find(filter).sort({tenantId:1,brokerName:1,accountLabel:1}).lean();
    return res.json({success:true,connections:items});
  }catch(err){
    return res.status(500).json({success:false,message:err.message||"Failed to load Marketplace connections"});
  }
});

router.post("/marketplace-connections",async(req,res)=>{
  try{
    const b=req.body||{};
    const tenantId=clean(b.tenantId);
    const brokerIntegrationId=clean(b.brokerIntegrationId);
    const portalUrl=clean(b.portalUrl);
    const accountLabel=clean(b.accountLabel)||"Primary Account";
    if(!tenantId || !brokerIntegrationId || !portalUrl){
      return res.status(400).json({success:false,message:"tenantId, brokerIntegrationId, and portalUrl are required"});
    }
    if(!validPortalUrl(portalUrl)){
      return res.status(400).json({success:false,message:"Portal URL must start with http:// or https://"});
    }
    const integration=await BrokerIntegration.findOne({_id:brokerIntegrationId,tenantId});
    if(!integration){
      return res.status(404).json({success:false,message:"Broker Integration was not found for this company"});
    }
    let item=null;
    if(clean(b._id)) item=await MarketplaceConnection.findOne({_id:clean(b._id),tenantId});
    if(!item){
      item=new MarketplaceConnection({
        tenantId,
        brokerIntegrationId,
        createdBy:req.authUser?.id||req.authUser?.email||"PLATFORM_ADMIN"
      });
    }
    item.tenantSlug=clean(b.tenantSlug||integration.tenantSlug);
    item.brokerIntegrationId=integration._id;
    item.brokerName=integration.brokerName;
    item.brokerCode=integration.brokerCode;
    item.accountLabel=accountLabel;
    item.portalUrl=portalUrl;
    item.enabled=b.enabled!==false;
    item.featureVisible=b.featureVisible!==false;
    item.billingEnabled=b.billingEnabled!==false;
    item.monthlyFlatFee=Math.max(0,Number(b.monthlyFlatFee||0));
    item.updatedBy=req.authUser?.id||req.authUser?.email||"PLATFORM_ADMIN";
    if(!item.enabled) item.connectionStatus="DISABLED";
    else if(item.connectionStatus==="DISABLED") item.connectionStatus="NOT_PAIRED";
    await item.save();
    return res.json({success:true,connection:item});
  }catch(err){
    return res.status(500).json({success:false,message:err.message||"Failed to save Marketplace connection"});
  }
});

router.patch("/marketplace-connections/:id/access",async(req,res)=>{
  try{
    const item=await MarketplaceConnection.findById(req.params.id);
    if(!item) return res.status(404).json({success:false,message:"Marketplace connection not found"});
    for(const key of ["enabled","featureVisible","billingEnabled"]){
      if(Object.prototype.hasOwnProperty.call(req.body||{},key)) item[key]=Boolean(req.body[key]);
    }
    if(Object.prototype.hasOwnProperty.call(req.body||{},"monthlyFlatFee")){
      item.monthlyFlatFee=Math.max(0,Number(req.body.monthlyFlatFee||0));
    }
    item.connectionStatus=item.enabled?(item.connectionStatus==="DISABLED"?"NOT_PAIRED":item.connectionStatus):"DISABLED";
    item.updatedBy=req.authUser?.id||req.authUser?.email||"PLATFORM_ADMIN";
    await item.save();
    return res.json({success:true,connection:item});
  }catch(err){
    return res.status(500).json({success:false,message:err.message||"Failed to update Marketplace connection"});
  }
});

module.exports =
  router;
