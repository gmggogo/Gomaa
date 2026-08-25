"use strict";

/* =========================================================
   FILE: server/routes/locationRoutes.js

   SHARED CURRENT LOCATION REVERSE GEOCODING
   Used by:
   - Companies Add Trip
   - Reservation
   - Get Quote

   Endpoint:
   GET /api/location/reverse?lat=...&lng=...&tenantSlug=...

   Rules:
   - Browser GPS itself costs zero Google requests.
   - Google reverse geocode runs ONLY when this endpoint is called.
   - Uses GOOGLE_SERVER_KEY (never browser GOOGLE_KEY).
   - Server cache prevents repeated Google calls for the same location.
   - Logged-in tenant users may authenticate with Bearer token.
   - Public Reservation / Get Quote must provide a valid active tenantSlug.
========================================================= */

const express = require("express");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");

const Tenant = require("../models/Tenant");

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/*
  15-minute server cache.
  Rounded coordinates group tiny GPS jitter so repeated taps from the
  same physical location reuse the same address instead of hitting Google.
*/
const CACHE_TTL_MS =
  15 * 60 * 1000;

const reverseCache =
  new Map();

function clean(value){
  return String(value ?? "").trim();
}

function cleanSlug(value){
  return clean(value)
    .toLowerCase();
}

function numberOrNull(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validCoords(lat,lng){
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function cacheKey(lat,lng){

  /*
    5 decimals is roughly meter-level precision.
    It absorbs harmless GPS jitter while still distinguishing locations.
  */
  return (
    Number(lat).toFixed(5) +
    "," +
    Number(lng).toFixed(5)
  );
}

function getCached(lat,lng){

  const key =
    cacheKey(lat,lng);

  const hit =
    reverseCache.get(key);

  if(!hit){
    return null;
  }

  if(
    Date.now() -
    Number(hit.savedAt || 0) >
    CACHE_TTL_MS
  ){
    reverseCache.delete(key);
    return null;
  }

  return hit;
}

function saveCached(lat,lng,address){

  const key =
    cacheKey(lat,lng);

  reverseCache.set(
    key,
    {
      address,
      lat:Number(lat),
      lng:Number(lng),
      savedAt:Date.now()
    }
  );

  /*
    Keep memory bounded even if the service receives many unique locations.
  */
  if(reverseCache.size > 2500){

    const now =
      Date.now();

    for(
      const [k,v]
      of reverseCache.entries()
    ){
      if(
        now -
        Number(v?.savedAt || 0) >
        CACHE_TTL_MS
      ){
        reverseCache.delete(k);
      }
    }

    while(reverseCache.size > 2000){

      const firstKey =
        reverseCache
          .keys()
          .next()
          .value;

      if(!firstKey){
        break;
      }

      reverseCache.delete(
        firstKey
      );
    }
  }
}

function readBearerToken(req){

  const authorization =
    clean(
      req.headers?.authorization
    );

  if(
    !authorization
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return authorization
    .slice(7)
    .trim();
}

function decodeTenantFromToken(req){

  const token =
    readBearerToken(req);

  if(!token){
    return null;
  }

  try{

    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    return {
      role:
        clean(decoded?.role),
      tenantId:
        clean(decoded?.tenantId),
      tenantSlug:
        cleanSlug(
          decoded?.tenantSlug ||
          ""
        )
    };

  }catch(_){

    return {
      invalid:true
    };
  }
}

async function resolveAllowedTenant(req){

  const auth =
    decodeTenantFromToken(req);

  if(auth?.invalid){

    const err =
      new Error(
        "Invalid Token"
      );

    err.statusCode = 401;

    throw err;
  }

  /*
    Logged-in tenant account:
    trust tenantId from signed JWT only.
  */
  if(
    auth?.tenantId &&
    auth.role !==
    "PLATFORM_ADMIN"
  ){

    const tenant =
      await Tenant
        .findOne({
          _id:auth.tenantId,
          enabled:true,
          subscriptionStatus:{
            $in:[
              "ACTIVE",
              "TRIAL"
            ]
          }
        })
        .select(
          "_id slug enabled subscriptionStatus"
        )
        .lean();

    if(!tenant){

      const err =
        new Error(
          "Organization unavailable"
        );

      err.statusCode = 403;

      throw err;
    }

    return tenant;
  }

  /*
    Public Reservation / Get Quote:
    require tenantSlug and resolve real tenant on server.
  */
  const tenantSlug =
    cleanSlug(
      req.query?.tenantSlug ||
      req.query?.tenant ||
      ""
    );

  if(
    !tenantSlug ||
    !/^[a-z0-9-]+$/.test(
      tenantSlug
    )
  ){

    const err =
      new Error(
        "Tenant Required"
      );

    err.statusCode = 400;

    throw err;
  }

  const tenant =
    await Tenant
      .findOne({
        slug:tenantSlug,
        enabled:true,
        subscriptionStatus:{
          $in:[
            "ACTIVE",
            "TRIAL"
          ]
        }
      })
      .select(
        "_id slug enabled subscriptionStatus"
      )
      .lean();

  if(!tenant){

    const err =
      new Error(
        "Organization unavailable"
      );

    err.statusCode = 404;

    throw err;
  }

  return tenant;
}

router.get(
  "/reverse",
  async (req,res)=>{

    try{

      /*
        Validate tenant first so this public-capable endpoint cannot become
        an unrestricted proxy for the server-side Google API key.
      */
      const tenant =
        await resolveAllowedTenant(
          req
        );

      const lat =
        numberOrNull(
          req.query?.lat
        );

      const lng =
        numberOrNull(
          req.query?.lng
        );

      if(
        lat === null ||
        lng === null ||
        !validCoords(lat,lng)
      ){

        return res.status(400).json({
          success:false,
          message:
            "Invalid location coordinates"
        });
      }

      /*
        CACHE HIT = ZERO Google requests.
      */
      const cached =
        getCached(
          lat,
          lng
        );

      if(cached){

        return res.json({
          success:true,
          address:
            cached.address,
          formattedAddress:
            cached.address,
          lat:
            cached.lat,
          lng:
            cached.lng,
          tenantSlug:
            cleanSlug(
              tenant?.slug
            ),
          source:
            "server-location-cache",
          googleRequestsUsed:0,
          cacheHit:true
        });
      }

      const googleServerKey =
        clean(
          process.env.GOOGLE_SERVER_KEY
        );

      if(!googleServerKey){

        return res.status(500).json({
          success:false,
          message:
            "GOOGLE_SERVER_KEY is not configured"
        });
      }

      const url =
        "https://maps.googleapis.com/maps/api/geocode/json" +
        "?latlng=" +
        encodeURIComponent(
          `${lat},${lng}`
        ) +
        "&key=" +
        encodeURIComponent(
          googleServerKey
        );

      const response =
        await fetch(url);

      const data =
        await response.json();

      if(
        data?.status !== "OK" ||
        !Array.isArray(
          data?.results
        ) ||
        !data.results.length
      ){

        console.log(
          "CURRENT LOCATION GOOGLE ERROR:",
          data?.status || "",
          data?.error_message || ""
        );

        return res.status(502).json({
          success:false,
          message:
            "Could not find the street address for Current Location"
        });
      }

      const address =
        clean(
          data.results[0]
            ?.formatted_address
        );

      if(!address){

        return res.status(404).json({
          success:false,
          message:
            "Current Location address is unavailable"
        });
      }

      saveCached(
        lat,
        lng,
        address
      );

      return res.json({
        success:true,
        address,
        formattedAddress:
          address,
        lat,
        lng,
        tenantSlug:
          cleanSlug(
            tenant?.slug
          ),
        source:
          "google-server-reverse-geocode",
        googleRequestsUsed:1,
        cacheHit:false
      });

    }catch(err){

      console.log(
        "CURRENT LOCATION REVERSE ERROR:",
        err?.message || err
      );

      return res
        .status(
          Number(
            err?.statusCode
          ) || 500
        )
        .json({
          success:false,
          message:
            err?.message ||
            "Could not resolve Current Location address"
        });
    }
  }
);

module.exports =
  router;