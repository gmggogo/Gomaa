const urlParams = new URLSearchParams(window.location.search);
const TRIP_ID = urlParams.get("tripId");

let tripDoc = null;

let map = L.map('map').setView([33.4484,-112.0740],13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let driverMarker;
let routeLine;

let driverLat, driverLng;

let arrived=false;
let started=false;
let timerInterval=null;

const btnArrived = document.getElementById("btnArrived");
const btnStart = document.getElementById("btnStart");
const btnCall = document.getElementById("btnCall");
const btnNoShow = document.getElementById("btnNoShow");
const waitTimer = document.getElementById("waitTimer");

const noShowBox = document.getElementById("noShowBox");
const btnSaveNoShow = document.getElementById("btnSaveNoShow");

function hideAll(){
  btnArrived.style.display="none";
  btnStart.style.display="none";
  btnCall.style.display="none";
  btnNoShow.style.display="none";
  noShowBox.style.display="none";
}

hideAll();

async function loadTrip(){
  const res = await fetch(`/api/trips/${TRIP_ID}`);
  tripDoc = await res.json();

  document.getElementById("clientName").innerText = tripDoc.clientName;
}

function startTimer(){
  const tripTime = new Date(tripDoc.tripDate + "T" + tripDoc.tripTime);

  timerInterval = setInterval(()=>{
    const diff = (Date.now() - tripTime)/1000;

    const remaining = Math.max(0,900 - diff);

    const m = Math.floor(remaining/60);
    const s = Math.floor(remaining%60);

    waitTimer.innerText =
      `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;

    if(remaining<=0){
      btnCall.style.display="block";
    }

  },1000);
}

function distance(a,b,c,d){
  const R=6371e3;
  const dLat=(c-a)*Math.PI/180;
  const dLon=(d-b)*Math.PI/180;

  const x=Math.sin(dLat/2)**2 +
  Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLon/2)**2;

  return R*(2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)));
}

navigator.geolocation.watchPosition(async(pos)=>{

  driverLat=pos.coords.latitude;
  driverLng=pos.coords.longitude;

  if(!driverMarker){
    driverMarker=L.marker([driverLat,driverLng]).addTo(map);
  }else{
    driverMarker.setLatLng([driverLat,driverLng]);
  }

  if(!arrived){
    const d = distance(driverLat,driverLng,tripDoc.pickupLat,tripDoc.pickupLng);

    if(d<=800){
      arrived=true;
      btnArrived.style.display="block";
    }
  }

},{enableHighAccuracy:true});

btnArrived.onclick=()=>{
  btnArrived.style.display="none";
  btnStart.style.display="block";
  startTimer();
};

btnCall.onclick=()=>{
  window.location.href=`tel:${tripDoc.clientPhone}`;
  btnNoShow.style.display="block";
};

btnStart.onclick=()=>{
  started=true;
  btnStart.style.display="none";
};

btnNoShow.onclick=()=>{
  noShowBox.style.display="block";
};

btnSaveNoShow.onclick=async()=>{
  const note=document.getElementById("noShowNotes").value;

  await fetch(`/api/trips/${TRIP_ID}`,{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({status:"NoShow",note})
  });

  alert("No Show Saved");
  location.href="/driver/trips.html";
};

document.getElementById("btnGoogle").onclick=()=>{
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${tripDoc.pickupLat},${tripDoc.pickupLng}`);
};

loadTrip();