(()=>{
"use strict";

const token=sessionStorage.getItem("staffToken")||localStorage.getItem("staffToken")||sessionStorage.getItem("token")||localStorage.getItem("token")||localStorage.getItem("adminToken")||"";
const headers=token?{Authorization:`Bearer ${token}`}:{};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let allRows=[];

async function json(url,opt={}){
  const r=await fetch(url,{credentials:"include",...opt,headers:{...headers,...(opt.headers||{})}});
  const x=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(x.message||`Request failed (${r.status})`);
  return x;
}

function normalizeStop(v){
  if(typeof v==="string")return v.trim();
  return String(v?.address||v?.name||v?.location||v?.stopAddress||"").trim();
}
function asStops(s){
  const candidates=[s?.stops,s?.stopAddresses,s?.extraStops,s?.trip?.stops,s?.tripData?.stops];
  for(const value of candidates){
    if(Array.isArray(value))return value.map(normalizeStop).filter(Boolean);
  }
  return [];
}
function sharedMembers(s){
  const candidates=[s?.sharedTrips,s?.sharedMembers,s?.members,s?.passengers,s?.group,s?.trips];
  for(const value of candidates){
    if(Array.isArray(value)&&value.length&&value.some(x=>x&&typeof x==="object"))return value;
  }
  return [];
}
function cellBox(values,{numbered=false}={}){
  const list=(Array.isArray(values)?values:[values]).map(v=>String(v??"").trim()).filter(Boolean);
  const safeList=list.length?list:["—"];
  return `<div class="cell-box">${safeList.map((v,i)=>`<div class="cell-item">${numbered&&v!=="—"?`${i+1}. `:""}${esc(v)}</div>`).join("")}</div>`;
}
function stopsHtml(s){return cellBox(asStops(s),{numbered:true});}
function displayValue(v){
  if(v===null||v===undefined||v==="")return "—";
  if(Array.isArray(v))return v.length?v.map((x,i)=>`${i+1}. ${typeof x==="object"?JSON.stringify(x):x}`).join("\n"):"—";
  if(typeof v==="object")return JSON.stringify(v,null,2);
  if(typeof v==="boolean")return v?"Yes":"No";
  return String(v);
}
function addDetail(out,label,value,full=false){
  out.push(`<div class="detail${full?" full":""}"><div class="detail-label">${esc(label)}</div><div class="detail-value">${esc(displayValue(value))}</div></div>`);
}
function openEye(s){
  const out=[];
  addDetail(out,"Trip #",s.tripNumber); addDetail(out,"Template",s.templateName); addDetail(out,"Client",s.clientName);
  addDetail(out,"Pickup",s.pickupAddress,true); addDetail(out,"Stops",asStops(s),true); addDetail(out,"Dropoff",s.dropoffAddress,true);
  addDetail(out,"Trip Date",s.tripDate); addDetail(out,"Pickup Time",s.pickupTime); addDetail(out,"Appointment Time",s.appointmentTime);
  addDetail(out,"Return Time",s.returnTime); addDetail(out,"Service",s.serviceName); addDetail(out,"Miles",Number(s.distanceMiles||0).toFixed(1));
  addDetail(out,"Price",`$${Number(s.pricing?.amount||0).toFixed(2)}`); addDetail(out,"Status",s.status); addDetail(out,"Passengers",s.totalPassengers);
  const members=sharedMembers(s); if(members.length)addDetail(out,"Shared Trips",members,true);
  const used=new Set(["CLIENT_NAME","PICKUP_ADDRESS","STOPS","DROPOFF_ADDRESS","TRIP_DATE","PICKUP_TIME","APPOINTMENT_TIME","RETURN_TIME","SERVICE"]);
  const snapshot=Array.isArray(s.fieldSnapshot)?s.fieldSnapshot:[]; const shown=new Set();
  for(const f of snapshot){const key=String(f?.key||"");const binding=String(f?.tripBinding||"").toUpperCase();if(!key||used.has(binding))continue;shown.add(key);addDetail(out,f.label||key,s.formData?.[key]);}
  const fd=s.formData&&typeof s.formData==="object"?s.formData:{};
  for(const [key,value] of Object.entries(fd)){if(shown.has(key))continue;const f=snapshot.find(x=>String(x?.key||"")===key);if(used.has(String(f?.tripBinding||"").toUpperCase()))continue;addDetail(out,f?.label||key,value);}
  if(s.notes)addDetail(out,"Notes",s.notes,true);
  document.getElementById("eyeTitle").textContent=`${s.tripNumber||"Smart Form"} — Details`;
  document.getElementById("eyeDetails").innerHTML=out.join("");
  document.getElementById("eyeModal").classList.add("open");
}
function closeEye(){document.getElementById("eyeModal").classList.remove("open");}

async function openPdf(id){
  await json(`/api/smart-forms/submissions/${encodeURIComponent(id)}/generate-pdf`,{method:"POST"});
  const r=await fetch(`/api/smart-forms/submissions/${encodeURIComponent(id)}/pdf`,{credentials:"include",headers});
  if(!r.ok){const x=await r.json().catch(()=>({}));throw new Error(x.message||`PDF failed (${r.status})`);}
  const blob=await r.blob(),url=URL.createObjectURL(blob);window.open(url,"_blank","noopener");setTimeout(()=>URL.revokeObjectURL(url),120000);
}

function fillSelect(id,values,label){
  const el=document.getElementById(id); if(!el)return;
  const current=el.value;
  const vals=[...new Set(values.map(v=>String(v||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  el.innerHTML=`<option value="ALL">All ${label}</option>`+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if([...el.options].some(o=>o.value===current))el.value=current;
}
function buildFilters(){
  fillSelect("templateFilter",allRows.map(x=>x.templateName),"Templates");
  fillSelect("serviceFilter",allRows.map(x=>x.serviceName),"Services");
  fillSelect("statusFilter",allRows.map(x=>x.status),"Status");
}
function searchable(s){
  return [s.tripNumber,s.templateName,s.clientName,s.pickupAddress,s.dropoffAddress,s.tripDate,s.pickupTime,s.serviceName,s.status,...asStops(s)]
    .join(" ").toLowerCase();
}
function filteredRows(){
  const q=document.getElementById("searchInput").value.trim().toLowerCase();
  const template=document.getElementById("templateFilter").value;
  const service=document.getElementById("serviceFilter").value;
  const status=document.getElementById("statusFilter").value;
  const date=document.getElementById("dateFilter").value;
  return allRows.filter(s=>(!q||searchable(s).includes(q))&&(template==="ALL"||String(s.templateName||"")===template)&&(service==="ALL"||String(s.serviceName||"")===service)&&(status==="ALL"||String(s.status||"")===status)&&(!date||String(s.tripDate||"").slice(0,10)===date));
}
function renderStats(rows){
  const counts=new Map();
  rows.forEach(s=>{const n=String(s.templateName||"Unknown Template");counts.set(n,(counts.get(n)||0)+1);});
  document.getElementById("statsGrid").innerHTML=
    `<div class="stat-card"><div class="stat-number">${rows.length}</div><div class="stat-label">TOTAL TRIPS</div></div>`+
    [...counts.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,count])=>`<div class="stat-card"><div class="stat-number">${count}</div><div class="stat-label" title="${esc(name)}">${esc(name)}</div></div>`).join("");
}
function groupByDate(rows){const g={};for(const r of rows){const k=String(r.tripDate||"Unknown");(g[k]||(g[k]=[])).push(r);}return g;}

function rowCells(s,counter){
  const members=sharedMembers(s);
  if(!members.length){
    return `<td class="col-num">${counter}</td><td class="col-trip">${esc(s.tripNumber||"—")}</td><td class="col-template">${esc(s.templateName||"—")}</td>
    <td class="wide-passenger">${cellBox(s.clientName)}</td><td class="wide-address">${cellBox(s.pickupAddress)}</td><td class="wide-stops">${stopsHtml(s)}</td><td class="wide-address">${cellBox(s.dropoffAddress)}</td>
    <td class="col-date">${esc(s.tripDate||"—")}</td><td class="col-time">${esc(s.pickupTime||"—")}</td><td class="col-service">${esc(s.serviceName||"—")}</td>
    <td class="col-miles">${Number(s.distanceMiles||0).toFixed(1)}</td><td class="col-money">$${Number(s.pricing?.amount||0).toFixed(2)}</td>`;
  }
  const get=(m,...keys)=>{for(const k of keys){if(m?.[k]!==undefined&&m?.[k]!==null&&m?.[k]!=="")return m[k];}return "—";};
  const memberStops=members.map(m=>{const x=asStops(m);return x.length?x.map((v,i)=>`${i+1}. ${v}`).join(" | "):"—";});
  return `<td class="col-num">${counter}</td><td class="col-trip">${cellBox(members.map(m=>get(m,"tripNumber","number")))}</td><td class="col-template">${esc(s.templateName||"—")}</td>
  <td class="wide-passenger">${cellBox(members.map(m=>get(m,"clientName","passengerName","name")))}</td>
  <td class="wide-address">${cellBox(members.map(m=>get(m,"pickupAddress","pickup")))}</td>
  <td class="wide-stops">${cellBox(memberStops)}</td>
  <td class="wide-address">${cellBox(members.map(m=>get(m,"dropoffAddress","dropoff")))}</td>
  <td class="col-date">${esc(s.tripDate||"—")}</td><td class="col-time">${cellBox(members.map(m=>get(m,"pickupTime","time")))}</td>
  <td class="col-service">${esc(s.serviceName||"SHARED")}</td><td class="col-miles">${Number(s.distanceMiles||0).toFixed(1)}</td><td class="col-money">$${Number(s.pricing?.amount||0).toFixed(2)}</td>`;
}

function render(rows){
  renderStats(rows);
  const root=document.getElementById("summaryContent");
  if(!rows.length){root.innerHTML=`<div class="table-wrap"><div class="empty-state">No Smart Form Summary Trips Found</div></div>`;return;}
  const groups=groupByDate(rows);let counter=1,body="";
  Object.keys(groups).sort((a,b)=>{const da=Date.parse(a),db=Date.parse(b);if(Number.isNaN(da)&&Number.isNaN(db))return a.localeCompare(b);if(Number.isNaN(da))return 1;if(Number.isNaN(db))return -1;return db-da;}).forEach(day=>{
    body+=`<tr class="date-row"><td colspan="14">Trip Date: ${esc(day)}</td></tr>`;
    for(const s of groups[day]){
      const shared=sharedMembers(s).length;
      body+=`<tr class="trip-divider${shared?" shared-row":""}">${rowCells(s,counter++)}
      <td class="col-eye"><button class="eye-btn" type="button" data-eye="${esc(s._id)}" title="View all details">👁</button></td>
      <td class="col-review"><button class="review-btn" type="button" data-pdf="${esc(s._id)}">Review</button></td></tr>`;
    }
  });
  root.innerHTML=`<div class="table-wrap"><table class="summary-table"><thead><tr>
  <th class="col-num">#</th><th class="col-trip">Trip #</th><th class="col-template">Template</th><th class="wide-passenger">Client</th>
  <th class="wide-address">Pickup</th><th class="wide-stops">Stops</th><th class="wide-address">Dropoff</th><th class="col-date">Trip Date</th>
  <th class="col-time">Time</th><th class="col-service">Service</th><th class="col-miles">Miles</th><th class="col-money">Price</th><th class="col-eye">👁️</th><th class="col-review">Review</th>
  </tr></thead><tbody>${body}</tbody></table></div>`;
  const byId=new Map(rows.map(s=>[String(s._id),s]));
  root.querySelectorAll("[data-eye]").forEach(b=>b.onclick=()=>{const s=byId.get(String(b.dataset.eye));if(s)openEye(s);});
  root.querySelectorAll("[data-pdf]").forEach(b=>b.onclick=()=>openPdf(b.dataset.pdf).catch(e=>alert(e.message)));
}
function applyFilters(){render(filteredRows());}

async function load(){
  const f=await json("/api/smart-forms/feature");if(!f.enabled){location.href="summary.html";return;}
  const x=await json("/api/smart-forms/submissions?status=CONFIRMED");
  allRows=Array.isArray(x)?x:(x.submissions||[]);
  buildFilters();applyFilters();
}

["searchInput","templateFilter","serviceFilter","statusFilter","dateFilter"].forEach(id=>{
  const el=document.getElementById(id);if(el)el.addEventListener(id==="searchInput"?"input":"change",applyFilters);
});
document.getElementById("clearFiltersBtn")?.addEventListener("click",()=>{
  document.getElementById("searchInput").value="";
  document.getElementById("templateFilter").value="ALL";
  document.getElementById("serviceFilter").value="ALL";
  document.getElementById("statusFilter").value="ALL";
  document.getElementById("dateFilter").value="";
  applyFilters();
});
document.getElementById("closeEyeBtn")?.addEventListener("click",closeEye);
document.getElementById("eyeModal")?.addEventListener("click",e=>{if(e.target.id==="eyeModal")closeEye();});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeEye();});
load().catch(e=>alert(e.message));
})();