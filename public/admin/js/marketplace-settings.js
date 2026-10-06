"use strict";
/* DESTINATION PATH: server/public/admin/js/marketplace-settings.js\n   Marketplace Settings contains Long/Short engine settings only. */
(()=>{
  const $=id=>document.getElementById(id);const token=()=>String(localStorage.getItem("token")||"").trim();
  const headers=()=>({"Content-Type":"application/json",Authorization:`Bearer ${token()}`});const arr=v=>String(v||"").split(/[\s,]+/).map(x=>x.trim()).filter(Boolean);
  let preserved={enabled:true,dateWindowDays:7,totalDailyTripLimit:0};
  function engineMarkup(p){return `<div class="checks"><label><input id="${p}Enabled" type="checkbox"> Engine Enabled</label><label><input id="${p}Auto" type="checkbox"> Auto Accept</label></div>
    <div class="row"><div><label>Miles From</label><input id="${p}Min" type="number" min="0"></div><div><label>Miles To</label><input id="${p}Max" type="number" min="0"></div></div>
    <div class="row"><div><label>Pickup Time From</label><input id="${p}PUFrom" type="time"></div><div><label>Pickup Time To</label><input id="${p}PUTo" type="time"></div></div>
    <div class="row"><div><label>Dropoff Time From</label><input id="${p}DOFrom" type="time"></div><div><label>Dropoff Time To</label><input id="${p}DOTo" type="time"></div></div>
    <div class="row"><div><label>Pickup ZIPs</label><input id="${p}PUZip" placeholder="85224, 85225"></div><div><label>Dropoff ZIPs</label><input id="${p}DOZip" placeholder="85001, 85701"></div></div>
    <div class="row"><div><label>Zone Match</label><select id="${p}Zone"><option>ANY</option><option>PICKUP</option><option>DROPOFF</option><option>EITHER</option><option>BOTH</option></select></div><div><label>Daily Trip Limit</label><input id="${p}Limit" type="number" min="0"></div></div>
    <label>Modes / Services</label><input id="${p}Modes" placeholder="Ambulatory, Wheelchair">`;}
  $("longEngine").insertAdjacentHTML("beforeend",engineMarkup("long"));$("shortEngine").insertAdjacentHTML("beforeend",engineMarkup("short"));
  async function api(path,opt={}){const r=await fetch(`/api/marketplace${path}`,{...opt,headers:headers(),cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||`HTTP ${r.status}`);return d;}
  function read(p){return{enabled:$(`${p}Enabled`).checked,autoAccept:$(`${p}Auto`).checked,milesMin:Number($(`${p}Min`).value)||0,milesMax:Number($(`${p}Max`).value)||0,dailyTripLimit:Number($(`${p}Limit`).value)||0,pickupTimeFrom:$(`${p}PUFrom`).value||"00:00",pickupTimeTo:$(`${p}PUTo`).value||"23:59",dropoffTimeFrom:$(`${p}DOFrom`).value||"00:00",dropoffTimeTo:$(`${p}DOTo`).value||"23:59",pickupZipCodes:arr($(`${p}PUZip`).value),dropoffZipCodes:arr($(`${p}DOZip`).value),zoneMatch:$(`${p}Zone`).value,modes:arr($(`${p}Modes`).value)};}
  function fill(p,e={}){$(`${p}Enabled`).checked=!!e.enabled;$(`${p}Auto`).checked=!!e.autoAccept;for(const [s,k,d] of [["Min","milesMin",p==="long"?10:0],["Max","milesMax",p==="long"?50:9.99],["Limit","dailyTripLimit",0],["PUFrom","pickupTimeFrom","00:00"],["PUTo","pickupTimeTo","23:59"],["DOFrom","dropoffTimeFrom","00:00"],["DOTo","dropoffTimeTo","23:59"],["Zone","zoneMatch","ANY"]])$(`${p}${s}`).value=e[k]??d;$(`${p}PUZip`).value=(e.pickupZipCodes||[]).join(", ");$(`${p}DOZip`).value=(e.dropoffZipCodes||[]).join(", ");$(`${p}Modes`).value=(e.modes||[]).join(", ");}
  async function load(){try{const d=await api("/settings");const s=d.settings||{};preserved={enabled:s.enabled!==false,dateWindowDays:Number(s.dateWindowDays||7),totalDailyTripLimit:Number(s.totalDailyTripLimit||0)};fill("long",s.longEngine||{});fill("short",s.shortEngine||{});}catch(e){$("message").textContent=e.message;}}
  $("saveBtn").addEventListener("click",async()=>{try{$("message").textContent="Saving...";await api("/settings",{method:"PUT",body:JSON.stringify({...preserved,longEngine:read("long"),shortEngine:read("short")})});$("message").textContent="Saved.";}catch(e){$("message").textContent=e.message;}});load();
})();
