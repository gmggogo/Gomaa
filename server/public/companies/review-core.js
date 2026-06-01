/* =========================================
FILE: review-actions.js
SERVER ONLY PRICING VERSION (CLEAN)
========================================= */

window.addEventListener("DOMContentLoaded", async () => {

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
RELOAD
========================================= */

async function reloadTrips(){
  Review.trips = await Review.fetchTrips();
  Review.render();
}

/* =========================================
GET PRICE FROM SERVER (ONLY SOURCE OF TRUTH)
========================================= */

async function getServerPrice(payload){
  const res = await fetch("/api/services/calculate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + Review.token
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if(!data.success){
    throw new Error(data.message || "Pricing failed");
  }

  return data;
}

/* =========================================
CONFIRM TRIP (INDIVIDUAL)
========================================= */

async function handleConfirmTrip(btn){

  const tr = btn.closest("tr");
  const id = tr.dataset.id;

  const trip = Review.trips.find(t => t._id === id);
  if(!trip) return;

  const service = Review.getServiceByTrip(trip);

  btn.disabled = true;
  btn.textContent = "Calculating...";

  try{

    const routePoints = Review.buildIndividualRoutePoints(trip);

    const routeData = await Review.calculateRouteMiles(routePoints);

    const serverData = await getServerPrice({
      serviceKey: service?.serviceKey,
      miles: routeData.miles,
      stops: trip.stops?.length || 0,
      isCompany: true
    });

    await Review.updateTrip(id, {
      status: "Confirmed",
      priceAmount: serverData.total,
      miles: routeData.miles,
      distanceMeters: routeData.distanceMeters,
      durationSeconds: routeData.durationSeconds,
      estimatedMinutes: routeData.estimatedMinutes,
      googleRoute: routeData.googleRoute,
      routePoints
    });

    await reloadTrips();

  }catch(err){
    alert(err.message || "Server Error");
  }finally{
    btn.disabled = false;
    btn.textContent = "Confirm";
  }
}

/* =========================================
CONFIRM SHARED (SERVER ONLY PRICING)
========================================= */

async function handleConfirmShared(btn){

  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;

  const group = Review.getSharedGroups().find(
    g => Review.getSharedKey(g[0]) === groupId
  );

  if(!group) return;

  const first = group[0];
  const service = Review.getServiceByTrip(first);

  btn.disabled = true;
  btn.textContent = "Calculating...";

  try{

    const passengers = Review.getRealPassengersFromGroup(group);

    const activeCount = passengers.filter(p => {
      const s = String(p.status || "").toLowerCase();
      return !s.includes("no") && !s.includes("cancel");
    }).length;

    const routePoints = await Review.buildSharedRoutePoints(group);

    const routeData = await Review.calculateRouteMiles(routePoints);

    const serverData = await getServerPrice({
      serviceKey: service?.serviceKey,
      miles: routeData.miles,
      stops: Math.max(0, passengers.length - 1),
      passengerCount: activeCount,
      isCompany: true
    });

    const pricePerPassenger =
      activeCount > 0
        ? Number((serverData.total / activeCount).toFixed(2))
        : 0;

    const updatedPassengers = passengers.map(p => ({
      ...p,
      status: "Confirmed",
      priceAmount: pricePerPassenger,
      finalPrice: pricePerPassenger
    }));

    for(const t of group){

      await Review.updateTrip(t._id, {
        status: "Confirmed",
        isShared: true,
        passengers: updatedPassengers,
        priceAmount: serverData.total,
        pricePerPassenger,
        miles: routeData.miles,
        distanceMeters: routeData.distanceMeters,
        durationSeconds: routeData.durationSeconds,
        estimatedMinutes: routeData.estimatedMinutes,
        googleRoute: routeData.googleRoute,
        routePoints
      });

    }

    await reloadTrips();

  }catch(err){
    alert(err.message || "Server Error");
  }finally{
    btn.disabled = false;
    btn.textContent = "Confirm";
  }
}

/* =========================================
EDIT / DELETE / CANCEL (UNCHANGED LOGIC)
========================================= */

async function handleEditTrip(btn){ Review.handleEditTrip?.(btn); }
async function handleEditShared(btn){ Review.handleEditShared?.(btn); }
async function handleCancelEdit(){ await reloadTrips(); }
async function handleDeleteTrip(btn){ await Review.deleteTrip(btn.closest("tr").dataset.id); await reloadTrips(); }
async function handleDeleteShared(btn){ await Review.handleDeleteShared?.(btn); await reloadTrips(); }
async function handleSaveTrip(btn){ await Review.handleSaveTrip?.(btn); await reloadTrips(); }
async function handleSaveShared(btn){ await Review.handleSaveShared?.(btn); await reloadTrips(); }
async function handleCancelTrip(btn){ await Review.handleCancelTrip?.(btn); await reloadTrips(); }
async function handleCancelShared(btn){ await Review.handleCancelShared?.(btn); await reloadTrips(); }

/* =========================================
EVENTS
========================================= */

container.addEventListener("click", async (e) => {

  const btn = e.target.closest("button");
  if(!btn) return;

  try{

    const action = btn.dataset.action;

    switch(action){

      case "confirm-trip":
        await handleConfirmTrip(btn);
        break;

      case "confirm-shared":
        await handleConfirmShared(btn);
        break;

      case "edit-trip":
        await handleEditTrip(btn);
        break;

      case "edit-shared":
        await handleEditShared(btn);
        break;

      case "cancel-edit":
        await handleCancelEdit();
        break;

      case "delete-trip":
        await handleDeleteTrip(btn);
        break;

      case "delete-shared":
        await handleDeleteShared(btn);
        break;

      case "save-trip":
        await handleSaveTrip(btn);
        break;

      case "save-shared":
        await handleSaveShared(btn);
        break;

      case "cancel-trip":
        await handleCancelTrip(btn);
        break;

      case "cancel-shared":
        await handleCancelShared(btn);
        break;

    }

  }catch(err){
    console.error(err);
    alert(err.message || "Server Error");
    await reloadTrips();
  }

});

});