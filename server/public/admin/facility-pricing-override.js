/* ==========================================================================
   FACILITY PRICING OVERRIDE
   Service Management Default / Facility Custom Override
   Facility Section Same As Service Management
   Edit Per Service Card
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

/*
  كل الكروت مقفولة.
  لما تدوس EDIT على كارت، بنحط serviceKey هنا.
*/
let editingServiceKey = "";

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

function upper(v){
  return clean(v).toUpperCase();
}

function normalizeCode(v){

  const c = upper(v);

  if(c === "STANDARD") return "ST";
  if(c === "WHEELCHAIR") return "WH";
  if(c === "SHARED") return "SH";
  if(c === "LIMO" || c === "LIMOUSINE") return "LM";
  if(c === "TAXI") return "TX";
  if(c === "XL") return "XL";

  return c;
}

function normalizeSuffix(v,serviceKey){

  const key =
    normalizeCode(serviceKey);

  const suffix =
    normalizeCode(v);

  if(!suffix){
    return key;
  }

  /*
    إصلاح بيانات قديمة:
    لو كارت مش Standard والـ suffix متخزن ST بالغلط،
    نرجعه لكود الخدمة الحقيقي.
  */
  if(key && key !== "ST" && suffix === "ST"){
    return key;
  }

  return suffix;
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(v){
  return v === true || String(v).toLowerCase() === "true";
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

function isSharedService(service){

  if(!service) return false;

  const key =
    normalizeCode(service.serviceKey);

  const title =
    upper(service.serviceName || service.title || service.name);

  const pricing =
    upper(service.pricingMode);

  const suffix =
    upper(service.serviceSuffix || service.companySuffix || service.suffix);

  return (
    service.shared === true ||
    service.companyShared === true ||
    key === "SHARED" ||
    key === "SH" ||
    title === "SHARED" ||
    suffix === "SH" ||
    pricing === "SHARED"
  );
}

/* ===============================
   SERVICE DEFAULT FROM FACILITY SECTION
================================ */

function serviceDefaultCopy(s){

  const serviceKey =
    normalizeCode(
      s.serviceKey ||
      s.key ||
      s.code ||
      s.companySuffix ||
      s.suffix ||
      s.title ||
      s.name
    );

  return {
    serviceKey,

    serviceName:
      s.serviceName ||
      s.title ||
      s.name ||
      serviceKey,

    serviceSuffix:
      normalizeSuffix(
        s.serviceSuffix ||
        s.companySuffix ||
        s.suffix,
        serviceKey
      ),

    shared:
      s.shared === true ||
      s.companyShared === true,

    pricingMode:
      upper(
        s.companyPricingMode ||
        s.pricingMode ||
        "MILE"
      ),

    baseFare:
      num(
        s.companyBaseFare ??
        s.baseFare ??
        0
      ),

    includedMiles:
      num(
        s.companyIncludedMiles ??
        s.includedMiles ??
        0
      ),

    perMile:
      num(
        s.companyPerMile ??
        s.perMile ??
        0
      ),

    hourlyRate:
      num(
        s.companyHourlyRate ??
        s.hourlyRate ??
        0
      ),

    hourlyBillingMode:
      upper(
        s.companyHourlyBillingMode ||
        s.hourlyBillingMode ||
        "FULL"
      ),

    stopFee:
      num(
        s.companyStopFee ??
        s.stopFee ??
        0
      ),

    noShowFee:
      num(
        s.companyNoShowFee ??
        s.noShowFee ??
        0
      ),

    sharedPrice:
      num(
        s.companySharedPrice ??
        s.sharedPrice ??
        0
      ),

    disableCancel:
      bool(
        s.companyDisableCancel ??
        s.disableCancel ??
        false
      ),

    warningMinutes:
      num(
        s.companyWarningMinutes ??
        s.warningMinutes ??
        0
      ),

    cancelFee:
      num(
        s.companyCancelFee ??
        s.cancelFee ??
        0
      ),

    addStopEnabled:
      bool(
        s.companyAddStopEnabled ??
        s.addStopEnabled ??
        false
      ),

    addStopCustomTimeEnabled:
      bool(
        s.companyAddStopCustomTimeEnabled ??
        s.addStopCustomTimeEnabled ??
        false
      ),

    addStopCutoffMinutes:
      num(
        s.companyAddStopCutoffMinutes ??
        s.addStopCutoffMinutes ??
        0
      )
  };
}

/* ===============================
   VISIBLE SERVICES
================================ */

function getVisibleServicesForFacility(facility){

  const allowed =
    Array.isArray(facility?.allowedServices)
      ? facility.allowedServices.map(normalizeCode).filter(Boolean)
      : [];

  if(!allowed.length){
    return services;
  }

  return services.filter(s =>
    allowed.includes(
      normalizeCode(
        s.serviceKey ||
        s.key ||
        s.code ||
        s.companySuffix ||
        s.suffix
      )
    )
  );
}

function buildDraftForFacility(facility){

  const override =
    getOverride(facility._id);

  const visibleServices =
    getVisibleServicesForFacility(facility);

  draftActive =
    override?.active === true;

  editingServiceKey = "";

  draftServices =
    visibleServices.map(s=>{

      const base =
        serviceDefaultCopy(s);

      const code =
        normalizeCode(base.serviceKey);

      const saved =
        Array.isArray(override?.services)
          ? override.services.find(x =>
              normalizeCode(x.serviceKey) === code
            )
          : null;

      if(saved){

        return {
          ...base,
          ...saved,

          serviceKey:code,

          serviceName:
            saved.serviceName ||
            base.serviceName,

          serviceSuffix:
            normalizeSuffix(
              saved.serviceSuffix ||
              base.serviceSuffix,
              code
            ),

          pricingMode:
            upper(saved.pricingMode || base.pricingMode),

          hourlyBillingMode:
            upper(saved.hourlyBillingMode || base.hourlyBillingMode),

          shared:
            bool(saved.shared),

          disableCancel:
            bool(saved.disableCancel),

          addStopEnabled:
            bool(saved.addStopEnabled),

          addStopCustomTimeEnabled:
            bool(saved.addStopCustomTimeEnabled)
        };
      }

      return base;
    });
}

/* ===============================
   LOAD
================================ */

async function loadAll(){

  const res =
    await fetch(
      `${API_URL}/bootstrap`,
      {
        headers:
          token
            ? {Authorization:"Bearer " + token}
            : {}
      }
    );

  if(!res.ok){
    throw new Error("Failed to load facility pricing");
  }

  const data =
    await res.json();

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

  const selected =
    getSelectedFacility();

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
      String(f.name || "").toLowerCase().includes(q) ||
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

      const override =
        getOverride(f._id);

      const active =
        override?.active === true;

      const cls =
        String(f._id) === String(selectedFacilityId)
          ? "active"
          : "";

      return `
        <div class="facility-item ${cls}" data-id="${safe(f._id)}">

          <div class="facility-row">

            <div class="facility-name">
              ${safe(f.name)}
            </div>

            <div class="facility-badge ${active ? "active" : "disabled"}">
              ${active ? "ACTIVE" : "DISABLED"}
            </div>

          </div>

          <div class="facility-status ${active ? "on" : "off"}">
            ${
              active
                ? "Facility Override Active"
                : "Facility Override Disabled"
            }
          </div>

        </div>
      `;
    }).join("");

  facilityList
    .querySelectorAll(".facility-item")
    .forEach(el=>{

      el.onclick = ()=>{

        selectedFacilityId =
          el.dataset.id || "";

        const selected =
          getSelectedFacility();

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

  const facility =
    getSelectedFacility();

  if(!mainContent) return;

  if(!facility){
    mainContent.innerHTML =
      `<div class="empty">Select a facility from the left.</div>`;
    return;
  }

  const modeClass =
    draftActive ? "on" : "off";

  const modeText =
    draftActive
      ? "Override Active"
      : "Override Disabled";

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
          OFF = use Service Management. ON = use this facility pricing only.
        </div>
      </div>

      <label class="switch">
        <input id="activeToggle" type="checkbox" ${draftActive ? "checked" : ""}>
        <span class="slider"></span>
      </label>

    </div>

    <div class="notice">
      ${
        draftActive
          ? "Override is ON. This facility is outside Service Management pricing."
          : "Override is OFF. This facility uses Service Management prices."
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
      <button class="btn btn-refresh" type="button" onclick="reloadPage()">
        Refresh
      </button>
    </div>
  `;

  document
    .getElementById("activeToggle")
    ?.addEventListener("change",async e=>{

      const oldActive =
        draftActive;

      const newActive =
        e.target.checked === true;

      draftActive =
        newActive;

      editingServiceKey = "";

      syncLocalOverrideStatus();

      render();

      const ok =
        await saveOverride(true,false);

      if(!ok){

        draftActive =
          oldActive;

        syncLocalOverrideStatus();

        render();

        alert("Active / Disabled was not saved. Check server route or model.");
      }

    });
}

/* ===============================
   FIELD HTML
================================ */

function textInput(idx,name,label,value,disabled,locked=false){

  return `
    <div class="field">
      <label>${safe(label)}</label>

      <input
        ${disabled || locked ? "disabled" : ""}
        type="text"
        value="${safe(value)}"
        ${locked ? `class="locked-input"` : ""}
        oninput="updateServiceField(${idx}, '${name}', this.value)"
      >
    </div>
  `;
}

function numberInput(idx,name,label,value,disabled){

  return `
    <div class="field">
      <label>${safe(label)}</label>

      <input
        ${disabled ? "disabled" : ""}
        type="number"
        step="0.01"
        value="${money(value)}"
        oninput="updateServiceField(${idx}, '${name}', this.value)"
      >
    </div>
  `;
}

function intInput(idx,name,label,value,disabled){

  return `
    <div class="field">
      <label>${safe(label)}</label>

      <input
        ${disabled ? "disabled" : ""}
        type="number"
        step="1"
        min="0"
        value="${num(value)}"
        oninput="updateServiceField(${idx}, '${name}', this.value)"
      >
    </div>
  `;
}

function selectInput(idx,name,label,value,options,disabled){

  return `
    <div class="field">
      <label>${safe(label)}</label>

      <select
        ${disabled ? "disabled" : ""}
        onchange="updateServiceField(${idx}, '${name}', this.value)"
      >
        ${
          options.map(opt=>`
            <option value="${safe(opt.value)}" ${String(opt.value) === String(value) ? "selected" : ""}>
              ${safe(opt.label)}
            </option>
          `).join("")
        }
      </select>
    </div>
  `;
}

function yesNoInput(idx,name,label,value,disabled){
  return selectInput(
    idx,
    name,
    label,
    String(bool(value)),
    [
      {value:"false",label:"No"},
      {value:"true",label:"Yes"}
    ],
    disabled
  );
}

function onOffInput(idx,name,label,value,disabled){
  return selectInput(
    idx,
    name,
    label,
    String(bool(value)),
    [
      {value:"true",label:"ENABLED"},
      {value:"false",label:"DISABLED"}
    ],
    disabled
  );
}

function reverseOnOffInput(idx,name,label,value,disabled){

  /*
    disableCancel:
    false = ENABLED
    true = DISABLED
  */

  return selectInput(
    idx,
    name,
    label,
    String(bool(value)),
    [
      {value:"false",label:"ENABLED"},
      {value:"true",label:"DISABLED"}
    ],
    disabled
  );
}

/* ===============================
   CARD HTML
================================ */

function serviceCardHTML(s,idx){

  const key =
    normalizeCode(s.serviceKey);

  const activeEditing =
    draftActive &&
    editingServiceKey === key;

  const cardLocked =
    !activeEditing;

  const cardClass =
    !draftActive
      ? "disabled"
      : cardLocked
        ? "locked"
        : "editing";

  const shared =
    isSharedService(s);

  return `
    <div class="service-card ${cardClass}">

      <div class="service-head">

        <div>
          <div class="service-title">
            ${safe(s.serviceName || s.serviceKey)}
          </div>

          <div class="service-sub">
            ${
              !draftActive
                ? "Facility Pricing • Override Disabled"
                : activeEditing
                  ? "Facility Pricing • Editing"
                  : "Facility Pricing • Locked"
            }
          </div>
        </div>

        <div class="service-code">
          ${safe(key)}
        </div>

      </div>

      <div class="form-grid">

        ${
          textInput(
            idx,
            "serviceSuffix",
            "Service Suffix",
            normalizeSuffix(s.serviceSuffix || key,key),
            true,
            true
          )
        }

        ${
          yesNoInput(
            idx,
            "shared",
            "Shared Service",
            s.shared === true,
            cardLocked || !draftActive
          )
        }

        ${
          selectInput(
            idx,
            "pricingMode",
            "Pricing Mode",
            upper(s.pricingMode || "MILE"),
            [
              {value:"MILE",label:"Per Mile"},
              {value:"HOURLY",label:"Hourly"},
              {value:"SHARED",label:"Shared"}
            ],
            cardLocked || !draftActive
          )
        }

        ${numberInput(idx,"baseFare","Base Fare",s.baseFare,cardLocked || !draftActive)}

        ${numberInput(idx,"includedMiles","Included Miles",s.includedMiles,cardLocked || !draftActive)}

        ${numberInput(idx,"perMile","Per Mile",s.perMile,cardLocked || !draftActive)}

        ${numberInput(idx,"hourlyRate","Hourly Rate",s.hourlyRate,cardLocked || !draftActive)}

        ${
          selectInput(
            idx,
            "hourlyBillingMode",
            "Hourly Billing",
            upper(s.hourlyBillingMode || "FULL"),
            [
              {value:"FULL",label:"Full Hour"},
              {value:"QUARTER",label:"Quarter Hour"}
            ],
            cardLocked || !draftActive
          )
        }

        ${numberInput(idx,"stopFee","Stop Fee",s.stopFee,cardLocked || !draftActive)}

        ${numberInput(idx,"noShowFee","No Show Fee",s.noShowFee,cardLocked || !draftActive)}

        ${numberInput(idx,"sharedPrice","Shared Price",s.sharedPrice,cardLocked || !draftActive)}

        <div class="policy-title">Facility Warning Policy</div>

        ${
          reverseOnOffInput(
            idx,
            "disableCancel",
            "Warning & Cancel Fee Status",
            s.disableCancel,
            cardLocked || !draftActive
          )
        }

        ${intInput(idx,"warningMinutes","Warning Minutes",s.warningMinutes,cardLocked || !draftActive)}

        ${numberInput(idx,"cancelFee","Cancel Fee",s.cancelFee,cardLocked || !draftActive)}

        <div class="add-stop-title">
          <div>Add Stop Policy</div>
          <span>${shared ? "Locked For Shared" : "Enabled / Disabled + Custom Cutoff"}</span>
        </div>

        ${
          shared
            ? `
              <div class="shared-lock">
                Add Stop is disabled for Shared service permanently.
              </div>
            `
            : `
              ${onOffInput(idx,"addStopEnabled","Add Stop",s.addStopEnabled,cardLocked || !draftActive)}

              ${onOffInput(idx,"addStopCustomTimeEnabled","Custom Time",s.addStopCustomTimeEnabled,cardLocked || !draftActive)}

              ${intInput(idx,"addStopCutoffMinutes","Cutoff Minutes",s.addStopCutoffMinutes,cardLocked || !draftActive)}
            `
        }

      </div>

      <div class="card-actions">

        ${
          !draftActive
            ? `
              <button class="card-btn card-locked" type="button" disabled>
                LOCKED
              </button>
            `
            : activeEditing
              ? `
                <button class="card-btn card-save" type="button" onclick="saveServiceCard(${idx})">
                  SAVE
                </button>
              `
              : `
                <button class="card-btn card-edit" type="button" onclick="editServiceCard(${idx})">
                  EDIT
                </button>
              `
        }

      </div>

    </div>
  `;
}

/* ===============================
   RENDER
================================ */

function render(){
  renderFacilityList();
  renderMain();
}

function syncLocalOverrideStatus(){

  const facility =
    getSelectedFacility();

  if(!facility) return;

  let override =
    overrides.find(o =>
      String(o.facilityId) === String(facility._id)
    );

  if(!override){

    override = {
      facilityId:String(facility._id),
      facilityName:facility.name,
      active:draftActive,
      services:[]
    };

    overrides.push(override);
  }

  override.active =
    draftActive;

  override.facilityName =
    facility.name;
}

/* ===============================
   EDIT CARD
================================ */

function editServiceCard(idx){

  if(!draftActive){
    alert("Turn Override Active first.");
    return;
  }

  const service =
    draftServices[idx];

  if(!service) return;

  editingServiceKey =
    normalizeCode(service.serviceKey);

  renderMain();
}

async function saveServiceCard(idx){

  if(!draftActive){
    return;
  }

  const service =
    draftServices[idx];

  if(!service) return;

  const ok =
    await saveOverride(true,false);

  if(!ok){
    alert("Service was not saved.");
    return;
  }

  editingServiceKey = "";

  const facility =
    getSelectedFacility();

  if(facility){
    buildDraftForFacility(facility);
  }

  render();

  alert("Service saved.");
}

/* ===============================
   UPDATE / SAVE
================================ */

function updateServiceField(idx,field,value){

  const service =
    draftServices[idx];

  if(!service) return;

  const key =
    normalizeCode(service.serviceKey);

  /*
    حماية زيادة:
    مفيش تحديث إلا للكارت المفتوح Edit.
  */
  if(editingServiceKey !== key){
    return;
  }

  /*
    Service Suffix مقفول دائمًا.
  */
  if(field === "serviceSuffix"){
    return;
  }

  if([
    "baseFare",
    "includedMiles",
    "perMile",
    "stopFee",
    "noShowFee",
    "cancelFee",
    "hourlyRate",
    "sharedPrice",
    "warningMinutes",
    "addStopCutoffMinutes"
  ].includes(field)){
    service[field] = num(value);
    return;
  }

  if([
    "shared",
    "disableCancel",
    "addStopEnabled",
    "addStopCustomTimeEnabled"
  ].includes(field)){

    service[field] =
      bool(value);

    if(field === "shared" && bool(value)){
      service.addStopEnabled = false;
      service.addStopCustomTimeEnabled = false;
      service.addStopCutoffMinutes = 0;
    }

    renderMain();
    return;
  }

  if(field === "pricingMode"){
    service[field] = upper(value);
    return;
  }

  if(field === "hourlyBillingMode"){
    service[field] = upper(value);
    return;
  }

  service[field] = value;
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

function prepareServicesForSave(){

  return draftServices.map(s=>{

    const serviceKey =
      normalizeCode(s.serviceKey);

    const shared =
      isSharedService(s) ||
      s.shared === true;

    return {
      serviceKey,

      serviceName:
        clean(s.serviceName),

      serviceSuffix:
        normalizeSuffix(
          s.serviceSuffix || serviceKey,
          serviceKey
        ),

      shared,

      pricingMode:
        upper(s.pricingMode || "MILE"),

      baseFare:
        num(s.baseFare),

      includedMiles:
        num(s.includedMiles),

      perMile:
        num(s.perMile),

      hourlyRate:
        num(s.hourlyRate),

      hourlyBillingMode:
        upper(s.hourlyBillingMode || "FULL"),

      stopFee:
        num(s.stopFee),

      noShowFee:
        num(s.noShowFee),

      sharedPrice:
        num(s.sharedPrice),

      disableCancel:
        bool(s.disableCancel),

      warningMinutes:
        num(s.warningMinutes),

      cancelFee:
        num(s.cancelFee),

      addStopEnabled:
        shared
          ? false
          : bool(s.addStopEnabled),

      addStopCustomTimeEnabled:
        shared
          ? false
          : bool(s.addStopCustomTimeEnabled),

      addStopCutoffMinutes:
        shared
          ? 0
          : num(s.addStopCutoffMinutes)
    };
  });
}

async function saveOverride(silent=false,rerender=true){

  const facility =
    getSelectedFacility();

  if(!facility){
    return false;
  }

  if(!validateBeforeSave()){
    return false;
  }

  try{

    const res =
      await fetch(
        `${API_URL}/${encodeURIComponent(facility._id)}`,
        {
          method:"PATCH",
          headers:authHeaders(),
          body:JSON.stringify({
            facilityName:facility.name,
            active:draftActive,
            services:prepareServicesForSave(),
            updatedBy:adminName
          })
        }
      );

    const data =
      await res.json().catch(()=>null);

    if(!res.ok || !data?.success){
      throw new Error(data?.message || "Save failed");
    }

    const saved =
      data.override;

    const idx =
      overrides.findIndex(o =>
        String(o.facilityId) === String(facility._id)
      );

    if(idx >= 0){
      overrides[idx] = saved;
    }else{
      overrides.push(saved);
    }

    if(!silent){
      alert("Facility pricing override saved.");
    }

    if(rerender){

      const selected =
        getSelectedFacility();

      if(selected){
        buildDraftForFacility(selected);
      }

      render();
    }

    return true;

  }catch(err){

    console.log(err);

    if(!silent){
      alert(err.message || "Failed to save facility pricing override.");
    }else{
      console.log(err.message || "Failed to save facility pricing override.");
    }

    return false;
  }
}

function reloadPage(){
  editingServiceKey = "";

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
  reloadPage,
  editServiceCard,
  saveServiceCard
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