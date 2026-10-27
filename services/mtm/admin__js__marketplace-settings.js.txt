TARGET PATH: server/admin/js/marketplace-settings.js

"use strict";

(()=>{
  const $=id=>document.getElementById(id);

  const token=()=>String(
    localStorage.getItem("token") ||
    sessionStorage.getItem("token") ||
    ""
  ).trim();

  const headers=()=>({
    "Content-Type":"application/json",
    Authorization:`Bearer ${token()}`
  });

  const arr=value=>
    String(value||"")
      .split(/[\s,]+/)
      .map(x=>x.trim())
      .filter(Boolean);

  async function api(path,opt={}){
    const response=await fetch(
      `/api/marketplace${path}`,
      {
        ...opt,
        headers:{
          ...headers(),
          ...(opt.headers||{})
        },
        cache:"no-store"
      }
    );

    const data=await response.json().catch(()=>({}));

    if(!response.ok){
      throw new Error(data.message || `HTTP ${response.status}`);
    }

    return data;
  }

  function engineBody(prefix){
    return `
      <div class="filter-head zone">Zone Center & Radius</div>

      <div class="row3">
        <div>
          <label>Pickup Zone City</label>
          <input id="${prefix}PUCity" placeholder="Baker">
        </div>
        <div>
          <label>State</label>
          <input id="${prefix}PUState" maxlength="2" placeholder="LA">
        </div>
        <div>
          <label>ZIP Code</label>
          <input id="${prefix}PUZip" inputmode="numeric" maxlength="10" placeholder="70714">
        </div>
      </div>

      <div style="margin-bottom:12px">
        <label>Pickup Zone Full Address (optional)</label>
        <input id="${prefix}PUAddress" placeholder="Exact street address for a precise zone center">
      </div>

      <div class="row3">
        <div>
          <label>Dropoff Zone City</label>
          <input id="${prefix}DOCity" placeholder="Baker">
        </div>
        <div>
          <label>State</label>
          <input id="${prefix}DOState" maxlength="2" placeholder="LA">
        </div>
        <div>
          <label>ZIP Code</label>
          <input id="${prefix}DOZip" inputmode="numeric" maxlength="10" placeholder="70714">
        </div>
      </div>

      <div style="margin-bottom:12px">
        <label>Dropoff Zone Full Address (optional)</label>
        <input id="${prefix}DOAddress" placeholder="Exact street address for a precise zone center">
      </div>

      <div class="row">
        <div>
          <label>Zone Radius Miles</label>
          <input id="${prefix}Radius" type="number" min="0" step="1" value="200">
          <div class="note">Radius around the selected location. This is not trip length.</div>
        </div>

        <div>
          <label>Zone Match</label>
          <select id="${prefix}Zone">
            <option value="PICKUP">PICKUP</option>
            <option value="DROPOFF">DROPOFF</option>
            <option value="EITHER">EITHER</option>
            <option value="BOTH">BOTH</option>
            <option value="ANY">ANY</option>
          </select>
        </div>
      </div>

      <div class="filter-head trip">Trip Distance Filters</div>

      <div class="row">
        <div>
          <label>Trip Miles From</label>
          <input id="${prefix}TripMin" type="number" min="0" step="0.1" value="0">
        </div>
        <div>
          <label>Trip Miles To</label>
          <input id="${prefix}TripMax" type="number" min="0" step="0.1" value="0">
          <div class="note">0 = no maximum trip-length limit.</div>
        </div>
      </div>

      <div class="filter-head time">Time Filters</div>

      <div class="row">
        <div>
          <label>Pickup Time From</label>
          <input id="${prefix}PUFrom" type="time" value="00:00">
        </div>
        <div>
          <label>Pickup Time To</label>
          <input id="${prefix}PUTo" type="time" value="23:59">
        </div>
      </div>

      <div class="row">
        <div>
          <label>Dropoff Time From</label>
          <input id="${prefix}DOFrom" type="time" value="00:00">
        </div>
        <div>
          <label>Dropoff Time To</label>
          <input id="${prefix}DOTo" type="time" value="23:59">
        </div>
      </div>

      <div class="filter-head service">Service & Limits</div>

      <div class="row">
        <div>
          <label>Services / Modes</label>
          <input id="${prefix}Modes" placeholder="Ambulatory, Wheelchair">
          <div class="note">Ambulatory matches Ambulatory Curb / Door-to-Door. Wheelchair also matches Paralift.</div>
        </div>

        <div>
          <label>Daily Trip Limit</label>
          <input id="${prefix}Limit" type="number" min="0" value="0">
          <div class="note">0 = unlimited.</div>
        </div>
      </div>
    `;
  }

  $("longBody").innerHTML=engineBody("long");
  $("mediumBody").innerHTML=engineBody("medium");
  $("shortBody").innerHTML=engineBody("short");

  let editing=false;
  let lastLoaded=null;
  let scheduleVehicles=[];

  function editableControls(){
    return [
      ...document.querySelectorAll(
        "#longEngine input,#longEngine select,#mediumEngine input,#mediumEngine select,#shortEngine input,#shortEngine select,#generalEditRow input,#generalEditRow select,#globalSettings input,#globalSettings select,#vehicleConfigs input,#vehicleConfigs select"
      )
    ];
  }

  function setEditing(value){
    editing=value===true;

    editableControls().forEach(control=>{
      control.disabled=!editing;
    });

    $("saveBtn").disabled=!editing;
    $("editBtn").style.display=editing ? "none" : "inline-block";
    $("cancelBtn").style.display=editing ? "inline-block" : "none";
    $("generalEditRow").style.display=editing ? "block" : "none";
    $("globalSettings").style.display=editing ? "block" : "none";

    $("lockNote").textContent=
      editing
        ? "Edit mode is open. Save to apply changes."
        : "Settings are locked. Click Edit to make changes.";

    if(editing){
      $("saveBtn").classList.remove("saved");
      $("message").textContent="";
      $("message").className="";
    }
  }

  function updateHeaderStatus(){
    const on=$("enabled").value==="true";

    $("marketStatus").textContent=
      on ? "Marketplace Enabled" : "Marketplace Disabled";

    $("marketStatus").className=
      `status-pill ${on ? "on" : "off"}`;

    $("totalLimitView").textContent=
      Number($("totalDailyTripLimit").value)||0;
  }

  function readEngine(prefix){
    return {
      enabled:$(`${prefix}Enabled`).checked,
      autoAccept:$(`${prefix}Auto`).checked,

      pickupZoneCity:$(`${prefix}PUCity`).value.trim(),
      pickupZoneState:$(`${prefix}PUState`).value.trim().toUpperCase(),
      pickupZoneZip:$(`${prefix}PUZip`).value.trim(),
      pickupZoneAddress:$(`${prefix}PUAddress`).value.trim(),

      dropoffZoneCity:$(`${prefix}DOCity`).value.trim(),
      dropoffZoneState:$(`${prefix}DOState`).value.trim().toUpperCase(),
      dropoffZoneZip:$(`${prefix}DOZip`).value.trim(),
      dropoffZoneAddress:$(`${prefix}DOAddress`).value.trim(),

      pickupZipCodes:arr($(`${prefix}PUZip`).value),
      dropoffZipCodes:arr($(`${prefix}DOZip`).value),

      zoneRadiusMiles:Number($(`${prefix}Radius`).value)||0,
      zoneMatch:$(`${prefix}Zone`).value,

      tripMilesMin:Number($(`${prefix}TripMin`).value)||0,
      tripMilesMax:Number($(`${prefix}TripMax`).value)||0,

      pickupTimeFrom:$(`${prefix}PUFrom`).value||"00:00",
      pickupTimeTo:$(`${prefix}PUTo`).value||"23:59",
      dropoffTimeFrom:$(`${prefix}DOFrom`).value||"00:00",
      dropoffTimeTo:$(`${prefix}DOTo`).value||"23:59",

      modes:arr($(`${prefix}Modes`).value),
      dailyTripLimit:Number($(`${prefix}Limit`).value)||0
    };
  }

  function fillEngine(prefix,engine={}){
    $(`${prefix}Enabled`).checked=engine.enabled===true;
    $(`${prefix}Auto`).checked=engine.autoAccept===true;

    $(`${prefix}PUCity`).value=engine.pickupZoneCity||"";
    $(`${prefix}PUState`).value=engine.pickupZoneState||"";
    $(`${prefix}PUZip`).value=
      engine.pickupZoneZip ||
      (engine.pickupZipCodes||[])[0] ||
      "";
    $(`${prefix}PUAddress`).value=engine.pickupZoneAddress||"";

    $(`${prefix}DOCity`).value=engine.dropoffZoneCity||"";
    $(`${prefix}DOState`).value=engine.dropoffZoneState||"";
    $(`${prefix}DOZip`).value=
      engine.dropoffZoneZip ||
      (engine.dropoffZipCodes||[])[0] ||
      "";
    $(`${prefix}DOAddress`).value=engine.dropoffZoneAddress||"";

    const legacyRadius=Number(engine.milesMax)||0;

    $(`${prefix}Radius`).value=
      engine.zoneRadiusMiles ??
      legacyRadius ??
      200;

    $(`${prefix}Zone`).value=
      engine.zoneMatch || "PICKUP";

    $(`${prefix}TripMin`).value=
      Number(engine.tripMilesMin)||0;

    $(`${prefix}TripMax`).value=
      Number(engine.tripMilesMax)||0;

    $(`${prefix}PUFrom`).value=
      engine.pickupTimeFrom || "00:00";

    $(`${prefix}PUTo`).value=
      engine.pickupTimeTo || "23:59";

    $(`${prefix}DOFrom`).value=
      engine.dropoffTimeFrom || "00:00";

    $(`${prefix}DOTo`).value=
      engine.dropoffTimeTo || "23:59";

    $(`${prefix}Modes`).value=
      (engine.modes||[]).join(", ");

    $(`${prefix}Limit`).value=
      Number(engine.dailyTripLimit)||0;
  }

  function fill(settings={}){
    lastLoaded=JSON.parse(JSON.stringify(settings||{}));

    $("enabled").value=
      settings.enabled===false
        ? "false"
        : "true";

    $("totalDailyTripLimit").value=
      Number(settings.totalDailyTripLimit)||0;
    $("dateWindowDays").value=
      Number(settings.dateWindowDays)||7;

    $("acceptEnabled").value=settings.acceptEnabled===false ? "false" : "true";
    $("longMinMiles").value=Number(settings.longMinMiles ?? 100);
    $("mediumMinMiles").value=Number(settings.mediumMinMiles ?? 50);
    $("targetDailyMilesMin").value=Number(settings.targetDailyMilesMin ?? 150);
    $("targetDailyMilesMax").value=Number(settings.targetDailyMilesMax ?? 500);
    $("pickupLateToleranceMinutes").value=Number(settings.pickupLateToleranceMinutes)||0;
    $("dropoffLateToleranceMinutes").value=Number(settings.dropoffLateToleranceMinutes)||0;
    $("noShowReplacementEnabled").value=settings.noShowReplacementEnabled===true ? "true" : "false";
    $("cancelReplacementEnabled").value=settings.cancelReplacementEnabled===true ? "true" : "false";

    fillEngine("long",settings.longEngine||{});
    fillEngine("medium",settings.mediumEngine||{});
    fillEngine("short",settings.shortEngine||{});
    renderVehicleConfigs(settings.vehicleConfigs||[]);

    updateHeaderStatus();
    setEditing(false);
  }

  function renderVehicleConfigs(savedConfigs=[]){
    const saved=new Map((Array.isArray(savedConfigs)?savedConfigs:[]).map(row=>[
      `${String(row.driverId||"")}:${String(row.vehicleNumber||"")}`,row
    ]));
    const host=$("vehicleConfigs");
    if(!scheduleVehicles.length){
      host.innerHTML='<div class="note">No scheduled vehicles were found. Add a vehicle number and services in Driver Schedule first.</div>';
      $("vehicleCount").textContent="0";
      return;
    }
    $("vehicleCount").textContent=String(scheduleVehicles.length);
    host.innerHTML=scheduleVehicles.map(vehicle=>{
      const key=`${vehicle.driverId}:${vehicle.vehicleNumber}`;
      const cfg=saved.get(key)||{};
      const categories=cfg.tripCategories||{};
      const services=(vehicle.services||[]).join(", ")||"ALL";
      const check=(name,label,checked)=>`<label><input data-field="${name}" type="checkbox" ${checked?"checked":""}> ${label}</label>`;
      const number=(name,label,value,min=0)=>`<div><label>${label}</label><input data-field="${name}" type="number" min="${min}" step="1" value="${Number(value)||0}"></div>`;
      const time=(name,label,value)=>`<div><label>${label}</label><input data-field="${name}" type="time" value="${value||"08:00"}"></div>`;
      return `<article class="vehicle-card" data-driver-id="${escapeHtml(vehicle.driverId)}" data-vehicle-number="${escapeHtml(vehicle.vehicleNumber)}" data-services="${escapeHtml(JSON.stringify(vehicle.services||["ALL"]))}">
        <div class="vehicle-card-head"><strong>Vehicle ${escapeHtml(vehicle.vehicleNumber)} — ${escapeHtml(vehicle.driverName||"Driver")}</strong>${check("enabled","Enabled",cfg.enabled!==false)}</div>
        <div class="vehicle-card-body"><div class="note">Services from Driver Schedule: ${escapeHtml(services)}</div>
          <div class="checks">${check("catLong","Long",categories.long!==false)}${check("catMedium","Medium",categories.medium!==false)}${check("catShort","Short",categories.short!==false)}</div>
          <div class="filter-head time">Work Hours & Mileage</div><div class="vehicle-fields">
            ${time("shiftStart","Work Starts",cfg.shiftStart||"08:00")}${time("shiftEnd","Work Ends",cfg.shiftEnd||"18:00")}
            ${number("minDailyMiles","Minimum Daily Miles",cfg.minDailyMiles??150)}${number("maxDailyMiles","Maximum Daily Miles",cfg.maxDailyMiles??500)}
            ${number("maxDeadheadMiles","Maximum Empty Miles",cfg.maxDeadheadMiles??150)}
          </div>
          <div class="filter-head trip" style="margin-top:12px">Optional Break</div><div class="checks">${check("breakEnabled","Schedule a break",cfg.breakEnabled===true)}</div>
          <div class="vehicle-fields">${number("breakDurationMinutes","Duration (minutes)",cfg.breakDurationMinutes??30)}${time("breakWindowFrom","Available From",cfg.breakWindowFrom||"12:00")}${time("breakWindowTo","Available Until",cfg.breakWindowTo||"15:00")}</div>
        </div>
      </article>`;
    }).join("");
    editableControls().forEach(control=>control.disabled=!editing);
  }

  function escapeHtml(value){
    return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  }

  function readVehicleConfigs(){
    return [...document.querySelectorAll(".vehicle-card")].map(card=>{
      const value=name=>card.querySelector(`[data-field="${name}"]`);
      let services=[];try{services=JSON.parse(card.dataset.services||"[]");}catch(_){services=[];}
      return {
        driverId:card.dataset.driverId,
        driverName:card.querySelector(".vehicle-card-head strong")?.textContent.split(" — ").slice(1).join(" — ")||"",
        vehicleNumber:card.dataset.vehicleNumber,
        services,
        enabled:value("enabled").checked,
        tripCategories:{long:value("catLong").checked,medium:value("catMedium").checked,short:value("catShort").checked},
        shiftStart:value("shiftStart").value,shiftEnd:value("shiftEnd").value,
        minDailyMiles:Number(value("minDailyMiles").value)||0,
        maxDailyMiles:Number(value("maxDailyMiles").value)||0,
        maxDeadheadMiles:Number(value("maxDeadheadMiles").value)||0,
        breakEnabled:value("breakEnabled").checked,
        breakDurationMinutes:Number(value("breakDurationMinutes").value)||0,
        breakWindowFrom:value("breakWindowFrom").value,breakWindowTo:value("breakWindowTo").value
      };
    });
  }

  async function loadScheduleVehicles(){
    const [scheduleResponse,dispatchResponse]=await Promise.all([
      fetch("/api/driver-schedule",{headers:headers(),cache:"no-store"}),
      fetch("/api/dispatch",{headers:headers(),cache:"no-store"})
    ]);
    if(!scheduleResponse.ok||!dispatchResponse.ok) throw new Error("Could not load Driver Schedule vehicles");
    const [schedule,dispatch]=await Promise.all([scheduleResponse.json(),dispatchResponse.json()]);
    const drivers=Array.isArray(dispatch.drivers)?dispatch.drivers:[];
    scheduleVehicles=Object.entries(schedule||{}).map(([driverId,row])=>{
      const driver=drivers.find(item=>String(item._id||item.id)===String(driverId))||{};
      return {driverId,driverName:driver.name||driver.fullName||driver.username||"",vehicleNumber:String(row.vehicleNumber||"").trim(),services:Array.isArray(row.services)?row.services:["ALL"],enabled:row.enabled!==false};
    }).filter(row=>row.enabled&&row.vehicleNumber);
  }

  async function load(){
    try{
      const [data]=await Promise.all([api("/settings"),loadScheduleVehicles().catch(err=>{
        scheduleVehicles=[];
        $("vehicleConfigs").innerHTML=`<div class="note">${escapeHtml(err.message)}. Vehicle settings are temporarily unavailable.</div>`;
      })]);
      fill(data.settings||{});
      $("message").textContent="";
      $("message").className="";
    }catch(err){
      $("message").textContent=err.message;
      $("message").className="bad";
    }
  }

  $("editBtn").addEventListener("click",()=>{
    setEditing(true);
  });

  $("cancelBtn").addEventListener("click",()=>{
    if(lastLoaded){
      fill(lastLoaded);
    }else{
      setEditing(false);
    }
  });

  $("enabled").addEventListener("change",updateHeaderStatus);
  $("totalDailyTripLimit").addEventListener("input",updateHeaderStatus);

  $("saveBtn").addEventListener("click",async()=>{
    try{
      $("saveBtn").disabled=true;
      $("message").textContent="Saving...";
      $("message").className="";

      const payload={
        enabled:$("enabled").value==="true",
        totalDailyTripLimit:Number($("totalDailyTripLimit").value)||0,
        dateWindowDays:Number($("dateWindowDays").value)||7,
        acceptEnabled:$("acceptEnabled").value==="true",
        longMinMiles:Number($("longMinMiles").value)||0,
        mediumMinMiles:Number($("mediumMinMiles").value)||0,
        targetDailyMilesMin:Number($("targetDailyMilesMin").value)||0,
        targetDailyMilesMax:Number($("targetDailyMilesMax").value)||0,
        pickupLateToleranceMinutes:Number($("pickupLateToleranceMinutes").value)||0,
        dropoffLateToleranceMinutes:Number($("dropoffLateToleranceMinutes").value)||0,
        noShowReplacementEnabled:$("noShowReplacementEnabled").value==="true",
        cancelReplacementEnabled:$("cancelReplacementEnabled").value==="true",
        vehicleConfigs:readVehicleConfigs(),
        longEngine:readEngine("long"),
        mediumEngine:readEngine("medium"),
        shortEngine:readEngine("short")
      };

      const data=await api(
        "/settings",
        {
          method:"PUT",
          body:JSON.stringify(payload)
        }
      );

      fill(data.settings||payload);

      $("saveBtn").classList.add("saved");
      $("saveBtn").textContent="Saved ✓";
      $("message").textContent="Settings saved successfully.";
      $("message").className="ok";

      setTimeout(()=>{
        $("saveBtn").classList.remove("saved");
        $("saveBtn").textContent="Save Marketplace Settings";
      },1700);

    }catch(err){
      $("saveBtn").disabled=false;
      $("message").textContent=err.message;
      $("message").className="bad";
    }
  });

  load();
})();
