"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");

const TenantPaymentAccount =
  require("../models/TenantPaymentAccount");

const router = express.Router();

const stripe =
  Stripe(
    process.env.STRIPE_SECRET_KEY
  );

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

function normalizeRole(v){
  return clean(v)
    .toUpperCase()
    .replace(/[\s-]+/g,"_");
}

function readBearerToken(req){
  const header =
    clean(
      req.headers?.authorization
    );

  if(
    !header
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return header
    .slice(7)
    .trim();
}

function requireTenantStripeAdmin(
  req,
  res,
  next
){

  const token =
    readBearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const user =
      jwt.verify(
        token,
        JWT_SECRET
      );

    const role =
      normalizeRole(
        user.role
      );

    if(
      ![
        "SUPER_ADMIN",
        "SUPERADMIN",
        "ADMIN"
      ].includes(role)
    ){
      return res.status(403).json({
        success:false,
        message:"Stripe settings are restricted to tenant admins"
      });
    }

    if(!user.tenantId){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    req.authUser = user;

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });

  }

}

async function syncStripeAccount(
  paymentAccount
){

  if(
    !paymentAccount?.stripeAccountId
  ){
    return paymentAccount;
  }

  const account =
    await stripe.accounts.retrieve(
      paymentAccount.stripeAccountId
    );

  paymentAccount.chargesEnabled =
    account.charges_enabled === true;

  paymentAccount.payoutsEnabled =
    account.payouts_enabled === true;

  paymentAccount.detailsSubmitted =
    account.details_submitted === true;

  paymentAccount.onboardingComplete =
    (
      account.details_submitted === true &&
      account.charges_enabled === true &&
      account.payouts_enabled === true
    );

  paymentAccount.connected =
    paymentAccount.onboardingComplete;

  paymentAccount.country =
    account.country ||
    paymentAccount.country ||
    "US";

  paymentAccount.defaultCurrency =
    account.default_currency ||
    paymentAccount.defaultCurrency ||
    "usd";

  paymentAccount.lastStripeSyncAt =
    new Date();

  await paymentAccount.save();

  return paymentAccount;
}

/* =========================
   STATUS
========================= */

router.get(
  "/status",
  requireTenantStripeAdmin,
  async (req,res)=>{

    try{

      const tenantId =
        clean(
          req.authUser.tenantId
        );

      let paymentAccount =
        await TenantPaymentAccount
          .findOne({tenantId});

      if(
        paymentAccount?.stripeAccountId
      ){

        try{
          paymentAccount =
            await syncStripeAccount(
              paymentAccount
            );
        }catch(err){
          console.log(
            "STRIPE ACCOUNT SYNC ERROR:",
            err.message
          );
        }

      }

      return res.json({
        success:true,
        connected:
          paymentAccount?.connected === true,
        onboardingComplete:
          paymentAccount?.onboardingComplete === true,
        chargesEnabled:
          paymentAccount?.chargesEnabled === true,
        payoutsEnabled:
          paymentAccount?.payoutsEnabled === true,
        stripeAccountId:
          paymentAccount?.stripeAccountId || ""
      });

    }catch(err){

      console.log(
        "TENANT STRIPE STATUS ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Unable to load Stripe status"
      });

    }

  }
);

/* =========================
   CONNECT / CONTINUE ONBOARDING
========================= */

router.post(
  "/connect",
  requireTenantStripeAdmin,
  async (req,res)=>{

    try{

      const tenantId =
        clean(
          req.authUser.tenantId
        );

      let paymentAccount =
        await TenantPaymentAccount
          .findOne({tenantId});

      if(!paymentAccount){

        paymentAccount =
          await TenantPaymentAccount.create({
            tenantId
          });

      }

      if(
        !paymentAccount.stripeAccountId
      ){

        const account =
          await stripe.accounts.create({
            type:"express",

            country:
              clean(req.body?.country) ||
              "US",

            capabilities:{
              card_payments:{
                requested:true
              },
              transfers:{
                requested:true
              }
            },

            metadata:{
              tenantId:
                String(tenantId)
            }
          });

        paymentAccount.stripeAccountId =
          account.id;

        paymentAccount.stripeAccountType =
          "express";

        await paymentAccount.save();

      }

      const tenantSlug =
        clean(
          req.body?.tenantSlug ||
          req.authUser?.tenantSlug
        )
        .toLowerCase();

      const suffix =
        tenantSlug
          ? `?tenant=${encodeURIComponent(tenantSlug)}`
          : "";

      const accountLink =
        await stripe.accountLinks.create({
          account:
            paymentAccount.stripeAccountId,

          refresh_url:
            `${PUBLIC_BASE_URL}/admin/settings.html${suffix}`,

          return_url:
            `${PUBLIC_BASE_URL}/admin/settings.html${suffix}`,

          type:
            "account_onboarding"
        });

      return res.json({
        success:true,
        url:accountLink.url,
        stripeAccountId:
          paymentAccount.stripeAccountId
      });

    }catch(err){

      console.log(
        "TENANT STRIPE CONNECT ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Unable to connect Stripe"
      });

    }

  }
);

/* =========================
   EXPRESS DASHBOARD LOGIN
========================= */

router.post(
  "/dashboard-link",
  requireTenantStripeAdmin,
  async (req,res)=>{

    try{

      const tenantId =
        clean(
          req.authUser.tenantId
        );

      const paymentAccount =
        await TenantPaymentAccount
          .findOne({tenantId});

      if(
        !paymentAccount?.stripeAccountId
      ){
        return res.status(400).json({
          success:false,
          message:"Stripe account is not connected"
        });
      }

      const link =
        await stripe.accounts.createLoginLink(
          paymentAccount.stripeAccountId
        );

      return res.json({
        success:true,
        url:link.url
      });

    }catch(err){

      console.log(
        "TENANT STRIPE DASHBOARD ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Unable to open Stripe dashboard"
      });

    }

  }
);

module.exports = router;