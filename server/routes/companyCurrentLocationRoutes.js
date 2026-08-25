"use strict";

const express = require("express");
const https = require("https");

const router = express.Router();

const {
  verifyToken,
  requireRole
} = require("../middleware/authmiddleware");

/* =====================================================
   COMPANY CURRENT LOCATION
   GET /api/company-current-location/reverse?lat=...&lng=...

   - Company authenticated
   - Google key remains server-side
   - Exactly one Google reverse-geocode request when called
===================================================== */

router.use(
  verifyToken,
  requireRole("company")
);

function clean(v){
  return String(v ?? "").trim();
}

function n(v){
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function getGoogleMapsApiKey(){

  return clean(
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_KEY ||
    ""
  );
}

function httpsGetJson(url){

  return new Promise(
    (resolve,reject)=>{

      https
        .get(
          url,
          response=>{

            let body = "";

            response.on(
              "data",
              chunk=>{
                body += chunk;
              }
            );

            response.on(
              "end",
              ()=>{

                try{
                  resolve(
                    JSON.parse(body)
                  );
                }catch(err){
                  reject(err);
                }
              }
            );
          }
        )
        .on(
          "error",
          reject
        );
    }
  );
}

router.get(
  "/reverse",
  async (req,res)=>{

    try{

      const lat =
        n(req.query.lat);

      const lng =
        n(req.query.lng);

      if(
        lat === null ||
        lng === null ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ){
        return res.status(400).json({
          success:false,
          message:
            "Invalid location coordinates"
        });
      }

      const apiKey =
        getGoogleMapsApiKey();

      if(!apiKey){

        return res.status(500).json({
          success:false,
          message:
            "Google Maps API key is not configured"
        });
      }

      const url =
        "https://maps.googleapis.com/maps/api/geocode/json?latlng=" +
        encodeURIComponent(
          `${lat},${lng}`
        ) +
        "&key=" +
        encodeURIComponent(apiKey);

      const data =
        await httpsGetJson(url);

      if(
        data?.status !== "OK" ||
        !Array.isArray(data.results) ||
        !data.results.length
      ){

        console.log(
          "COMPANY CURRENT LOCATION REVERSE ERROR:",
          data?.status,
          data?.error_message || ""
        );

        return res.status(404).json({
          success:false,
          message:
            "Could not find the street address for Current Location"
        });
      }

      const result =
        data.results[0];

      const address =
        clean(
          result?.formatted_address
        );

      if(!address){

        return res.status(404).json({
          success:false,
          message:
            "Current Location address is unavailable"
        });
      }

      return res.json({
        success:true,
        address,
        formattedAddress:address,
        lat,
        lng,
        source:
          "google-server-reverse-geocode"
      });

    }catch(err){

      console.error(
        "COMPANY CURRENT LOCATION ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          "Could not resolve Current Location address"
      });
    }
  }
);

module.exports = router;