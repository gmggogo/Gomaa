"use strict";

/* DESTINATION: server/routes/mtmMarketplaceRoutes.js
   Suggested mount: app.use('/api/mtm-marketplace', require('./routes/mtmMarketplaceRoutes'));
*/
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Settings = require("../models/MtmMarketplaceSettings");
const Session = require("../models/MtmMarketplaceSession");
const Activity = require("../models/MtmMarketplaceActivity");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const clean = v => String(v ?? "").trim();

function auth(req,res,next){
  const raw=clean(req.headers.authorization);
  if(!raw.toLowerCase().startsWith("bearer ")) return res.status(401).json({success:false,message:"Access Denied"});
  try{
    const user=jwt.verify(raw.slice(7).trim(),JWT_SECRET);
    const role=clean(user.role).toUpperCase();
    if(!["PLATFORM_ADMIN","SUPER_ADMIN","ADMIN"].includes(role)) return res.status(403).json({success:false,message:"Access Denied"});
    req.authUser=user; next();
  }catch(e){ return res.status(401).json({success:false,message:"Invalid Token"}); }
}
router.use(auth);

function tenantId(req){
  if(clean(req.authUser.role).toUpperCase()==="PLATFORM_ADMIN" && clean(req.query.tenantId || req.body?.tenantId)) return clean(req.query.tenantId || req.body?.tenantId);
  return clean(req.authUser.tenantId || req.authUser.companyId || req.authUser.organizationId);
}
function zipList(v){ return (Array.isArray(v)?v:String(v||"").split(/[\s,]+/)).map(x=>clean(x)).filter(Boolean); }
function engine(v={}){
  return {
    enabled:v.enabled===true, autoAccept:v.autoAccept===true,
    milesMin:Math.max(0,Number(v.milesMin)||0), milesMax:Math.max(0,Number(v.milesMax)||0),
    dailyTripLimit:Math.max(0,Number(v.dailyTripLimit)||0),
    pickupTimeFrom:clean(v.pickupTimeFrom)||"00:00", pickupTimeTo:clean(v.pickupTimeTo)||"23:59",
    dropoffTimeFrom:clean(v.dropoffTimeFrom)||"00:00", dropoffTimeTo:clean(v.dropoffTimeTo)||"23:59",
    pickupZipCodes:zipList(v.pickupZipCodes), dropoffZipCodes:zipList(v.dropoffZipCodes),
    zoneMatch:["ANY","PICKUP","DROPOFF","EITHER","BOTH"].includes(clean(v.zoneMatch).toUpperCase())?clean(v.zoneMatch).toUpperCase():"ANY",
    modes:zipList(v.modes)
  };
}

router.get("/settings",async(req,res)=>{
  try{ const id=tenantId(req); if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    let doc=await Settings.findOne({tenantId:id});
    if(!doc) doc=await Settings.create({tenantId:id});
    res.json({success:true,settings:doc});
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

router.put("/settings",async(req,res)=>{
  try{ const id=tenantId(req); if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const b=req.body||{};
    const update={enabled:b.enabled===true,connectionMethod:clean(b.connectionMethod)==="MTM_API"?"MTM_API":"MTM_PORTAL",dateWindowDays:Math.min(31,Math.max(1,Number(b.dateWindowDays)||7)),totalDailyTripLimit:Math.max(0,Number(b.totalDailyTripLimit)||0),longEngine:engine(b.longEngine),shortEngine:engine(b.shortEngine)};
    if(clean(b.integrationId)) update.integrationId=clean(b.integrationId);
    if(clean(b.tenantSlug)) update.tenantSlug=clean(b.tenantSlug).toLowerCase();
    const doc=await Settings.findOneAndUpdate({tenantId:id},{$set:update},{new:true,upsert:true,setDefaultsOnInsert:true,runValidators:true});
    res.json({success:true,settings:doc});
  }catch(e){res.status(400).json({success:false,message:e.message});}
});

router.get("/status",async(req,res)=>{
  try{ const id=tenantId(req); if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const session=await Session.findOne({tenantId:id}).select("-encryptedSessionState");
    res.json({success:true,session:session||{status:"DISCONNECTED"}});
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

router.get("/activity",async(req,res)=>{
  try{ const id=tenantId(req); if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const limit=Math.min(200,Math.max(1,Number(req.query.limit)||50));
    const rows=await Activity.find({tenantId:id}).sort({occurredAt:-1}).limit(limit).lean();
    res.json({success:true,activity:rows});
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

/* Connector actions are intentionally added when server/services/mtm is installed. */
router.post("/connect",(req,res)=>res.status(501).json({success:false,message:"MTM connector service is not installed yet"}));
router.post("/scan",(req,res)=>res.status(501).json({success:false,message:"MTM connector service is not installed yet"}));

module.exports=router;
