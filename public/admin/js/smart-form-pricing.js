(()=>{
"use strict";
const API="/api/smart-form-pricing";
let selected=null,current=[];
const token=()=>sessionStorage.getItem("staffToken")||localStorage.getItem("staffToken")||sessionStorage.getItem("token")||localStorage.getItem("token")||localStorage.getItem("adminToken")||"";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(url,opt={}){
  const headers={Authorization:`Bearer ${token()}`,...(opt.headers||{})};
  if(opt.body && !(opt.body instanceof FormData))headers["Content-Type"]="application/json";
  const r=await fetch(url,{...opt,headers});
  const x=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(x.message||`Request failed (${r.status})`);
  return x;
}
const n=v=>Number.isFinite(Number(v))?Number(v):0;
function field(i,key,label,value,step=".01"){
  return `<div class="field"><label>${esc(label)}</label><input data-field="${key}" data-i="${i}" type="number" min="0" step="${step}" value="${n(value)}"></div>`;
}
function selectField(i,key,label,value,options){
  return `<div class="field"><label>${esc(label)}</label><select data-field="${key}" data-i="${i}">${options.map(o=>`<option value="${o[0]}" ${String(value)===o[0]?"selected":""}>${esc(o[1])}</option>`).join("")}</select></div>`;
}
function boolField(i,key,label,value){
  return `<div class="field"><label>${esc(label)}</label><select data-field="${key}" data-i="${i}"><option value="true" ${value===true?"selected":""}>Enabled</option><option value="false" ${value!==true?"selected":""}>Disabled</option></select></div>`;
}
function card(s,i){
  const shared=s.shared===true || String(s.pricingMode).toUpperCase()==="SHARED";
  return `<article class="service-card" data-i="${i}">
    <div class="service-head">
      <div class="service-title">${esc(s.serviceName||s.serviceKey)}</div>
      <div class="service-code">${esc(s.serviceKey)}</div>
    </div>
    <div class="service-body">
      <div class="service-enable-row">
        <strong>Service Access</strong>
        <select data-field="enabled" data-i="${i}">
          <option value="true" ${s.enabled!==false?"selected":""}>ENABLED</option>
          <option value="false" ${s.enabled===false?"selected":""}>DISABLED</option>
        </select>
      </div>
      <div class="fields">
        ${selectField(i,"pricingMode","Pricing Mode",shared?"SHARED":(s.pricingMode||"MILE"),shared?[["SHARED","Shared"]]:[["MILE","Per Mile"],["HOURLY","Hourly"]])}
        ${field(i,"baseFare","Base Fare",s.baseFare)}
        ${field(i,"includedMiles","Included Miles",s.includedMiles)}
        ${field(i,"perMile","Per Mile",s.perMile)}
        ${field(i,"hourlyRate","Hourly Rate",s.hourlyRate)}
        ${selectField(i,"hourlyBillingMode","Hourly Billing",s.hourlyBillingMode||"FULL",[["FULL","Full Hour"],["QUARTER","Quarter Hour"]])}
        ${field(i,"initialDurationMinutes","Initial Minutes",s.initialDurationMinutes,"1")}
        ${field(i,"initialPrice","Initial Price",s.initialPrice)}
        ${field(i,"noShowFee","No Show Fee",s.noShowFee)}
        ${shared?field(i,"sharedPrice","Shared Price / Passenger",s.sharedPrice):""}
        ${boolField(i,"cancelEnabled","Cancellation",s.cancelEnabled!==false)}
        ${field(i,"warningMinutes","Warning Minutes",s.warningMinutes,"1")}
        ${field(i,"cancelFee","Cancel Fee",s.cancelFee)}
      </div>
      <div class="stop-section">
        <div class="stop-title">Stops</div>
        <div class="fields">
          ${field(i,"stopFee","Stop Fee",s.stopFee)}
          ${boolField(i,"addStopEnabled","Add Stop",s.addStopEnabled===true)}
          ${boolField(i,"addStopCustomTimeEnabled","Custom Stop Time",s.addStopCustomTimeEnabled===true)}
          ${field(i,"addStopCutoffMinutes","Stop Cutoff Minutes",s.addStopCutoffMinutes,"1")}
          ${shared?boolField(i,"sharedStopChargeEnabled","Shared Stop Charges",s.sharedStopChargeEnabled===true):""}
        </div>
        <div class="stop-note">Stop Fee is applied to intermediate stops according to this template and service.</div>
      </div>
    </div>
  </article>`;
}
async function loadTemplates(){
  const x=await api(`${API}/templates`);
  const host=document.querySelector("#templates");
  host.innerHTML=(x.templates||[]).map(t=>`<div class="template-item" data-id="${esc(t._id)}"><div class="template-name">${esc(t.name)}</div></div>`).join("")||`<div class="empty">No active templates</div>`;
  host.querySelectorAll(".template-item").forEach(el=>el.onclick=()=>loadOne(el.dataset.id,el));
}
async function loadOne(id,el){
  selected=id;
  document.querySelectorAll(".template-item").forEach(x=>x.classList.remove("active"));
  el.classList.add("active");
  const x=await api(`${API}/templates/${encodeURIComponent(id)}`);
  current=x.services||[];
  document.querySelector("#title").textContent=x.template?.name||"Smart Form";
  document.querySelector("#services").innerHTML=current.length?current.map(card).join(""):`<div class="empty">No enabled services found.</div>`;
  document.querySelector("#save").hidden=false;
}
function readValue(el){
  if(["enabled","cancelEnabled","addStopEnabled","addStopCustomTimeEnabled","sharedStopChargeEnabled"].includes(el.dataset.field))return el.value==="true";
  if(el.type==="number")return n(el.value);
  return el.value;
}
document.querySelector("#save").onclick=async()=>{
  if(!selected)return;
  const services=current.map(s=>({...s}));
  document.querySelectorAll("[data-field][data-i]").forEach(el=>{
    const i=Number(el.dataset.i);
    if(!services[i])return;
    services[i][el.dataset.field]=readValue(el);
  });
  await api(`${API}/templates/${encodeURIComponent(selected)}`,{method:"PUT",body:JSON.stringify({active:true,services})});
  alert("Smart Form pricing saved.");
  const active=document.querySelector(`.template-item[data-id="${CSS.escape(selected)}"]`);
  if(active)await loadOne(selected,active);
};
loadTemplates().catch(e=>alert(e.message));
})();