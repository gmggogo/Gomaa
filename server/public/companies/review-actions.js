/* =========================================
FILE: review-actions.js
FINAL COMPLETE FIXED VERSION
========================================= */

window.addEventListener(
"DOMContentLoaded",
() => {

const Review =
window.ReviewApp;

if(!Review){
  console.error("ReviewApp missing");
  return;
}

const container =
Review.container;

if(!container){
  console.error("Container missing");
  return;
}

/* =========================================
GOOGLE FIXED ROUTE ENGINE
========================================= */

let fixedGooglePromise = null;

function normalizeUniqueAddress(address){
  return Review.normalizeAddress(address);
}

function pushUnique(arr,value){
  const v = normalizeUniqueAddress(value);
  if(!v) return;

  const exists =
    arr.some(x =>
      String(x).toLowerCase() ===
      String(v).toLowerCase()
    );

  if(!exists){
    arr.push(v);
  }
}

async function ensureFixedGoogleLoaded(){

  if(
    window.google &&
    google.maps &&
    google.maps.DirectionsService
  ){
    return;
  }

  if(fixedGooglePromise){
    return fixedGooglePromise;
  }

  fixedGooglePromise =
    new Promise(async (resolve,reject)=>{

      try{

        const res =
          await fetch("/api/config");

        const data =
          await res.json();

        if(!data.googleKey){
          reject(
            new Error("Google key missing")
          );
          return;
        }

        const existing =
          document.querySelector(
            "script[data-google-maps='true']"
          );

        if(existing){

          if(
            window.google &&
            google.maps &&
            google.maps.DirectionsService
          ){
            resolve();
            return;
          }

          existing.addEventListener(
            "load",
            () => resolve()
          );

          existing.addEventListener(
            "error",
            () => reject(
              new Error("Google failed")
            )
          );

          return;
        }

        const script =
          document.createElement("script");

        script.src =
          `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;

        script.async = true;
        script.defer = true;

        script.setAttribute(
          "data-google-maps",
          "true"
        );

        script.onload =
          () => resolve();

        script.onerror =
          () => reject(
            new Error("Google failed")
          );

        document.head.appendChild(script);

      }catch(err){
        reject(err);
      }

    });

  return fixedGooglePromise;

}

async function getDrivingMetersBetween(origin,destination){

  await ensureFixedGoogleLoaded();

  return new Promise((resolve)=>{

    const service =
      new google.maps.DirectionsService();

    service.route(
      {
        origin,
        destination,
        travelMode:
          google.maps.TravelMode.DRIVING,
        unitSystem:
          google.maps.UnitSystem.IMPERIAL
      },
      function(response,status){

        if(
          status !== "OK" ||
          !response?.routes?.[0]
        ){
          resolve(Number.MAX_SAFE_INTEGER);
          return;
        }

        let meters = 0;

        response.routes[0].legs.forEach(leg=>{
          meters += leg.distance
            ? leg.distance.value
            : 0;
        });

        resolve(meters);

      }
    );

  });

}

async function orderPointsByNearestRoute(startPoint,points){

  const remaining = [...points];
  const ordered = [];
  let current = startPoint;

  while(remaining.length){

    let bestIndex = 0;
    let bestMeters = Number.MAX_SAFE_INTEGER;

    for(let i = 0; i < remaining.length; i++){

      const meters =
        await getDrivingMetersBetween(
          current,
          remaining[i]
        );

      if(meters < bestMeters){
        bestMeters = meters;
        bestIndex = i;
      }

    }

    const selected =
      remaining.splice(bestIndex,1)[0];

    ordered.push(selected);
    current = selected;

  }

  return ordered;

}

async function buildFixedSharedRoutePoints(group){

  const passengers =
    Review.getRealPassengersFromGroup(group);

  if(!passengers.length){
    return [];
  }

  const pickups = [];
  const dropoffs = [];

  passengers.forEach(p=>{
    if(p.pickup){
      pushUnique(pickups,p.pickup);
    }
  });

  passengers.forEach(p=>{
    if(p.dropoff){
      pushUnique(dropoffs,p.dropoff);
    }
  });

  if(pickups.length === 0){
    return dropoffs;
  }

  if(dropoffs.length === 0){
    return pickups;
  }

  /* =========================
     CASE 1:
     SAME PICKUP / MANY DROPS
  ========================= */

  if(
    pickups.length === 1 &&
    dropoffs.length > 1
  ){

    const orderedDropoffs =
      await orderPointsByNearestRoute(
        pickups[0],
        dropoffs
      );

    return [
      pickups[0],
      ...orderedDropoffs
    ];

  }

  /* =========================
     CASE 2:
     MANY PICKUPS / SAME DROP
  ========================= */

  if(
    pickups.length > 1 &&
    dropoffs.length === 1
  ){

    const orderedPickups =
      await orderPointsByNearestRoute(
        pickups[0],
        pickups.slice(1)
      );

    return [
      pickups[0],
      ...orderedPickups,
      dropoffs[0]
    ];

  }

  /* =========================
     CASE 3:
     MANY PICKUPS / MANY DROPS
  ========================= */

  const orderedPickups =
    await orderPointsByNearestRoute(
      pickups[0],
      pickups.slice(1)
    );

  const pickupRoute = [
    pickups[0],
    ...orderedPickups
  ];

  const lastPickup =
    pickupRoute[pickupRoute.length - 1];

  const orderedDropoffs =
    await orderPointsByNearestRoute(
      lastPickup,
      dropoffs
    );

  return [
    ...pickupRoute,
    ...orderedDropoffs
  ];

}
async function calculateFixedRouteMiles(points){

  await ensureFixedGoogleLoaded();

  const cleanPoints =
    Array.isArray(points)
      ? points
          .map(p => normalizeUniqueAddress(p))
          .filter(Boolean)
      : [];

  if(cleanPoints.length < 2){
    return {
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      googleRoute:{}
    };
  }

  const origin =
    cleanPoints[0];

  const destination =
    cleanPoints[
      cleanPoints.length - 1
    ];

  const middle =
    cleanPoints.slice(1,-1);

  const waypoints =
    middle.map(address=>({
      location:address,
      stopover:true
    }));

  return new Promise((resolve,reject)=>{

    const service =
      new google.maps.DirectionsService();

    service.route(
      {
        origin,
        destination,
        waypoints,

        // 🔥 مهم جدا
        // ممنوع جوجل يعيد ترتيب الشيرد
        optimizeWaypoints:false,

        travelMode:
          google.maps.TravelMode.DRIVING,

        drivingOptions:{
          departureTime:new Date()
        },

        unitSystem:
          google.maps.UnitSystem.IMPERIAL
      },
      function(response,status){

        if(
          status !== "OK" ||
          !response?.routes?.[0]
        ){
          reject(
            new Error(
              "Google route failed: " + status
            )
          );
          return;
        }

        const route =
          response.routes[0];

        let meters = 0;
        let seconds = 0;

        route.legs.forEach(leg=>{
          meters += leg.distance
            ? leg.distance.value
            : 0;

          seconds += leg.duration
            ? leg.duration.value
            : 0;
        });

        resolve({
          miles:
            Number(
              (meters * 0.000621371)
              .toFixed(2)
            ),

          distanceMeters:
            meters,

          durationSeconds:
            seconds,

          estimatedMinutes:
            Math.ceil(seconds / 60),

          googleRoute:{
            overviewPolyline:
              route.overview_polyline
                ? route.overview_polyline.points
                : "",

            summary:
              route.summary || "",

            waypointOrder:
              route.waypoint_order || [],

            legs:
              route.legs.map((leg,index)=>({
                legIndex:index,
                startAddress:
                  leg.start_address,
                endAddress:
                  leg.end_address,
                distanceText:
                  leg.distance
                    ? leg.distance.text
                    : "",
                distanceMeters:
                  leg.distance
                    ? leg.distance.value
                    : 0,
                durationText:
                  leg.duration
                    ? leg.duration.text
                    : "",
                durationSeconds:
                  leg.duration
                    ? leg.duration.value
                    : 0
              }))
          }
        });

      }
    );

  });

}

/* =========================================
RELOAD
========================================= */

async function reloadTrips(){

  Review.trips =
    await Review.fetchTrips();

  Review.render();

}

/* =========================================
EDIT TRIP
========================================= */

async function handleEditTrip(btn){

  const tr =
    btn.closest("tr");

  const id =
    tr.dataset.id;

  const trip =
    Review.trips.find(
      t => t._id === id
    );

  if(!trip) return;

  const service =
    Review.getServiceByTrip(trip);

  const mins =
    Review.minutesToTrip(trip);

  const warningMinutes =
    Review.getWarningMinutes(service);

  if(
    mins !== null &&
    mins <= warningMinutes &&
    mins > 0
  ){

    const ok = confirm(
`This trip is within ${warningMinutes} minutes.

Cancellation fee may apply.

Continue editing?`
    );

    if(!ok) return;

  }

  trip.__editing = true;
  trip.status = "Scheduled";
  trip.priceAmount = 0;
  trip.miles = 0;

  await Review.updateTrip(
    id,
    {
      status:"Scheduled",
      priceAmount:0,
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      googleRoute:null,
      routePoints:[],
      priceSnapshot:null
    }
  );

  Review.render();

}

/* =========================================
EDIT SHARED
========================================= */

async function handleEditShared(btn){

  const tr =
    btn.closest("tr");

  const groupId =
    tr.dataset.groupId;

  const group =
    Review.getSharedGroups().find(
      g =>
        Review.getSharedKey(g[0]) ===
        groupId
    );

  if(!group) return;

  const first =
    group[0];

  const service =
    Review.getServiceByTrip(first);
console.log("SERVICE =", service);

console.log(
  "SERVICE KEY =",
  service?.serviceKey,
  service?.title,
  service?.companySharedPrice,
  service?.companyBaseFare
);
  const mins =
    Review.minutesToTrip(first);

  const warningMinutes =
    Review.getWarningMinutes(service);

  if(
    mins !== null &&
    mins <= warningMinutes &&
    mins > 0
  ){

    const ok = confirm(
`This shared trip is within ${warningMinutes} minutes.

Cancellation fee may apply.

Continue editing?`
    );

    if(!ok) return;

  }

  group.forEach(t=>{
    t.__editing = true;
    t.status = "Scheduled";
    t.priceAmount = 0;
    t.pricePerPassenger = 0;
  });

  for(const t of group){

    await Review.updateTrip(
      t._id,
      {
        status:"Scheduled",
        priceAmount:0,
        pricePerPassenger:0,
        miles:0,
        distanceMeters:0,
        durationSeconds:0,
        estimatedMinutes:0,
        googleRoute:null,
        routePoints:[],
        optimizedRoute:null,
        priceSnapshot:null
      }
    );

  }

  Review.render();

}

/* =========================================
CANCEL EDIT
========================================= */

async function handleCancelEdit(){
  await reloadTrips();
}

/* =========================================
DELETE TRIP
========================================= */

async function handleDeleteTrip(btn){

  const tr =
    btn.closest("tr");

  const id =
    tr.dataset.id;

  if(!id) return;

  const ok =
    confirm("Delete this trip?");

  if(!ok) return;

  await Review.deleteTrip(id);

  await reloadTrips();

}

/* =========================================
DELETE SHARED
========================================= */

async function handleDeleteShared(btn){

  const tr =
    btn.closest("tr");

  const groupId =
    tr.dataset.groupId;

  const group =
    Review.getSharedGroups().find(
      g =>
        Review.getSharedKey(g[0]) ===
        groupId
    );

  if(!group) return;

  const ok =
    confirm("Delete this shared trip?");

  if(!ok) return;

  for(const t of group){
    await Review.deleteTrip(t._id);
  }

  await reloadTrips();

}

/* =========================================
SAVE TRIP
========================================= */

async function handleSaveTrip(btn){

  const tr =
    btn.closest("tr");

  const id =
    tr.dataset.id;

  const trip =
    Review.trips.find(
      t => t._id === id
    );

  if(!trip) return;

  const payload = {};

  const stops =
    Array.isArray(trip.stops)
      ? [...trip.stops]
      : [];

  tr.querySelectorAll(
    ".edit-input"
  ).forEach(input=>{

    const field =
      input.dataset.field;

    const stopIndex =
      input.dataset.stopIndex;

    if(stopIndex !== undefined){

      stops[
        Number(stopIndex)
      ] =
        Review.normalizeAddress(
          input.value
        );

      return;

    }

    if(
      field === "pickup" ||
      field === "dropoff"
    ){

      payload[field] =
        Review.normalizeAddress(
          input.value
        );

    }else{

      payload[field] =
        input.value;

    }

  });

  payload.stops = stops;
  payload.status = "Scheduled";
  payload.priceAmount = 0;
  payload.pricePerPassenger = 0;
  payload.miles = 0;
  payload.distanceMeters = 0;
  payload.durationSeconds = 0;
  payload.estimatedMinutes = 0;
  payload.googleRoute = null;
  payload.routePoints = [];
  payload.priceSnapshot = null;

  await Review.updateTrip(
    id,
    payload
  );

  await reloadTrips();

}

/* =========================================
SAVE SHARED
========================================= */

async function handleSaveShared(btn){

  const tr =
    btn.closest("tr");

  const groupId =
    tr.dataset.groupId;

  const group =
    Review.getSharedGroups().find(
      g =>
        Review.getSharedKey(g[0]) ===
        groupId
    );

  if(!group) return;

  const passengers =
    Review.getRealPassengersFromGroup(
      group
    ).map(p=>({...p}));

  const payload = {};

  tr.querySelectorAll(
    ".edit-input"
  ).forEach(input=>{

    const field =
      input.dataset.field;

    if(
      field &&
      field.startsWith("passenger_")
    ){

      const parts =
        field.split("_");

      const index =
        Number(parts[1]);

      const key =
        parts[2];

      if(!passengers[index]){
        return;
      }

      if(key === "name"){
        passengers[index].name =
          input.value;

        passengers[index].clientName =
          input.value;
      }

      if(key === "phone"){
        passengers[index].phone =
          input.value;

        passengers[index].clientPhone =
          input.value;
      }

      if(key === "pickup"){
        passengers[index].pickup =
          Review.normalizeAddress(
            input.value
          );
      }

      if(key === "dropoff"){
        passengers[index].dropoff =
          Review.normalizeAddress(
            input.value
          );
      }

      return;

    }

    payload[field] =
      input.value;

  });

  payload.passengers = passengers;
  payload.status = "Scheduled";
  payload.priceAmount = 0;
  payload.pricePerPassenger = 0;
  payload.miles = 0;
  payload.distanceMeters = 0;
  payload.durationSeconds = 0;
  payload.estimatedMinutes = 0;
  payload.googleRoute = null;
  payload.routePoints = [];
  payload.optimizedRoute = null;
  payload.priceSnapshot = null;

  for(const t of group){

    await Review.updateTrip(
      t._id,
      payload
    );

  }

  await reloadTrips();

}

/* =========================================
CONFIRM TRIP
========================================= */

async function handleConfirmTrip(btn){

  const tr =
    btn.closest("tr");

  const id =
    tr.dataset.id;

  const trip =
    Review.trips.find(
      t => t._id === id
    );

  if(!trip) return;

  const service =
    Review.getServiceByTrip(trip);

  btn.disabled = true;
  btn.textContent = "Calculating...";

  const routePoints =
    Review.buildIndividualRoutePoints(
      trip
    );

  const routeData =
    await calculateFixedRouteMiles(
      routePoints
    );

  const price =
    Review.calculateTripPrice(
      service,
      routeData.miles,
      trip.status,
      Array.isArray(trip.stops)
        ? trip.stops.length
        : 0
    );

  const snapshot =
    Review.buildPricingSnapshot(
      service,
      routeData.miles,
      price
    );

  await Review.updateTrip(
    id,
    {
      status:"Confirmed",
      priceAmount:Number(price),
      miles:routeData.miles,
      distanceMeters:routeData.distanceMeters,
      durationSeconds:routeData.durationSeconds,
      estimatedMinutes:routeData.estimatedMinutes,
      googleRoute:routeData.googleRoute,
      routePoints:routePoints,
      serviceName:service?.name || "",
      serviceCode:
        service?.serviceKey ||
        service?.companySuffix ||
        "",
      serviceId:service?._id || "",
      priceSnapshot:snapshot
    }
  );

  await reloadTrips();

}

/* =========================================
CONFIRM SHARED
========================================= */

async function handleConfirmShared(btn){

  const tr =
    btn.closest("tr");

  const groupId =
    tr.dataset.groupId;

  const group =
    Review.getSharedGroups().find(
      g =>
        Review.getSharedKey(g[0]) ===
        groupId
    );

  if(!group) return;

  const first =
    group[0];

  const service =
    Review.getServiceByTrip(first);

  btn.disabled = true;
  btn.textContent = "Calculating...";

  const passengers =
    Review.getRealPassengersFromGroup(
      group
    );

  const activePassengers =
    passengers.filter(p=>{

      const status =
        String(p.status || "")
          .toLowerCase();

      return (
        !status.includes("no") &&
        !status.includes("cancel")
      );

    });

  const count =
    activePassengers.length ||
    passengers.length ||
    1;

  const routePoints =
    await buildFixedSharedRoutePoints(
      group
    );

  const routeData =
    await calculateFixedRouteMiles(
      routePoints
    );

const sharedBase =
  Number(
    service?.companySharedPrice ||
    service?.sharedPrice ||
    service?.companyBaseFare ||
    service?.baseFare ||
    15
  );

  const includedMiles =
    Number(
      service?.companyIncludedMiles ??
      service?.includedMiles ??
      0
    );

  const perMile =
    Number(
      service?.companyPerMile ??
      service?.perMile ??
      0
    );

  const stopFee =
    Number(
      service?.companyStopFee ??
      service?.stopFee ??
      0
    );

  const totalMiles =
    Number(routeData.miles || 0);

  const freeMiles =
    count * includedMiles;

  const extraMiles =
    Math.max(
      0,
      totalMiles - freeMiles
    );

const stopsCount =
  Math.max(
    0,
    count - 1
  );

  const total =
    Number(
      (
        (count * sharedBase) +
        (extraMiles * perMile) +
        (stopsCount * stopFee)
      ).toFixed(2)
    );

  const pricePerPassenger =
    Number(
      (total / count).toFixed(2)
    );

  const snapshot =
    Review.buildPricingSnapshot(
      service,
      routeData.miles,
      total
    );

  const updatedPassengers =
    passengers.map(p=>{

      const s =
        String(p.status || "")
          .toLowerCase()
          .trim();

      if(
        s.includes("no") ||
        s.includes("cancel")
      ){
        return p;
      }

      return {
        ...p,
        status:"Confirmed",
        priceAmount:
          Number(pricePerPassenger || 0),
        finalPrice:
          Number(pricePerPassenger || 0)
      };

    });

  const payload = {

    status:"Confirmed",

    isShared:true,

    tripType:"SHARED",

    serviceName:
      service?.name ||
      service?.title ||
      "Shared",

    serviceCode:
      service?.serviceKey ||
      service?.companySuffix ||
      service?.code ||
      service?.serviceCode ||
      "SH",

    serviceId:
      service?._id || "",

    passengers:
      updatedPassengers,

    totalPassengers:
      passengers.length,

    priceAmount:
      total,

    finalPrice:
      total,

    pricePerPassenger:
      pricePerPassenger,

    sharedStopsCount:
      stopsCount,

    miles:
      routeData.miles,

    distanceMeters:
      routeData.distanceMeters,

    durationSeconds:
      routeData.durationSeconds,

    estimatedMinutes:
      routeData.estimatedMinutes,

    googleRoute:
      routeData.googleRoute,

    routePoints:
      routePoints,

    optimizedRoute:
      routeData.googleRoute,

    priceSnapshot:
      snapshot

  };

  for(const t of group){

    await Review.updateTrip(
      t._id,
      payload
    );

  }

  await reloadTrips();

}

/* =========================================
CANCEL TRIP
========================================= */

async function handleCancelTrip(btn){

  const tr =
    btn.closest("tr");

  const id =
    tr.dataset.id;

  const trip =
    Review.trips.find(
      t => t._id === id
    );

  if(!trip) return;

  const service =
    Review.getServiceByTrip(trip);

  const mins =
    Review.minutesToTrip(trip);

  const warningMinutes =
    Review.getWarningMinutes(service);

  const cancelFee =
    Review.getCancelFee(service);

  let finalPrice = 0;

  if(Review.warningEnabled(service)){

    if(
      mins !== null &&
      mins > 0 &&
      mins <= warningMinutes
    ){
      finalPrice =
        Number(cancelFee);
    }

  }

  await Review.updateTrip(
    id,
    {
      status:"Cancelled",
      priceAmount:Number(finalPrice),
      finalPrice:Number(finalPrice),
      cancelFee:Number(finalPrice),
      cancelledAt:new Date().toISOString()
    }
  );

  await reloadTrips();

}

/* =========================================
CANCEL SHARED
========================================= */

async function handleCancelShared(btn){

  const tr =
    btn.closest("tr");

  const groupId =
    tr.dataset.groupId;

  const group =
    Review.getSharedGroups().find(
      g =>
        Review.getSharedKey(g[0]) ===
        groupId
    );

  if(!group) return;

  const first =
    group[0];

  const service =
    Review.getServiceByTrip(first);

  const mins =
    Review.minutesToTrip(first);

  const warningMinutes =
    Review.getWarningMinutes(service);

  const cancelFee =
    Review.getCancelFee(service);

  let finalPrice = 0;

  if(Review.warningEnabled(service)){

    if(
      mins !== null &&
      mins > 0 &&
      mins <= warningMinutes
    ){
      finalPrice =
        Number(cancelFee);
    }

  }

  const passengers =
    Review.getRealPassengersFromGroup(
      group
    ).map(p=>({
      ...p,
      status:"Cancelled",
      cancelFee:Number(finalPrice),
      finalPrice:Number(finalPrice),
      priceAmount:Number(finalPrice)
    }));

  for(const t of group){

    await Review.updateTrip(
      t._id,
      {
        status:"Cancelled",
        passengers,
        priceAmount:Number(finalPrice),
        finalPrice:Number(finalPrice),
        cancelFee:Number(finalPrice),
        cancelledAt:new Date().toISOString()
      }
    );

  }

  await reloadTrips();

}

/* =========================================
CLICK EVENTS
========================================= */

container.addEventListener(
  "click",
  async e=>{

  const btn =
    e.target.closest("button");

  if(!btn) return;

  const action =
    btn.dataset.action;

  try{

    if(action === "edit-trip"){
      await handleEditTrip(btn);
    }

    if(action === "edit-shared"){
      await handleEditShared(btn);
    }

    if(action === "cancel-edit"){
      await handleCancelEdit();
    }

    if(action === "delete-trip"){
      await handleDeleteTrip(btn);
    }

    if(action === "delete-shared"){
      await handleDeleteShared(btn);
    }

    if(action === "save-trip"){
      await handleSaveTrip(btn);
    }

    if(action === "save-shared"){
      await handleSaveShared(btn);
    }

    if(action === "confirm-trip"){
      await handleConfirmTrip(btn);
    }

    if(action === "confirm-shared"){
      await handleConfirmShared(btn);
    }

    if(action === "cancel-trip"){
      await handleCancelTrip(btn);
    }

    if(action === "cancel-shared"){
      await handleCancelShared(btn);
    }

  }catch(err){

    console.error(err);

    alert(
      err.message ||
      "Server Error"
    );

    await reloadTrips();

  }

});

});