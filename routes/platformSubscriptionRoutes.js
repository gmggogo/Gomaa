"use strict";

const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Tenant = require("../models/Tenant");
const BrokerIntegration = require("../models/BrokerIntegration");
const TenantSubscriptionPayment =
  require("../models/TenantSubscriptionPayment");

const {
  verifyToken,
  requireRole
} = require("../middleware/authmiddleware");

const {
  clean,
  nonNegative,
  whole,
  nullableMoney,
  normalizeCycle,
  getDefaultPackage,
  calculatePricing,
  ensureTenantPricing
} = require("../utils/saasPricingEngine");

router.use(
  verifyToken,
  requireRole("PLATFORM_ADMIN")
);

function normalizeStatus(v){
  const status = clean(v).toUpperCase();

  return [
    "ACTIVE",
    "TRIAL",
    "PAST_DUE",
    "SUSPENDED"
  ].includes(status)
    ? status
    : "ACTIVE";
}

function normalizeControlRows(rows){
  return (Array.isArray(rows) ? rows : [])
    .map(row=>({
      key:clean(row.key),
      label:clean(row.label) || clean(row.key),
      accessEnabled:row.accessEnabled !== false,
      billingEnabled:row.billingEnabled !== false
    }))
    .filter(row=>row.key);
}

async function getActualBrokerCount(tenantId){
  return BrokerIntegration.countDocuments({ tenantId });
}

function applyBrokerPricing(basePricing,subscription,actualBrokers){
  const pricing = { ...(basePricing || {}) };

  const includedBrokers = whole(subscription?.includedBrokers,0);
  const freeExtraBrokers = whole(subscription?.freeExtraBrokers,0);
  const extraBrokerPrice = nonNegative(subscription?.extraBrokerPrice,0);
  const actual = whole(actualBrokers,0);

  const extraBrokers = Math.max(0,actual - includedBrokers);
  const billableExtraBrokers = Math.max(0,extraBrokers - freeExtraBrokers);
  const brokerAmount = Number((billableExtraBrokers * extraBrokerPrice).toFixed(2));

  const hasFinalOverride =
    subscription?.finalPriceOverride !== undefined &&
    subscription?.finalPriceOverride !== null &&
    clean(subscription?.finalPriceOverride) !== "";

  const baseSubtotal = Number(pricing.subtotal || 0);
  const baseFinal = Number(pricing.finalAmount || 0);

  pricing.actualBrokers = actual;
  pricing.includedBrokers = includedBrokers;
  pricing.extraBrokers = extraBrokers;
  pricing.freeExtraBrokers = freeExtraBrokers;
  pricing.billableExtraBrokers = billableExtraBrokers;
  pricing.extraBrokerPrice = extraBrokerPrice;
  pricing.brokerAmount = brokerAmount;
  pricing.subtotal = Number((baseSubtotal + brokerAmount).toFixed(2));
  pricing.finalAmount = hasFinalOverride
    ? nonNegative(subscription.finalPriceOverride,0)
    : Number((baseFinal + brokerAmount).toFixed(2));

  return pricing;
}

function applyCompanyPayload(subscription,body){
  if(body.planName !== undefined){
    subscription.planName =
      clean(body.planName) ||
      subscription.planName;
  }

  if(body.billingCycle !== undefined){
    subscription.billingCycle =
      normalizeCycle(body.billingCycle);
  }

  if(body.basePackageEnabled !== undefined){
    subscription.basePackageEnabled =
      body.basePackageEnabled === true;
  }

  [
    "basePrice",
    "extraVehiclePrice",
    "extraDispatcherPrice",
    "extraAdminPrice",
    "extraSuperAdminPrice",
    "extraCompanyPrice",
    "extraServicePrice",
    "extraBrokerPrice",
    "discount",
    "credit"
  ].forEach(field=>{
    if(body[field] !== undefined){
      subscription[field] =
        nonNegative(body[field]);
    }
  });

  [
    "includedVehicles",
    "includedServices",
    "includedBrokers",
    "freeExtraVehicles",
    "freeExtraServices",
    "freeExtraBrokers",
    "maxDrivers",
    "maxVehicles",
    "maxAdmins",
    "maxSuperAdmins",
    "maxDispatchers",
    "maxCompanies",
    "maxServices",
    "maxBrokers"
  ].forEach(field=>{
    if(body[field] !== undefined){
      subscription[field] =
        whole(body[field]);
    }
  });

  if(body.finalPriceOverride !== undefined){
    subscription.finalPriceOverride =
      nullableMoney(body.finalPriceOverride);
  }

  if(body.status !== undefined){
    subscription.status =
      normalizeStatus(body.status);
  }

  if(body.graceDays !== undefined){
    subscription.graceDays =
      Math.min(60,whole(body.graceDays,3));
  }

  if(body.dueDate !== undefined){
    if(!body.dueDate){
      subscription.dueDate = null;
      subscription.nextBillingDate = null;
    }else{
      const date = new Date(body.dueDate);

      if(!Number.isNaN(date.getTime())){
        subscription.dueDate = date;
        subscription.nextBillingDate = date;
      }
    }
  }

  if(Array.isArray(body.vehicleControls)){
    subscription.vehicleControls =
      normalizeControlRows(body.vehicleControls);
  }

  if(Array.isArray(body.serviceControls)){
    subscription.serviceControls =
      normalizeControlRows(body.serviceControls);
  }

  subscription.pricingInitialized = true;
  subscription.limitsInitialized = true;
  subscription.pricingUpdatedAt = new Date();
}

router.get(
  "/default-package",
  async (req,res)=>{
    try{
      const row = await getDefaultPackage();

      return res.json({
        success:true,
        defaultPackage:row
      });

    }catch(err){
      console.error(
        "DEFAULT PACKAGE GET ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to load default package"
      });
    }
  }
);

router.put(
  "/default-package",
  async (req,res)=>{
    try{
      const row = await getDefaultPackage();

      row.packageName =
        clean(req.body?.packageName) ||
        "GH Mobility Starter";

      row.basePrice =
        nonNegative(req.body?.basePrice,99);

      row.includedVehicles =
        whole(req.body?.includedVehicles,5);

      row.includedServices =
        whole(req.body?.includedServices,2);

      row.includedBrokers =
        whole(req.body?.includedBrokers,0);

      row.maxDrivers =
        whole(req.body?.maxDrivers,5);

      row.maxVehicles =
        whole(
          req.body?.maxVehicles,
          row.includedVehicles || 5
        );

      row.maxAdmins =
        whole(req.body?.maxAdmins,2);

      row.maxSuperAdmins =
        whole(req.body?.maxSuperAdmins,2);

      row.maxDispatchers =
        whole(req.body?.maxDispatchers,2);

      row.maxCompanies =
        whole(req.body?.maxCompanies,3);

      row.maxServices =
        whole(
          req.body?.maxServices,
          row.includedServices || 2
        );

      row.maxBrokers =
        whole(
          req.body?.maxBrokers,
          row.includedBrokers || 1
        );

      row.billingCycle =
        normalizeCycle(req.body?.billingCycle);

      row.extraVehiclePrice =
        nonNegative(req.body?.extraVehiclePrice,10);

      row.extraDispatcherPrice =
        nonNegative(req.body?.extraDispatcherPrice,0);

      row.extraAdminPrice =
        nonNegative(req.body?.extraAdminPrice,0);

      row.extraSuperAdminPrice =
        nonNegative(req.body?.extraSuperAdminPrice,0);

      row.extraCompanyPrice =
        nonNegative(req.body?.extraCompanyPrice,0);

      row.extraServicePrice =
        nonNegative(req.body?.extraServicePrice,15);

      row.extraBrokerPrice =
        nonNegative(req.body?.extraBrokerPrice,0);

      row.freeExtraBrokers =
        whole(req.body?.freeExtraBrokers,0);

      row.packageStatus =
        clean(req.body?.packageStatus)
          .toUpperCase() === "DISABLED"
            ? "DISABLED"
            : "ACTIVE";

      await row.save();

      return res.json({
        success:true,
        message:
          "Default package updated. Existing company pricing was not changed.",
        defaultPackage:row
      });

    }catch(err){
      console.error(
        "DEFAULT PACKAGE UPDATE ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to update default package"
      });
    }
  }
);

router.get(
  "/bootstrap",
  async (req,res)=>{
    try{
      const defaults = await getDefaultPackage();

      const tenants = await Tenant.find({})
        .sort({createdAt:-1});

      const companies = [];

      for(const tenant of tenants){
        const data = await ensureTenantPricing(tenant);

        companies.push({
          tenant:{
            id:String(tenant._id),
            name:tenant.name || "",
            slug:tenant.slug || "",
            enabled:tenant.enabled !== false,
            subscriptionStatus:
              tenant.subscriptionStatus || "ACTIVE"
          },
          subscription:data.subscription.toObject(),
          usage:{
            ...data.usage,
            actualBrokers:await getActualBrokerCount(tenant._id)
          },
          pricing:applyBrokerPricing(
            data.pricing,
            data.subscription,
            await getActualBrokerCount(tenant._id)
          )
        });
      }

      return res.json({
        success:true,
        defaultPackage:defaults,
        companies
      });

    }catch(err){
      console.error(
        "PLATFORM BILLING BOOTSTRAP ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to load platform billing"
      });
    }
  }
);

router.get(
  "/payment-summary",
  async (req,res)=>{
    try{
      const tenants = await Tenant.find({})
        .sort({createdAt:-1});

      const now = new Date();
      const monthStart =
        new Date(
          now.getFullYear(),
          now.getMonth(),
          1
        );

      const paidThisMonthAgg =
        await TenantSubscriptionPayment.aggregate([
          {
            $match:{
              status:"PAID",
              paidAt:{
                $gte:monthStart
              }
            }
          },
          {
            $group:{
              _id:null,
              total:{
                $sum:"$amount"
              }
            }
          }
        ]);

      let recurringAmount = 0;
      let outstanding = 0;
      let activeCompanies = 0;
      let disabledCompanies = 0;
      let pastDueCompanies = 0;

      const companies = [];

      for(const tenant of tenants){
        const data =
          await ensureTenantPricing(tenant);

        const subscription =
          data.subscription;

        const enabled =
          tenant.enabled !== false;

        let status =
          enabled
            ? clean(
                subscription.status ||
                tenant.subscriptionStatus ||
                "ACTIVE"
              ).toUpperCase()
            : "DISABLED";

        if(status === "ACTIVE"){
          activeCompanies += 1;
        }

        if(status === "DISABLED"){
          disabledCompanies += 1;
        }

        if(status === "PAST_DUE"){
          pastDueCompanies += 1;
        }

        const actualBrokers =
          await getActualBrokerCount(tenant._id);

        const pricingWithBrokers =
          applyBrokerPricing(
            data.pricing,
            subscription,
            actualBrokers
          );

        const amount =
          Number(
            pricingWithBrokers?.finalAmount ||
            subscription.amount ||
            0
          );

        if(enabled){
          recurringAmount += amount;
        }

        if(
          ["PAST_DUE","SUSPENDED"].includes(status)
        ){
          outstanding += amount;
        }

        companies.push({
          tenantId:String(tenant._id),
          name:tenant.name || "",
          planName:subscription.planName || "",
          amount,
          lastPaymentDate:
            subscription.lastPaymentDate || null,
          nextPaymentDate:
            subscription.nextBillingDate ||
            subscription.dueDate ||
            null,
          status
        });
      }

      return res.json({
        success:true,
        metrics:{
          activeCompanies,
          disabledCompanies,
          pastDueCompanies,
          recurringAmount:Number(recurringAmount.toFixed(2)),
          paidThisMonth:Number(
            (
              paidThisMonthAgg[0]?.total ||
              0
            ).toFixed(2)
          ),
          outstanding:Number(outstanding.toFixed(2))
        },
        companies
      });

    }catch(err){
      console.error(
        "PAYMENT SUMMARY ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to load payment summary"
      });
    }
  }
);

router.put(
  "/tenants/:tenantId/enabled",
  async (req,res)=>{
    try{
      if(
        !mongoose.Types.ObjectId.isValid(
          String(req.params.tenantId)
        )
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid tenant id"
        });
      }

      const enabled =
        req.body?.enabled === true;

      const tenant =
        await Tenant.findByIdAndUpdate(
          req.params.tenantId,
          {
            $set:{
              enabled
            }
          },
          {
            new:true,
            runValidators:true
          }
        );

      if(!tenant){
        return res.status(404).json({
          success:false,
          message:"Tenant not found"
        });
      }

      return res.json({
        success:true,
        tenant:{
          id:String(tenant._id),
          name:tenant.name || "",
          enabled:tenant.enabled !== false
        }
      });

    }catch(err){
      console.error(
        "TENANT ENABLE UPDATE ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to update company access"
      });
    }
  }
);

router.get(
  "/tenants/:tenantId/subscription",
  async (req,res)=>{
    try{
      if(
        !mongoose.Types.ObjectId.isValid(
          String(req.params.tenantId)
        )
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid tenant id"
        });
      }

      const tenant =
        await Tenant.findById(req.params.tenantId);

      if(!tenant){
        return res.status(404).json({
          success:false,
          message:"Tenant not found"
        });
      }

      const data =
        await ensureTenantPricing(tenant);

      return res.json({
        success:true,
        tenant:{
          id:String(tenant._id),
          name:tenant.name || "",
          slug:tenant.slug || "",
          enabled:tenant.enabled !== false
        },
        subscription:data.subscription,
        usage:{
          ...data.usage,
          actualBrokers:await getActualBrokerCount(tenant._id)
        },
        pricing:applyBrokerPricing(
          data.pricing,
          data.subscription,
          await getActualBrokerCount(tenant._id)
        )
      });

    }catch(err){
      console.error(
        "PLATFORM SUBSCRIPTION GET ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to load subscription"
      });
    }
  }
);

router.post(
  "/tenants/:tenantId/preview",
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

      const data =
        await ensureTenantPricing(tenant);

      const draft =
        data.subscription.toObject();

      Object.assign(draft,{
        planName:
          req.body?.planName !== undefined
            ? clean(req.body.planName)
            : draft.planName,

        billingCycle:
          req.body?.billingCycle !== undefined
            ? normalizeCycle(req.body.billingCycle)
            : draft.billingCycle,

        basePackageEnabled:
          req.body?.basePackageEnabled !== undefined
            ? req.body.basePackageEnabled === true
            : draft.basePackageEnabled,

        basePrice:
          req.body?.basePrice !== undefined
            ? nonNegative(req.body.basePrice)
            : draft.basePrice,

        includedVehicles:
          req.body?.includedVehicles !== undefined
            ? whole(req.body.includedVehicles)
            : draft.includedVehicles,

        includedServices:
          req.body?.includedServices !== undefined
            ? whole(req.body.includedServices)
            : draft.includedServices,

        includedBrokers:
          req.body?.includedBrokers !== undefined
            ? whole(req.body.includedBrokers)
            : draft.includedBrokers,

        maxDrivers:
          req.body?.maxDrivers !== undefined
            ? whole(req.body.maxDrivers)
            : draft.maxDrivers,

        maxVehicles:
          req.body?.maxVehicles !== undefined
            ? whole(req.body.maxVehicles)
            : draft.maxVehicles,

        maxAdmins:
          req.body?.maxAdmins !== undefined
            ? whole(req.body.maxAdmins)
            : draft.maxAdmins,

        maxSuperAdmins:
          req.body?.maxSuperAdmins !== undefined
            ? whole(req.body.maxSuperAdmins)
            : draft.maxSuperAdmins,

        maxDispatchers:
          req.body?.maxDispatchers !== undefined
            ? whole(req.body.maxDispatchers)
            : draft.maxDispatchers,

        maxCompanies:
          req.body?.maxCompanies !== undefined
            ? whole(req.body.maxCompanies)
            : draft.maxCompanies,

        maxServices:
          req.body?.maxServices !== undefined
            ? whole(req.body.maxServices)
            : draft.maxServices,

        maxBrokers:
          req.body?.maxBrokers !== undefined
            ? whole(req.body.maxBrokers)
            : draft.maxBrokers,

        extraVehiclePrice:
          req.body?.extraVehiclePrice !== undefined
            ? nonNegative(req.body.extraVehiclePrice)
            : draft.extraVehiclePrice,

        extraDispatcherPrice:
          req.body?.extraDispatcherPrice !== undefined
            ? nonNegative(req.body.extraDispatcherPrice)
            : draft.extraDispatcherPrice,

        extraAdminPrice:
          req.body?.extraAdminPrice !== undefined
            ? nonNegative(req.body.extraAdminPrice)
            : draft.extraAdminPrice,

        extraSuperAdminPrice:
          req.body?.extraSuperAdminPrice !== undefined
            ? nonNegative(req.body.extraSuperAdminPrice)
            : draft.extraSuperAdminPrice,

        extraCompanyPrice:
          req.body?.extraCompanyPrice !== undefined
            ? nonNegative(req.body.extraCompanyPrice)
            : draft.extraCompanyPrice,

        extraServicePrice:
          req.body?.extraServicePrice !== undefined
            ? nonNegative(req.body.extraServicePrice)
            : draft.extraServicePrice,

        extraBrokerPrice:
          req.body?.extraBrokerPrice !== undefined
            ? nonNegative(req.body.extraBrokerPrice)
            : draft.extraBrokerPrice,

        freeExtraVehicles:
          req.body?.freeExtraVehicles !== undefined
            ? whole(req.body.freeExtraVehicles)
            : draft.freeExtraVehicles,

        freeExtraServices:
          req.body?.freeExtraServices !== undefined
            ? whole(req.body.freeExtraServices)
            : draft.freeExtraServices,

        freeExtraBrokers:
          req.body?.freeExtraBrokers !== undefined
            ? whole(req.body.freeExtraBrokers)
            : draft.freeExtraBrokers,

        discount:
          req.body?.discount !== undefined
            ? nonNegative(req.body.discount)
            : draft.discount,

        credit:
          req.body?.credit !== undefined
            ? nonNegative(req.body.credit)
            : draft.credit,

        finalPriceOverride:
          req.body?.finalPriceOverride !== undefined
            ? nullableMoney(req.body.finalPriceOverride)
            : draft.finalPriceOverride,

        vehicleControls:
          Array.isArray(req.body?.vehicleControls)
            ? normalizeControlRows(req.body.vehicleControls)
            : draft.vehicleControls,

        serviceControls:
          Array.isArray(req.body?.serviceControls)
            ? normalizeControlRows(req.body.serviceControls)
            : draft.serviceControls
      });

      const actualBrokers =
        await getActualBrokerCount(tenant._id);

      const pricing =
        applyBrokerPricing(
          calculatePricing(
            draft,
            {
              ...data.usage,
              actualBrokers
            }
          ),
          draft,
          actualBrokers
        );

      return res.json({
        success:true,
        pricing
      });

    }catch(err){
      console.error(
        "PRICING PREVIEW ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to preview pricing"
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

      const data =
        await ensureTenantPricing(tenant);

      const subscription =
        data.subscription;

      applyCompanyPayload(
        subscription,
        req.body || {}
      );

      const actualBrokers =
        await getActualBrokerCount(tenant._id);

      const pricing =
        applyBrokerPricing(
          calculatePricing(
            subscription,
            {
              ...data.usage,
              actualBrokers
            }
          ),
          subscription,
          actualBrokers
        );

      subscription.vehicleControls =
        pricing.vehicleControls;

      subscription.serviceControls =
        pricing.serviceControls;

      subscription.calculatedBaseAmount =
        pricing.baseAmount;

      subscription.calculatedVehicleAmount =
        pricing.vehicleAmount;

      subscription.calculatedDispatcherAmount =
        pricing.dispatcherAmount;

      subscription.calculatedAdminAmount =
        pricing.adminAmount;

      subscription.calculatedSuperAdminAmount =
        pricing.superAdminAmount;

      subscription.calculatedCompanyAmount =
        pricing.companyAmount;

      subscription.calculatedServiceAmount =
        pricing.serviceAmount;

      subscription.calculatedBrokerAmount =
        pricing.brokerAmount;

      subscription.calculatedSubtotal =
        pricing.subtotal;

      subscription.calculatedFinalAmount =
        pricing.finalAmount;

      subscription.amount =
        pricing.finalAmount;

      await subscription.save();

      return res.json({
        success:true,
        message:"Company pricing updated",
        subscription,
        pricing
      });

    }catch(err){
      console.error(
        "PLATFORM SUBSCRIPTION UPDATE ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to update subscription"
      });
    }
  }
);

router.get(
  "/tenants/:tenantId/payment-history",
  async (req,res)=>{
    try{
      const history =
        await TenantSubscriptionPayment.find({
          tenantId:req.params.tenantId
        })
        .sort({createdAt:-1})
        .limit(100)
        .lean();

      return res.json({
        success:true,
        history
      });

    }catch(err){
      console.error(
        "PAYMENT HISTORY ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to load payment history"
      });
    }
  }
);

module.exports = router;