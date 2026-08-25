/*
=========================================================
ADMIN DASHBOARD — DATA CARDS ONLY
NO QUICK ACCESS BUTTONS
HEADER IS NOT MODIFIED

Uses:
GET /api/trips
GET /api/services/admin
GET /api/admin/billing     (SUPER_ADMIN only)

Platform payment card is ready for real tenant subscription data.
It will display values only if a real platform-subscription endpoint
is added later. No fake payment date or amount is generated.
=========================================================
*/

(function(){

"use strict";

const token = localStorage.getItem("token") || "";
const rawRole = String(localStorage.getItem("role") || "")
  .trim()
  .toUpperCase()
  .replace(/[\s-]+/g,"_");

const role =
  rawRole === "SUPERADMIN"
    ? "SUPER_ADMIN"
    : rawRole === "DISPATCHER"
      ? "DISPATCHER"
      : rawRole === "PLATFORM_ADMIN"
        ? "PLATFORM_ADMIN"
        : "ADMIN";

if(!token){
  location.href="/login.html";
  return;
}

if(role === "PLATFORM_ADMIN"){
  location.href="/platform-admin/dashboard.html";
  return;
}

const isSuperAdmin = role === "SUPER_ADMIN";
const tz = () =>
  localStorage.getItem("systemTimezone") ||
  localStorage.getItem("appTimezone") ||
  "America/Phoenix";

const $ = id => document.getElementById(id);

function clean(v){
  return String(v ?? "").trim();
}

function n(v){
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function money(v){
  return "$" + n(v).toLocaleString("en-US",{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
}

function safe(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function normStatus(v){
  return clean(v)
    .toLowerCase()
    .replace(/[_\s-]+/g,"");
}

function isCompleted(v){
  const s=normStatus(v);
  return s==="completed" || s==="complete" || s==="dropoff" || s==="droppedoff";
}

function isCancelled(v){
  return normStatus(v).includes("cancel");
}

function isNoShow(v){
  return normStatus(v).includes("noshow");
}

function isOnTrip(v){
  const s=normStatus(v);
  return [
    "accepted","ontrip","inprogress","arrived","pickup","pickedup"
  ].includes(s);
}

function authHeaders(){
  return {Authorization:"Bearer "+token};
}

async function fetchJson(url){
  const res=await fetch(url,{
    headers:authHeaders(),
    cache:"no-store"
  });

  let data=null;
  try{ data=await res.json(); }catch(_){}

  if(!res.ok){
    throw new Error(data?.message || `Request failed ${res.status}`);
  }

  return data;
}

function dateKey(value){
  if(!value) return "";

  if(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)){
    return value;
  }

  const d=new Date(value);
  if(isNaN(d.getTime())) return "";

  const parts=new Intl.DateTimeFormat("en-CA",{
    timeZone:tz(),
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).formatToParts(d);

  const y=parts.find(x=>x.type==="year")?.value || "";
  const m=parts.find(x=>x.type==="month")?.value || "";
  const day=parts.find(x=>x.type==="day")?.value || "";

  return `${y}-${m}-${day}`;
}

function todayKey(){
  return dateKey(new Date());
}

function monthKey(){
  return todayKey().slice(0,7);
}

function tripDateKey(t){
  const raw=clean(t?.tripDate);
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return dateKey(raw);
}

function bookedDate(t){
  const d=new Date(t?.bookedAt || t?.createdAt || 0);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function isNewTrip(t){
  const d=bookedDate(t);
  return Date.now()-d.getTime() <= 2*60*60*1000;
}

/* =========================
   SHARED GROUPS
========================= */

function isShared(t){
  return (
    t?.isShared === true ||
    clean(t?.tripType).toUpperCase()==="SHARED" ||
    Array.isArray(t?.passengers) && t.passengers.length>0 ||
    clean(t?.tripNumber).toUpperCase().includes("-SH")
  );
}

function groupKey(t){
  return clean(t?.groupId) || clean(t?.tripNumber) || clean(t?._id || t?.id);
}

function buildItems(trips){
  const map=new Map();
  const normal=[];

  trips.forEach(t=>{
    if(isShared(t)){
      const key=groupKey(t);
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(t);
    }else{
      normal.push({kind:"trip",trip:t,key:clean(t?._id || t?.id)});
    }
  });

  const shared=[...map.entries()].map(([key,group])=>({
    kind:"shared",
    key,
    group,
    trip:group[0]
  }));

  return [...normal,...shared];
}

function passengersFor(item){
  if(item.kind!=="shared") return [];

  const first=item.trip || {};

  if(Array.isArray(first.passengers) && first.passengers.length){
    return first.passengers;
  }

  return item.group.map(t=>({
    name:t.clientName || t.name || "",
    status:t.status || "",
    finalPrice:t.finalPrice,
    priceAmount:t.priceAmount,
    cancelFee:t.cancelFee,
    noShowFee:t.noShowFee
  }));
}

function itemStatuses(item){
  if(item.kind==="trip") return [item.trip?.status || ""];

  const p=passengersFor(item);
  if(p.length) return p.map(x=>x.status || item.trip?.status || "");

  return item.group.map(t=>t.status || "");
}

function itemDateKey(item){
  return tripDateKey(item.trip);
}

function itemMiles(item){
  if(item.kind==="trip") return n(item.trip?.miles);

  const first=item.trip || {};
  const routeMiles=n(first.sharedRouteMiles || first.miles);

  if(routeMiles>0) return routeMiles;

  return Math.max(...item.group.map(t=>n(t.miles)),0);
}

function itemSharedPassengers(item){
  if(item.kind!=="shared") return 0;

  const p=passengersFor(item);
  if(p.length) return p.length;

  return Math.max(
    n(item.trip?.totalPassengers),
    item.group.length
  );
}

function itemRevenue(item){
  if(item.kind==="trip"){
    const t=item.trip || {};
    const s=t.status || "";

    if(isCompleted(s)){
      return n(t.finalPrice || t.capturedAmount || t.priceAmount);
    }

    if(isCancelled(s)){
      return n(t.finalPrice || t.cancelFee || 0);
    }

    if(isNoShow(s)){
      return n(t.finalPrice || t.noShowFee || 0);
    }

    return 0;
  }

  const passengers=passengersFor(item);

  if(passengers.length){
    return passengers.reduce((sum,p)=>{
      const s=p.status || "";
      if(isCompleted(s)) return sum+n(p.finalPrice || p.priceAmount);
      if(isCancelled(s)) return sum+n(p.finalPrice || p.cancelFee);
      if(isNoShow(s)) return sum+n(p.finalPrice || p.noShowFee);
      return sum;
    },0);
  }

  return n(item.trip?.finalPrice || item.trip?.priceAmount);
}

/* =========================
   SERVICES
========================= */

function boolFlag(v){
  if(v===true) return true;
  if(v===false || v===null || v===undefined) return false;
  const s=String(v).trim().toLowerCase();
  return ["true","1","yes","on","enabled","enable"].includes(s);
}

function getQuoteEnabled(s){
  return boolFlag(
    s?.getQuoteEnabled ??
    s?.getQuoteDisplay ??
    s?.quoteEnabled ??
    s?.displayInGetQuote ??
    s?.showInGetQuote ??
    s?.getquoteEnabled
  );
}

function reservedEnabled(s){
  return boolFlag(
    s?.reservedEnabled ??
    s?.reservedDisplay ??
    s?.displayInReserved ??
    s?.showInReserved ??
    s?.reservationEnabled
  );
}

function companiesEnabled(s){
  return boolFlag(
    s?.companyEnabled ??
    s?.companiesEnabled ??
    s?.companyEnable ??
    s?.companiesEnable ??
    s?.displayInCompanies ??
    s?.showInCompanies
  );
}

function serviceVisible(s){
  return getQuoteEnabled(s) || reservedEnabled(s) || companiesEnabled(s);
}

function serviceCode(s){
  return clean(
    s?.serviceKey ||
    s?.serviceCode ||
    s?.serviceType ||
    s?.suffix ||
    s?.companySuffix ||
    s?.code
  ).toUpperCase();
}

function serviceName(s){
  return s?.title || s?.serviceName || s?.name || serviceCode(s) || "Service";
}

function tripServiceCode(t){
  const direct=clean(
    t?.serviceKey ||
    t?.serviceCode ||
    t?.serviceType ||
    t?.serviceSuffix ||
    t?.vehicleTypeFromQuote
  ).toUpperCase();

  if(direct) return direct;
  if(isShared(t)) return "SH";
  return "";
}

/* =========================
   TODAY + MONTH
========================= */

function renderTripSummary(trips,services){
  const items=buildItems(trips);
  const today=todayKey();
  const month=monthKey();

  const todayItems=items.filter(i=>itemDateKey(i)===today);
  const monthItems=items.filter(i=>itemDateKey(i).slice(0,7)===month);

  $("todayTrips").textContent=todayItems.length;
  $("newTrips").textContent=items.filter(i=>{
    if(i.kind==="trip") return isNewTrip(i.trip);
    return i.group.some(isNewTrip);
  }).length;

  $("onTripToday").textContent=todayItems.filter(i=>itemStatuses(i).some(isOnTrip)).length;
  $("completedToday").textContent=todayItems.filter(i=>itemStatuses(i).some(isCompleted)).length;
  $("cancelledToday").textContent=todayItems.filter(i=>itemStatuses(i).some(isCancelled)).length;
  $("noShowToday").textContent=todayItems.filter(i=>itemStatuses(i).some(isNoShow)).length;

  $("monthTrips").textContent=monthItems.length;
  $("monthCompleted").textContent=monthItems.filter(i=>itemStatuses(i).some(isCompleted)).length;
  $("monthCancelled").textContent=monthItems.filter(i=>itemStatuses(i).some(isCancelled)).length;
  $("monthNoShow").textContent=monthItems.filter(i=>itemStatuses(i).some(isNoShow)).length;
  $("monthSharedPassengers").textContent=monthItems.reduce((s,i)=>s+itemSharedPassengers(i),0);
  $("monthMiles").textContent=monthItems.reduce((s,i)=>s+itemMiles(i),0).toFixed(1);

  if(isSuperAdmin){
    $("monthRevenue").textContent=money(
      monthItems.reduce((s,i)=>s+itemRevenue(i),0)
    );
  }

  renderServices(items,services,month);
  renderLatest(items);
}

function renderServices(items,services,month){
  const grid=$("serviceGrid");
  const visible=services.filter(serviceVisible);

  if(!visible.length){
    grid.innerHTML='<div class="empty">No active services for this organization</div>';
    return;
  }

  grid.innerHTML=visible.map(s=>{
    const code=serviceCode(s);

    const monthItems=items.filter(i=>{
      if(itemDateKey(i).slice(0,7)!==month) return false;
      return tripServiceCode(i.trip)===code;
    });

    const completed=monthItems.filter(i=>itemStatuses(i).some(isCompleted)).length;
    const cancelled=monthItems.filter(i=>itemStatuses(i).some(isCancelled)).length;
    const noShow=monthItems.filter(i=>itemStatuses(i).some(isNoShow)).length;

    const channels=[];
    if(getQuoteEnabled(s)) channels.push("Get Quote");
    if(reservedEnabled(s)) channels.push("Reserved");
    if(companiesEnabled(s)) channels.push("Companies");

    return `
      <div class="service-card">
        <div class="service-name">${safe(serviceName(s))}</div>
        <div class="service-total">${monthItems.length}</div>
        <div class="service-sub">
          Completed ${completed} · Cancelled ${cancelled} · No Show ${noShow}
          <br>${safe(channels.join(" · "))}
        </div>
      </div>
    `;
  }).join("");
}

function representativeStatus(item){
  const statuses=itemStatuses(item);

  if(statuses.some(isOnTrip)) return "On Trip";
  if(statuses.some(isCompleted)) return "Completed";
  if(statuses.some(isCancelled)) return "Cancelled";
  if(statuses.some(isNoShow)) return "No Show";

  return item.trip?.status || "Scheduled";
}

function renderLatest(items){
  const body=$("latestTripsBody");

  const latest=[...items]
    .sort((a,b)=>bookedDate(b.trip)-bookedDate(a.trip))
    .slice(0,8);

  if(!latest.length){
    body.innerHTML='<tr><td colspan="6">No trips found</td></tr>';
    return;
  }

  body.innerHTML=latest.map(i=>{
    const t=i.trip || {};
    const passenger=i.kind==="shared"
      ? `Shared Group (${itemSharedPassengers(i)})`
      : (t.clientName || t.passengerName || t.company || "--");

    return `
      <tr>
        <td>${safe(t.tripNumber || "--")}</td>
        <td>${safe(tripServiceCode(t) || "--")}</td>
        <td>${safe(passenger)}</td>
        <td>${safe(t.tripDate || "--")}</td>
        <td>${safe(t.tripTime || "--")}</td>
        <td>${safe(representativeStatus(i))}</td>
      </tr>
    `;
  }).join("");
}

/* =========================
   COMPANY BILLING
========================= */

function formatDate(v){
  if(!v) return "--";
  const d=new Date(v);
  if(isNaN(d.getTime())) return "--";
  return d.toLocaleDateString("en-US",{
    timeZone:tz(),
    month:"short",
    day:"numeric",
    year:"numeric"
  });
}

function renderBilling(companies){
  if(!isSuperAdmin) return;

  $("billingCompanies").textContent=companies.length;

  const invoiceTotal=companies.reduce((s,c)=>s+n(c.invoiceAmount),0);
  $("billingInvoice").textContent=money(invoiceTotal);

  const due=companies
    .filter(c=>c.nextBillingDate)
    .map(c=>new Date(c.nextBillingDate))
    .filter(d=>!isNaN(d.getTime()))
    .sort((a,b)=>a-b);

  $("nextCompanyPayment").textContent=due.length ? formatDate(due[0]) : "--";

  const pastDue=companies.filter(c=>{
    const s=clean(c.billingStatus).toUpperCase();
    return s==="PAST_DUE" || s==="SUSPENDED" || c.billingLocked===true;
  }).length;

  $("billingPastDue").textContent=pastDue;

  const rows=$("companyDueRows");

  if(!companies.length){
    rows.innerHTML='<div class="empty">No contracted companies</div>';
    return;
  }

  rows.innerHTML=companies
    .slice()
    .sort((a,b)=>{
      const da=new Date(a.nextBillingDate || "2999-12-31");
      const db=new Date(b.nextBillingDate || "2999-12-31");
      return da-db;
    })
    .map(c=>`
      <div class="due-row">
        <div><strong>${safe(c.name || c.companyName || "--")}</strong></div>
        <div>${money(c.invoiceAmount || 0)}</div>
        <div>${safe(c.billingCycle || "MONTHLY")}</div>
        <div>${safe(formatDate(c.nextBillingDate))}</div>
      </div>
    `)
    .join("");
}

/* =========================
   PLATFORM PAYMENT
   No fake data.
========================= */

function renderPlatformPlaceholder(){
  if(!isSuperAdmin) return;

  $("platformStatus").textContent="NOT CONFIGURED";
  $("platformPlan").textContent="--";
  $("platformAmount").textContent="--";
  $("platformNextPayment").textContent="--";
}

/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded",async()=>{

  if(isSuperAdmin){
    document.querySelectorAll(".finance-only").forEach(el=>{
      el.style.display="";
    });

    $("dashboardSubtitle").textContent=
      "Operations, monthly revenue, company billing and platform payment overview";
  }else if(role==="DISPATCHER"){
    $("dashboardSubtitle").textContent=
      "Trip and dispatch operations overview";
  }else{
    $("dashboardSubtitle").textContent=
      "Operations and administration overview";
  }

  const now=new Date();
  $("monthLabel").textContent=now.toLocaleDateString("en-US",{
    timeZone:tz(),
    month:"long",
    year:"numeric"
  });

  renderPlatformPlaceholder();

  let trips=[];
  let services=[];
  let companies=[];

  try{
    const data=await fetchJson("/api/trips");
    trips=Array.isArray(data) ? data : (data?.trips || []);
  }catch(err){
    console.log("DASHBOARD TRIPS:",err);
  }

  try{
    const data=await fetchJson("/api/services/admin");
    services=Array.isArray(data)
      ? data
      : Array.isArray(data?.services)
        ? data.services
        : [];
  }catch(err){
    console.log("DASHBOARD SERVICES:",err);
  }

  renderTripSummary(trips,services);

  if(isSuperAdmin){
    try{
      const data=await fetchJson("/api/admin/billing");
      companies=Array.isArray(data) ? data : [];
    }catch(err){
      console.log("DASHBOARD BILLING:",err);
    }

    renderBilling(companies);
  }
});

})();