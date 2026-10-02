"use strict";

/* =========================
   SECURITY
========================= */

const token =
  localStorage.getItem("token") ||
  "";

const role =
  localStorage.getItem("role") ||
  "";

if(
  !token ||
  role !== "PLATFORM_ADMIN"
){
  window.location.href =
    "/platform-admin/login.html";
}

/* =========================
   API
========================= */

const API_BASE =
  "/api/platform-admin";

/* =========================
   DOM
========================= */

const tenantSelect =
  document.getElementById(
    "tenantSelect"
  );

const servicesGrid =
  document.getElementById(
    "servicesGrid"
  );

const saveBtn =
  document.getElementById(
    "saveBtn"
  );

const resetBtn =
  document.getElementById(
    "resetBtn"
  );

const refreshBtn =
  document.getElementById(
    "refreshBtn"
  );

const companySummary =
  document.getElementById(
    "companySummary"
  );

const companyName =
  document.getElementById(
    "companyName"
  );

const companyMeta =
  document.getElementById(
    "companyMeta"
  );

const companyStatus =
  document.getElementById(
    "companyStatus"
  );

const selectedCounter =
  document.getElementById(
    "selectedCounter"
  );

const message =
  document.getElementById(
    "message"
  );

/* =========================
   STATE
========================= */

let tenants = [];
let serviceCatalog = [];

let selectedTenantId = "";

let savedServices = [];
let draftServices = [];

let savedCustomServiceNames = {};
let draftCustomServiceNames = {};

let loading = false;
let saving = false;

/* =========================
   HELPERS
========================= */

function authHeaders(
  json = false
){

  const headers = {
    Authorization:
      "Bearer " + token
  };

  if(json){
    headers["Content-Type"] =
      "application/json";
  }

  return headers;
}

function clean(value){
  return String(
    value ?? ""
  ).trim();
}

function normalizeServiceKey(value){

  const key =
    clean(value)
      .toUpperCase()
      .replace(/\s+/g,"");

  if(key === "STANDARD") return "ST";

  if(
    key === "WHEELCHAIR" ||
    key === "WC"
  ){
    return "WH";
  }

  if(key === "SHARED") return "SH";

  if(
    key === "LIMO" ||
    key === "LIMOUSINE"
  ){
    return "LM";
  }

  if(key === "TAXI") return "TX";

  /*
    Custom Services use permanent Platform Gate identities.
    Their customer-facing name/code is configured later by the tenant
    Super Admin and must never replace CUSTOM_1..CUSTOM_4 here.
  */
  if(key === "CUSTOM1" || key === "CUSTOM-1") return "CUSTOM_1";
  if(key === "CUSTOM2" || key === "CUSTOM-2") return "CUSTOM_2";
  if(key === "CUSTOM3" || key === "CUSTOM-3") return "CUSTOM_3";
  if(key === "CUSTOM4" || key === "CUSTOM-4") return "CUSTOM_4";

  return key;
}

function customSlotNumber(service){

  const direct =
    Number(service?.customSlot || 0);

  if(
    Number.isInteger(direct) &&
    direct >= 1 &&
    direct <= 4
  ){
    return direct;
  }

  const key =
    normalizeServiceKey(
      service?.serviceKey
    );

  const match =
    key.match(/^CUSTOM_([1-4])$/);

  return match
    ? Number(match[1])
    : 0;
}

function isCustomGate(service){

  return (
    service?.isCustom === true ||
    customSlotNumber(service) > 0
  );
}

function serviceCardCode(service){

  const slot =
    customSlotNumber(service);

  if(slot){
    return `C${slot}`;
  }

  return normalizeServiceKey(
    service?.serviceKey
  );
}

function customGateKey(service){

  const slot =
    customSlotNumber(service);

  return slot
    ? `CUSTOM_${slot}`
    : "";
}

function customServiceNameFor(service){

  const gate =
    customGateKey(service);

  if(!gate){
    return "";
  }

  return clean(
    draftCustomServiceNames?.[gate] ||
    savedCustomServiceNames?.[gate] ||
    ""
  );
}

function serviceCardTitle(service){

  const slot =
    customSlotNumber(service);

  if(slot){
    return (
      customServiceNameFor(service) ||
      `Custom Service ${slot}`
    );
  }

  return clean(
    service?.title ||
    service?.serviceKey
  );
}

function normalizeCustomServiceNames(value){

  const input =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value
      : {};

  const out = {};

  for(let slot = 1; slot <= 4; slot++){
    const gate = `CUSTOM_${slot}`;
    out[gate] = clean(input[gate]);
  }

  return out;
}

function customNameChanged(){

  for(let slot = 1; slot <= 4; slot++){

    const gate =
      `CUSTOM_${slot}`;

    if(
      clean(draftCustomServiceNames[gate]) !==
      clean(savedCustomServiceNames[gate])
    ){
      return true;
    }
  }

  return false;
}

function customNameRequiredForGate(gate){

  return (
    draftServices.includes(gate) &&
    !clean(
      draftCustomServiceNames[gate]
    )
  );
}

function firstMissingCustomNameGate(){

  for(let slot = 1; slot <= 4; slot++){

    const gate =
      `CUSTOM_${slot}`;

    if(
      customNameRequiredForGate(gate)
    ){
      return gate;
    }
  }

  return "";
}

function customNameLocked(gate){

  /*
    Existing active custom services stay locked.
    The moment Platform Admin turns the slot OFF, the name becomes editable
    so it can be cleared or reused before the next activation.
  */
  return (
    savedServices.includes(gate) &&
    draftServices.includes(gate) &&
    Boolean(
      clean(
        savedCustomServiceNames[gate]
      )
    )
  );
}

function uniqueServices(values){

  if(!Array.isArray(values)){
    return [];
  }

  return [
    ...new Set(
      values
        .map(
          normalizeServiceKey
        )
        .filter(Boolean)
    )
  ];
}

function getTenant(id){

  return tenants.find(
    tenant =>
      String(tenant._id) ===
      String(id)
  );
}

function sameServices(a,b){

  const one =
    [...uniqueServices(a)]
      .sort();

  const two =
    [...uniqueServices(b)]
      .sort();

  return (
    JSON.stringify(one) ===
    JSON.stringify(two)
  );
}

function hasChanges(){

  return (
    !sameServices(
      savedServices,
      draftServices
    ) ||
    customNameChanged()
  );
}

function showMessage(
  text,
  type = "info"
){

  if(!message){
    return;
  }

  message.className =
    `message show ${type}`;

  message.textContent =
    text;
}

function clearMessage(){

  if(!message){
    return;
  }

  message.className =
    "message";

  message.textContent =
    "";
}

function setBusy(value){

  loading =
    value === true;

  refreshBtn.disabled =
    loading ||
    saving;

  tenantSelect.disabled =
    loading ||
    saving;

  updateActionButtons();
}

function updateActionButtons(){

  const selected =
    !!selectedTenantId;

  const changed =
    hasChanges();

  saveBtn.disabled =
    !selected ||
    loading ||
    saving ||
    !changed;

  resetBtn.disabled =
    !selected ||
    loading ||
    saving ||
    !changed;
}

function updateCounter(){

  const count =
    uniqueServices(
      draftServices
    ).length;

  selectedCounter.textContent =
    `${count} Selected`;
}

/* =========================
   TENANTS
========================= */

async function loadTenants(){

  const res =
    await fetch(
      `${API_BASE}/tenants`,
      {
        headers:
          authHeaders()
      }
    );

  const data =
    await res.json()
      .catch(()=>[]);

  if(!res.ok){

    throw new Error(
      data?.message ||
      "Failed to load companies"
    );
  }

  tenants =
    Array.isArray(data)
      ? data
      : [];

  renderTenantSelect();
}

function renderTenantSelect(){

  if(!tenants.length){

    tenantSelect.innerHTML =
      `<option value="">
        No companies found
      </option>`;

    selectedTenantId = "";

    return;
  }

  tenantSelect.innerHTML = `
    <option value="">
      Select Company
    </option>

    ${
      tenants
        .map(tenant=>`
          <option
            value="${clean(tenant._id)}"
          >
            ${clean(tenant.name)}
          </option>
        `)
        .join("")
    }
  `;

  if(selectedTenantId){

    const stillExists =
      tenants.some(
        tenant =>
          String(tenant._id) ===
          String(selectedTenantId)
      );

    if(stillExists){
      tenantSelect.value =
        selectedTenantId;
    }else{
      selectedTenantId = "";
    }
  }
}

/* =========================
   SERVICE CATALOG
========================= */

async function loadServiceCatalog(){

  const res =
    await fetch(
      `${API_BASE}/service-catalog`,
      {
        headers:
          authHeaders()
      }
    );

  const data =
    await res.json()
      .catch(()=>({}));

  if(!res.ok){

    throw new Error(
      data?.message ||
      "Failed to load services"
    );
  }

  serviceCatalog =
    Array.isArray(data.services)
      ? data.services
      : [];
}

/* =========================
   COMPANY SERVICES
========================= */

async function loadTenantServices(
  tenantId
){

  if(!tenantId){
    return;
  }

  clearMessage();

  setBusy(true);

  try{

    const res =
      await fetch(
        `${API_BASE}/tenants/${encodeURIComponent(tenantId)}/services`,
        {
          headers:
            authHeaders()
        }
      );

    const data =
      await res.json()
        .catch(()=>({}));

    if(!res.ok){

      throw new Error(
        data?.message ||
        "Failed to load company services"
      );
    }

    if(
      Array.isArray(
        data.serviceCatalog
      ) &&
      data.serviceCatalog.length
    ){
      serviceCatalog =
        data.serviceCatalog;
    }

    savedServices =
      uniqueServices(
        data.allowedServices
      );

    draftServices =
      [...savedServices];

    savedCustomServiceNames =
      normalizeCustomServiceNames(
        data.customServiceNames
      );

    draftCustomServiceNames = {
      ...savedCustomServiceNames
    };

    renderSelectedCompany();

    renderServices();

    updateCounter();

    updateActionButtons();

  }catch(err){

    console.log(err);

    servicesGrid.innerHTML =
      `<div class="empty">
        Failed to load company services.
      </div>`;

    showMessage(
      err.message ||
      "Failed to load company services",
      "error"
    );

  }finally{

    setBusy(false);
  }
}

/* =========================
   RENDER COMPANY
========================= */

function renderSelectedCompany(){

  const tenant =
    getTenant(
      selectedTenantId
    );

  if(!tenant){

    companySummary.classList
      .remove("show");

    return;
  }

  companySummary.classList
    .add("show");

  companyName.textContent =
    tenant.name ||
    "Company";

  companyMeta.textContent =
    [
      tenant.slug
        ? `Slug: ${tenant.slug}`
        : "",
      tenant.subscriptionStatus
        ? `Subscription: ${tenant.subscriptionStatus}`
        : ""
    ]
    .filter(Boolean)
    .join(" • ");

  const enabled =
    tenant.enabled !== false;

  companyStatus.textContent =
    enabled
      ? "ACTIVE"
      : "DISABLED";

  companyStatus.style.background =
    enabled
      ? "#dcfce7"
      : "#fee2e2";

  companyStatus.style.borderColor =
    enabled
      ? "#bbf7d0"
      : "#fecaca";

  companyStatus.style.color =
    enabled
      ? "#166534"
      : "#991b1b";
}

/* =========================
   RENDER SERVICES
========================= */

function renderServices(){

  if(!selectedTenantId){

    servicesGrid.innerHTML =
      `<div class="empty">
        Select a company to manage its services.
      </div>`;

    return;
  }

  if(!serviceCatalog.length){

    servicesGrid.innerHTML =
      `<div class="empty">
        No services found in the platform catalog.
      </div>`;

    return;
  }

  const selectedSet =
    new Set(
      draftServices
    );

  servicesGrid.innerHTML =
    serviceCatalog
      .map(service=>{

        const key =
          normalizeServiceKey(
            service.serviceKey
          );

        const active =
          selectedSet.has(key);

        const title =
          serviceCardTitle(
            service
          );

        const displayCode =
          serviceCardCode(
            service
          );

        const customGate =
          isCustomGate(
            service
          );

        return `
          <div
            class="
              service-card
              ${
                active
                  ? "enabled"
                  : "disabled"
              }
            "
            data-service-key="${key}"
            role="button"
            tabindex="0"
            aria-pressed="${active}"
          >

            <div class="service-top">

              <div class="service-code">
                ${displayCode}
              </div>

              <div
                class="service-toggle"
                aria-hidden="true"
              ></div>

            </div>

            <div class="service-name">
              ${title}
            </div>

            ${
              customGate
                ? `
                  <div
                    class="custom-service-name-wrap"
                    style="margin-top:10px"
                    onclick="event.stopPropagation()"
                  >
                    <input
                      type="text"
                      class="custom-service-name-input"
                      data-custom-service-key="${key}"
                      value="${clean(
                        draftCustomServiceNames[key]
                      ).replace(/"/g,"&quot;")}"
                      placeholder="Enter service name before activation"
                      ${customNameLocked(key) ? "disabled" : ""}
                      style="
                        width:100%;
                        box-sizing:border-box;
                        padding:9px 10px;
                        border:1px solid #cbd5e1;
                        border-radius:8px;
                        font-size:13px;
                        background:${customNameLocked(key) ? "#f1f5f9" : "#fff"};
                      "
                    >
                    <div
                      style="
                        margin-top:5px;
                        font-size:11px;
                        color:${
                          customNameRequiredForGate(key)
                            ? "#b91c1c"
                            : "#64748b"
                        };
                      "
                    >
                      ${
                        customNameLocked(key)
                          ? "Name locked while this service is enabled"
                          : (
                              customNameRequiredForGate(key)
                                ? "Service name is required before activation"
                                : "Slot is OFF — name can be cleared or changed"
                            )
                      }
                    </div>
                  </div>
                `
                : ""
            }

            <div class="service-state">
              ${
                active
                  ? (
                      customGate
                        ? "Custom Slot Enabled For This Company"
                        : "Enabled For This Company"
                    )
                  : (
                      customGate
                        ? "Custom Slot Disabled For This Company"
                        : "Disabled For This Company"
                    )
              }
            </div>

          </div>
        `;
      })
      .join("");

  servicesGrid
    .querySelectorAll(
      ".custom-service-name-input"
    )
    .forEach(input=>{

      input.addEventListener(
        "click",
        event=>{
          event.stopPropagation();
        }
      );

      input.addEventListener(
        "keydown",
        event=>{
          event.stopPropagation();
        }
      );

      input.addEventListener(
        "input",
        event=>{

          const gate =
            normalizeServiceKey(
              event.currentTarget
                .dataset
                .customServiceKey
            );

          if(
            !gate ||
            customNameLocked(gate)
          ){
            return;
          }

          draftCustomServiceNames[gate] =
            event.currentTarget.value;

          updateActionButtons();
        }
      );

      input.addEventListener(
        "blur",
        ()=>{
          renderServices();
        }
      );
    });

  servicesGrid
    .querySelectorAll(
      ".service-card"
    )
    .forEach(card=>{

      card.addEventListener(
        "click",
        ()=>{
          toggleService(
            card.dataset.serviceKey
          );
        }
      );

      card.addEventListener(
        "keydown",
        event=>{

          if(
            event.key === "Enter" ||
            event.key === " "
          ){
            event.preventDefault();

            toggleService(
              card.dataset.serviceKey
            );
          }
        }
      );
    });
}

/* =========================
   TOGGLE SERVICE
========================= */

function toggleService(serviceKey){

  if(
    !selectedTenantId ||
    loading ||
    saving
  ){
    return;
  }

  const key =
    normalizeServiceKey(
      serviceKey
    );

  const exists =
    draftServices.includes(key);

  if(exists){

    draftServices =
      draftServices.filter(
        item =>
          item !== key
      );

  }else{

    if(
      /^CUSTOM_[1-4]$/.test(key) &&
      !clean(
        draftCustomServiceNames[key]
      )
    ){

      showMessage(
        "Enter the Custom Service name before activation.",
        "error"
      );

      const input =
        servicesGrid.querySelector(
          `[data-custom-service-key="${key}"]`
        );

      input?.focus();

      return;
    }

    draftServices =
      uniqueServices([
        ...draftServices,
        key
      ]);
  }

  renderServices();

  updateCounter();

  updateActionButtons();

  clearMessage();
}

/* =========================
   SAVE
========================= */

async function saveServices(){

  if(
    !selectedTenantId ||
    saving ||
    !hasChanges()
  ){
    return;
  }

  const missingGate =
    firstMissingCustomNameGate();

  if(missingGate){

    showMessage(
      "Every enabled Custom Service must have a service name.",
      "error"
    );

    const input =
      servicesGrid.querySelector(
        `[data-custom-service-key="${missingGate}"]`
      );

    input?.focus();

    return;
  }

  saving = true;

  updateActionButtons();

  clearMessage();

  try{

    const res =
      await fetch(
        `${API_BASE}/tenants/${encodeURIComponent(selectedTenantId)}/services`,
        {
          method:"PATCH",

          headers:
            authHeaders(true),

          body:
            JSON.stringify({
              allowedServices:
                uniqueServices(
                  draftServices
                ),

              customServiceNames:
                normalizeCustomServiceNames(
                  draftCustomServiceNames
                )
            })
        }
      );

    const data =
      await res.json()
        .catch(()=>({}));

    if(!res.ok){

      throw new Error(
        data?.message ||
        "Failed to save services"
      );
    }

    savedServices =
      uniqueServices(
        data?.tenant?.allowedServices ||
        draftServices
      );

    draftServices =
      [...savedServices];

    savedCustomServiceNames =
      normalizeCustomServiceNames(
        data?.customServiceNames ||
        draftCustomServiceNames
      );

    draftCustomServiceNames = {
      ...savedCustomServiceNames
    };

    const tenant =
      getTenant(
        selectedTenantId
      );

    if(tenant){
      tenant.allowedServices =
        [...savedServices];
    }

    renderServices();

    updateCounter();

    showMessage(
      "Company services saved successfully.",
      "success"
    );

  }catch(err){

    console.log(err);

    showMessage(
      err.message ||
      "Failed to save services",
      "error"
    );

  }finally{

    saving = false;

    updateActionButtons();
  }
}

/* =========================
   RESET
========================= */

function resetChanges(){

  draftServices =
    [...savedServices];

  draftCustomServiceNames = {
    ...savedCustomServiceNames
  };

  renderServices();

  updateCounter();

  updateActionButtons();

  clearMessage();
}

/* =========================
   REFRESH
========================= */

async function refreshPage(){

  if(loading || saving){
    return;
  }

  const current =
    selectedTenantId;

  clearMessage();

  setBusy(true);

  try{

    await Promise.all([
      loadTenants(),
      loadServiceCatalog()
    ]);

    if(current){

      selectedTenantId =
        current;

      tenantSelect.value =
        current;

      await loadTenantServices(
        current
      );
    }

    showMessage(
      "Platform services refreshed.",
      "info"
    );

  }catch(err){

    console.log(err);

    showMessage(
      err.message ||
      "Refresh failed",
      "error"
    );

  }finally{

    setBusy(false);
  }
}

/* =========================
   EVENTS
========================= */

tenantSelect
  .addEventListener(
    "change",
    async ()=>{

      selectedTenantId =
        tenantSelect.value || "";

      savedServices = [];
      draftServices = [];

      clearMessage();

      if(!selectedTenantId){

        companySummary.classList
          .remove("show");

        servicesGrid.innerHTML =
          `<div class="empty">
            Select a company to manage its services.
          </div>`;

        updateCounter();

        updateActionButtons();

        return;
      }

      await loadTenantServices(
        selectedTenantId
      );
    }
  );

saveBtn.addEventListener(
  "click",
  saveServices
);

resetBtn.addEventListener(
  "click",
  resetChanges
);

refreshBtn.addEventListener(
  "click",
  refreshPage
);

/* =========================
   INIT
========================= */

async function init(){

  setBusy(true);

  try{

    await Promise.all([
      loadTenants(),
      loadServiceCatalog()
    ]);

    servicesGrid.innerHTML =
      `<div class="empty">
        Select a company to manage its services.
      </div>`;

  }catch(err){

    console.log(err);

    showMessage(
      err.message ||
      "Failed to load Platform Services",
      "error"
    );

  }finally{

    setBusy(false);

    updateCounter();

    updateActionButtons();
  }
}

init();