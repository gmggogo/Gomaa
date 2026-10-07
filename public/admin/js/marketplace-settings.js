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
      throw new Error(
        data.message ||
        `HTTP ${response.status}`
      );
    }

    return data;
  }

  function engineMarkup(prefix){
    return `
      <div class="checks">
        <label><input id="${prefix}Enabled" type="checkbox"> Engine Enabled</label>
        <label><input id="${prefix}Auto" type="checkbox"> Auto Accept</label>
      </div>

      <div class="section-label">Zone Filter</div>

      <div class="row">
        <div>
          <label>Pickup Zone ZIPs</label>
          <input id="${prefix}PUZip" placeholder="70714">
          <div class="note">Each ZIP is a center point for the radius.</div>
        </div>

        <div>
          <label>Dropoff Zone ZIPs</label>
          <input id="${prefix}DOZip" placeholder="70714">
          <div class="note">Used when Zone Match includes Dropoff.</div>
        </div>
      </div>

      <div class="row">
        <div>
          <label>Zone Radius Miles</label>
          <input id="${prefix}Radius" type="number" min="0" step="1" value="200">
          <div class="note">This is NOT trip length. It is the radius around the ZIP center(s).</div>
        </div>

        <div>
          <label>Zone Match</label>
          <select id="${prefix}Zone">
            <option value="ANY">ANY</option>
            <option value="PICKUP">PICKUP</option>
            <option value="DROPOFF">DROPOFF</option>
            <option value="EITHER">EITHER</option>
            <option value="BOTH">BOTH</option>
          </select>
        </div>
      </div>

      <div class="section-label">Trip Filters</div>

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

      <div class="row">
        <div>
          <label>Services / Modes</label>
          <input id="${prefix}Modes" placeholder="Ambulatory, Wheelchair">
          <div class="note">Ambulatory also matches Ambulatory Curb / Door-to-Door. Wheelchair also matches Paralift.</div>
        </div>

        <div>
          <label>Daily Trip Limit</label>
          <input id="${prefix}Limit" type="number" min="0" value="0">
          <div class="note">0 = unlimited.</div>
        </div>
      </div>
    `;
  }

  $("longEngine").insertAdjacentHTML(
    "beforeend",
    engineMarkup("long")
  );

  $("shortEngine").insertAdjacentHTML(
    "beforeend",
    engineMarkup("short")
  );

  function readEngine(prefix){
    return {
      enabled:$(`${prefix}Enabled`).checked,
      autoAccept:$(`${prefix}Auto`).checked,
      zoneRadiusMiles:Number($(`${prefix}Radius`).value)||0,
      tripMilesMin:Number($(`${prefix}TripMin`).value)||0,
      tripMilesMax:Number($(`${prefix}TripMax`).value)||0,
      pickupZipCodes:arr($(`${prefix}PUZip`).value),
      dropoffZipCodes:arr($(`${prefix}DOZip`).value),
      zoneMatch:$(`${prefix}Zone`).value,
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

    const legacyRadius=
      Number(engine.milesMax)||0;

    $(`${prefix}Radius`).value=
      engine.zoneRadiusMiles ??
      legacyRadius ??
      200;

    $(`${prefix}TripMin`).value=
      Number(engine.tripMilesMin)||0;

    $(`${prefix}TripMax`).value=
      Number(engine.tripMilesMax)||0;

    $(`${prefix}PUZip`).value=
      (engine.pickupZipCodes||[]).join(", ");

    $(`${prefix}DOZip`).value=
      (engine.dropoffZipCodes||[]).join(", ");

    $(`${prefix}Zone`).value=
      engine.zoneMatch || "ANY";

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

  async function load(){
    try{
      const data=await api("/settings");
      const settings=data.settings||{};

      $("enabled").checked=
        settings.enabled!==false;

      $("totalDailyTripLimit").value=
        Number(settings.totalDailyTripLimit)||0;

      fillEngine(
        "long",
        settings.longEngine || {}
      );

      fillEngine(
        "short",
        settings.shortEngine || {}
      );

      $("message").textContent="";
    }catch(err){
      $("message").textContent=err.message;
    }
  }

  $("saveBtn").addEventListener(
    "click",
    async()=>{
      try{
        $("saveBtn").disabled=true;
        $("message").textContent="Saving...";

        await api(
          "/settings",
          {
            method:"PUT",
            body:JSON.stringify({
              enabled:$("enabled").checked,
              totalDailyTripLimit:Number($("totalDailyTripLimit").value)||0,
              longEngine:readEngine("long"),
              shortEngine:readEngine("short")
            })
          }
        );

        $("message").textContent="Saved.";
      }catch(err){
        $("message").textContent=err.message;
      }finally{
        $("saveBtn").disabled=false;
      }
    }
  );

  load();
})();
