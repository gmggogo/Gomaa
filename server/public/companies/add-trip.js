document.addEventListener("DOMContentLoaded", function(){

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const companyName = localStorage.getItem("name") || "";

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}

/* TABS */
const tabInd = document.getElementById("tabIndividual");
const tabShr = document.getElementById("tabShared");
const ind = document.getElementById("individualSection");
const shr = document.getElementById("sharedSection");

tabInd.onclick = ()=>{ ind.style.display="block"; shr.style.display="none"; tabInd.classList.add("active"); tabShr.classList.remove("active"); };
tabShr.onclick = ()=>{ ind.style.display="none"; shr.style.display="block"; tabShr.classList.add("active"); tabInd.classList.remove("active"); };

/* AZ */
function normalizeAZ(a){
  a=a.toLowerCase();
  if(a.includes("az")||a.includes("arizona")) return a;
  return a+", AZ, USA";
}

function geo(a){
  return new Promise((res,rej)=>{
    new google.maps.Geocoder().geocode({address:a},(r,s)=>{
      if(s==="OK") res({
        address:r[0].formatted_address,
        lat:r[0].geometry.location.lat(),
        lng:r[0].geometry.location.lng()
      });
      else rej("Bad address");
    });
  });
}

/* INDIVIDUAL SUBMIT */
document.getElementById("submitTrip").onclick = async ()=>{

const pickup = document.getElementById("pickup").value;
const dropoff = document.getElementById("dropoff").value;
const date = document.getElementById("tripDate").value;
const time = document.getElementById("tripTime").value;

if(!pickup || !dropoff || !date || !time){
alert("Fill all fields");
return;
}

let p,d;

try{
p = await geo(normalizeAZ(pickup));
d = await geo(normalizeAZ(dropoff));
}catch(e){
alert(e);
return;
}

await fetch("/api/trips",{
method:"POST",
headers:{
"Content-Type":"application/json",
"Authorization":"Bearer "+token
},
body:JSON.stringify({
company:companyName,
pickup:p.address,
pickupLat:p.lat,
pickupLng:p.lng,
dropoff:d.address,
dropoffLat:d.lat,
dropoffLng:d.lng,
tripDate:date,
tripTime:time,
status:"Scheduled"
})
});

alert("Trip Added ✔");
location.reload();

};

/* SHARED BASIC */

const countSel = document.getElementById("passengerCount");
const box = document.getElementById("passengersBox");

countSel.onchange = ()=>{
box.innerHTML="";
const n = Number(countSel.value);

for(let i=0;i<n;i++){
box.innerHTML+=`
<div style="margin-top:10px;">
<input placeholder="Name">
<input placeholder="Phone">
<input placeholder="Pickup">
<input placeholder="Dropoff">
</div>`;
}
};

});