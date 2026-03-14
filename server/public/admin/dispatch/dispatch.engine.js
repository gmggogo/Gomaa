import { loadDispatchTrips, saveDispatchTrips, loadDrivers } from "./dispatch.store.js";

/* =========================
   SIMPLE DISTANCE
========================= */

function calcDistance(a,b){

  if(!a || !b) return 999;

  a = a.toLowerCase();
  b = b.toLowerCase();

  if(a === b) return 1;

  let score = 0;

  for(let i=0;i<Math.min(a.length,b.length);i++){
    if(a[i] === b[i]) score++;
  }

  return Math.abs(a.length-b.length) + (10-score);
}

/* =========================
   AUTO REDISTRIBUTION
========================= */

export function autoRedistribute(){

  const trips = loadDispatchTrips();
  const drivers = loadDrivers();

  if(!trips.length){
    alert("No trips in dispatch");
    return;
  }

  if(!drivers.length){
    alert("No active drivers");
    return;
  }

  /* sort trips by pickup time */

  trips.sort((a,b)=>{
    return (a.pickupTime || "").localeCompare(b.pickupTime || "");
  });

  const workload = {};

  drivers.forEach(d=>{
    workload[d.id] = 0;
  });

  trips.forEach(trip=>{

    let bestDriver = null;
    let bestScore = 9999;

    drivers.forEach(driver=>{

      const dist = calcDistance(driver.address, trip.pickup);

      const score = dist + workload[driver.id]*5;

      if(score < bestScore){
        bestScore = score;
        bestDriver = driver.id;
      }

    });

    if(bestDriver){

      trip.driverId = bestDriver;

      workload[bestDriver]++;

    }

  });

  saveDispatchTrips(trips);

  if(window.renderDispatch){
    window.renderDispatch();
  }

}