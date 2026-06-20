/* ==========================================================================
   FACILITY PRICING OVERRIDE
   Service Management Default / Facility Custom Override
   ========================================================================== */

const API_URL = "/api/facility-pricing-override";

const role = localStorage.getItem("role") || "";
const token = localStorage.getItem("token") || "";
const adminName =
  localStorage.getItem("name") ||
  localStorage.getItem("fullName") ||
  localStorage.getItem("username") ||
  role ||
  "admin";

if(!["superadmin","admin"].includes(role)){
  window.location.href = "/admin/login.html";
}

/* ===============================
   STATE
================================ */

let facilities = [];
let services = [];
let overrides = [];

let selectedFacilityId = "";
let draftActive = false;
let draftServices = [];

/* ===============================
   ELEMENTS
================================ */

const facilitySearch =
  document.getElementById("facilitySearch");

const facilityList =
  document.getElementById("facilityList");

const mainContent =
  document.getElementById("mainContent");

/* ===============================
   HELPERS
================================ */

function authHeaders(){
  return token
    ? {
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      }
    : {
        "Content-Type":"application/json"
      };
}

function safe(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function clean(v){
  return String(v ?? "").trim();
}

function normalizeCode(v){
  const c = clean(v).toUpperCase();

  if(c === "STANDARD") return "ST";
  if(c === "WHEELCHAIR") return "WH";
  if(c === "SHARED") return "SH";
  if(c === "LIMO" || c === "LIMOUSINE") return "LM";
  if(c === "TAXI") return "TX";
  if(c === "XL") return "XL";

  return c;
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v){
  return num(v).toFixed(2);
}

function getOverride(facilityId){
  return overrides.find(o =>
    String(o.facilityId) === String(facilityId)
  );
}

function getSelectedFacility(){
  return facilities.find(f =>
    String(f._id) === String(selectedFacilityId)
  );
}

function serviceDefaultCopy(s){
  return {
    serviceKey: normalizeCode(s.serviceKey),
    serviceName: s.serviceName || s.name || s.title || s.serviceKey,
    pricingMode: s.pricingMode || "MILE",

    baseFare: num(s.baseFare),
    includedMiles: num(s.includedMiles),
    perMile: num(s.perMile),
    stopFee: num(s.stopFee),
    noShowFee: num(s.noShowFee),
    cancelFee: num(s.cancelFee),

    hourlyRate: num(s.hourlyRate),
    hourlyBillingMode: s.hourlyBillingMode || "FULL",

    sharedPrice: num(s.sharedPrice || s.baseFare)
  };
}

function getVisibleServicesForFacility(facility){

  /*
    دلوقتي:
    لو facility.allowedServices موجودة، نعرضها فقط.
    لو فاضية، نعرض كل خدمات Service Management.
  */

  const allowed =
    Array.isArray(facility?.allowedServices)
      ? facility.allowedServices.map(normalizeCode).filter(Boolean)
      : [];

  if(!allowed.length){
    return services;
  }

  return services.filter(s =>
    allowed.includes(normalizeCode(s.serviceKey))
  );
}

function buildDraftForFacility(facility){

  const override = getOverride(facility._id);
  const visibleServices = getVisibleServicesForFacility(facility);

  draftActive = override?.active === true;

  draftServices = visibleServices.map(s=>{

    const code = normalizeCode(s.serviceKey);

    const saved =
      Array.isArray(override?.services)
        ? override.services.find(x =>
            normalizeCode(x.serviceKey) === code
          )
        : null;

    return saved
      ? {
          ...serviceDefaultCopy(s),
          ...saved,
          serviceKey:code
        }
      : serviceDefaultCopy(s);
  });
}

/* ===============================
   LOAD
================================ */

async function loadAll(){

  const res = await fetch(`${API_URL}/bootstrap`,{
    headers: token ? {Authorization:"Bearer " + token} : {}
  });

  if(!res.ok){
    throw new Error("Failed to load facility pricing");
  }

  const data = await res.json();

  facilities =
    Array.isArray(data.facilities)
      ? data.facilities
      : [];

  services =
    Array.isArray(data.services)
      ? data.services
      : [];

  overrides =
    Array.isArray(data.overrides)
      ? data.overrides
      : [];

  if(!selectedFacilityId && facilities.length){
    selectedFacilityId = facilities[0]._id;
  }

  const selected = getSelectedFacility();

  if(selected){
    buildDraftForFacility(selected);
  }

  render();
}

/* ===============================
   RENDER FACILITY LIST
================================ */

function renderFacilityList(){

  if(!facilityList) return;

  const q =
    facilitySearch
      ? facilitySearch.value.toLowerCase().trim()
      : "";

  const filtered =
    facilities.filter(f =>
      f.name.toLowerCase().includes(q) ||
      String(f.email || "").toLowerCase().includes(q) ||
      String(f.username || "").toLowerCase().includes(q)
    );

  if(!filtered.length){
    facilityList.innerHTML =
      `<div class="empty">No facilities found</div>`;
    return;
  }

  facilityList.innerHTML =
    filtered.map(f=>{

      const override = getOverride(f._id);
      const active = override?.active === true;
      const cls = String(f._id) === String(selectedFacilityId)
        ? "active"
        : "";

      return `
        <div class="facility-item ${cls}" data-id="${safe(f._id)}">
          <div class="facility-name">${safe(f.name)}</div>
          <div class="facility-status ${active ? "on" : "off"}">
            ${active ? "Override Active" : "Using Service Management"}
          </div>
        </div>
      `;
    }).join("");

  facilityList
    .querySelectorAll(".facility-item")
    .forEach(el=>{
      el.onclick = ()=>{
        selectedFacilityId = el.dataset.id || "";
        const selected = getSelectedFacility();
        if(selected){
          buildDraftForFacility(selected);
        }
        render();
      };
    });
}

/* ===============================
   RENDER MAIN
================================ */

function renderMain(){

  const facility = getSelectedFacility();

  if(!mainContent) return;

  if(!facility){
    mainContent.innerHTML =
      `<div class="empty">Select a facility from the left.</div>`;
    return;
  }

  const modeClass = draftActive ? "on" : "off";
  const modeText = draftActive
    ? "Override Active"
    : "Using Service Management";

  mainContent.innerHTML = `
    <div class="selected-box">
      <div>
        <div class="selected-name">${safe(facility.name)}</div>
        <div class="page-sub">
          ${safe(facility.email || facility.username || "")}
        </div>
      </div>

      <div class="mode-badge ${modeClass}">
        ${modeText}
      </div>
    </div>

    <div class="toggle-row">
      <div>
        <div class="toggle-title">Facility Pricing Override</div>
        <div class="toggle-sub">
          OFF uses Service Management. ON uses this facility pricing only.
        </div>
      </div>

      <label class="switch">
        <input id="activeToggle" type="checkbox" ${draftActive ? "checked" : ""}>
        <span class="slider"></span>
      </label>
    </div>

    <div class="notice">
      ${draftActive
        ? "Override is ON. All enabled services below will be used instead of Service Management."
        : "Override is OFF. This facility will use Service Management prices."
      }
    </div>

    <div class="services-grid">
      ${
        draftServices.length
          ? draftServices.map((s,idx)=>serviceCardHTML(s,idx)).join("")
          : `<div class="empty">No services available for this facility.</div>`
      }
    </div>

    <div class="actions">
      <button class="btn btn-refresh" type="button" onclick="reloadPage()">Refresh</button>
      <button class="btn btn-save" type="button" onclick="saveOverride()">Save</button>
    </div>
  `;

  document.getElementById("activeToggle")?.addEventListener("change",e=>{
    draftActive = e.target.checked === true;
    renderMain();
  });
}

function serviceCardHTML(s,idx){

  const disabled = !draftActive ? "disabled" : "";
  const dis = !draftActive ? "disabled" : "";

  return `
    <div class="service-card ${disabled}">
      <div class="service-head">
        <div class="service-title">${safe(s.serviceName || s.serviceKey)}</div>
        <div class="service-code">${safe(s.serviceKey)}</div>
      </div>

      <div class="form-grid">

        <div class="field">
          <label>Pricing Mode</label>
          <select ${dis} onchange="updateServiceField(${idx}, 'pricingMode', this.value)">
            <option value="MILE" ${s.pricingMode === "MILE" ? "selected" : ""}>MILE</option>
            <option value="HOURLY" ${s.pricingMode === "HOURLY" ? "selected" : ""}>HOURLY</option>
            <option value="SHARED" ${s.pricingMode === "SHARED" ? "selected" : ""}>SHARED</option>
          </select>
        </div>

        <div class="field">
          <label>Base Fare</label>
          <input ${dis} type="number" step="0.01" value="${money(s.baseFare)}"
            oninput="updateServiceField(${idx}, 'baseFare', this.value)">
        </div>

        <div class="field">
          <label>Included Miles</label>
          <input ${dis} type="number" step="0.01" value="${num(s.includedMiles)}"
            oninput="updateServiceField(${idx}, 'includedMiles', this.value)">
        </div>

        <div class="field">
          <label>Per Mile</label>
          <input ${dis} type="number" step="0.01" value="${money(s.perMile)}"
            oninput="updateServiceField(${idx}, 'perMile', this.value)">
        </div>

        <div class="field">
          <label>Stop Fee</label>
          <input ${dis} type="number" step="0.01" value="${money(s.stopFee)}"
            oninput="updateServiceField(${idx}, 'stopFee', this.value)">
        </div>

        <div class="field">
          <label>No Show Fee</label>
          <input ${dis} type="number" step="0.01" value="${money(s.noShowFee)}"
            oninput="updateServiceField(${idx}, 'noShowFee', this.value)">
        </div>

        <div class="field">
          <label>Cancel Fee</label>
          <input ${dis} type="number" step="0.01" value="${money(s.cancelFee)}"
            oninput="updateServiceField(${idx}, 'cancelFee', this.value)">
        </div>

        <div class="field">
          <label>Hourly Rate</label>
          <input ${dis} type="number" step="0.01" value="${money(s.hourlyRate)}"
            oninput="updateServiceField(${idx}, 'hourlyRate', this.value)">
        </div>

        <div class="field">
          <label>Hourly Mode</label>
          <select ${dis} onchange="updateServiceField(${idx}, 'hourlyBillingMode', this.value)">
            <option value="FULL" ${s.hourlyBillingMode === "FULL" ? "selected" : ""}>FULL</option>
            <option value="QUARTER" ${s.hourlyBillingMode === "QUARTER" ? "selected" : ""}>QUARTER</option>
          </select>
        </div>

        <div class="field">
          <label>Shared Price</label>
          <input ${dis} type="number" step="0.01" value="${money(s.sharedPrice)}"
            oninput="updateServiceField(${idx}, 'sharedPrice', this.value)">
        </div>

      </div>
    </div>
  `;
}

function render(){
  renderFacilityList();
  renderMain();
}

/* ===============================
   UPDATE / SAVE
================================ */

function updateServiceField(idx,field,value){

  if(!draftServices[idx]) return;

  if([
    "baseFare",
    "includedMiles",
    "perMile",
    "stopFee",
    "noShowFee",
    "cancelFee",
    "hourlyRate",
    "sharedPrice"
  ].includes(field)){
    draftServices[idx][field] = num(value);
    return;
  }

  draftServices[idx][field] = value;
}

function validateBeforeSave(){

  if(!draftActive){
    return true;
  }

  if(!draftServices.length){
    alert("No services found for this facility.");
    return false;
  }

  const missing =
    draftServices.filter(s => !s.serviceKey);

  if(missing.length){
    alert("Some services are missing service key.");
    return false;
  }

  return true;
}

async function saveOverride(){

  const facility = getSelectedFacility();

  if(!facility) return;

  if(!validateBeforeSave()) return;

  try{

    const res = await fetch(
      `${API_URL}/${encodeURIComponent(facility._id)}`,
      {
        method:"PATCH",
        headers:authHeaders(),
        body:JSON.stringify({
          facilityName:facility.name,
          active:draftActive,
          services:draftServices,
          updatedBy:adminName
        })
      }
    );

    const data = await res.json().catch(()=>null);

    if(!res.ok || !data?.success){
      throw new Error(data?.message || "Save failed");
    }

    const saved = data.override;

    const idx =
      overrides.findIndex(o =>
        String(o.facilityId) === String(facility._id)
      );

    if(idx >= 0){
      overrides[idx] = saved;
    }else{
      overrides.push(saved);
    }

    alert("Facility pricing override saved.");

    buildDraftForFacility(facility);
    render();

  }catch(err){

    console.log(err);
    alert(err.message || "Failed to save facility pricing override.");

  }

}

function reloadPage(){
  loadAll().catch(err=>{
    console.log(err);
    alert("Failed to reload.");
  });
}

/* ===============================
   EVENTS
================================ */

facilitySearch?.addEventListener("input",renderFacilityList);

Object.assign(window,{
  updateServiceField,
  saveOverride,
  reloadPage
});

/* ===============================
   INIT
================================ */

loadAll().catch(err=>{
  console.log(err);
  if(mainContent){
    mainContent.innerHTML =
      `<div class="empty">Failed to load Facility Pricing Override.</div>`;
  }
});