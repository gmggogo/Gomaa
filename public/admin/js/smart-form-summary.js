// Destination: server/public/admin/js/smart-form-summary.js
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const token=sessionStorage.getItem("staffToken")||localStorage.getItem("staffToken")||sessionStorage.getItem("token")||localStorage.getItem("token")||localStorage.getItem("adminToken")||"";
const headers=token?{Authorization:`Bearer ${token}`}:{};
const state={allItems:[],displayItems:[]};
const clean=v=>String(v??"").trim();
const safe=v=>clean(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const money=v=>"$"+num(v).toFixed(2);

async function json(url,opt={}){
  const r=await fetch(url,{credentials:"include",cache:"no-store",...opt,headers:{...headers,...(opt.headers||{})}});
  const x=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(x.message||`Request failed (${r.status})`);
  return x;
}
function normalizeStop(v){
  if(typeof v==="string")return clean(v);
  return clean(v?.address||v?.formattedAddress||v?.formatted_address||v?.description||v?.label||v?.name||v?.location||v?.stopAddress);
}
function asStops(s){
  for(const v of [s?.stops,s?.stopAddresses,s?.extraStops,s?.trip?.stops,s?.tripData?.stops]){
    if(Array.isArray(v))return v.map(normalizeStop).filter(Boolean);
  }
  return [];
}
function sharedMembers(s){
  for(const v of [s?.sharedTrips,s?.sharedMembers,s?.members,s?.passengers,s?.group,s?.trips]){
    if(Array.isArray(v)&&v.length&&v.some(x=>x&&typeof x==="object"))return v.slice(0,10);
  }
  return [];
}
function isShared(s){return sharedMembers(s).length>1||s?.isShared===true||/^SHARED$/i.test(clean(s?.serviceName))||/^SH$/i.test(clean(s?.serviceCode));}
function cellBox(items){
  const arr=(Array.isArray(items)?items:[items]).slice(0,10);
  return `<div class="cell-box">${(arr.length?arr:["--"]).map(v=>`<div class="cell-item">${safe(v||"--")}</div>`).join("")}</div>`;
}
function get(m,...keys){for(const k of keys){if(m?.[k]!==undefined&&m?.[k]!==null&&m?.[k]!=="")return m[k];}return "";}
function passengers(s){
  const members=sharedMembers(s);
  if(members.length)return members;
  return [{clientName:s.clientName,passengerName:s.passengerName,name:s.clientName,pickupAddress:s.pickupAddress,dropoffAddress:s.dropoffAddress,pickupTime:s.pickupTime,status:s.passengerStatus||tripStatus(s),total:price(s)}];
}
function passengerNames(s){return passengers(s).map((p,i)=>`${i+1}. ${get(p,"clientName","passengerName","name")||s.clientName||"-"}`);}
function passengerPickups(s){return passengers(s).map((p,i)=>`${i+1}. ${get(p,"pickupAddress","pickup")||s.pickupAddress||"-"}`);}
function passengerDropoffs(s){return passengers(s).map((p,i)=>`${i+1}. ${get(p,"dropoffAddress","dropoff")||s.dropoffAddress||"-"}`);}
function passengerStatuses(s){return passengers(s).map((p,i)=>`${i+1}. ${get(p,"passengerStatus","tripStatus","status")||tripStatus(s)||"-"}`);}
function passengerTotals(s){return passengers(s).map(p=>money(get(p,"total","price","amount")||0));}
function stopItems(s){const a=asStops(s);return a.length?a.map((x,i)=>`${i+1}. ${x}`):["--"];}

function tripStatus(s){
  const raw=clean(s?.tripStatus||s?.trip?.status||s?.tripData?.status||s?.finalStatus||s?.rideStatus);
  if(raw)return normalizeStatus(raw);
  const sub=clean(s?.status).toUpperCase();
  if(["COMPLETED","CANCELLED","NO SHOW","NO_SHOW","NOT COMPLETED","NOT_COMPLETED","MIXED CLOSED","MIXED_CLOSED"].includes(sub))return normalizeStatus(sub);
  return "Not Completed";
}
function normalizeStatus(v){
  const s=clean(v).replace(/_/g," ").toLowerCase();
  if(s==="completed")return "Completed";
  if(s==="cancelled"||s==="canceled")return "Cancelled";
  if(s==="no show"||s==="noshow")return "No Show";
  if(s==="mixed closed"||s==="mixed")return "Mixed Closed";
  if(s==="not completed")return "Not Completed";
  return clean(v)||"Not Completed";
}
function statusClass(v){
  const s=normalizeStatus(v).toLowerCase();
  if(s==="completed")return"completed";if(s==="cancelled")return"cancelled";if(s==="no show")return"noshow";if(s==="not completed")return"notcompleted";if(s==="mixed closed")return"mixed";return"";
}
function statusHTML(v){const s=normalizeStatus(v);return `<span class="status-pill ${statusClass(s)}">${safe(s)}</span>`;}
function miles(s){return num(s?.distanceMiles||s?.miles||s?.trip?.miles||s?.tripData?.miles);}
function price(s){
  const values=[
    s?.finalPrice,s?.priceAmount,s?.pricing?.amount,s?.total,s?.tripPrice,s?.price,
    s?.trip?.finalPrice,s?.trip?.priceAmount,s?.trip?.price,
    s?.tripData?.finalPrice,s?.tripData?.priceAmount,s?.tripData?.price
  ].filter(v=>v!==undefined&&v!==null&&v!==""&&Number.isFinite(Number(v)));
  return num(values.find(v=>Number(v)!==0) ?? values[0] ?? 0);
}
function count(s){return Math.min(10,Math.max(1,num(s?.passengerCount||s?.totalPassengers||passengers(s).length||1)));}

function buildFilters(){
  const fill=(id,values,label)=>{
    const el=$(id),cur=el?.value||"";if(!el)return;
    const vals=[...new Set(values.map(clean).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    el.innerHTML=`<option value="">All ${label}</option>`+vals.map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join("");
    if([...el.options].some(o=>o.value===cur))el.value=cur;
  };
  fill("templateFilter",state.allItems.map(x=>x.templateName),"Templates");
  fill("serviceFilter",state.allItems.map(x=>x.serviceName),"Services");
}
function searchable(s){
  return [s.tripNumber,s.templateName,s.clientName,s.pickupAddress,s.dropoffAddress,s.tripDate,s.pickupTime,s.serviceName,tripStatus(s),JSON.stringify(asStops(s)),JSON.stringify(sharedMembers(s)),JSON.stringify(s.formData||{})].join(" ").toLowerCase();
}
function filterItems(){
  const q=clean($("searchInput")?.value).toLowerCase(),template=clean($("templateFilter")?.value),service=clean($("serviceFilter")?.value),status=clean($("statusFilter")?.value);
  const from=$("fromDate")?.value||"",to=$("toDate")?.value||"";
  state.displayItems=state.allItems.filter(s=>{
    const d=clean(s.tripDate).slice(0,10);
    return(!q||searchable(s).includes(q))&&(!template||clean(s.templateName)===template)&&(!service||clean(s.serviceName)===service)&&(!status||tripStatus(s)===status)&&(!from||d>=from)&&(!to||d<=to);
  });
}
function renderStats(){
  const a=state.displayItems;
  $("totalTrips").textContent=a.length;
  $("completedTrips").textContent=a.filter(x=>tripStatus(x)==="Completed").length;
  $("cancelledTrips").textContent=a.filter(x=>tripStatus(x)==="Cancelled").length;
  $("noShowTrips").textContent=a.filter(x=>tripStatus(x)==="No Show").length;
  $("notCompletedTrips").textContent=a.filter(x=>tripStatus(x)==="Not Completed").length;
  $("totalRevenue").textContent=money(a.reduce((n,x)=>n+price(x),0));
  $("totalMiles").textContent=a.reduce((n,x)=>n+miles(x),0).toFixed(1);
}
function rowClass(s){
  let c=isShared(s)?"shared-row ":"",x=statusClass(tripStatus(s));
  if(x)c+=x+"-row ";
  return c+"trip-divider";
}
function groupByDate(a){const g={};a.forEach(x=>{const k=x.tripDate||"Unknown";(g[k]||(g[k]=[])).push(x);});return g;}

function render(){
  filterItems();renderStats();
  const host=$("summaryContent");if(!host)return;
  if(!state.displayItems.length){host.innerHTML=`<div class="empty-state">No Smart Form Summary Trips Found</div>`;return;}
  const groups=groupByDate(state.displayItems);let n=1,body="";
  Object.keys(groups).sort((a,b)=>new Date(b)-new Date(a)).forEach(day=>{
    body+=`<tr class="date-row"><td colspan="18">Trip Date: ${safe(day)}</td></tr>`;
    groups[day].forEach(s=>{
      const shared=isShared(s);
      body+=`<tr class="${rowClass(s)}">
      <td class="col-num">${n++}</td>
      <td class="col-trip"><span class="trip-number-badge">${safe(s.tripNumber||"-")}</span></td>
      <td class="col-template">${cellBox(s.templateName||"-")}</td>
      <td class="col-service">${cellBox(s.serviceName||"-")}</td>
      <td class="col-passenger">${cellBox(passengerNames(s))}</td>
      <td class="col-address">${cellBox(passengerPickups(s))}</td>
      <td class="col-stops">${cellBox(stopItems(s))}</td>
      <td class="col-address">${cellBox(passengerDropoffs(s))}</td>
      <td class="col-date">${safe(s.tripDate||"-")}</td>
      <td class="col-time">${safe(s.pickupTime||"-")}</td>
      <td class="col-status">${statusHTML(tripStatus(s))}</td>
      <td class="col-miles">${miles(s).toFixed(1)}</td>
      <td class="col-passenger-status">${cellBox(passengerStatuses(s))}</td>
      <td class="col-total">${shared?cellBox(passengerTotals(s)):cellBox(money(price(s)))}</td>
      <td class="col-trip-price">${cellBox(money(price(s)))}</td>
      <td class="col-count">${count(s)}</td>
      <td class="col-eye"><button class="eye-btn" type="button" data-eye="${safe(s._id)}">👁️</button></td>
      <td class="col-review"><button class="review-btn" type="button" data-pdf="${safe(s._id)}">Review</button></td>
      </tr>`;
    });
  });
  host.innerHTML=`<div class="table-wrap"><table class="summary-table"><thead><tr>
  <th class="col-num">#</th><th class="col-trip">Trip #</th><th class="col-template">Template</th><th class="col-service">Service</th>
  <th class="col-passenger">Passenger</th><th class="col-address">Pickup</th><th class="col-stops">Stops</th><th class="col-address">Dropoff</th>
  <th class="col-date">Trip Date</th><th class="col-time">Time</th><th class="col-status">Trip Status</th><th class="col-miles">Miles</th>
  <th class="col-passenger-status">Passenger Status</th><th class="col-total">Total</th><th class="col-trip-price">Trip Price</th><th class="col-count">Count</th><th class="col-eye">👁️</th><th class="col-review">Review</th>
  </tr></thead><tbody>${body}</tbody></table></div>`;
}
function viewLine(label,value){return `<div class="view-line"><div class="view-label">${safe(label)}</div><div class="view-value">${safe(value===undefined||value===null||value===""?"--":typeof value==="object"?JSON.stringify(value,null,2):value)}</div></div>`;}
function openEye(id){
  const s=state.allItems.find(x=>String(x._id)===String(id));if(!s)return;closeEye();
  const snapshot=Array.isArray(s.fieldSnapshot)?s.fieldSnapshot:[],fd=s.formData&&typeof s.formData==="object"?s.formData:{};
  const fields=snapshot.map(f=>viewLine(f.label||f.key,fd[f.key])).join("");
  const extra=Object.entries(fd).filter(([k])=>!snapshot.some(f=>String(f.key)===String(k))).map(([k,v])=>viewLine(k,v)).join("");
  const o=document.createElement("div");o.id="smartSummaryViewOverlay";o.className="view-overlay";
  o.innerHTML=`<div class="view-box"><div class="view-head"><div>${safe(s.tripNumber||"Smart Form")} — Details</div><button class="view-close" type="button" data-close>×</button></div><div class="view-body">
  ${viewLine("Template",s.templateName)}${viewLine("Trip Status",tripStatus(s))}${viewLine("Service",s.serviceName)}${viewLine("Passenger",s.clientName)}
  ${viewLine("Pickup",s.pickupAddress)}${viewLine("Stops",stopItems(s).join("\n"))}${viewLine("Dropoff",s.dropoffAddress)}
  ${viewLine("Trip Date",s.tripDate)}${viewLine("Pickup Time",s.pickupTime)}${viewLine("Appointment Time",s.appointmentTime)}${viewLine("Return Time",s.returnTime)}
  ${viewLine("Miles",miles(s).toFixed(1))}${viewLine("Trip Price",money(price(s)))}${sharedMembers(s).length?viewLine("Shared Trips",sharedMembers(s)):""}${fields}${extra}${viewLine("Notes",s.notes)}
  </div></div>`;
  o.onclick=e=>{if(e.target===o||e.target.closest("[data-close]"))closeEye();};document.body.appendChild(o);
}
function closeEye(){document.getElementById("smartSummaryViewOverlay")?.remove();}
async function openPdf(id){
  await json(`/api/smart-forms/submissions/${encodeURIComponent(id)}/generate-pdf`,{method:"POST"});
  const r=await fetch(`/api/smart-forms/submissions/${encodeURIComponent(id)}/pdf`,{credentials:"include",headers});
  if(!r.ok){const x=await r.json().catch(()=>({}));throw new Error(x.message||`PDF failed (${r.status})`);}
  const blob=await r.blob(),url=URL.createObjectURL(blob);window.open(url,"_blank","noopener");setTimeout(()=>URL.revokeObjectURL(url),120000);
}
function exportRows(){
  const out=[];
  state.displayItems.forEach(s=>{
    const ps=passengers(s);
    ps.forEach((p,i)=>out.push({
      tripNumber:i===0?s.tripNumber:"",template:i===0?s.templateName:"",service:i===0?s.serviceName:"",
      passenger:get(p,"clientName","passengerName","name")||s.clientName||"",pickup:get(p,"pickupAddress","pickup")||s.pickupAddress||"",
      stops:i===0?stopItems(s).join(" | "):"",dropoff:get(p,"dropoffAddress","dropoff")||s.dropoffAddress||"",
      date:i===0?s.tripDate:"",time:get(p,"pickupTime","time")||(i===0?s.pickupTime:""),tripStatus:i===0?tripStatus(s):"",
      miles:i===0?miles(s).toFixed(1):"",passengerStatus:get(p,"passengerStatus","tripStatus","status")||tripStatus(s),
      total:isShared(s)?money(get(p,"total","price","amount")||0):(i===0?money(price(s)):""),tripPrice:i===0?money(price(s)):"",count:i===0?count(s):""
    }));
  });return out;
}
function downloadFile(name,content,type){const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);}
function exportCSV(){
  const rows=exportRows(),heads=["Trip #","Template","Service","Passenger","Pickup","Stops","Dropoff","Trip Date","Time","Trip Status","Miles","Passenger Status","Total","Trip Price","Count"],keys=["tripNumber","template","service","passenger","pickup","stops","dropoff","date","time","tripStatus","miles","passengerStatus","total","tripPrice","count"];
  downloadFile("smart-form-summary.csv",[heads.join(","),...rows.map(r=>keys.map(k=>`"${String(r[k]??"").replace(/"/g,'""')}"`).join(","))].join("\n"),"text/csv;charset=utf-8;");
}
function exportExcel(){
  const rows=exportRows(),heads=["Trip #","Template","Service","Passenger","Pickup","Stops","Dropoff","Trip Date","Time","Trip Status","Miles","Passenger Status","Total","Trip Price","Count"],keys=["tripNumber","template","service","passenger","pickup","stops","dropoff","date","time","tripStatus","miles","passengerStatus","total","tripPrice","count"];
  const h=`<html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${heads.map(x=>`<th>${safe(x)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${keys.map(k=>`<td>${safe(r[k]??"")}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  downloadFile("smart-form-summary.xls",h,"application/vnd.ms-excel");
}
async function load(){
  const f=await json("/api/smart-forms/feature");if(!f.enabled){location.href="summary.html";return;}
  const x=await json("/api/smart-forms/submissions?status=CONFIRMED");
  state.allItems=Array.isArray(x)?x:(x.submissions||[]);
  buildFilters();render();
}
$("searchInput")?.addEventListener("input",render);$("templateFilter")?.addEventListener("change",render);$("serviceFilter")?.addEventListener("change",render);$("statusFilter")?.addEventListener("change",render);
$("applyBtn")?.addEventListener("click",render);$("printBtn")?.addEventListener("click",()=>window.print());$("csvBtn")?.addEventListener("click",exportCSV);$("excelBtn")?.addEventListener("click",exportExcel);
$("summaryContent")?.addEventListener("click",e=>{const eye=e.target.closest("[data-eye]"),pdf=e.target.closest("[data-pdf]");if(eye)openEye(eye.dataset.eye);if(pdf)openPdf(pdf.dataset.pdf).catch(x=>alert(x.message));});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeEye();});
load().catch(e=>{console.error(e);alert(e.message);});
})();
