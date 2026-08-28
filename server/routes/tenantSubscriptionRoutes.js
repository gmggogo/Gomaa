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

function validDate(value){
  if(!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function paymentState(subscription){
  const now = new Date();

  const planPrice =
    Number(
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
        ).lean();

      if(!tenant){
        return res.status(404).json({
          success:false,
          message:"Tenant not found"
        });
      }

      const subscription =
        await ensureSubscription(
          tenant._id
        );

      const state =
        runtime(subscription);

      const billing =
        paymentState(subscription);

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
            state.locked
        },

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

      const subscription =
        await ensureSubscription(
          tenant._id
        );

      const billing =
        paymentState(subscription);

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
