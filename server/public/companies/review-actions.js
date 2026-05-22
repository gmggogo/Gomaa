
/* =========================================
FILE: review-actions.js
FINAL COMPLETE
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
    await fetchTrips();

  render();

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
    getServiceByTrip(trip);

  const mins =
    minutesToTrip(trip);

  const warningMinutes =
    getWarningMinutes(service);

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

  await updateTrip(
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

  render();

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
    getSharedGroups().find(
      g =>
        Review.getSharedKey(g[0]) ===
        groupId
    );

  if(!group) return;

  const first =
    group[0];

  const service =
    getServiceByTrip(first);

  const mins =
    minutesToTrip(first);

  const warningMinutes =
    getWarningMinutes(service);

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

    await updateTrip(
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

  render();

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

  await deleteTrip(id);

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
    getSharedGroups().find(
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

    await deleteTrip(
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

  const service =
    getServiceByTrip(trip);

  const warningMinutes =
    getWarningMinutes(service);

  const dateInput =
    tr.querySelector(
      '[data-field="tripDate"]'
    );

  const timeInput =
    tr.querySelector(
      '[data-field="tripTime"]'
    );

  const editedDate =
    dateInput
    ? dateInput.value
    : trip.tripDate;

  const editedTime =
    timeInput
    ? timeInput.value
    : trip.tripTime;

  const editedTripDate =
    parseTripDateTime(
      editedDate,
      editedTime
    );

  let mins = null;

  if(editedTripDate){

    mins =
      (
        editedTripDate -
        getAZNow()
      ) / 60000;

  }

  if(
    mins !== null &&
    mins <= warningMinutes
  ){

    const ok = confirm(
`WARNING

This trip is within ${warningMinutes} minutes.

Cancellation fee may apply.

Save changes?`
    );

    if(!ok) return;

  }

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
        normalizeAZ(
          input.value
        );

      return;

    }

    if(
      field === "pickup" ||
      field === "dropoff"
    ){

      payload[field] =
        normalizeAZ(
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

  await updateTrip(
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
    getSharedGroups().find(
      g =>
        Review.getSharedKey(g[0]) ===
        groupId
    );

  if(!group) return;

  const first =
    group[0];

  const service =
    getServiceByTrip(first);

  const warningMinutes =
    getWarningMinutes(service);

  const passengers =
    getRealPassengersFromGroup(
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
          normalizeAZ(
            input.value
          );
      }

      if(key === "dropoff"){
        passengers[index].dropoff =
          normalizeAZ(
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

    await updateTrip(
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
    getServiceByTrip(trip);

  if(!service){

    alert(
      "Service not found"
    );

    return;

  }

  btn.disabled = true;

  btn.textContent =
    "Calculating...";

  const routePoints =
    buildIndividualRoutePoints(
      trip
    );

  const routeData =
    await calculateRouteMiles(
      routePoints
    );

  if(
    !routeData.miles ||
    routeData.miles <= 0
  ){

    throw new Error(
      "Invalid route"
    );

  }

  const price =
    calculateTripPrice(
      service,
      routeData.miles,
      trip.status,
      Array.isArray(trip.stops)
      ? trip.stops.length
      : 0
    );

  const snapshot =
    buildPricingSnapshot(
      service,
      routeData.miles,
      price
    );

  await updateTrip(
    id,
    {
      status:"Confirmed",

      priceAmount:
        Number(price),

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

      serviceName:
        service.name || "",

      serviceCode:
        service.code || "",

      serviceId:
        service._id || "",

      priceSnapshot:
        snapshot
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
    getSharedGroups().find(
      g =>
        Review.getSharedKey(g[0]) ===
        groupId
    );

  if(!group) return;

  const first =
    group[0];

  const service =
    getServiceByTrip(first);

  if(!service){

    alert(
      "Shared service missing"
    );

    return;

  }

  btn.disabled = true;

  btn.textContent =
    "Calculating...";

  const routePoints =
    buildSharedRoutePoints(
      group
    );

  const routeData =
    await calculateRouteMiles(
      routePoints
    );

  if(
    !routeData.miles ||
    routeData.miles <= 0
  ){

    throw new Error(
      "Invalid route"
    );

  }

  const sharedPrice =
    calculateSharedPrice(
      group,
      routeData.miles
    );

  const snapshot =
    buildPricingSnapshot(
      service,
      routeData.miles,
      sharedPrice.total
    );

  const payload = {

    status:"Confirmed",

    isShared:true,

    tripType:"SHARED",

    serviceName:
      service.name || "",

    serviceCode:
      service.code || "",

    serviceId:
      service._id || "",

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

    await updateTrip(
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
    getServiceByTrip(trip);

  const mins =
    minutesToTrip(trip);

  const warningMinutes =
    getWarningMinutes(service);

  const cancelFee =
    getCancelFee(service);

  let finalPrice = 0;

  if(
    mins !== null &&
    mins > 0 &&
    mins <= warningMinutes
  ){

    finalPrice =
      Number(cancelFee);

  }

  await updateTrip(
    id,
    {
      status:"Cancelled",

      priceAmount:
        Number(finalPrice),

      cancelFee:
        Number(finalPrice),

      cancelledAt:
        new Date()
        .toISOString()
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
    getSharedGroups().find(
      g =>
        Review.getSharedKey(g[0]) ===
        groupId
    );

  if(!group) return;

  const first =
    group[0];

  const service =
    getServiceByTrip(first);

  const mins =
    minutesToTrip(first);

  const warningMinutes =
    getWarningMinutes(service);

  const cancelFee =
    getCancelFee(service);

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

    await updateTrip(
      t._id,
      {
        status:"Cancelled",

        priceAmount:
          Number(finalPrice),

        cancelFee:
          Number(finalPrice),

        cancelledAt:
          new Date()
          .toISOString()
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