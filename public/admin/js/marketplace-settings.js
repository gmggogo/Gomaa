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
  $("shortBody").innerHTML=engineBody("short");

  let editing=false;
  let lastLoaded=null;

  function editableControls(){
    return [
      ...document.querySelectorAll(
        "#longEngine input,#longEngine select,#shortEngine input,#shortEngine select,#generalEditRow input,#generalEditRow select"
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

    fillEngine("long",settings.longEngine||{});
    fillEngine("short",settings.shortEngine||{});

    updateHeaderStatus();
    setEditing(false);
  }

  async function load(){
    try{
      const data=await api("/settings");
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
        longEngine:readEngine("long"),
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
