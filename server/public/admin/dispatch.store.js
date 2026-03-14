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

  const users = JSON.parse(localStorage.getItem("users")) || [];

  return users
    .filter(u => u.role === "driver" && u.active === true)
    .map(d => ({
      id: d.id,
      name: d.name,
      vehicleNumber: d.vehicleNumber || "-",
      address: d.address || ""
    }));
}