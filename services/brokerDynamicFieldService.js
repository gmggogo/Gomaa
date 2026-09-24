"use strict";

/*
DESTINATION PATH:
server/services/brokerDynamicFieldService.js

PURPOSE:
- Discover unknown fields sent by any Broker automatically.
- Keep different Broker schemas side-by-side for the same tenant.
- Preserve field values on each ExternalTrip.
- Merge Platform Admin Broker Booking Data rules with auto-discovered fields.
*/

const crypto = require("crypto");
const BrokerDynamicField = require("../models/BrokerDynamicField");
const BookingDataConfig = require("../models/BookingDataConfig");
const bookingFieldRegistry = require("./bookingFieldRegistry");

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function slugLabel(path){
  const last = clean(path).split(".").filter(Boolean).pop() || clean(path);
  return last
    .replace(/([a-z0-9])([A-Z])/g,"$1 $2")
    .replace(/[_-]+/g," ")
    .replace(/\s+/g," ")
    .trim()
    .replace(/\b\w/g,ch=>ch.toUpperCase());
}

function fieldTypeFromValue(value){
  if(typeof value === "boolean") return "YES_NO";
  if(typeof value === "number") return "NUMBER";

  const text = clean(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)) return "DATE";
  if(/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) return "TIME";
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "EMAIL";
  if(/^\+?[0-9()\-\s.]{7,}$/.test(text)) return "PHONE";
  if(text.length > 140) return "LONG_TEXT";
  return "TEXT";
}

function flatten(value,prefix="",out=[]){
  if(value === null || value === undefined) return out;

  if(Array.isArray(value)){
    /*
      Avoid turning passengers/stops into dozens of numbered columns.
      Arrays of scalars are kept as one readable value.
    */
    const scalarOnly = value.every(item=>
      item === null ||
      item === undefined ||
      ["string","number","boolean"].includes(typeof item)
    );

    if(scalarOnly && prefix){
      out.push({
        path:prefix,
        value:value.map(item=>clean(item)).filter(Boolean).join(" | ")
      });
    }
    return out;
  }

  if(typeof value === "object"){
    Object.entries(value).forEach(([key,item])=>{
      const path = prefix ? `${prefix}.${key}` : key;
      flatten(item,path,out);
    });
    return out;
  }

  if(prefix){
    out.push({path:prefix,value});
  }

  return out;
}

/* Built-in broker trip columns must never be auto-created again. */
const BUILTIN_PATHS = new Set([
  "externaltripid","tripid","requestid","reservationid","trackingnumber",
  "servicekey","servicecode","servicetype","modeoftransportation","servicename",
  "tripdate","date","servicedate","triptime","pickuptime","appointmenttime","returntime",
  "clientname","passengername","membername","clientphone","passengerphone","phone",
  "clientemail","email","memberid","medicaidid","pickup","pickupaddress","pickuplat","pickuplng",
  "pickupgeokey","pickupgeoaddress","pickupgeosource","dropoff","dropoffaddress","dropofflat","dropofflng",
  "dropoffgeokey","dropoffgeoaddress","dropoffgeosource","stops","intermediatestops","passengers",
  "notes","tripnotes","specialinstructions","driverinstructions","brokernotes","brokerstatus","status",
  "source","connectiontype"
]);

function normalizedPath(path){
  return clean(path).toLowerCase().replace(/[^a-z0-9.]+/g,"");
}

function shouldIgnorePath(path){
  const p = normalizedPath(path);
  if(!p) return true;

  const root = p.split(".")[0];
  if(BUILTIN_PATHS.has(p) || BUILTIN_PATHS.has(root)) return true;

  return [
    "passengers.",
    "stops.",
    "intermediatestops."
  ].some(prefix=>p.startsWith(prefix));
}

function autoFieldKey(brokerCode,path){
  const hash = crypto
    .createHash("sha1")
    .update(`${upper(brokerCode)}|${clean(path).toLowerCase()}`)
    .digest("hex")
    .slice(0,12)
    .toUpperCase();

  return `BROKER_${upper(brokerCode)}_${hash}`;
}

async function brokerConfiguredDefinitions(tenantId){
  const config = await BookingDataConfig
    .findOne({tenantId})
    .select({standardFields:1,customFields:1})
    .lean();

  return bookingFieldRegistry.bookingFieldDefinitions(
    config || {},
    "broker"
  );
}

async function captureBrokerDynamicData({
  tenantId,
  brokerCode,
  brokerName,
  payload
}){
  const definitions =
    await brokerConfiguredDefinitions(tenantId);

  const mapped =
    bookingFieldRegistry.mapExternalPayload(
      payload || {},
      definitions,
      "BROKER"
    );

  const snapshots = [
    ...(Array.isArray(mapped.mapped) ? mapped.mapped : [])
  ];

  const unknown = flatten(payload || {})
    .filter(item=>
      !shouldIgnorePath(item.path) &&
      !Object.prototype.hasOwnProperty.call(mapped.unmapped || {},item.path)
        ? false
        : !shouldIgnorePath(item.path)
    );

  /*
    mapExternalPayload exposes exactly which paths were not matched to
    Platform Admin Booking Data definitions. Use those paths as the discovery set.
  */
  const unmappedPaths = new Set(
    Object.keys(mapped.unmapped || {})
  );

  for(const item of unknown){
    if(!unmappedPaths.has(item.path)) continue;

    const value = item.value;
    const text = value === null || value === undefined ? "" : String(value);
    if(!text.trim()) continue;

    const fieldKey = autoFieldKey(brokerCode,item.path);
    const label = slugLabel(item.path);
    const fieldType = fieldTypeFromValue(value);

    await BrokerDynamicField.updateOne(
      {
        tenantId,
        brokerCode:upper(brokerCode),
        fieldPath:item.path
      },
      {
        $set:{
          brokerName:clean(brokerName),
          fieldKey,
          label,
          fieldType,
          showColumn:true,
          showEye:true,
          lastSeenAt:new Date(),
          sampleValue:text.slice(0,200)
        },
        $setOnInsert:{
          firstSeenAt:new Date()
        }
      },
      {upsert:true}
    );

    snapshots.push({
      source:"BROKER_AUTO",
      brokerCode:upper(brokerCode),
      key:fieldKey,
      path:item.path,
      label,
      fieldType,
      required:false,
      value:text
    });
  }

  return snapshots;
}

async function listBrokerFields(tenantId){
  const [configured,auto] = await Promise.all([
    brokerConfiguredDefinitions(tenantId),
    BrokerDynamicField.find({tenantId})
      .sort({brokerCode:1,label:1,createdAt:1})
      .lean()
  ]);

  const rows = [];

  configured.forEach((field,index)=>{
    if(field.showColumn !== true && field.showEye !== true) return;

    rows.push({
      key:clean(field.key),
      label:clean(field.label || field.key),
      fieldType:upper(field.fieldType || "TEXT"),
      source:"PLATFORM_ADMIN",
      brokerCode:"*",
      fieldPath:"",
      showColumn:field.showColumn === true,
      showEye:field.showEye === true,
      order:Number(field.order ?? index)
    });
  });

  auto.forEach((field,index)=>{
    rows.push({
      key:clean(field.fieldKey),
      label:clean(field.label || field.fieldPath),
      fieldType:upper(field.fieldType || "TEXT"),
      source:"BROKER_AUTO",
      brokerCode:upper(field.brokerCode),
      brokerName:clean(field.brokerName),
      fieldPath:clean(field.fieldPath),
      showColumn:field.showColumn !== false,
      showEye:field.showEye !== false,
      order:10000 + index
    });
  });

  return rows;
}

function brokerDynamicValue(source,key){
  const list = Array.isArray(source?.brokerDynamicData)
    ? source.brokerDynamicData
    : [];

  const row = list.find(item=>clean(item?.key) === clean(key));
  return row?.value ?? "";
}

module.exports = {
  captureBrokerDynamicData,
  listBrokerFields,
  brokerDynamicValue
};