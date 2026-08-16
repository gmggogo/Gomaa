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
      .toUpperCase();

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

  return key;
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

  return !sameServices(
    savedServices,
    draftServices
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
          clean(
            service.title ||
            key
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
                ${key}
              </div>

              <div
                class="service-toggle"
                aria-hidden="true"
              ></div>

            </div>

            <div class="service-name">
              ${title}
            </div>

            <div class="service-state">
              ${
                active
                  ? "Enabled For This Company"
                  : "Disabled For This Company"
              }
            </div>

          </div>
        `;
      })
      .join("");

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