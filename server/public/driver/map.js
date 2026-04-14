const trip = {
  clientName: "Ahmed Ali",
  pickup: { lat:33.4484, lng:-112.0740 },
  dropoff: { lat:33.4500, lng:-112.0800 },
  status: "ON_THE_WAY"
};

document.getElementById("client").innerText = trip.clientName;

const map = L.map('map').setView([trip.pickup.lat, trip.pickup.lng], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let driverMarker;
let pickupMarker;
let dropoffMarker;
let routeLayer;
let lastRouteTime = 0;

// markers
pickupMarker = L.marker([trip.pickup.lat, trip.pickup.lng]).addTo(map);
dropoffMarker = L.marker([trip.dropoff.lat, trip.dropoff.lng]).addTo(map);

// distance calc
function getDistance(a,b){
  const R=6371e3;
  const p1=a.lat*Math.PI/180;
  const p2=b.lat*Math.PI/180;
  const d1=(b.lat-a.lat)*Math.PI/180;
  const d2=(b.lng-a.lng)*Math.PI/180;

  const x=Math.sin(d1/2)**2 +
    Math.cos(p1)*Math.cos(p2)*Math.sin(d2/2)**2;

  return R*(2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)));
}

// route
async function drawRoute(start,end){
  if(routeLayer) map.removeLayer(routeLayer);

  const url=`https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

  const res=await fetch(url);
  const data=await res.json();

  routeLayer=L.geoJSON(data.routes[0].geometry).addTo(map);
}

// smart route
function updateRoute(driver){
  const now=Date.now();

  if(now - lastRouteTime > 5000){

    if(trip.status==="ON_THE_WAY"){
      drawRoute(driver,trip.pickup);
    }

    if(trip.status==="STARTED"){
      drawRoute(driver,trip.dropoff);
    }

    lastRouteTime = now;
  }
}

// UI
function updateUI(){
  const status=document.getElementById("status");
  const footer=document.getElementById("footer");

  footer.innerHTML="";

  if(trip.status==="ON_THE_WAY"){
    status.innerText="On the way";
  }

  if(trip.status==="ARRIVED"){
    status.innerText="ARRIVED";

    footer.innerHTML=`
      <button class="start" onclick="startRide()">START RIDE</button>
      <button class="noshow" onclick="noShow()">NO SHOW</button>
    `;
  }

  if(trip.status==="STARTED"){
    status.innerText="Trip Started";

    footer.innerHTML=`
      <button class="complete" onclick="completeRide()">COMPLETE</button>
    `;
  }
}

// actions
function startRide(){
  trip.status="STARTED";
  updateUI();
  drawRoute(trip.pickup,trip.dropoff);
}

function noShow(){
  alert("No Show");
}

function completeRide(){
  alert("Trip Completed");
}

// tracking
navigator.geolocation.watchPosition((pos)=>{

  const driver={
    lat:pos.coords.latitude,
    lng:pos.coords.longitude
  };

  if(!driverMarker){
    driverMarker=L.marker([driver.lat,driver.lng]).addTo(map);
  }else{
    driverMarker.setLatLng([driver.lat,driver.lng]);
  }

  const distance=getDistance(driver,trip.pickup);

  // ARRIVED auto (0.5 mile)
  if(distance <= 800 && trip.status==="ON_THE_WAY"){
    trip.status="ARRIVED";
    updateUI();
  }

  updateRoute(driver);

},{enableHighAccuracy:true});

updateUI();