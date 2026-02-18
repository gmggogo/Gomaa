import { loadDispatchTrips, saveDispatchTrips } from "./dispatch-store.js";
import { renderDispatch } from "./dispatch-ui.js";

/* =========================
   ASSIGN DRIVER
========================= */
window.assignDriver = function(i, driverId){
  const trips = loadDispatchTrips();
  trips[i].driverId = driverId || null;
  saveDispatchTrips(trips);
};

/* =========================
   REMOVE FROM DISPATCH
========================= */
window.removeFromDispatch = function(i){
  let trips = loadDispatchTrips();

  // رجّع الرحلة في Trips
  const companyTrips = JSON.parse(localStorage.getItem("companyTrips")) || [];
  const idx = companyTrips.findIndex(
    x => x.tripNumber === trips[i].tripNumber
  );
  if(idx > -1){
    companyTrips[idx].inDispatch = false;
    localStorage.setItem("companyTrips", JSON.stringify(companyTrips));
  }

  trips.splice(i,1);
  saveDispatchTrips(trips);
  renderDispatch();
};

/* =========================
   SEND SELECTED
========================= */
window.sendSelected = function(){
  const checks = [...document.querySelectorAll(".row-check:checked")];
  if(!checks.length) return alert("No trips selected");

  const trips = loadDispatchTrips();

  checks.forEach(chk=>{
    const row = chk.closest("tr");
    const idx = [...document.querySelectorAll("#tbody tr")].indexOf(row);
    const t = trips[idx];

    if(!t.driverId){
      alert("Trip "+t.tripNumber+" has no driver");
      return;
    }

    const key = "driverTrips_" + t.driverId;
    const inbox = JSON.parse(localStorage.getItem(key)) || [];

    if(!inbox.find(x=>x.tripNumber===t.tripNumber)){
      inbox.push({ ...t, status:"Assigned" });
      localStorage.setItem(key, JSON.stringify(inbox));
    }
  });

  alert("Trips sent");
};