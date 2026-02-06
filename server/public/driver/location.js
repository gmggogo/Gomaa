console.log("driver/location.js loaded");

const driver = JSON.parse(localStorage.getItem("loggedUser"));
if (!driver || driver.role !== "driver") return;

function updateLiveLocation() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    pos => {
      const payload = {
        driverId: driver.id,
        name: driver.name,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        updatedAt: Date.now()
      };

      // تخزين Live Location
      localStorage.setItem(
        "sunbeam_driver_live_" + driver.id,
        JSON.stringify(payload)
      );
    },
    err => console.warn("GPS error"),
    { enableHighAccuracy: true }
  );
}

// أول مرة فورًا
updateLiveLocation();

// كل 15 ثانية
setInterval(updateLiveLocation, 15000);