const fetch = require("node-fetch");

const SystemDesign =
  require("../models/SystemDesign");

const DEFAULT_RADIUS_MILES = 50;

const geocodeCache =
  global.__serviceZoneGeocodeCache ||
  new Map();

global.__serviceZoneGeocodeCache =
  geocodeCache;

function clean(value){
  return String(value ?? "").trim();
}

function numberOrNull(value){
  if(
    value === "" ||
    value === null ||
    value === undefined
  ){
    return null;
  }

  const num = Number(value);

  return Number.isFinite(num)
    ? num
    : null;
}

function bool(value){
  return (
    value === true ||
    String(value).toLowerCase() === "true" ||
    String(value).toLowerCase() === "yes" ||
    String(value).toLowerCase() === "1"
  );
}

function radiusValue(value){
  const num = Number(value);

  if(
    !Number.isFinite(num) ||
    num <= 0
  ){
    return DEFAULT_RADIUS_MILES;
  }

  return Number(num.toFixed(2));
}

function coordOk(lat,lng){
  const a = numberOrNull(lat);
  const b = numberOrNull(lng);

  return (
    a !== null &&
    b !== null &&
    a >= -90 &&
    a <= 90 &&
    b >= -180 &&
    b <= 180 &&
    !(a === 0 && b === 0)
  );
}

function normalizeZone(zone = {}){
  return {
    enabled:bool(zone?.enabled),
    country:clean(zone?.country),
    stateProvince:clean(zone?.stateProvince),
    city:clean(zone?.city),
    postalCode:clean(zone?.postalCode),
    radiusMiles:radiusValue(zone?.radiusMiles),
    centerLat:numberOrNull(zone?.centerLat),
    centerLng:numberOrNull(zone?.centerLng),
    centerAddress:clean(zone?.centerAddress)
  };
}

function buildZoneAddress(zone){
  const z = normalizeZone(zone);

  return [
    z.postalCode,
    z.city,
    z.stateProvince,
    z.country
  ]
    .filter(Boolean)
    .join(", ");
}

function zoneAddressComplete(zone){
  const z = normalizeZone(zone);

  return !!(
    z.country &&
    z.stateProvince &&
    z.city &&
    z.postalCode
  );
}

async function geocodeAddress(address){
  const q = clean(address);

  if(!q){
    return {lat:null,lng:null};
  }

  const cacheKey = q.toLowerCase();

  if(geocodeCache.has(cacheKey)){
    return geocodeCache.get(cacheKey);
  }

  const key =
    clean(
      process.env.GOOGLE_SERVER_KEY ||
      process.env.GOOGLE_KEY
    );

  if(!key){
    return {lat:null,lng:null};
  }

  try{

    const url =
      "https://maps.googleapis.com/maps/api/geocode/json" +
      "?address=" +
      encodeURIComponent(q) +
      "&key=" +
      encodeURIComponent(key);

    const response = await fetch(url);
    const data = await response.json();
    const first = data?.results?.[0];

    const result = {
      lat:numberOrNull(first?.geometry?.location?.lat),
      lng:numberOrNull(first?.geometry?.location?.lng)
    };

    if(coordOk(result.lat,result.lng)){
      geocodeCache.set(cacheKey,result);
    }

    return result;

  }catch(err){

    console.log(
      "SERVICE ZONE GEOCODE ERROR:",
      err?.message || err
    );

    return {lat:null,lng:null};
  }
}

async function prepareServiceZone(
  incoming = {},
  existing = {}
){

  const oldZone = normalizeZone(existing);

  const next =
    normalizeZone({
      ...oldZone,
      ...(incoming || {})
    });

  const nextAddress = buildZoneAddress(next);
  const oldAddress = buildZoneAddress(oldZone);

  const addressChanged =
    nextAddress.toLowerCase() !==
    oldAddress.toLowerCase();

  if(
    !nextAddress ||
    !zoneAddressComplete(next)
  ){

    next.centerLat = null;
    next.centerLng = null;
    next.centerAddress = nextAddress;

    if(next.enabled){

      const err =
        new Error(
          "Complete Country, State / Province, City, and ZIP / Postal Code before enabling this Zone."
        );

      err.code =
        "SERVICE_ZONE_ADDRESS_REQUIRED";

      throw err;
    }

    return next;
  }

  if(
    addressChanged ||
    !coordOk(
      next.centerLat,
      next.centerLng
    )
  ){

    const geo =
      await geocodeAddress(
        nextAddress
      );

    if(
      !coordOk(
        geo.lat,
        geo.lng
      )
    ){

      next.centerLat = null;
      next.centerLng = null;
      next.centerAddress = nextAddress;

      if(next.enabled){

        const err =
          new Error(
            "Unable to locate the Zone center. Check the Country, State / Province, City, and ZIP / Postal Code."
          );

        err.code =
          "SERVICE_ZONE_GEOCODE_FAILED";

        throw err;
      }

      return next;
    }

    next.centerLat = Number(geo.lat);
    next.centerLng = Number(geo.lng);
  }

  next.centerAddress = nextAddress;

  return next;
}

function toRad(value){
  return Number(value) * Math.PI / 180;
}

function distanceMiles(
  lat1,
  lng1,
  lat2,
  lng2
){

  if(
    !coordOk(lat1,lng1) ||
    !coordOk(lat2,lng2)
  ){
    return null;
  }

  const earthMiles = 3958.7613;

  const dLat =
    toRad(Number(lat2) - Number(lat1));

  const dLng =
    toRad(Number(lng2) - Number(lng1));

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthMiles * c;
}

function normalizeType(value){
  return clean(value).toLowerCase();
}

function zoneKeyForTrip(payload = {}){

  const type =
    normalizeType(payload?.type);

  const source =
    clean(payload?.source).toUpperCase();

  const bookingSource =
    clean(payload?.bookingSource).toUpperCase();

  const company =
    clean(payload?.company);

  if(
    type === "reserved" ||
    source === "RV" ||
    bookingSource === "RV"
  ){
    return "reservedZone";
  }

  if(
    type === "company" ||
    !!company ||
    source === "COMPANY" ||
    bookingSource === "COMPANY"
  ){
    return "companiesZone";
  }

  if(
    type === "quote" ||
    type === "individual" ||
    source === "QUOTE" ||
    source === "GET_QUOTE" ||
    bookingSource === "QUOTE" ||
    bookingSource === "GET_QUOTE"
  ){
    return "getQuoteZone";
  }

  return "";
}

function zoneLabel(key){

  if(key === "reservedZone"){
    return "Reserved Zone";
  }

  if(key === "companiesZone"){
    return "Companies Zone";
  }

  if(key === "getQuoteZone"){
    return "Get Quote Zone";
  }

  return "Service Zone";
}

function pickupPoints(
  payload = {},
  existingTrip = null
){

  const existing =
    existingTrip?.toObject
      ? existingTrip.toObject()
      : (existingTrip || {});

  const merged = {
    ...existing,
    ...(payload || {})
  };

  const shared =
    merged?.isShared === true ||
    clean(merged?.tripType).toUpperCase() === "SHARED";

  const passengers =
    Array.isArray(merged?.passengers)
      ? merged.passengers
      : [];

  if(
    shared &&
    passengers.length
  ){

    return passengers
      .map((passenger,index)=>({
        label:`Passenger ${index + 1}`,
        address:clean(passenger?.pickup),
        lat:numberOrNull(passenger?.pickupLat),
        lng:numberOrNull(passenger?.pickupLng)
      }))
      .filter(point =>
        point.address ||
        coordOk(point.lat,point.lng)
      );
  }

  return [{
    label:"Pickup",
    address:clean(merged?.pickup),
    lat:numberOrNull(merged?.pickupLat),
    lng:numberOrNull(merged?.pickupLng)
  }];
}

async function ensureZoneCenter(
  design,
  key
){

  const raw = design?.[key] || {};
  let zone = normalizeZone(raw);

  if(!zone.enabled){
    return zone;
  }

  if(coordOk(zone.centerLat,zone.centerLng)){
    return zone;
  }

  zone =
    await prepareServiceZone(
      zone,
      zone
    );

  if(
    design?._id &&
    coordOk(
      zone.centerLat,
      zone.centerLng
    )
  ){

    await SystemDesign.updateOne(
      {_id:design._id},
      {$set:{[key]:zone}}
    );
  }

  return zone;
}

async function resolvePickupPoint(point){

  if(coordOk(point?.lat,point?.lng)){
    return {
      lat:Number(point.lat),
      lng:Number(point.lng)
    };
  }

  const address =
    clean(point?.address);

  if(!address){
    return {lat:null,lng:null};
  }

  return await geocodeAddress(address);
}

async function validateTripZone({
  tenantId,
  payload = {},
  existingTrip = null
} = {}){

  const cleanTenantId =
    clean(tenantId);

  if(!cleanTenantId){

    return {
      allowed:true,
      skipped:true,
      reason:"TENANT_MISSING"
    };
  }

  const existing =
    existingTrip?.toObject
      ? existingTrip.toObject()
      : (existingTrip || {});

  const merged = {
    ...existing,
    ...(payload || {})
  };

  const key =
    zoneKeyForTrip(merged);

  if(!key){

    return {
      allowed:true,
      skipped:true,
      reason:"ZONE_SOURCE_NOT_APPLICABLE"
    };
  }

  const design =
    await SystemDesign.findOne({
      tenantId:cleanTenantId
    });

  if(!design){

    return {
      allowed:true,
      skipped:true,
      reason:"SYSTEM_DESIGN_NOT_FOUND"
    };
  }

  let zone;

  try{

    zone =
      await ensureZoneCenter(
        design,
        key
      );

  }catch(err){

    return {
      allowed:false,
      statusCode:400,
      code:
        err?.code ||
        "SERVICE_ZONE_CONFIGURATION_ERROR",
      message:
        err?.message ||
        "Service Zone configuration is invalid."
    };
  }

  if(!zone.enabled){

    return {
      allowed:true,
      skipped:true,
      reason:"ZONE_DISABLED",
      zoneKey:key
    };
  }

  if(
    !coordOk(
      zone.centerLat,
      zone.centerLng
    )
  ){

    return {
      allowed:false,
      statusCode:400,
      code:"SERVICE_ZONE_CENTER_MISSING",
      message:
        `${zoneLabel(key)} center could not be resolved.`
    };
  }

  const points =
    pickupPoints(
      merged,
      existingTrip
    );

  if(!points.length){

    return {
      allowed:true,
      skipped:true,
      reason:"PICKUP_MISSING",
      zoneKey:key
    };
  }

  for(const point of points){

    const coords =
      await resolvePickupPoint(point);

    if(
      !coordOk(
        coords?.lat,
        coords?.lng
      )
    ){

      return {
        allowed:false,
        statusCode:400,
        code:"PICKUP_GEOCODE_FAILED",
        message:
          `${point.label} location could not be verified for the ${zoneLabel(key)}.`
      };
    }

    const miles =
      distanceMiles(
        zone.centerLat,
        zone.centerLng,
        coords.lat,
        coords.lng
      );

    if(miles === null){

      return {
        allowed:false,
        statusCode:400,
        code:"SERVICE_ZONE_DISTANCE_FAILED",
        message:
          `Unable to verify ${point.label.toLowerCase()} against the ${zoneLabel(key)}.`
      };
    }

    if(
      miles >
      Number(zone.radiusMiles)
    ){

      return {
        allowed:false,
        statusCode:422,
        code:"OUTSIDE_SERVICE_ZONE",
        zoneKey:key,
        zone:zoneLabel(key),
        radiusMiles:Number(zone.radiusMiles),
        distanceMiles:Number(miles.toFixed(2)),
        message:
          `${point.label} is outside the ${zoneLabel(key)}. Maximum service radius: ${Number(zone.radiusMiles)} miles.`
      };
    }
  }

  return {
    allowed:true,
    zoneKey:key,
    zone:zoneLabel(key),
    radiusMiles:Number(zone.radiusMiles)
  };
}

module.exports = {
  DEFAULT_RADIUS_MILES,
  normalizeZone,
  buildZoneAddress,
  prepareServiceZone,
  distanceMiles,
  zoneKeyForTrip,
  validateTripZone
};
