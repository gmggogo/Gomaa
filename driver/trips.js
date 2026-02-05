console.log("driver/trips.js loaded");

/*
  الصفحة دي:
  - لو السواق عنده رحلة مبعوتة → تظهر
  - لو مفيش → رسالة
*/

// ===============================
// DRIVER AUTH
// ===============================
const loggedDriver = JSON.parse(localStorage.getItem("loggedDriver"));

if (!loggedDriver) {
  alert("Driver not logged in");
  window.location.href = "login.html";
}

// ===============================
// LOAD ASSIGNED TRIP
// ===============================
const trip = JSON.parse(localStorage.getItem("currentTrip"));
const box = document.getElementById("tripsList");

if (!box) {
  console.error("tripsList element not found");
}

// ===============================
// RENDER
// ===============================
if (trip && trip.driverId === loggedDriver.id) {
  box.innerHTML = `
    <h3>New Trip Assigned</h3>

    <p><b>Trip #:</b> ${trip.tripNumber}</p>
    <p><b>Client:</b> ${trip.clientName || "-"}</p>
    <p><b>Pickup:</b> ${trip.pickup}</p>
    <p><b>Dropoff:</b> ${trip.dropoff}</p>

    <br>

    <button onclick="openTrip()">Open Trip</button>
  `;
} else {
  box.innerHTML = "<p>No trips assigned</p>";
}

// ===============================
// OPEN MAP
// ===============================
function openTrip() {
  window.location.href = "map.html";
}