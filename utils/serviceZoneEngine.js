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
  return clean(value)
    .toLowerCase()
    .replace(/[\s_-]+/g,"");
}

function normalizeSource(value){
  return clean(value)
    .toUpperCase()
    .replace(/[\s-]+/g,"_");
}

function zoneKeyForTrip(payload = {}){

  const type =
    normalizeType(payload?.type);

  const source =
    normalizeSource(payload?.source);

  const bookingSource =
    normalizeSource(payload?.bookingSource);

  const from =
    normalizeSource(payload?.from);

  const tripNumber =
    clean(payload?.tripNumber).toUpperCase();

  const company =
    clean(payload?.company);

  if(
    type === "reserved" ||
    type === "reservation" ||
    source === "RV" ||
    source === "RESERVED" ||
    source === "RESERVATION" ||
    bookingSource === "RV" ||
    bookingSource === "RESERVED" ||
    bookingSource === "RESERVATION" ||
    tripNumber.startsWith("RV-")
  ){
    return "reservedZone";
  }

  if(
    type === "company" ||
    type === "facility" ||
    !!company ||
    source === "COMPANY" ||
    source === "FACILITY" ||
    bookingSource === "COMPANY" ||
    bookingSource === "FACILITY"
  ){
    return "companiesZone";
  }

  if(
    type === "quote" ||
    type === "getquote" ||
    type === "individual" ||
    source === "QUOTE" ||
    source === "GET_QUOTE" ||
    source === "GETQUOTE" ||
    source === "GQ" ||
    source === "WEBSITE" ||
    source === "PUBLIC" ||
    bookingSource === "QUOTE" ||
    bookingSource === "GET_QUOTE" ||
    bookingSource === "GETQUOTE" ||
    bookingSource === "GQ" ||
    from === "GET_QUOTE" ||
    from === "GETQUOTE" ||
    from === "GQ" ||
    from === "WEBSITE" ||
    from === "PUBLIC" ||
    tripNumber.startsWith("GQ-")
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

function normalizeStopPoint(stop,index){

  if(
    stop === null ||
    stop === undefined
  ){
    return null;
  }

  if(typeof stop === "string"){

    const address =
      clean(stop);

    return address
      ? {
          label:`Stop ${index + 1}`,
          address,
          lat:null,
          lng:null
        }
      : null;
  }

  if(typeof stop !== "object"){
    return null;
  }

  const address =
    clean(
      stop?.address ||
      stop?.location ||
      stop?.stopAddress ||
      stop?.value ||
      stop?.name ||
      ""
    );

  const lat =
    numberOrNull(
      stop?.lat ??
      stop?.latitude ??
      stop?.stopLat
    );

  const lng =
    numberOrNull(
      stop?.lng ??
      stop?.lon ??
      stop?.longitude ??
      stop?.stopLng
    );

  if(
    !address &&
    !coordOk(lat,lng)
  ){
    return null;
  }

  return {
    label:`Stop ${index + 1}`,
    address,
    lat,
    lng
  };
}

function routePathZonePoints(
  payload = {}
){

  const path =
    Array.isArray(payload?.routePath)
      ? payload.routePath
      : (
          Array.isArray(
            payload?.googleRoute?.routePath
          )
            ? payload.googleRoute.routePath
            : []
        );

  return path
    .map((point,index)=>{

      const lat =
        numberOrNull(
          point?.lat ??
          point?.latitude
        );

      const lng =
        numberOrNull(
          point?.lng ??
          point?.lon ??
          point?.longitude
        );

      if(!coordOk(lat,lng)){
        return null;
      }

      return {
        label:`Route Point ${index + 1}`,
        address:"",
        lat,
        lng,
        routePathPoint:true
      };
    })
    .filter(Boolean);
}


function routeZonePoints(
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

  const rawStops =
    Array.isArray(merged?.routeStops)
      ? merged.routeStops
      : (
          Array.isArray(merged?.stopsData)
            ? merged.stopsData
            : (
                Array.isArray(merged?.stops)
                  ? merged.stops
                  : []
              )
        );

  /*
    The COMPLETE route must stay inside the configured Service Zone:
    Pickup -> every Stop -> Dropoff.

    For Shared trips:
    every passenger Pickup and Dropoff is validated, and any group-level
    Stops are validated as well.
  */
  const stopPoints =
    rawStops
      .map(
        (stop,index)=>
          normalizeStopPoint(
            stop,
            index
          )
      )
      .filter(Boolean);

  if(
    shared &&
    passengers.length
  ){

    const points = [];

    passengers.forEach(
      (passenger,index)=>{

        const pickup = {
          label:`Passenger ${index + 1} Pickup`,
          address:clean(passenger?.pickup),
          lat:numberOrNull(passenger?.pickupLat),
          lng:numberOrNull(passenger?.pickupLng)
        };

        const dropoff = {
          label:`Passenger ${index + 1} Dropoff`,
          address:clean(passenger?.dropoff),
          lat:numberOrNull(passenger?.dropoffLat),
          lng:numberOrNull(passenger?.dropoffLng)
        };

        if(
          pickup.address ||
          coordOk(
            pickup.lat,
            pickup.lng
          )
        ){
          points.push(pickup);
        }

        if(
          dropoff.address ||
          coordOk(
            dropoff.lat,
            dropoff.lng
          )
        ){
          points.push(dropoff);
        }
      }
    );

    return [
      ...points,
      ...stopPoints
    ];
  }

  const pickup = {
    label:"Pickup",
    address:clean(merged?.pickup),
    lat:numberOrNull(merged?.pickupLat),
    lng:numberOrNull(merged?.pickupLng)
  };

  const dropoff = {
    label:"Dropoff",
    address:clean(merged?.dropoff),
    lat:numberOrNull(merged?.dropoffLat),
    lng:numberOrNull(merged?.dropoffLng)
  };

  const points = [];

  if(
    pickup.address ||
    coordOk(
      pickup.lat,
      pickup.lng
    )
  ){
    points.push(pickup);
  }

  points.push(
    ...stopPoints
  );

  if(
    dropoff.address ||
    coordOk(
      dropoff.lat,
      dropoff.lng
    )
  ){
    points.push(dropoff);
  }

  return points;
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

async function resolveZonePoint(point){

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

  const requiredPoints =
    routeZonePoints(
      merged,
      existingTrip
    );

  const routePathPoints =
    routePathZonePoints(
      merged
    );

  const points = [
    ...requiredPoints,
    ...routePathPoints
  ];

  if(!requiredPoints.length){

    return {
      allowed:true,
      skipped:true,
      reason:"ROUTE_POINTS_MISSING",
      zoneKey:key
    };
  }

  for(const point of points){

    const coords =
      await resolveZonePoint(point);

    if(
      !coordOk(
        coords?.lat,
        coords?.lng
      )
    ){

      return {
        allowed:false,
        statusCode:400,
        code:"SERVICE_ZONE_POINT_GEOCODE_FAILED",
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
          point?.routePathPoint === true
            ? `The trip route leaves the ${zoneLabel(key)}. Maximum service radius: ${Number(zone.radiusMiles)} miles.`
            : `${point.label} is outside the ${zoneLabel(key)}. Maximum service radius: ${Number(zone.radiusMiles)} miles.`
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
  routePathZonePoints,
  routeZonePoints,
  validateTripZone
};
