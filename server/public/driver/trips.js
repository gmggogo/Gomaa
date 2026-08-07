console.log("driver trips FINAL PROFESSIONAL - SERVICE FIX");

const user =
  JSON.parse(localStorage.getItem("loggedDriver")) ||
  JSON.parse(localStorage.getItem("user"));

if(!user){
  location.href = "../login.html";
}

const driverId = user?._id || user?.id;
const container = document.getElementById("container");
const tripCount = document.getElementById("tripCount");

const newTripCount =
  document.getElementById("newTripCount");

const newTripsBox =
  document.getElementById("newTripsBox");

const newTripLight =
  document.getElementById("newTripLight");

/*
  New-trip logic:
  - First successful load creates the baseline; old trips do not count as new.
  - Any trip that appears after that is marked NEW and turns the green light on.
  - The light stays on until the driver taps the New box.
*/
const NEW_TRIPS_STORAGE_KEY =
  `driverTripsSeen:${String(driverId || "")}`;

let firstTripsLoad = true;
let currentVisibleTrips = [];
let newTripIds = new Set();

function readSeenTripIds(){
  try{
    const raw =
      JSON.parse(
        localStorage.getItem(
          NEW_TRIPS_STORAGE_KEY
        ) || "[]"
      );

    return new Set(
      Array.isArray(raw)
        ? raw.map(String)
        : []
    );
  }catch{
    return new Set();
  }
}

function saveSeenTripIds(ids){
  try{
    localStorage.setItem(
      NEW_TRIPS_STORAGE_KEY,
      JSON.stringify(
        [...ids]
      )
    );
  }catch{}
}

function getTripId(t){
  return String(
    t?._id ||
    t?.id ||
    ""
  );
}

function updateNewTripIndicator(){
  const count =
    newTripIds.size;

  if(newTripCount){
    newTripCount.textContent =
      String(count);
  }

  if(newTripsBox){
    newTripsBox.classList.toggle(
      "has-new",
      count > 0
    );
  }

  if(newTripLight){
    newTripLight.setAttribute(
      "aria-label",
      count > 0
        ? `${count} new trip${count === 1 ? "" : "s"}`
        : "No new trips"
    );
  }
}

function detectNewTrips(trips){
  const ids =
    trips
      .map(getTripId)
      .filter(Boolean);

  const seen =
    readSeenTripIds();

  /*
    First load:
    if this driver has no saved baseline yet,
    treat everything already on the screen as old.
  */
  if(firstTripsLoad && seen.size === 0){
    ids.forEach(id=>seen.add(id));
    saveSeenTripIds(seen);
    newTripIds.clear();
    firstTripsLoad = false;
    updateNewTripIndicator();
    return;
  }

  firstTripsLoad = false;

  newTripIds = new Set(
    ids.filter(id=>!seen.has(id))
  );

  updateNewTripIndicator();
}

function markNewTripsSeen(){
  const seen =
    readSeenTripIds();

  currentVisibleTrips
    .map(getTripId)
    .filter(Boolean)
    .forEach(id=>seen.add(id));

  saveSeenTripIds(seen);

  newTripIds.clear();
  updateNewTripIndicator();

  document
    .querySelector(".scroll-area")
    ?.scrollTo({
      top:0,
      behavior:"smooth"
    });

  render(currentVisibleTrips);
}

window.markNewTripsSeen =
  markNewTripsSeen;


function clean(v){
  return String(v ?? "").trim();
}

function firstValue(...values){
  for(const value of values){
    if(value !== undefined && value !== null && clean(value) !== ""){
      return value;
    }
  }
  return "";
}

function esc(v){
  return clean(v)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function getNow(){
  return new Date(
    new Date().toLocaleString(
      "en-US",
      {timeZone:"America/Phoenix"}
    )
  );
}

function getTripDate(t){
  const date = firstValue(t.tripDate,t.date,t.serviceDate);
  const time = firstValue(t.tripTime,t.time,t.pickupTime,t.scheduledTime,"00:00");
  return new Date(`${date}T${time}`);
}

function isExpired(t){
  const d = getTripDate(t);
  if(isNaN(d)) return false;
  return ((getNow() - d) / (1000*60*60)) >= 6;
}

function formatTime(t){
  const raw = clean(firstValue(t.tripTime,t.time,t.pickupTime,t.scheduledTime));
  const m = raw.match(/^(\d{1,2}):(\d{2})/);

  if(!m){
    return esc(raw || "--:--");
  }

  let h = Number(m[1]);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;

  return `${h}:${m[2]} ${ap}`;
}

function getStatus(t){
  const raw = clean(
    firstValue(
      t.dispatchStatus,
      t.status,
      "Scheduled"
    )
  )
  .toUpperCase()
  .replace(/[\s-]+/g,"_");

  if(raw === "NO_SHOW" || raw === "NOSHOW") return "NoShow";
  if(["IN_PROGRESS","INPROGRESS","ON_TRIP","ONTRIP"].includes(raw)) return "OnTrip";
  if(raw === "ARRIVED") return "Arrived";
  if(["SCHEDULED","ASSIGNED","SENT","ACCEPTED"].includes(raw)) return "Dispatched";
  if(raw === "COMPLETED") return "Completed";
  if(raw === "CANCELLED" || raw === "CANCELED") return "Cancelled";

  return clean(firstValue(t.dispatchStatus,t.status,"Dispatched"));
}

function isActive(status){
  return status === "OnTrip" || status === "Arrived";
}

function getClass(status){
  if(status === "Completed") return "trip-completed";
  if(status === "Cancelled") return "trip-cancelled";
  if(status === "NoShow") return "trip-noshow";
  if(isActive(status)) return "trip-active";
  return "";
}

/* =========================================
   REAL SERVICE TYPE
   Shared is ONLY SH / SHARED
========================================= */

function normalizeServiceCode(v){
  const raw = clean(v)
    .toUpperCase()
    .replace(/[_\s-]+/g,"");

  if(["WH","WC","WHEELCHAIR"].includes(raw)) return "WH";
  if(["SH","SHARED"].includes(raw)) return "SH";
  if(["ST","STANDARD","X"].includes(raw)) return "ST";
  if(["LM","LIMO","LIMOUSINE"].includes(raw)) return "LM";
  if(["TX","TAXI"].includes(raw)) return "TX";
  if(raw === "XL") return "XL";

  return raw;
}

function getServiceCode(t){
  const direct = firstValue(
    t.serviceCode,
    t.serviceKey,
    t.serviceType,
    t.vehicleTypeFromQuote,
    t.serviceName,
    t.service
  );

  const normalized = normalizeServiceCode(direct);

  if(normalized){
    return normalized;
  }

  const tripNo = clean(
    firstValue(
      t.tripNumber,
      t.tripNo
    )
  ).toUpperCase();

  const match = tripNo.match(/-(WH|WC|SH|ST|LM|TX|XL)$/);

  if(match){
    return normalizeServiceCode(match[1]);
  }

  const tripType = normalizeServiceCode(t.tripType);

  if(tripType === "SH"){
    return "SH";
  }

  return "";
}

function getServiceTitle(t){
  const code = getServiceCode(t);

  if(code === "WH") return "Wheelchair";
  if(code === "SH") return "Shared";
  if(code === "ST") return "Standard";
  if(code === "LM") return "Limousine";
  if(code === "TX") return "Taxi";
  if(code === "XL") return "XL";

  return clean(
    firstValue(
      t.serviceName,
      t.serviceType,
      t.serviceCode,
      t.serviceKey,
      t.vehicleTypeFromQuote,
      "Trip"
    )
  );
}

function isShared(t){
  return getServiceCode(t) === "SH";
}

const getPassenger = t => clean(
  firstValue(
    t.clientName,
    t.passengerName,
    t.memberName,
    t.patientName,
    t.riderName,
    t.name,
    "Passenger"
  )
);

const getPhone = t => clean(
  firstValue(
    t.clientPhone,
    t.passengerPhone,
    t.memberPhone,
    t.phone
  )
);

const getPickup = t => clean(
  firstValue(
    t.pickupAddress,
    t.pickup,
    t.fromAddress,
    t.originAddress,
    t.origin
  )
);

const getDropoff = t => clean(
  firstValue(
    t.dropoffAddress,
    t.dropoff,
    t.toAddress,
    t.destinationAddress,
    t.destination
  )
);

const getTripNo = t => clean(
  firstValue(
    t.tripNumber,
    t.tripNo,
    t.reservationNumber,
    t.confirmationNumber,
    t._id,
    t.id
  )
);

const getNotes = t => clean(
  firstValue(
    t.driverNotes,
    t.notes,
    t.tripNotes,
    t.note
  )
);

const getDispatchNote = t => clean(
  firstValue(
    t.dispatchNote,
    t.assignmentNote
  )
);

function getSharedPassengers(t){
  return Array.isArray(t.passengers)
    ? t.passengers
    : [];
}

function sharedStops(t){
  const passengers = getSharedPassengers(t);
  const stops = [];

  passengers.forEach((p,index)=>{
    const passengerName = clean(
      firstValue(
        p.clientName,
        p.name,
        `Passenger ${index + 1}`
      )
    );

    const pickupOrder = Number(p.pickupOrder || 0);
    const dropoffOrder = Number(p.dropoffOrder || 0);

    const pickup = clean(p.pickup);
    const dropoff = clean(p.dropoff);

    if(pickup){
      stops.push({
        order:pickupOrder > 0 ? pickupOrder : null,
        fallbackOrder:index * 2 + 1,
        type:"pickup",
        passenger:passengerName,
        phone:clean(firstValue(p.clientPhone,p.phone)),
        address:pickup
      });
    }

    if(dropoff){
      stops.push({
        order:dropoffOrder > 0 ? dropoffOrder : null,
        fallbackOrder:index * 2 + 2,
        type:"dropoff",
        passenger:passengerName,
        phone:clean(firstValue(p.clientPhone,p.phone)),
        address:dropoff
      });
    }
  });

  const hasRealOrder = stops.some(
    stop => Number.isFinite(stop.order) && stop.order > 0
  );

  return stops.sort((a,b)=>{
    if(hasRealOrder){
      const ao = a.order || 9999;
      const bo = b.order || 9999;
      if(ao !== bo) return ao - bo;
    }

    return a.fallbackOrder - b.fallbackOrder;
  });
}

function extraLine(label,value){
  if(value === undefined || value === null || clean(value) === ""){
    return "";
  }

  return `
    <div class="extra-block">
      <div class="extra-title">${esc(label)}</div>
      <div class="extra-text">${esc(value)}</div>
    </div>
  `;
}

function buildExtraHtml(t){
  const pieces = [];

  pieces.push(
    extraLine("Service",getServiceTitle(t)),
    extraLine("Trip Number",getTripNo(t)),
    extraLine("Company / Facility",
      firstValue(t.company,t.companyName,t.facilityName,t.providerName)
    ),
    extraLine("Entry Name",
      firstValue(t.entryName,t.bookedByName)
    ),
    extraLine("Entry Phone",
      firstValue(t.entryPhone,t.bookedByPhone)
    ),
    extraLine("Vehicle",
      firstValue(t.vehicle,t.vehicleNumber,t.vehicleType,t.requiredVehicle)
    ),
    extraLine("Escort",
      firstValue(
        t.escort,
        t.hasEscort,
        t.escortRequired,
        t.withEscort,
        t.passengerEscort
      )
    ),
    extraLine("Assignment",t.assignmentType),
    extraLine("Driver Notes",getNotes(t)),
    extraLine("Dispatch Note",getDispatchNote(t))
  );

  if(isShared(t)){
    const passengers = getSharedPassengers(t);

    passengers.forEach((p,index)=>{
      const text = [
        clean(firstValue(p.clientName,p.name,`Passenger ${index + 1}`)),
        firstValue(p.clientPhone,p.phone)
          ? `Phone: ${clean(firstValue(p.clientPhone,p.phone))}`
          : "",
        p.pickup ? `Pickup: ${clean(p.pickup)}` : "",
        p.dropoff ? `Dropoff: ${clean(p.dropoff)}` : ""
      ]
      .filter(Boolean)
      .join("\n");

      pieces.push(
        extraLine(
          `Passenger ${index + 1}`,
          text
        )
      );
    });
  }

  const html = pieces.filter(Boolean).join("");

  return html || `
    <div class="extra-block">
      <div class="extra-title">Additional Information</div>
      <div class="extra-text">No additional information</div>
    </div>
  `;
}

/* Address rows are display-only. Navigation is opened only from Open Trip. */
function navigate(address){
  if(!clean(address)) return;

  window.open(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    "_blank"
  );
}

function openTrip(id){
  location.href = `map.html?tripId=${encodeURIComponent(id)}`;
}

function toggleExtra(id){
  document
    .getElementById(`extra-${id}`)
    ?.classList
    .toggle("open");
}

const mapIcon = () => `
  <svg viewBox="0 0 24 24">
    <path d="M12 22s6-6.2 6-11a6 6 0 1 0-12 0c0 4.8 6 11 6 11zm0-8.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z"/>
  </svg>
`;

const phoneIcon = () => `
  <svg viewBox="0 0 24 24">
    <path d="M6.5 3.5 9 8l-1.7 1.7c.9 2 2.5 3.6 4.5 4.5l1.7-1.7 4.5 2.5c.5.3.7.8.5 1.4l-.7 3c-.1.5-.6.9-1.1.9C9.5 20.3 3.7 14.5 3.7 7.3c0-.5.4-1 .9-1.1l3-.7c.5-.1 1.1.1 1.4.5z"/>
  </svg>
`;

const eyeIcon = () => `
  <svg viewBox="0 0 24 24">
    <path d="M12 5C6.5 5 2.3 9.1 1 12c1.3 2.9 5.5 7 11 7s9.7-4.1 11-7c-1.3-2.9-5.5-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2.1A1.9 1.9 0 1 0 12 10a1.9 1.9 0 0 0 0 3.9z"/>
  </svg>
`;

function normalRoute(t){
  const pickup = getPickup(t);
  const dropoff = getDropoff(t);

  return `
    <div class="route">

      <div class="address-row address-display-only">
        <div class="marker pickup">P</div>

        <div class="address-content">
          <div class="address-label">Pickup</div>
          <div class="address-text">${esc(pickup || "-")}</div>
        </div>
      </div>

      <div class="address-row address-display-only">
        <div class="marker dropoff">D</div>

        <div class="address-content">
          <div class="address-label">Dropoff</div>
          <div class="address-text">${esc(dropoff || "-")}</div>
        </div>
      </div>

    </div>
  `;
}

function sharedRoute(t){
  const stops = sharedStops(t);

  if(!stops.length){
    return `
      <div class="shared-route">
        <div class="shared-head">
          <strong>Shared Route</strong>
          <span>No route stops</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="shared-route">

      <div class="shared-head">
        <strong>Shared Route</strong>
        <span>${stops.length} stops</span>
      </div>

      ${stops.map((stop,index)=>`
        <div class="shared-stop">

          <div class="stop-number">
            ${index + 1}
          </div>

          <div>
            <div class="stop-top">
              <span class="stop-type ${stop.type}">
                ${stop.type === "pickup" ? "PICKUP" : "DROPOFF"}
              </span>

              <span class="stop-name">
                ${esc(stop.passenger)}
              </span>
            </div>

            <div class="stop-address">
              ${esc(stop.address || "-")}
            </div>
          </div>

        </div>
      `).join("")}

    </div>
  `;
}

function card(t){
  const status = getStatus(t);
  const shared = isShared(t);
  const passenger = getPassenger(t);
  const phone = getPhone(t);
  const serviceTitle = getServiceTitle(t);
  const serviceCode = getServiceCode(t);

  const id = clean(t._id || t.id);

  const safeId =
    id.replace(/[^a-zA-Z0-9_-]/g,"") ||
    Math.random().toString(36).slice(2);

  const initials =
    passenger
      .split(/\s+/)
      .filter(Boolean)
      .slice(0,2)
      .map(x => x[0].toUpperCase())
      .join("") ||
    "P";

  return `
    <article class="trip-card ${getClass(status)} ${newTripIds.has(id) ? "trip-new" : ""}">

      <div class="trip-top">
        <div>
          <div class="trip-no">
            TRIP ${esc(getTripNo(t) || "-")}
          </div>

          <div class="trip-time">
            ${formatTime(t)}
          </div>
        </div>

        <div class="service ${shared ? "shared" : ""}">
          ${esc(serviceTitle)}
        </div>
      </div>

      <div class="passenger">

        <div class="avatar">
          ${shared ? "SH" : esc(initials)}
        </div>

        <div class="passenger-data">

          <div class="passenger-name">
            ${shared ? "Shared Trip" : esc(passenger)}
          </div>

          <div class="passenger-sub">
            ${
              shared
                ? "Follow server route order"
                : `${esc(serviceTitle)}${serviceCode ? ` (${esc(serviceCode)})` : ""}`
            }
          </div>

        </div>

        ${
          phone && !shared
            ? `
              <a
                class="phone-btn"
                href="tel:${esc(phone)}"
                aria-label="Call passenger"
              >
                ${phoneIcon()}
              </a>
            `
            : ""
        }

      </div>

      ${shared ? sharedRoute(t) : normalRoute(t)}

      <div class="card-bottom">

        <div class="status-box status-${esc(status)}">
          ${esc(status)}
        </div>

        <button
          class="eye-btn"
          type="button"
          onclick="toggleExtra('${safeId}')"
          aria-label="View trip information"
          title="View details"
        >
          ${eyeIcon()}
        </button>

      </div>

      <div
        class="extra-panel"
        id="extra-${safeId}"
      >
        ${buildExtraHtml(t)}
      </div>

      <button
        class="open-btn"
        type="button"
        onclick='openTrip(${JSON.stringify(id)})'
      >
        Open Trip
      </button>

    </article>
  `;
}

async function loadTrips(){
  try{
    const res = await fetch(
      `/api/driver/my-trips/${encodeURIComponent(driverId)}`
    );

    if(!res.ok){
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    const trips =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.trips)
          ? data.trips
          : [];

    render(trips);

  }catch(err){
    console.error("DRIVER TRIPS LOAD ERROR:",err);

    container.innerHTML = `
      <div class="empty">
        <strong>Error loading trips</strong>
        <br>
        Please try again.
      </div>
    `;

    if(tripCount){
      tripCount.textContent = "0";
    }
  }
}

function render(trips){
  let filtered = trips.filter(t => !isExpired(t));

  filtered.sort((a,b)=>{
    const statusA = getStatus(a);
    const statusB = getStatus(b);

    if(isActive(statusA) && !isActive(statusB)) return -1;
    if(!isActive(statusA) && isActive(statusB)) return 1;

    return getTripDate(a) - getTripDate(b);
  });

  currentVisibleTrips = filtered;

  detectNewTrips(filtered);

  if(tripCount){
    tripCount.textContent = String(filtered.length);
  }

  container.innerHTML =
    filtered.length
      ? filtered.map(card).join("")
      : `
        <div class="empty">
          <strong>No Trips Today</strong>
          <br>
          New dispatched trips will appear automatically.
        </div>
      `;
}

loadTrips();

setInterval(
  loadTrips,
  5000
);