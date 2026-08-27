"use strict";

const express = require("express");
const router = express.Router();

const Tenant = require("../models/Tenant");
const TenantSubscription = require("../models/TenantSubscription");

const {
  verifyToken,
  requireRole
} = require("../middleware/authmiddleware");

router.use(
  verifyToken,
  requireRole("PLATFORM_ADMIN")
);

function clean(v){
  return String(v ?? "").trim();
}

router.get(
  "/tenants/:tenantId/subscription",
  async (req,res)=>{
    try{
      const tenant =
        await Tenant.findById(req.params.tenantId).lean();

      if(!tenant){
        return res.status(404).json({
          success:false,
          message:"Tenant not found"
        });
      }

      const subscription =
        await TenantSubscription
        .findOne({tenantId:tenant._id})
        .lean();

      return res.json({
        success:true,
        tenant:{
          id:tenant._id,
          name:tenant.name,
          slug:tenant.slug
        },
        subscription:subscription || null
      });

    }catch(err){
      console.error("PLATFORM SUBSCRIPTION GET ERROR:",err);

      return res.status(500).json({
        success:false,
        message:"Unable to load subscription"
      });
    }
  }
);

router.put(
  "/tenants/:tenantId/subscription",
  async (req,res)=>{
    try{
      const tenant =
        await Tenant.findById(req.params.tenantId);

      if(!tenant){
        return res.status(404).json({
          success:false,
          message:"Tenant not found"
        });
      }

      const billingCycle =
        clean(req.body?.billingCycle || "ANNUAL")
        .toUpperCase();

      if(!["MONTHLY","ANNUAL"].includes(billingCycle)){
        return res.status(400).json({
          success:false,
          message:"Invalid billing cycle"
        });
      }

      const amount = Number(req.body?.amount || 0);

      if(!Number.isFinite(amount) || amount < 0){
        return res.status(400).json({
          success:false,
          message:"Invalid amount"
        });
      }

      const graceDays =
        Math.max(
          0,
          Math.min(
            60,
            Number(req.body?.graceDays ?? 3) || 0
          )
        );

      let dueDate = null;

      if(req.body?.dueDate){
        dueDate = new Date(req.body.dueDate);

        if(Number.isNaN(dueDate.getTime())){
          return res.status(400).json({
            success:false,
            message:"Invalid due date"
          });
        }
      }

      const set = {
        planName:
          clean(req.body?.planName || "GH Mobility"),

        billingCycle,
        amount,
        graceDays
      };

      if(dueDate){
        set.dueDate = dueDate;
        set.nextBillingDate = dueDate;
      }

      const subscription =
        await TenantSubscription.findOneAndUpdate(
          {tenantId:tenant._id},
          {
            $set:set,
            $setOnInsert:{
              status:"ACTIVE"
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
        message:"Subscription updated",
        subscription
      });

    }catch(err){
      console.error("PLATFORM SUBSCRIPTION UPDATE ERROR:",err);

      return res.status(500).json({
        success:false,
        message:"Unable to update subscription"
      });
    }
  }
);

module.exports = router;