"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");

const TenantPaymentAccount =
  require("../models/TenantPaymentAccount");

const Tenant =
  require("../models/Tenant");

const {
  stripeAccountPatch,
  attachStripeAccount
} = require("../utils/stripeAccountLinking");

const router = express.Router();

const stripe =
  Stripe(
    process.env.STRIPE_SECRET_KEY
  );

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

const STRIPE_CONNECT_CLIENT_ID =
  String(
    process.env.STRIPE_CONNECT_CLIENT_ID ||
    ""
  ).trim();

const PUBLIC_BASE_URL =
  String(
    process.env.PUBLIC_BASE_URL ||
    "https://ghmobility.com"
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
        message:
          "Stripe settings are restricted to tenant admins"
      });

    }

    if(!user.tenantId){

      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });

    }

    req.authUser =
      user;

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });

  }

}

/* =========================
   STRIPE ACCOUNT SYNC
========================= */

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

  Object.assign(
    paymentAccount,
    stripeAccountPatch(account)
  );

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
          .findOne({
            tenantId
          });

      let connectionError = "";

      if(
        paymentAccount?.stripeAccountId
      ){

        try{

          paymentAccount =
            await syncStripeAccount(
              paymentAccount
            );

        }catch(err){

          connectionError =
            clean(
              err?.raw?.message ||
              err?.message
            ) ||
            "The current GH Stripe key cannot access this connected account";

          console.log(
            "STRIPE ACCOUNT SYNC ERROR:",
            connectionError
          );

        }

      }

      return res.json({

        success:true,

        connected:
          !connectionError &&
          paymentAccount?.connected === true,

        onboardingComplete:
          !connectionError &&
          paymentAccount?.onboardingComplete === true,

        chargesEnabled:
          !connectionError &&
          paymentAccount?.chargesEnabled === true,

        paymentReady:
          !connectionError &&
          paymentAccount?.chargesEnabled === true &&
          paymentAccount?.detailsSubmitted === true,

        payoutsEnabled:
          !connectionError &&
          paymentAccount?.payoutsEnabled === true,

        detailsSubmitted:
          !connectionError &&
          paymentAccount?.detailsSubmitted === true,

        stripeAccountId:
          paymentAccount?.stripeAccountId || "",

        stripeAccountType:
          paymentAccount?.stripeAccountType || "",

        connectionError

      });

    }catch(err){

      console.log(
        "TENANT STRIPE STATUS ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          "Unable to load Stripe status"
      });

    }

  }
);

/* =========================
   ATTACH AN EXISTING CONNECTED ACCOUNT

   Used when the account was created from the
   Stripe platform Dashboard instead of OAuth.
   Retrieval with the current platform key proves
   that GH is allowed to operate on this account.
========================= */

router.post(
  "/attach-account",
  requireTenantStripeAdmin,
  async (req,res)=>{

    try{

      const paymentAccount =
        await attachStripeAccount({
          stripe,
          TenantPaymentAccount,
          tenantId:clean(req.authUser.tenantId),
          stripeAccountId:clean(req.body?.stripeAccountId)
        });

      return res.json({
        success:true,
        connected:paymentAccount.connected === true,
        onboardingComplete:
          paymentAccount.onboardingComplete === true,
        chargesEnabled:
          paymentAccount.chargesEnabled === true,
        payoutsEnabled:
          paymentAccount.payoutsEnabled === true,
        detailsSubmitted:
          paymentAccount.detailsSubmitted === true,
        stripeAccountId:
          paymentAccount.stripeAccountId,
        stripeAccountType:
          paymentAccount.stripeAccountType
      });

    }catch(err){

      const stripeMessage = clean(
        err?.raw?.message ||
        err?.message
      );

      console.log(
        "STRIPE ACCOUNT ATTACH ERROR:",
        stripeMessage
      );

      return res
        .status(
          Number(err?.statusCode) || 400
        )
        .json({
          success:false,
          message:
            stripeMessage ||
            "Unable to attach Stripe account"
        });

    }

  }
);


async function getTenantBusinessName(
  tenantId,
  fallback = ""
){

  const tenant =
    await Tenant
      .findById(tenantId)
      .select("name slug branding.companyName")
      .lean();

  return clean(
    fallback ||
    tenant?.branding?.companyName ||
    tenant?.name ||
    tenant?.slug ||
    ""
  );
}

/* =========================
   CONNECT STRIPE
   EXISTING ACCOUNT OR CREATE NEW

   IMPORTANT:
   This route DOES NOT create an account first.

   It sends the tenant to Stripe OAuth.
   Stripe itself gives the user the choice to:
   - Sign in to an existing Stripe account
   - Create a new Stripe account
========================= */

router.post(
  "/connect",
  requireTenantStripeAdmin,
  async (req,res)=>{

    try{

      if(
        !STRIPE_CONNECT_CLIENT_ID
      ){

        return res.status(500).json({
          success:false,
          message:
            "STRIPE_CONNECT_CLIENT_ID is missing"
        });

      }

      const tenantId =
        clean(
          req.authUser.tenantId
        );

      const tenantSlug =
        clean(
          req.body?.tenantSlug ||
          req.authUser?.tenantSlug
        )
        .toLowerCase();

      const businessName =
        await getTenantBusinessName(
          tenantId,
          req.body?.businessName
        );

      const businessEmail =
        clean(
          req.body?.email ||
          req.authUser?.email ||
          req.authUser?.username
        );

      /*
        Signed state prevents another tenant
        from attaching its Stripe account here.
      */

      const state =
        jwt.sign(
          {
            purpose:
              "STRIPE_CONNECT",

            tenantId,

            tenantSlug
          },
          JWT_SECRET,
          {
            expiresIn:"10m"
          }
        );

      const redirectUri =
        `${PUBLIC_BASE_URL}` +
        `/api/tenant-stripe/callback`;

      const params =
        new URLSearchParams({

          response_type:
            "code",

          client_id:
            STRIPE_CONNECT_CLIENT_ID,

          scope:
            "read_write",

          redirect_uri:
            redirectUri,

          state

        });

      /*
        Optional prefill.
        Stripe ignores these values when the
        user signs in to an existing account.
      */

      if(businessEmail){

        params.set(
          "stripe_user[email]",
          businessEmail
        );

      }

      if(businessName){

        params.set(
          "stripe_user[business_name]",
          businessName
        );

      }

      params.set(
        "stripe_user[country]",
        clean(req.body?.country) ||
        "US"
      );

      params.set(
        "always_prompt",
        "true"
      );

      const url =
        "https://connect.stripe.com/oauth/authorize?" +
        params.toString();

      return res.json({
        success:true,
        url
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
   STRIPE OAUTH CALLBACK

   Stripe sends:
   ?code=...
   ?state=...

   We exchange the one-time code,
   receive stripe_user_id = acct_...
   and save it against the tenant.
========================= */

router.get(
  "/callback",
  async (req,res)=>{

    let tenantSlug = "";

    try{

      const error =
        clean(
          req.query?.error
        );

      const errorDescription =
        clean(
          req.query?.error_description
        );

      const stateToken =
        clean(
          req.query?.state
        );

      if(!stateToken){

        return res.status(400).send(
          "Missing Stripe connection state"
        );

      }

      let state;

      try{

        state =
          jwt.verify(
            stateToken,
            JWT_SECRET
          );

      }catch(err){

        return res.status(400).send(
          "Invalid or expired Stripe connection"
        );

      }

      if(
        state?.purpose !==
        "STRIPE_CONNECT"
      ){

        return res.status(400).send(
          "Invalid Stripe connection"
        );

      }

      const tenantId =
        clean(
          state.tenantId
        );

      tenantSlug =
        clean(
          state.tenantSlug
        ).toLowerCase();

      if(!tenantId){

        return res.status(400).send(
          "Tenant missing from Stripe connection"
        );

      }

      const pageUrl =
        "/admin/admin-billing.html" +
        (
          tenantSlug
            ? "?tenant=" +
              encodeURIComponent(
                tenantSlug
              )
            : ""
        );

      if(error){

        const separator =
          pageUrl.includes("?")
            ? "&"
            : "?";

        return res.redirect(
          pageUrl +
          separator +
          "stripe=cancelled" +
          (
            errorDescription
              ? "&message=" +
                encodeURIComponent(
                  errorDescription
                )
              : ""
          )
        );

      }

      const code =
        clean(
          req.query?.code
        );

      if(!code){

        return res.status(400).send(
          "Missing Stripe authorization code"
        );

      }

      /*
        Exchange Stripe's one-time authorization code
        for the connected account ID.
      */

      const oauthResult =
        await stripe.oauth.token({

          grant_type:
            "authorization_code",

          code

        });

      const stripeAccountId =
        clean(
          oauthResult?.stripe_user_id
        );

      if(!stripeAccountId){

        throw new Error(
          "Stripe account ID was not returned"
        );

      }

      const account =
        await stripe.accounts.retrieve(
          stripeAccountId
        );

      let paymentAccount =
        await TenantPaymentAccount
          .findOne({
            tenantId
          });

      if(!paymentAccount){

        paymentAccount =
          new TenantPaymentAccount({
            tenantId
          });

      }

      /*
        IMPORTANT:
        If the tenant started the old Express test
        flow before this change, this safely replaces
        that old acct_ reference with the account
        the user actually selected in Stripe.
      */

      paymentAccount.stripeAccountId =
        stripeAccountId;

      paymentAccount.stripeAccountType =
        "standard";

      paymentAccount.chargesEnabled =
        account.charges_enabled === true;

      paymentAccount.payoutsEnabled =
        account.payouts_enabled === true;

      paymentAccount.detailsSubmitted =
        account.details_submitted === true;

      paymentAccount.onboardingComplete =
        (
          account.details_submitted === true &&
          account.charges_enabled === true
        );

      paymentAccount.connected = true;

      paymentAccount.country =
        account.country ||
        "US";

      paymentAccount.defaultCurrency =
        account.default_currency ||
        "usd";

      paymentAccount.lastStripeSyncAt =
        new Date();

      await paymentAccount.save();

      const separator =
        pageUrl.includes("?")
          ? "&"
          : "?";

      return res.redirect(
        pageUrl +
        separator +
        "stripe=connected"
      );

    }catch(err){

      console.log(
        "STRIPE OAUTH CALLBACK ERROR:",
        err
      );

      const pageUrl =
        "/admin/admin-billing.html" +
        (
          tenantSlug
            ? "?tenant=" +
              encodeURIComponent(
                tenantSlug
              ) +
              "&"
            : "?"
        ) +
        "stripe=error";

      return res.redirect(
        pageUrl
      );

    }

  }
);


/* =========================
   LOCAL STRIPE UNLINK

   This does not delete anything in Stripe.
   It only clears the tenant's saved acct_ id
   so the tenant can connect the correct account.
========================= */

router.post(
  "/reset",
  requireTenantStripeAdmin,
  async (req,res)=>{

    try{

      const tenantId =
        clean(
          req.authUser.tenantId
        );

      await TenantPaymentAccount
        .deleteOne({
          tenantId
        });

      return res.json({
        success:true
      });

    }catch(err){

      console.log(
        "TENANT STRIPE RESET ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Unable to reset Stripe connection"
      });

    }

  }
);

/* =========================
   STRIPE DASHBOARD

   Standard accounts use their own normal
   Stripe Dashboard login.
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
          .findOne({
            tenantId
          })
          .lean();

      if(
        !paymentAccount?.stripeAccountId
      ){

        return res.status(400).json({
          success:false,
          message:
            "Stripe account is not connected"
        });

      }

      /*
        OAuth connects a Standard Stripe account.
        Standard accounts use the normal Stripe Dashboard.
      */

      return res.json({
        success:true,
        url:
          "https://dashboard.stripe.com/"
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

module.exports =
  router;
