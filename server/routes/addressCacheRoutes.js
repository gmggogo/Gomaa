/* =====================================================
FILE: routes/addressCacheRoutes.js
GH Mobility / Sunbeam
FINAL COMPLETE SMART ADDRESS CACHE ROUTE

Endpoint after mounting in server.js:
POST /api/address-cache/resolve

Mount in server.js:
const addressCacheRoutes = require("./routes/addressCacheRoutes");
app.use("/api/address-cache", addressCacheRoutes);

What this file does:
1) Checks MongoDB address cache first.
2) If lat/lng exists in cache => returns CACHE, zero Google request.
3) If not cached => smart geocode attempts on server only.
4) Handles short / wrong-city addresses like:
   - "200 e knox rd"
   - "200 e knox rd chandler"
   - "1970 w ray rd"
5) Saves resolved address + lat/lng in cache.
6) Saves stripped alias so future short/wrong-city input returns from cache.

Required ENV:
GOOGLE_MAPS_API_KEY
or GOOGLE_API_KEY
or MAPS_API_KEY
or GOOGLE_KEY
===================================================== */

const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

/* =========================
   MODEL
========================= */

const AddressCacheSchema = new mongoose.Schema(
  {
    addressKey:{
      type:String,
      required:true,
      unique:true,
      index:true
    },

    originalAddress:{
      type:String,
      default:""
    },

    address:{
      type:String,
      default:""
    },

    fullAddress:{
      type:String,
      default:""
    },

    lat:{
      type:Number,
      default:null
    },

    lng:{
      type:Number,
      default:null
    },

    latitude:{
      type:Number,
      default:null
    },

    longitude:{
      type:Number,
      default:null
    },

    placeId:{
      type:String,
      default:""
    },

    city:{
      type:String,
      default:""
    },

    state:{
      type:String,
      default:""
    },

    zip:{
      type:String,
      default:""
    },

    company:{
      type:String,
      default:""
    },

    companyName:{
      type:String,
      default:""
    },

    facilityName:{
      type:String,
      default:""
    },

    companyId:{
      type:String,
      default:""
    },

    facilityId:{
      type:String,
      default:""
    },

    source:{
      type:String,
      default:""
    },

    geocodeSource:{
      type:String,
      default:""
    },

    geocodeQueryUsed:{
      type:String,
      default:""
    },

    googleStatus:{
      type:String,
      default:""
    },

    usageCount:{
      type:Number,
      default:0
    },

    lastUsedAt:{
      type:Date,
      default:null
    }
  },
  {
    timestamps:true
  }
);

const AddressCache =
  mongoose.models.AddressCache ||
  mongoose.model("AddressCache", AddressCacheSchema);

/* =========================
   BASIC HELPERS
========================= */

function normalizeText(value){
  return String(value ?? "").trim();
}

function normalizeAddressKey(address){
  return normalizeText(address)
    .toLowerCase()
    .replace(/[.,#]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function cleanNumberOrNull(value){

  if(value === "" || value === null || value === undefined){
    return null;
  }

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function hasValidLatLng(point){

  if(!point) return false;

  const lat =
    cleanNumberOrNull(
      point.lat ??
      point.latitude
    );

  const lng =
    cleanNumberOrNull(
      point.lng ??
      point.longitude
    );

  return (
    lat !== null &&
    lng !== null
  );
}

function getGoogleKey(){

  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.MAPS_API_KEY ||
    process.env.GOOGLE_KEY ||
    ""
  );
}

/* =========================
   GOOGLE PARSING
========================= */

function parseGoogleAddressComponents(components){

  function get(type, shortName = false){

    const item =
      (components || []).find(c =>
        Array.isArray(c.types) &&
        c.types.includes(type)
      );

    if(!item){
      return "";
    }

    return shortName
      ? item.short_name || item.long_name || ""
      : item.long_name || item.short_name || "";
  }

  return {
    streetNumber:
      get("street_number"),

    route:
      get("route"),

    city:
      get("locality") ||
      get("sublocality") ||
      get("administrative_area_level_2") ||
      "",

    state:
      get("administrative_area_level_1", true) ||
      "",

    zip:
      get("postal_code") ||
      ""
  };
}

function makeAddressPoint(raw, fallbackAddress, fallbackKey){

  const address =
    normalizeText(
      raw?.address ||
      raw?.fullAddress ||
      raw?.formattedAddress ||
      raw?.formatted_address ||
      fallbackAddress ||
      ""
    );

  const lat =
    cleanNumberOrNull(
      raw?.lat ??
      raw?.latitude
    );

  const lng =
    cleanNumberOrNull(
      raw?.lng ??
      raw?.longitude
    );

  return {
    address,

    fullAddress:
      normalizeText(raw?.fullAddress) ||
      address,

    addressKey:
      normalizeText(raw?.addressKey) ||
      fallbackKey ||
      normalizeAddressKey(address),

    lat,
    lng,

    latitude:
      lat,

    longitude:
      lng,

    placeId:
      normalizeText(
        raw?.placeId ||
        raw?.place_id ||
        ""
      ),

    city:
      normalizeText(raw?.city),

    state:
      normalizeText(raw?.state),

    zip:
      normalizeText(
        raw?.zip ||
        raw?.postalCode ||
        raw?.postal_code ||
        ""
      ),

    geocodeSource:
      normalizeText(raw?.geocodeSource),

    geocodeQueryUsed:
      normalizeText(raw?.geocodeQueryUsed),

    googleStatus:
      normalizeText(raw?.googleStatus)
  };
}

function responsePayload(source, point){

  return {
    success:true,
    source,
    addressPoint:point,

    /*
      Compatibility fields for current add-trip.js
      and any older frontend code.
    */

    address:point.address,
    fullAddress:point.fullAddress,
    addressKey:point.addressKey,

    lat:point.lat,
    lng:point.lng,
    latitude:point.latitude,
    longitude:point.longitude,

    placeId:point.placeId,
    city:point.city,
    state:point.state,
    zip:point.zip,

    geocodeSource:point.geocodeSource || "",
    geocodeQueryUsed:point.geocodeQueryUsed || ""
  };
}

/* =========================
   SMART ADDRESS TEXT CLEANUP
========================= */

function stripWrongMetroCity(address){

  return String(address || "")
    .replace(/\b(chandler|tempe|mesa|gilbert|phoenix|scottsdale|glendale|peoria|surprise|avondale|goodyear|queen creek|apache junction|tolleson|paradise valley|fountain hills|casa grande|maricopa)\b/ig, " ")
    .replace(/\baz\b/ig, " ")
    .replace(/\barizona\b/ig, " ")
    .replace(/\busa\b/ig, " ")
    .replace(/[,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueQueries(list){

  const seen =
    new Set();

  const out =
    [];

  for(const item of list){

    const clean =
      String(item || "")
        .replace(/\s+/g, " ")
        .replace(/\s+,/g, ",")
        .replace(/,\s+/g, ", ")
        .trim();

    const key =
      clean.toLowerCase();

    if(clean && !seen.has(key)){
      seen.add(key);
      out.push(clean);
    }
  }

  return out;
}

function buildGeocodeAttempts(address){

  const original =
    String(address || "").trim();

  const stripped =
    stripWrongMetroCity(original);

  /*
    Keep this list limited.
    It is not autocomplete. It only runs once on submit if cache misses.
  */

  return uniqueQueries([
    original,
    original + ", AZ, USA",
    original + ", Arizona, USA",
    original + ", Phoenix metro, AZ, USA",

    stripped,
    stripped + ", AZ, USA",
    stripped + ", Arizona, USA",
    stripped + ", Phoenix, AZ, USA",
    stripped + ", Tempe, AZ, USA",
    stripped + ", Chandler, AZ, USA",
    stripped + ", Mesa, AZ, USA",
    stripped + ", Gilbert, AZ, USA",
    stripped + ", Scottsdale, AZ, USA",
    stripped + ", Glendale, AZ, USA",
    stripped + ", Peoria, AZ, USA",
    stripped + ", Goodyear, AZ, USA"
  ]);
}

/* =========================
   GOOGLE GEOCODE
========================= */

async function geocodeOneQuery(query, googleKey){

  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(query) +
    "&components=" +
    encodeURIComponent("country:US|administrative_area:AZ") +
    "&region=us" +
    "&key=" +
    encodeURIComponent(googleKey);

  const response =
    await fetch(url);

  const data =
    await response.json();

  return {
    response,
    data
  };
}

function googleResultToPoint(result, originalAddress, addressKey, queryUsed){

  const location =
    result.geometry && result.geometry.location
      ? result.geometry.location
      : null;

  if(
    !location ||
    location.lat === undefined ||
    location.lng === undefined
  ){
    return null;
  }

  const parts =
    parseGoogleAddressComponents(
      result.address_components
    );

  return makeAddressPoint(
    {
      address:
        result.formatted_address || originalAddress,

      fullAddress:
        result.formatted_address || originalAddress,

      addressKey,

      lat:
        Number(location.lat),

      lng:
        Number(location.lng),

      placeId:
        result.place_id || "",

      city:
        parts.city,

      state:
        parts.state,

      zip:
        parts.zip,

      geocodeSource:
        "GOOGLE_GEOCODE",

      geocodeQueryUsed:
        queryUsed,

      googleStatus:
        "OK"
    },
    originalAddress,
    addressKey
  );
}

async function fetchGoogleGeocode(address){

  const googleKey =
    getGoogleKey();

  if(!googleKey){

    const err =
      new Error("Google Maps API key missing on server");

    err.statusCode = 500;

    throw err;
  }

  const addressKey =
    normalizeAddressKey(address);

  const attempts =
    buildGeocodeAttempts(address);

  let lastStatus = "";
  let lastErrorMessage = "";

  console.log("ADDRESS GEOCODE ATTEMPTS:", attempts);

  for(const query of attempts){

    const { response, data } =
      await geocodeOneQuery(
        query,
        googleKey
      );

    lastStatus =
      data.status || "";

    lastErrorMessage =
      data.error_message || "";

    if(
      response.ok &&
      data.status === "OK" &&
      Array.isArray(data.results) &&
      data.results.length
    ){

      for(const result of data.results){

        const point =
          googleResultToPoint(
            result,
            address,
            addressKey,
            query
          );

        if(point && hasValidLatLng(point)){

          console.log("GEOCODE SUCCESS:", {
            input:address,
            queryUsed:query,
            resolved:point.fullAddress,
            lat:point.lat,
            lng:point.lng
          });

          return point;
        }
      }
    }

    console.log("GEOCODE FAILED ATTEMPT:", {
      query,
      status:data.status,
      error:data.error_message || ""
    });
  }

  const err =
    new Error("Could not geocode address");

  err.statusCode =
    400;

  err.googleStatus =
    lastStatus;

  err.googleErrorMessage =
    lastErrorMessage;

  throw err;
}

/* =========================
   CACHE HELPERS
========================= */

async function findCachedPoint(addressKey, fallbackAddress){

  if(!addressKey){
    return null;
  }

  const cached =
    await AddressCache.findOne({
      addressKey
    });

  if(!cached || !hasValidLatLng(cached)){
    return null;
  }

  cached.usageCount =
    Number(cached.usageCount || 0) + 1;

  cached.lastUsedAt =
    new Date();

  await cached.save();

  return makeAddressPoint(
    cached,
    fallbackAddress,
    addressKey
  );
}

async function saveCachePoint({
  point,
  addressKey,
  originalAddress,
  company,
  companyName,
  facilityName,
  companyId,
  facilityId,
  source
}){

  if(!point || !hasValidLatLng(point)){
    return;
  }

  await AddressCache.findOneAndUpdate(
    {
      addressKey
    },
    {
      $set:{
        originalAddress,

        address:point.address,
        fullAddress:point.fullAddress,
        addressKey,

        lat:point.lat,
        lng:point.lng,
        latitude:point.latitude,
        longitude:point.longitude,

        placeId:point.placeId,

        city:point.city,
        state:point.state,
        zip:point.zip,

        company,
        companyName,
        facilityName,
        companyId,
        facilityId,

        source,
        geocodeSource:point.geocodeSource || "GOOGLE_GEOCODE",
        geocodeQueryUsed:point.geocodeQueryUsed || "",
        googleStatus:point.googleStatus || "OK",

        lastUsedAt:new Date()
      },
      $setOnInsert:{
        createdAt:new Date()
      },
      $inc:{
        usageCount:1
      }
    },
    {
      upsert:true,
      new:true
    }
  );
}

/* =========================
   ROUTE
========================= */

router.post("/resolve", async (req,res)=>{

  try{

    const address =
      normalizeText(
        req.body.address ||
        req.body.fullAddress ||
        req.body.formattedAddress ||
        ""
      );

    if(!address){
      return res.status(400).json({
        success:false,
        message:"Address is required"
      });
    }

    const addressKey =
      normalizeText(req.body.addressKey) ||
      normalizeAddressKey(address);

    const strippedKey =
      normalizeAddressKey(
        stripWrongMetroCity(address)
      );

    const company =
      normalizeText(
        req.body.company ||
        req.body.companyName ||
        req.body.facilityName ||
        ""
      );

    const companyName =
      normalizeText(
        req.body.companyName ||
        company
      );

    const facilityName =
      normalizeText(
        req.body.facilityName ||
        company
      );

    const companyId =
      normalizeText(
        req.body.companyId ||
        ""
      );

    const facilityId =
      normalizeText(
        req.body.facilityId ||
        req.body.companyId ||
        ""
      );

    const source =
      normalizeText(
        req.body.source ||
        "address-cache-resolve"
      );

    /* =========================
       1) CACHE BY EXACT KEY
    ========================= */

    let point =
      await findCachedPoint(
        addressKey,
        address
      );

    if(point){

      return res.json(
        responsePayload(
          "CACHE",
          point
        )
      );
    }

    /* =========================
       2) CACHE BY STRIPPED KEY
       Example:
       "200 e knox rd chandler"
       stripped key:
       "200 e knox rd"
    ========================= */

    if(strippedKey && strippedKey !== addressKey){

      point =
        await findCachedPoint(
          strippedKey,
          address
        );

      if(point){

        return res.json(
          responsePayload(
            "CACHE_STRIPPED_KEY",
            point
          )
        );
      }
    }

    /* =========================
       3) GOOGLE ONLY IF NOT CACHED
    ========================= */

    point =
      await fetchGoogleGeocode(address);

    point.addressKey =
      addressKey;

    /* =========================
       4) SAVE EXACT KEY
    ========================= */

    await saveCachePoint({
      point,
      addressKey,
      originalAddress:address,
      company,
      companyName,
      facilityName,
      companyId,
      facilityId,
      source
    });

    /* =========================
       5) SAVE STRIPPED ALIAS
       This makes future short/wrong-city input free.
    ========================= */

    if(strippedKey && strippedKey !== addressKey){

      await saveCachePoint({
        point:{
          ...point,
          addressKey:strippedKey
        },
        addressKey:strippedKey,
        originalAddress:address,
        company,
        companyName,
        facilityName,
        companyId,
        facilityId,
        source:"address-cache-alias"
      });
    }

    return res.json(
      responsePayload(
        "GOOGLE_GEOCODE",
        point
      )
    );

  }catch(err){

    console.error("ADDRESS CACHE RESOLVE ERROR:", err);

    return res.status(err.statusCode || 500).json({
      success:false,
      message:
        err.googleStatus
          ? `${err.message}: ${err.googleStatus}`
          : (err.message || "Address resolve server error"),
      googleStatus:err.googleStatus || "",
      googleErrorMessage:err.googleErrorMessage || ""
    });
  }
});

module.exports = router;