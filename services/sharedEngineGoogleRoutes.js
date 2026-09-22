"use strict";

/*
DESTINATION PATH:
server/services/sharedEngineGoogleRoutes.js

PURPOSE:
Google road route adapter for Shared Engine.

IMPORTANT:
The project already has server/utils/routeMapEngine.js.
This file reuses it so COMPANY, RESERVED, and BROKER all use
the same Google route source and do not create a second routing system.
*/

const routeMapEngine =
  require("../utils/routeMapEngine");

const routeCache =
  new Map();

function clean(value){
  return String(value ?? "").trim();
}

function normalizeAddress(value){
  return clean(value)
    .replace(/\s+/g," ")
    .trim();
}

function routeKey(points){
  return points
    .map(point=>
      normalizeAddress(point)
        .toLowerCase()
    )
    .join("||");
}

function n(value,fallback = 0){
  const num = Number(value);
  return Number.isFinite(num)
    ? num
    : fallback;
}

function parseDurationSeconds(value){
  if(
    Number.isFinite(
      Number(value)
    )
  ){
    return Number(value);
  }

  const text =
    clean(value)
      .toLowerCase();

  if(!text){
    return 0;
  }

  if(/^\d+(?:\.\d+)?s$/.test(text)){
    return Number(
      text.slice(0,-1)
    );
  }

  return 0;
}

function getLegs(raw){
  if(
    Array.isArray(raw?.legs)
  ){
    return raw.legs;
  }

  if(
    Array.isArray(
      raw?.googleRoute?.legs
    )
  ){
    return raw.googleRoute.legs;
  }

  if(
    Array.isArray(
      raw?.route?.legs
    )
  ){
    return raw.route.legs;
  }

  if(
    Array.isArray(
      raw?.routes?.[0]?.legs
    )
  ){
    return raw.routes[0].legs;
  }

  return [];
}

function normalizeRouteResult(
  raw,
  points
){
  const legs =
    getLegs(raw)
      .map((leg,index)=>{
        const distanceMeters =
          n(
            leg?.distanceMeters ??
            leg?.distance?.value ??
            leg?.distance_meters ??
            0
          );

        const durationSeconds =
          n(
            leg?.durationSeconds ??
            leg?.duration?.value ??
            leg?.duration_seconds ??
            parseDurationSeconds(
              leg?.duration
            )
          );

        return {
          index,
          startAddress:
            normalizeAddress(
              leg?.startAddress ||
              leg?.start_address ||
              points[index] ||
              ""
            ),
          endAddress:
            normalizeAddress(
              leg?.endAddress ||
              leg?.end_address ||
              points[index + 1] ||
              ""
            ),
          distanceMeters,
          durationSeconds,
          miles:
            Number(
              (
                distanceMeters *
                0.000621371
              ).toFixed(3)
            ),
          minutes:
            Number(
              (
                durationSeconds /
                60
              ).toFixed(2)
            ),
          raw:leg
        };
      });

  let distanceMeters =
    n(
      raw?.distanceMeters ??
      raw?.totalDistanceMeters ??
      raw?.distance?.value ??
      raw?.googleRoute?.distanceMeters ??
      0
    );

  let durationSeconds =
    n(
      raw?.durationSeconds ??
      raw?.totalDurationSeconds ??
      raw?.duration?.value ??
      raw?.googleRoute?.durationSeconds ??
      0
    );

  if(
    distanceMeters <= 0 &&
    legs.length
  ){
    distanceMeters =
      legs.reduce(
        (sum,leg)=>
          sum +
          n(leg.distanceMeters),
        0
      );
  }

  if(
    durationSeconds <= 0 &&
    legs.length
  ){
    durationSeconds =
      legs.reduce(
        (sum,leg)=>
          sum +
          n(leg.durationSeconds),
        0
      );
  }

  let miles =
    n(
      raw?.miles ??
      raw?.totalMiles ??
      raw?.distanceMiles ??
      raw?.routeMiles ??
      raw?.googleRoute?.miles ??
      0
    );

  if(
    miles <= 0 &&
    distanceMeters > 0
  ){
    miles =
      distanceMeters *
      0.000621371;
  }

  let minutes =
    n(
      raw?.estimatedMinutes ??
      raw?.minutes ??
      raw?.totalMinutes ??
      raw?.durationMinutes ??
      raw?.googleRoute?.estimatedMinutes ??
      0
    );

  if(
    minutes <= 0 &&
    durationSeconds > 0
  ){
    minutes =
      durationSeconds / 60;
  }

  return {
    points:[...points],
    miles:Number(
      Number(miles).toFixed(2)
    ),
    minutes:Number(
      Number(minutes).toFixed(2)
    ),
    distanceMeters:
      Number(distanceMeters || 0),
    durationSeconds:
      Number(durationSeconds || 0),
    legs,
    polyline:
      raw?.polyline ||
      raw?.routePolyline ||
      raw?.overviewPolyline ||
      raw?.googleRoute?.overview_polyline?.points ||
      raw?.routes?.[0]?.overview_polyline?.points ||
      "",
    raw
  };
}

async function calculateRoute(
  routePoints,
  {
    useCache = true
  } = {}
){
  const points =
    (Array.isArray(routePoints)
      ? routePoints
      : []
    )
      .map(normalizeAddress)
      .filter(Boolean);

  if(points.length < 2){
    throw new Error(
      "At least two route points are required"
    );
  }

  const key =
    routeKey(points);

  if(
    useCache &&
    routeCache.has(key)
  ){
    return {
      ...routeCache.get(key),
      cacheHit:true
    };
  }

  let raw;

  if(
    routeMapEngine &&
    typeof routeMapEngine
      .calculateRouteMiles ===
      "function"
  ){
    raw =
      await routeMapEngine
        .calculateRouteMiles(
          points
        );
  }else if(
    routeMapEngine &&
    typeof routeMapEngine
      .calculateRoute ===
      "function"
  ){
    raw =
      await routeMapEngine
        .calculateRoute(
          points
        );
  }else{
    throw new Error(
      "routeMapEngine calculate function not found"
    );
  }

  const result =
    normalizeRouteResult(
      raw,
      points
    );

  routeCache.set(
    key,
    result
  );

  return {
    ...result,
    cacheHit:false
  };
}

async function calculateDirect(
  origin,
  destination,
  options
){
  return calculateRoute(
    [
      origin,
      destination
    ],
    options
  );
}

function clearCache(){
  routeCache.clear();
}

module.exports = {
  calculateRoute,
  calculateDirect,
  normalizeRouteResult,
  clearCache
};
