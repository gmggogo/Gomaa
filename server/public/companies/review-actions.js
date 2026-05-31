/* =========================================
FILE: review-actions.js
FINAL COMPLETE FIXED VERSION (PATCHED)
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

const CompanyPricing =
window.CompanyPricing;

if(!CompanyPricing){
  console.error("CompanyPricing missing");
  return;
}

const container =
Review.container;

if(!container){
  console.error("Container missing");
  return;
}

/* =========================================
GLOBAL POLICY ENGINE (NEW FIX)
========================================= */

function getTripPolicy(mins, warningMinutes){

  if(mins === null || mins === undefined){
    return {
      allowEdit:true,
      allowCancel:true,
      warning:false
    };
  }

  if(mins <= warningMinutes && mins > 0){
    return {
      allowEdit:true,
      allowCancel:true,
      warning:true
    };
  }

  return {
    allowEdit:true,
    allowCancel:false,
    warning:false
  };
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
          reject(new Error("Google key missing"));
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

          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () => reject(new Error("Google failed")));
          return;
        }

        const script =
          document.createElement("script");

        script.src =
          `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;

        script.async = true;
        script.defer = true;

        script.setAttribute("data-google-maps","true");

        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Google failed"));

        document.head.appendChild(script);

      }catch(err){
        reject(err);
      }

    });

  return fixedGooglePromise;
}

/* =========================================
ROUTE FUNCTIONS (UNCHANGED)
========================================= */

async function getDrivingMetersBetween(origin,destination){

  await ensureFixedGoogleLoaded();

  return new Promise((resolve)=>{

    const service =
      new google.maps.DirectionsService();

    service.route(
      {
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.IMPERIAL
      },
      function(response,status){

        if(status !== "OK" || !response?.routes?.[0]){
          resolve(Number.MAX_SAFE_INTEGER);
          return;
        }

        let meters = 0;

        response.routes[0].legs.forEach(leg=>{
          meters += leg.distance ? leg.distance.value : 0;
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

    for(let i=0;i<remaining.length;i++){

      const meters =
        await getDrivingMetersBetween(current,remaining[i]);

      if(meters < bestMeters){
        bestMeters = meters;
        bestIndex = i;
      }

    }

    const selected = remaining.splice(bestIndex,1)[0];

    ordered.push(selected);
    current = selected;

  }

  return ordered;
}

/* =========================================
SHARED ROUTE FIX (SAFE GUARD ADDED)
========================================= */

async function buildFixedSharedRoutePoints(group){

  const passengers =
    Review.getRealPassengersFromGroup(group);

  if(!passengers || !passengers.length){
    return [];
  }

  const activePassengers =
    passengers.filter(p=>{
      const s = String(p.status || "").toLowerCase();
      return (
        !s.includes("no") &&
        !s.includes("cancel") &&
        p.pickup &&
        p.dropoff
      );
    });

  if(!activePassengers.length){
    return [];
  }

  const waiting =
    activePassengers.map((p,index)=>({
      id:index,
      pickup: normalizeUniqueAddress(p.pickup),
      dropoff: normalizeUniqueAddress(p.dropoff)
    }));

  if(!waiting.length){
    return [];
  }

  const route = [];
  const onboard = [];

  let current =
    waiting[0]?.pickup || "";

  if(!current){
    return [];
  }

  pushUnique(route,current);

  for(let i=waiting.length-1;i>=0;i--){
    if(waiting[i].pickup.toLowerCase() === current.toLowerCase()){
      onboard.push(waiting[i]);
      waiting.splice(i,1);
    }
  }

  while(waiting.length || onboard.length){

    let best = null;
    let bestMeters = Number.MAX_SAFE_INTEGER;

    for(const p of waiting){

      const meters =
        await getDrivingMetersBetween(current,p.pickup);

      if(meters < bestMeters){
        bestMeters = meters;
        best = { type:"pickup", passenger:p, address:p.pickup };
      }
    }

    for(const p of onboard){

      const meters =
        await getDrivingMetersBetween(current,p.dropoff);

      if(meters < bestMeters){
        bestMeters = meters;
        best = { type:"dropoff", passenger:p, address:p.dropoff };
      }
    }

    if(!best) break;

    current = best.address;
    pushUnique(route,current);

    if(best.type === "pickup"){
      for(let i=waiting.length-1;i>=0;i--){
        if(waiting[i].pickup.toLowerCase() === current.toLowerCase()){
          onboard.push(waiting[i]);
          waiting.splice(i,1);
        }
      }
    } else {
      const idx =
        onboard.findIndex(x => x.id === best.passenger.id);
      if(idx > -1) onboard.splice(idx,1);
    }
  }

  return route;
}

/* =========================================
REMAINING FUNCTIONS (UNCHANGED CORE LOGIC)
========================================= */

async function calculateFixedRouteMiles(points){

  await ensureFixedGoogleLoaded();

  const cleanPoints =
    Array.isArray(points)
      ? points.map(p => normalizeUniqueAddress(p)).filter(Boolean)
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

  const origin = cleanPoints[0];
  const destination = cleanPoints[cleanPoints.length - 1];
  const middle = cleanPoints.slice(1,-1);

  const waypoints =
    middle.map(address=>({ location:address, stopover:true }));

  return new Promise((resolve,reject)=>{

    const service =
      new google.maps.DirectionsService();

    service.route(
      {
        origin,
        destination,
        waypoints,
        optimizeWaypoints:false,
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.IMPERIAL
      },
      function(response,status){

        if(status !== "OK" || !response?.routes?.[0]){
          reject(new Error("Google route failed: " + status));
          return;
        }

        const route = response.routes[0];

        let meters=0;
        let seconds=0;

        route.legs.forEach(leg=>{
          meters += leg.distance?.value || 0;
          seconds += leg.duration?.value || 0;
        });

        resolve({
          miles:Number((meters*0.000621371).toFixed(2)),
          distanceMeters:meters,
          durationSeconds:seconds,
          estimatedMinutes:Math.ceil(seconds/60),
          googleRoute:route
        });

      }
    );

  });

}

/* =========================================
TRIP FUNCTIONS (UNCHANGED)
========================================= */

async function reloadTrips(){
  Review.trips = await Review.fetchTrips();
  Review.render();
}

/* =========================
EDIT / CANCEL FIXED POLICY USAGE
========================= */

async function handleEditTrip(btn){

  const tr = btn.closest("tr");
  const id = tr.dataset.id;

  const trip =
    Review.trips.find(t=>t._id===id);

  if(!trip) return;

  const service = Review.getServiceByTrip(trip);
  const mins = Review.minutesToTrip(trip);
  const warningMinutes = Review.getWarningMinutes(service);

  const policy = getTripPolicy(mins, warningMinutes);

  if(policy.warning){
    const ok = confirm("Warning: near pickup time. Continue?");
    if(!ok) return;
  }

  await Review.updateTrip(id,{
    status:"Scheduled",
    priceAmount:0,
    miles:0,
    distanceMeters:0,
    durationSeconds:0,
    estimatedMinutes:0,
    googleRoute:null,
    routePoints:[],
    priceSnapshot:null
  });

  Review.render();
}

/* CANCEL FIX */
async function handleCancelTrip(btn){

  const tr = btn.closest("tr");
  const id = tr.dataset.id;

  const trip =
    Review.trips.find(t=>t._id===id);

  if(!trip) return;

  const service = Review.getServiceByTrip(trip);
  const mins = Review.minutesToTrip(trip);

  const policy = getTripPolicy(mins, Review.getWarningMinutes(service));

  const finalPrice =
    policy.allowCancel
      ? CompanyPricing.calculateCancelFee(service, mins)
      : 0;

  await Review.updateTrip(id,{
    status:"Cancelled",
    finalPrice:Number(finalPrice),
    priceAmount:Number(finalPrice),
    cancelFee:Number(finalPrice),
    cancelledAt:new Date().toISOString()
  });

  await reloadTrips();
}

/* =========================================
CLICK HANDLER (UNCHANGED)
========================================= */

container.addEventListener("click", async e=>{

  const btn = e.target.closest("button");
  if(!btn) return;

  const action = btn.dataset.action;

  try{

    if(action==="edit-trip") await handleEditTrip(btn);
    if(action==="cancel-trip") await handleCancelTrip(btn);

  }catch(err){
    console.error(err);
    alert(err.message || "Server Error");
    await reloadTrips();
  }

});

});