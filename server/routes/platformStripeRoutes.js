"use strict";

const express =
  require("express");

const router =
  express.Router();

const {
  verifyToken,
  requireRole
} =
  require("../middleware/authmiddleware");

router.use(
  verifyToken,
  requireRole("PLATFORM_ADMIN")
);

router.get(
  "/status",
  async (req,res)=>{

    try{

      const secretKey =
        String(
          process.env.STRIPE_SECRET_KEY ||
          ""
        ).trim();

      if(!secretKey){

        return res.json({
          success:true,
          connected:false,
          mode:"NOT CONFIGURED",
          accountId:"",
          chargesEnabled:false,
          payoutsEnabled:false,
          dashboardUrl:""
        });
      }

      const stripe =
        require("stripe")(
          secretKey
        );

      const account =
        await stripe.accounts.retrieve();

      const liveMode =
        secretKey.startsWith(
          "sk_live_"
        );

      return res.json({
        success:true,

        connected:true,

        mode:
          liveMode
            ? "LIVE"
            : "TEST",

        accountId:
          account.id ||
          "",

        chargesEnabled:
          account.charges_enabled === true,

        payoutsEnabled:
          account.payouts_enabled === true,

        businessName:
          account.business_profile?.name ||
          account.settings?.dashboard?.display_name ||
          "",

        country:
          account.country ||
          "",

        defaultCurrency:
          account.default_currency ||
          "",

        dashboardUrl:
          liveMode
            ? "https://dashboard.stripe.com/"
            : "https://dashboard.stripe.com/test/"
      });

    }catch(err){

      console.error(
        "PLATFORM STRIPE STATUS ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        connected:false,
        message:"Unable to load platform Stripe account"
      });
    }
  }
);

module.exports =
  router;
