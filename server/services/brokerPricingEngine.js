"use strict";

/*
DESTINATION PATH:
server/services/brokerPricingEngine.js
*/

const mongoose = require("mongoose");
const BrokerPricing = require("../models/BrokerPricing");

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
  const compact =
    upper(value)
      .replace(/[_\s-]+/g,"");

  if(
    compact === "ST" ||
    compact === "STANDARD" ||
    compact.includes("STANDARD")
  ) return "ST";

  if(
    compact === "WH" ||
    compact === "WC" ||
    compact.includes("WHEELCHAIR")
  ) return "WH";

  if(
    compact === "SH" ||
    compact === "SHARED" ||
    compact.includes("SHARED")
  ) return "SH";

  if(
    compact === "LM" ||
    compact === "LIMO" ||
    compact.includes("LIMO")
  ) return "LM";

  if(
    compact === "TX" ||
    compact === "TAXI" ||
    compact.includes("TAXI")
  ) return "TX";

  if(
    compact === "XL" ||
    compact.startsWith("XL")
  ) return "XL";

  return upper(value);
}

function escapeRegex(value){
  return clean(value)
    .replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
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

  const pricing =
    await BrokerPricing
      .findOne({
        tenantId,
        active:true,
        $or:or
      })
      .lean();

  if(!pricing){
    throw new Error(
      "Active broker pricing was not found"
    );
  }

  const key =
    normalizeServiceCode(
      serviceKey
    );

  const service =
    Array.isArray(pricing.services)
      ? pricing.services.find(
          row=>{
            const rowKey =
              normalizeServiceCode(
                row.serviceKey ||
                row.serviceName ||
                row.serviceSuffix ||
                ""
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
    service:{
      ...service,
      serviceKey:key
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
    passengersCount=1,
    miles=0,
    stops=0
  }={}
){

  const passengers =
    Math.max(
      1,
      Math.floor(
        num(passengersCount)
      )
    );

  if(
    num(service.sharedPrice) > 0
  ){
    return {
      total:
        money(
          num(service.sharedPrice) *
          passengers
        ),
      pricePerPassenger:
        money(service.sharedPrice)
    };
  }

  const total =
    calculateMileagePrice(
      service,
      {
        miles,
        stops
      }
    );

  return {
    total,
    pricePerPassenger:
      money(
        total / passengers
      )
  };
}

async function calculateBrokerPrice(input={}){

  const {
    brokerPricing,
    service
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
      service.serviceName,
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
