console.log("driver trips FINAL PROFESSIONAL");

const user = JSON.parse(localStorage.getItem("loggedDriver")) || JSON.parse(localStorage.getItem("user"));
if(!user){ location.href="../login.html"; }

const driverId = user?._id || user?.id;
const container = document.getElementById("container");
const tripCount = document.getElementById("tripCount");

function clean(v){ return String(v ?? "").trim(); }
function firstValue(...v){ for(const x of v){ if(x!==undefined && x!==null && clean(x)!=="") return x; } return ""; }
function esc(v){ return clean(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

function getNow(){ return new Date(new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})); }
function getTripDate(t){ return new Date(`${firstValue(t.tripDate,t.date,t.serviceDate)}T${firstValue(t.tripTime,t.time,t.pickupTime,t.scheduledTime)}`); }
function isExpired(t){ const d=getTripDate(t); if(isNaN(d)) return false; return (getNow()-d)/(1000*60*60)>=6; }

function formatTime(t){
  const raw=clean(firstValue(t.tripTime,t.time,t.pickupTime,t.scheduledTime));
  const m=raw.match(/^(\d{1,2}):(\d{2})/);
  if(!m) return esc(raw||"--:--");
  let h=Number(m[1]); const ap=h>=12?"PM":"AM"; h=h%12||12; return `${h}:${m[2]} ${ap}`;
}

function getStatus(t){
  const s=clean(firstValue(t.dispatchStatus,t.status,"Scheduled"));
  if(s==="NoShow") return "NoShow";
  if(s==="InProgress"||s==="ON_TRIP") return "OnTrip";
  if(["Scheduled","ASSIGNED","SENT","ACCEPTED"].includes(s)) return "Dispatched";
  if(s==="COMPLETED") return "Completed";
  if(s==="CANCELLED") return "Cancelled";
  return s||"Dispatched";
}
function isActive(s){ return s==="OnTrip"||s==="Arrived"; }
function getClass(s){ if(s==="Completed")return"trip-completed"; if(s==="Cancelled")return"trip-cancelled"; if(s==="NoShow")return"trip-noshow"; if(isActive(s))return"trip-active"; return""; }

const getPassenger=t=>clean(firstValue(t.clientName,t.passengerName,t.memberName,t.patientName,t.riderName,t.name,"Passenger"));
const getPhone=t=>clean(firstValue(t.clientPhone,t.passengerPhone,t.memberPhone,t.phone));
const getPickup=t=>clean(firstValue(t.pickupAddress,t.pickup,t.fromAddress,t.originAddress,t.origin));
const getDropoff=t=>clean(firstValue(t.dropoffAddress,t.dropoff,t.toAddress,t.destinationAddress,t.destination));
const getService=t=>clean(firstValue(t.serviceCode,t.serviceType,t.serviceName,t.service,"Trip"));
const getTripNo=t=>clean(firstValue(t.tripNumber,t.tripNo,t.reservationNumber,t.confirmationNumber,t._id,t.id));
const getNotes=t=>clean(firstValue(t.driverNotes,t.notes,t.tripNotes,t.note));

function getExtra(t){
  const a=[];
  const facility=firstValue(t.companyName,t.facilityName,t.providerName);
  const mobility=firstValue(t.mobility,t.mobilityType,t.ambulatoryType);
  const vehicle=firstValue(t.vehicleType,t.requiredVehicle,t.vehicleRequirement);
  const riders=firstValue(t.passengerCount,t.escortCount,t.companions);
  if(clean(facility)) a.push(`Company / Facility: ${clean(facility)}`);
  if(clean(mobility)) a.push(`Mobility: ${clean(mobility)}`);
  if(clean(vehicle)) a.push(`Vehicle: ${clean(vehicle)}`);
  if(clean(riders)) a.push(`Passengers / Escorts: ${clean(riders)}`);
  return a.join("\n");
}

function isShared(t){
  const s=getService(t).toUpperCase();
  return t.shared===true||t.isShared===true||s==="SH"||s==="SHARED"||s.includes("SHARED")||Array.isArray(t.sharedStops)||Array.isArray(t.routeStops)||Array.isArray(t.stops);
}

function sharedStops(t){
  const src=Array.isArray(t.sharedStops)?t.sharedStops:Array.isArray(t.routeStops)?t.routeStops:Array.isArray(t.stops)?t.stops:[];
  return src.map((x,i)=>{
    const raw=clean(firstValue(x.type,x.stopType,x.action,x.kind)).toLowerCase();
    const type=(raw.includes("pickup")||raw==="pu")?"pickup":"dropoff";
    return {
      order:Number(firstValue(x.order,x.routeOrder,x.sequence,x.index,i+1))||i+1,
      type,
      passenger:clean(firstValue(x.clientName,x.passengerName,x.memberName,x.patientName,x.name,"Passenger")),
      address:clean(firstValue(x.address,x.fullAddress,type==="pickup"?x.pickupAddress:x.dropoffAddress))
    };
  }).sort((a,b)=>a.order-b.order);
}

function navigate(address){
  if(!clean(address)) return;
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,"_blank");
}
function openTrip(id){ location.href=`map.html?tripId=${encodeURIComponent(id)}`; }
function toggleExtra(id){ document.getElementById(`extra-${id}`)?.classList.toggle("open"); }

const mapIcon=()=>`<svg viewBox="0 0 24 24"><path d="M12 22s6-6.2 6-11a6 6 0 1 0-12 0c0 4.8 6 11 6 11zm0-8.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z"/></svg>`;
const phoneIcon=()=>`<svg viewBox="0 0 24 24"><path d="M6.5 3.5 9 8l-1.7 1.7c.9 2 2.5 3.6 4.5 4.5l1.7-1.7 4.5 2.5c.5.3.7.8.5 1.4l-.7 3c-.1.5-.6.9-1.1.9C9.5 20.3 3.7 14.5 3.7 7.3c0-.5.4-1 .9-1.1l3-.7c.5-.1 1.1.1 1.4.5z"/></svg>`;
const eyeIcon=()=>`<svg viewBox="0 0 24 24"><path d="M12 5C6.5 5 2.3 9.1 1 12c1.3 2.9 5.5 7 11 7s9.7-4.1 11-7c-1.3-2.9-5.5-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2.1A1.9 1.9 0 1 0 12 10a1.9 1.9 0 0 0 0 3.9z"/></svg>`;

function normalRoute(t){
  const p=getPickup(t),d=getDropoff(t);
  return `<div class="route">
    <div class="address-row"><div class="marker pickup">P</div><div><div class="address-label">Pickup</div><div class="address-text">${esc(p||"-")}</div></div><button class="map-btn" onclick='navigate(${JSON.stringify(p)})'>${mapIcon()}</button></div>
    <div class="address-row"><div class="marker dropoff">D</div><div><div class="address-label">Dropoff</div><div class="address-text">${esc(d||"-")}</div></div><button class="map-btn" onclick='navigate(${JSON.stringify(d)})'>${mapIcon()}</button></div>
  </div>`;
}

function sharedRoute(t){
  const stops=sharedStops(t);
  if(!stops.length) return normalRoute(t);
  return `<div class="shared-route"><div class="shared-head"><strong>Shared Route</strong><span>${stops.length} stops</span></div>${stops.map((s,i)=>`
    <div class="shared-stop"><div class="stop-number">${i+1}</div><div><div class="stop-top"><span class="stop-type ${s.type}">${s.type==="pickup"?"PICKUP":"DROPOFF"}</span><span class="stop-name">${esc(s.passenger)}</span></div><div class="stop-address">${esc(s.address||"-")}</div></div></div>`).join("")}</div>`;
}

function card(t){
  const status=getStatus(t), shared=isShared(t), passenger=getPassenger(t), phone=getPhone(t), service=getService(t), notes=getNotes(t), extra=getExtra(t);
  const id=clean(t._id||t.id), safe=(id.replace(/[^a-zA-Z0-9_-]/g,"")||Math.random().toString(36).slice(2));
  const initials=passenger.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join("")||"P";
  const hasExtra=Boolean(notes||extra);

  return `<article class="trip-card ${getClass(status)}">
    <div class="trip-top"><div><div class="trip-no">TRIP ${esc(getTripNo(t)||"-")}</div><div class="trip-time">${formatTime(t)}</div></div><div class="service ${shared?"shared":""}">${shared?"SHARED":esc(service)}</div></div>
    <div class="passenger"><div class="avatar">${shared?"SH":esc(initials)}</div><div class="passenger-data"><div class="passenger-name">${shared?"Shared Trip":esc(passenger)}</div><div class="passenger-sub">${shared?"Follow server route order":esc(service)}</div></div>${phone&&!shared?`<a class="phone-btn" href="tel:${esc(phone)}">${phoneIcon()}</a>`:""}</div>
    ${shared?sharedRoute(t):normalRoute(t)}
    <div class="card-bottom"><div class="status-box status-${esc(status)}">${esc(status)}</div>${hasExtra?`<button class="eye-btn" onclick="toggleExtra('${safe}')">${eyeIcon()}</button>`:""}</div>
    ${hasExtra?`<div class="extra-panel" id="extra-${safe}">${notes?`<div class="extra-block"><div class="extra-title">Driver Notes</div><div class="extra-text">${esc(notes)}</div></div>`:""}${extra?`<div class="extra-block"><div class="extra-title">Additional Information</div><div class="extra-text">${esc(extra)}</div></div>`:""}</div>`:""}
    <button class="open-btn" onclick='openTrip(${JSON.stringify(id)})'>Open Trip</button>
  </article>`;
}

async function loadTrips(){
  try{
    const res=await fetch(`/api/driver/my-trips/${encodeURIComponent(driverId)}`);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    render(Array.isArray(data)?data:Array.isArray(data.trips)?data.trips:[]);
  }catch(e){
    console.error(e);
    container.innerHTML=`<div class="empty"><strong>Error loading trips</strong><br>Please try again.</div>`;
    tripCount.textContent="0";
  }
}

function render(trips){
  let filtered=trips.filter(t=>!isExpired(t));
  filtered.sort((a,b)=>{
    const A=getStatus(a),B=getStatus(b);
    if(isActive(A)&&!isActive(B)) return -1;
    if(!isActive(A)&&isActive(B)) return 1;
    return getTripDate(a)-getTripDate(b);
  });
  tripCount.textContent=String(filtered.length);
  container.innerHTML=filtered.length?filtered.map(card).join(""):`<div class="empty"><strong>No Trips Today</strong><br>New dispatched trips will appear automatically.</div>`;
}

loadTrips();
setInterval(loadTrips,5000);