
"use strict";

/* DESTINATION PATH: server/routes/mtmMarketplaceRoutes.js
   Mount: app.use("/api/mtm-marketplace", require("./routes/mtmMarketplaceRoutes"));
*/
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const Settings = require("../models/MtmMarketplaceSettings");
const Session = require("../models/MtmMarketplaceSession");
const Activity = require("../models/MtmMarketplaceActivity");
const BrokerIntegration = require("../models/BrokerIntegration");

const MtmPortalConnector = require("../services/mtm/mtmPortalConnector");
const MtmApiConnector = require("../services/mtm/mtmApiConnector");
const MtmMockConnector = require("../services/mtm/mtmMockConnector");
const MtmMarketplaceWorker = require("../services/mtm/mtmMarketplaceWorker");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const clean = v => String(v ?? "").trim();
const connectorCache = new Map();

function auth(req,res,next){
  const raw=clean(req.headers.authorization);
  if(!raw.toLowerCase().startsWith("bearer ")) return res.status(401).json({success:false,message:"Access Denied"});
  try{
    const user=jwt.verify(raw.slice(7).trim(),JWT_SECRET);
    const role=clean(user.role).toUpperCase();
    if(!["PLATFORM_ADMIN","SUPER_ADMIN","ADMIN"].includes(role)) return res.status(403).json({success:false,message:"Access Denied"});
    req.authUser=user;
    next();
  }catch(_err){
    return res.status(401).json({success:false,message:"Invalid Token"});
  }
}
router.use(auth);

function tenantId(req){
  if(clean(req.authUser.role).toUpperCase()==="PLATFORM_ADMIN" && clean(req.query.tenantId || req.body?.tenantId)){
    return clean(req.query.tenantId || req.body?.tenantId);
  }
  return clean(req.authUser.tenantId || req.authUser.companyId || req.authUser.organizationId);
}
function zipList(v){return (Array.isArray(v)?v:String(v||"").split(/[\s,]+/)).map(clean).filter(Boolean);}
function engine(v={}){
  return {
    enabled:v.enabled===true,
    autoAccept:v.autoAccept===true,
    milesMin:Math.max(0,Number(v.milesMin)||0),
    milesMax:Math.max(0,Number(v.milesMax)||0),
    dailyTripLimit:Math.max(0,Number(v.dailyTripLimit)||0),
    pickupTimeFrom:clean(v.pickupTimeFrom)||"00:00",
    pickupTimeTo:clean(v.pickupTimeTo)||"23:59",
    dropoffTimeFrom:clean(v.dropoffTimeFrom)||"00:00",
    dropoffTimeTo:clean(v.dropoffTimeTo)||"23:59",
    pickupZipCodes:zipList(v.pickupZipCodes),
    dropoffZipCodes:zipList(v.dropoffZipCodes),
    zoneMatch:["ANY","PICKUP","DROPOFF","EITHER","BOTH"].includes(clean(v.zoneMatch).toUpperCase())?clean(v.zoneMatch).toUpperCase():"ANY",
    modes:zipList(v.modes)
  };
}

async function getSettings(id){
  let doc=await Settings.findOne({tenantId:id});
  if(!doc) doc=await Settings.create({tenantId:id});
  return doc;
}

function connectorKey(id){return String(id);}
async function getConnector(id,settings){
  const key=connectorKey(id);
  if(connectorCache.has(key)) return connectorCache.get(key);
  const options={tenantId:id,integrationId:settings?.integrationId||null};
  const connector=settings?.connectionMethod==="MTM_MOCK"
    ? new MtmMockConnector(options)
    : settings?.connectionMethod==="MTM_API"
      ? new MtmApiConnector(options)
      : new MtmPortalConnector(options);
  connectorCache.set(key,connector);
  return connector;
}

async function resolveBrokerIntegration(id,settings){
  let integration=null;
  if(settings?.integrationId){
    integration=await BrokerIntegration.findOne({_id:settings.integrationId,tenantId:id});
  }
  if(!integration){
    integration=await BrokerIntegration.findOne({tenantId:id,brokerCode:"MT"});
  }
  if(!integration && settings?.connectionMethod==="MTM_MOCK"){
    integration=await BrokerIntegration.create({
      tenantId:id,
      tenantSlug:settings.tenantSlug||"",
      enabled:true,
      featureVisible:false,
      brokerName:"MTM",
      brokerCode:"MT",
      connectionType:"FILE_IMPORT",
      environment:"SANDBOX",
      integrationDirection:"INBOUND",
      connectionStatus:"TESTING"
    });
  }
  if(!integration) throw new Error("MTM Broker Integration was not found for this company");
  if(integration.enabled!==true) throw new Error("MTM Broker Integration is disabled");
  if(String(settings.integrationId||"")!==String(integration._id)){
    await Settings.updateOne({tenantId:id},{$set:{integrationId:integration._id}});
    settings.integrationId=integration._id;
  }
  return integration;
}

router.get("/settings",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    res.json({success:true,settings:await getSettings(id)});
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

router.put("/settings",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const b=req.body||{};
    const update={
      enabled:b.enabled===true,
      connectionMethod:["MTM_MOCK","MTM_PORTAL","MTM_API"].includes(clean(b.connectionMethod))?clean(b.connectionMethod):"MTM_MOCK",
      dateWindowDays:Math.min(31,Math.max(1,Number(b.dateWindowDays)||7)),
      totalDailyTripLimit:Math.max(0,Number(b.totalDailyTripLimit)||0),
      longEngine:engine(b.longEngine),
      shortEngine:engine(b.shortEngine)
    };
    if(clean(b.integrationId)) update.integrationId=clean(b.integrationId);
    if(clean(b.tenantSlug)) update.tenantSlug=clean(b.tenantSlug).toLowerCase();
    const doc=await Settings.findOneAndUpdate({tenantId:id},{$set:update},{new:true,upsert:true,setDefaultsOnInsert:true,runValidators:true});
    connectorCache.delete(connectorKey(id));
    res.json({success:true,settings:doc});
  }catch(e){res.status(400).json({success:false,message:e.message});}
});

router.get("/status",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const settings=await getSettings(id);
    if(settings.connectionMethod==="MTM_MOCK") return res.json({success:true,session:{status:"CONNECTED",mock:true,message:"TEST MODE - Mock MTM"}});
    const session=await Session.findOne({tenantId:id}).select("-encryptedSessionState");
    res.json({success:true,session:session||{status:"DISCONNECTED"}});
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

router.post("/connect",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const username=clean(req.body?.username);
    const password=String(req.body?.password||"");
    if(!username || !password) return res.status(400).json({success:false,message:"MTM username and password are required"});

    const settings=await getSettings(id);
    const connector=await getConnector(id,settings);

    await Session.findOneAndUpdate(
      {tenantId:id},
      {$set:{integrationId:settings.integrationId||null,status:"CONNECTING",lastError:""}},
      {upsert:true,new:true,setDefaultsOnInsert:true}
    );

    /* Credentials are passed only to the connector call. They are not written to Mongo here. */
    const result=await connector.connect({username,password});

    const nextStatus=result?.connected===true
      ?"CONNECTED"
      :result?.verificationRequired===true
        ?"VERIFICATION_REQUIRED"
        :"ERROR";

    const session=await Session.findOneAndUpdate(
      {tenantId:id},
      {$set:{
        status:nextStatus,
        connectedAt:nextStatus==="CONNECTED"?new Date():null,
        lastVerifiedAt:nextStatus==="CONNECTED"?new Date():null,
        verificationRequiredAt:nextStatus==="VERIFICATION_REQUIRED"?new Date():null,
        lastError:clean(result?.message||result?.status||"")
      }},
      {upsert:true,new:true,setDefaultsOnInsert:true}
    ).select("-encryptedSessionState");

    res.json({success:nextStatus!=="ERROR",session,message:result?.message||""});
  }catch(e){
    await Session.findOneAndUpdate({tenantId:tenantId(req)},{$set:{status:"ERROR",lastError:e.message}},{upsert:true}).catch(()=>{});
    res.status(500).json({success:false,message:e.message});
  }
});

router.post("/verify",async(req,res)=>{
  try{
    const id=tenantId(req);
    const code=clean(req.body?.code);
    if(!id || !code) return res.status(400).json({success:false,message:"Verification code is required"});
    const settings=await getSettings(id);
    const connector=await getConnector(id,settings);
    if(typeof connector.verifyMfa!=="function"){
      return res.status(501).json({success:false,message:"MTM verification handler will be activated after the authorized real portal mapping is completed"});
    }
    const result=await connector.verifyMfa({code});
    const status=result?.connected===true?"CONNECTED":"VERIFICATION_REQUIRED";
    const session=await Session.findOneAndUpdate({tenantId:id},{$set:{
      status,
      connectedAt:status==="CONNECTED"?new Date():null,
      lastVerifiedAt:status==="CONNECTED"?new Date():null,
      verificationRequiredAt:status==="VERIFICATION_REQUIRED"?new Date():null,
      lastError:clean(result?.message||"")
    }},{new:true,upsert:true}).select("-encryptedSessionState");
    res.json({success:status==="CONNECTED",session,message:result?.message||""});
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

router.post("/disconnect",async(req,res)=>{
  try{
    const id=tenantId(req);
    const settings=await getSettings(id);
    const connector=connectorCache.get(connectorKey(id));
    if(connector && typeof connector.disconnect==="function") await connector.disconnect().catch(()=>{});
    connectorCache.delete(connectorKey(id));
    const session=await Session.findOneAndUpdate({tenantId:id},{$set:{
      status:"DISCONNECTED",connectedAt:null,verificationRequiredAt:null,lastError:"",encryptedSessionState:""
    }},{new:true,upsert:true}).select("-encryptedSessionState");
    res.json({success:true,session});
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

router.get("/activity",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const limit=Math.min(200,Math.max(1,Number(req.query.limit)||50));
    const rows=await Activity.find({tenantId:id}).sort({occurredAt:-1}).limit(limit).lean();
    res.json({success:true,activity:rows});
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

router.post("/test/reset",async(req,res)=>{
  try{
    const id=tenantId(req);
    const settings=await getSettings(id);
    if(settings.connectionMethod!=="MTM_MOCK") return res.status(409).json({success:false,message:"Test Reset is available only in Mock MTM mode"});
    const connector=await getConnector(id,settings);
    if(typeof connector.reset==="function") connector.reset();
    await Activity.create({tenantId:id,integrationId:settings.integrationId||null,engine:"SYSTEM",action:"SESSION",message:"Mock MTM test trips reset"});
    res.json({success:true,message:"Mock MTM reset. New test trips are available."});
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

router.post("/scan",async(req,res)=>{
  try{
    const id=tenantId(req);
    const settings=await getSettings(id);
    if(!settings.enabled) return res.status(409).json({success:false,message:"MTM Marketplace is disabled in Settings"});

    const session=await Session.findOne({tenantId:id}).lean();
    if(settings.connectionMethod==="MTM_PORTAL" && session?.status!=="CONNECTED"){
      return res.status(409).json({success:false,message:"MTM Provider Portal is not connected"});
    }

    const connector=await getConnector(id,settings);
    const integration=await resolveBrokerIntegration(id,settings);
    const worker=new MtmMarketplaceWorker({
      tenantId:id,
      tenantSlug:settings.tenantSlug,
      integrationId:integration._id,
      integration,
      connector,
      settings
    });

    const result=await worker.runOnce();

    await Settings.updateOne({tenantId:id},{$set:{
      lastScanAt:new Date(),
      lastSuccessfulScanAt:new Date(),
      lastError:""
    }});

    res.json({success:true,message:"Marketplace scan completed. Successful claims are sent to the existing Broker Hub pipeline.",result});
  }catch(e){
    const id=tenantId(req);
    if(id) await Settings.updateOne({tenantId:id},{$set:{lastScanAt:new Date(),lastError:e.message}}).catch(()=>{});
    res.status(500).json({success:false,message:e.message});
  }
});

module.exports=router;