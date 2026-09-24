function getCompanyToken(){
  const own = String(localStorage.getItem("companyToken") || "").trim();
  if(own) return own;
  if(String(localStorage.getItem("role") || "").toLowerCase() === "company"){
    return String(localStorage.getItem("token") || "").trim();
  }
  return "";
}
function getCompanyRole(){
  const own = String(localStorage.getItem("companyRole") || "").trim();
  if(own) return own;
  const legacy = String(localStorage.getItem("role") || "").trim();
  return legacy.toLowerCase() === "company" ? legacy : "";
}
function getCompanyName(){
  const own = String(localStorage.getItem("companyName") || "").trim();
  if(own) return own;
  if(String(localStorage.getItem("role") || "").toLowerCase() === "company"){
    return String(localStorage.getItem("name") || "").trim();
  }
  return "";
}
function getCompanyTenantSlug(){
  return String(
    localStorage.getItem("companyTenantSlug") ||
    sessionStorage.getItem("companyTenantSlug") ||
    ""
  ).trim().toLowerCase();
}
function companyLoginUrl(){
  const slug = getCompanyTenantSlug();
  return slug
    ? `/companies/company-login.html?tenant=${encodeURIComponent(slug)}`
    : "/companies/company-login.html";
}
function companyStorageKey(baseKey){
  const scope =
    getCompanyTenantSlug() ||
    String(localStorage.getItem("companyTenantId") || "").trim() ||
    "company";
  return `${baseKey}:${scope}`;
}

/* =====================================================
FILE: add-trip.js
FINAL COMPLETE VERSION
Facility Override First
Service Code Fixed From Company Suffix
===================================================== */

document.addEventListener("DOMContentLoaded", function(){

const token = getCompanyToken();

const role = getCompanyRole();

const companyName = getCompanyName();

const companyId =
  localStorage.getItem("companyFacilityId") ||
  localStorage.getItem("companyUserId") ||
  localStorage.getItem("companyTenantId") ||
  "";

if(!token || role !== "company"){
  window.location.replace(companyLoginUrl());
  return;
}

let COMPANY_SERVICES = [];
let COMPANY_BOOKING_FIELDS = [];

let activeService = "ST";
let activeSuffix  = "ST";

let SYSTEM_TIMEZONE = "America/Phoenix";

/* ================= COMPANY DYNAMIC BOOKING FIELDS ================= */

function bookingFieldInputType(fieldType){
  const type = normalizeText(fieldType).toUpperCase();
  if(type === "NUMBER") return "number";
  if(type === "DATE") return "date";
  if(type === "TIME") return "time";
  if(type === "PHONE") return "tel";
  if(type === "EMAIL") return "email";
  return "text";
}

function companyFieldRule(item){
  const matrix = item?.matrix || {};
  return (
    matrix.company ||
    matrix.companies ||
    matrix.facility ||
    {}
  );
}

function facilityFieldEnabled(item){
  const rule = companyFieldRule(item);
  return rule?.showField === true;
}

function facilityFieldRequired(item){
  const rule = companyFieldRule(item);
  return facilityFieldEnabled(item) && rule?.required === true;
}

function normalizeFacilityBookingField(item,catalogItem,index,isCustom){
  const slot = Number(item?.slot || 0) || (index + 1);
  const key = isCustom
    ? (normalizeText(item?.key) || `CUSTOM_${slot}`)
    : normalizeText(item?.key || catalogItem?.key);

  return {
    key,
    label:normalizeText(item?.label || catalogItem?.label || key),
    fieldType:normalizeText(item?.fieldType || catalogItem?.type || "TEXT").toUpperCase(),
    options:Array.isArray(item?.options) ? item.options.map(normalizeText).filter(Boolean) : [],
    placeholder:normalizeText(item?.placeholder || ""),
    required:facilityFieldRequired(item),
    source:isCustom ? "CUSTOM" : "STANDARD",
    slot:isCustom ? slot : null
  };
}

function ensureFacilityBookingFieldsHost(){
  let section = document.getElementById("dynamicBookingFieldsSection");
  let box = document.getElementById("dynamicBookingFields");

  if(!section){
    section = document.createElement("section");
    section.id = "dynamicBookingFieldsSection";
    section.style.display = "none";

    const heading = document.createElement("h3");
    heading.textContent = "Additional Information";

    box = document.createElement("div");
    box.id = "dynamicBookingFields";
    box.className = "form-grid";

    section.appendChild(heading);
    section.appendChild(box);
  }

  if(!box){
    box = document.createElement("div");
    box.id = "dynamicBookingFields";
    box.className = "form-grid";
    section.appendChild(box);
  }

  moveCompanyBookingFieldsToActiveService();

  return { section, box };
}

function moveCompanyBookingFieldsToActiveService(){
  const section =
    document.getElementById("dynamicBookingFieldsSection");

  if(!section){
    return;
  }

  const service =
    getCurrentServiceConfig();

  const shared =
    isSharedService(service);

  const targetSection =
    shared
      ? sharedSection
      : individualSection;

  if(!targetSection){
    return;
  }

  const targetNotes =
    shared
      ? sharedNotes
      : notes;

  const notesField =
    targetNotes?.closest(".field-wrap") ||
    targetNotes?.parentElement;

  const parent =
    notesField?.parentElement ||
    targetSection;

  if(!parent){
    return;
  }

  if(
    notesField &&
    notesField.parentElement === parent
  ){
    if(section.parentElement !== parent){
      parent.insertBefore(
        section,
        notesField
      );
    }else if(section.nextElementSibling !== notesField){
      parent.insertBefore(
        section,
        notesField
      );
    }
  }else if(section.parentElement !== parent){
    parent.appendChild(section);
  }

  section.style.display =
    COMPANY_BOOKING_FIELDS.length
      ? "block"
      : "none";
}

async function loadCompanyBookingFields(){
  const host = ensureFacilityBookingFieldsHost();
  const section = host.section;
  const box = host.box;
  if(!section || !box) return;

  COMPANY_BOOKING_FIELDS = [];
  box.innerHTML = "";
  section.style.display = "none";

  try{
    const res = await fetch("/api/services/booking-data/company",{
      method:"GET",
      headers:{
        Authorization:"Bearer " + token,
        Accept:"application/json",
        "Cache-Control":"no-cache"
      },
      cache:"no-store"
    });

    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message || "Failed loading booking fields");

    console.log(
      "ADD TRIP COMPANY BOOKING DATA RESPONSE:",
      res.status,
      data
    );

    const returnedFields =
      Array.isArray(data?.fields)
        ? data.fields
        : (
            Array.isArray(data?.bookingFields)
              ? data.bookingFields
              : (
                  Array.isArray(data?.data?.fields)
                    ? data.data.fields
                    : null
                )
          );

    if(Array.isArray(returnedFields)){
      COMPANY_BOOKING_FIELDS = returnedFields
        .filter(item=>
          item?.showField === true ||
          item?.matrix?.facility?.showField === true ||
          item?.matrix?.company?.showField === true
        )
        .map((item,index)=>({
          key:normalizeText(item?.key),
          label:normalizeText(item?.label || item?.key),
          fieldType:normalizeText(item?.fieldType || "TEXT").toUpperCase(),
          options:Array.isArray(item?.options) ? item.options.map(normalizeText).filter(Boolean) : [],
          placeholder:normalizeText(item?.placeholder || ""),
          required:item?.required === true,
          source:normalizeText(item?.source || "STANDARD").toUpperCase(),
          slot:Number(item?.slot || 0) || null,
          order:Number(item?.order || index),
          aliases:Array.isArray(item?.aliases) ? item.aliases.map(normalizeText).filter(Boolean) : []
        }))
        .filter(item=>item.key)
        .sort((x,y)=>Number(x.order||0)-Number(y.order||0));
    }

    /*
      HARD COMPANY FALLBACK:
      If the calculated fields array is empty, rebuild directly from the
      Platform Admin Company/Facility matrix returned in data.config.

      This is Company-only. Reserved is not read here.
    */
    if(
      !COMPANY_BOOKING_FIELDS.length &&
      data?.config
    ){
      const standard =
        Array.isArray(data?.config?.standardFields)
          ? data.config.standardFields
          : [];

      const custom =
        Array.isArray(data?.config?.customFields)
          ? data.config.customFields
          : [];

      const standardFields =
        standard
          .filter(item=>
            item?.matrix?.facility?.showField === true ||
            item?.matrix?.company?.showField === true ||
            item?.matrix?.companies?.showField === true
          )
          .map((item,index)=>({
            key:normalizeText(item?.key),
            label:normalizeText(item?.label || item?.key),
            fieldType:normalizeText(item?.fieldType || "TEXT").toUpperCase(),
            options:Array.isArray(item?.options) ? item.options.map(normalizeText).filter(Boolean) : [],
            placeholder:normalizeText(item?.placeholder || ""),
            required:
              item?.matrix?.facility?.required === true ||
              item?.matrix?.company?.required === true ||
              item?.matrix?.companies?.required === true,
            source:"STANDARD",
            slot:null,
            order:Number(item?.order ?? item?.sortOrder ?? index),
            aliases:Array.isArray(item?.aliases) ? item.aliases.map(normalizeText).filter(Boolean) : []
          }))
          .filter(item=>item.key);

      const customFields =
        custom
          .filter(item=>{
            const label =
              normalizeText(item?.label);

            if(!label) return false;

            const matrix =
              item?.matrix || {};

            const hasExplicitRule =
              matrix?.facility ||
              matrix?.company ||
              matrix?.companies;

            /*
              If the custom field has an explicit Company/Facility rule,
              respect showField. If it is a newly-created custom field from
              an older config with no matrix rule at all, show it rather than
              silently losing it.
            */
            if(hasExplicitRule){
              return (
                matrix?.facility?.showField === true ||
                matrix?.company?.showField === true ||
                matrix?.companies?.showField === true
              );
            }

            return true;
          })
          .map((item,index)=>{
            const matrix =
              item?.matrix || {};

            const rule =
              matrix.facility ||
              matrix.company ||
              matrix.companies ||
              {};

            const slot =
              Number(item?.slot || 0) ||
              (index + 1);

            return {
              key:
                normalizeText(item?.key) ||
                `CUSTOM_${slot}`,
              label:
                normalizeText(item?.label) ||
                `Custom ${slot}`,
              fieldType:
                normalizeText(
                  item?.fieldType || "TEXT"
                ).toUpperCase(),
              options:
                Array.isArray(item?.options)
                  ? item.options.map(normalizeText).filter(Boolean)
                  : [],
              placeholder:
                normalizeText(item?.placeholder || ""),
              required:
                rule?.required === true,
              source:"CUSTOM",
              slot,
              order:
                Number(
                  item?.order ??
                  item?.sortOrder ??
                  (1000 + index)
                ),
              aliases:
                Array.isArray(item?.aliases)
                  ? item.aliases.map(normalizeText).filter(Boolean)
                  : []
            };
          })
          .filter(item=>item.key);

      COMPANY_BOOKING_FIELDS = [
        ...standardFields,
        ...customFields
      ]
      .sort(
        (a,b)=>
          Number(a.order || 0) -
          Number(b.order || 0)
      );

      console.log(
        "ADD TRIP COMPANY BOOKING FIELDS FROM RAW CONFIG:",
        COMPANY_BOOKING_FIELDS
      );
    }

    if(!Array.isArray(returnedFields) && !data?.config){
      const catalog = Array.isArray(data?.standardCatalog) ? data.standardCatalog : [];
      const catalogMap = new Map(catalog.map(item=>[normalizeText(item?.key),item]));
      const standard = Array.isArray(data?.config?.standardFields) ? data.config.standardFields : [];
      const custom = Array.isArray(data?.config?.customFields) ? data.config.customFields : [];
      const standardFields = standard.filter(facilityFieldEnabled).map((item,index)=>normalizeFacilityBookingField(item,catalogMap.get(normalizeText(item?.key)),index,false)).filter(item=>item.key);
      const customFields = custom.filter(item=>facilityFieldEnabled(item) && normalizeText(item?.label)).map((item,index)=>normalizeFacilityBookingField(item,null,index,true)).filter(item=>item.key);
      COMPANY_BOOKING_FIELDS = [...standardFields,...customFields];
    }

    COMPANY_BOOKING_FIELDS.forEach(field=>{
      const wrap = document.createElement("div");
      wrap.className = "field-wrap";

      const label = document.createElement("label");
      label.className = "auto-share-field-label";
      label.htmlFor = `dynamicBookingField_${field.key}`;
      label.textContent = field.label + (field.required ? " *" : "");
      wrap.appendChild(label);

      let input;
      if(field.fieldType === "LONG_TEXT"){
        input = document.createElement("textarea");
      }else if(field.fieldType === "DROPDOWN" || field.fieldType === "YES_NO"){
        input = document.createElement("select");
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = field.placeholder || `Select ${field.label}`;
        input.appendChild(empty);
        const options = field.fieldType === "YES_NO" ? ["Yes","No"] : field.options;
        options.forEach(value=>{
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          input.appendChild(option);
        });
      }else{
        input = document.createElement("input");
        input.type = bookingFieldInputType(field.fieldType);
      }

      input.id = `dynamicBookingField_${field.key}`;
      input.dataset.bookingFieldKey = field.key;
      input.placeholder = field.placeholder || field.label;
      if(field.required) input.required = true;
      wrap.appendChild(input);
      box.appendChild(wrap);
    });

    if(COMPANY_BOOKING_FIELDS.length){
      section.style.display = "block";
      restoreDynamicBookingDraft();
      moveCompanyBookingFieldsToActiveService();
    }else{
      section.style.display = "none";
    }
  }catch(err){
    console.log(
      "LOAD COMPANY BOOKING FIELDS ERROR:",
      err
    );

    if(section && box){
      section.style.display = "block";
      box.innerHTML =
        '<div style="grid-column:1/-1;padding:12px;border-radius:10px;background:#fee2e2;color:#991b1b;font-weight:800;">Company booking fields could not be loaded.</div>';
    }
  }
}

function collectDynamicBookingData(validateRequired=false){
  const rows = [];

  for(const field of COMPANY_BOOKING_FIELDS){
    const input = document.getElementById(`dynamicBookingField_${field.key}`);
    const value = normalizeText(input?.value);

    if(validateRequired && field.required && !value){
      if(input) input.focus();
      throw new Error(`${field.label} is required`);
    }

    if(!value) continue;

    rows.push({
      key:field.key,
      label:field.label,
      fieldType:field.fieldType,
      value,
      source:field.source,
      required:field.required === true,
      aliases:Array.isArray(field.aliases) ? field.aliases : [],
      ...(field.slot ? { slot:field.slot } : {})
    });
  }

  return rows;
}

function dynamicBookingObject(rows){
  const out = {};
  (Array.isArray(rows) ? rows : []).forEach(row=>{
    const key = normalizeText(row?.key);
    if(key) out[key] = row?.value ?? "";
  });
  return out;
}

function dynamicBookingTopLevelValues(rows){
  const allowed = new Set([
    "appointmentTime","returnTime","clientEmail","memberId",
    "brokerName","brokerCode","brokerTripId","externalSource",
    "brokerNotes","totalPassengers"
  ]);
  const out = {};
  rows.forEach(row=>{
    if(row.source === "STANDARD" && allowed.has(row.key)){
      out[row.key] = row.value;
    }
  });
  return out;
}

function restoreDynamicBookingDraft(){
  let draft = {};
  try{
    draft = JSON.parse(localStorage.getItem(companyStorageKey("companyTripDraft")) || "{}");
  }catch(_err){ draft = {}; }

  const values = draft.dynamicBookingValues || {};
  COMPANY_BOOKING_FIELDS.forEach(field=>{
    const input = document.getElementById(`dynamicBookingField_${field.key}`);
    if(input && Object.prototype.hasOwnProperty.call(values,field.key)){
      input.value = values[field.key] ?? "";
    }
  });
}

function clearDynamicBookingFields(){
  COMPANY_BOOKING_FIELDS.forEach(field=>{
    const input = document.getElementById(`dynamicBookingField_${field.key}`);
    if(input) input.value = "";
  });
}

/* ================= BILLING ================= */

async function checkBillingLock(){

  try{

    const res =
      await fetch(
        "/api/company/billing?company=" + encodeURIComponent(companyName),
        {
          headers:{
            Authorization:"Bearer " + token
          }
        }
      );

    const data =
      await res.json();

    if(data.billingLocked){

      document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;padding:20px;font-family:Segoe UI;">
        <div style="max-width:600px;width:100%;background:#fff;padding:40px;border-radius:20px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.08);">
          <h1 style="color:#dc2626;margin-bottom:15px;">Account Suspended</h1>
          <p style="color:#475569;font-size:17px;line-height:1.7;">
            Your company account is currently locked due to unpaid billing.
          </p>
          <a href="/companies/payment.html" style="display:inline-block;margin-top:25px;background:#2563eb;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:800;">
            Go To Payment Center
          </a>
        </div>
      </div>`;

      return false;
    }

    return true;

  }catch(err){

    console.log(err);
    return true;
  }
}

(async()=>{

const ok =
  await checkBillingLock();

if(!ok) return;

/* ================= ELEMENTS ================= */

const companyTabs =
  document.getElementById("companyTabs");

const individualSection =
  document.getElementById("individualSection");

const sharedSection =
  document.getElementById("sharedSection");

const entryName =
  document.getElementById("entryName");

const entryPhone =
  document.getElementById("entryPhone");

const editEntryBtn =
  document.getElementById("editEntryBtn");

const saveEntryBtn =
  document.getElementById("saveEntryBtn");

const saveDraftBtn =
  document.getElementById("saveDraftBtn");

const clientName =
  document.getElementById("clientName");

const clientPhone =
  document.getElementById("clientPhone");

const clientSuggestions =
  document.getElementById("clientSuggestions");

const pickupInput =
  document.getElementById("pickup");

const dropoffInput =
  document.getElementById("dropoff");

const tripDate =
  document.getElementById("tripDate");

const tripTime =
  document.getElementById("tripTime");

const notes =
  document.getElementById("notes");

const stopsBox =
  document.getElementById("stops");

const addStopBtn =
  document.getElementById("addStopBtn");

const submitTripBtn =
  document.getElementById("submitTrip");

const sharedEntryName =
  document.getElementById("sharedEntryName");

const sharedEntryPhone =
  document.getElementById("sharedEntryPhone");

const editSharedEntryBtn =
  document.getElementById("editSharedEntryBtn");

const passengerCount =
  document.getElementById("passengerCount");

const sharedDate =
  document.getElementById("sharedDate");

const sharedTime =
  document.getElementById("sharedTime");

const sharedNotes =
  document.getElementById("sharedNotes");

const passengersContainer =
  document.getElementById("passengersContainer");

const submitSharedBtn =
  document.getElementById("submitShared");

const saveSharedDraftBtn =
  document.getElementById("saveSharedDraftBtn");


const sharedManualModeBtn =
  document.getElementById("sharedManualModeBtn");

const sharedAutomaticModeBtn =
  document.getElementById("sharedAutomaticModeBtn");

const manualSharedModePanel =
  document.getElementById("manualSharedModePanel");

const automaticSharedModePanel =
  document.getElementById("automaticSharedModePanel");

const autoSharedClientName =
  document.getElementById("autoSharedClientName");

const autoSharedClientPhone =
  document.getElementById("autoSharedClientPhone");

const autoSharedPickup =
  document.getElementById("autoSharedPickup");

const autoSharedDropoff =
  document.getElementById("autoSharedDropoff");

const autoSharedDate =
  document.getElementById("autoSharedDate");

const autoSharedPickupTime =
  document.getElementById("autoSharedPickupTime");

const autoSharedAppointmentTime =
  document.getElementById("autoSharedAppointmentTime");

const autoSharedReturnTime =
  document.getElementById("autoSharedReturnTime");

const autoSharedNotes =
  document.getElementById("autoSharedNotes");

const addAutomaticSharedCandidateBtn =
  document.getElementById("addAutomaticSharedCandidate");

const automaticSharedList =
  document.getElementById("automaticSharedList");

const automaticSharedResult =
  document.getElementById("automaticSharedResult");

const automaticSharedCounters =
  document.getElementById("automaticSharedCounters");

const runAutomaticSharedEngineBtn =
  document.getElementById("runAutomaticSharedEngine");

const submitAutomaticSharedGroupsBtn =
  document.getElementById("submitAutomaticSharedGroups");

let sharedEntryMode = "AUTOMATIC";
let automaticSharedCandidates = [];
let automaticSharedPlan = null;

/* ================= HELPERS ================= */


function normalizeText(v){
  return String(v ?? "").trim();
}

/* ================= COMPANIES SERVICE ZONE ================= */

let companyZoneGooglePromise = null;
let companyZoneSettingsCache = null;

function zoneNumber(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function zoneCoordOk(lat,lng){
  const a = zoneNumber(lat);
  const b = zoneNumber(lng);

  return (
    a !== null &&
    b !== null &&
    a >= -90 &&
    a <= 90 &&
    b >= -180 &&
    b <= 180 &&
    !(a === 0 && b === 0)
  );
}

function zoneDistanceMiles(a,b){

  if(
    !zoneCoordOk(a?.lat,a?.lng) ||
    !zoneCoordOk(b?.lat,b?.lng)
  ){
    return null;
  }

  const toRad =
    value=>Number(value) * Math.PI / 180;

  const earthMiles = 3958.7613;

  const dLat =
    toRad(Number(b.lat) - Number(a.lat));

  const dLng =
    toRad(Number(b.lng) - Number(a.lng));

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
    Math.cos(toRad(b.lat)) *
    Math.sin(dLng / 2) ** 2;

  return (
    earthMiles *
    2 *
    Math.atan2(
      Math.sqrt(h),
      Math.sqrt(1 - h)
    )
  );
}

async function loadCompaniesZone(){

  if(companyZoneSettingsCache){
    return companyZoneSettingsCache;
  }

  const res =
    await fetch(
      "/api/system-design",
      {
        headers:{
          Authorization:"Bearer " + token
        },
        cache:"no-store"
      }
    );

  const data =
    await res.json().catch(()=>({}));

  if(!res.ok){
    throw new Error(
      data.message ||
      "Could not load Companies Zone settings."
    );
  }

  const raw =
    data?.companiesZone ||
    data?.serviceZones?.companiesZone ||
    {};

  companyZoneSettingsCache = {
    enabled:
      raw?.enabled === true ||
      String(raw?.enabled).toLowerCase() === "true",

    radiusMiles:
      Math.max(
        0,
        Number(
          raw?.radiusMiles ??
          raw?.radius ??
          0
        ) || 0
      ),

    centerLat:
      zoneNumber(
        raw?.centerLat
      ),

    centerLng:
      zoneNumber(
        raw?.centerLng
      ),

    centerAddress:
      normalizeText(
        raw?.centerAddress ||
        [
          raw?.postalCode,
          raw?.city,
          raw?.stateProvince,
          raw?.country
        ]
          .filter(Boolean)
          .join(", ")
      )
  };

  return companyZoneSettingsCache;
}

async function ensureCompanyZoneGoogleLoaded(){

  if(
    window.google &&
    google.maps &&
    google.maps.DirectionsService &&
    google.maps.Geocoder
  ){
    return;
  }

  if(companyZoneGooglePromise){
    return companyZoneGooglePromise;
  }

  companyZoneGooglePromise =
    new Promise(
      async (resolve,reject)=>{

        try{

          const configRes =
            await fetch(
              "/api/config",
              {
                headers:{
                  Authorization:"Bearer " + token
                }
              }
            );

          const config =
            await configRes
              .json()
              .catch(()=>({}));

          const googleKey =
            normalizeText(
              config?.googleKey
            );

          if(!googleKey){
            reject(
              new Error(
                "Google Maps key is missing."
              )
            );
            return;
          }

          const existing =
            document.querySelector(
              "script[data-company-zone-google='true']"
            ) ||
            document.querySelector(
              "script[data-google-maps='true']"
            );

          if(existing){

            if(
              window.google &&
              google.maps &&
              google.maps.DirectionsService &&
              google.maps.Geocoder
            ){
              resolve();
              return;
            }

            existing.addEventListener(
              "load",
              ()=>resolve(),
              {once:true}
            );

            existing.addEventListener(
              "error",
              ()=>reject(
                new Error(
                  "Google Maps failed to load."
                )
              ),
              {once:true}
            );

            return;
          }

          const script =
            document.createElement(
              "script"
            );

          script.src =
            "https://maps.googleapis.com/maps/api/js?key=" +
            encodeURIComponent(
              googleKey
            );

          script.async = true;
          script.defer = true;

          script.setAttribute(
            "data-company-zone-google",
            "true"
          );

          script.onload =
            ()=>resolve();

          script.onerror =
            ()=>reject(
              new Error(
                "Google Maps failed to load."
              )
            );

          document.head.appendChild(
            script
          );

        }catch(err){
          reject(err);
        }
      }
    );

  return companyZoneGooglePromise;
}

async function resolveCompaniesZoneCenter(zone){

  if(
    zoneCoordOk(
      zone?.centerLat,
      zone?.centerLng
    )
  ){
    return {
      lat:Number(zone.centerLat),
      lng:Number(zone.centerLng)
    };
  }

  const address =
    normalizeText(
      zone?.centerAddress
    );

  if(!address){
    throw new Error(
      "Companies Zone center is missing."
    );
  }

  await ensureCompanyZoneGoogleLoaded();

  return await new Promise(
    (resolve,reject)=>{

      const geocoder =
        new google.maps.Geocoder();

      geocoder.geocode(
        {address},
        (results,status)=>{

          const location =
            results?.[0]
              ?.geometry
              ?.location;

          if(
            status !== "OK" ||
            !location
          ){
            reject(
              new Error(
                "Companies Zone center could not be located."
              )
            );
            return;
          }

          resolve({
            lat:Number(location.lat()),
            lng:Number(location.lng())
          });
        }
      );
    }
  );
}

async function calculateCompanyZoneRoute(addresses){

  const points =
    (Array.isArray(addresses)
      ? addresses
      : []
    )
      .map(normalizeText)
      .filter(Boolean);

  if(points.length < 2){
    throw new Error(
      "Pickup and Dropoff are required for Companies Zone validation."
    );
  }

  await ensureCompanyZoneGoogleLoaded();

  const origin =
    points[0];

  const destination =
    points[
      points.length - 1
    ];

  const waypoints =
    points
      .slice(1,-1)
      .map(address=>({
        location:address,
        stopover:true
      }));

  return await new Promise(
    (resolve,reject)=>{

      const directions =
        new google.maps.DirectionsService();

      directions.route(
        {
          origin,
          destination,
          waypoints,
          optimizeWaypoints:false,
          travelMode:
            google.maps.TravelMode.DRIVING,
          unitSystem:
            google.maps.UnitSystem.IMPERIAL
        },
        (response,status)=>{

          const route =
            response?.routes?.[0];

          if(
            status !== "OK" ||
            !route
          ){
            reject(
              new Error(
                "Unable to verify the trip route for Companies Zone."
              )
            );
            return;
          }

          const routePath =
            Array.isArray(
              route.overview_path
            )
              ? route.overview_path
                  .map(point=>({
                    lat:Number(point.lat()),
                    lng:Number(point.lng())
                  }))
                  .filter(point=>
                    zoneCoordOk(
                      point.lat,
                      point.lng
                    )
                  )
              : [];

          resolve({
            routePath
          });
        }
      );
    }
  );
}

async function checkCompaniesZoneRoute(
  addresses,
  options = {}
){

  const zone =
    await loadCompaniesZone();

  if(
    !zone.enabled ||
    zone.radiusMiles <= 0
  ){
    return true;
  }

  const center =
    await resolveCompaniesZoneCenter(
      zone
    );

  const routeData =
    await calculateCompanyZoneRoute(
      addresses
    );

  const routePath =
    Array.isArray(
      routeData?.routePath
    )
      ? routeData.routePath
      : [];

  if(!routePath.length){
    throw new Error(
      "Companies Zone route could not be verified."
    );
  }

  let farthestMiles = 0;

  for(const point of routePath){

    const miles =
      zoneDistanceMiles(
        center,
        point
      );

    if(miles === null){
      continue;
    }

    farthestMiles =
      Math.max(
        farthestMiles,
        miles
      );

    if(
      miles >
      zone.radiusMiles
    ){

      return confirm(
`WARNING

This trip route leaves the Companies Zone.

Maximum Radius: ${zone.radiusMiles} miles
Route Point Distance: ${miles.toFixed(2)} miles

Continue anyway?`
      );
    }
  }

  return true;
}

async function checkCompaniesZoneSharedPassengers(
  passengers
){

  const list =
    Array.isArray(passengers)
      ? passengers
      : [];

  for(
    let index = 0;
    index < list.length;
    index += 1
  ){

    const passenger =
      list[index] || {};

    const ok =
      await checkCompaniesZoneRoute(
        [
          passenger.pickup,
          passenger.dropoff
        ]
      );

    if(!ok){
      return false;
    }
  }

  return true;
}

/* ================= SAVED CLIENTS =================
   Tenant-scoped browser cache.
   Zero API requests.
============================================== */

const SAVED_CLIENTS_KEY =
  companyStorageKey("savedClients");

function loadSavedClients(){

  try{

    const data =
      JSON.parse(
        localStorage.getItem(
          SAVED_CLIENTS_KEY
        ) || "[]"
      );

    return Array.isArray(data)
      ? data
      : [];

  }catch(_){
    return [];
  }
}

function saveSavedClients(list){

  try{

    localStorage.setItem(
      SAVED_CLIENTS_KEY,
      JSON.stringify(
        Array.isArray(list)
          ? list.slice(0,200)
          : []
      )
    );

  }catch(err){
    console.log(
      "SAVE CLIENT CACHE ERROR:",
      err
    );
  }
}

function clientKey(name){

  return normalizeText(name)
    .toLowerCase()
    .replace(/\s+/g," ");
}

function upsertSavedClient(data){

  const name =
    normalizeText(data?.clientName);

  if(!name){
    return;
  }

  const key =
    clientKey(name);

  const list =
    loadSavedClients();

  const existingIndex =
    list.findIndex(
      item=>
        clientKey(item?.clientName) === key
    );

  const cleanItem = {
    clientName:name,
    clientPhone:
      normalizeText(data?.clientPhone),
    pickup:
      normalizeText(data?.pickup),
    dropoff:
      normalizeText(data?.dropoff),
    updatedAt:
      Date.now()
  };

  if(existingIndex >= 0){

    list.splice(
      existingIndex,
      1
    );
  }

  list.unshift(
    cleanItem
  );

  saveSavedClients(
    list
  );
}

function findSavedClientByName(name){

  const key =
    clientKey(name);

  if(!key){
    return null;
  }

  return (
    loadSavedClients()
      .find(
        item=>
          clientKey(item?.clientName) === key
      ) ||
    null
  );
}

function getMatchingSavedClients(query){

  const q =
    clientKey(query);

  if(q.length < 1){
    return [];
  }

  return loadSavedClients()
    .filter(item=>{
      const name =
        clientKey(item?.clientName);

      return (
        name.includes(q) ||
        normalizeText(item?.clientPhone)
          .includes(q)
      );
    })
    .slice(0,8);
}

/* ================= CURRENT LOCATION =================
   UX:
   - User clicks/focuses Pickup / Dropoff / Stop.
   - First option shown is "Current Location".
   - Only when that option is clicked do we request GPS.
   - One reverse-geocode request turns GPS into a real street address.
   - The visible input receives the real address.
   - lat/lng remain stored in the background for Review/route logic.

   LOW REQUEST POLICY:
   - No location request on page load.
   - No polling / watchPosition.
   - Current GPS + resolved address are cached for 2 minutes.
   - Reusing Current Location in another field during that window causes
     ZERO extra GPS and ZERO extra reverse-geocode requests.
============================================== */

let currentLocationCache = null;
const CURRENT_LOCATION_CACHE_MS = 15 * 60 * 1000;

function hasValidCoords(lat,lng){

  return (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  );
}

function clearLocationMeta(input){

  if(!input) return;

  delete input.dataset.currentLat;
  delete input.dataset.currentLng;
  delete input.dataset.currentLocation;
  delete input.dataset.currentAddress;
}

function attachLocationChangeReset(input){

  if(!input || input.dataset.locationResetBound === "1"){
    return;
  }

  input.dataset.locationResetBound = "1";

  input.addEventListener(
    "input",
    ()=>{
      if(input.dataset.settingLocation === "1"){
        return;
      }
      clearLocationMeta(input);
    }
  );
}

function getFreshCachedCurrentLocation(){

  if(
    !currentLocationCache ||
    !Number.isFinite(Number(currentLocationCache.savedAt))
  ){
    return null;
  }

  if(
    Date.now() - Number(currentLocationCache.savedAt) >
    CURRENT_LOCATION_CACHE_MS
  ){
    currentLocationCache = null;
    return null;
  }

  if(
    !normalizeText(currentLocationCache.address) ||
    !hasValidCoords(
      currentLocationCache.lat,
      currentLocationCache.lng
    )
  ){
    currentLocationCache = null;
    return null;
  }

  return currentLocationCache;
}

function getBrowserCurrentPosition(){

  return new Promise((resolve,reject)=>{

    if(!navigator.geolocation){
      reject(
        new Error(
          "Current Location is not supported on this device."
        )
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position=>{
        resolve({
          lat:Number(position.coords.latitude),
          lng:Number(position.coords.longitude)
        });
      },
      error=>{

        let message =
          "Could not get current location.";

        if(error?.code === 1){
          message =
            "Location permission was denied.";
        }else if(error?.code === 2){
          message =
            "Current location is unavailable.";
        }else if(error?.code === 3){
          message =
            "Current location request timed out.";
        }

        reject(
          new Error(message)
        );
      },
      {
        enableHighAccuracy:false,
        timeout:10000,
        maximumAge:120000
      }
    );
  });
}

async function reverseGeocodeCurrentPosition(lat,lng){

  /*
    Server-side reverse geocode.
    We intentionally do NOT require google.maps.Geocoder in the browser.
    The Google key stays on the server and the company token protects
    this endpoint.
  */

  if(!hasValidCoords(lat,lng)){
    throw new Error(
      "Invalid Current Location coordinates."
    );
  }

  const res =
    await fetch(
      "/api/location/reverse?" +
      new URLSearchParams({
        lat:String(lat),
        lng:String(lng),
        tenantSlug:String(
          localStorage.getItem("tenantSlug") ||
          localStorage.getItem("tenant") ||
          ""
        ).trim()
      }).toString(),
      {
        method:"GET",
        headers:{
          Authorization:
            "Bearer " + token
        },
        cache:"no-store"
      }
    );

  let data = {};

  try{
    data = await res.json();
  }catch(_){}

  if(!res.ok){

    throw new Error(
      data.message ||
      "Could not find the street address for Current Location."
    );
  }

  const address =
    normalizeText(
      data.address ||
      data.formattedAddress ||
      ""
    );

  if(!address){

    throw new Error(
      "Current Location address is unavailable."
    );
  }

  return {
    address,
    lat:Number(lat),
    lng:Number(lng),
    latitude:Number(lat),
    longitude:Number(lng),
    source:
      data.source ||
      "server-reverse-geocode"
  };
}

async function resolveCurrentLocation(){

  const cached =
    getFreshCachedCurrentLocation();

  if(cached){
    return {
      ...cached
    };
  }

  const coords =
    await getBrowserCurrentPosition();

  if(
    !hasValidCoords(
      coords.lat,
      coords.lng
    )
  ){
    throw new Error(
      "Could not read current location."
    );
  }

  const point =
    await reverseGeocodeCurrentPosition(
      coords.lat,
      coords.lng
    );

  currentLocationCache = {
    ...point,
    savedAt:Date.now()
  };

  return {
    ...currentLocationCache
  };
}

function setCurrentLocationOnInput(input,point){

  if(
    !input ||
    !point ||
    !normalizeText(point.address) ||
    !hasValidCoords(point.lat,point.lng)
  ){
    return;
  }

  input.dataset.settingLocation = "1";

  /*
    IMPORTANT:
    The user sees the REAL ADDRESS, not coordinates and not the words
    "Current Location". Review.js therefore receives a normal address.
  */
  input.value =
    normalizeText(point.address);

  input.dataset.currentLat =
    String(point.lat);

  input.dataset.currentLng =
    String(point.lng);

  input.dataset.currentLocation =
    "1";

  input.dataset.currentAddress =
    normalizeText(point.address);

  input.dataset.hasLatLng =
    "1";

  input.dispatchEvent(
    new Event(
      "change",
      {bubbles:true}
    )
  );

  delete input.dataset.settingLocation;
}

function closeCurrentLocationChoices(except=null){

  document
    .querySelectorAll(
      ".current-location-choice.show"
    )
    .forEach(choice=>{
      if(choice !== except){
        choice.classList.remove("show");
      }
    });
}

function bindCurrentLocationChoice(input){

  if(
    !input ||
    input.dataset.currentLocationChoiceBound === "1"
  ){
    return;
  }

  input.dataset.currentLocationChoiceBound = "1";

  attachLocationChangeReset(
    input
  );

  const parent =
    input.closest(
      ".location-field,.stop-address-wrap"
    ) ||
    input.parentElement;

  if(!parent){
    return;
  }

  if(
    getComputedStyle(parent).position === "static"
  ){
    parent.style.position = "relative";
  }

  const choice =
    document.createElement("div");

  choice.className =
    "current-location-choice";

  choice.setAttribute(
    "role",
    "button"
  );

  choice.setAttribute(
    "tabindex",
    "0"
  );

  choice.innerHTML = `
    <span class="pin">📍</span>
    <span>Current Location</span>
  `;

  parent.appendChild(
    choice
  );

  const showChoice = ()=>{
    closeCurrentLocationChoices(choice);
    choice.classList.add("show");
  };

  input.addEventListener(
    "focus",
    showChoice
  );

  input.addEventListener(
    "click",
    showChoice
  );

  async function chooseCurrentLocation(event){

    event?.preventDefault();
    event?.stopPropagation();

    if(choice.classList.contains("loading")){
      return;
    }

    choice.classList.add("loading");
    choice.innerHTML = `
      <span class="pin">📍</span>
      <span>Getting Current Location...</span>
    `;

    try{

      const point =
        await resolveCurrentLocation();

      setCurrentLocationOnInput(
        input,
        point
      );

      /*
        Current Location is already stored on the input itself by
        setCurrentLocationOnInput():
        - visible street address in input.value
        - lat/lng in data-current-lat / data-current-lng

        getLocationMeta() reads those values later during save/submit,
        so no extra point-store synchronization is needed here.
      */

      choice.classList.remove("show");

    }catch(err){

      console.log(
        "CURRENT LOCATION ERROR:",
        err
      );

      showAlert(
        err.message ||
        "Could not get Current Location."
      );

    }finally{

      choice.classList.remove("loading");
      choice.innerHTML = `
        <span class="pin">📍</span>
        <span>Current Location</span>
      `;
    }
  }

  choice.addEventListener(
    "mousedown",
    e=>e.preventDefault()
  );

  choice.addEventListener(
    "click",
    chooseCurrentLocation
  );

  choice.addEventListener(
    "keydown",
    e=>{
      if(
        e.key === "Enter" ||
        e.key === " "
      ){
        chooseCurrentLocation(e);
      }
    }
  );
}

function bindStaticLocationChoices(){

  bindCurrentLocationChoice(
    pickupInput
  );

  bindCurrentLocationChoice(
    dropoffInput
  );
}

document.addEventListener(
  "click",
  e=>{
    if(
      !e.target.closest(
        ".location-field,.stop-address-wrap"
      )
    ){
      closeCurrentLocationChoices();
    }
  }
);

function getLocationMeta(input){

  const lat =
    Number(
      input?.dataset?.currentLat
    );

  const lng =
    Number(
      input?.dataset?.currentLng
    );

  if(
    input?.dataset?.currentLocation === "1" &&
    hasValidCoords(lat,lng)
  ){
    return {
      lat,
      lng,
      address:
        normalizeText(
          input.dataset.currentAddress ||
          input.value
        ),
      source:"browser-current-location"
    };
  }

  return null;
}

function showAlert(msg){
  alert(msg);
}

function bool(v){
  return (
    v === true ||
    String(v).toLowerCase() === "true" ||
    String(v).toLowerCase() === "yes" ||
    String(v).toLowerCase() === "1"
  );
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeServiceCode(v){

  const c =
    normalizeText(v)
      .toUpperCase()
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(!c) return "";

  if(c === "STANDARD" || c === "ST") return "ST";

  if(
    c === "WHEELCHAIR" ||
    c === "WHEEL CHAIR" ||
    c === "WC" ||
    c === "WH"
  ){
    return "WH";
  }

  if(c === "SHARED" || c === "SH") return "SH";
  if(c === "LIMO" || c === "LIMOUSINE" || c === "LM") return "LM";
  if(c === "TAXI" || c === "TX") return "TX";
  if(c === "XL") return "XL";

  return c;
}

function isValidServiceCode(code){

  const normalized =
    normalizeServiceCode(code);

  /*
    Get Quote / backend use the configured operational two-letter code.
    New services are not limited to the original ST/WH/XL/LM/TX/SH list.
    Example: Emergency => EM. CUSTOM_1..4 are gate identities only and
    must never become a trip-number suffix.
  */
  return /^[A-Z0-9]{2}$/.test(normalized);
}

function resolveServiceCode(service){

  if(!service) return "";

  /*
    IMPORTANT:
    Company service code must come from suffix/code fields first.
    Do NOT read title/name first because it can make all services ST.
  */

  const directFields = [

    /* Canonical operational identity first — same source of truth as Get Quote. */
    service.customServiceCode,
    service.operationalCode,
    service.companyServiceCode,
    service.serviceCode,
    service.code,

    /* serviceKey may be CUSTOM_n for custom slots, so it is accepted only
       when it resolves to a real two-letter operational code. */
    service.companyServiceKey,
    service.serviceKey,
    service.serviceType,

    /* Legacy suffixes are compatibility fallbacks only. */
    service.companySuffix,
    service.serviceSuffix,
    service.suffix,
    service.reservedSuffix,
    service.getQuoteSuffix,
    service.companyServiceSuffix,
    service.facilitySuffix,
    service.facilityServiceSuffix,

    service.vehicle
  ];

  for(const field of directFields){

    const code =
      normalizeServiceCode(field);

    if(isValidServiceCode(code)){
      return code;
    }
  }

  /*
    Last fallback only: infer from name.
  */

  const name =
    normalizeServiceCode(
      service.serviceName ||
      service.title ||
      service.name ||
      ""
    );

  if(name.includes("WHEEL")) return "WH";
  if(name.includes("CHAIR")) return "WH";
  if(name.includes("SHARED")) return "SH";
  if(name.includes("LIMO")) return "LM";
  if(name.includes("TAXI")) return "TX";
  if(name.includes("XL")) return "XL";
  if(name.includes("STANDARD")) return "ST";

  return "";
}

function serviceDisplayName(service,code){

  return (
    service?.serviceName ||
    service?.title ||
    service?.name ||
    (
      code === "ST" ? "Standard" :
      code === "WH" ? "Wheelchair" :
      code === "XL" ? "XL" :
      code === "LM" ? "Limo" :
      code === "TX" ? "Taxi" :
      code === "SH" ? "Shared" :
      code || "Service"
    )
  );
}

async function loadSystemTimezone(){

  try{

    const res =
      await fetch("/api/system-design");

    const data =
      await res.json();

    SYSTEM_TIMEZONE =
      data?.timezone ||
      "America/Phoenix";

  }catch(err){
    console.log(err);
  }
}

function getSystemNow(){

  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone:SYSTEM_TIMEZONE
      }
    )
  );
}

function getCurrentServiceConfig(){

  const code =
    normalizeServiceCode(activeService);

  return COMPANY_SERVICES.find(s => {

    const serviceCode =
      resolveServiceCode(s);

    return serviceCode === code;

  }) || {};
}

function isSharedService(service){

  if(!service) return false;

  const code =
    resolveServiceCode(service);

  const key =
    normalizeServiceCode(service.serviceKey);

  const suffix =
    normalizeServiceCode(
      service.companySuffix ||
      service.suffix ||
      service.serviceSuffix ||
      service.reservedSuffix ||
      service.getQuoteSuffix
    );

  const title =
    normalizeServiceCode(
      service.title ||
      service.name ||
      service.serviceName
    );

  const pricing =
    normalizeServiceCode(
      service.companyPricingMode ||
      service.reservedPricingMode ||
      service.pricingMode
    );

  return (
    service.companyShared === true ||
    service.reservedShared === true ||
    service.shared === true ||
    code === "SH" ||
    key === "SH" ||
    suffix === "SH" ||
    title === "SH" ||
    title === "SHARED" ||
    pricing === "SH" ||
    pricing === "SHARED"
  );
}

function mapFacilityOverrideService(s){

  const code =
    resolveServiceCode(s);

  if(!code){
    console.warn("FACILITY OVERRIDE SERVICE CODE MISSING:", s);
  }

  const finalCode =
    code || "ST";

  const serviceName =
    serviceDisplayName(s, finalCode);

  const shared =
    bool(s.shared) ||
    finalCode === "SH" ||
    normalizeServiceCode(s.pricingMode) === "SHARED";

  return {

    ...s,

    _id:
      finalCode,

    title:
      serviceName,

    name:
      serviceName,

    serviceName:
      serviceName,

    serviceKey:
      finalCode,

    serviceCode:
      finalCode,

    serviceType:
      finalCode,

    code:
      finalCode,

    companySuffix:
      finalCode,

    suffix:
      finalCode,

    serviceSuffix:
      finalCode,

    companyShared:
      shared,

    shared:
      shared,

    companyPricingMode:
      s.pricingMode || "MILE",

    companyBaseFare:
      num(s.baseFare),

    companyIncludedMiles:
      num(s.includedMiles),

    companyPerMile:
      num(s.perMile),

    companyHourlyRate:
      num(s.hourlyRate),

    companyHourlyBillingMode:
      s.hourlyBillingMode || "FULL",

    companyStopFee:
      num(s.stopFee),

    companyNoShowFee:
      num(s.noShowFee),

    companySharedPrice:
      num(s.sharedPrice),

    companyDisableCancel:
      bool(s.disableCancel),

    companyWarningMinutes:
      num(s.warningMinutes),

    companyCancelFee:
      num(s.cancelFee),

    companyAddStopEnabled:
      shared ? false : bool(s.addStopEnabled),

    companyAddStopCustomTimeEnabled:
      shared ? false : bool(s.addStopCustomTimeEnabled),

    companyAddStopCutoffMinutes:
      shared ? 0 : num(s.addStopCutoffMinutes),

    __pricingSource:
      "FACILITY_OVERRIDE"
  };
}

function mapServiceManagementService(s){

  const code =
    resolveServiceCode(s);

  if(!code){
    console.warn("SERVICE MANAGEMENT CODE MISSING:", s);
  }

  const finalCode =
    code || "ST";

  const serviceName =
    serviceDisplayName(s, finalCode);

  const shared =
    bool(s.companyShared) ||
    bool(s.reservedShared) ||
    bool(s.shared) ||
    finalCode === "SH" ||
    normalizeServiceCode(
      s.companyPricingMode ||
      s.reservedPricingMode ||
      s.pricingMode
    ) === "SHARED";

  return {

    ...s,

    title:
      serviceName,

    name:
      serviceName,

    serviceName:
      serviceName,

    serviceKey:
      finalCode,

    serviceCode:
      finalCode,

    serviceType:
      finalCode,

    code:
      finalCode,

    companySuffix:
      finalCode,

    suffix:
      finalCode,

    serviceSuffix:
      finalCode,

    companyShared:
      shared,

    shared:
      shared,

    companyWarningMinutes:
      num(
        s.companyWarningMinutes ??
        s.warningMinutes ??
        s.cancelWarningMinutes ??
        120
      ),

    companyDisableCancel:
      bool(
        s.companyDisableCancel ??
        s.disableCancel
      ),

    __pricingSource:
      "SERVICE_MANAGEMENT"
  };
}

function selectedServicePayload(){

  const service =
    getCurrentServiceConfig();

  const serviceKey =
    resolveServiceCode(service) ||
    normalizeServiceCode(activeSuffix) ||
    normalizeServiceCode(activeService);

  if(!serviceKey){
    console.log("BAD SELECTED SERVICE:", service);
    showAlert("Service code missing");
    throw new Error("Service code missing");
  }

  const serviceName =
    serviceDisplayName(service, serviceKey);

  const fromOverride =
    service.__pricingSource === "FACILITY_OVERRIDE";

  return {
    service,

    serviceKey,
    serviceCode:serviceKey,
    serviceType:serviceKey,
    serviceSuffix:serviceKey,

    serviceName,

    serviceId:
      fromOverride
        ? ""
        : String(service._id || ""),

    pricingSource:
      fromOverride
        ? "FACILITY_OVERRIDE"
        : "SERVICE_MANAGEMENT",

    facilityOverrideActive:
      fromOverride
  };
}


/* ================= BOOKING HOURS - FACILITY FRONTEND ================= */

function normalizeCompanyBookingMode(value){
  const mode = String(value || "24_HOURS").trim().toUpperCase().replace(/[\s-]+/g,"_");
  if(mode === "CUSTOM") return "CUSTOM";
  if(mode === "DISABLED") return "DISABLED";
  return "24_HOURS";
}

function companyBookingMinutes(value){
  const match = String(value || "").trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if(!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function companyBookingRule(service,forceOverride=false){
  const hours = service?.bookingHours || {};
  const useOverride = forceOverride === true || service?.__pricingSource === "FACILITY_OVERRIDE";
  return useOverride
    ? (hours.facilityOverride || null)
    : (hours.facility || null);
}

function companyBookingTimeAllowed(service,timeValue,forceOverride=false){
  const rule = companyBookingRule(service,forceOverride);
  if(!rule) return true;

  const mode = normalizeCompanyBookingMode(rule.mode);
  if(mode === "DISABLED") return false;
  if(mode === "24_HOURS") return true;

  const tripMinutes = companyBookingMinutes(timeValue);
  const fromMinutes = companyBookingMinutes(rule.from);
  const toMinutes = companyBookingMinutes(rule.to);

  if(tripMinutes === null || fromMinutes === null || toMinutes === null){
    return true;
  }

  if(fromMinutes <= toMinutes){
    return tripMinutes >= fromMinutes && tripMinutes <= toMinutes;
  }

  return tripMinutes >= fromMinutes || tripMinutes <= toMinutes;
}

function assertCompanyBookingHours(service,dateValue,timeValue,forceOverride=false){
  if(!dateValue || !timeValue) return true;
  if(companyBookingTimeAllowed(service,timeValue,forceOverride)) return true;
  throw new Error("This booking is outside the company's business hours.");
}

async function attachCompanyBookingHoursToOverrideServices(services){
  const list = Array.isArray(services) ? services : [];
  if(!list.length) return list;

  try{
    const res = await fetch("/api/services?company=true",{
      headers:{ Authorization:"Bearer " + token }
    });
    if(!res.ok) return list;

    const base = await res.json().catch(()=>[]);
    if(!Array.isArray(base)) return list;

    const byCode = new Map();
    base.forEach(item=>{
      const code = resolveServiceCode(item);
      if(code) byCode.set(code,item);
    });

    return list.map(item=>{
      const baseService = byCode.get(resolveServiceCode(item));
      return baseService?.bookingHours
        ? { ...item, bookingHours:baseService.bookingHours }
        : item;
    });
  }catch(err){
    console.log("BOOKING HOURS LOAD ERROR:",err);
    return list;
  }
}

/* ================= WARNING ================= */

function getServiceWarningMinutes(service = getCurrentServiceConfig()){
  const rawValues = [
    service?.companyWarningMinutes,
    service?.reservedWarningMinutes,
    service?.warningMinutes,
    service?.cancelWarningMinutes,
    service?.warningTimeMinutes
  ];

  for(const value of rawValues){
    if(value === undefined || value === null || value === "") continue;
    const minutes = Number(value);
    if(Number.isFinite(minutes)) return minutes;
  }

  return 120;
}

function checkDynamicWarning(dateValue,timeValue){

  if(!dateValue || !timeValue){
    return true;
  }

  const service = getCurrentServiceConfig();
  const warningMinutes = getServiceWarningMinutes(service);

  if(warningMinutes <= 0){
    return true;
  }

  const tripDateTime = new Date(`${dateValue}T${timeValue}:00`);
  const now = getSystemNow();

  if(Number.isNaN(tripDateTime.getTime()) || Number.isNaN(now.getTime())){
    return true;
  }

  const diff = (tripDateTime - now) / 60000;

  if(diff > 0 && diff <= warningMinutes){
    const serviceName = serviceDisplayName(
      service,
      resolveServiceCode(service) || normalizeServiceCode(activeService)
    );

    return confirm(
`WARNING

${serviceName || "Selected service"} trip is within ${warningMinutes} minutes.

Continue anyway?`
    );
  }

  return true;
}

/* ================= VALIDATION ================= */

function validateIndividualTrip(){

  if(!normalizeText(entryName.value)){
    showAlert("Entry Name Required");
    return false;
  }

  if(!normalizeText(entryPhone.value)){
    showAlert("Entry Phone Required");
    return false;
  }

  if(!normalizeText(clientName.value)){
    showAlert("Client Name Required");
    return false;
  }

  if(!normalizeText(clientPhone.value)){
    showAlert("Client Phone Required");
    return false;
  }

  if(!normalizeText(pickupInput.value)){
    showAlert("Pickup Required");
    return false;
  }

  if(!normalizeText(dropoffInput.value)){
    showAlert("Dropoff Required");
    return false;
  }

  if(!tripDate.value){
    showAlert("Trip Date Required");
    return false;
  }

  if(!tripTime.value){
    showAlert("Trip Time Required");
    return false;
  }

  const tripDateTime =
    new Date(
      `${tripDate.value}T${tripTime.value}:00`
    );

  if(tripDateTime <= getSystemNow()){
    showAlert("Trip Date/Time Already Passed");
    return false;
  }

  return true;
}

function validateSharedTrip(){

  if(!normalizeText(sharedEntryName.value)){
    showAlert("Entry Name Required");
    return false;
  }

  if(!normalizeText(sharedEntryPhone.value)){
    showAlert("Entry Phone Required");
    return false;
  }

  if(!sharedDate.value){
    showAlert("Trip Date Required");
    return false;
  }

  if(!sharedTime.value){
    showAlert("Trip Time Required");
    return false;
  }

  const tripDateTime =
    new Date(
      `${sharedDate.value}T${sharedTime.value}:00`
    );

  if(tripDateTime <= getSystemNow()){
    showAlert("Trip Date/Time Already Passed");
    return false;
  }

  const cards =
    document.querySelectorAll(".passenger-card");

  if(cards.length < 2){
    showAlert("Minimum 2 Passengers");
    return false;
  }

  for(const card of cards){

    if(!normalizeText(card.querySelector(".sharedClientName").value)){
      showAlert("Passenger Name Required");
      return false;
    }

    if(!normalizeText(card.querySelector(".sharedClientPhone").value)){
      showAlert("Passenger Phone Required");
      return false;
    }

    if(!normalizeText(card.querySelector(".sharedPickup").value)){
      showAlert("Passenger Pickup Required");
      return false;
    }

    if(!normalizeText(card.querySelector(".sharedDropoff").value)){
      showAlert("Passenger Dropoff Required");
      return false;
    }
  }

  return true;
}

/* ================= ENTRY ================= */

function loadEntryInfo(){

  const saved =
    JSON.parse(
      localStorage.getItem(companyStorageKey("entryInfo")) || "{}"
    );

  entryName.value =
    saved.entryName || "";

  entryPhone.value =
    saved.entryPhone || "";

  sharedEntryName.value =
    saved.entryName || "";

  sharedEntryPhone.value =
    saved.entryPhone || "";
}

function saveEntryInfo(){

  localStorage.setItem(
    companyStorageKey("entryInfo"),
    JSON.stringify({
      entryName:entryName.value,
      entryPhone:entryPhone.value
    })
  );

  showAlert("Entry Info Saved ✔");
}

let entryEditMode = false;

function toggleEntryEdit(){

  if(!entryEditMode){

    entryEditMode = true;

    entryName.removeAttribute("readonly");
    entryPhone.removeAttribute("readonly");
    sharedEntryName.removeAttribute("readonly");
    sharedEntryPhone.removeAttribute("readonly");

    if(editEntryBtn) editEntryBtn.innerText = "Save";
    if(editSharedEntryBtn) editSharedEntryBtn.innerText = "Save";

    entryName.focus();

  }else{

    saveEntryInfo();

    entryEditMode = false;

    entryName.setAttribute("readonly", true);
    entryPhone.setAttribute("readonly", true);
    sharedEntryName.setAttribute("readonly", true);
    sharedEntryPhone.setAttribute("readonly", true);

    if(editEntryBtn) editEntryBtn.innerText = "Edit";
    if(editSharedEntryBtn) editSharedEntryBtn.innerText = "Edit";
  }
}

if(editEntryBtn) editEntryBtn.onclick = toggleEntryEdit;
if(editSharedEntryBtn) editSharedEntryBtn.onclick = toggleEntryEdit;
if(saveEntryBtn) saveEntryBtn.onclick = saveEntryInfo;

loadEntryInfo();

/* ================= CLIENT AUTOCOMPLETE ================= */

function hideClientSuggestions(){

  if(!clientSuggestions){
    return;
  }

  clientSuggestions.innerHTML = "";
  clientSuggestions.classList.remove(
    "show"
  );
}

function applySavedClientToIndividual(item){

  if(!item){
    return;
  }

  clientName.value =
    item.clientName || "";

  clientPhone.value =
    item.clientPhone || "";

  pickupInput.value =
    item.pickup || "";

  dropoffInput.value =
    item.dropoff || "";

  clearLocationMeta(
    pickupInput
  );

  clearLocationMeta(
    dropoffInput
  );

  hideClientSuggestions();
}

function renderClientSuggestions(query){

  if(!clientSuggestions){
    return;
  }

  const matches =
    getMatchingSavedClients(
      query
    );

  if(!matches.length){

    hideClientSuggestions();
    return;
  }

  clientSuggestions.innerHTML = "";

  matches.forEach(item=>{

    const row =
      document.createElement("div");

    row.className =
      "client-suggestion";

    const name =
      document.createElement("div");

    name.className =
      "client-suggestion-name";

    name.textContent =
      item.clientName || "";

    const meta =
      document.createElement("div");

    meta.className =
      "client-suggestion-meta";

    meta.textContent =
      [
        item.clientPhone || "",
        item.pickup || ""
      ]
      .filter(Boolean)
      .join(" • ");

    row.appendChild(name);

    if(meta.textContent){
      row.appendChild(meta);
    }

    row.addEventListener(
      "mousedown",
      event=>{
        event.preventDefault();
        applySavedClientToIndividual(
          item
        );
      }
    );

    clientSuggestions.appendChild(
      row
    );
  });

  clientSuggestions.classList.add(
    "show"
  );
}

if(clientName){

  clientName.addEventListener(
    "input",
    ()=>{
      renderClientSuggestions(
        clientName.value
      );
    }
  );

  clientName.addEventListener(
    "focus",
    ()=>{
      if(normalizeText(clientName.value)){
        renderClientSuggestions(
          clientName.value
        );
      }
    }
  );

  clientName.addEventListener(
    "change",
    ()=>{
      const exact =
        findSavedClientByName(
          clientName.value
        );

      if(exact){
        applySavedClientToIndividual(
          exact
        );
      }
    }
  );

  clientName.addEventListener(
    "blur",
    ()=>{
      window.setTimeout(
        hideClientSuggestions,
        120
      );
    }
  );
}

/* ================= DRAFTS ================= */

function loadDraft(){

  const draft =
    JSON.parse(
      localStorage.getItem(companyStorageKey("companyTripDraft")) || "{}"
    );

  clientName.value =
    draft.clientName || "";

  clientPhone.value =
    draft.clientPhone || "";

  pickupInput.value =
    draft.pickup || "";

  dropoffInput.value =
    draft.dropoff || "";

  tripDate.value =
    draft.tripDate || "";

  tripTime.value =
    draft.tripTime || "";

  notes.value =
    draft.notes || "";
}

function saveDraft(){

  localStorage.setItem(
    companyStorageKey("companyTripDraft"),
    JSON.stringify({
      clientName:clientName.value,
      clientPhone:clientPhone.value,
      pickup:pickupInput.value,
      dropoff:dropoffInput.value,
      tripDate:tripDate.value,
      tripTime:tripTime.value,
      notes:notes.value,
      dynamicBookingValues:Object.fromEntries(
        collectDynamicBookingData(false).map(row=>[row.key,row.value])
      )
    })
  );

  showAlert("Draft Saved ✔");
}

if(saveDraftBtn) saveDraftBtn.onclick = saveDraft;

function loadSharedDraft(){

  const draft =
    JSON.parse(
      localStorage.getItem(companyStorageKey("companySharedDraft")) || "{}"
    );

  passengerCount.value =
    draft.passengerCount || "";

  sharedDate.value =
    draft.sharedDate || "";

  sharedTime.value =
    draft.sharedTime || "";

  sharedNotes.value =
    draft.sharedNotes || "";

  if(Number(draft.passengerCount) >= 2){

    renderSharedPassengers(
      Number(draft.passengerCount)
    );

    setTimeout(()=>{

      const cards =
        document.querySelectorAll(".passenger-card");

      (draft.passengers || []).forEach((p,index)=>{

        const card =
          cards[index];

        if(!card) return;

        card.querySelector(".sharedClientName").value =
          p.clientName || "";

        card.querySelector(".sharedClientPhone").value =
          p.clientPhone || "";

        card.querySelector(".sharedPickup").value =
          p.pickup || "";

        card.querySelector(".sharedDropoff").value =
          p.dropoff || "";
      });

    },50);
  }
}

function saveSharedDraft(){

  const passengers = [];

  document.querySelectorAll(".passenger-card").forEach(card=>{

    passengers.push({
      clientName:card.querySelector(".sharedClientName").value,
      clientPhone:card.querySelector(".sharedClientPhone").value,
      pickup:card.querySelector(".sharedPickup").value,
      dropoff:card.querySelector(".sharedDropoff").value
    });
  });

  localStorage.setItem(
    companyStorageKey("companySharedDraft"),
    JSON.stringify({
      passengerCount:passengerCount.value,
      passengers,
      sharedDate:sharedDate.value,
      sharedTime:sharedTime.value,
      sharedNotes:sharedNotes.value
    })
  );

  showAlert("Shared Draft Saved ✔");
}

if(saveSharedDraftBtn) saveSharedDraftBtn.onclick = saveSharedDraft;


/* ================= AUTOMATIC SHARED ================= */

const AUTO_SHARED_DRAFT_KEY =
  companyStorageKey("companyAutomaticSharedDraft");

function setSharedEntryMode(mode){

  sharedEntryMode =
    String(mode || "MANUAL")
      .toUpperCase() === "AUTOMATIC"
      ? "AUTOMATIC"
      : "MANUAL";

  const automatic =
    sharedEntryMode === "AUTOMATIC";

  if(manualSharedModePanel){
    manualSharedModePanel.style.display =
      automatic ? "none" : "block";
  }

  if(automaticSharedModePanel){
    automaticSharedModePanel.style.display =
      automatic ? "block" : "none";
  }

  if(sharedManualModeBtn){
    sharedManualModeBtn.classList.toggle(
      "active",
      !automatic
    );
  }

  if(sharedAutomaticModeBtn){
    sharedAutomaticModeBtn.classList.toggle(
      "active",
      automatic
    );
  }
}

function automaticSharedStatePayload(){
  return {
    candidates:
      Array.isArray(
        automaticSharedCandidates
      )
        ? automaticSharedCandidates
        : [],
    plan:
      automaticSharedPlan &&
      typeof automaticSharedPlan === "object"
        ? automaticSharedPlan
        : null
  };
}

function saveAutomaticSharedStateToServer(){
  if(!token){
    return;
  }

  fetch(
    "/api/company-shared/automatic-state",
    {
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:JSON.stringify(
        automaticSharedStatePayload()
      )
    }
  )
    .then(async res=>{
      if(!res.ok){
        const data =
          await res
            .json()
            .catch(()=>({}));

        throw new Error(
          data.message ||
          "Automatic Shared state save failed"
        );
      }
    })
    .catch(err=>{
      console.log(
        "AUTO SHARED SERVER STATE SAVE ERROR:",
        err
      );
    });
}

function saveAutomaticSharedDraft(){
  const state =
    automaticSharedStatePayload();

  try{
    localStorage.setItem(
      AUTO_SHARED_DRAFT_KEY,
      JSON.stringify(state)
    );
  }catch(err){
    console.log(
      "AUTO SHARED DRAFT SAVE ERROR:",
      err
    );
  }

  saveAutomaticSharedStateToServer();
}

function applyAutomaticSharedState(data){
  automaticSharedCandidates =
    Array.isArray(
      data?.candidates
    )
      ? data.candidates
      : [];

  automaticSharedPlan =
    data?.plan &&
    typeof data.plan === "object"
      ? data.plan
      : null;

  renderAutomaticSharedList();
  renderAutomaticSharedResult(
    automaticSharedPlan
  );
}

async function loadAutomaticSharedDraft(){
  let localState = {};

  try{
    localState =
      JSON.parse(
        localStorage.getItem(
          AUTO_SHARED_DRAFT_KEY
        ) || "{}"
      );

    applyAutomaticSharedState(
      localState
    );

  }catch(err){
    automaticSharedCandidates = [];
    automaticSharedPlan = null;
    renderAutomaticSharedList();
    renderAutomaticSharedResult(null);
  }

  if(!token){
    return;
  }

  try{
    const res =
      await fetch(
        "/api/company-shared/automatic-state",
        {
          headers:{
            Authorization:
              "Bearer " + token
          }
        }
      );

    const data =
      await res
        .json()
        .catch(()=>({}));

    if(
      res.ok &&
      data?.success === true &&
      data?.state
    ){
      const serverState =
        data.state;

      const serverHasState =
        (
          Array.isArray(
            serverState.candidates
          ) &&
          serverState.candidates.length
        ) ||
        (
          serverState.plan &&
          typeof serverState.plan ===
            "object"
        );

      if(serverHasState){
        applyAutomaticSharedState(
          serverState
        );

        try{
          localStorage.setItem(
            AUTO_SHARED_DRAFT_KEY,
            JSON.stringify(
              automaticSharedStatePayload()
            )
          );
        }catch(err){}
      }else if(
        Array.isArray(
          localState?.candidates
        ) &&
        localState.candidates.length
      ){
        saveAutomaticSharedStateToServer();
      }
    }

  }catch(err){
    console.log(
      "AUTO SHARED SERVER STATE LOAD ERROR:",
      err
    );
  }
}

function automaticCandidateId(){
  return (
    "AUTO-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2,8)
  ).toUpperCase();
}

function automaticCandidateById(id){
  return automaticSharedCandidates.find(
    item=>String(item.id) === String(id)
  ) || null;
}

function clearAutomaticCandidateForm(){
  if(autoSharedClientName) autoSharedClientName.value = "";
  if(autoSharedClientPhone) autoSharedClientPhone.value = "";
  if(autoSharedPickup) autoSharedPickup.value = "";
  if(autoSharedDropoff) autoSharedDropoff.value = "";
  if(autoSharedDate) autoSharedDate.value = "";
  if(autoSharedPickupTime) autoSharedPickupTime.value = "";
  if(autoSharedAppointmentTime) autoSharedAppointmentTime.value = "";
  if(autoSharedReturnTime) autoSharedReturnTime.value = "";
  if(autoSharedNotes) autoSharedNotes.value = "";

  clearLocationMeta(autoSharedPickup);
  clearLocationMeta(autoSharedDropoff);
}

function timeToMinutes(value){
  const text = normalizeText(value);
  if(!text || !text.includes(":")) return null;
  const [hourText,minuteText] = text.split(":");
  const hours = Number(hourText);
  const minutes = Number(minuteText);
  if(!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
}

function formatDisplayTime(value){
  const text = normalizeText(value);
  if(!text) return "--";
  return text;
}

function automaticGroupMaps(plan = automaticSharedPlan){
  const groups = Array.isArray(plan?.groups) ? plan.groups : [];
  const singles = Array.isArray(plan?.singles) ? plan.singles : [];
  const excluded = Array.isArray(plan?.excluded) ? plan.excluded : [];

  const matchedIds = new Set();
  const groupIndexById = new Map();
  const unmatchedReasonById = new Map();

  groups.forEach((group,index)=>{
    const members = Array.isArray(group?.trips) ? group.trips : [];
    members.forEach(member=>{
      const id = String(member?.id || member?.tripId || "").trim();
      if(!id) return;
      matchedIds.add(id);
      groupIndexById.set(id,index);
    });
  });

  [...singles,...excluded].forEach(row=>{
    const id = String(row?.tripId || row?.id || "").trim();
    if(!id) return;
    unmatchedReasonById.set(id,row?.reason || "NOT_MATCHED");
  });

  return {
    matchedIds,
    groupIndexById,
    unmatchedReasonById
  };
}

function automaticCandidateStatus(item){
  const maps = automaticGroupMaps();
  const id = String(item?.id || "").trim();

  if(id && maps.groupIndexById.has(id)){
    const groupIndex = maps.groupIndexById.get(id);
    return {
      rowClass:"matched",
      badgeClass:"matched",
      badgeText:`Matched G${groupIndex + 1}`,
      noteText:`Matched in Group ${groupIndex + 1}`
    };
  }

  if(id && maps.unmatchedReasonById.has(id)){
    return {
      rowClass:"unmatched",
      badgeClass:"unmatched",
      badgeText:"Not Matched",
      noteText:"Not Matched"
    };
  }

  return {
    rowClass:"",
    badgeClass:"pending",
    badgeText:"Pending",
    noteText:"Waiting For Build"
  };
}

function visibleAutomaticCandidates(){
  if(!automaticSharedPlan){
    return automaticSharedCandidates;
  }

  const maps = automaticGroupMaps();
  return automaticSharedCandidates.filter(item=>{
    const id = String(item?.id || "").trim();
    return !maps.matchedIds.has(id);
  });
}

function automaticAlternativeServices(){
  return COMPANY_SERVICES.filter(service=>{
    const code = resolveServiceCode(service);
    return code && code !== "SH";
  });
}

function automaticServiceOptionHtml(selectedCode=""){
  const services = automaticAlternativeServices();

  const firstOption = selectedCode
    ? `<option value="">Change Service...</option>`
    : `<option value="" selected>Change Service...</option>`;

  if(!services.length){
    return `<option value="" selected>No alternate service</option>`;
  }

  return firstOption + services.map(service=>{
    const code = resolveServiceCode(service);
    const name = serviceDisplayName(service,code);
    const selected = code === selectedCode ? " selected" : "";
    return `<option value="${safeHtml(code)}"${selected}>${safeHtml(name)}</option>`;
  }).join("");
}

function servicePayloadFromConfig(service){
  const serviceKey = resolveServiceCode(service);
  if(!serviceKey){
    throw new Error("Service code missing");
  }

  const serviceName = serviceDisplayName(service,serviceKey);
  const fromOverride = service.__pricingSource === "FACILITY_OVERRIDE";

  return {
    service,
    serviceKey,
    serviceCode:serviceKey,
    serviceType:serviceKey,
    serviceSuffix:serviceKey,
    serviceName,
    serviceId:fromOverride ? "" : String(service._id || ""),
    pricingSource:fromOverride ? "FACILITY_OVERRIDE" : "SERVICE_MANAGEMENT",
    facilityOverrideActive:fromOverride
  };
}

function updateAutomaticSharedCounters(){
  if(!automaticSharedCounters) return;

  const groups = Array.isArray(automaticSharedPlan?.groups)
    ? automaticSharedPlan.groups
    : [];

  const matchedClients = groups.reduce((total,group)=>{
    return total + (Array.isArray(group?.trips) ? group.trips.length : 0);
  },0);

  const unmatched = automaticSharedPlan
    ? visibleAutomaticCandidates().length
    : 0;

  automaticSharedCounters.innerHTML = `
    <div class="auto-share-counter"><span>Groups</span><strong>${groups.length}</strong></div>
    <div class="auto-share-counter"><span>Matched Clients</span><strong>${matchedClients}</strong></div>
    <div class="auto-share-counter"><span>Not Matched</span><strong>${unmatched}</strong></div>
  `;
}

function bindUnmatchedAutomaticActions(){
  if(!automaticSharedList) return;

  automaticSharedList.querySelectorAll("[data-edit-time]").forEach(button=>{
    button.onclick = ()=>{
      const id = button.getAttribute("data-edit-time");
      const input = automaticSharedList.querySelector(`[data-time-input="${CSS.escape(id)}"]`);
      const saveButton = automaticSharedList.querySelector(`[data-save-time="${CSS.escape(id)}"]`);
      if(input) input.style.display = "inline-block";
      if(saveButton) saveButton.style.display = "inline-block";
      button.style.display = "none";
    };
  });

  automaticSharedList.querySelectorAll("[data-save-time]").forEach(button=>{
    button.onclick = async ()=>{
      const id = button.getAttribute("data-save-time");
      const input = automaticSharedList.querySelector(`[data-time-input="${CSS.escape(id)}"]`);
      const candidate = automaticCandidateById(id);
      const nextTime = normalizeText(input?.value);

      if(!candidate || !nextTime){
        showAlert("Pickup Time Required");
        return;
      }

      candidate.tripTime = nextTime;
      candidate.pickupTime = nextTime;
      saveAutomaticSharedDraft();
      renderAutomaticSharedList();
      updateAutomaticSharedCounters();
      await runAutomaticSharedEngine();
    };
  });

  automaticSharedList.querySelectorAll("[data-service-select]").forEach(select=>{
    const id = select.getAttribute("data-service-select");
    const submitButton = automaticSharedList.querySelector(`[data-submit-unmatched="${CSS.escape(id)}"]`);

    const syncSubmitState = ()=>{
      if(submitButton){
        submitButton.disabled = !normalizeText(select.value);
      }
    };

    syncSubmitState();
    select.addEventListener("change",syncSubmitState);
  });

  automaticSharedList.querySelectorAll("[data-submit-unmatched]").forEach(button=>{
    button.onclick = async ()=>{
      const id = button.getAttribute("data-submit-unmatched");
      const select = automaticSharedList.querySelector(`[data-service-select="${CSS.escape(id)}"]`);
      const serviceCode = normalizeText(select?.value);

      if(!serviceCode){
        showAlert("Change the service before submitting this unmatched trip");
        return;
      }

      await submitUnmatchedAutomaticCandidate(id,serviceCode);
    };
  });
}

async function submitUnmatchedAutomaticCandidate(id,serviceCode){
  const candidate = automaticCandidateById(id);
  if(!candidate){
    showAlert("Trip not found");
    return;
  }

  const service = automaticAlternativeServices().find(item=>resolveServiceCode(item) === serviceCode);
  if(!service){
    showAlert("Select a service");
    return;
  }

  if(!confirm("Warning: Submit this unmatched trip as an individual trip with the selected service?")){
    return;
  }

  try{
    const selected = servicePayloadFromConfig(service);

    assertCompanyBookingHours(
      selected.service,
      candidate.tripDate || "",
      candidate.tripTime || candidate.pickupTime || "",
      selected.facilityOverrideActive === true
    );

    const payload = {
      company:companyName,
      companyName,
      facilityName:companyName,
      companyId,
      facilityId:companyId,
      userId:companyId,
      type:"company",
      source:"company",
      bookingSource:"AUTOMATIC_SHARED_UNMATCHED_INDIVIDUAL",
      tripType:"INDIVIDUAL",
      isShared:false,
      serviceKey:selected.serviceKey,
      serviceCode:selected.serviceCode,
      serviceType:selected.serviceType,
      serviceSuffix:selected.serviceSuffix,
      serviceName:selected.serviceName,
      serviceId:selected.serviceId,
      pricingSource:selected.pricingSource,
      facilityOverrideActive:selected.facilityOverrideActive,
      entryName:sharedEntryName?.value || entryName?.value || "",
      entryPhone:sharedEntryPhone?.value || entryPhone?.value || "",
      clientName:candidate.clientName || "",
      clientPhone:candidate.clientPhone || "",
      pickup:candidate.pickup || "",
      dropoff:candidate.dropoff || "",
      stops:[],
      pickupLat:candidate.pickupLat ?? null,
      pickupLng:candidate.pickupLng ?? null,
      dropoffLat:candidate.dropoffLat ?? null,
      dropoffLng:candidate.dropoffLng ?? null,
      tripDate:candidate.tripDate || "",
      tripTime:candidate.tripTime || candidate.pickupTime || "",
      appointmentTime:candidate.appointmentTime || "",
      notes:candidate.notes || "",
      status:"Scheduled"
    };

    const res = await fetch("/api/trips",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:JSON.stringify(payload)
    });

    const data = await res.json().catch(()=>({}));
    if(!res.ok){
      throw new Error(data.message || "Failed to submit unmatched trip");
    }

    automaticSharedCandidates = automaticSharedCandidates.filter(item=>String(item.id) !== String(id));
    pruneAutomaticPlanIds(new Set([String(id)]),false);
    saveAutomaticSharedDraft();
    renderAutomaticSharedList();
    renderAutomaticSharedResult(automaticSharedPlan);
    updateAutomaticSharedCounters();
    showAlert("Trip submitted successfully ✔");

  }catch(err){
    console.log("UNMATCHED TRIP SUBMIT ERROR:",err);
    showAlert(err.message || "Failed to submit unmatched trip");
  }
}

function renderAutomaticSharedList(){

  if(!automaticSharedList) return;

  const visibleCandidates = visibleAutomaticCandidates();

  if(!visibleCandidates.length){
    automaticSharedList.innerHTML = `
      <div class="auto-share-unmatched">
        ${automaticSharedPlan ? "All current candidates are inside matched groups." : "No Automatic Shared candidates yet."}
      </div>
    `;
    updateAutomaticSharedCounters();
    return;
  }

  const rows = visibleCandidates.map((item,index)=>{
    const status = automaticCandidateStatus(item);
    const isUnmatched = status.badgeClass === "unmatched";
    const serviceOptions = automaticServiceOptionHtml();
    return `
      <div class="auto-share-row ${status.rowClass}">
        <div class="auto-share-cell"><div class="auto-share-data-box">${index + 1}</div></div>
        <div class="auto-share-cell"><div class="auto-share-data-box">${safeHtml(item.clientName)}</div></div>
        <div class="auto-share-cell"><div class="auto-share-data-box">${safeHtml(item.clientPhone)}</div></div>
        <div class="auto-share-cell"><div class="auto-share-data-box">${safeHtml(item.pickup)}</div></div>
        <div class="auto-share-cell"><div class="auto-share-data-box">${safeHtml(item.dropoff)}</div></div>
        <div class="auto-share-cell"><div class="auto-share-data-box">${safeHtml(item.tripDate)}</div></div>
        <div class="auto-share-cell"><div class="auto-share-data-box">${safeHtml(formatDisplayTime(item.tripTime || item.pickupTime))}</div></div>
        <div class="auto-share-cell"><div class="auto-share-data-box">${safeHtml(formatDisplayTime(item.appointmentTime))}</div></div>
        <div class="auto-share-cell"><div class="auto-share-data-box">${safeHtml(formatDisplayTime(item.returnTime))}</div></div>
        <div class="auto-share-cell"><div class="auto-share-data-box">${safeHtml(item.tripLeg || "OUTBOUND")}</div></div>
        <div class="auto-share-cell">
          <span class="auto-share-status-badge ${status.badgeClass}">${safeHtml(status.badgeText)}</span>
        </div>
        <div class="auto-share-cell">
          ${isUnmatched ? `
            <div class="auto-share-unmatched-actions">
              <button class="btn-orange auto-share-action-btn" type="button" data-edit-time="${safeHtml(item.id)}">Edit Time</button>
              <input class="auto-share-inline-time" data-time-input="${safeHtml(item.id)}" type="time" value="${safeHtml(item.tripTime || item.pickupTime || "")}" style="display:none;">
              <button class="btn-blue auto-share-action-btn" type="button" data-save-time="${safeHtml(item.id)}" style="display:none;">Retry Match</button>
              <select class="auto-share-inline-service" data-service-select="${safeHtml(item.id)}">${serviceOptions}</select>
              <button class="btn-green auto-share-action-btn" type="button" data-submit-unmatched="${safeHtml(item.id)}" disabled>Submit Trip</button>
              <button class="auto-share-remove" type="button" data-auto-remove="${safeHtml(item.id)}">×</button>
            </div>
          ` : `
            <button class="auto-share-remove" type="button" data-auto-remove="${safeHtml(item.id)}">×</button>
          `}
        </div>
      </div>
    `;
  }).join("");

  automaticSharedList.innerHTML = `
    <div class="auto-share-row header">
      <div>#</div>
      <div>Passenger</div>
      <div>Phone</div>
      <div>Pickup</div>
      <div>Dropoff</div>
      <div>Date</div>
      <div>Pickup Time</div>
      <div>Appointment</div>
      <div>Return Time</div>
      <div>Leg</div>
      <div>Match Status</div>
      <div>Actions</div>
    </div>
    ${rows}
  `;

  automaticSharedList
    .querySelectorAll("[data-auto-remove]")
    .forEach(button=>{
      button.onclick = ()=>{
        const id = button.getAttribute("data-auto-remove");
        const target = automaticCandidateById(id);
        const pairId = normalizeText(target?.pairId);

        const removedIds = new Set(
          automaticSharedCandidates
            .filter(item=>{
              if(pairId){
                return normalizeText(item?.pairId) === pairId;
              }
              return String(item.id) === String(id);
            })
            .map(item=>String(item.id))
        );

        automaticSharedCandidates = automaticSharedCandidates.filter(item=>{
          if(pairId){
            return normalizeText(item?.pairId) !== pairId;
          }
          return String(item.id) !== String(id);
        });

        if(automaticSharedPlan){
          pruneAutomaticPlanIds(removedIds,false);
        }

        saveAutomaticSharedDraft();
        renderAutomaticSharedList();
        renderAutomaticSharedResult(automaticSharedPlan);
      };
    });

  bindUnmatchedAutomaticActions();
  updateAutomaticSharedCounters();
}

function safeHtml(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function validateAutomaticCandidate(){

  if(!normalizeText(autoSharedClientName?.value)){
    showAlert("Passenger Name Required");
    return false;
  }

  if(!normalizeText(autoSharedClientPhone?.value)){
    showAlert("Passenger Phone Required");
    return false;
  }

  if(!normalizeText(autoSharedPickup?.value)){
    showAlert("Pickup Required");
    return false;
  }

  if(!normalizeText(autoSharedDropoff?.value)){
    showAlert("Dropoff Required");
    return false;
  }

  if(!autoSharedDate?.value){
    showAlert("Trip Date Required");
    return false;
  }

  if(!autoSharedPickupTime?.value){
    showAlert("Pickup Time Required");
    return false;
  }

  return true;
}

function automaticCandidatePayload(){

  const pickupLocation =
    getLocationMeta(autoSharedPickup);

  const dropoffLocation =
    getLocationMeta(autoSharedDropoff);

  const id =
    automaticCandidateId();

  return {
    id,
    pairId:id,
    tripLeg:"OUTBOUND",
    generatedReturn:false,
    clientName:normalizeText(autoSharedClientName?.value),
    clientPhone:normalizeText(autoSharedClientPhone?.value),
    pickup:normalizeText(autoSharedPickup?.value),
    dropoff:normalizeText(autoSharedDropoff?.value),
    pickupLat:pickupLocation?.lat ?? null,
    pickupLng:pickupLocation?.lng ?? null,
    dropoffLat:dropoffLocation?.lat ?? null,
    dropoffLng:dropoffLocation?.lng ?? null,
    tripDate:autoSharedDate?.value || "",
    tripTime:autoSharedPickupTime?.value || "",
    pickupTime:autoSharedPickupTime?.value || "",
    appointmentTime:autoSharedAppointmentTime?.value || "",
    returnTime:autoSharedReturnTime?.value || "",
    notes:normalizeText(autoSharedNotes?.value),
    source:"company",
    sharedEngineSource:"COMPANY",
    company:companyName,
    companyName,
    facilityName:companyName,
    status:"Scheduled"
  };
}

function automaticReturnCandidate(outbound){

  const returnTime =
    normalizeText(outbound?.returnTime);

  if(!returnTime){
    return null;
  }

  const returnId =
    automaticCandidateId();

  return {
    ...outbound,
    id:returnId,
    pairId:outbound.pairId || outbound.id,
    pairedCandidateId:outbound.id,
    tripLeg:"RETURN",
    generatedReturn:true,
    pickup:outbound.dropoff,
    dropoff:outbound.pickup,
    pickupLat:outbound.dropoffLat ?? null,
    pickupLng:outbound.dropoffLng ?? null,
    dropoffLat:outbound.pickupLat ?? null,
    dropoffLng:outbound.pickupLng ?? null,
    tripTime:returnTime,
    pickupTime:returnTime,
    appointmentTime:"",
    returnTime:"",
    notes:outbound.notes || "",
    bookingSource:"AUTOMATIC_SHARED_RETURN"
  };
}

function appointmentStatusText(trip){
  const appointmentMinutes = timeToMinutes(trip?.appointmentTime);
  if(appointmentMinutes === null){
    return {
      text:"No Appointment",
      className:""
    };
  }

  const pickupMinutes = timeToMinutes(trip?.pickupTime || trip?.tripTime);
  if(pickupMinutes === null){
    return {
      text:"Appointment Set",
      className:"auto-share-appointment-risk"
    };
  }

  if(pickupMinutes > appointmentMinutes){
    return {
      text:"Late Risk",
      className:"auto-share-appointment-risk"
    };
  }

  return {
    text:"Review Route",
    className:"auto-share-appointment-ok"
  };
}

function pruneAutomaticPlanIds(idSet,markUnmatched = false){
  if(!automaticSharedPlan || !idSet || !idSet.size){
    return;
  }

  const keepTrip = trip=>!idSet.has(String(trip?.id || trip?.tripId || ""));

  const groups = (Array.isArray(automaticSharedPlan.groups) ? automaticSharedPlan.groups : [])
    .map(group=>({
      ...group,
      trips:(Array.isArray(group?.trips) ? group.trips : []).filter(keepTrip)
    }))
    .filter(group=>(group.trips || []).length >= 2);

  const singles = (Array.isArray(automaticSharedPlan.singles) ? automaticSharedPlan.singles : [])
    .filter(row=>!idSet.has(String(row?.tripId || row?.id || "")));

  const excluded = (Array.isArray(automaticSharedPlan.excluded) ? automaticSharedPlan.excluded : [])
    .filter(row=>!idSet.has(String(row?.tripId || row?.id || "")));

  if(markUnmatched){
    idSet.forEach(id=>{
      excluded.push({
        tripId:id,
        reason:"RETURNED_TO_ORIGINAL"
      });
    });
  }

  automaticSharedPlan = {
    ...automaticSharedPlan,
    groups,
    singles,
    excluded
  };
}

function bindAutomaticGroupActions(){
  if(!automaticSharedResult) return;

  automaticSharedResult
    .querySelectorAll("[data-submit-group-index]")
    .forEach(button=>{
      button.onclick = ()=>{
        const index = Number(button.getAttribute("data-submit-group-index"));
        submitAutomaticSharedGroup(index);
      };
    });

  automaticSharedResult
    .querySelectorAll("[data-return-group-index]")
    .forEach(button=>{
      button.onclick = ()=>{
        const index = Number(button.getAttribute("data-return-group-index"));
        returnAutomaticSharedGroupToOriginal(index);
      };
    });
}

function renderAutomaticSharedResult(plan){

  if(!automaticSharedResult) return;

  if(!plan){
    automaticSharedResult.innerHTML = "";
    return;
  }

  const groups = Array.isArray(plan?.groups) ? plan.groups : [];
  const singles = Array.isArray(plan?.singles) ? plan.singles : [];
  const excluded = Array.isArray(plan?.excluded) ? plan.excluded : [];

  const groupHtml = groups.map((group,index)=>{
    const members = Array.isArray(group?.trips) ? group.trips : [];

    const memberRows = members.map((trip,memberIndex)=>{
      const status = appointmentStatusText(trip);
      return `
        <div class="auto-share-group-grid body">
          <div><div class="auto-share-data-box">${memberIndex + 1}</div></div>
          <div><div class="auto-share-data-box">${safeHtml(trip.clientName || trip.passengerName || trip.name || "Passenger")}</div></div>
          <div><div class="auto-share-data-box">${safeHtml(trip.pickup || "--")}</div></div>
          <div><div class="auto-share-data-box">${safeHtml(trip.dropoff || "--")}</div></div>
          <div><div class="auto-share-data-box">${safeHtml(trip.tripDate || group.tripDate || "--")}</div></div>
          <div><div class="auto-share-data-box">${safeHtml(formatDisplayTime(trip.pickupTime || trip.tripTime || group.calculatedFirstPickupTime || ""))}</div></div>
          <div><div class="auto-share-data-box">${safeHtml(formatDisplayTime(trip.appointmentTime))}</div></div>
          <div><div class="auto-share-data-box">${safeHtml(trip.tripLeg || group.tripLeg || "OUTBOUND")}</div></div>
          <div class="${safeHtml(status.className)}"><div class="auto-share-data-box">${safeHtml(status.text)}</div></div>
        </div>
      `;
    }).join("");

    return `
      <div class="auto-share-group">
        <div class="auto-share-group-header">
          <div>
            <div class="auto-share-group-title">${safeHtml(group.tripLeg || "OUTBOUND")} Group ${index + 1} • ${members.length} Passengers</div>
          </div>
          <div class="auto-share-group-actions">
            <button class="btn-green auto-share-group-btn" type="button" data-submit-group-index="${index}">Submit Group</button>
            <button class="btn-gray auto-share-group-btn" type="button" data-return-group-index="${index}">Return To Original</button>
          </div>
        </div>

        <div class="auto-share-group-table">
          <div class="auto-share-group-table-title">Matched Group Trips</div>
          <div class="auto-share-group-grid header">
            <div>#</div>
            <div>Passenger</div>
            <div>Pickup</div>
            <div>Dropoff</div>
            <div>Date</div>
            <div>Pickup Time</div>
            <div>Appointment</div>
            <div>Leg</div>
            <div>Check</div>
          </div>
          ${memberRows}
        </div>
      </div>
    `;
  }).join("");

  automaticSharedResult.innerHTML = groupHtml || "";

  bindAutomaticGroupActions();
  updateAutomaticSharedCounters();
}

async function runAutomaticSharedEngine(){

  const existingGroups =
    Array.isArray(
      automaticSharedPlan?.groups
    )
      ? automaticSharedPlan.groups
      : [];

  const existingMatchedIds =
    new Set();

  existingGroups.forEach(group=>{
    (
      Array.isArray(group?.trips)
        ? group.trips
        : []
    ).forEach(trip=>{
      const id =
        String(
          trip?.id ||
          trip?.tripId ||
          ""
        ).trim();

      if(id){
        existingMatchedIds.add(id);
      }
    });
  });

  /*
    IMPORTANT PRIORITY:
    1) Existing matched groups stay fixed.
    2) Build NEW groups from currently unmatched trips first.
    3) Only trips still unmatched after step 2 may try to join an existing group.
  */
  const currentlyUnmatched =
    automaticSharedCandidates
      .filter(item=>{
        const id =
          String(
            item?.id ||
            item?.tripId ||
            ""
          ).trim();

        return (
          !id ||
          !existingMatchedIds.has(id)
        );
      });

  if(currentlyUnmatched.length < 1){
    renderAutomaticSharedList();
    renderAutomaticSharedResult(
      automaticSharedPlan
    );
    return;
  }

  if(runAutomaticSharedEngineBtn){
    runAutomaticSharedEngineBtn.disabled = true;
    runAutomaticSharedEngineBtn.innerText = "Building...";
  }

  try{

    async function planTrips(
      trips,
      tripLeg
    ){
      if(!trips.length){
        return {
          success:true,
          groups:[],
          singles:[],
          excluded:[]
        };
      }

      const res =
        await fetch(
          "/api/company-shared/plan",
          {
            method:"POST",
            headers:{
              "Content-Type":
                "application/json",
              Authorization:
                "Bearer " + token
            },
            body:JSON.stringify({
              trips
            })
          }
        );

      const data =
        await res
          .json()
          .catch(()=>({}));

      if(!res.ok){
        throw new Error(
          data.message ||
          `${tripLeg} Automatic Shared planning failed`
        );
      }

      return {
        ...data,
        groups:
          Array.isArray(data?.groups)
            ? data.groups.map(group=>({
                ...group,
                tripLeg
              }))
            : [],
        singles:
          Array.isArray(data?.singles)
            ? data.singles
            : [],
        excluded:
          Array.isArray(data?.excluded)
            ? data.excluded
            : []
      };
    }

    async function planByLeg(
      trips
    ){
      const outboundTrips =
        trips.filter(
          item=>
            String(
              item?.tripLeg ||
              "OUTBOUND"
            )
              .toUpperCase() !==
            "RETURN"
        );

      const returnTrips =
        trips.filter(
          item=>
            String(
              item?.tripLeg ||
              ""
            )
              .toUpperCase() ===
            "RETURN"
        );

      const outboundPlan =
        await planTrips(
          outboundTrips,
          "OUTBOUND"
        );

      const returnPlan =
        await planTrips(
          returnTrips,
          "RETURN"
        );

      return {
        groups:[
          ...(outboundPlan.groups || []),
          ...(returnPlan.groups || [])
        ],
        singles:[
          ...(outboundPlan.singles || []),
          ...(returnPlan.singles || [])
        ],
        excluded:[
          ...(outboundPlan.excluded || []),
          ...(returnPlan.excluded || [])
        ]
      };
    }

    /*
      STEP 1:
      Build groups ONLY from unmatched trips.
      This is the key behavior requested by the Company Automatic Shared flow.
    */
    const unmatchedPlan =
      await planByLeg(
        currentlyUnmatched
      );

    const newGroups =
      Array.isArray(
        unmatchedPlan.groups
      )
        ? unmatchedPlan.groups
        : [];

    const newlyMatchedIds =
      new Set();

    newGroups.forEach(group=>{
      (
        Array.isArray(group?.trips)
          ? group.trips
          : []
      ).forEach(trip=>{
        const id =
          String(
            trip?.id ||
            trip?.tripId ||
            ""
          ).trim();

        if(id){
          newlyMatchedIds.add(id);
        }
      });
    });

    let stillUnmatched =
      currentlyUnmatched
        .filter(item=>{
          const id =
            String(
              item?.id ||
              item?.tripId ||
              ""
            ).trim();

          return (
            !id ||
            !newlyMatchedIds.has(id)
          );
        });

    /*
      STEP 2:
      Only AFTER unmatched-to-unmatched grouping is finished,
      try each remaining trip against EXISTING groups.

      A trip is attached only when the engine validates the WHOLE existing
      group plus that trip as one valid group. Existing groups are not broken.
    */
    const updatedExistingGroups =
      existingGroups.map(group=>({
        ...group,
        trips:
          Array.isArray(group?.trips)
            ? [...group.trips]
            : []
      }));

    const finalStillUnmatched = [];

    for(
      const candidate of
      stillUnmatched
    ){
      let attached = false;

      const candidateLeg =
        String(
          candidate?.tripLeg ||
          "OUTBOUND"
        )
          .trim()
          .toUpperCase();

      for(
        let groupIndex = 0;
        groupIndex <
          updatedExistingGroups.length;
        groupIndex += 1
      ){
        const group =
          updatedExistingGroups[
            groupIndex
          ];

        const groupTrips =
          Array.isArray(group?.trips)
            ? group.trips
            : [];

        if(!groupTrips.length){
          continue;
        }

        const groupLeg =
          String(
            group?.tripLeg ||
            groupTrips[0]?.tripLeg ||
            "OUTBOUND"
          )
            .trim()
            .toUpperCase();

        if(groupLeg !== candidateLeg){
          continue;
        }

        const testTrips = [
          ...groupTrips,
          candidate
        ];

        const testPlan =
          await planTrips(
            testTrips,
            candidateLeg
          );

        const validatedGroup =
          (
            Array.isArray(
              testPlan.groups
            )
              ? testPlan.groups
              : []
          ).find(testGroup=>{
            const testIds =
              new Set(
                (
                  Array.isArray(
                    testGroup?.trips
                  )
                    ? testGroup.trips
                    : []
                )
                  .map(item=>
                    String(
                      item?.id ||
                      item?.tripId ||
                      ""
                    ).trim()
                  )
                  .filter(Boolean)
              );

            return testTrips.every(item=>{
              const id =
                String(
                  item?.id ||
                  item?.tripId ||
                  ""
                ).trim();

              return (
                id &&
                testIds.has(id)
              );
            });
          });

        if(validatedGroup){
          updatedExistingGroups[
            groupIndex
          ] = {
            ...group,
            ...validatedGroup,
            tripLeg:
              group.tripLeg ||
              candidateLeg
          };

          attached = true;
          break;
        }
      }

      if(!attached){
        finalStillUnmatched.push(
          candidate
        );
      }
    }

    const unmatchedIds =
      new Set(
        finalStillUnmatched
          .map(item=>
            String(
              item?.id ||
              item?.tripId ||
              ""
            ).trim()
          )
          .filter(Boolean)
      );

    const originalReasonRows = [
      ...(
        Array.isArray(
          unmatchedPlan.singles
        )
          ? unmatchedPlan.singles
          : []
      ),
      ...(
        Array.isArray(
          unmatchedPlan.excluded
        )
          ? unmatchedPlan.excluded
          : []
      )
    ];

    const finalExcluded =
      originalReasonRows
        .filter(row=>{
          const id =
            String(
              row?.tripId ||
              row?.id ||
              ""
            ).trim();

          return (
            !id ||
            unmatchedIds.has(id)
          );
        });

    automaticSharedPlan = {
      success:true,

      /*
        Existing groups remain first and stable.
        New groups created from unmatched trips are appended after them.
      */
      groups:[
        ...updatedExistingGroups,
        ...newGroups
      ],

      singles:[],
      excluded:finalExcluded,

      matchingPriority:
        "UNMATCHED_FIRST_THEN_EXISTING_GROUPS"
    };

    saveAutomaticSharedDraft();
    renderAutomaticSharedList();
    renderAutomaticSharedResult(
      automaticSharedPlan
    );

  }catch(err){
    console.log(
      "AUTO SHARED ENGINE ERROR:",
      err
    );

    showAlert(
      err.message ||
      "Automatic Shared planning failed"
    );

  }finally{
    if(runAutomaticSharedEngineBtn){
      runAutomaticSharedEngineBtn.disabled = false;
      runAutomaticSharedEngineBtn.innerText = "Build Shared Groups";
    }
  }
}

function automaticPassengerFromCandidate(candidate,index){
  return {
    passengerId:candidate.id || ("AUTO-P" + (index + 1)),
    clientName:candidate.clientName || "",
    clientPhone:candidate.clientPhone || "",
    pickup:candidate.pickup || "",
    dropoff:candidate.dropoff || "",
    pickupLat:candidate.pickupLat ?? null,
    pickupLng:candidate.pickupLng ?? null,
    dropoffLat:candidate.dropoffLat ?? null,
    dropoffLng:candidate.dropoffLng ?? null,
    tripDate:candidate.tripDate || "",
    tripTime:candidate.tripTime || candidate.pickupTime || "",
    pickupTime:candidate.pickupTime || candidate.tripTime || "",
    appointmentTime:candidate.appointmentTime || "",
    returnTime:candidate.returnTime || "",
    tripLeg:candidate.tripLeg || "OUTBOUND",
    generatedReturn:candidate.generatedReturn === true,
    pairId:candidate.pairId || "",
    pairedCandidateId:candidate.pairedCandidateId || "",
    notes:candidate.notes || "",
    source:"company",
    bookingSource:"AUTOMATIC_SHARED",
    status:"Confirmed"
  };
}

async function submitAutomaticSharedGroup(groupIndex){

  const groups = Array.isArray(automaticSharedPlan?.groups)
    ? automaticSharedPlan.groups
    : [];

  const group = groups[groupIndex];

  if(!group){
    showAlert("Group not found");
    return;
  }

  if(!confirm("Warning: Submit this matched Shared group now?")){
    return;
  }

  const sourceTrips = Array.isArray(group?.trips) ? group.trips : [];

  if(sourceTrips.length < 2){
    showAlert("This group must contain at least 2 passengers");
    return;
  }

  const groupDate =
    group.tripDate ||
    sourceTrips[0]?.tripDate ||
    "";

  const groupTime =
    group.calculatedFirstPickupTime ||
    sourceTrips[0]?.pickupTime ||
    sourceTrips[0]?.tripTime ||
    "";

  if(!checkDynamicWarning(groupDate,groupTime)){
    return;
  }

  try{
    const selected = selectedServicePayload();
    const passengers = sourceTrips.map(automaticPassengerFromCandidate);
    const tripDate = group.tripDate || passengers[0]?.tripDate || "";
    const tripTime = group.calculatedFirstPickupTime || passengers[0]?.tripTime || "";

    assertCompanyBookingHours(
      selected.service,
      tripDate,
      tripTime,
      selected.facilityOverrideActive === true
    );

    const payload = {
      company:companyName,
      companyName,
      facilityName:companyName,
      companyId,
      facilityId:companyId,
      userId:companyId,
      type:"company",
      source:"company",
      bookingSource:"AUTOMATIC_SHARED",
      sharedEntryMode:"AUTOMATIC",
      isShared:true,
      tripType:"SHARED",
      serviceKey:selected.serviceKey,
      serviceCode:selected.serviceCode,
      serviceType:selected.serviceType,
      serviceSuffix:selected.serviceSuffix,
      serviceName:selected.serviceName,
      serviceId:selected.serviceId,
      pricingSource:selected.pricingSource,
      facilityOverrideActive:selected.facilityOverrideActive,
      entryName:sharedEntryName?.value || entryName?.value || "",
      entryPhone:sharedEntryPhone?.value || entryPhone?.value || "",
      passengers,
      passengersCount:passengers.length,
      totalPassengers:passengers.length,
      tripDate,
      tripTime,
      routePoints:Array.isArray(group.routePoints) ? group.routePoints : [],
      routeSource:"SHARED_ENGINE",
      notes:`Automatic Shared ${group.tripLeg || "OUTBOUND"}`,

      /*
        Automatic Shared groups are already reviewed/built by the Company
        Shared Engine before Submit Group is pressed. They must enter Trip Hub
        as operationally confirmed, not as a second pending company review.
      */
      status:"Confirmed",
      dispatchSelected:true
    };

    const res = await fetch("/api/trips",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:JSON.stringify(payload)
    });

    const data = await res.json().catch(()=>({}));

    if(!res.ok){
      throw new Error(data.message || "Failed to submit this Automatic Shared group");
    }

    const submittedIds = new Set();
    sourceTrips.forEach(item=>{
      if(item?.id){
        submittedIds.add(String(item.id));
      }
    });

    automaticSharedCandidates = automaticSharedCandidates.filter(
      item=>!submittedIds.has(String(item.id))
    );

    pruneAutomaticPlanIds(submittedIds,false);
    saveAutomaticSharedDraft();

    passengers.forEach(passenger=>{
      upsertSavedClient({
        clientName:passenger.clientName,
        clientPhone:passenger.clientPhone,
        pickup:passenger.pickup,
        dropoff:passenger.dropoff
      });
    });

    renderAutomaticSharedList();
    renderAutomaticSharedResult(automaticSharedPlan);
    showAlert("Automatic Shared group submitted ✔");

  }catch(err){
    console.log("AUTO SHARED GROUP SUBMIT ERROR:",err);
    showAlert(err.message || "Automatic Shared group submit failed");
  }
}

function returnAutomaticSharedGroupToOriginal(groupIndex){
  const groups = Array.isArray(automaticSharedPlan?.groups)
    ? automaticSharedPlan.groups
    : [];

  const group = groups[groupIndex];

  if(!group){
    showAlert("Group not found");
    return;
  }

  if(!confirm("Return this matched group to the original list?")){
    return;
  }

  const sourceTrips = Array.isArray(group?.trips) ? group.trips : [];
  const ids = new Set(
    sourceTrips
      .map(item=>String(item?.id || item?.tripId || "").trim())
      .filter(Boolean)
  );

  pruneAutomaticPlanIds(ids,true);
  saveAutomaticSharedDraft();
  renderAutomaticSharedList();
  renderAutomaticSharedResult(automaticSharedPlan);
}

if(sharedManualModeBtn){
  sharedManualModeBtn.onclick = ()=>{
    setSharedEntryMode("MANUAL");
  };
}

if(sharedAutomaticModeBtn){
  sharedAutomaticModeBtn.onclick = ()=>{
    setSharedEntryMode("AUTOMATIC");
  };
}

if(addAutomaticSharedCandidateBtn){
  addAutomaticSharedCandidateBtn.onclick = ()=>{

    if(!validateAutomaticCandidate()){
      return;
    }

    const candidate = automaticCandidatePayload();
    const returnCandidate = automaticReturnCandidate(candidate);

    if(returnCandidate){
      candidate.pairedCandidateId = returnCandidate.id;
      automaticSharedCandidates.push(candidate,returnCandidate);
    }else{
      automaticSharedCandidates.push(candidate);
    }

    saveAutomaticSharedDraft();
    renderAutomaticSharedList();
    renderAutomaticSharedResult(automaticSharedPlan);
    clearAutomaticCandidateForm();
  };
}

if(runAutomaticSharedEngineBtn){
  runAutomaticSharedEngineBtn.onclick = runAutomaticSharedEngine;
}

/* ================= SERVICES ================= */

function defaultStandardService(){

  return {
    serviceKey:"ST",
    serviceCode:"ST",
    serviceType:"ST",
    serviceSuffix:"ST",
    companySuffix:"ST",
    suffix:"ST",

    title:"Standard",
    name:"Standard",
    serviceName:"Standard",

    companyShared:false,
    shared:false,

    companyWarningMinutes:120,
    companyDisableCancel:false,

    __pricingSource:"DEFAULT"
  };
}

async function loadCompanyServices(){
  COMPANY_SERVICES = [];

  const byCode = new Map();

  function addService(raw,source){
    if(!raw) return;

    const mapped =
      source === "FACILITY_OVERRIDE"
        ? mapFacilityOverrideService(raw)
        : mapServiceManagementService(raw);

    const code =
      resolveServiceCode(mapped);

    if(!code){
      console.warn(
        "ADD TRIP SERVICE SKIPPED - NO CODE:",
        source,
        raw
      );
      return;
    }

    const existing =
      byCode.get(code);

    /*
      Service Management owns identity.
      Facility Override may enrich pricing/settings only.
    */
    if(existing){
      if(source === "FACILITY_OVERRIDE"){
        byCode.set(code,{
          ...existing,
          ...mapped,
          _id:existing._id || mapped._id,
          title:existing.title || mapped.title,
          name:existing.name || mapped.name,
          serviceName:existing.serviceName || mapped.serviceName,
          serviceKey:code,
          serviceCode:code,
          serviceType:code,
          companySuffix:code,
          suffix:code,
          serviceSuffix:code,
          __pricingSource:"FACILITY_OVERRIDE"
        });
      }
      return;
    }

    byCode.set(code,mapped);
  }

  /*
    SOURCE 1 — Company services.
  */
  try{
    const res =
      await fetch(
        "/api/services?company=true",
        {
          headers:{
            Authorization:"Bearer " + token
          },
          cache:"no-store"
        }
      );

    const data =
      await res.json().catch(()=>[]);

    console.log(
      "ADD TRIP /api/services?company=true:",
      res.status,
      data
    );

    if(res.ok && Array.isArray(data)){
      data.forEach(item=>
        addService(
          item,
          "SERVICE_MANAGEMENT"
        )
      );
    }
  }catch(err){
    console.log(
      "COMPANY SERVICES PRIMARY LOAD ERROR:",
      err
    );
  }

  /*
    SOURCE 2 — Admin service list.
    Same tenant token, read-only fallback.
    Useful when company=true filtering is stale/broken.
  */
  try{
    const res =
      await fetch(
        "/api/services/admin",
        {
          headers:{
            Authorization:"Bearer " + token
          },
          cache:"no-store"
        }
      );

    const data =
      await res.json().catch(()=>[]);

    console.log(
      "ADD TRIP /api/services/admin:",
      res.status,
      data
    );

    if(res.ok && Array.isArray(data)){
      data
        .filter(item=>
          item?.companyEnabled !== false ||
          item?.enabled === true
        )
        .forEach(item=>
          addService(
            item,
            "SERVICE_MANAGEMENT"
          )
        );
    }
  }catch(err){
    console.log(
      "COMPANY SERVICES ADMIN FALLBACK ERROR:",
      err
    );
  }

  /*
    SOURCE 3 — Facility pricing override.
    Adds pricing to matching services and can rescue configured
    service names if the service route is temporarily incomplete.
  */
  try{
    const facilityName =
      companyName || "";

    const facilityId =
      companyId || "";

    const bootRes =
      await fetch(
        "/api/facility-pricing-override/bootstrap",
        {
          headers:{
            Authorization:"Bearer " + token
          },
          cache:"no-store"
        }
      );

    const bootData =
      await bootRes.json().catch(()=>({}));

    console.log(
      "ADD TRIP FACILITY BOOTSTRAP:",
      bootRes.status,
      bootData
    );

    if(bootRes.ok){

      /*
        Some backend versions expose a default services array.
        Use it only as a fallback/union source, never as a replacement.
      */
      if(Array.isArray(bootData?.services)){
        bootData.services.forEach(item=>
          addService(
            item,
            "SERVICE_MANAGEMENT"
          )
        );
      }

      if(
        bootData?.success === true &&
        Array.isArray(bootData?.overrides)
      ){
        const fid =
          String(facilityId || "").trim();

        const fname =
          String(facilityName || "")
            .trim()
            .toLowerCase();

        const override =
          bootData.overrides.find(item=>{
            const oid =
              String(
                item?.facilityId || ""
              ).trim();

            const oname =
              String(
                item?.facilityName || ""
              )
              .trim()
              .toLowerCase();

            return (
              (fid && oid && fid === oid) ||
              (
                fname &&
                oname &&
                fname === oname
              )
            );
          }) || null;

        if(
          override?.active === true &&
          Array.isArray(override?.services)
        ){
          override.services.forEach(item=>
            addService(
              item,
              "FACILITY_OVERRIDE"
            )
          );
        }
      }
    }
  }catch(err){
    console.log(
      "COMPANY OVERRIDE FALLBACK ERROR:",
      err
    );
  }

  COMPANY_SERVICES =
    Array.from(byCode.values());

  /*
    Prefer stable base order where possible.
  */
  const order = {
    ST:10,
    WH:20,
    SH:30,
    LM:40,
    TX:50,
    XL:60
  };

  COMPANY_SERVICES.sort((a,b)=>{
    const ac =
      resolveServiceCode(a);

    const bc =
      resolveServiceCode(b);

    return (
      (order[ac] ?? 100) -
      (order[bc] ?? 100)
    );
  });

  console.log(
    "ADD TRIP FINAL COMPANY SERVICES:",
    COMPANY_SERVICES
  );

  /*
    Do NOT invent Standard if the API failed.
    Show the real state instead of hiding the bug.
  */
  if(!COMPANY_SERVICES.length){
    if(companyTabs){
      companyTabs.innerHTML =
        '<div style="width:100%;padding:12px;text-align:center;font-weight:800;color:#b91c1c;background:#fee2e2;border-radius:10px;">No company services were returned.</div>';
    }

    console.error(
      "ADD TRIP: NO COMPANY SERVICES FROM ANY SOURCE"
    );

    return;
  }

  buildDynamicTabs();
}

function setActiveService(service,index){

  activeService =
    resolveServiceCode(service);

  if(!activeService){
    showAlert("Service code missing");
    return;
  }

  activeSuffix =
    activeService;

  companyTabs.querySelectorAll("button").forEach(b=>{
    b.classList.remove("btn-blue");
    b.classList.add("btn-gray");
  });

  const btn =
    companyTabs.querySelectorAll("button")[index];

  if(btn){
    btn.classList.remove("btn-gray");
    btn.classList.add("btn-blue");
  }

  if(isSharedService(service)){
    individualSection.style.display = "none";
    sharedSection.style.display = "block";
  }else{
    individualSection.style.display = "block";
    sharedSection.style.display = "none";
  }

  moveCompanyBookingFieldsToActiveService();

  console.log("ACTIVE SERVICE:", {
    activeService,
    activeSuffix,
    pricingSource:service.__pricingSource,
    warning:service.companyWarningMinutes,
    addStop:service.companyAddStopEnabled,
    rawService:service
  });
}

function buildDynamicTabs(){

  if(!companyTabs) return;

  companyTabs.innerHTML = "";

  COMPANY_SERVICES.forEach((service,index)=>{

    const btn =
      document.createElement("button");

    btn.type =
      "button";

    btn.innerText =
      service.title ||
      service.name ||
      service.serviceName ||
      service.serviceKey ||
      "Service";

    btn.className =
      index === 0
        ? "btn-blue"
        : "btn-gray";

    btn.onclick = ()=>{
      setActiveService(service,index);
    };

    companyTabs.appendChild(btn);
  });

  if(COMPANY_SERVICES.length > 0){
    setActiveService(COMPANY_SERVICES[0],0);
  }
}

/* ================= STOPS ================= */

function createStopInput(value=""){

  const currentStops =
    stopsBox.querySelectorAll(".stop-input").length;

  if(currentStops >= 5){
    showAlert("Maximum 5 stops allowed.");
    return;
  }

  const wrapper =
    document.createElement("div");

  wrapper.className =
    "stop-row";

  wrapper.innerHTML = `
    <div class="stop-address-wrap">
      <input
        type="text"
        class="stop-input"
        placeholder="Stop address"
        value="${value}"
      >
    </div>
    <button
      type="button"
      class="remove-stop-btn"
    >
      ✕
    </button>
  `;

  wrapper.querySelector(".remove-stop-btn").onclick = ()=>{
    wrapper.remove();
  };

  const stopInput =
    wrapper.querySelector(
      ".stop-input"
    );

  bindCurrentLocationChoice(
    stopInput
  );

stopsBox.appendChild(wrapper);
}

if(addStopBtn){
  addStopBtn.onclick = ()=>createStopInput();
}

/* ================= SHARED PASSENGERS ================= */

function renderSharedPassengers(count){

  passengersContainer.innerHTML = "";

  if(count < 2) return;

  for(let i = 1; i <= count; i++){

    const card =
      document.createElement("div");

    card.className =
      "passenger-card";

    card.innerHTML = `
      <div class="passenger-header">
        <h4>Passenger ${i}</h4>
      </div>
      <div class="form-grid">
        <div class="field-wrap">
          <input class="sharedClientName" placeholder="Client Name" autocomplete="off">
          <div class="client-suggestions shared-client-suggestions"></div>
        </div>
        <div class="field-wrap">
          <input class="sharedClientPhone" placeholder="Client Phone">
        </div>
        <div class="field-wrap location-field">
          <input class="sharedPickup" placeholder="Pickup Address"></div>
        <div class="field-wrap location-field">
          <input class="sharedDropoff" placeholder="Dropoff Address"></div>
      </div>
    `;

    const sharedName =
      card.querySelector(
        ".sharedClientName"
      );

    const sharedPhone =
      card.querySelector(
        ".sharedClientPhone"
      );

    const sharedPickup =
      card.querySelector(
        ".sharedPickup"
      );

    const sharedDropoff =
      card.querySelector(
        ".sharedDropoff"
      );

    bindCurrentLocationChoice(
      sharedPickup
    );

    bindCurrentLocationChoice(
      sharedDropoff
    );

    const sharedSuggestions =
      card.querySelector(
        ".shared-client-suggestions"
      );

    function hideSharedSuggestions(){

      if(!sharedSuggestions){
        return;
      }

      sharedSuggestions.innerHTML = "";

      sharedSuggestions.classList.remove(
        "show"
      );
    }

    function applySharedSavedClient(item){

      if(!item){
        return;
      }

      sharedName.value =
        item.clientName || "";

      sharedPhone.value =
        item.clientPhone || "";

      sharedPickup.value =
        item.pickup || "";

      sharedDropoff.value =
        item.dropoff || "";

      clearLocationMeta(
        sharedPickup
      );

      clearLocationMeta(
        sharedDropoff
      );

      hideSharedSuggestions();
    }

    function renderSharedSuggestions(query){

      if(!sharedSuggestions){
        return;
      }

      const matches =
        getMatchingSavedClients(
          query
        );

      if(!matches.length){
        hideSharedSuggestions();
        return;
      }

      sharedSuggestions.innerHTML = "";

      matches.forEach(item=>{

        const row =
          document.createElement("div");

        row.className =
          "client-suggestion";

        const name =
          document.createElement("div");

        name.className =
          "client-suggestion-name";

        name.textContent =
          item.clientName || "";

        const meta =
          document.createElement("div");

        meta.className =
          "client-suggestion-meta";

        meta.textContent =
          [
            item.clientPhone || "",
            item.pickup || ""
          ]
          .filter(Boolean)
          .join(" • ");

        row.appendChild(name);

        if(meta.textContent){
          row.appendChild(meta);
        }

        row.addEventListener(
          "mousedown",
          event=>{
            event.preventDefault();

            applySharedSavedClient(
              item
            );
          }
        );

        sharedSuggestions.appendChild(
          row
        );
      });

      sharedSuggestions.classList.add(
        "show"
      );
    }

    if(sharedName){

      sharedName.addEventListener(
        "input",
        ()=>{
          renderSharedSuggestions(
            sharedName.value
          );
        }
      );

      sharedName.addEventListener(
        "change",
        ()=>{
          const exact =
            findSavedClientByName(
              sharedName.value
            );

          if(exact){
            applySharedSavedClient(
              exact
            );
          }
        }
      );

      sharedName.addEventListener(
        "blur",
        ()=>{
          window.setTimeout(
            hideSharedSuggestions,
            120
          );
        }
      );
    }

    passengersContainer.appendChild(card);
  }
}

if(passengerCount){
  passengerCount.onchange = function(){
    renderSharedPassengers(Number(this.value));
  };
}

/* ================= SUBMIT INDIVIDUAL ================= */

if(submitTripBtn){

submitTripBtn.onclick = async function(){

  if(!validateIndividualTrip()){
    return;
  }

  if(
    !checkDynamicWarning(
      tripDate.value,
      tripTime.value
    )
  ){
    return;
  }

  submitTripBtn.disabled = true;
  submitTripBtn.innerText = "Submitting...";

  try{

    const stops =
      [...document.querySelectorAll(".stop-input")]
        .map(i=>normalizeText(i.value))
        .filter(Boolean);

    const companyZoneOk =
      await checkCompaniesZoneRoute(
        [
          pickupInput.value,
          ...stops,
          dropoffInput.value
        ]
      );

    if(!companyZoneOk){
      return;
    }

    const selected =
      selectedServicePayload();

    assertCompanyBookingHours(
      selected.service,
      tripDate.value,
      tripTime.value,
      selected.facilityOverrideActive === true
    );

    console.log("===== DEBUG SELECTED SERVICE BEFORE CREATE =====");
    console.log("activeService:", activeService);
    console.log("activeSuffix:", activeSuffix);
    console.log("selected:", selected);
    console.log("selected service object:", selected.service);
    console.log("===============================================");

    const pickupLocation =
      getLocationMeta(
        pickupInput
      );

    const dropoffLocation =
      getLocationMeta(
        dropoffInput
      );

    const stopDetails =
      [...document.querySelectorAll(".stop-input")]
        .map(input=>{

          const loc =
            getLocationMeta(
              input
            );

          return {
            address:
              normalizeText(
                input.value
              ),
            lat:
              loc?.lat ?? null,
            lng:
              loc?.lng ?? null,
            source:
              loc?.source || ""
          };
        })
        .filter(
          item=>item.address
        );

    const dynamicBookingData =
      collectDynamicBookingData(true);

    const dynamicTopLevel =
      dynamicBookingTopLevelValues(dynamicBookingData);

    const trip = {
      company:companyName,
      companyName:companyName,
      facilityName:companyName,

      companyId:companyId,
      facilityId:companyId,
      userId:companyId,

      type:"company",
      source:"company",

      tripType:"INDIVIDUAL",
      isShared:false,

      serviceKey:selected.serviceKey,
      serviceCode:selected.serviceCode,
      serviceType:selected.serviceType,
      serviceSuffix:selected.serviceSuffix,
      serviceName:selected.serviceName,
      serviceId:selected.serviceId,

      pricingSource:selected.pricingSource,
      facilityOverrideActive:selected.facilityOverrideActive,

      entryName:entryName.value,
      entryPhone:entryPhone.value,

      clientName:clientName.value,
      clientPhone:clientPhone.value,

      pickup:pickupInput.value,
      dropoff:dropoffInput.value,
      stops,

      pickupLat:
        pickupLocation?.lat ?? null,
      pickupLng:
        pickupLocation?.lng ?? null,
      pickupGeoSource:
        pickupLocation?.source || "",

      dropoffLat:
        dropoffLocation?.lat ?? null,
      dropoffLng:
        dropoffLocation?.lng ?? null,
      dropoffGeoSource:
        dropoffLocation?.source || "",

      stopDetails,

      tripDate:tripDate.value,
      tripTime:tripTime.value,
      notes:notes.value,

      dynamicBookingData,
      customBookingData:dynamicBookingData.filter(row=>row.source === "CUSTOM"),
      bookingData:{
        company:dynamicBookingObject(dynamicBookingData),
        facility:dynamicBookingObject(dynamicBookingData)
      },
      ...dynamicTopLevel,

      status:"Scheduled"
    };

    console.log("CREATE INDIVIDUAL TRIP PAYLOAD:", trip);

    const res =
      await fetch("/api/trips",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          Authorization:"Bearer " + token
        },
        body:JSON.stringify(trip)
      });

    if(!res.ok){
      const err =
        await res.json().catch(()=>({}));
      throw new Error(err.message || "Server Error");
    }

    upsertSavedClient({
      clientName:clientName.value,
      clientPhone:clientPhone.value,
      pickup:pickupInput.value,
      dropoff:dropoffInput.value
    });

    showAlert("Trip Submitted Successfully ✔");

    clientName.value = "";
    clientPhone.value = "";
    pickupInput.value = "";
    dropoffInput.value = "";
    tripDate.value = "";
    tripTime.value = "";
    notes.value = "";
    stopsBox.innerHTML = "";
    clearDynamicBookingFields();

    localStorage.removeItem(companyStorageKey("companyTripDraft"));

  }catch(err){

    console.log(err);
    showAlert(err.message || "Server Error");

  }finally{

    submitTripBtn.disabled = false;
    submitTripBtn.innerText = "Submit Trip";
  }
};

}

/* ================= SUBMIT SHARED ================= */

if(submitSharedBtn){

submitSharedBtn.onclick = async function(){

  if(!validateSharedTrip()){
    return;
  }

  if(
    !checkDynamicWarning(
      sharedDate.value,
      sharedTime.value
    )
  ){
    return;
  }

  if(!sharedDate.value || !sharedTime.value){
    showAlert("Select shared date/time");
    return;
  }

  const passengers = [];

  document.querySelectorAll(".passenger-card").forEach((card,index)=>{

    const sharedPickupInput =
      card.querySelector(".sharedPickup");

    const sharedDropoffInput =
      card.querySelector(".sharedDropoff");

    const pickupLocation =
      getLocationMeta(
        sharedPickupInput
      );

    const dropoffLocation =
      getLocationMeta(
        sharedDropoffInput
      );

    passengers.push({
      passengerId:"P" + (index + 1),
      clientName:card.querySelector(".sharedClientName").value,
      clientPhone:card.querySelector(".sharedClientPhone").value,
      pickup:sharedPickupInput.value,
      dropoff:sharedDropoffInput.value,

      pickupLat:
        pickupLocation?.lat ?? null,
      pickupLng:
        pickupLocation?.lng ?? null,
      pickupGeoSource:
        pickupLocation?.source || "",

      dropoffLat:
        dropoffLocation?.lat ?? null,
      dropoffLng:
        dropoffLocation?.lng ?? null,
      dropoffGeoSource:
        dropoffLocation?.source || "",

      status:"Scheduled"
    });
  });

  if(passengers.length < 2){
    showAlert("Minimum 2 passengers");
    return;
  }

  try{

    const companyZoneOk =
      await checkCompaniesZoneSharedPassengers(
        passengers
      );

    if(!companyZoneOk){
      return;
    }

  }catch(err){

    console.log(
      "COMPANIES ZONE CHECK ERROR:",
      err
    );

    showAlert(
      err.message ||
      "Companies Zone validation failed."
    );

    return;
  }

  submitSharedBtn.disabled = true;
  submitSharedBtn.innerText = "Submitting...";

  try{

    const selected =
      selectedServicePayload();

    assertCompanyBookingHours(
      selected.service,
      sharedDate.value,
      sharedTime.value,
      selected.facilityOverrideActive === true
    );

    const dynamicBookingData =
      collectDynamicBookingData(true);

    const dynamicTopLevel =
      dynamicBookingTopLevelValues(
        dynamicBookingData
      );

    const sharedTrip = {
      company:companyName,
      companyName:companyName,
      facilityName:companyName,

      companyId:companyId,
      facilityId:companyId,
      userId:companyId,

      type:"company",
      source:"company",

      isShared:true,
      tripType:"SHARED",

      serviceKey:selected.serviceKey,
      serviceCode:selected.serviceCode,
      serviceType:selected.serviceType,
      serviceSuffix:selected.serviceSuffix,
      serviceName:selected.serviceName,
      serviceId:selected.serviceId,

      pricingSource:selected.pricingSource,
      facilityOverrideActive:selected.facilityOverrideActive,

      passengers,
      passengersCount:passengers.length,
      totalPassengers:passengers.length,

      entryName:sharedEntryName.value,
      entryPhone:sharedEntryPhone.value,

      tripDate:sharedDate.value,
      tripTime:sharedTime.value,
      notes:sharedNotes.value,

      dynamicBookingData,
      customBookingData:
        dynamicBookingData.filter(
          row=>row.source === "CUSTOM"
        ),
      bookingData:{
        company:
          dynamicBookingObject(
            dynamicBookingData
          ),
        facility:
          dynamicBookingObject(
            dynamicBookingData
          )
      },
      ...dynamicTopLevel,

      status:"Scheduled"
    };

    console.log("CREATE SHARED TRIP PAYLOAD:", sharedTrip);

    const res =
      await fetch("/api/trips",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          Authorization:"Bearer " + token
        },
        body:JSON.stringify(sharedTrip)
      });

    if(!res.ok){
      const err =
        await res.json().catch(()=>({}));
      throw new Error(err.message || "Server Error");
    }

    passengers.forEach(passenger=>{
      upsertSavedClient({
        clientName:passenger.clientName,
        clientPhone:passenger.clientPhone,
        pickup:passenger.pickup,
        dropoff:passenger.dropoff
      });
    });

    showAlert("Shared Trip Submitted ✔");

    passengersContainer.innerHTML = "";
    sharedDate.value = "";
    sharedTime.value = "";
    sharedNotes.value = "";
    passengerCount.value = "";
    clearDynamicBookingFields();

    localStorage.removeItem(companyStorageKey("companySharedDraft"));

  }catch(err){

    console.log(err);
    showAlert(err.message || "Server Error");

  }finally{

    submitSharedBtn.disabled = false;
    submitSharedBtn.innerText = "Submit Shared";
  }
};

}

/* ================= INIT ================= */

bindStaticLocationChoices();

bindCurrentLocationChoice(autoSharedPickup);
bindCurrentLocationChoice(autoSharedDropoff);

await loadAutomaticSharedDraft();
setSharedEntryMode("AUTOMATIC");

attachLocationChangeReset(
  pickupInput
);

attachLocationChangeReset(
  dropoffInput
);

loadDraft();
loadSharedDraft();

await loadSystemTimezone();

/* Load company services and Company Additional Information independently.
   A slow/failed pricing request must never prevent company booking fields. */
await Promise.allSettled([
  loadCompanyServices(),
  loadCompanyBookingFields()
]);

})();

});