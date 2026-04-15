console.log("MAP FINAL");

/* ================= AUTH ================= */
const driver = JSON.parse(localStorage.getItem("loggedDriver") || "{}");
const DRIVER_ID = driver._id;
document.getElementById("driverName").innerText = driver.name || "Driver";

/* ================= TIME ================= */
setInterval(()=>{
  document.getElementById("datetime").innerText =
    new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"});
},1000);

/* ================= STATE ================= */
let arrived=false;
let started=false;
let called=false;
let wait=900;
let timer=null;

/* ================= UI ================= */
const btnGoPickup=document.getElementById("btnGoPickup");
const btnArrived=document.getElementById("btnArrived");
const btnStart=document.getElementById("btnStart");
const btnNoShow=document.getElementById("btnNoShow");
const btnComplete=document.getElementById("btnComplete");
const btnGoogle=document.getElementById("btnGoogle");
const navText=document.getElementById("navText");
const waitTimer=document.getElementById("waitTimer");

/* ================= MAP ================= */
const map=L.map("map").setView([33.45,-112.07],13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

/* ================= FLOW ================= */

btnGoPickup.onclick=()=>{
  navText.innerText="Go to pickup";
  btnArrived.style.display="block";
  btnGoPickup.style.display="none";
};

btnArrived.onclick=()=>{
  arrived=true;
  navText.innerText="Waiting passenger";

  btnArrived.style.display="none";
  btnStart.style.display="block";
  btnNoShow.style.display="block";

  startTimer();
};

btnStart.onclick=()=>{
  if(wait<=0 && !called){
    alert("Call client first");
    return;
  }

  started=true;
  navText.innerText="Go to dropoff";

  btnStart.style.display="none";
  btnNoShow.style.display="none";
  btnComplete.style.display="block";
};

btnNoShow.onclick=()=>{
  if(wait>0){
    alert("Wait timer must finish");
    return;
  }

  const reason=prompt("Reason?");
  if(!reason)return;

  alert("No Show Done");
  location.href="/driver/trips.html";
};

btnComplete.onclick=()=>{
  alert("Trip Completed");
  location.href="/driver/trips.html";
};

/* ================= TIMER ================= */

function startTimer(){
  waitTimer.style.display="block";

  timer=setInterval(()=>{
    wait--;

    let m=Math.floor(wait/60);
    let s=wait%60;

    waitTimer.innerText=`${m}:${s}`;

    if(wait<=0){
      clearInterval(timer);
      waitTimer.innerText="CALL CLIENT";

      btnStart.style.display="none";
      btnNoShow.style.display="none";

      btnGoogle.innerText="CALL CLIENT";
      btnGoogle.onclick=()=>{
        called=true;
        alert("Client Called");

        btnStart.style.display="block";
        btnNoShow.style.display="block";
      };
    }

  },1000);
}

/* ================= NAV ================= */
loadDriverNav("map");