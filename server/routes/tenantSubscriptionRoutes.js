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

function clean(v){
  return String(v ?? "").trim();
}

function auth(req,res,next){
  const header = clean(req.headers.authorization);

  if(!header.toLowerCase().startsWith("bearer ")){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{
    const decoded = jwt.verify(
      header.slice(7).trim(),
      JWT_SECRET
    );

    const role =
      clean(decoded.role)
      .toUpperCase()
      .replace(/[\s-]+/g,"_");

    if(
      !["SUPER_ADMIN","SUPERADMIN","ADMIN"].includes(role)
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
  let row = await TenantSubscription.findOne({tenantId});

  if(!row){
    row = await TenantSubscription.create({
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
      status:subscription.status || "ACTIVE",
      locked:false
    };
  }

  const due = new Date(subscription.dueDate);

  if(now <= due){
    return {status:"ACTIVE",locked:false};
  }

  const graceEnd = new Date(due);
  graceEnd.setUTCDate(
    graceEnd.getUTCDate() +
    Number(subscription.graceDays || 0)
  );

  if(now <= graceEnd){
    return {status:"PAST_DUE",locked:false};
  }

  return {status:"SUSPENDED",locked:true};
}

function addCycle(date,cycle){
  const next = new Date(date);

  if(cycle === "MONTHLY"){
    next.setUTCMonth(next.getUTCMonth() + 1);
  }else{
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  }

  return next;
}

async function markPaid(subscription,payment,session){
  if(payment.status === "PAID") return;

  const intent =
    typeof session.payment_intent === "string"
      ? await stripe.paymentIntents.retrieve(session.payment_intent)
      : session.payment_intent;

  if(!intent || intent.status !== "succeeded"){
    return;
  }

  const method =
    Array.isArray(intent.payment_method_types)
      ? String(intent.payment_method_types[0] || "")
      : "";

  payment.status = "PAID";
  payment.paymentIntentId = String(intent.id || "");
  payment.paymentMethod =
    method === "us_bank_account"
      ? "ACH"
      : method === "card"
        ? "CARD"
        : method.toUpperCase();

  payment.paidAt = new Date();
  await payment.save();

  subscription.lastPaymentDate = payment.paidAt;
  subscription.dueDate = addCycle(
    payment.paidAt,
    subscription.billingCycle
  );
  subscription.nextBillingDate = subscription.dueDate;
  subscription.status = "ACTIVE";

  await subscription.save();

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

router.get("/me",auth,async(req,res)=>{
  try{
    const tenant = await Tenant.findById(
      req.authUser.tenantId
    ).lean();

    if(!tenant){
      return res.status(404).json({
        success:false,
        message:"Tenant not found"
      });
    }

    const subscription =
      await ensureSubscription(tenant._id);

    const state = runtime(subscription);

    if(subscription.status !== state.status){
      subscription.status = state.status;
      await subscription.save();
    }

    const history =
      await TenantSubscriptionPayment
      .find({tenantId:tenant._id})
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
        planName:subscription.planName,
        billingCycle:subscription.billingCycle,
        amountDue:Number(subscription.amount || 0),
        status:state.status,
        graceDays:subscription.graceDays,
        dueDate:subscription.dueDate,
        nextBillingDate:
          subscription.nextBillingDate ||
          subscription.dueDate,
        lastPaymentDate:subscription.lastPaymentDate,
        locked:state.locked
      },

      history
    });

  }catch(err){
    console.error("TENANT SUBSCRIPTION ME ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Unable to load subscription"
    });
  }
});

router.post("/checkout-session",auth,async(req,res)=>{
  try{
    const tenant =
      await Tenant.findById(req.authUser.tenantId);

    if(!tenant){
      return res.status(404).json({
        success:false,
        message:"Tenant not found"
      });
    }

    const subscription =
      await ensureSubscription(tenant._id);

    const amount =
      Number(subscription.amount || 0);

    if(amount <= 0){
      return res.status(400).json({
        success:false,
        message:"No subscription payment is due"
      });
    }

    if(!subscription.stripeCustomerId){
      const customer =
        await stripe.customers.create({
          name:tenant.name || "GH Mobility Customer",
          metadata:{
            tenantId:String(tenant._id)
          }
        });

      subscription.stripeCustomerId =
        customer.id;

      await subscription.save();
    }

    const invoiceNumber =
      "GH-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      String(tenant._id).slice(-5).toUpperCase();

    const payment =
      await TenantSubscriptionPayment.create({
        tenantId:tenant._id,
        invoiceNumber,
        amount,
        currency:subscription.currency || "usd",
        billingCycle:subscription.billingCycle,
        status:"PENDING"
      });

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
                Math.round(amount * 100)
            },

            quantity:1
          }
        ],

        metadata:{
          tenantId:String(tenant._id),
          subscriptionPaymentId:String(payment._id),
          invoiceNumber
        },

        payment_intent_data:{
          metadata:{
            tenantId:String(tenant._id),
            subscriptionPaymentId:String(payment._id),
            invoiceNumber
          }
        },

        success_url:
          `${PUBLIC_BASE_URL}/admin/payments.html?session_id={CHECKOUT_SESSION_ID}`,

        cancel_url:
          `${PUBLIC_BASE_URL}/admin/payments.html?cancelled=1`
      });

    payment.checkoutSessionId = session.id;
    await payment.save();

    return res.json({
      success:true,
      url:session.url
    });

  }catch(err){
    console.error("SUBSCRIPTION CHECKOUT ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Unable to start subscription payment"
    });
  }
});

router.get("/verify",auth,async(req,res)=>{
  try{
    const sessionId = clean(req.query.session_id);

    if(!sessionId){
      return res.status(400).json({
        success:false,
        message:"Session required"
      });
    }

    const payment =
      await TenantSubscriptionPayment.findOne({
        tenantId:req.authUser.tenantId,
        checkoutSessionId:sessionId
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

    const intent = session.payment_intent;

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
      ["processing","requires_action"].includes(intent.status)
    ){
      payment.status = "PROCESSING";
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
    console.error("SUBSCRIPTION VERIFY ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Unable to verify payment"
    });
  }
});

module.exports = router;