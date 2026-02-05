/* =========================
   DISPATCH STORAGE
========================= */

export function loadDispatchTrips(){
  try {
    return JSON.parse(localStorage.getItem("dispatchTrips")) || [];
  } catch {
    return [];
  }
}

export function saveDispatchTrips(list){
  localStorage.setItem("dispatchTrips", JSON.stringify(list));
}

/* =========================
   DRIVERS (FROM USERS)
========================= */
export function loadDrivers(){
  return (JSON.parse(localStorage.getItem("users")) || [])
    .filter(u => u.role === "driver" && u.active === true);
}