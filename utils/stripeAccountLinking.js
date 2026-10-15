"use strict";

function clean(value){
  return String(value ?? "").trim();
}

function isStripeAccountId(value){
  return /^acct_[A-Za-z0-9]{8,}$/.test(
    clean(value)
  );
}

function accountType(account){
  const classicType = clean(account?.type).toLowerCase();

  if(classicType){
    return classicType;
  }

  const dashboardType = clean(
    account?.controller?.stripe_dashboard?.type
  ).toLowerCase();

  if(dashboardType === "express"){
    return "express";
  }

  if(dashboardType === "full"){
    return "standard";
  }

  return "custom";
}

function stripeAccountPatch(account){
  const stripeAccountId = clean(account?.id);

  if(!isStripeAccountId(stripeAccountId)){
    throw new Error("Stripe returned an invalid connected account ID");
  }

  const chargesEnabled =
    account?.charges_enabled === true;

  const payoutsEnabled =
    account?.payouts_enabled === true;

  const detailsSubmitted =
    account?.details_submitted === true;

  return {
    stripeAccountId,
    stripeAccountType:accountType(account),
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    connected:true,
    onboardingComplete:
      chargesEnabled && detailsSubmitted,
    country:
      clean(account?.country || "US").toUpperCase(),
    defaultCurrency:
      clean(account?.default_currency || "usd").toLowerCase(),
    lastStripeSyncAt:new Date()
  };
}

function requestError(message, statusCode){
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function attachStripeAccount({
  stripe,
  TenantPaymentAccount,
  tenantId,
  stripeAccountId
}){
  const cleanTenantId = clean(tenantId);
  const cleanAccountId = clean(stripeAccountId);

  if(!cleanTenantId){
    throw requestError("Tenant is required", 400);
  }

  if(!isStripeAccountId(cleanAccountId)){
    throw requestError(
      "Enter a valid Stripe connected account ID beginning with acct_",
      400
    );
  }

  const account = await stripe.accounts.retrieve(
    cleanAccountId
  );

  const duplicate = await TenantPaymentAccount
    .findOne({
      stripeAccountId:cleanAccountId,
      tenantId:{
        $ne:cleanTenantId
      }
    })
    .lean();

  if(duplicate){
    throw requestError(
      "This Stripe account is already linked to another organization",
      409
    );
  }

  return TenantPaymentAccount.findOneAndUpdate(
    {tenantId:cleanTenantId},
    {
      $set:stripeAccountPatch(account)
    },
    {
      new:true,
      upsert:true,
      setDefaultsOnInsert:true,
      runValidators:true
    }
  );
}

module.exports = {
  isStripeAccountId,
  stripeAccountPatch,
  attachStripeAccount
};

