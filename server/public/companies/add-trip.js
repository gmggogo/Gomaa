document.addEventListener("DOMContentLoaded", function(){

/* ============================= */
/* AUTH CHECK */
/* ============================= */

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}

/* ============================= */
/* ENTRY INFO */
/* ============================= */

const entryName  = document.getElementById("entryName");
const entryPhone = document.getElementById("entryPhone");
const editEntry  = document.getElementById("editEntry");

function loadEntry(){

  let saved = null;

  try{
    saved = JSON.parse(localStorage.getItem("entryInfo"));
  }catch{}

  if(saved){
    entryName.value  = saved.name || "";
    entryPhone.value = saved.phone || "";
    entryName.disabled = true;
    entryPhone.disabled = true;
  }

}

loadEntry();

/* EDIT / SAVE ENTRY */

editEntry.addEventListener("click", function(){

  if(entryName.disabled){

    entryName.disabled = false;
    entryPhone.disabled = false;

    editEntry.textContent = "Save";

  }else{

    localStorage.setItem("entryInfo", JSON.stringify({
      name: entryName.value,
      phone: entryPhone.value
    }));

    entryName.disabled = true;
    entryPhone.disabled = true;

    editEntry.textContent = "Edit";

    alert("Entry information saved ✔");

  }

});

/* ============================= */
/* STOPS */
/* ============================= */

const stopsBox = document.getElementById("stops");
const addStopBtn = document.getElementById("addStopBtn");

addStopBtn.addEventListener("click", function(){

  if(stopsBox.children.length >= 5){
    alert("Maximum 5 stops allowed.");
    return;
  }

  const input = document.createElement("input");

  input.type = "text";
  input.placeholder = "Stop address";
  input.className = "stop-input";

  stopsBox.appendChild(input);

});

/* ============================= */
/* 120 MINUTES CHECK */
/* ============================= */

function check120(){

  const date = document.getElementById("tripDate").value;
  const time = document.getElementById("tripTime").value;

  if(!date || !time) return true;

  const tripTime = new Date(date + "T" + time);
  const now = new Date();

  const diff = (tripTime - now) / 60000;

  if(diff < 120){

    return confirm(
      "Trip is within 120 minutes.\nEditing may be restricted.\nContinue?"
    );

  }

  return true;

}

/* ============================= */
/* SAVE FORM ONLY */
/* ============================= */

const saveTrip = document.getElementById("saveTrip");

saveTrip.addEventListener("click", function(){

  localStorage.setItem("tripDraft", JSON.stringify({

    clientName: document.getElementById("clientName").value,
    clientPhone: document.getElementById("clientPhone").value,
    pickup: document.getElementById("pickup").value,
    dropoff: document.getElementById("dropoff").value,
    tripDate: document.getElementById("tripDate").value,
    tripTime: document.getElementById("tripTime").value,
    notes: document.getElementById("notes").value

  }));

  alert("Trip saved locally ✔");

});

/* ============================= */
/* SUBMIT TRIP */
/* ============================= */

const submitTrip = document.getElementById("submitTrip");

submitTrip.addEventListener("click", async function(){

  if(!check120()){
    return;
  }

  const stops = [...stopsBox.querySelectorAll("input")]
  .map(i => i.value.trim())
  .filter(Boolean);

  const trip = {

    entryName: entryName.value,
    entryPhone: entryPhone.value,

    clientName: document.getElementById("clientName").value,
    clientPhone: document.getElementById("clientPhone").value,

    pickup: document.getElementById("pickup").value,
    dropoff: document.getElementById("dropoff").value,

    tripDate: document.getElementById("tripDate").value,
    tripTime: document.getElementById("tripTime").value,

    stops: stops,

    notes: document.getElementById("notes").value,

    status: "Scheduled"

  };

  try{

    const res = await fetch("/api/trips", {

      method:"POST",

      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer " + token
      },

      body:JSON.stringify(trip)

    });

    if(!res.ok){
      throw new Error("Server error");
    }

    /* SAVE ENTRY AGAIN */

    localStorage.setItem("entryInfo", JSON.stringify({
      name: entryName.value,
      phone: entryPhone.value
    }));

    /* CLEAR TRIP FIELDS */

    document.getElementById("clientName").value = "";
    document.getElementById("clientPhone").value = "";
    document.getElementById("pickup").value = "";
    document.getElementById("dropoff").value = "";
    document.getElementById("tripDate").value = "";
    document.getElementById("tripTime").value = "";
    document.getElementById("notes").value = "";

    stopsBox.innerHTML = "";

    alert("Trip submitted ✔");

    document.getElementById("clientName").focus();

  }
  catch(err){

    alert("Server error saving trip.");
    console.error(err);

  }

});

});