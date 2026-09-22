"use strict";

/*
DESTINATION PATH:
server/services/brokerPricingEngine.js
*/

const mongoose = require("mongoose");
const BrokerPricing = require("../models/BrokerPricing");
const Service = require("../models/Service");
const Tenant = require("../models/Tenant");

const serviceIdentity =
  require("../utils/serviceIdentityResolver");

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function num(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value){
  return Number(num(value).toFixed(2));
}

function normalizeServiceCode(value){
  return serviceIdentity.normalizeServiceCode(value);
}

function escapeRegex(value){
  return clean(value)
    .replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function serviceMatchesInput(
  service,
  input
){

  const raw =
    clean(input)
      .toUpperCase();

  const normalized =
    serviceIdentity
      .normalizeServiceCode(
        input
      );

  const operational =
    serviceIdentity
      .getServiceOperationalCode(
        service
      );

  const gate =
    serviceIdentity
      .getServiceGateKey(
        service
      );

  const aliases =
    serviceIdentity
      .getServiceMatchKeys(
        service
      );

  return (
    raw === operational ||
    normalized === operational ||
    raw === gate ||
    normalized === gate ||
    aliases.includes(raw) ||
    aliases.includes(normalized)
  );
}

async function resolveTenantServiceIdentity(
  tenantId,
  requestedService
){

  const normalizedTenantId =
    mongoose.Types.ObjectId.isValid(
      String(tenantId)
    )
      ? new mongoose.Types.ObjectId(
          String(tenantId)
        )
      : tenantId;

  const services =
    await Service
      .find({
        tenantId:
          normalizedTenantId
      })
      .lean();

  const service =
    services.find(
      row =>
        serviceMatchesInput(
          row,
          requestedService
        )
    ) ||
    null;

  /*
    Legacy broker pricing may exist before Service Management
    contains a matching core-service document. Preserve that path.
  */
  if(!service){
    return {
      service:null,
      gateKey:"",
      operationalCode:
        normalizeServiceCode(
          requestedService
        ),
      configured:true,
      allowed:true
    };
  }

  const identity =
    serviceIdentity
      .resolveServiceIdentity(
        service
      );

  if(!identity.isCustom){
    return {
      service,
      gateKey:
        identity.gateKey,
      operationalCode:
        identity.operationalCode,
      configured:true,
      allowed:true
    };
  }

  if(
    identity.configured !== true ||
    !identity.operationalCode
  ){
    return {
      service,
      gateKey:
        identity.gateKey,
      operationalCode:
        identity.operationalCode,
      configured:false,
      allowed:false
    };
  }

  const tenant =
    await Tenant
      .findById(tenantId)
      .select({
        allowedServices:1
      })
      .lean();

  if(!tenant){
    return {
      service,
      gateKey:
        identity.gateKey,
      operationalCode:
        identity.operationalCode,
      configured:true,
      allowed:false
    };
  }

  const allowed =
    new Set(
      (
        Array.isArray(
          tenant.allowedServices
        )
          ? tenant.allowedServices
          : []
      )
      .map(
        serviceIdentity
          .normalizeServiceCode
      )
      .filter(Boolean)
    );

  return {
    service,
    gateKey:
      identity.gateKey,
    operationalCode:
      identity.operationalCode,
    configured:true,
    allowed:
      Boolean(identity.gateKey) &&
      allowed.has(
        identity.gateKey
      )
  };
}

function brokerRowServiceCode(row){

  if(!row){
    return "";
  }

  const values = [
    row.serviceKey,
    row.serviceSuffix,
    row.serviceCode,
    row.serviceType,
    row.serviceName
  ];

  for(const value of values){

    const code =
      serviceIdentity
        .normalizeOperationalCode(
          value
        );

    if(code.length === 2){
      return code;
    }
  }

  return normalizeServiceCode(
    values.find(Boolean)
  );
}

async function resolveBrokerPricing({
  tenantId,
  brokerId,
  brokerCode,
  brokerName,
  serviceKey
}){

  if(!tenantId){
    throw new Error(
      "Tenant is required for broker pricing"
    );
  }

  const or = [];

  if(
    brokerId &&
    mongoose.Types.ObjectId.isValid(
      String(brokerId)
    )
  ){
    or.push({brokerId});
  }

  if(clean(brokerCode)){
    or.push({
      brokerCode:upper(brokerCode)
    });
  }

  if(clean(brokerName)){
    or.push({
      brokerName:new RegExp(
        "^" +
        escapeRegex(brokerName) +
        "$",
        "i"
      )
    });
  }

  if(!or.length){
    throw new Error(
      "Broker identity is required"
    );
  }

  const rawFilter = {
    tenantId:
      mongoose.Types.ObjectId.isValid(
        String(tenantId)
      )
        ? new mongoose.Types.ObjectId(
            String(tenantId)
          )
        : tenantId,
    active:true,
    $or:or.map(condition=>{

      if(
        condition.brokerId &&
        mongoose.Types.ObjectId.isValid(
          String(condition.brokerId)
        )
      ){
        return {
          brokerId:
            new mongoose.Types.ObjectId(
              String(condition.brokerId)
            )
        };
      }

      return condition;
    })
  };

  const pricing =
    await BrokerPricing.collection
      .findOne(
        rawFilter
      );

  if(!pricing){
    throw new Error(
      "Active broker pricing was not found"
    );
  }

  const tenantServiceIdentity =
    await resolveTenantServiceIdentity(
      tenantId,
      serviceKey
    );

  if(
    tenantServiceIdentity.configured ===
    false
  ){
    throw new Error(
      "Custom broker service is not configured"
    );
  }

  if(
    tenantServiceIdentity.allowed ===
    false
  ){
    throw new Error(
      "Custom broker service is not enabled for this company"
    );
  }

  const key =
    tenantServiceIdentity
      .operationalCode ||
    normalizeServiceCode(
      serviceKey
    );

  const service =
    Array.isArray(pricing.services)
      ? pricing.services.find(
          row=>{
            const rowKey =
              brokerRowServiceCode(
                row
              );

            const enabled =
              row.enabled === true ||
              row.accessEnabled === true ||
              row.serviceAccessEnabled === true ||
              (
                row.enabled === undefined &&
                row.accessEnabled === undefined &&
                row.serviceAccessEnabled === undefined
              );

            return (
              rowKey === key &&
              enabled
            );
          }
        )
      : null;

  if(!service){
    throw new Error(
      `Service ${key || serviceKey} is not enabled for this broker`
    );
  }

  return {
    brokerPricing:pricing,

    serviceIdentity:{
      gateKey:
        tenantServiceIdentity
          .gateKey || "",
      operationalCode:key,
      isCustom:
        serviceIdentity
          .isCustomService(
            tenantServiceIdentity
              .service
          ),
      customSlot:
        serviceIdentity
          .getCustomSlot(
            tenantServiceIdentity
              .service
          ),
      displayName:
        serviceIdentity
          .getServiceDisplayName(
            tenantServiceIdentity
              .service
          ) ||
        service.serviceName ||
        key
    },

    service:{
      ...service,
      serviceKey:key,
      serviceSuffix:
        clean(
          service.serviceSuffix ||
          key
        )
          .toUpperCase(),
      sharedStopChargeEnabled:
        key === "SH"
          ? pricing
              .sharedStopChargeEnabled ===
            true
          : false
    }
  };
}

function calculateMileagePrice(
  service,
  {
    miles=0,
    stops=0
  }={}
){

  const extraMiles =
    Math.max(
      0,
      num(miles) -
      num(service.includedMiles)
    );

  return money(
    num(service.baseFare) +
    (
      extraMiles *
      num(service.perMile)
    ) +
    (
      num(stops) *
      num(service.stopFee)
    )
  );
}

function calculateHourlyPrice(
  service,
  {
    minutes=0,
    stops=0
  }={}
){

  const mins =
    Math.max(
      0,
      num(minutes)
    );

  const initialDuration =
    Math.max(
      0,
      num(
        service.initialDurationMinutes
      )
    );

  const initialPrice =
    Math.max(
      0,
      num(service.initialPrice)
    );

  let total = 0;

  if(
    initialDuration > 0 &&
    initialPrice > 0
  ){

    if(mins <= initialDuration){
      total = initialPrice;
    }else{

      const extraMinutes =
        mins - initialDuration;

      const units =
        upper(
          service.hourlyBillingMode
        ) === "QUARTER"
          ? Math.ceil(
              extraMinutes / 15
            ) * 0.25
          : Math.ceil(
              extraMinutes / 60
            );

      total =
        initialPrice +
        (
          units *
          num(service.hourlyRate)
        );
    }

  }else{

    const units =
      upper(
        service.hourlyBillingMode
      ) === "QUARTER"
        ? Math.ceil(
            mins / 15
          ) * 0.25
        : Math.ceil(
            mins / 60
          );

    total =
      units *
      num(service.hourlyRate);
  }

  total +=
    num(stops) *
    num(service.stopFee);

  return money(total);
}

function calculateSharedPrice(
  service,
  {
    passengers=[],
    passengersCount=1
  }={}
){

  /*
    BROKER SHARED PRICING

    Financial distance is NEVER the full shared route distance.

    Every passenger is priced from that passenger's own direct
    Pickup -> Drop-off road distance.

    Other riders' pickup/drop-off detours are operational route miles only
    and are not billable mileage for this passenger.

    Shared stop fees are broker-specific:
    - OFF: no shared intermediate stop fee.
    - ON : charge only the intermediate shared route points encountered
           while that passenger is onboard.
  */

  const inputPassengers =
    Array.isArray(passengers)
      ? passengers
      : [];

  const count =
    Math.max(
      1,
      inputPassengers.length ||
      Math.floor(
        num(passengersCount)
      )
    );

  const sharedStopChargeEnabled =
    service
      ?.sharedStopChargeEnabled ===
    true;

  const fixedSharedPrice =
    Math.max(
      0,
      num(service.sharedPrice)
    );

  const pricedPassengers =
    Array.from(
      {
        length:count
      },
      (_,index)=>{

        const passenger =
          inputPassengers[index] ||
          {};

        const passengerMiles =
          Math.max(
            0,
            num(
              passenger.passengerMiles ??
              passenger.directMiles ??
              passenger.miles
            )
          );

        const passengerStops =
          sharedStopChargeEnabled
            ? Math.max(
                0,
                Math.floor(
                  num(
                    passenger.sharedStopCount ??
                    passenger.chargeableSharedStops ??
                    0
                  )
                )
              )
            : 0;

        let amount = 0;

        if(fixedSharedPrice > 0){

          amount =
            fixedSharedPrice +
            (
              passengerStops *
              num(service.stopFee)
            );

        }else{

          const extraMiles =
            Math.max(
              0,
              passengerMiles -
              num(service.includedMiles)
            );

          amount =
            num(service.baseFare) +
            (
              extraMiles *
              num(service.perMile)
            ) +
            (
              passengerStops *
              num(service.stopFee)
            );
        }

        return {
          index,
          passengerMiles:
            money(passengerMiles),
          sharedStopCount:
            passengerStops,
          baseFare:
            money(
              fixedSharedPrice > 0
                ? fixedSharedPrice
                : service.baseFare
            ),
          stopFee:
            money(
              passengerStops *
              num(service.stopFee)
            ),
          total:
            money(amount)
        };
      }
    );

  const total =
    money(
      pricedPassengers.reduce(
        (sum,row)=>
          sum + num(row.total),
        0
      )
    );

  return {
    total,
    pricePerPassenger:
      money(
        total / count
      ),
    sharedStopChargeEnabled,
    passengers:
      pricedPassengers
  };
}

async function calculateBrokerPrice(input={}){

  const {
    brokerPricing,
    service,
    serviceIdentity:
      resolvedServiceIdentity
  } =
    await resolveBrokerPricing(
      input
    );

  const mode =
    upper(
      service.pricingMode ||
      "MILE"
    );

  let total = 0;
  let pricePerPassenger = 0;

  if(
    mode === "SHARED" ||
    service.shared === true ||
    normalizeServiceCode(
      service.serviceKey
    ) === "SH"
  ){

    const shared =
      calculateSharedPrice(
        service,
        input
      );

    total =
      shared.total;

    pricePerPassenger =
      shared.pricePerPassenger;

    input.sharedPassengerPrices =
      shared.passengers || [];

    input.sharedStopChargeEnabled =
      shared.sharedStopChargeEnabled === true;

  }else if(mode === "HOURLY"){

    total =
      calculateHourlyPrice(
        service,
        input
      );

    pricePerPassenger =
      total;

  }else{

    total =
      calculateMileagePrice(
        service,
        input
      );

    pricePerPassenger =
      total;
  }

  return {
    success:true,
    brokerId:
      String(
        brokerPricing.brokerId
      ),
    brokerCode:
      brokerPricing.brokerCode,
    brokerName:
      brokerPricing.brokerName,
    serviceKey:
      service.serviceKey,
    serviceName:
      service.serviceName ||
      resolvedServiceIdentity
        ?.displayName ||
      service.serviceKey,
    serviceIdentity:
      resolvedServiceIdentity ||
      null,
    pricingMode:mode,
    miles:num(input.miles),
    minutes:num(input.minutes),
    stops:num(input.stops),
    passengersCount:
      Math.max(
        1,
        Math.floor(
          num(
            input.passengersCount ||
            1
          )
        )
      ),
    total,
    pricePerPassenger,
    sharedStopChargeEnabled:
      input.sharedStopChargeEnabled === true,
    passengerPrices:
      Array.isArray(
        input.sharedPassengerPrices
      )
        ? input.sharedPassengerPrices
        : [],
    currency:"USD"
  };
}

module.exports = {
  normalizeServiceCode,
  resolveBrokerPricing,
  calculateMileagePrice,
  calculateHourlyPrice,
  calculateSharedPrice,
  calculateBrokerPrice
};
