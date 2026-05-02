document.addEventListener("DOMContentLoaded", function(){

/* ================= AUTH ================= */

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if(!token || role !== "company"){
  window.location.replace("company-login.html");
  return;
}

/* ================= TABS ================= */

const tabButtons = document.querySelectorAll(".tab");
const individualSection = document.getElementById("individualSection");
const sharedSection     = document.getElementById("sharedSection");

function activateTab(name){
  tabButtons.forEach(btn => btn.classList.remove("active"));

  if(name === "individual"){
    tabButtons[0].classList.add("active");
    individualSection.style.display = "block";
    sharedSection.style.display = "none";
  }else{
    tabButtons[1].classList.add("active");
    individualSection.style.display = "none";
    sharedSection.style.display = "block";
  }
}

// default
activateTab("individual");

tabButtons[0].addEventListener("click", () => activateTab("individual"));
tabButtons[1].addEventListener("click", () => activateTab("shared"));

/* ================= HELPERS ================= */

function getArizonaNow(){
  return new Date(
    new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
  );
}

function alertMsg(msg){
  alert(msg);
}

/* ================= ENTRY ================= */

const entryName  = document.getElementById("entryName");
const entryPhone = document.getElementById("entryPhone");
const editEntry  = document.getElementById("editEntry");

function loadEntry(){
  try{
    const saved = JSON.parse(localStorage.getItem("entryInfo") || "{}");
    if(saved.name){
      entryName.value  = saved.name;
      entryPhone.value = saved.phone;
      entryName.disabled = true;
      entryPhone.disabled = true;
      editEntry.textContent = "Edit";
    }else{
      editEntry.textContent = "Save";
    }
  }catch{}
}

function saveEntry(){
  localStorage.setItem("entryInfo", JSON.stringify({
    name: entryName.value,
    phone: entryPhone.value
  }));
}

editEntry.addEventListener("click", function(){
  if(entryName.disabled){
    entryName.disabled = false;
    entryPhone.disabled = false;
    editEntry.textContent = "Save";
  }else{
    saveEntry();
    entryName.disabled = true;
    entryPhone.disabled = true;
    editEntry.textContent = "Edit";
    alertMsg("Saved ✔");
  }
});

loadEntry();

/* ================= STOPS ================= */

const stopsBox   = document.getElementById("stops");
const addStopBtn = document.getElementById("addStopBtn");

let stopCounter = 0;

function createStop(){
  if(stopsBox.querySelectorAll(".stop-input").length >= 5){
    alertMsg("Max 5 stops");
    return;
  }

  const row = document.createElement("div");
  row.className = "stop-row";

  const input = document.createElement("input");
  input.className = "stop-input";
  input.placeholder = "Stop Address";

  const remove = document.createElement("button");
  remove.textContent = "✕";
  remove.className = "btn-gray";
  remove.style.marginTop = "5px";

  remove.onclick = () => row.remove();

  row.appendChild(input);
  row.appendChild(remove);

  stopsBox.appendChild(row);
}

if(addStopBtn){
  addStopBtn.addEventListener("click", createStop);
}

/* ================= INDIVIDUAL ================= */

const clientName  = document.getElementById("clientName");
const clientPhone = document.getElementById("clientPhone");

const pickupInput  = document.getElementById("pickup");
const dropoffInput = document.getElementById("dropoff");

const tripDate = document.getElementById("tripDate");
const tripTime = document.getElementById("tripTime");
const notes    = document.getElementById("notes");

const saveTripBtn   = document.getElementById("saveTrip");
const submitTripBtn = document.getElementById("submitTrip");

/* SAVE LOCAL */

saveTripBtn.addEventListener("click", function(){

  const draft = {
    clientName: clientName.value,
    clientPhone: clientPhone.value,
    pickup: pickupInput.value,
    dropoff: dropoffInput.value,
    tripDate: tripDate.value,
    tripTime: tripTime.value,
    notes: notes.value
  };

  localStorage.setItem("tripDraft", JSON.stringify(draft));
  alertMsg("Saved locally ✔");
});

/* LOAD LOCAL */

(function loadDraft(){
  try{
    const d = JSON.parse(localStorage.getItem("tripDraft"));
    if(!d) return;

    clientName.value  = d.clientName || "";
    clientPhone.value = d.clientPhone || "";
    pickupInput.value = d.pickup || "";
    dropoffInput.value = d.dropoff || "";
    tripDate.value = d.tripDate || "";
    tripTime.value = d.tripTime || "";
    notes.value = d.notes || "";
  }catch{}
})();

/* VALIDATION */

function validateTime(){
  if(!tripDate.value || !tripTime.value){
    alertMsg("Pick date/time");
    return false;
  }

  const now = getArizonaNow();
  const t = new Date(`${tripDate.value}T${tripTime.value}:00`);

  if(t <= now){
    alertMsg("Past time ❌");
    return false;
  }

  return true;
}

/* SUBMIT */

submitTripBtn.addEventListener("click", async function(){

  if(!validateTime()) return;

  const trip = {
    clientName: clientName.value,
    clientPhone: clientPhone.value,
    pickup: pickupInput.value,
    dropoff: dropoffInput.value,
    tripDate: tripDate.value,
    tripTime: tripTime.value,
    notes: notes.value,
    status:"Scheduled"
  };

  try{
    const res = await fetch("/api/trips",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer "+token
      },
      body: JSON.stringify(trip)
    });

    if(!res.ok){
      alertMsg("Error saving");
      return;
    }

    localStorage.removeItem("tripDraft");

    clientName.value="";
    clientPhone.value="";
    pickupInput.value="";
    dropoffInput.value="";
    tripDate.value="";
    tripTime.value="";
    notes.value="";
    stopsBox.innerHTML="";

    alertMsg("Trip Submitted ✔");

  }catch(err){
    alertMsg("Server error");
  }

});

/* ================= SHARED ================= */

const passengerSelect = document.querySelector("#sharedSection select");
const passengersWrap  = document.querySelector("#sharedSection .form-grid + section");

function buildPassengers(n){
  passengersWrap.innerHTML = "<h3>Passengers</h3>";

  for(let i=1;i<=n;i++){
    const row = document.createElement("div");
    row.className = "form-grid";
    row.style.marginBottom = "10px";

    row.innerHTML = `
      <input placeholder="Name">
      <input placeholder="Phone">
      <input placeholder="Pickup">
      <input placeholder="Dropoff">
    `;

    passengersWrap.appendChild(row);
  }
}

passengerSelect.addEventListener("change", function(){
  const n = Number(this.value);
  if(n >= 2 && n <= 4){
    buildPassengers(n);
  }else{
    passengersWrap.innerHTML = "<h3>Passengers</h3>";
  }
});

/* SHARED SAVE */

document.querySelector("#sharedSection .btn-gray").addEventListener("click", function(){
  alertMsg("Shared saved locally ✔");
});

/* SHARED SUBMIT */

document.querySelector("#sharedSection .btn-green").addEventListener("click", function(){
  alertMsg("Shared Trip Submitted ✔");
});

});