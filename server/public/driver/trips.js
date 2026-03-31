console.log("driver trips loaded");

/* =========================
   AUTH
========================= */

const user =
  JSON.parse(localStorage.getItem("loggedDriver")) ||
  JSON.parse(localStorage.getItem("user"));

if (!user) {
  alert("Login first");
  window.location.href = "../login.html";
}

const driverId = user._id || user.id;

/* =========================
   ELEMENTS
========================= */

const container = document.getElementById("container");

/* =========================
   HELPERS
========================= */

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function getTripTimestamp(trip){
  const dateStr = String(trip.tripDate || "").trim();
  const timeStr = String(trip.tripTime || "").trim();

  if(!dateStr) return 0;

  const d1 = new Date(`${dateStr} ${timeStr}`);
  if(!isNaN(d1.getTime())) return d1.getTime();

  const d2 = new Date(`${dateStr}T${timeStr}`);
  if(!isNaN(d2.getTime())) return d2.getTime();

  const d3 = new Date(dateStr);
  if(!isNaN(d3.getTime())) return d3.getTime();

  return 0;
}

function getCurrentArizonaNow(){
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
  ).getTime();
}

function getTripClass(trip){
  if(String(trip.status || "").toLowerCase() === "completed") return "trip-completed";

  const ts = getTripTimestamp(trip);
  if(!ts) return "trip-upcoming";

  const diffMin = Math.round((getCurrentArizonaNow() - ts) / 60000);

  if(diffMin >= 0) return "trip-expired";
  if(diffMin >= -30) return "trip-urgent";
  if(diffMin >= -90) return "trip-soon";
  return "trip-upcoming";
}

function getStatusBadgeClass(status){
  const clean = String(status || "").replace(/\s+/g,"");
  const allowed = ["Scheduled","Dispatched","DriverAssigned","InProgress","Completed"];
  return allowed.includes(clean) ? `badge-${clean}` : "badge-default";
}

function normalizeStops(trip){
  if(Array.isArray(trip.stops)) return trip.stops.filter(Boolean);
  if(Array.isArray(trip.stopAddresses)) return trip.stopAddresses.filter(Boolean);
  if(Array.isArray(trip.extraStops)) return trip.extraStops.filter(Boolean);
  if(typeof trip.stop === "string" && trip.stop.trim()) return [trip.stop.trim()];
  return [];
}

function formatStopsHtml(trip){
  const stops = normalizeStops(trip);
  if(!stops.length) return `<div class="address">-</div>`;

  return `
    <div class="address">
      ${stops.map(s => escapeHtml(s)).join("<br>")}
    </div>
  `;
}

/* =========================
   LOAD TRIPS FROM SERVER
========================= */

async function loadTrips(){
  try{
    const res = await fetch(`/api/driver/my-trips/${driverId}`);

    if(!res.ok) throw new Error("server error");

    const trips = await res.json();

    render(Array.isArray(trips) ? trips : []);
  }catch(err){
    console.error(err);
    container.innerHTML = `<div class="empty">Error loading trips</div>`;
  }
}

/* =========================
   RENDER
========================= */

function render(trips){
  container.innerHTML = "";

  if(!trips.length){
    container.innerHTML = `<div class="empty">No Trips</div>`;
    return;
  }

  trips
    .slice()
    .sort((a,b) => getTripTimestamp(a) - getTripTimestamp(b))
    .forEach(t => {
      const card = document.createElement("div");
      const cardClass = getTripClass(t);
      const statusText = escapeHtml(t.status || "Scheduled");
      const badgeClass = getStatusBadgeClass(t.status);
      const notes = String(t.notes || "").trim();

      card.className = `trip-card ${cardClass}`;
      card.onclick = () => openTrip(t);

      card.innerHTML = `
        <div class="trip-top">
          <div class="trip-number">#${escapeHtml(t.tripNumber || "")}</div>
          <div class="trip-time">${escapeHtml(t.tripTime || "")}</div>
        </div>

        <div class="address-block">
          <div class="label">Pickup</div>
          <div class="address">${escapeHtml(t.pickup || "-")}</div>
        </div>

        <div class="line"></div>

        <div class="address-block">
          <div class="label">Stops</div>
          ${formatStopsHtml(t)}
        </div>

        <div class="line"></div>

        <div class="address-block">
          <div class="label">Dropoff</div>
          <div class="address">${escapeHtml(t.dropoff || "-")}</div>
        </div>

        <div class="meta-row">
          <div class="badge ${badgeClass}">${statusText}</div>
          <div class="meta-date">${escapeHtml(t.tripDate || "")}</div>
        </div>

        ${notes ? `
          <div class="notes">
            <strong>Notes:</strong><br>
            ${escapeHtml(notes)}
          </div>
        ` : ""}
      `;

      container.appendChild(card);
    });
}

/* =========================
   OPEN TRIP
========================= */

function openTrip(trip){
  if (String(trip.status || "").toLowerCase() === "completed") return;
  window.location.href = `map.html?tripId=${trip._id}`;
}

/* =========================
   LOGOUT
========================= */

function logout(){
  localStorage.clear();
  window.location.href = "../login.html";
}

/* =========================
   AUTO REFRESH
========================= */

loadTrips();
setInterval(loadTrips, 5000);