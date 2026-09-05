"use strict";

const User = require("../models/User");
const DriverSchedule = require("../models/DriverSchedule");
const TenantSubscription = require("../models/TenantSubscription");
const PlatformBillingSettings = require("../models/PlatformBillingSettings");

function clean(v){
  return String(v ?? "").trim();
}

function num(v,fallback=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function nonNegative(v,fallback=0){
  return Math.max(0,num(v,fallback));
}

function whole(v,fallback=0){
  return Math.max(0,Math.floor(nonNegative(v,fallback)));
}

function nullableMoney(v){
  if(v === null || v === undefined || clean(v) === ""){
    return null;
  }

  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0,n) : null;
}

function normalizeCycle(v){
  const cycle = clean(v).toUpperCase();
  return ["MONTHLY","ANNUAL"].includes(cycle)
    ? cycle
    : "MONTHLY";
}

async function getDefaultPackage(){
  let row = await PlatformBillingSettings.findOne({
    key:"DEFAULT_PACKAGE"
  });

  if(!row){
    row = await PlatformBillingSettings.create({
      key:"DEFAULT_PACKAGE",
      packageName:"GH Mobility Starter",
      basePrice:99,
      includedVehicles:5,
      includedServices:2,
      maxDrivers:5,
      maxVehicles:5,
      maxAdmins:2,
      maxSuperAdmins:2,
      maxDispatchers:2,
      maxCompanies:3,
      maxServices:2,
      billingCycle:"MONTHLY",
      extraVehiclePrice:10,
      extraServicePrice:15,
      packageStatus:"ACTIVE"
    });
  }

  return row;
}

function normalizeControls(rows){
  const map = new Map();

  (Array.isArray(rows) ? rows : []).forEach(row=>{
    const key = clean(row?.key);
    if(!key) return;

    map.set(key,{
      key,
      label:clean(row?.label) || key,
      accessEnabled:row?.accessEnabled !== false,
      billingEnabled:row?.billingEnabled !== false
    });
  });

  return map;
}

function mergeControls(items,savedRows){
  const saved = normalizeControls(savedRows);

  return items.map(item=>{
    const old = saved.get(item.key);

    return {
      key:item.key,
      label:item.label,
      accessEnabled:old ? old.accessEnabled : true,
      billingEnabled:old ? old.billingEnabled : true
    };
  });
}

async function getTenantUsage(tenant){
  const users = await User.find({
    tenantId:tenant._id
  })
  .select("_id role active enabled vehicleNumber vehicle")
  .lean();

  const roleCounts = {
    drivers:0,
    admins:0,
    superAdmins:0,
    dispatchers:0,
    companies:0
  };

  users.forEach(user=>{
    const role =
      clean(user.role)
        .toLowerCase()
        .replace(/[\s-]+/g,"_");

    if(role === "driver"){
      roleCounts.drivers += 1;
      return;
    }

    if(role === "admin"){
      roleCounts.admins += 1;
      return;
    }

    if(
      role === "superadmin" ||
      role === "super_admin"
    ){
      roleCounts.superAdmins += 1;
      return;
    }

    if(role === "dispatcher"){
      roleCounts.dispatchers += 1;
      return;
    }

    if(
      role === "company" ||
      role === "facility"
    ){
      roleCounts.companies += 1;
    }
  });

  const tenantDrivers = users.filter(user=>{
    const role = clean(user.role).toLowerCase();
    return role === "driver";
  });

  const vehicleMap = new Map();

  function addVehicle(value){
    const raw = clean(value);
    if(!raw) return;

    const key = raw.toUpperCase();

    if(!vehicleMap.has(key)){
      vehicleMap.set(key,{
        key,
        label:raw
      });
    }
  }

  /*
    Primary source:
    Driver Schedule stores the Car value in vehicleNumber.
    Match schedules by driverId so billing uses the same vehicle
    shown on the Driver Schedule page.
  */
  const driverIds = tenantDrivers
    .map(driver=>String(driver._id))
    .filter(Boolean);

  if(driverIds.length){
    try{
      const schedules = await DriverSchedule.find({
        driverId:{
          $in:driverIds
        }
      })
      .select("driverId vehicleNumber")
      .lean();

      schedules.forEach(row=>{
        addVehicle(row.vehicleNumber);
      });

    }catch(err){
      console.error(
        "SAAS BILLING DRIVER SCHEDULE ERROR:",
        err?.message || err
      );
    }
  }

  /*
    Fallback:
    Keep the original working User vehicle behavior.
  */
  tenantDrivers
    .filter(user=>{
      return (
        user.enabled !== false &&
        user.active !== false
      );
    })
    .forEach(user=>{
      addVehicle(
        user.vehicleNumber ||
        user.vehicle
      );
    });

  const vehicles = [...vehicleMap.values()]
    .sort((a,b)=>a.label.localeCompare(b.label));

  const serviceKeys = Array.isArray(tenant.allowedServices)
    ? [...new Set(
        tenant.allowedServices
          .map(v=>clean(v).toUpperCase())
          .filter(Boolean)
      )]
    : [];

  const services = serviceKeys
    .map(key=>({
      key,
      label:key
    }))
    .sort((a,b)=>a.label.localeCompare(b.label));

  return {
    vehicles,
    services,

    actualDrivers:
      roleCounts.drivers,

    actualVehicles:
      vehicles.length,

    actualAdmins:
      roleCounts.admins,

    actualSuperAdmins:
      roleCounts.superAdmins,

    actualDispatchers:
      roleCounts.dispatchers,

    actualCompanies:
      roleCounts.companies,

    enabledServices:
      services.length
  };
}

function calculatePricing(subscription,usage){
  const vehicleControls = mergeControls(
    usage.vehicles,
    subscription.vehicleControls
  );

  const serviceControls = mergeControls(
    usage.services,
    subscription.serviceControls
  );

  const billedVehicles = vehicleControls
    .filter(x=>x.billingEnabled)
    .length;

  const billedServices = serviceControls
    .filter(x=>x.billingEnabled)
    .length;

  const includedVehicles = whole(subscription.includedVehicles);
  const includedServices = whole(subscription.includedServices);

  const maxDrivers =
    whole(subscription.maxDrivers,5);

  const maxVehicles =
    whole(
      subscription.maxVehicles,
      includedVehicles
    );

  const maxAdmins =
    whole(subscription.maxAdmins,2);

  const maxSuperAdmins =
    whole(subscription.maxSuperAdmins,2);

  const maxDispatchers =
    whole(subscription.maxDispatchers,2);

  const maxCompanies =
    whole(subscription.maxCompanies,3);

  const maxServices =
    whole(
      subscription.maxServices,
      includedServices
    );

  const extraVehicles = Math.max(
    0,
    billedVehicles - includedVehicles
  );

  const extraServices = Math.max(
    0,
    billedServices - includedServices
  );

  const freeExtraVehicles = whole(subscription.freeExtraVehicles);
  const freeExtraServices = whole(subscription.freeExtraServices);

  const billableExtraVehicles = Math.max(
    0,
    extraVehicles - freeExtraVehicles
  );

  const billableExtraServices = Math.max(
    0,
    extraServices - freeExtraServices
  );

  const baseAmount =
    subscription.basePackageEnabled === false
      ? 0
      : nonNegative(subscription.basePrice);

  const extraVehiclePrice =
    nonNegative(subscription.extraVehiclePrice);

  const extraServicePrice =
    nonNegative(subscription.extraServicePrice);

  const vehicleAmount =
    billableExtraVehicles * extraVehiclePrice;

  const serviceAmount =
    billableExtraServices * extraServicePrice;

  const discount = nonNegative(subscription.discount);
  const credit = nonNegative(subscription.credit);

  const subtotal = Math.max(
    0,
    baseAmount + vehicleAmount + serviceAmount
  );

  const calculated = Math.max(
    0,
    subtotal - discount - credit
  );

  const override = nullableMoney(
    subscription.finalPriceOverride
  );

  const finalAmount =
    override === null
      ? calculated
      : override;

  return {
    actualDrivers:
      whole(usage.actualDrivers),

    actualVehicles:
      whole(usage.actualVehicles),

    actualAdmins:
      whole(usage.actualAdmins),

    actualSuperAdmins:
      whole(usage.actualSuperAdmins),

    actualDispatchers:
      whole(usage.actualDispatchers),

    actualCompanies:
      whole(usage.actualCompanies),

    enabledServices:
      whole(usage.enabledServices),

    maxDrivers,
    maxVehicles,
    maxAdmins,
    maxSuperAdmins,
    maxDispatchers,
    maxCompanies,
    maxServices,

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

    baseAmount:Number(baseAmount.toFixed(2)),
    extraVehiclePrice:Number(extraVehiclePrice.toFixed(2)),
    extraServicePrice:Number(extraServicePrice.toFixed(2)),
    vehicleAmount:Number(vehicleAmount.toFixed(2)),
    serviceAmount:Number(serviceAmount.toFixed(2)),
    discount:Number(discount.toFixed(2)),
    credit:Number(credit.toFixed(2)),
    subtotal:Number(subtotal.toFixed(2)),
    finalPriceOverride:override,
    finalAmount:Number(finalAmount.toFixed(2)),

    vehicleControls,
    serviceControls
  };
}

async function ensureTenantPricing(tenant){
  const defaults = await getDefaultPackage();

  let subscription = await TenantSubscription.findOne({
    tenantId:tenant._id
  });

  if(!subscription){
    subscription = new TenantSubscription({
      tenantId:tenant._id,
      status:tenant.subscriptionStatus || "ACTIVE",
      graceDays:3
    });
  }

  if(subscription.pricingInitialized !== true){
    const existingAmount = nonNegative(subscription.amount);

    subscription.planName =
      clean(subscription.planName) ||
      defaults.packageName;

    subscription.billingCycle =
      normalizeCycle(
        subscription.billingCycle ||
        defaults.billingCycle
      );

    subscription.basePackageEnabled =
      defaults.packageStatus !== "DISABLED";

    /*
      Existing companies keep their old non-zero amount
      as the starting base price.
    */
    subscription.basePrice =
      existingAmount > 0
        ? existingAmount
        : nonNegative(defaults.basePrice);

    subscription.includedVehicles =
      whole(defaults.includedVehicles);

    subscription.includedServices =
      whole(defaults.includedServices);

    subscription.extraVehiclePrice =
      nonNegative(defaults.extraVehiclePrice);

    subscription.extraServicePrice =
      nonNegative(defaults.extraServicePrice);

    subscription.pricingInitialized = true;
    subscription.pricingUpdatedAt = new Date();
  }

  /*
    LIMIT INITIALIZATION IS SEPARATE FROM PRICING INITIALIZATION.
    This is required for existing tenants whose pricing was already
    initialized before package creation limits were introduced.
  */
  if(subscription.limitsInitialized !== true){

    subscription.maxDrivers =
      whole(defaults.maxDrivers,5);

    subscription.maxVehicles =
      whole(
        defaults.maxVehicles,
        defaults.includedVehicles ?? 5
      );

    subscription.maxAdmins =
      whole(defaults.maxAdmins,2);

    subscription.maxSuperAdmins =
      whole(defaults.maxSuperAdmins,2);

    subscription.maxDispatchers =
      whole(defaults.maxDispatchers,2);

    subscription.maxCompanies =
      whole(defaults.maxCompanies,3);

    subscription.maxServices =
      whole(
        defaults.maxServices,
        defaults.includedServices ?? 2
      );

    subscription.limitsInitialized = true;
    subscription.pricingUpdatedAt = new Date();
  }

  const usage = await getTenantUsage(tenant);
  const pricing = calculatePricing(subscription,usage);

  subscription.vehicleControls = pricing.vehicleControls;
  subscription.serviceControls = pricing.serviceControls;

  subscription.calculatedBaseAmount = pricing.baseAmount;
  subscription.calculatedVehicleAmount = pricing.vehicleAmount;
  subscription.calculatedServiceAmount = pricing.serviceAmount;
  subscription.calculatedSubtotal = pricing.subtotal;
  subscription.calculatedFinalAmount = pricing.finalAmount;

  /*
    Existing checkout route reads subscription.amount.
  */
  subscription.amount = pricing.finalAmount;

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
