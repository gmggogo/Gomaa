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
      basePrice:125,
      includedVehicles:5,
      includedServices:1,
      includedBrokers:1,
      maxDrivers:5,
      maxVehicles:5,
      maxAdmins:2,
      maxSuperAdmins:2,
      maxDispatchers:2,
      maxCompanies:2,
      maxServices:1,
      maxBrokers:1,
      billingCycle:"MONTHLY",
      extraVehiclePrice:25,
      extraServicePrice:15,
      extraBrokerPrice:0,
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


function normalizeServicePricing(rows){
  const map = new Map();

  (Array.isArray(rows) ? rows : []).forEach(row=>{
    const key = clean(row?.key).toUpperCase();
    if(!key) return;

    map.set(key,{
      key,
      label:clean(row?.label) || key,
      included:row?.included === true,
      monthlyPrice:nonNegative(row?.monthlyPrice)
    });
  });

  return map;
}

function mergeServicePricing(serviceControls,savedRows,includedSlots,fallbackPrice){
  const saved = normalizeServicePricing(savedRows);
  let remainingIncluded = whole(includedSlots);

  const rows = (Array.isArray(serviceControls) ? serviceControls : []).map(control=>{
    const key = clean(control?.key).toUpperCase();
    const old = saved.get(key);

    let included = old ? old.included === true : false;

    if(!old && control?.billingEnabled !== false && remainingIncluded > 0){
      included = true;
      remainingIncluded -= 1;
    }

    if(old?.included === true && remainingIncluded > 0){
      remainingIncluded -= 1;
    }

    return {
      key,
      label:clean(control?.label) || key,
      included,
      monthlyPrice:old
        ? nonNegative(old.monthlyPrice)
        : nonNegative(fallbackPrice)
    };
  });

  return rows;
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
    whole(subscription.maxCompanies,2);

  const maxServices =
    whole(
      subscription.maxServices,
      includedServices
    );

  const maxBrokers =
    whole(
      subscription.maxBrokers,
      whole(subscription.includedBrokers,1)
    );

  const extraVehicles = Math.max(
    0,
    billedVehicles - includedVehicles
  );

  const freeExtraVehicles = whole(subscription.freeExtraVehicles);

  const billableExtraVehicles = Math.max(
    0,
    extraVehicles - freeExtraVehicles
  );

  const basePackageAmount =
    subscription.basePackageEnabled === false
      ? 0
      : nonNegative(subscription.basePrice);

  const extraVehiclePrice =
    nonNegative(subscription.extraVehiclePrice);

  /*
    Base package price does NOT include a service.
    The selected Included service is added at its full monthly price.

    Example:
    Base package = $100
    Selected Included service (WH) = $40
    Package with service = $140

    Every other active Billable service is charged at its full add-on price.
  */
  const defaultServicePrice =
    nonNegative(subscription.extraServicePrice);

  const servicePricing = mergeServicePricing(
    serviceControls,
    subscription.servicePricing,
    includedServices,
    defaultServicePrice
  );

  const includedServiceRows =
    servicePricing.filter(row=>{
      const control = serviceControls.find(x=>
        clean(x.key).toUpperCase() === row.key
      );

      return (
        control?.billingEnabled !== false &&
        row.included === true
      );
    });

  const includedServicePriceTotal =
    includedServiceRows.reduce(
      (sum,row)=>sum + nonNegative(row.monthlyPrice),
      0
    );

  const baseAmount = Math.max(
    0,
    basePackageAmount + includedServicePriceTotal
  );

  const billableServiceRows =
    servicePricing.filter(row=>{
      const control = serviceControls.find(x=>
        clean(x.key).toUpperCase() === row.key
      );

      return (
        control?.billingEnabled !== false &&
        row.included !== true
      );
    });

  const extraServices =
    billableServiceRows.length;

  const freeExtraServices =
    whole(subscription.freeExtraServices);

  const billableExtraServices =
    Math.max(
      0,
      extraServices - freeExtraServices
    );

  let remainingFreeServices =
    freeExtraServices;

  const serviceCharges =
    billableServiceRows.map(row=>{
      const free = remainingFreeServices > 0;

      if(free){
        remainingFreeServices -= 1;
      }

      const amount =
        free
          ? 0
          : nonNegative(row.monthlyPrice);

      return {
        key:row.key,
        label:row.label,
        included:false,
        free,
        monthlyPrice:nonNegative(row.monthlyPrice),
        amount
      };
    });

  const vehicleAmount =
    billableExtraVehicles * extraVehiclePrice;

  const serviceAmount =
    serviceCharges.reduce(
      (sum,row)=>sum + nonNegative(row.amount),
      0
    );

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
    maxBrokers,

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

    basePackageAmount:Number(basePackageAmount.toFixed(2)),
    includedServicePriceTotal:Number(includedServicePriceTotal.toFixed(2)),
    baseAmount:Number(baseAmount.toFixed(2)),
    extraVehiclePrice:Number(extraVehiclePrice.toFixed(2)),
    extraServicePrice:Number(defaultServicePrice.toFixed(2)),
    vehicleAmount:Number(vehicleAmount.toFixed(2)),
    serviceAmount:Number(serviceAmount.toFixed(2)),
    serviceCharges:serviceCharges.map(row=>({
      ...row,
      monthlyPrice:Number(row.monthlyPrice.toFixed(2)),
      amount:Number(row.amount.toFixed(2))
    })),
    discount:Number(discount.toFixed(2)),
    credit:Number(credit.toFixed(2)),
    subtotal:Number(subtotal.toFixed(2)),
    finalPriceOverride:override,
    finalAmount:Number(finalAmount.toFixed(2)),

    vehicleControls,
    serviceControls,
    servicePricing
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

    subscription.includedBrokers =
      whole(defaults.includedBrokers,1);

    subscription.extraVehiclePrice =
      nonNegative(defaults.extraVehiclePrice);

    subscription.extraServicePrice =
      nonNegative(defaults.extraServicePrice);

    subscription.extraBrokerPrice =
      nonNegative(defaults.extraBrokerPrice);

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
        defaults.includedServices ?? 1
      );

    subscription.maxBrokers =
      whole(
        defaults.maxBrokers,
        defaults.includedBrokers ?? 1
      );

    subscription.limitsInitialized = true;
    subscription.pricingUpdatedAt = new Date();
  }

  const usage = await getTenantUsage(tenant);
  const pricing = calculatePricing(subscription,usage);

  subscription.vehicleControls = pricing.vehicleControls;
  subscription.serviceControls = pricing.serviceControls;
  subscription.servicePricing = pricing.servicePricing;

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
