"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const stripe = require("stripe")(
  process.env.STRIPE_SECRET_KEY
);

const Tenant = require("../models/Tenant");
const TenantSubscription = require("../models/TenantSubscription");
const TenantSubscriptionPayment = require("../models/TenantSubscriptionPayment");
const BrokerIntegration = require("../models/BrokerIntegration");
const {
  ensureTenantPricing
} = require("../utils/saasPricingEngine");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

const PUBLIC_BASE_URL =
  String(
    process.env.PUBLIC_BASE_URL ||
    "https://sunbeam-933q.onrender.com"
  )
  .trim()
  .replace(/\/+$/,"");

const DAY_MS =
  24 * 60 * 60 * 1000;

function clean(v){
  return String(v ?? "").trim();
}

function nonNegative(v,fallback=0){
  const n = Number(v);
  return Number.isFinite(n)
    ? Math.max(0,n)
    : Math.max(0,Number(fallback) || 0);
}

function whole(v,fallback=0){
  return Math.max(
    0,
    Math.floor(nonNegative(v,fallback))
  );
}

async function getActiveBillingBrokers(tenantId){
  return BrokerIntegration.find({
    tenantId,
    enabled:{ $ne:false },
    billingEnabled:{ $ne:false }
  })
  .select("brokerName brokerCode enabled billingEnabled")
  .sort({brokerName:1,brokerCode:1})
  .lean();
}

function applyBrokerPricing(basePricing,subscription,brokers){
  const pricing = { ...(basePricing || {}) };

  const list =
    Array.isArray(brokers)
      ? brokers
      : [];

  const actualBrokers =
    list.length;

  const includedBrokers =
    whole(subscription?.includedBrokers,0);

  const freeExtraBrokers =
    whole(subscription?.freeExtraBrokers,0);

  const extraBrokerPrice =
    nonNegative(subscription?.extraBrokerPrice,0);

  const extraBrokers =
    Math.max(
      0,
      actualBrokers - includedBrokers
    );

  const billableExtraBrokers =
    Math.max(
      0,
      extraBrokers - freeExtraBrokers
    );

  const brokerAmount =
    Number(
      (
        billableExtraBrokers *
        extraBrokerPrice
      ).toFixed(2)
    );

  const hasFinalOverride =
    subscription?.finalPriceOverride !== undefined &&
    subscription?.finalPriceOverride !== null &&
    clean(subscription?.finalPriceOverride) !== "";

  const baseFinal =
    Number(pricing.finalAmount || 0);

  const baseSubtotal =
    Number(pricing.subtotal || 0);

  pricing.actualBrokers =
    actualBrokers;

  pricing.includedBrokers =
    includedBrokers;

  pricing.extraBrokers =
    extraBrokers;

  pricing.freeExtraBrokers =
    freeExtraBrokers;

  pricing.billableExtraBrokers =
    billableExtraBrokers;

  pricing.extraBrokerPrice =
    extraBrokerPrice;

  pricing.brokerAmount =
    brokerAmount;

  pricing.maxBrokers =
    whole(
      subscription?.maxBrokers,
      includedBrokers
    );

  pricing.subtotal =
    Number(
      (
        baseSubtotal +
        brokerAmount
      ).toFixed(2)
    );

  pricing.finalAmount =
    hasFinalOverride
      ? nonNegative(
          subscription.finalPriceOverride,
          0
        )
      : Number(
          (
            baseFinal +
            brokerAmount
          ).toFixed(2)
        );

  return pricing;
}

function validDate(value){
  if(!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function paymentState(subscription,amountOverride=null){
  const now = new Date();

  const overrideNumber =
    Number(amountOverride);

  const planPrice =
    Number.isFinite(overrideNumber) &&
    amountOverride !== null &&
    amountOverride !== undefined
      ? Math.max(0,overrideNumber)
      : Number(
          subscription.amount ||
          0
        );

  const dueDate =
    validDate(
      subscription.nextBillingDate ||
      subscription.dueDate
    );

  if(!dueDate){
    return {
      planPrice,
      amountDue:planPrice,
      canPay:planPrice > 0,
      paymentWindowOpensAt:null,
      billingDueDate:null,
      billingKey:"IMMEDIATE"
    };
  }

  const paymentWindowOpensAt =
    new Date(
      dueDate.getTime() -
      DAY_MS
    );

  const canPay =
    planPrice > 0 &&
    now.getTime() >=
    paymentWindowOpensAt.getTime();

  return {
    planPrice,
    amountDue:
      canPay
        ? planPrice
        : 0,
    canPay,
    paymentWindowOpensAt,
    billingDueDate:dueDate,
    billingKey:
      dueDate
        .toISOString()
        .slice(0,10)
  };
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
      clean(decoded.role)
        .toUpperCase()
        .replace(/[\s-]+/g,"_");

    if(
      ![
        "SUPER_ADMIN",
        "SUPERADMIN",
        "ADMIN"
      ].includes(role)
    ){
      return res.status(403).json({
        success:false,
        message:"Admin access required"
      });
    }

    if(!decoded.tenantId){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    req.authUser = {
      role,
      tenantId:String(decoded.tenantId)
    };

    next();

  }catch(err){
    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

async function ensureSubscription(tenantId){
  const tenant =
    await Tenant.findById(tenantId);

  if(tenant){
    const data =
      await ensureTenantPricing(tenant);

    return data.subscription;
  }

  let row =
    await TenantSubscription.findOne({
      tenantId
    });

  if(!row){
    row =
      await TenantSubscription.create({
        tenantId,
        planName:"GH Mobility",
        billingCycle:"ANNUAL",
        amount:0,
        status:"ACTIVE",
        graceDays:3
      });
  }

  return row;
}

function runtime(subscription){
  const now = new Date();

  if(!subscription.dueDate){
    return {
      status:
        subscription.status ||
        "ACTIVE",
      locked:false
    };
  }

  const due =
    new Date(
      subscription.dueDate
    );

  if(now <= due){
    return {
      status:"ACTIVE",
      locked:false
    };
  }

  const graceEnd =
    new Date(due);

  graceEnd.setUTCDate(
    graceEnd.getUTCDate() +
    Number(
      subscription.graceDays ||
      0
    )
  );

  if(now <= graceEnd){
    return {
      status:"PAST_DUE",
      locked:false
    };
  }

  return {
    status:"SUSPENDED",
    locked:true
  };
}

function addCycle(date,cycle){
  const next = new Date(date);

  if(cycle === "MONTHLY"){
    next.setUTCMonth(
      next.getUTCMonth() + 1
    );
  }else{
    next.setUTCFullYear(
      next.getUTCFullYear() + 1
    );
  }

  return next;
}

async function markPaid(subscription,payment,session){
  if(payment.status === "PAID") return;

  const intent =
    typeof session.payment_intent === "string"
      ? await stripe.paymentIntents.retrieve(
          session.payment_intent
        )
      : session.payment_intent;

  if(
    !intent ||
    intent.status !== "succeeded"
  ){
    return;
  }

  const method =
    Array.isArray(
      intent.payment_method_types
    )
      ? String(
          intent.payment_method_types[0] ||
          ""
        )
      : "";

  payment.status = "PAID";
  payment.paymentIntentId =
    String(intent.id || "");

  payment.paymentMethod =
    method === "us_bank_account"
      ? "ACH"
      : method === "card"
        ? "CARD"
        : method.toUpperCase();

  payment.paidAt = new Date();

  await payment.save();

  const paidCycleDue =
    validDate(
      payment.billingDueDate
    );

  const currentDue =
    validDate(
      subscription.nextBillingDate ||
      subscription.dueDate
    );

  const cycleAlreadyAdvanced =
    paidCycleDue &&
    currentDue &&
    currentDue.getTime() >
      paidCycleDue.getTime() +
      DAY_MS;

  if(!cycleAlreadyAdvanced){
    const cycleBase =
      paidCycleDue ||
      currentDue ||
      payment.paidAt;

    subscription.lastPaymentDate =
      payment.paidAt;

    subscription.dueDate =
      addCycle(
        cycleBase,
        subscription.billingCycle
      );

    subscription.nextBillingDate =
      subscription.dueDate;

    subscription.status =
      "ACTIVE";

    await subscription.save();
  }

  await Tenant.findByIdAndUpdate(
    subscription.tenantId,
    {
      $set:{
        enabled:true,
        subscriptionStatus:"ACTIVE"
      }
    }
  );
}

router.get(
  "/me",
  auth,
  async (req,res)=>{
    try{
      const tenant =
        await Tenant.findById(
          req.authUser.tenantId
        );

      if(!tenant){
        return res.status(404).json({
          success:false,
          message:"Tenant not found"
        });
      }

      /*
        Use the same pricing engine used by Platform Billing.
        This keeps the company payment page synchronized with
        actual vehicles, enabled services and the final price.
      */
      const pricingData =
        await ensureTenantPricing(
          tenant
        );

      const subscription =
        pricingData.subscription;

      const usage =
        pricingData.usage || {};

      const brokers =
        await getActiveBillingBrokers(
          tenant._id
        );

      const pricing =
        applyBrokerPricing(
          pricingData.pricing || {},
          subscription,
          brokers
        );

      const state =
        runtime(subscription);

      const billing =
        paymentState(
          subscription,
          pricing.finalAmount
        );

      if(
        subscription.status !==
        state.status
      ){
        subscription.status =
          state.status;

        await subscription.save();
      }

      const history =
        await TenantSubscriptionPayment
          .find({
            tenantId:tenant._id
          })
          .sort({createdAt:-1})
          .limit(50)
          .lean();

      return res.json({
        success:true,

        tenant:{
          id:tenant._id,
          name:
            tenant.name ||
            tenant.branding?.companyName ||
            "Company"
        },

        subscription:{
          planName:
            subscription.planName,

          billingCycle:
            subscription.billingCycle,

          planPrice:
            billing.planPrice,

          amountDue:
            billing.amountDue,

          canPay:
            billing.canPay,

          paymentWindowOpensAt:
            billing.paymentWindowOpensAt,

          status:
            state.status,

          graceDays:
            subscription.graceDays,

          dueDate:
            subscription.dueDate,

          nextBillingDate:
            subscription.nextBillingDate ||
            subscription.dueDate,

          lastPaymentDate:
            subscription.lastPaymentDate,

          locked:
            state.locked,

          basePrice:
            Number(
              subscription.basePrice ||
              0
            ),

          includedVehicles:
            Number(
              subscription.includedVehicles ||
              0
            ),

          includedServices:
            Number(
              subscription.includedServices ||
              0
            ),

          extraVehiclePrice:
            Number(
              subscription.extraVehiclePrice ||
              0
            ),

          extraServicePrice:
            Number(
              subscription.extraServicePrice ||
              0
            ),

          freeExtraVehicles:
            Number(
              subscription.freeExtraVehicles ||
              0
            ),

          freeExtraServices:
            Number(
              subscription.freeExtraServices ||
              0
            ),

          includedBrokers:
            Number(
              subscription.includedBrokers ||
              0
            ),

          extraBrokerPrice:
            Number(
              subscription.extraBrokerPrice ||
              0
            ),

          freeExtraBrokers:
            Number(
              subscription.freeExtraBrokers ||
              0
            ),

          maxVehicles:
            Number(
              subscription.maxVehicles ||
              0
            ),

          maxServices:
            Number(
              subscription.maxServices ||
              0
            ),

          maxBrokers:
            Number(
              subscription.maxBrokers ||
              0
            ),

          maxDrivers:
            Number(
              subscription.maxDrivers ||
              0
            ),

          maxDispatchers:
            Number(
              subscription.maxDispatchers ||
              0
            ),

          maxAdmins:
            Number(
              subscription.maxAdmins ||
              0
            ),

          maxSuperAdmins:
            Number(
              subscription.maxSuperAdmins ||
              0
            ),

          maxCompanies:
            Number(
              subscription.maxCompanies ||
              0
            ),

          discount:
            Number(
              subscription.discount ||
              0
            ),

          credit:
            Number(
              subscription.credit ||
              0
            )
        },

        usage:{
          actualVehicles:
            Number(
              usage.actualVehicles ??
              pricing.actualVehicles ??
              0
            ),

          enabledServices:
            Number(
              usage.enabledServices ??
              pricing.enabledServices ??
              0
            ),

          actualDrivers:
            Number(
              usage.actualDrivers ??
              pricing.actualDrivers ??
              0
            ),

          actualDispatchers:
            Number(
              usage.actualDispatchers ??
              pricing.actualDispatchers ??
              0
            ),

          actualAdmins:
            Number(
              usage.actualAdmins ??
              pricing.actualAdmins ??
              0
            ),

          actualSuperAdmins:
            Number(
              usage.actualSuperAdmins ??
              pricing.actualSuperAdmins ??
              0
            ),

          actualCompanies:
            Number(
              usage.actualCompanies ??
              pricing.actualCompanies ??
              0
            ),

          actualBrokers:
            Number(
              pricing.actualBrokers ||
              0
            ),

          services:
            Array.isArray(usage.services)
              ? usage.services
              : [],

          brokers:
            brokers
        },

        pricing:{
          actualVehicles:
            Number(
              pricing.actualVehicles ||
              0
            ),

          enabledServices:
            Number(
              pricing.enabledServices ||
              0
            ),

          includedVehicles:
            Number(
              pricing.includedVehicles ||
              0
            ),

          includedServices:
            Number(
              pricing.includedServices ||
              0
            ),

          extraVehicles:
            Number(
              pricing.extraVehicles ||
              0
            ),

          extraServices:
            Number(
              pricing.extraServices ||
              0
            ),

          billableExtraVehicles:
            Number(
              pricing.billableExtraVehicles ||
              0
            ),

          billableExtraServices:
            Number(
              pricing.billableExtraServices ||
              0
            ),

          baseAmount:
            Number(
              pricing.baseAmount ||
              0
            ),

          extraVehiclePrice:
            Number(
              pricing.extraVehiclePrice ||
              0
            ),

          extraServicePrice:
            Number(
              pricing.extraServicePrice ||
              0
            ),

          vehicleAmount:
            Number(
              pricing.vehicleAmount ||
              0
            ),

          serviceAmount:
            Number(
              pricing.serviceAmount ||
              0
            ),

          discount:
            Number(
              pricing.discount ||
              0
            ),

          credit:
            Number(
              pricing.credit ||
              0
            ),

          actualDrivers:
            Number(
              pricing.actualDrivers ||
              usage.actualDrivers ||
              0
            ),

          actualDispatchers:
            Number(
              pricing.actualDispatchers ||
              usage.actualDispatchers ||
              0
            ),

          actualAdmins:
            Number(
              pricing.actualAdmins ||
              usage.actualAdmins ||
              0
            ),

          actualSuperAdmins:
            Number(
              pricing.actualSuperAdmins ||
              usage.actualSuperAdmins ||
              0
            ),

          actualCompanies:
            Number(
              pricing.actualCompanies ||
              usage.actualCompanies ||
              0
            ),

          maxVehicles:
            Number(
              pricing.maxVehicles ||
              subscription.maxVehicles ||
              0
            ),

          maxServices:
            Number(
              pricing.maxServices ||
              subscription.maxServices ||
              0
            ),

          maxBrokers:
            Number(
              pricing.maxBrokers ||
              subscription.maxBrokers ||
              0
            ),

          maxDrivers:
            Number(
              pricing.maxDrivers ||
              subscription.maxDrivers ||
              0
            ),

          maxDispatchers:
            Number(
              pricing.maxDispatchers ||
              subscription.maxDispatchers ||
              0
            ),

          maxAdmins:
            Number(
              pricing.maxAdmins ||
              subscription.maxAdmins ||
              0
            ),

          maxSuperAdmins:
            Number(
              pricing.maxSuperAdmins ||
              subscription.maxSuperAdmins ||
              0
            ),

          maxCompanies:
            Number(
              pricing.maxCompanies ||
              subscription.maxCompanies ||
              0
            ),

          actualBrokers:
            Number(
              pricing.actualBrokers ||
              0
            ),

          includedBrokers:
            Number(
              pricing.includedBrokers ||
              subscription.includedBrokers ||
              0
            ),

          extraBrokers:
            Number(
              pricing.extraBrokers ||
              0
            ),

          billableExtraBrokers:
            Number(
              pricing.billableExtraBrokers ||
              0
            ),

          extraBrokerPrice:
            Number(
              pricing.extraBrokerPrice ||
              subscription.extraBrokerPrice ||
              0
            ),

          brokerAmount:
            Number(
              pricing.brokerAmount ||
              0
            ),

          serviceControls:
            Array.isArray(pricing.serviceControls)
              ? pricing.serviceControls
              : [],

          finalAmount:
            Number(
              pricing.finalAmount ||
              billing.planPrice ||
              0
            )
        },

        brokers,

        history
      });

    }catch(err){
      console.error(
        "TENANT SUBSCRIPTION ME ERROR:",
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
  "/checkout-session",
  auth,
  async (req,res)=>{
    let payment = null;

    try{
      const tenant =
        await Tenant.findById(
          req.authUser.tenantId
        );

      if(!tenant){
        return res.status(404).json({
          success:false,
          message:"Tenant not found"
        });
      }

      const pricingData =
        await ensureTenantPricing(
          tenant
        );

      const subscription =
        pricingData.subscription;

      const brokers =
        await getActiveBillingBrokers(
          tenant._id
        );

      const pricing =
        applyBrokerPricing(
          pricingData.pricing || {},
          subscription,
          brokers
        );

      const billing =
        paymentState(
          subscription,
          pricing.finalAmount
        );

      const amount =
        billing.amountDue;

      if(
        !billing.canPay ||
        amount <= 0
      ){
        return res.status(409).json({
          success:false,
          message:"No subscription payment is due",
          paymentWindowOpensAt:
            billing.paymentWindowOpensAt
        });
      }

      if(!subscription.stripeCustomerId){
        const customer =
          await stripe.customers.create({
            name:
              tenant.name ||
              "GH Mobility Customer",
            metadata:{
              tenantId:
                String(tenant._id)
            }
          });

        subscription.stripeCustomerId =
          customer.id;

        await subscription.save();
      }

      payment =
        await TenantSubscriptionPayment
          .findOne({
            tenantId:tenant._id,
            billingKey:
              billing.billingKey
          });

      if(payment?.status === "PAID"){
        return res.status(409).json({
          success:false,
          message:"This subscription invoice is already paid"
        });
      }

      if(payment?.checkoutSessionId){
        try{
          const existingSession =
            await stripe.checkout.sessions.retrieve(
              payment.checkoutSessionId,
              {expand:["payment_intent"]}
            );

          if(
            existingSession.status === "open" &&
            existingSession.url
          ){
            return res.json({
              success:true,
              reused:true,
              url:existingSession.url
            });
          }

          if(
            existingSession.status === "complete" &&
            existingSession.payment_status === "paid"
          ){
            await markPaid(
              subscription,
              payment,
              existingSession
            );

            return res.status(409).json({
              success:false,
              message:"This subscription invoice is already paid"
            });
          }

          payment.status = "CANCELED";
          payment.checkoutSessionId = "";
          await payment.save();

        }catch(sessionErr){
          console.log(
            "EXISTING CHECKOUT SESSION ERROR:",
            sessionErr.message
          );

          payment.status = "CANCELED";
          payment.checkoutSessionId = "";
          await payment.save();
        }
      }

      if(
        payment &&
        !payment.checkoutSessionId &&
        ["PENDING","PROCESSING"].includes(
          payment.status
        ) &&
        Date.now() -
          new Date(payment.updatedAt).getTime() <
          120000
      ){
        return res.status(409).json({
          success:false,
          message:"Payment session is being prepared"
        });
      }

      if(!payment){
        const invoiceNumber =
          "GH-" +
          Date.now()
            .toString(36)
            .toUpperCase() +
          "-" +
          String(tenant._id)
            .slice(-5)
            .toUpperCase();

        payment =
          await TenantSubscriptionPayment.create({
            tenantId:tenant._id,
            invoiceNumber,
            billingKey:
              billing.billingKey,
            billingDueDate:
              billing.billingDueDate,
            amount,
            currency:
              subscription.currency ||
              "usd",
            billingCycle:
              subscription.billingCycle,
            status:"PROCESSING"
          });

      }else{
        payment.amount = amount;
        payment.currency =
          subscription.currency ||
          "usd";
        payment.billingCycle =
          subscription.billingCycle;
        payment.billingDueDate =
          billing.billingDueDate;
        payment.status =
          "PROCESSING";

        await payment.save();
      }

      const invoiceNumber =
        payment.invoiceNumber;

      const session =
        await stripe.checkout.sessions.create({
          mode:"payment",

          customer:
            subscription.stripeCustomerId,

          payment_method_types:[
            "card",
            "us_bank_account"
          ],

          line_items:[
            {
              price_data:{
                currency:
                  subscription.currency ||
                  "usd",

                product_data:{
                  name:
                    `${subscription.planName} ${subscription.billingCycle} Subscription`
                },

                unit_amount:
                  Math.round(
                    amount * 100
                  )
              },

              quantity:1
            }
          ],

          metadata:{
            tenantId:
              String(tenant._id),
            subscriptionPaymentId:
              String(payment._id),
            invoiceNumber
          },

          payment_intent_data:{
            metadata:{
              tenantId:
                String(tenant._id),
              subscriptionPaymentId:
                String(payment._id),
              invoiceNumber
            }
          },

          success_url:
            `${PUBLIC_BASE_URL}/admin/payments.html?session_id={CHECKOUT_SESSION_ID}`,

          cancel_url:
            `${PUBLIC_BASE_URL}/admin/payments.html?cancelled=1`
        });

      payment.checkoutSessionId =
        session.id;

      payment.status =
        "PENDING";

      await payment.save();

      return res.json({
        success:true,
        url:session.url
      });

    }catch(err){
      console.error(
        "SUBSCRIPTION CHECKOUT ERROR:",
        err
      );

      if(payment){
        try{
          payment.status =
            "FAILED";
          await payment.save();
        }catch(ignore){}
      }

      return res.status(500).json({
        success:false,
        message:"Unable to start subscription payment"
      });
    }
  }
);

router.get(
  "/verify",
  auth,
  async (req,res)=>{
    try{
      const sessionId =
        clean(
          req.query.session_id
        );

      if(!sessionId){
        return res.status(400).json({
          success:false,
          message:"Session required"
        });
      }

      const payment =
        await TenantSubscriptionPayment
          .findOne({
            tenantId:
              req.authUser.tenantId,
            checkoutSessionId:
              sessionId
          });

      if(!payment){
        return res.status(404).json({
          success:false,
          message:"Payment not found"
        });
      }

      const subscription =
        await ensureSubscription(
          req.authUser.tenantId
        );

      const session =
        await stripe.checkout.sessions.retrieve(
          sessionId,
          {expand:["payment_intent"]}
        );

      const intent =
        session.payment_intent;

      if(
        intent &&
        typeof intent === "object" &&
        intent.status === "succeeded"
      ){
        await markPaid(
          subscription,
          payment,
          session
        );

        return res.json({
          success:true,
          paid:true,
          processing:false
        });
      }

      if(
        intent &&
        typeof intent === "object" &&
        [
          "processing",
          "requires_action"
        ].includes(intent.status)
      ){
        payment.status =
          "PROCESSING";

        await payment.save();

        return res.json({
          success:true,
          paid:false,
          processing:true
        });
      }

      return res.json({
        success:true,
        paid:false,
        processing:false
      });

    }catch(err){
      console.error(
        "SUBSCRIPTION VERIFY ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to verify payment"
      });
    }
  }
);

module.exports = router;
