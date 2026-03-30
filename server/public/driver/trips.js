console.log("Driver trips loaded");

/* ================= DRIVER ================= */

const driver = JSON.parse(localStorage.getItem("loggedDriver") || "{}");

if(!driver.id){
  alert("Driver not logged in");
  window.location.href = "login.html";
}

/* ================= LOAD ================= */

const key = "driverTrips_" + driver.id;
let trips = JSON.parse(localStorage.getItem(key)) || [];

const container = document.getElementById("tripsContainer");

/* ================= SAVE ================= */

function save(){
  localStorage.setItem(key, JSON.stringify(trips));
}

/* ================= TIME CHECK ================= */

function isExpired(trip){
  if(!trip.tripDate || !trip.tripTime) return false;

  const now = new Date();
  const tripTime = new Date(trip.tripDate + " " + trip.tripTime);

  return now > tripTime;
}

/* ================= RENDER ================= */

function render(){

  container.innerHTML = "";

  if(!trips.length){
    container.innerHTML = "<p>No trips</p>";
    return;
  }

  trips.forEach((t,i)=>{

    let statusClass = "pending";

    if(t.status === "Accepted") statusClass = "accepted";
    if(t.status === "Completed") statusClass = "completed";

    const stops = (t.stops && t.stops.length)
      ? t.stops.join(" | ")
      : "No Stops";

    const card = document.createElement("div");
    card.className = `card ${statusClass}`;

    card.innerHTML = `
      <div class="title">Trip # ${t.tripId || ""}</div>

      <div class="text">👤 ${t.clientName || "-"}</div>
      <div class="text">📞 ${t.phone || "-"}</div>

      <div class="text">📍 ${t.pickup}</div>
      <div class="text">🛑 ${stops}</div>
      <div class="text">🏁 ${t.dropoff}</div>

      <div class="text">📅 ${t.tripDate} - ${t.tripTime}</div>

      <div class="text">⚡ Status: ${t.status || "Pending"}</div>
    `;

    /* ================= CLICK ================= */

    card.onclick = () => {

      // لو خلصت → متفتحش
      if(t.status === "Completed"){
        return;
      }

      // لو فاتت → متفتحش
      if(isExpired(t)){
        alert("Trip time passed");
        return;
      }

      // أول ضغطه → تتحول Accepted
      if(!t.status || t.status === "Pending"){
        t.status = "Accepted";
      }

      // فتح الخريطة
      window.open(
        "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(t.pickup)
      );

      save();
      render();
    };

    /* ================= AUTO COMPLETE ================= */

    if(isExpired(t) && t.status !== "Completed"){
      t.status = "Completed";
      save();
    }

    container.appendChild(card);

  });

}

/* ================= NAV ================= */

function goHome(){
  window.location.href = "dashboard.html";
}

function goMap(){
  window.location.href = "map.html";
}

function logout(){
  localStorage.removeItem("loggedDriver");
  window.location.href = "login.html";
}

/* ================= AUTO REFRESH ================= */

setInterval(()=>{
  trips = JSON.parse(localStorage.getItem(key)) || [];
  render();
},3000);

/* ================= INIT ================= */

render();