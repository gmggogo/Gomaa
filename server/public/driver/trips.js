console.log("driver trips ONE BY ONE");

const user =
  JSON.parse(localStorage.getItem("loggedDriver")) ||
  JSON.parse(localStorage.getItem("user"));

if(!user){
  location.href = "../login.html";
}

const driverId = user?._id || user?.id;

const container =
  document.getElementById("container");

const todayTripCount =
  document.getElementById("todayTripCount");

const completedTripCount =
  document.getElementById("completedTripCount");

const noShowTripCount =
  document.getElementById("noShowTripCount");

const cancelledTripCount =
  document.getElementById("cancelledTripCount");

const tripAlert =
  document.getElementById("tripAlert");

const tripAlertText =
  document.getElementById("tripAlertText");

const todayDate =
  document.getElementById("todayDate");

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function firstValue(...values){
  for(const value of values){
    if(
      value !== undefined &&
      value !== null &&
      clean(value) !== ""
    ){
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

/* =========================
   PHOENIX DATE / TIME
========================= */

function getPhoenixDateKey(){

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:"America/Phoenix",
        year:"numeric",
        month:"2-digit",
        day:"2-digit"
      }
    )
    .formatToParts(
      new Date()
    );

  const y =
    parts.find(p=>p.type==="year")?.value;

  const m =
    parts.find(p=>p.type==="month")?.value;

  const d =
    parts.find(p=>p.type==="day")?.value;

  return `${y}-${m}-${d}`;
}

function getNow(){

  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone:"America/Phoenix"
      }
    )
  );
}

function getTripDate(t){

  const date =
    firstValue(
      t.tripDate,
      t.date,
      t.serviceDate
    );

  const time =
    firstValue(
      t.tripTime,
      t.time,
      t.pickupTime,
      t.scheduledTime,
      "00:00"
    );

  return new Date(
    `${date}T${time}`
  );
}

function isExpired(t){

  const date =
    getTripDate(t);

  if(isNaN(date)){
    return false;
  }

  return (
    (getNow() - date) /
    (1000 * 60 * 60)
  ) >= 6;
}

function isTodayTrip(t){

  return clean(t.tripDate) ===
    getPhoenixDateKey();
}

function formatTime(t){

  const raw =
    clean(
      firstValue(
        t.tripTime,
        t.time,
        t.pickupTime,
        t.scheduledTime
      )
    );

  const m =
    raw.match(
      /^(\d{1,2}):(\d{2})/
    );

  if(!m){
    return esc(raw || "--:--");
  }

  let h =
    Number(m[1]);

  const ap =
    h >= 12
      ? "PM"
      : "AM";

  h =
    h % 12 ||
    12;

  return `${h}:${m[2]} ${ap}`;
}

function formatTripDate(t){
  const raw = clean(firstValue(t.tripDate,t.date,t.serviceDate));
  if(!raw) return "-";
  const d = new Date(`${raw}T12:00:00`);
  if(isNaN(d)) return raw;
  return new Intl.DateTimeFormat("en-US",{
    month:"short",
    day:"numeric",
    year:"numeric"
  }).format(d);
}

function updateTodayLabel(){

  if(!todayDate){
    return;
  }

  todayDate.textContent =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:"America/Phoenix",
        month:"short",
        day:"numeric"
      }
    )
    .format(
      new Date()
    );
}

/* =========================
   STATUS
========================= */

function rawStatus(t){

  return clean(
    firstValue(
      t.dispatchStatus,
      t.status,
      "Scheduled"
    )
  )
  .toUpperCase()
  .replace(/[\s_-]+/g,"");
}

function getStatus(t){

  const s =
    rawStatus(t);

  if(s === "NOSHOW"){
    return "NoShow";
  }

  if(
    s === "INPROGRESS" ||
    s === "ONTRIP"
  ){
    return "OnTrip";
  }

  if(s === "ARRIVED"){
    return "Arrived";
  }

  if(
    s === "SCHEDULED" ||
    s === "ASSIGNED" ||
    s === "SENT" ||
    s === "ACCEPTED"
  ){
    return "Dispatched";
  }

  if(s === "COMPLETED"){
    return "Completed";
  }

  if(
    s === "CANCELLED" ||
    s === "CANCELED"
  ){
    return "Cancelled";
  }

  if(s === "NOTCOMPLETED"){
    return "NotCompleted";
  }

  return clean(
    firstValue(
      t.dispatchStatus,
      t.status,
      "Dispatched"
    )
  );
}

function isClosedTrip(t){

  const s =
    rawStatus(t);

  return (
    s === "COMPLETED" ||
    s === "CANCELLED" ||
    s === "CANCELED" ||
    s === "NOSHOW" ||
    s === "NOTCOMPLETED"
  );
}

function isCompletedTrip(t){
  return rawStatus(t) === "COMPLETED";
}

function isNoShowTrip(t){
  return rawStatus(t) === "NOSHOW";
}

function isCancelledTrip(t){
  const s = rawStatus(t);
  return s === "CANCELLED" || s === "CANCELED";
}

function isActive(status){

  return (
    status === "OnTrip" ||
    status === "Arrived"
  );
}

function getClass(status){

  if(status === "Completed"){
    return "trip-completed";
  }

  if(status === "Cancelled"){
    return "trip-cancelled";
  }

  if(status === "NoShow"){
    return "trip-noshow";
  }

  if(isActive(status)){
    return "trip-active";
  }

  return "";
}

/* =========================
   SERVICE
   Shared ONLY when actual service = SH
========================= */

function normalizeServiceCode(v){

  const raw =
    clean(v)
      .toUpperCase()
      .replace(/[_\s-]+/g,"");

  if(["WH","WC","WHEELCHAIR"].includes(raw)){
    return "WH";
  }

  if(["SH","SHARED"].includes(raw)){
    return "SH";
  }

  if(["ST","STANDARD","X"].includes(raw)){
    return "ST";
  }

  if(["LM","LIMO","LIMOUSINE"].includes(raw)){
    return "LM";
  }

  if(["TX","TAXI"].includes(raw)){
    return "TX";
  }

  if(raw === "XL"){
    return "XL";
  }

  return raw;
}

function getServiceCode(t){

  const direct =
    firstValue(
      t.serviceCode,
      t.serviceKey,
      t.serviceType,
      t.vehicleTypeFromQuote,
      t.serviceName,
      t.service
    );

  const normalized =
    normalizeServiceCode(
      direct
    );

  if(normalized){
    return normalized;
  }

  const tripNo =
    clean(
      firstValue(
        t.tripNumber,
        t.tripNo
      )
    )
    .toUpperCase();

  const match =
    tripNo.match(
      /-(WH|WC|SH|ST|LM|TX|XL)$/
    );

  if(match){
    return normalizeServiceCode(
      match[1]
    );
  }

  const tripType =
    normalizeServiceCode(
      t.tripType
    );

  if(tripType === "SH"){
    return "SH";
  }

  return "";
}

function getServiceTitle(t){

  const code =
    getServiceCode(t);

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

/* =========================
   TRIP DATA
========================= */

const getPassenger =
  t => clean(
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

const getPhone =
  t => clean(
    firstValue(
      t.clientPhone,
      t.passengerPhone,
      t.memberPhone,
      t.phone
    )
  );

const getPickup =
  t => clean(
    firstValue(
      t.pickupAddress,
      t.pickup,
      t.fromAddress,
      t.originAddress,
      t.origin
    )
  );

const getDropoff =
  t => clean(
    firstValue(
      t.dropoffAddress,
      t.dropoff,
      t.toAddress,
      t.destinationAddress,
      t.destination
    )
  );

const getTripNo =
  t => clean(
    firstValue(
      t.tripNumber,
      t.tripNo,
      t.reservationNumber,
      t.confirmationNumber,
      t._id,
      t.id
    )
  );

const getNotes =
  t => clean(
    firstValue(
      t.driverNotes,
      t.notes,
      t.tripNotes,
      t.note
    )
  );

const getDispatchNote =
  t => clean(
    firstValue(
      t.dispatchNote,
      t.assignmentNote
    )
  );

function getVisibleNote(t){
  return clean(
    firstValue(
      t.dispatchNote,
      t.assignmentNote,
      t.driverNotes,
      t.notes,
      t.tripNotes,
      t.note,
      "No notes"
    )
  );
}


/* =========================
   SHARED
========================= */

function getSharedPassengers(t){

  return Array.isArray(t.passengers)
    ? t.passengers
    : [];
}

function sharedStops(t){

  const passengers =
    getSharedPassengers(t);

  const stops = [];

  passengers.forEach((p,index)=>{

    const passengerName =
      clean(
        firstValue(
          p.clientName,
          p.name,
          `Passenger ${index + 1}`
        )
      );

    const pickupOrder =
      Number(
        p.pickupOrder || 0
      );

    const dropoffOrder =
      Number(
        p.dropoffOrder || 0
      );

    if(clean(p.pickup)){

      stops.push({
        order:
          pickupOrder > 0
            ? pickupOrder
            : null,

        fallback:
          index * 2 + 1,

        type:"pickup",

        passenger:
          passengerName,

        address:
          clean(p.pickup)
      });
    }

    if(clean(p.dropoff)){

      stops.push({
        order:
          dropoffOrder > 0
            ? dropoffOrder
            : null,

        fallback:
          index * 2 + 2,

        type:"dropoff",

        passenger:
          passengerName,

        address:
          clean(p.dropoff)
      });
    }

  });

  const hasRealOrder =
    stops.some(
      s =>
        Number.isFinite(s.order) &&
        s.order > 0
    );

  return stops.sort((a,b)=>{

    if(hasRealOrder){

      const ao =
        a.order || 9999;

      const bo =
        b.order || 9999;

      if(ao !== bo){
        return ao - bo;
      }
    }

    return a.fallback - b.fallback;
  });
}

/* =========================
   EYE DETAILS
========================= */

function extraLine(label,value){

  if(
    value === undefined ||
    value === null ||
    clean(value) === ""
  ){
    return "";
  }

  return `
    <div class="extra-block">
      <div class="extra-title">
        ${esc(label)}
      </div>

      <div class="extra-text">
        ${esc(value)}
      </div>
    </div>
  `;
}

function buildExtraHtml(t){

  const pieces = [];

  pieces.push(
    extraLine(
      "Service",
      getServiceTitle(t)
    ),

    extraLine(
      "Trip Number",
      getTripNo(t)
    ),

    extraLine(
      "Company / Facility",
      firstValue(
        t.company,
        t.companyName,
        t.facilityName,
        t.providerName
      )
    ),

    extraLine(
      "Entry Name",
      firstValue(
        t.entryName,
        t.bookedByName
      )
    ),

    extraLine(
      "Entry Phone",
      firstValue(
        t.entryPhone,
        t.bookedByPhone
      )
    ),

    extraLine(
      "Vehicle",
      firstValue(
        t.vehicle,
        t.vehicleNumber,
        t.vehicleType,
        t.requiredVehicle
      )
    ),

    extraLine(
      "Escort",
      firstValue(
        t.escort,
        t.hasEscort,
        t.escortRequired,
        t.withEscort,
        t.passengerEscort
      )
    ),

    extraLine(
      "Assignment",
      t.assignmentType
    ),

    extraLine(
      "Driver Notes",
      getNotes(t)
    ),

    extraLine(
      "Dispatch Note",
      getDispatchNote(t)
    )
  );

  if(isShared(t)){

    getSharedPassengers(t)
      .forEach((p,index)=>{

        const text =
          [
            clean(
              firstValue(
                p.clientName,
                p.name,
                `Passenger ${index + 1}`
              )
            ),

            firstValue(
              p.clientPhone,
              p.phone
            )
              ? `Phone: ${clean(firstValue(p.clientPhone,p.phone))}`
              : "",

            p.pickup
              ? `Pickup: ${clean(p.pickup)}`
              : "",

            p.dropoff
              ? `Dropoff: ${clean(p.dropoff)}`
              : ""
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

  const result =
    pieces
      .filter(Boolean)
      .join("");

  return result || `
    <div class="extra-block">
      <div class="extra-title">
        Additional Information
      </div>

      <div class="extra-text">
        No additional information
      </div>
    </div>
  `;
}

/* =========================
   ACTIONS
========================= */

function openTrip(id){

  location.href =
    `map.html?tripId=${encodeURIComponent(id)}`;
}

function toggleExtra(id){

  document
    .getElementById(
      `extra-${id}`
    )
    ?.classList
    .toggle("open");
}

/* =========================
   ICONS
========================= */

const phoneIcon =
  () => `
    <svg viewBox="0 0 24 24">
      <path d="M6.5 3.5 9 8l-1.7 1.7c.9 2 2.5 3.6 4.5 4.5l1.7-1.7 4.5 2.5c.5.3.7.8.5 1.4l-.7 3c-.1.5-.6.9-1.1.9C9.5 20.3 3.7 14.5 3.7 7.3c0-.5.4-1 .9-1.1l3-.7c.5-.1 1.1.1 1.4.5z"/>
    </svg>
  `;

const eyeIcon =
  () => `
    <svg viewBox="0 0 24 24">
      <path d="M12 5C6.5 5 2.3 9.1 1 12c1.3 2.9 5.5 7 11 7s9.7-4.1 11-7c-1.3-2.9-5.5-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2.1A1.9 1.9 0 1 0 12 10a1.9 1.9 0 0 0 0 3.9z"/>
    </svg>
  `;

/* =========================
   ROUTE VIEW
   ADDRESS IS DISPLAY ONLY
========================= */

function normalRoute(t){

  return `
    <div class="route">

      <div class="address-row">
        <div class="marker pickup">P</div>

        <div>
          <div class="address-label">
            Pickup
          </div>

          <div class="address-text">
            ${esc(getPickup(t) || "-")}
          </div>
        </div>
      </div>

      <div class="address-row">
        <div class="marker dropoff">D</div>

        <div>
          <div class="address-label">
            Dropoff
          </div>

          <div class="address-text">
            ${esc(getDropoff(t) || "-")}
          </div>
        </div>
      </div>

    </div>
  `;
}

function sharedRoute(t){

  const stops =
    sharedStops(t);

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

      ${
        stops
          .map((stop,index)=>`

            <div class="shared-stop">

              <div class="stop-number">
                ${index + 1}
              </div>

              <div>

                <div class="stop-top">

                  <span class="stop-type ${stop.type}">
                    ${
                      stop.type === "pickup"
                        ? "PICKUP"
                        : "DROPOFF"
                    }
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

          `)
          .join("")
      }

    </div>
  `;
}

/* =========================
   CURRENT TRIP CARD
========================= */

function card(t){

  const status = getStatus(t);
  const shared = isShared(t);
  const passenger = getPassenger(t);
  const serviceTitle = getServiceTitle(t);
  const serviceCode = getServiceCode(t);
  const noteText = getVisibleNote(t);

  const id = clean(t._id || t.id);

  const safeId =
    id.replace(/[^a-zA-Z0-9_-]/g,"") ||
    Math.random().toString(36).slice(2);

  const initials =
    passenger
      .split(/\s+/)
      .filter(Boolean)
      .slice(0,2)
      .map(x=>x[0].toUpperCase())
      .join("") || "P";

  const stops = shared ? sharedStops(t) : [];

  const passengerCount =
    shared
      ? Math.max(
          getSharedPassengers(t).length,
          Math.ceil(stops.length / 2)
        )
      : 1;

  const firstPickup =
    shared
      ? (
          stops.find(s=>s.type === "pickup")?.address ||
          getPickup(t) ||
          "-"
        )
      : (getPickup(t) || "-");

  const lastDropoff =
    shared
      ? (
          [...stops].reverse().find(s=>s.type === "dropoff")?.address ||
          getDropoff(t) ||
          "-"
        )
      : (getDropoff(t) || "-");

  return `
    <article class="trip-card ${getClass(status)}">

      <div class="trip-meta-grid">

        <div class="trip-meta-box">
          <div class="trip-meta-label">Time</div>
          <div class="trip-meta-value">${formatTime(t)}</div>
        </div>

        <div class="trip-meta-box">
          <div class="trip-meta-label">Date</div>
          <div class="trip-meta-value">${esc(formatTripDate(t))}</div>
        </div>

        <div class="trip-meta-box">
          <div class="trip-meta-label">Trip #</div>
          <div class="trip-meta-value">${esc(getTripNo(t) || "-")}</div>
        </div>

      </div>

      <div class="current-status-row">
        <div class="current-status-pill status-${esc(status)}">
          ${esc(status)}
        </div>
      </div>

      <div class="trip-summary-row">

        <div class="avatar">
          ${shared ? "SH" : esc(initials)}
        </div>

        <div class="passenger-data">

          <div class="passenger-name">
            ${shared ? "Shared Trip" : esc(serviceTitle)}
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
          shared
            ? `
              <div class="shared-count">
                <strong>${passengerCount}</strong>
                <span>Passengers</span>
                <small>${stops.length} Stops</small>
              </div>
            `
            : ""
        }

      </div>

      <div class="compact-route">

        <div class="compact-route-row">

          <div class="route-pin pickup"></div>

          <div class="compact-route-data">

            <div class="compact-route-label">
              Pickup
              ${shared ? `<span>(1st Stop)</span>` : ""}
            </div>

            <div class="compact-route-address">
              ${esc(firstPickup)}
            </div>

          </div>

        </div>

        <div class="compact-route-row">

          <div class="route-pin dropoff"></div>

          <div class="compact-route-data">

            <div class="compact-route-label">
              Dropoff
              ${shared ? `<span>(Last Stop)</span>` : ""}
            </div>

            <div class="compact-route-address">
              ${esc(lastDropoff)}
            </div>

          </div>

        </div>

      </div>

      <div class="note-box">

        <div class="note-box-label">
          Note
        </div>

        <div class="note-box-text">
          ${esc(noteText)}
        </div>

      </div>

      <div class="details-row">

        <button
          class="eye-btn"
          type="button"
          onclick="toggleExtra('${safeId}')"
          aria-label="View all trip information"
          title="View all trip information"
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
        class="notification-btn"
        type="button"
        onclick='openTrip(${JSON.stringify(id)})'
      >
        Go To Notification
      </button>

    </article>
  `;
}

/* =========================
   HEADER COUNTERS
========================= */

function updateHeader(
  todayTrips,
  completedTrips,
  noShowTrips,
  cancelledTrips,
  remainingTrips,
  currentTrip
){

  if(todayTripCount){
    todayTripCount.textContent = String(todayTrips.length);
  }

  if(completedTripCount){
    completedTripCount.textContent = String(completedTrips.length);
  }

  if(noShowTripCount){
    noShowTripCount.textContent = String(noShowTrips.length);
  }

  if(cancelledTripCount){
    cancelledTripCount.textContent = String(cancelledTrips.length);
  }

  if(currentTrip && remainingTrips.length){

    tripAlert?.classList.remove("done");

    if(tripAlertText){
      tripAlertText.textContent =
        remainingTrips.length > 1
          ? "YOU HAVE A TRIP"
          : "YOU HAVE YOUR LAST TRIP";
    }

  }else{

    tripAlert?.classList.add("done");

    if(tripAlertText){
      tripAlertText.textContent =
        todayTrips.length
          ? "NO MORE ACTIVE TRIPS"
          : "NO TRIPS TODAY";
    }

  }

}

/* =========================
   RENDER ONE TRIP ONLY
========================= */

function render(trips){

  const todayTrips =
    trips
      .filter(isTodayTrip)
      .filter(
        t =>
          !isExpired(t) ||
          isClosedTrip(t)
      )
      .sort(
        (a,b)=>
          getTripDate(a) -
          getTripDate(b)
      );

  const completedTrips =
    todayTrips.filter(
      isCompletedTrip
    );

  const noShowTrips =
    todayTrips.filter(isNoShowTrip);

  const cancelledTrips =
    todayTrips.filter(isCancelledTrip);

  const remainingTrips =
    todayTrips
      .filter(t=>!isClosedTrip(t))
      .sort((a,b)=>getTripDate(a)-getTripDate(b));

  /*
    The driver sees ONE trip only.
    All future trips stay hidden.
    Dispatcher can change them before their turn.
  */
  const currentTrip =
    remainingTrips[0] ||
    null;

  updateHeader(
    todayTrips,
    completedTrips,
    noShowTrips,
    cancelledTrips,
    remainingTrips,
    currentTrip
  );

  if(currentTrip){

    container.innerHTML =
      card(currentTrip);

    return;
  }

  container.innerHTML = `
    <div class="empty">

      <strong>
        ${
          todayTrips.length
            ? "All Trips Completed"
            : "No Trips Today"
        }
      </strong>

      <br>

      ${
        todayTrips.length
          ? "There are no more trips waiting for you."
          : "New dispatched trips will appear here automatically."
      }

    </div>
  `;
}

/* =========================
   LOAD
========================= */

async function loadTrips(){

  try{

    const res =
      await fetch(
        `/api/driver/my-trips/${encodeURIComponent(driverId)}`
      );

    if(!res.ok){

      throw new Error(
        `HTTP ${res.status}`
      );
    }

    const data =
      await res.json();

    const trips =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.trips)
          ? data.trips
          : [];

    render(trips);

  }catch(err){

    console.error(
      "DRIVER TRIPS LOAD ERROR:",
      err
    );

    if(todayTripCount){
      todayTripCount.textContent = "0";
    }

    if(completedTripCount){
      completedTripCount.textContent = "0";
    }

    if(noShowTripCount){
      noShowTripCount.textContent = "0";
    }

    if(cancelledTripCount){
      cancelledTripCount.textContent = "0";
    }

    tripAlert
      ?.classList
      .add("done");

    if(tripAlertText){
      tripAlertText.textContent =
        "TRIPS CONNECTION ERROR";
    }

    container.innerHTML = `
      <div class="empty">
        <strong>Error loading trips</strong>
        <br>
        Please try again.
      </div>
    `;
  }
}

/* =========================
   START
========================= */

updateTodayLabel();

loadTrips();

setInterval(
  loadTrips,
  5000
);