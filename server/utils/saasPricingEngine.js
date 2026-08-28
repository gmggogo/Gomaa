"use strict";

const User =
  require("../models/User");

const DriverSchedule =
  require("../models/DriverSchedule");

const TenantSubscription =
  require("../models/TenantSubscription");

const PlatformBillingSettings =
  require("../models/PlatformBillingSettings");

function clean(v){
  return String(v ?? "").trim();
}

function num(v,fallback=0){
  const n = Number(v);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function nonNegative(v,fallback=0){
  return Math.max(
    0,
    num(v,fallback)
  );
}

function whole(v,fallback=0){
  return Math.max(
    0,
    Math.floor(
      nonNegative(v,fallback)
    )
  );
}

function nullableMoney(v){
  if(
    v === null ||
    v === undefined ||
    clean(v) === ""
  ){
    return null;
  }

  const n = Number(v);

  return Number.isFinite(n)
    ? Math.max(0,n)
    : null;
}

function normalizeCycle(v){
  const cycle =
    clean(v)
      .toUpperCase();

  return [
    "MONTHLY",
    "ANNUAL"
  ].includes(cycle)
    ? cycle
    : "MONTHLY";
}

async function getDefaultPackage(){

  let row =
    await PlatformBillingSettings
      .findOne({
        key:"DEFAULT_PACKAGE"
      });

  if(!row){

    row =
      await PlatformBillingSettings
        .create({
          key:"DEFAULT_PACKAGE",

          packageName:
            "GH Mobility Starter",

          basePrice:
            99,

          includedVehicles:
            5,

          includedServices:
            2,

          billingCycle:
            "MONTHLY",

          extraVehiclePrice:
            10,

          extraServicePrice:
            15,

          packageStatus:
            "ACTIVE"
        });
  }

  return row;
}

function normalizeControls(rows){

  const map =
    new Map();

  (
    Array.isArray(rows)
      ? rows
      : []
  )
  .forEach(row=>{

    const key =
      clean(
        row?.key
      );

    if(!key){
      return;
    }

    map.set(
      key,
      {
        key,

        label:
          clean(
            row?.label
          ) ||
          key,

        accessEnabled:
          row?.accessEnabled !==
          false,

        billingEnabled:
          row?.billingEnabled !==
          false
      }
    );
  });

  return map;
}

function mergeControls(
  items,
  savedRows
){

  const saved =
    normalizeControls(
      savedRows
    );

  return items.map(
    item=>{

      const old =
        saved.get(
          item.key
        );

      return {
        key:
          item.key,

        label:
          item.label,

        accessEnabled:
          old
            ? old.accessEnabled
            : true,

        billingEnabled:
          old
            ? old.billingEnabled
            : true
      };
    }
  );
}

/* =========================
   TENANT VEHICLE USAGE
   Source: Driver Schedule
========================= */

async function getTenantVehicles(
  tenant
){

  /*
    First load tenant drivers.
    We use their ids as a safe fallback for old DriverSchedule
    records that may have been created before tenantId was added.
  */

  const tenantDrivers =
    await User.find({
      tenantId:
        tenant._id,

      role:
        "driver"
    })
    .select(
      "_id name vehicleNumber vehicle"
    )
    .lean();

  const driverIds =
    tenantDrivers.map(
      driver=>
        String(
          driver._id
        )
    );

  const scheduleFilter =
    driverIds.length
      ? {
          $or:[
            {
              tenantId:
                tenant._id
            },
            {
              driverId:{
                $in:
                  driverIds
              }
            }
          ]
        }
      : {
          tenantId:
            tenant._id
        };

  const schedules =
    await DriverSchedule
      .find(
        scheduleFilter
      )
      .select(
        "driverId vehicleNumber enabled"
      )
      .lean();

  const vehicleMap =
    new Map();

  function addVehicle(
    value
  ){

    const raw =
      clean(
        value
      );

    if(!raw){
      return;
    }

    const key =
      raw.toUpperCase();

    if(
      !vehicleMap.has(
        key
      )
    ){
      vehicleMap.set(
        key,
        {
          key,
          label:
            raw
        }
      );
    }
  }

  /*
    PRIMARY SOURCE:
    Car column from Driver Schedule.
  */

  schedules.forEach(
    row=>{
      addVehicle(
        row.vehicleNumber
      );
    }
  );

  /*
    FALLBACK:
    If an old driver has a vehicle saved on User but not yet
    copied into DriverSchedule, keep counting it.
  */

  tenantDrivers.forEach(
    driver=>{
      addVehicle(
        driver.vehicleNumber ||
        driver.vehicle
      );
    }
  );

  return [
    ...vehicleMap.values()
  ]
  .sort(
    (a,b)=>
      a.label.localeCompare(
        b.label
      )
  );
}

/* =========================
   TENANT SERVICE USAGE
========================= */

function getTenantServices(
  tenant
){

  const serviceKeys =
    Array.isArray(
      tenant.allowedServices
    )
      ? [
          ...new Set(
            tenant.allowedServices
              .map(
                value=>
                  clean(value)
                    .toUpperCase()
              )
              .filter(
                Boolean
              )
          )
        ]
      : [];

  return serviceKeys
    .map(
      key=>({
        key,
        label:
          key
      })
    )
    .sort(
      (a,b)=>
        a.label.localeCompare(
          b.label
        )
    );
}

/* =========================
   TENANT USAGE
========================= */

async function getTenantUsage(
  tenant
){

  const vehicles =
    await getTenantVehicles(
      tenant
    );

  const services =
    getTenantServices(
      tenant
    );

  return {
    vehicles,
    services,

    actualVehicles:
      vehicles.length,

    enabledServices:
      services.length
  };
}

/* =========================
   PRICING ENGINE
========================= */

function calculatePricing(
  subscription,
  usage
){

  const vehicleControls =
    mergeControls(
      usage.vehicles,
      subscription.vehicleControls
    );

  const serviceControls =
    mergeControls(
      usage.services,
      subscription.serviceControls
    );

  /*
    Only Billing = ON enters the bill.

    Access = ON / Billing = OFF
    means the vehicle or service is free.
  */

  const billedVehicles =
    vehicleControls
      .filter(
        row=>
          row.billingEnabled ===
          true
      )
      .length;

  const billedServices =
    serviceControls
      .filter(
        row=>
          row.billingEnabled ===
          true
      )
      .length;

  const includedVehicles =
    whole(
      subscription.includedVehicles
    );

  const includedServices =
    whole(
      subscription.includedServices
    );

  const extraVehicles =
    Math.max(
      0,
      billedVehicles -
      includedVehicles
    );

  const extraServices =
    Math.max(
      0,
      billedServices -
      includedServices
    );

  const freeExtraVehicles =
    whole(
      subscription.freeExtraVehicles
    );

  const freeExtraServices =
    whole(
      subscription.freeExtraServices
    );

  const billableExtraVehicles =
    Math.max(
      0,
      extraVehicles -
      freeExtraVehicles
    );

  const billableExtraServices =
    Math.max(
      0,
      extraServices -
      freeExtraServices
    );

  const baseAmount =
    subscription.basePackageEnabled ===
    false
      ? 0
      : nonNegative(
          subscription.basePrice
        );

  const extraVehiclePrice =
    nonNegative(
      subscription.extraVehiclePrice
    );

  const extraServicePrice =
    nonNegative(
      subscription.extraServicePrice
    );

  const vehicleAmount =
    billableExtraVehicles *
    extraVehiclePrice;

  const serviceAmount =
    billableExtraServices *
    extraServicePrice;

  const discount =
    nonNegative(
      subscription.discount
    );

  const credit =
    nonNegative(
      subscription.credit
    );

  const subtotal =
    Math.max(
      0,
      baseAmount +
      vehicleAmount +
      serviceAmount
    );

  const calculated =
    Math.max(
      0,
      subtotal -
      discount -
      credit
    );

  const override =
    nullableMoney(
      subscription.finalPriceOverride
    );

  const finalAmount =
    override === null
      ? calculated
      : override;

  return {

    actualVehicles:
      usage.actualVehicles,

    enabledServices:
      usage.enabledServices,

    includedVehicles,
    includedServices,

    billedVehicles,
    billedServices,

    extraVehicles,
    extraServices,

    freeExtraVehicles,
    freeExtraServices,

    billableExtraVehicles,
    billableExtraServices,

    baseAmount:
      Number(
        baseAmount.toFixed(2)
      ),

    extraVehiclePrice:
      Number(
        extraVehiclePrice.toFixed(2)
      ),

    extraServicePrice:
      Number(
        extraServicePrice.toFixed(2)
      ),

    vehicleAmount:
      Number(
        vehicleAmount.toFixed(2)
      ),

    serviceAmount:
      Number(
        serviceAmount.toFixed(2)
      ),

    discount:
      Number(
        discount.toFixed(2)
      ),

    credit:
      Number(
        credit.toFixed(2)
      ),

    subtotal:
      Number(
        subtotal.toFixed(2)
      ),

    finalPriceOverride:
      override,

    finalAmount:
      Number(
        finalAmount.toFixed(2)
      ),

    vehicleControls,
    serviceControls
  };
}

/* =========================
   INITIALIZE TENANT PRICING
========================= */

async function ensureTenantPricing(
  tenant
){

  const defaults =
    await getDefaultPackage();

  let subscription =
    await TenantSubscription
      .findOne({
        tenantId:
          tenant._id
      });

  if(!subscription){

    subscription =
      new TenantSubscription({
        tenantId:
          tenant._id,

        status:
          tenant.subscriptionStatus ||
          "ACTIVE",

        graceDays:
          3
      });
  }

  if(
    subscription
      .pricingInitialized !==
    true
  ){

    const existingAmount =
      nonNegative(
        subscription.amount
      );

    subscription.planName =
      clean(
        subscription.planName
      ) ||
      defaults.packageName;

    subscription.billingCycle =
      normalizeCycle(
        subscription.billingCycle ||
        defaults.billingCycle
      );

    subscription.basePackageEnabled =
      defaults.packageStatus !==
      "DISABLED";

    /*
      Existing companies keep their old non-zero amount.
      New companies start from the current Default Package.
    */

    subscription.basePrice =
      existingAmount > 0
        ? existingAmount
        : nonNegative(
            defaults.basePrice
          );

    subscription.includedVehicles =
      whole(
        defaults.includedVehicles
      );

    subscription.includedServices =
      whole(
        defaults.includedServices
      );

    subscription.extraVehiclePrice =
      nonNegative(
        defaults.extraVehiclePrice
      );

    subscription.extraServicePrice =
      nonNegative(
        defaults.extraServicePrice
      );

    subscription.pricingInitialized =
      true;

    subscription.pricingUpdatedAt =
      new Date();
  }

  const usage =
    await getTenantUsage(
      tenant
    );

  const pricing =
    calculatePricing(
      subscription,
      usage
    );

  subscription.vehicleControls =
    pricing.vehicleControls;

  subscription.serviceControls =
    pricing.serviceControls;

  subscription.calculatedBaseAmount =
    pricing.baseAmount;

  subscription.calculatedVehicleAmount =
    pricing.vehicleAmount;

  subscription.calculatedServiceAmount =
    pricing.serviceAmount;

  subscription.calculatedSubtotal =
    pricing.subtotal;

  subscription.calculatedFinalAmount =
    pricing.finalAmount;

  /*
    Existing Stripe checkout route reads subscription.amount.
  */

  subscription.amount =
    pricing.finalAmount;

  await subscription.save();

  return {
    defaults,
    subscription,
    usage,
    pricing
  };
}

module.exports = {
  clean,
  nonNegative,
  whole,
  nullableMoney,
  normalizeCycle,
  getDefaultPackage,
  getTenantUsage,
  calculatePricing,
  ensureTenantPricing
};
