/* =========================================
FILE: review-actions.js
FINAL CLEAN VERSION
- NO PRICING LOGIC
- GOOGLE ONLY FOR DISTANCE
- SERVER DOES ALL CALCULATIONS
========================================= */

window.addEventListener("DOMContentLoaded", () => {

const Review = window.ReviewApp;

if(!Review){
  console.error("ReviewApp missing");
  return;
}

const container = Review.container;

if(!container){
  console.error("Container missing");
  return;
}

/* =========================================
GOOGLE DISTANCE ENGINE ONLY
========================================= */

let fixedGooglePromise = null;

async function ensureGoogle(){
  if(window.google && google.maps) return;

  if(fixedGooglePromise) return fixedGooglePromise;

  fixedGooglePromise = new Promise((resolve,reject)=>{

    const script = document.createElement("script");

    script.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      (Review.googleKey || "");

    script.async = true;
    script.defer = true;

    script.onload = () => resolve();
    script.onerror = () => reject("Google failed");

    document.head.appendChild(script);
  });

  return fixedGooglePromise;
}

async function getDistance(origin,destination){

  await ensureGoogle();

  return new Promise((resolve)=>{

    const service = new google.maps.DirectionsService();

    service.route({
      origin,
      destination,
      travelMode: google.maps.TravelMode.DRIVING
    },(res,status)=>{

      if(status !== "OK"){
        return resolve({
          miles:0,
          meters:0,
          seconds:0
        });
      }

      let meters = 0;
      let seconds = 0;

      res.routes[0].legs.forEach(l=>{
        meters += l.distance?.value || 0;
        seconds += l.duration?.value || 0;
      });

      resolve({
        miles: meters * 0.000621371,
        meters,
        seconds
      });
    });

  });
}

/* =========================================
SHARED ROUTE BUILDER (ONLY ORDERING)
========================================= */

async function buildRoutePoints(group){

  const passengers = Review.getRealPassengersFromGroup(group);

  const active = passengers.filter(p=>
    p.pickup && p.dropoff &&
    !String(p.status||"").toLowerCase().includes("cancel")
  );

  if(!active.length) return [];

  const route = [];

  let current = active[0].pickup;

  route.push(current);

  const remaining = [...active];

  while(remaining.length){

    let bestIndex = 0;
    let bestDist = Infinity;

    for(let i=0;i<remaining.length;i++){

      const d = await getDistance(current, remaining[i].pickup);

      if(d.meters < bestDist){
        bestDist = d.meters;
        bestIndex = i;
      }
    }

    const selected = remaining.splice(bestIndex,1)[0];

    route.push(selected.pickup);
    route.push(selected.dropoff);

    current = selected.dropoff;
  }

  return route;
}

/* =========================================
RELOAD
========================================= */

async function reloadTrips(){
  Review.trips = await Review.fetchTrips();
  Review.render();
}

/* =========================================
CONFIRM INDIVIDUAL (SERVER ONLY)
========================================= */

async function handleConfirmTrip(btn){

  const id = btn.closest("tr").dataset.id;

  btn.disabled = true;
  btn.textContent = "Processing...";

  await fetch("/api/company/confirm-trip",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + Review.token
    },
    body:JSON.stringify({ id })
  });

  await reloadTrips();
}

/* =========================================
CONFIRM SHARED (SERVER + GOOGLE DISTANCE ONLY)
========================================= */

async function handleConfirmShared(btn){

  const groupId = btn.closest("tr").dataset.groupId;

  btn.disabled = true;
  btn.textContent = "Processing...";

  try{

    const group = Review.getSharedGroups().find(
      g => Review.getSharedKey(g[0]) === groupId
    );

    const routePoints = await buildRoutePoints(group);

    const first = group[0];

    const service = Review.getServiceByTrip(first);

    await fetch("/api/company/confirm-shared",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + Review.token
      },
      body:JSON.stringify({
        groupId,
        routePoints,
        serviceKey: service?.serviceKey
      })
    });

    await reloadTrips();

  }catch(err){
    console.error(err);
    alert("Error");
  }

  btn.disabled = false;
  btn.textContent = "Confirm";

}

/* =========================================
CANCEL INDIVIDUAL
========================================= */

async function handleCancelTrip(btn){

  const id = btn.closest("tr").dataset.id;

  await fetch("/api/company/cancel-trip",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + Review.token
    },
    body:JSON.stringify({ id })
  });

  await reloadTrips();
}

/* =========================================
CANCEL SHARED
========================================= */

async function handleCancelShared(btn){

  const groupId = btn.closest("tr").dataset.groupId;

  await fetch("/api/company/cancel-shared",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + Review.token
    },
    body:JSON.stringify({ groupId })
  });

  await reloadTrips();
}

/* =========================================
EVENTS
========================================= */

container.addEventListener("click", async (e)=>{

  const btn = e.target.closest("button");
  if(!btn) return;

  const action = btn.dataset.action;

  if(action === "confirm-trip") return handleConfirmTrip(btn);
  if(action === "confirm-shared") return handleConfirmShared(btn);
  if(action === "cancel-trip") return handleCancelTrip(btn);
  if(action === "cancel-shared") return handleCancelShared(btn);

});

});