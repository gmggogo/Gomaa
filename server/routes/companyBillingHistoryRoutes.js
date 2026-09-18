"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const BillingHistory =
  require("../models/BillingHistory");

const User =
  require("../models/User");

const Trip =
  require("../models/Trip");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function clean(v){
  return String(v ?? "").trim();
}

function normalizeRole(v){
  return clean(v)
    .toUpperCase()
    .replace(/[\s-]+/g,"_");
}

function auth(req,res,next){
  const header =
    clean(
      req.headers.authorization
    );

  if(
    !header
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{
    const decoded =
      jwt.verify(
        header.slice(7).trim(),
        JWT_SECRET
      );

    const role =
      normalizeRole(decoded.role);

    if(
      ![
        "SUPER_ADMIN",
        "SUPERADMIN"
      ].includes(role)
    ){
      return res.status(403).json({
        success:false,
        message:"Super Admin access required"
      });
    }

    if(!decoded.tenantId){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    req.billingAuth = {
      tenantId:
        String(decoded.tenantId),
      role
    };

    next();

  }catch(err){
    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

async function companyForRequest(
  req,
  companyId
){
  return User.findOne({
    _id:companyId,
    tenantId:
      req.billingAuth.tenantId,
    role:{
      $in:[
        /^company$/i,
        /^facility$/i
      ]
    }
  });
}

function invoiceNumberFor(row){
  const current =
    clean(row?.invoiceNumber);

  if(current){
    return current;
  }

  return (
    "GH-COMP-" +
    String(row?._id || "")
      .slice(-8)
      .toUpperCase()
  );
}

/* =========================
   3-YEAR COMPANY HISTORY
========================= */

router.get(
  "/:companyId",
  auth,
  async (req,res)=>{
    try{
      const company =
        await companyForRequest(
          req,
          req.params.companyId
        );

      if(!company){
        return res.status(404).json({
          success:false,
          message:"Company not found"
        });
      }

      const cutoff =
        new Date();

      cutoff.setFullYear(
        cutoff.getFullYear() - 3
      );

      const rows =
        await BillingHistory
          .find({
            companyId:
              String(company._id),
            paidDate:{
              $gte:cutoff
            }
          })
          .sort({
            paidDate:-1,
            createdAt:-1
          })
          .lean();

      const history =
        rows.map(row=>({
          ...row,
          invoiceNumber:
            invoiceNumberFor(row)
        }));

      return res.json({
        success:true,
        company:{
          id:company._id,
          name:company.name || "",
          email:company.email || "",
          phone:company.phone || ""
        },
        retentionYears:3,
        history
      });

    }catch(err){
      console.log(
        "COMPANY BILLING HISTORY ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to load payment history"
      });
    }
  }
);

/* =========================
   ONE HISTORICAL INVOICE
========================= */

router.get(
  "/:companyId/:historyId",
  auth,
  async (req,res)=>{
    try{
      const company =
        await companyForRequest(
          req,
          req.params.companyId
        );

      if(!company){
        return res.status(404).json({
          success:false,
          message:"Company not found"
        });
      }

      const row =
        await BillingHistory
          .findOne({
            _id:req.params.historyId,
            companyId:
              String(company._id)
          })
          .lean();

      if(!row){
        return res.status(404).json({
          success:false,
          message:"Invoice not found"
        });
      }

      return res.json({
        success:true,
        company:{
          id:company._id,
          name:company.name || "",
          email:company.email || "",
          phone:company.phone || ""
        },
        invoice:{
          ...row,
          invoiceNumber:
            invoiceNumberFor(row)
        }
      });

    }catch(err){
      console.log(
        "COMPANY HISTORICAL INVOICE ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to load invoice"
      });
    }
  }
);

/* =========================
   MANUAL MARK PAID + SNAPSHOT
========================= */

router.put(
  "/:companyId/mark-paid",
  auth,
  async (req,res)=>{
    try{
      const company =
        await companyForRequest(
          req,
          req.params.companyId
        );

      if(!company){
        return res.status(404).json({
          success:false,
          message:"Company not found"
        });
      }

      const now =
        new Date();

      const invoiceNumber =
        "GH-COMP-" +
        now
          .getTime()
          .toString(36)
          .toUpperCase() +
        "-" +
        String(company._id)
          .slice(-5)
          .toUpperCase();

      const tripFilter = {
        tenantId:
          company.tenantId,
        company:{
          $regex:
            "^" +
            String(company.name || "")
              .trim()
              .replace(/[.*+?^${}()|[\]\\]/g,"\\$&") +
            "$",
          $options:"i"
        },
        billingPaid:{
          $ne:true
        }
      };

      const billableTrips =
        await Trip
          .find(tripFilter)
          .select("_id")
          .lean();

      await BillingHistory.create({
        tenantId:
          String(company.tenantId || ""),
        companyId:
          String(company._id),
        companyName:
          company.name || "",
        companyEmail:
          company.email || "",
        companyPhone:
          company.phone || "",
        invoiceNumber,
        billingStartDate:
          company.billingStartDate || null,
        billingEndDate:
          company.billingEndDate || null,
        totalTrips:
          Number(company.totalTrips || 0),
        individualTrips:
          Number(company.individualTrips || 0),
        sharedTrips:
          Number(company.sharedTrips || 0),
        sharedPassengers:
          Number(company.sharedPassengers || 0),
        completedTrips:
          Number(company.completedTrips || 0),
        cancelledTrips:
          Number(company.cancelledTrips || 0),
        noShowTrips:
          Number(company.noShowTrips || 0),
        revenue:
          Number(company.revenue || 0),
        invoiceAmount:
          Number(company.invoiceAmount || 0),
        paidDate:now,
        paymentMethod:"MANUAL",
        tripIds:
          billableTrips.map(
            row=>row._id
          )
      });

      await Trip.updateMany(
        tripFilter,
        {
          $set:{
            billingPaid:true
          }
        }
      );

      let nextBillingDate =
        new Date(now);

      if(
        String(company.billingCycle || "")
          .toUpperCase() === "WEEKLY"
      ){
        nextBillingDate.setDate(
          nextBillingDate.getDate() + 7
        );
      }else{
        nextBillingDate.setMonth(
          nextBillingDate.getMonth() + 1
        );
      }

      company.billingStatus =
        "ACTIVE";

      company.billingLocked =
        false;

      company.lastPaymentDate =
        now;

      company.billingStartDate =
        new Date(now);

      company.billingEndDate =
        new Date(nextBillingDate);

      company.nextBillingDate =
        new Date(nextBillingDate);

      company.invoiceAmount = 0;
      company.revenue = 0;
      company.totalTrips = 0;
      company.individualTrips = 0;
      company.sharedTrips = 0;
      company.sharedPassengers = 0;
      company.completedTrips = 0;
      company.cancelledTrips = 0;
      company.noShowTrips = 0;

      await company.save();

      return res.json({
        success:true,
        invoiceNumber,
        message:"Billing marked paid and saved to payment history"
      });

    }catch(err){
      console.log(
        "COMPANY MANUAL PAYMENT HISTORY ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to mark invoice paid"
      });
    }
  }
);

module.exports = router;
