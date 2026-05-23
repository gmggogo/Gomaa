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
  console.error(
    "ReviewApp missing"
  );
  return;
}

const container =
Review.container;

if(!container){
  console.error(
    "Container missing"
  );
  return;
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
    confirm(
      "Delete this trip?"
    );

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
    confirm(
      "Delete this shared trip?"
    );

  if(!ok) return;

  for(const t of group){

    await Review.deleteTrip(
      t._id
    );

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

    if(
      stopIndex !== undefined
    ){

      stops[
        Number(stopIndex)
      ] =
        Review.normalizeAZ(
          input.value
        );

      return;

    }

    if(
      field === "pickup" ||
      field === "dropoff"
    ){

      payload[field] =
        Review.normalizeAZ(
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
      field.startsWith(
        "passenger_"
      )
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
      }

      if(key === "phone"){
        passengers[index].phone =
          input.value;
      }

      if(key === "pickup"){
        passengers[index].pickup =
          Review.normalizeAZ(
            input.value
          );
      }

      if(key === "dropoff"){
        passengers[index].dropoff =
          Review.normalizeAZ(
            input.value
          );
      }

      return;

    }

    payload[field] =
      input.value;

  });

  payload.passengers =
    passengers;

  payload.status =
    "Scheduled";

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

  btn.textContent =
    "Calculating...";

  const routePoints =
    Review.buildIndividualRoutePoints(
      trip
    );

  const routeData =
    await Review.calculateRouteMiles(
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

  btn.textContent =
    "Calculating...";

  const routePoints =
    Review.buildSharedRoutePoints(
      group
    );

  const routeData =
    await Review.calculateRouteMiles(
      routePoints
    );

  const sharedPrice =
    Review.calculateSharedPrice(
      group,
      routeData.miles
    );

  const snapshot =
    Review.buildPricingSnapshot(
      service,
      routeData.miles,
      sharedPrice.total
    );

  const payload = {

    status:"Confirmed",

    isShared:true,

    tripType:"SHARED",

    serviceName:
      service?.name || "",

   serviceCode:
  service?.serviceKey ||
  service?.companySuffix ||
  "",

    serviceId:
      service?._id || "",

    priceAmount:
      sharedPrice.total,

    pricePerPassenger:
      sharedPrice.pricePerPassenger,

    sharedStopsCount:
      sharedPrice.stopsCount,

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

console.log(service);
console.log(cancelFee);

let finalPrice = 0;

if(
  Review.warningEnabled(service)
){

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

  if(
    mins !== null &&
    mins > 0 &&
    mins <= warningMinutes
  ){
    finalPrice =
      Number(cancelFee);
  }

  for(const t of group){

    await Review.updateTrip(
      t._id,
      {
        status:"Cancelled",
        priceAmount:Number(finalPrice),
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