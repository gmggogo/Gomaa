"use strict";
const SmartFormPricing=require("../models/SmartFormPricing");
const {calculateMileagePrice,calculateHourlyPrice,calculateSharedPrice,normalizeServiceCode}=require("./brokerPricingEngine");
const clean=v=>String(v??"").trim(); const upper=v=>clean(v).toUpperCase(); const num=v=>Number.isFinite(Number(v))?Number(v):0;
function rowMatches(row,input){const n=normalizeServiceCode(input);return [row.serviceKey,row.serviceName].some(v=>upper(v)===upper(input)||normalizeServiceCode(v)===n);}
async function calculateSmartFormPrice(input={}){
  if(!input.tenantId||!input.templateId) throw Object.assign(new Error("Tenant and template are required for Smart Form pricing"),{statusCode:400});
  const pricing=await SmartFormPricing.findOne({tenantId:input.tenantId,templateId:input.templateId,active:true}).lean();
  if(!pricing) throw Object.assign(new Error("Smart Form pricing is not configured for this template"),{statusCode:404});
  const service=(pricing.services||[]).find(r=>r.enabled!==false&&rowMatches(r,input.serviceKey||input.serviceName));
  if(!service) throw Object.assign(new Error("Pricing is not enabled for this service in the selected template"),{statusCode:404});
  const mode=upper(service.pricingMode||"MILE"); let total=0;
  if(mode==="SHARED"||service.shared===true) total=calculateSharedPrice(service,input).total;
  else if(mode==="HOURLY") total=calculateHourlyPrice(service,input);
  else total=calculateMileagePrice(service,input);
  return {success:true,templateId:String(pricing.templateId),templateName:pricing.templateName,serviceKey:service.serviceKey,serviceName:service.serviceName||service.serviceKey,pricingMode:mode,miles:num(input.miles),minutes:num(input.minutes),stops:num(input.stops),total:Number(Number(total||0).toFixed(2)),currency:"USD"};
}
module.exports={calculateSmartFormPrice};
