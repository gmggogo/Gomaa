document.addEventListener("DOMContentLoaded", function(){

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if(!token || role !== "company"){
  window.location.replace("company-login.html");
  return;
}

/* ================= AZ TIME ================= */

function getAZNow(){
  return new Date(
    new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
  );
}

/* ================= AZ ADDRESS ================= */

function normalizeAZ(address){
  const a = address.toLowerCase();
  if(a.includes("az") || a.includes("arizona")) return address;
  return address + ", AZ, USA";
}

function geocodeAddress(address){
  return new Promise((resolve,reject)=>{

    const geocoder = new google.maps.Geocoder();

    geocoder.geocode({address},(res,status)=>{

      if(status==="OK" && res[0]){
        const loc = res[0].geometry.location;
        resolve({
          address: res[0].formatted_address,
          lat: loc.lat(),
          lng: loc.lng()
        });
      }else{
        reject("Invalid address: " + address);
      }

    });

  });
}

/* ================= ELEMENTS ================= */

const pickupInput  = document.getElementById("pickup");
const dropoffInput = document.getElementById("dropoff");

const tripDate = document.getElementById("tripDate");
const tripTime = document.getElementById("tripTime");

const submitBtn = document.getElementById("submitTrip");

/* ================= VALIDATION ================= */

function validate(){

  if(!pickupInput.value.trim()){
    alert("Pickup required");
    return false;
  }

  if(!dropoffInput.value.trim()){
    alert("Dropoff required");
    return false;
  }

  if(!tripDate.value || !tripTime.value){
    alert("Date & time required");
    return false;
  }

  const tripDateTime = new Date(`${tripDate.value}T${tripTime.value}`);
  if(tripDateTime <= getAZNow()){
    alert("Trip must be in future (Arizona time)");
    return false;
  }

  return true;
}

/* ================= SUBMIT ================= */

submitBtn.onclick = async function(){

  if(!validate()) return;

  submitBtn.disabled = true;
  submitBtn.innerText = "Processing...";

  try{

    const pickup = await geocodeAddress(
      normalizeAZ(pickupInput.value)
    );

    const dropoff = await geocodeAddress(
      normalizeAZ(dropoffInput.value)
    );

    const trip = {
      pickup: pickup.address,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,

      dropoff: dropoff.address,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,

      tripDate: tripDate.value,
      tripTime: tripTime.value,
      status: "Scheduled"
    };

    await fetch("/api/trips",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer " + token
      },
      body: JSON.stringify(trip)
    });

    alert("Trip submitted ✔");

    location.reload();

  }catch(err){
    alert(err);
  }

  submitBtn.disabled = false;
  submitBtn.innerText = "Submit";

};

});