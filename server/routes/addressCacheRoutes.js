/* =====================================================
FILE: routes/addressCacheRoutes.js
GH Mobility / Sunbeam
Address Cache Resolve Route

Purpose:
- Company Add Trip calls this endpoint ONLY on Submit.
- No Google Suggestions / No Autocomplete requests from frontend.
- Server checks MongoDB Address Cache first.
- If address exists with lat/lng: returns from CACHE with ZERO Google request.
- If address is new: calls Google Geocode ONCE, saves lat/lng, then returns it.

Endpoint:
POST /api/address-cache/resolve
===================================================== */

const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

/* =========================
   ADDRESS CACHE MODEL
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
   HELPERS
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

function parseGoogleAddressComponents(components){

  function get(type, shortName = false){

    const c =
      (components || []).find(item =>
        Array.isArray(item.types) &&
        item.types.includes(type)
      );

    if(!c) return "";

    return shortName
      ? c.short_name || c.long_name || ""
      : c.long_name || c.short_name || "";
  }

  return {
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
      )
  };
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

async function fetchGoogleGeocode(address){

  const googleKey =
    getGoogleKey();

  if(!googleKey){
    const err =
      new Error("Google Maps API key missing on server");
    err.statusCode = 500;
    throw err;
  }

  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(address) +
    "&key=" +
    encodeURIComponent(googleKey);

  const response =
    await fetch(url);

  const data =
    await response.json();

  if(
    !response.ok ||
    data.status !== "OK" ||
    !Array.isArray(data.results) ||
    !data.results.length
  ){
    const err =
      new Error("Could not geocode address");

    err.statusCode = 400;
    err.googleStatus = data.status;
    err.googleErrorMessage = data.error_message || "";

    throw err;
  }

  const result =
    data.results[0];

  const location =
    result.geometry && result.geometry.location
      ? result.geometry.location
      : null;

  if(
    !location ||
    location.lat === undefined ||
    location.lng === undefined
  ){
    const err =
      new Error("Google returned address without lat/lng");
    err.statusCode = 400;
    throw err;
  }

  const parts =
    parseGoogleAddressComponents(
      result.address_components
    );

  return makeAddressPoint(
    {
      address:
        result.formatted_address || address,

      fullAddress:
        result.formatted_address || address,

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
        parts.zip
    },
    address,
    normalizeAddressKey(address)
  );
}

/* =========================
   ROUTES
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

    const company =
      normalizeText(
        req.body.company ||
        req.body.companyName ||
        req.body.facilityName ||
        ""
      );

    const companyName =
      normalizeText(req.body.companyName || company);

    const facilityName =
      normalizeText(req.body.facilityName || company);

    const companyId =
      normalizeText(req.body.companyId || "");

    const facilityId =
      normalizeText(
        req.body.facilityId ||
        req.body.companyId ||
        ""
      );

    const source =
      normalizeText(req.body.source || "address-cache-resolve");

    /* =========================
       1) CACHE FIRST
    ========================= */

    const cached =
      await AddressCache.findOne({
        addressKey
      });

    if(cached && hasValidLatLng(cached)){

      cached.usageCount =
        Number(cached.usageCount || 0) + 1;

      cached.lastUsedAt =
        new Date();

      await cached.save();

      const point =
        makeAddressPoint(
          cached,
          address,
          addressKey
        );

      return res.json({
        success:true,
        source:"CACHE",
        addressPoint:point,

        /*
          Compatibility fields for older frontend code.
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
        zip:point.zip
      });
    }

    /* =========================
       2) GOOGLE GEOCODE ONLY IF NEW
    ========================= */

    const point =
      await fetchGoogleGeocode(address);

    point.addressKey =
      addressKey;

    /* =========================
       3) SAVE CACHE
    ========================= */

    await AddressCache.findOneAndUpdate(
      {
        addressKey
      },
      {
        $set:{
          originalAddress:address,

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

          company,
          companyName,
          facilityName,
          companyId,
          facilityId,

          source,
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

    return res.json({
      success:true,
      source:"GOOGLE_GEOCODE",
      addressPoint:point,

      /*
        Compatibility fields for older frontend code.
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
      zip:point.zip
    });

  }catch(err){

    console.error("ADDRESS CACHE RESOLVE ERROR:", err);

    return res.status(err.statusCode || 500).json({
      success:false,
      message:err.message || "Address resolve server error",
      googleStatus:err.googleStatus || "",
      googleErrorMessage:err.googleErrorMessage || ""
    });
  }
});

module.exports = router;