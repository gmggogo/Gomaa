document.addEventListener("DOMContentLoaded", function(){

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}

/* ENTRY */
const entryName  = document.getElementById("entryName");
const entryPhone = document.getElementById("entryPhone");
const editEntry  = document.getElementById("editEntry");

function lockEntry(){
  entryName.disabled = true;
  entryPhone.disabled = true;
}

function unlockEntry(){
  entryName.disabled = false;
  entryPhone.disabled = false;
}

function loadEntry(){
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("entryInfo")); } catch {}
  if(saved){
    entryName.value  = saved.name || "";
    entryPhone.value = saved.phone || "";
    lockEntry();
  }
}
loadEntry();

editEntry.addEventListener("click", function(){
  unlockEntry();
});

/* STOP */
const stopsBox = document.getElementById("stops");
document.getElementById("addStopBtn").addEventListener("click", function(){
  if(stopsBox.children.length >= 5){
    alert("Max 5 stops.");
    return;
  }
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Stop";
  stopsBox.appendChild(input);
});

/* SUBMIT */
document.getElementById("submitTrip").addEventListener("click", async function(){

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
    stops,
    notes: document.getElementById("notes").value,
    status: "Scheduled"
  };

  const res = await fetch("/api/trips", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify(trip)
  });

  if(!res.ok){
    alert("Server error.");
    return;
  }

  localStorage.setItem("entryInfo", JSON.stringify({
    name: entryName.value,
    phone: entryPhone.value
  }));

  lockEntry();

  document.getElementById("clientName").value = "";
  document.getElementById("clientPhone").value = "";
  document.getElementById("pickup").value = "";
  document.getElementById("dropoff").value = "";
  document.getElementById("tripDate").value = "";
  document.getElementById("tripTime").value = "";
  document.getElementById("notes").value = "";
  stopsBox.innerHTML = "";

  alert("Trip Saved ✔");

});

});