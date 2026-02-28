document.addEventListener("DOMContentLoaded", function(){

/* ================= AUTH ================= */
let loggedCompany = null;
try { loggedCompany = JSON.parse(localStorage.getItem("loggedCompany")); } catch {}
if (!loggedCompany) {
  window.location.href = "company-login.html";
  return;
}

/* ================= TIME (AZ) ================= */
function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" }));
}
function getTripDT(date, time){
  if(!date || !time) return null;
  return new Date(date + "T" + time);
}
function minutesToTrip(date, time){
  const dt = getTripDT(date, time);
  if(!dt) return null;
  return (dt - getAZNow()) / 60000;
}
function tripPassed(date,time){
  const m = minutesToTrip(date,time);
  return m !== null && m <= 0;
}
function within120(date,time){
  const m = minutesToTrip(date,time);
  return m !== null && m > 0 && m <= 120;
}

/* ================= DOM ================= */
const entryName  = document.getElementById("entryName");
const entryPhone = document.getElementById("entryPhone");
const clientName = document.getElementById("clientName");
const clientPhone = document.getElementById("clientPhone");
const pickup = document.getElementById("pickup");
const dropoff = document.getElementById("dropoff");
const tripDate = document.getElementById("tripDate");
const tripTime = document.getElementById("tripTime");
const notes = document.getElementById("notes");
const stopsContainer = document.getElementById("stops");
const submitBtn = document.getElementById("submitTrip");

/* ================= GENERATE # ================= */
function generateTripNumber(){
  return "GH-" + Date.now();
}

/* ================= COLLECT ================= */
function collect(){
  return {
    tripNumber: generateTripNumber(),
    type: "Company",
    company: loggedCompany.name,

    entryName: entryName.value.trim(),
    entryPhone: entryPhone.value.trim(),

    clientName: clientName.value.trim(),
    clientPhone: clientPhone.value.trim(),

    pickup: pickup.value.trim(),
    dropoff: dropoff.value.trim(),

    stops: [...stopsContainer.querySelectorAll("input")]
      .map(i=>i.value.trim())
      .filter(Boolean),

    tripDate: tripDate.value,
    tripTime: tripTime.value,

    notes: notes.value.trim(),
    status: "Scheduled"
  };
}

/* ================= SEND ================= */
let sending=false;

async function sendTrip(data){
  if(sending) return false;
  sending=true;
  submitBtn.disabled=true;
  submitBtn.innerText="Sending...";

  try{
    const res = await fetch("/api/trips",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(data)
    });
    if(!res.ok){
      const err = await res.json();
      throw new Error(err.message || "Server Error");
    }
    return true;
  }catch(e){
    alert(e.message);
    return false;
  }finally{
    sending=false;
    submitBtn.disabled=false;
    submitBtn.innerText="Submit";
  }
}

/* ================= SUBMIT ================= */
submitBtn.addEventListener("click", async function(e){
  e.preventDefault();

  if(!entryName.value || !entryPhone.value){
    alert("Complete Entry Info first.");
    return;
  }

  if(!tripDate.value || !tripTime.value){
    alert("Select trip date & time.");
    return;
  }

  if(tripPassed(tripDate.value, tripTime.value)){
    alert("Trip time already passed. Cannot book.");
    return;
  }

  if(within120(tripDate.value, tripTime.value)){
    const ok = confirm("⚠ Within 120 minutes.\nNo further modifications allowed.\nContinue?");
    if(!ok) return;
  }

  const ok = await sendTrip(collect());
  if(ok){
    alert("Trip sent to Review ✔");
    window.location.href="review.html";
  }
});

});