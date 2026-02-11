// ===============================
// MAP INIT (بدون قفلة)
// ===============================
const map = L.map("map").setView([0,0], 15);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom:19
}).addTo(map);

let driverMarker = null;
let firstFix = true;

// ===============================
// GPS (Uber behavior)
// ===============================
navigator.geolocation.watchPosition(
  pos=>{
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    if(!driverMarker){
      driverMarker = L.marker([lat,lng]).addTo(map);
    }else{
      driverMarker.setLatLng([lat,lng]);
    }

    // أول Fix بس
    if(firstFix){
      map.setView([lat,lng],16);
      firstFix = false;
    }

  },
  err=>{
    console.error("GPS error", err);
  },
  {
    enableHighAccuracy:true,
    maximumAge:1000,
    timeout:10000
  }
);