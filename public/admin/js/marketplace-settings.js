"use strict";

(()=>{
  const $=id=>document.getElementById(id);
  const token=()=>String(localStorage.getItem("token")||sessionStorage.getItem("token")||"").trim();
  const headers=()=>{
    const value=token();
    return {"Content-Type":"application/json",...(value?{Authorization:`Bearer ${value}`,"x-access-token":value}:{})};
  };
  const clean=value=>String(value??"").trim();
  const normalizeId=value=>clean(value).toLowerCase();
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const list=value=>Array.isArray(value)?value.map(clean).filter(Boolean):[];

  async function request(path,options={}){
    const response=await fetch(path,{...options,headers:{...headers(),...(options.headers||{})},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.message||data.error||`Request failed (${response.status})`);
    return data;
  }
  async function settingsApi(path,options={}){
    const response=await fetch(`/api/marketplace${path}`,{...options,headers:{...headers(),...(options.headers||{})},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.message||data.error||`Request failed (${response.status})`);
    return data;
  }

  let editing=false;
  let lastLoaded={};
  let scheduleVehicles=[];

  function controls(){return [...document.querySelectorAll("#generalEditRow input,#generalEditRow select,#vehicleConfigs input,#vehicleConfigs select")];}
  function setEditing(value){
    editing=value===true;
    controls().forEach(el=>el.disabled=!editing||(el.dataset.field==="enabled"&&el.closest(".vehicle-card")?.dataset.scheduleEnabled==="false"));
    $("saveBtn").disabled=!editing;
    $("editBtn").classList.toggle("hidden",editing);
    $("cancelBtn").classList.toggle("hidden",!editing);
    $("generalEditRow").classList.toggle("hidden",!editing);
    $("lockNote").textContent=editing?"Edit mode is open. Save to apply changes.":"Settings are locked. Select Edit to make changes.";
    if(editing){$("message").textContent="";$("message").className="message";$("saveBtn").textContent="Save Settings";}
  }
  function status(){
    const on=$("enabled").value==="true";
    $("marketStatus").textContent=on?"Marketplace Enabled":"Marketplace Disabled";
    $("marketStatus").className=`pill ${on?"on":"off"}`;
    $("totalLimitView").textContent=String(Number($("totalDailyTripLimit").value)||0);
  }
  function setValue(id,value){$(id).value=String(value??"");}

  function fill(settings={}){
    lastLoaded=JSON.parse(JSON.stringify(settings||{}));
    $("enabled").value=settings.enabled===false?"false":"true";
    $("acceptEnabled").value=settings.acceptEnabled===false?"false":"true";
    setValue("totalDailyTripLimit",Number(settings.totalDailyTripLimit)||0);
    setValue("dateWindowDays",Number(settings.dateWindowDays)||7);
    setValue("longMinMiles",Number(settings.longMinMiles??100));
    setValue("mediumMinMiles",Number(settings.mediumMinMiles??50));
    setValue("pickupLateToleranceMinutes",Number(settings.pickupLateToleranceMinutes)||0);
    setValue("dropoffLateToleranceMinutes",Number(settings.dropoffLateToleranceMinutes)||0);
    $("noShowReplacementEnabled").value=settings.noShowReplacementEnabled===true?"true":"false";
    $("cancelReplacementEnabled").value=settings.cancelReplacementEnabled===true?"true":"false";
    renderVehicles(settings.vehicleConfigs||[]);
    status();
    setEditing(false);
  }

  function field(name,label,value,type="text",options={}){
    const attrs=type==="number"?`min="${options.min??0}" step="${options.step??1}"`:type==="time"?"":"";
    return `<div class="field ${options.full?"full":""}"><label>${esc(label)}</label><input data-field="${esc(name)}" type="${type}" ${attrs} value="${esc(value??"")}"></div>`;
  }
  function zoneMatchSelect(value){
    const selected=clean(value||"PICKUP").toUpperCase();
    return `<div class="field"><label>Zone Match</label><select data-field="zoneMatch">${[["PICKUP","Pickup"],["DROPOFF","Drop-off"],["EITHER","Pickup or drop-off"],["BOTH","Both ends"],["ANY","Any" ]].map(([v,l])=>`<option value="${v}" ${selected===v?"selected":""}>${l}</option>`).join("")}</select></div>`;
  }
  function check(name,label,checked){return `<label><input data-field="${esc(name)}" type="checkbox" ${checked?"checked":""}> ${esc(label)}</label>`;}

  function renderVehicles(savedConfigs=[]){
    const saved=new Map((Array.isArray(savedConfigs)?savedConfigs:[]).map(row=>[
      `${normalizeId(row.driverId)}:${clean(row.vehicleNumber)}`,row
    ]));
    const host=$("vehicleConfigs");
    if(!scheduleVehicles.length){
      host.innerHTML='<div class="empty">No vehicle numbers were returned by Driver Schedule. Add a vehicle number to an active driver schedule, then refresh this page.</div>';
      $("vehicleCount").textContent="0";
      return;
    }
    $("vehicleCount").textContent=String(scheduleVehicles.length);
    host.innerHTML=scheduleVehicles.map(vehicle=>{
      const key=`${normalizeId(vehicle.driverId)}:${clean(vehicle.vehicleNumber)}`;
      const cfg=saved.get(key)||{};
      const categories=cfg.tripCategories||{};
      const services=list(vehicle.services).length?list(vehicle.services):["ALL"];
      const sourceOff=vehicle.scheduleEnabled===false;
      return `<article class="vehicle-card ${sourceOff?"inactive":""}" data-driver-id="${esc(vehicle.driverId)}" data-driver-name="${esc(vehicle.driverName)}" data-vehicle-number="${esc(vehicle.vehicleNumber)}" data-vehicle-category="${esc(vehicle.vehicleCategory||"GENERIC")}" data-services="${esc(JSON.stringify(services))}" data-schedule-enabled="${sourceOff?"false":"true"}">
        <header class="vehicle-head"><div><div class="vehicle-title">Vehicle ${esc(vehicle.vehicleNumber)}</div><div class="vehicle-subtitle">Driver: ${esc(vehicle.driverName||`ID ${vehicle.driverId}`)}${sourceOff?" · Disabled in Driver Schedule":""}</div></div><label class="vehicle-toggle"><input data-field="enabled" type="checkbox" ${cfg.enabled!==false&&!sourceOff?"checked":""} ${sourceOff?"disabled":""}> Use in MTM</label></header>
        <div class="vehicle-body">
          <div class="service-note">Services from Driver Schedule: <strong>${esc(services.join(", "))}</strong> · Vehicle type: <strong>${esc(vehicle.vehicleCategory||"Not set")}</strong></div>
          <div class="card-section categories">Trip Types Allowed for This Vehicle</div><div class="check-row">${check("catLong","Long",categories.long!==false)}${check("catMedium","Medium",categories.medium!==false)}${check("catShort","Short",categories.short!==false)}</div>
          <div class="card-section zone">Vehicle Zone</div><div class="fields">
            ${field("pickupZoneCity","Zone City",cfg.pickupZoneCity||"")}${field("pickupZoneState","State",cfg.pickupZoneState||"")}
            ${field("pickupZoneZip","ZIP Code",cfg.pickupZoneZip||"")}${field("zoneRadiusMiles","Zone Radius (miles)",cfg.zoneRadiusMiles??200,"number")}
            ${field("pickupZoneAddress","Zone Address (optional)",cfg.pickupZoneAddress||"","text",{full:true})}
            ${field("dropoffZoneCity","Destination City (optional)",cfg.dropoffZoneCity||"")}${field("dropoffZoneState","Destination State",cfg.dropoffZoneState||"")}
            ${field("dropoffZoneZip","Destination ZIP",cfg.dropoffZoneZip||"")}${zoneMatchSelect(cfg.zoneMatch)}
          </div><div class="help">The previous trip’s drop-off is used as the next search location; the driver’s live GPS does not reset the schedule.</div>
          <div class="card-section hours">Work Hours</div><div class="fields">
            ${field("shiftStart","Work Starts",cfg.shiftStart||"08:00","time")}${field("shiftEnd","Work Ends",cfg.shiftEnd||"18:00","time")}
            ${field("maxWorkHours","Maximum Work Hours",cfg.maxWorkHours??10,"number")}
          </div>
          <div class="card-section miles">Passenger Miles & Empty Miles</div><div class="fields">
            ${field("minDailyMiles","Daily Passenger Miles Minimum",cfg.minDailyMiles??150,"number")}${field("maxDailyMiles","Daily Passenger Miles Maximum",cfg.maxDailyMiles??400,"number")}
            ${field("maxDeadheadMiles","Maximum Empty Miles Between Trips",cfg.maxDeadheadMiles??150,"number")}
          </div><div class="help">Passenger miles and empty travel miles are tracked separately.</div>
          <div class="card-section break">Optional Break</div><div class="check-row">${check("breakEnabled","Schedule a break",cfg.breakEnabled===true)}</div><div class="fields">
            ${field("breakDurationMinutes","Break Duration (minutes)",cfg.breakDurationMinutes??30,"number")}${field("breakWindowFrom","Available From",cfg.breakWindowFrom||"12:00","time")}
            ${field("breakWindowTo","Available Until",cfg.breakWindowTo||"15:00","time")}
          </div>
        </div>
      </article>`;
    }).join("");
    controls().forEach(el=>el.disabled=!editing||(el.dataset.field==="enabled"&&el.closest(".vehicle-card")?.dataset.scheduleEnabled==="false"));
  }

  function normalizeDriverRows(data){
    const rows=Array.isArray(data)?data:Array.isArray(data?.drivers)?data.drivers:Array.isArray(data?.users)?data.users:[];
    return rows.map(row=>({
      id:normalizeId(row?._id||row?.id||row?.userId||row?.driverId),
      name:clean(row?.name||row?.fullName||row?.displayName||row?.username)
    })).filter(row=>row.id);
  }
  function normalizeScheduleRows(data){
    let source=data?.schedule&&typeof data.schedule==="object"?data.schedule:data;
    if(Array.isArray(source)) return source.map(row=>[row?.driverId||row?.userId||row?._id||row?.id,row]);
    if(source&&typeof source==="object") return Object.entries(source);
    return [];
  }
  async function loadScheduleVehicles(){
    const schedulePromise=request("/api/driver-schedule");
    const driverPromise=request("/api/users/DRIVER").catch(()=>request("/api/dispatch"));
    const [scheduleData,driverData]=await Promise.all([schedulePromise,driverPromise]);
    const drivers=normalizeDriverRows(driverData);
    const driverById=new Map(drivers.map(row=>[row.id,row.name]));
    scheduleVehicles=normalizeScheduleRows(scheduleData).map(([rawId,raw])=>{
      const row=raw&&typeof raw==="object"?raw:{};
      const driverId=clean(row.driverId||row.userId||rawId);
      const vehicleNumber=clean(row.vehicleNumber||row.vehicleNo||row.vehicle||row.carNumber);
      const matchedName=driverById.get(normalizeId(driverId));
      const driverName=matchedName||clean(row.driverName||row.name);
      return {driverId,driverName,vehicleNumber,services:Array.isArray(row.services)?row.services:["ALL"],vehicleCategory:clean(row.vehicleCategory||row.vehicleType),scheduleEnabled:row.enabled!==false};
    }).filter(row=>row.driverId&&row.vehicleNumber);
    const distinct=new Map();
    scheduleVehicles.forEach(row=>distinct.set(`${normalizeId(row.driverId)}:${row.vehicleNumber}`,row));
    scheduleVehicles=[...distinct.values()].sort((a,b)=>a.vehicleNumber.localeCompare(b.vehicleNumber,undefined,{numeric:true}));
    const unresolved=scheduleVehicles.filter(row=>!row.driverName).length;
    if(unresolved){$("loadNotice").textContent=`${unresolved} vehicle(s) loaded, but the driver name could not be matched from the roster. The driver ID is shown instead; verify the driver record.`;$("loadNotice").classList.remove("hidden");}
    else $("loadNotice").classList.add("hidden");
  }

  function readVehicleConfigs(){
    return [...document.querySelectorAll(".vehicle-card")].map(card=>{
      const get=name=>card.querySelector(`[data-field="${name}"]`);
      let services=[];try{services=JSON.parse(card.dataset.services||"[]");}catch(_){services=["ALL"];}
      const value=name=>get(name)?.value??"";
      const number=name=>Math.max(0,Number(value(name))||0);
      return {
        driverId:card.dataset.driverId,driverName:card.dataset.driverName,vehicleNumber:card.dataset.vehicleNumber,vehicleCategory:card.dataset.vehicleCategory,services,
        scheduleEnabled:card.dataset.scheduleEnabled!=="false",enabled:get("enabled")?.checked===true,
        tripCategories:{long:get("catLong")?.checked===true,medium:get("catMedium")?.checked===true,short:get("catShort")?.checked===true},
        shiftStart:value("shiftStart"),shiftEnd:value("shiftEnd"),maxWorkHours:number("maxWorkHours"),
        minDailyMiles:number("minDailyMiles"),maxDailyMiles:number("maxDailyMiles"),maxDeadheadMiles:number("maxDeadheadMiles"),
        breakEnabled:get("breakEnabled")?.checked===true,breakDurationMinutes:number("breakDurationMinutes"),breakWindowFrom:value("breakWindowFrom"),breakWindowTo:value("breakWindowTo"),
        pickupZoneCity:value("pickupZoneCity"),pickupZoneState:value("pickupZoneState").toUpperCase(),pickupZoneZip:value("pickupZoneZip"),pickupZoneAddress:value("pickupZoneAddress"),
        dropoffZoneCity:value("dropoffZoneCity"),dropoffZoneState:value("dropoffZoneState").toUpperCase(),dropoffZoneZip:value("dropoffZoneZip"),zoneRadiusMiles:number("zoneRadiusMiles"),zoneMatch:value("zoneMatch")
      };
    });
  }

  async function load(){
    $("message").textContent="Loading settings…";
    try{
      const [response]=await Promise.all([settingsApi("/settings"),loadScheduleVehicles()]);
      fill(response.settings||{});
      $("message").textContent="";
    }catch(err){
      $("vehicleConfigs").innerHTML=`<div class="empty">Could not load Marketplace settings or Driver Schedule: ${esc(err.message)}</div>`;
      $("message").textContent=err.message;$("message").className="message bad";
    }
  }

  $("editBtn").addEventListener("click",()=>setEditing(true));
  $("cancelBtn").addEventListener("click",()=>fill(lastLoaded));
  $("enabled").addEventListener("change",status);
  $("totalDailyTripLimit").addEventListener("input",status);
  $("saveBtn").addEventListener("click",async()=>{
    try{
      $("saveBtn").disabled=true;$("message").textContent="Saving…";$("message").className="message";
      const payload={
        ...lastLoaded,
        enabled:$("enabled").value==="true",acceptEnabled:$("acceptEnabled").value==="true",
        totalDailyTripLimit:Number($("totalDailyTripLimit").value)||0,dateWindowDays:Number($("dateWindowDays").value)||7,
        longMinMiles:Number($("longMinMiles").value)||0,mediumMinMiles:Number($("mediumMinMiles").value)||0,
        pickupLateToleranceMinutes:Number($("pickupLateToleranceMinutes").value)||0,dropoffLateToleranceMinutes:Number($("dropoffLateToleranceMinutes").value)||0,
        noShowReplacementEnabled:$("noShowReplacementEnabled").value==="true",cancelReplacementEnabled:$("cancelReplacementEnabled").value==="true",
      vehicleConfigs:scheduleVehicles.length?readVehicleConfigs():(lastLoaded.vehicleConfigs||[])
      };
      const response=await settingsApi("/settings",{method:"PUT",body:JSON.stringify(payload)});
      fill(response.settings||payload);
      $("saveBtn").textContent="Saved ✓";$("message").textContent="Settings saved successfully.";$("message").className="message ok";
      setTimeout(()=>{$("saveBtn").textContent="Save Settings";},1800);
    }catch(err){
      $("saveBtn").disabled=false;$("message").textContent=err.message;$("message").className="message bad";
    }
  });
  load();
})();
