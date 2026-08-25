/*
=========================================================
ADMIN DASHBOARD — PROFESSIONAL DATA CARDS
- NO quick-access button section
- HEADER APPEARANCE IS NOT CHANGED
- Shared Passengers card appears only when SH service is visible
- New Trips + Final Confirmation are alert cards
- Organization counts use tenant-isolated /api/users/:role
- Company billing uses /api/admin/billing
=========================================================
*/

(function(){
"use strict";

const token=String(localStorage.getItem("token")||"").trim();
const rawRole=String(localStorage.getItem("role")||"").trim().toUpperCase().replace(/[\s-]+/g,"_");
const role=rawRole==="SUPERADMIN"?"SUPER_ADMIN":rawRole;
const isSuper=role==="SUPER_ADMIN";
const isAdmin=role==="ADMIN";
const canAdminData=isSuper||isAdmin;

if(!token){
  location.href="/login.html";
  return;
}

const $=id=>document.getElementById(id);
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const clean=v=>String(v??"").trim();

function money(v){
  return "$"+n(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function headers(){return {Authorization:"Bearer "+token};}
async function getJson(url){
  const r=await fetch(url,{headers:headers(),cache:"no-store"});
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(data?.message||`Request failed ${r.status}`);
  return data;
}
function tz(){
  return localStorage.getItem("systemTimezone")||
         localStorage.getItem("appTimezone")||
         "America/Phoenix";
}
function dateKey(value){
  if(!value)return "";
  if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const d=new Date(value);
  if(isNaN(d.getTime()))return "";
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:tz(),year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const y=p.find(x=>x.type==="year")?.value||"";
  const m=p.find(x=>x.type==="month")?.value||"";
  const day=p.find(x=>x.type==="day")?.value||"";
  return `${y}-${m}-${day}`;
}
function todayKey(){return dateKey(new Date());}
function monthKey(){return todayKey().slice(0,7);}
function tripDateKey(t){
  const d=clean(t?.tripDate);
  return /^\d{4}-\d{2}-\d{2}$/.test(d)?d:dateKey(d);
}
function norm(v){return clean(v).toLowerCase().replace(/[\s_-]+/g,"");}
function isCompleted(v){const s=norm(v);return ["completed","complete","dropoff","droppedoff"].includes(s);}
function isCancelled(v){return norm(v).includes("cancel");}
function isNoShow(v){return norm(v).includes("noshow");}
function isOnTrip(v){return ["accepted","ontrip","inprogress","arrived","pickup","pickedup"].includes(norm(v));}
function isFinalStatus(v){return isCompleted(v)||isCancelled(v)||isNoShow(v)||norm(v)==="notcompleted";}
function isFinalConfirmed(t){
  return t?.finalStatusConfirmed===true||
         t?.sharedFinalConfirmed===true||
         !!t?.dispatchFinalConfirmedAt||
         !!t?.finalStatusConfirmedAt||
         !!t?.sharedFinalConfirmedAt;
}
function isShared(t){
  return t?.isShared===true||
         clean(t?.tripType).toUpperCase()==="SHARED"||
         clean(t?.serviceKey).toUpperCase()==="SH"||
         clean(t?.serviceCode).toUpperCase()==="SH"||
         (Array.isArray(t?.passengers)&&t.passengers.length>0);
}
function sharedKey(t){
  return clean(t?.groupId)||clean(t?.tripNumber)||clean(t?._id||t?.id);
}
function buildItems(trips){
  const seen=new Set(), groups=new Map(), out=[];
  trips.forEach(t=>{
    if(isShared(t)){
      const k=sharedKey(t);
      if(!groups.has(k))groups.set(k,[]);
      groups.get(k).push(t);
    }
  });
  trips.forEach(t=>{
    if(isShared(t)){
      const k=sharedKey(t);
      if(seen.has(k))return;
      seen.add(k);
      const g=groups.get(k)||[t];
      out.push({kind:"shared",trip:g[0],group:g});
    }else out.push({kind:"trip",trip:t,group:[t]});
  });
  return out;
}
function passengers(item){
  const p=item?.trip?.passengers;
  if(Array.isArray(p)&&p.length)return p;
  return item.kind==="shared"?item.group.map(t=>({status:t.status,finalPrice:t.finalPrice,priceAmount:t.priceAmount})): [];
}
function statuses(item){
  if(item.kind==="shared"){
    const p=passengers(item);
    return p.length?p.map(x=>x.status||item.trip?.status||""):item.group.map(x=>x.status||"");
  }
  return [item.trip?.status||""];
}
function itemMiles(item){
  if(item.kind==="shared"){
    return n(item.trip?.sharedRouteMiles||item.trip?.miles||0);
  }
  return n(item.trip?.miles||0);
}
function itemRevenue(item){
  const t=item.trip||{};
  if(!isFinalConfirmed(t)&&t.isFinalized!==true)return 0;
  if(item.kind==="shared"){
    if(n(t.groupTotal)>0)return n(t.groupTotal);
    if(n(t.finalPrice)>0)return n(t.finalPrice);
    if(n(t.priceAmount)>0)return n(t.priceAmount);
    const p=passengers(item);
    return p.reduce((s,x)=>s+n(x.finalPrice||x.priceAmount||0),0);
  }
  return n(t.finalPrice||t.priceAmount||t.capturedAmount||0);
}
function itemSharedPassengers(item){
  if(item.kind!=="shared")return 0;
  const p=passengers(item);
  return p.length||n(item.trip?.totalPassengers||item.trip?.passengerCount||item.group.length);
}

/* exact service visibility rule */
function bool(v){
  if(v===true)return true;
  if(v===false||v===null||v===undefined)return false;
  return ["true","1","yes","on","enabled","enable"].includes(clean(v).toLowerCase());
}
function quoteOn(s){return bool(s?.getQuoteEnabled??s?.getQuoteDisplay??s?.quoteEnabled??s?.displayInGetQuote??s?.showInGetQuote);}
function reservedOn(s){return bool(s?.reservedEnabled??s?.reservedDisplay??s?.displayInReserved??s?.showInReserved??s?.reservationEnabled);}
function companiesOn(s){return bool(s?.companyEnabled??s?.companiesEnabled??s?.companyEnable??s?.companiesEnable??s?.displayInCompanies??s?.showInCompanies);}
function serviceVisible(s){return quoteOn(s)||reservedOn(s)||companiesOn(s);}
function serviceCode(s){return clean(s?.serviceKey||s?.serviceCode||s?.serviceType||s?.suffix||s?.companySuffix||s?.code).toUpperCase();}
function serviceName(s){return s?.title||s?.serviceName||s?.name||serviceCode(s)||"Service";}
function hasSharedService(services){
  return services.some(s=>serviceVisible(s)&&(["SH","SHARED"].includes(serviceCode(s))||clean(serviceName(s)).toLowerCase().includes("shared")));
}

/* refund only when a real refund amount/flag exists */
function refundDate(t){
  return t?.refundedAt||t?.refundDateTime||t?.refundProcessedAt||t?.paymentRefundedAt||null;
}
function isRefundedTrip(t){
  return n(t?.refundAmount)>0||
         t?.refunded===true||
         t?.refundProcessed===true||
         norm(t?.paymentStatus)==="refunded";
}

function renderRoleVisibility(){
  document.querySelectorAll(".admin-super-only").forEach(el=>el.style.display=canAdminData?"":"none");
  document.querySelectorAll(".super-only").forEach(el=>el.style.display=isSuper?"":"none");
  if(role==="DISPATCHER")$("dashboardSub").textContent="Live dispatch operations and action alerts";
  else if(isSuper)$("dashboardSub").textContent="Operations, revenue, services, organization and billing overview";
  else $("dashboardSub").textContent="Operations, revenue, services and organization overview";
}

function renderTrips(trips,finalTrips,services){
  const items=buildItems(trips);
  const today=todayKey();
  const month=monthKey();
  const todayItems=items.filter(i=>tripDateKey(i.trip)===today);
  const monthItems=items.filter(i=>tripDateKey(i.trip).slice(0,7)===month);

  const newItems=items.filter(i=>{
    const d=new Date(i.trip?.bookedAt||i.trip?.createdAt||0);
    return !isNaN(d.getTime())&&(Date.now()-d.getTime()<=2*60*60*1000);
  });

  const pendingFinal=(finalTrips||[]).filter(t=>{
    const ready=isShared(t)
      ? (Array.isArray(t.passengers)&&t.passengers.some(p=>isFinalStatus(p.status||t.status)))
      : isFinalStatus(t.status);
    return ready && !isFinalConfirmed(t) && tripDateKey(t)===today;
  });

  $("newTrips").textContent=newItems.length;
  $("needsConfirmation").textContent=pendingFinal.length;
  $("newTripAlert").classList.toggle("is-hot",newItems.length>0);
  $("confirmAlert").classList.toggle("is-hot",pendingFinal.length>0);

  $("todayTrips").textContent=todayItems.length;
  $("todayOnTrip").textContent=todayItems.filter(i=>statuses(i).some(isOnTrip)).length;
  $("todayCompleted").textContent=todayItems.filter(i=>statuses(i).some(isCompleted)).length;
  $("todayCancelled").textContent=todayItems.filter(i=>statuses(i).some(isCancelled)).length;
  $("todayNoShow").textContent=todayItems.filter(i=>statuses(i).some(isNoShow)).length;

  $("todayRefunds").textContent=trips.filter(t=>{
    if(!isRefundedTrip(t))return false;
    const d=refundDate(t);
    return d?dateKey(d)===today:tripDateKey(t)===today;
  }).length;

  $("monthTrips").textContent=monthItems.length;
  $("monthCompleted").textContent=monthItems.filter(i=>statuses(i).some(isCompleted)).length;
  $("monthCancelled").textContent=monthItems.filter(i=>statuses(i).some(isCancelled)).length;
  $("monthNoShow").textContent=monthItems.filter(i=>statuses(i).some(isNoShow)).length;
  $("monthMiles").textContent=monthItems.reduce((s,i)=>s+itemMiles(i),0).toFixed(1);

  if(canAdminData){
    $("todayRevenue").textContent=money(todayItems.reduce((s,i)=>s+itemRevenue(i),0));
    $("monthRevenue").textContent=money(monthItems.reduce((s,i)=>s+itemRevenue(i),0));
  }

  const sharedEnabled=hasSharedService(services);
  $("sharedPassengersCard").classList.toggle("hidden",!sharedEnabled);
  if(sharedEnabled){
    $("sharedPassengers").textContent=monthItems.reduce((s,i)=>s+itemSharedPassengers(i),0);
  }

  localStorage.setItem("dashboardNewTripsCount",String(newItems.length));
  localStorage.setItem("dashboardPendingConfirmationCount",String(pendingFinal.length));
  window.dispatchEvent(new CustomEvent("gh-dashboard-alerts",{detail:{newTrips:newItems.length,pendingConfirmation:pendingFinal.length}}));
}

function renderServices(services){
  const visible=services.filter(serviceVisible);
  const grid=$("servicesGrid");
  if(!visible.length){
    grid.innerHTML='<div class="empty">No enabled services</div>';
    return;
  }
  grid.innerHTML=visible.map(s=>{
    const channels=[];
    if(quoteOn(s))channels.push("Get Quote");
    if(reservedOn(s))channels.push("Reserved");
    if(companiesOn(s))channels.push("Companies");
    return `<div class="service-card">
      <div class="service-name">${String(serviceName(s)).replace(/[<>]/g,"")}</div>
      <div class="service-state">ACTIVE</div>
      <div class="service-channels">${channels.join(" · ")}</div>
    </div>`;
  }).join("");
}

async function loadUserCounts(){
  if(!canAdminData)return;
  const requests=[
    ["company","facilityCount"],
    ["driver","driverCount"],
    ["dispatcher","dispatcherCount"]
  ];
  if(isSuper){
    requests.push(["admin","adminCount"],["superadmin","superAdminCount"]);
  }
  await Promise.all(requests.map(async([r,id])=>{
    try{
      const data=await getJson("/api/users/"+r);
      $(id).textContent=Array.isArray(data)?data.length:0;
    }catch(e){
      $(id).textContent="--";
    }
  }));
}

function formatDate(v){
  if(!v)return "--";
  const d=new Date(v);
  if(isNaN(d.getTime()))return "--";
  return d.toLocaleDateString("en-US",{timeZone:tz(),month:"short",day:"numeric",year:"numeric"});
}

async function loadBilling(){
  if(!isSuper)return;
  try{
    const companies=await getJson("/api/admin/billing");
    const list=Array.isArray(companies)?companies:[];
    $("billingCompanies").textContent=list.length;
    $("companyInvoices").textContent=money(list.reduce((s,c)=>s+n(c.invoiceAmount||0),0));
    const dates=list.map(c=>c.nextBillingDate).filter(Boolean).map(x=>new Date(x)).filter(x=>!isNaN(x.getTime())).sort((a,b)=>a-b);
    $("nextCompanyPayment").textContent=dates.length?formatDate(dates[0]):"--";
  }catch(e){
    $("billingCompanies").textContent="--";
    $("companyInvoices").textContent="--";
    $("nextCompanyPayment").textContent="--";
  }
}

async function init(){
  renderRoleVisibility();

  $("monthLabel").textContent=new Date().toLocaleDateString("en-US",{timeZone:tz(),month:"long",year:"numeric"});

  let trips=[],services=[],finalTrips=[];

  const [tripsR,servicesR,finalR]=await Promise.allSettled([
    getJson("/api/trips"),
    getJson("/api/services/admin"),
    getJson("/api/dispatch-final-confirmation")
  ]);

  if(tripsR.status==="fulfilled"){
    trips=Array.isArray(tripsR.value)?tripsR.value:(tripsR.value?.trips||[]);
  }
  if(servicesR.status==="fulfilled"){
    services=Array.isArray(servicesR.value)?servicesR.value:(servicesR.value?.services||servicesR.value?.items||[]);
  }
  if(finalR.status==="fulfilled"){
    finalTrips=Array.isArray(finalR.value)?finalR.value:(finalR.value?.trips||[]);
  }

  renderServices(services);
  renderTrips(trips,finalTrips,services);

  await Promise.allSettled([loadUserCounts(),loadBilling()]);

  $("platformPaymentCard")?.addEventListener("click",()=>location.href="payments.html");
}

document.addEventListener("DOMContentLoaded",init);

})();