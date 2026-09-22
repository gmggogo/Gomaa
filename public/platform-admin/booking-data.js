"use strict";

const token =
  sessionStorage.getItem("staffToken") ||
  localStorage.getItem("token") ||
  "";

const role =
  sessionStorage.getItem("staffRole") ||
  localStorage.getItem("role") ||
  "";

if(
  !token ||
  role !== "PLATFORM_ADMIN"
){
  window.location.replace(
    "/login.html"
  );
}

const API =
  "/api/platform-admin";

const tenantSelect =
  document.getElementById("tenantSelect");

const tenantSummary =
  document.getElementById("tenantSummary");

const matrixCard =
  document.getElementById("matrixCard");

const matrixBody =
  document.getElementById("matrixBody");

const matrixRows =
  document.getElementById("matrixRows");

const refreshBtn =
  document.getElementById("refreshBtn");

const editBtn =
  document.getElementById("editBtn");

const resetBtn =
  document.getElementById("resetBtn");

const message =
  document.getElementById("message");

const FIELD_TYPES = [
  ["TEXT","Text"],
  ["NUMBER","Number"],
  ["YES_NO","Yes / No"],
  ["DROPDOWN","Dropdown"],
  ["DATE","Date"],
  ["TIME","Time"],
  ["PHONE","Phone"],
  ["EMAIL","Email"],
  ["LONG_TEXT","Long Text"]
];

let tenants = [];
let tenantId = "";
let coreFields = [];
let standardCatalog = [];

let savedConfig = {
  standardFields:[],
  customFields:[]
};

let draftConfig = {
  standardFields:[],
  customFields:[]
};

let editMode = false;
let loading = false;
let saving = false;

const collapsed = {
  core:false,
  standard:false,
  custom:false
};

function clean(value){
  return String(
    value ?? ""
  ).trim();
}

function esc(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function clone(value){
  return JSON.parse(
    JSON.stringify(value)
  );
}

function authHeaders(json=false){
  const headers = {
    Authorization:`Bearer ${token}`
  };

  if(json){
    headers["Content-Type"] =
      "application/json";
  }

  return headers;
}

function defaultMatrix(){
  return {
    getQuote:{
      showField:false,
      required:false
    },
    facility:{
      showField:false,
      showColumn:false,
      showEye:false,
      required:false
    },
    reserved:{
      showField:false,
      showColumn:false,
      showEye:false,
      required:false
    },
    broker:{
      showColumn:false,
      showEye:false
    }
  };
}

function normalizeMatrix(raw){
  const matrix =
    defaultMatrix();

  matrix.getQuote.showField =
    raw?.getQuote?.showField === true;

  matrix.getQuote.required =
    matrix.getQuote.showField &&
    raw?.getQuote?.required === true;

  matrix.facility.showField =
    raw?.facility?.showField === true;

  matrix.facility.showColumn =
    raw?.facility?.showColumn === true;

  matrix.facility.showEye =
    raw?.facility?.showEye === true;

  if(
    matrix.facility.showField &&
    matrix.facility.showEye
  ){
    matrix.facility.showEye = false;
  }

  matrix.facility.required =
    matrix.facility.showField &&
    raw?.facility?.required === true;

  matrix.reserved.showField =
    raw?.reserved?.showField === true;

  matrix.reserved.showColumn =
    raw?.reserved?.showColumn === true;

  matrix.reserved.showEye =
    raw?.reserved?.showEye === true;

  if(
    matrix.reserved.showField &&
    matrix.reserved.showEye
  ){
    matrix.reserved.showEye = false;
  }

  matrix.reserved.required =
    matrix.reserved.showField &&
    raw?.reserved?.required === true;

  matrix.broker.showColumn =
    raw?.broker?.showColumn === true;

  matrix.broker.showEye =
    raw?.broker?.showEye === true;

  if(
    matrix.broker.showColumn &&
    matrix.broker.showEye
  ){
    matrix.broker.showEye = false;
  }

  return matrix;
}

function defaultCustomFields(){
  return Array.from(
    { length:10 },
    (_,index)=>({
      slot:index + 1,
      label:"",
      fieldType:"TEXT",
      options:[],
      placeholder:"",
      matrix:defaultMatrix()
    })
  );
}

function normalizeConfig(data){

  const standardInput =
    Array.isArray(
      data?.config?.standardFields
    )
      ? data.config.standardFields
      : [];

  const standardMap =
    new Map(
      standardInput.map(item=>[
        clean(item.key),
        item
      ])
    );

  const standardFields =
    standardCatalog.map(field=>({
      key:field.key,
      matrix:
        normalizeMatrix(
          standardMap.get(field.key)
            ?.matrix
        )
    }));

  const customInput =
    Array.isArray(
      data?.config?.customFields
    )
      ? data.config.customFields
      : [];

  const customMap =
    new Map(
      customInput.map(item=>[
        Number(item.slot),
        item
      ])
    );

  const customFields =
    defaultCustomFields()
      .map(field=>{
        const source =
          customMap.get(field.slot) ||
          field;

        return {
          slot:field.slot,
          label:clean(source.label),
          fieldType:
            FIELD_TYPES.some(
              ([key]) =>
                key ===
                clean(source.fieldType)
                  .toUpperCase()
            )
              ? clean(source.fieldType)
                  .toUpperCase()
              : "TEXT",
          options:
            Array.isArray(source.options)
              ? source.options
                  .map(clean)
                  .filter(Boolean)
              : [],
          placeholder:
            clean(source.placeholder),
          matrix:
            normalizeMatrix(
              source.matrix
            )
        };
      });

  return {
    standardFields,
    customFields
  };
}

function hasChanges(){
  return (
    JSON.stringify(savedConfig) !==
    JSON.stringify(draftConfig)
  );
}

function anySelection(matrix){
  return Boolean(
    matrix?.getQuote?.showField ||
    matrix?.facility?.showField ||
    matrix?.facility?.showColumn ||
    matrix?.facility?.showEye ||
    matrix?.reserved?.showField ||
    matrix?.reserved?.showColumn ||
    matrix?.reserved?.showEye ||
    matrix?.broker?.showColumn ||
    matrix?.broker?.showEye
  );
}

function showMessage(
  text,
  type="success"
){
  message.className =
    `message show ${type}`;
  message.textContent =
    text;
}

function clearMessage(){
  message.className =
    "message";
  message.textContent =
    "";
}

function typeOptions(selected){
  return FIELD_TYPES
    .map(([key,label])=>`
      <option
        value="${key}"
        ${key === selected ? "selected" : ""}>
        ${esc(label)}
      </option>
    `)
    .join("");
}

function renderTenants(){

  tenantSelect.innerHTML =
    `<option value="">Select a company...</option>` +
    tenants.map(tenant=>`
      <option value="${esc(tenant._id)}">
        ${esc(tenant.name || tenant.slug || tenant._id)}
      </option>
    `).join("");

  tenantSelect.value =
    tenantId;
}

function renderTenantSummary(){

  const tenant =
    tenants.find(
      item =>
        String(item._id) ===
        String(tenantId)
    );

  if(!tenant){
    tenantSummary.classList
      .remove("show");
    tenantSummary.innerHTML = "";
    return;
  }

  tenantSummary.innerHTML = `
    <strong>${esc(tenant.name || "Company")}</strong>
    <span style="color:#64748b">
      &nbsp; • &nbsp; ${esc(tenant.slug || "")}
    </span>
  `;

  tenantSummary.classList
    .add("show");
}

function fixedCell(source){

  let text =
    "Fixed";

  if(source === "gq"){
    text = "Booking Field";
  }

  if(
    source === "fa" ||
    source === "rv"
  ){
    text = "Fixed Data";
  }

  if(source === "br"){
    text = "Received Data";
  }

  return `
    <td class="source-cell ${source}">
      <div class="fixed-state">
        🔒 ${text}
      </div>
    </td>
  `;
}

function checkboxControl({
  checked,
  label,
  action,
  source,
  fieldKind,
  fieldKey,
  slot,
  disabled=false
}){

  const attrs = [
    `data-action="${esc(action)}"`,
    `data-source="${esc(source)}"`,
    `data-kind="${esc(fieldKind)}"`
  ];

  if(fieldKey){
    attrs.push(
      `data-key="${esc(fieldKey)}"`
    );
  }

  if(slot){
    attrs.push(
      `data-slot="${Number(slot)}"`
    );
  }

  return `
    <label class="control editable-control ${disabled ? "disabled" : ""}">
      <input
        type="checkbox"
        ${checked ? "checked" : ""}
        ${disabled ? "disabled" : ""}
        ${attrs.join(" ")}>
      <span>${esc(label)}</span>
    </label>
  `;
}

function sourceCells(
  item,
  kind
){

  const m =
    item.matrix ||
    defaultMatrix();

  const identity =
    kind === "standard"
      ? {
          fieldKind:"standard",
          fieldKey:item.key
        }
      : {
          fieldKind:"custom",
          slot:item.slot
        };

  const gq = `
    <td class="source-cell gq">
      <div class="control-grid gq-grid">
        ${checkboxControl({
          checked:m.getQuote.showField,
          label:"Field",
          action:"showField",
          source:"getQuote",
          ...identity
        })}

        ${checkboxControl({
          checked:m.getQuote.required,
          label:"Required",
          action:"required",
          source:"getQuote",
          disabled:!m.getQuote.showField,
          ...identity
        })}
      </div>
    </td>
  `;

  const fa = `
    <td class="source-cell fa">
      <div class="control-grid fa-grid">
        ${checkboxControl({
          checked:m.facility.showField,
          label:"Field",
          action:"showField",
          source:"facility",
          ...identity
        })}

        ${checkboxControl({
          checked:m.facility.showColumn,
          label:"Column",
          action:"showColumn",
          source:"facility",
          ...identity
        })}

        ${checkboxControl({
          checked:m.facility.showEye,
          label:"Eye",
          action:"showEye",
          source:"facility",
          ...identity
        })}

        ${checkboxControl({
          checked:m.facility.required,
          label:"Required",
          action:"required",
          source:"facility",
          disabled:!m.facility.showField,
          ...identity
        })}
      </div>
    </td>
  `;

  const rv = `
    <td class="source-cell rv">
      <div class="control-grid rv-grid">
        ${checkboxControl({
          checked:m.reserved.showField,
          label:"Field",
          action:"showField",
          source:"reserved",
          ...identity
        })}

        ${checkboxControl({
          checked:m.reserved.showColumn,
          label:"Column",
          action:"showColumn",
          source:"reserved",
          ...identity
        })}

        ${checkboxControl({
          checked:m.reserved.showEye,
          label:"Eye",
          action:"showEye",
          source:"reserved",
          ...identity
        })}

        ${checkboxControl({
          checked:m.reserved.required,
          label:"Required",
          action:"required",
          source:"reserved",
          disabled:!m.reserved.showField,
          ...identity
        })}
      </div>
    </td>
  `;

  const br = `
    <td class="source-cell br">
      <div class="control-grid br-grid">
        ${checkboxControl({
          checked:m.broker.showColumn,
          label:"Column",
          action:"showColumn",
          source:"broker",
          ...identity
        })}

        ${checkboxControl({
          checked:m.broker.showEye,
          label:"Eye",
          action:"showEye",
          source:"broker",
          ...identity
        })}
      </div>
    </td>
  `;

  return gq + fa + rv + br;
}

function sectionRow(
  name,
  subtitle,
  section,
  icon
){
  return `
    <tr class="section-row">
      <td colspan="5">
        <div class="section-bar">
          <div class="section-title">
            ${icon} ${esc(name)}
            <span>${esc(subtitle)}</span>
          </div>

          <button
            class="section-toggle"
            type="button"
            data-section-toggle="${esc(section)}">
            ${collapsed[section] ? "Open" : "Close"}
          </button>
        </div>
      </td>
    </tr>
  `;
}

function coreRows(){

  if(collapsed.core){
    return "";
  }

  return coreFields
    .map(field=>`
      <tr data-section="core">
        <td class="field-cell">
          <div class="field-name">
            <span class="lock">LOCKED</span>
            ${esc(field.label)}
          </div>
          <div class="field-meta">
            Core field — cannot be renamed, deleted or disabled.
          </div>
        </td>

        ${fixedCell("gq")}
        ${fixedCell("fa")}
        ${fixedCell("rv")}
        ${fixedCell("br")}
      </tr>
    `)
    .join("");
}

function standardRows(){

  if(collapsed.standard){
    return "";
  }

  const byKey =
    new Map(
      draftConfig.standardFields
        .map(item=>[
          item.key,
          item
        ])
    );

  return standardCatalog
    .map(field=>{
      const config =
        byKey.get(field.key) || {
          key:field.key,
          matrix:defaultMatrix()
        };

      return `
        <tr data-section="standard">
          <td class="field-cell">
            <div class="field-name">
              ${esc(field.label)}
            </div>
            <div class="field-meta">
              Built-in optional field • ${esc(field.type || "TEXT")}
            </div>
          </td>

          ${sourceCells(config,"standard")}
        </tr>
      `;
    })
    .join("");
}

function customRows(){

  if(collapsed.custom){
    return "";
  }

  return draftConfig.customFields
    .map(item=>`
      <tr data-section="custom">
        <td class="field-cell">

          <div class="custom-slot">
            CUSTOM ${item.slot}
          </div>

          <div class="custom-editor editable-control">

            <input
              class="custom-name"
              data-custom-prop="label"
              data-slot="${item.slot}"
              value="${esc(item.label)}"
              placeholder="Enter custom field name">

            <select
              class="custom-type"
              data-custom-prop="fieldType"
              data-slot="${item.slot}">
              ${typeOptions(item.fieldType)}
            </select>

            <input
              class="custom-placeholder"
              data-custom-prop="placeholder"
              data-slot="${item.slot}"
              value="${esc(item.placeholder)}"
              placeholder="Placeholder / hint (optional)">

            <input
              class="custom-options"
              data-custom-prop="options"
              data-slot="${item.slot}"
              value="${esc(item.options.join(", "))}"
              placeholder="Dropdown options separated by commas"
              ${
                item.fieldType === "DROPDOWN"
                  ? ""
                  : "disabled"
              }>
          </div>

        </td>

        ${sourceCells(item,"custom")}
      </tr>
    `)
    .join("");
}

function renderMatrix(){

  matrixRows.innerHTML =
    sectionRow(
      "Locked Basic Fields",
      "Always available and never editable",
      "core",
      "🔒"
    ) +
    coreRows() +

    sectionRow(
      "Optional / Additional Fields",
      "Known GH Mobility and broker fields",
      "standard",
      "＋"
    ) +
    standardRows() +

    sectionRow(
      "10 Custom Extra Fields",
      "Name these for anything the company needs",
      "custom",
      "✎"
    ) +
    customRows();

  matrixBody.classList.toggle(
    "readonly-mode",
    !editMode
  );

  editBtn.textContent =
    editMode
      ? "Save"
      : "Edit";

  editBtn.classList.toggle(
    "btn-save",
    editMode
  );

  editBtn.classList.toggle(
    "btn-edit",
    !editMode
  );

  bindMatrixEvents();
  updateButtons();
}

function locateItem(
  kind,
  key,
  slot
){

  if(kind === "standard"){
    return draftConfig.standardFields
      .find(
        item =>
          item.key === key
      );
  }

  return draftConfig.customFields
    .find(
      item =>
        Number(item.slot) ===
        Number(slot)
    );
}

function applyMatrixChange(input){

  if(!editMode){
    return;
  }

  const kind =
    input.dataset.kind;

  const source =
    input.dataset.source;

  const action =
    input.dataset.action;

  const key =
    input.dataset.key;

  const slot =
    input.dataset.slot;

  const item =
    locateItem(
      kind,
      key,
      slot
    );

  if(
    !item ||
    !item.matrix?.[source]
  ){
    return;
  }

  const group =
    item.matrix[source];

  group[action] =
    input.checked === true;

  if(source === "getQuote"){

    if(
      action === "showField" &&
      !group.showField
    ){
      group.required = false;
    }
  }

  if(
    source === "facility" ||
    source === "reserved"
  ){

    if(
      action === "showField" &&
      group.showField
    ){
      group.showEye = false;
    }

    if(
      action === "showEye" &&
      group.showEye
    ){
      group.showField = false;
      group.required = false;
    }

    if(
      action === "showField" &&
      !group.showField
    ){
      group.required = false;
    }
  }

  if(source === "broker"){

    if(
      action === "showColumn" &&
      group.showColumn
    ){
      group.showEye = false;
    }

    if(
      action === "showEye" &&
      group.showEye
    ){
      group.showColumn = false;
    }
  }

  clearMessage();
  renderMatrix();
}

function updateCustomProp(input){

  if(!editMode){
    return;
  }

  const slot =
    Number(input.dataset.slot);

  const prop =
    input.dataset.customProp;

  const item =
    draftConfig.customFields
      .find(
        field =>
          Number(field.slot) ===
          slot
      );

  if(!item){
    return;
  }

  if(prop === "label"){
    item.label =
      input.value;
  }

  if(prop === "fieldType"){

    item.fieldType =
      input.value;

    if(
      item.fieldType !== "DROPDOWN"
    ){
      item.options = [];
    }
  }

  if(prop === "placeholder"){
    item.placeholder =
      input.value;
  }

  if(prop === "options"){
    item.options =
      input.value
        .split(",")
        .map(clean)
        .filter(Boolean);
  }

  clearMessage();

  if(prop === "fieldType"){
    renderMatrix();
  }else{
    updateButtons();
  }
}

function bindMatrixEvents(){

  matrixRows
    .querySelectorAll(
      "input[data-action]"
    )
    .forEach(input=>{
      input.addEventListener(
        "change",
        ()=>applyMatrixChange(input)
      );
    });

  matrixRows
    .querySelectorAll(
      "[data-custom-prop]"
    )
    .forEach(input=>{

      input.addEventListener(
        "change",
        ()=>updateCustomProp(input)
      );

      if(
        input.tagName === "INPUT"
      ){
        input.addEventListener(
          "input",
          ()=>updateCustomProp(input)
        );
      }
    });

  matrixRows
    .querySelectorAll(
      "[data-section-toggle]"
    )
    .forEach(button=>{
      button.addEventListener(
        "click",
        ()=>{
          const section =
            button.dataset.sectionToggle;

          collapsed[section] =
            !collapsed[section];

          renderMatrix();
        }
      );
    });
}

function validateDraft(){

  for(
    const field of
    draftConfig.customFields
  ){

    if(
      !anySelection(field.matrix)
    ){
      continue;
    }

    if(!clean(field.label)){
      return {
        ok:false,
        message:
          `Custom ${field.slot}: enter a field name first.`
      };
    }

    if(
      field.fieldType ===
      "DROPDOWN" &&
      field.options.length < 1
    ){
      return {
        ok:false,
        message:
          `${field.label}: add at least one dropdown option.`
      };
    }
  }

  return {
    ok:true
  };
}

function updateButtons(){

  const changed =
    hasChanges();

  editBtn.disabled =
    !tenantId ||
    loading ||
    saving;

  resetBtn.disabled =
    !tenantId ||
    !editMode ||
    !changed ||
    loading ||
    saving;
}

function setEditMode(value){

  editMode =
    value === true;

  renderMatrix();
}

async function loadTenants(){

  loading = true;
  updateButtons();

  try{

    const response =
      await fetch(
        `${API}/tenants`,
        {
          cache:"no-store",
          headers:authHeaders()
        }
      );

    const data =
      await response
        .json()
        .catch(()=>[]);

    if(!response.ok){
      throw new Error(
        data?.message ||
        "Unable to load companies"
      );
    }

    tenants =
      Array.isArray(data)
        ? data
        : (
            Array.isArray(data?.tenants)
              ? data.tenants
              : []
          );

    renderTenants();

  }catch(err){

    showMessage(
      err.message ||
      "Unable to load companies",
      "error"
    );

  }finally{

    loading = false;
    updateButtons();
  }
}

async function loadConfig(){

  if(!tenantId){
    matrixCard.style.display =
      "none";
    renderTenantSummary();
    return;
  }

  loading = true;
  editMode = false;
  clearMessage();
  updateButtons();

  try{

    const response =
      await fetch(
        `${API}/booking-data/${encodeURIComponent(tenantId)}`,
        {
          cache:"no-store",
          headers:authHeaders()
        }
      );

    const data =
      await response
        .json()
        .catch(()=>({}));

    if(!response.ok){
      throw new Error(
        data?.message ||
        "Unable to load Booking Data"
      );
    }

    coreFields =
      Array.isArray(data.coreFields)
        ? data.coreFields
        : [];

    standardCatalog =
      Array.isArray(data.standardCatalog)
        ? data.standardCatalog
        : [];

    savedConfig =
      normalizeConfig(data);

    draftConfig =
      clone(savedConfig);

    renderTenantSummary();
    renderMatrix();

    matrixCard.style.display =
      "";

  }catch(err){

    matrixCard.style.display =
      "none";

    showMessage(
      err.message ||
      "Unable to load Booking Data",
      "error"
    );

  }finally{

    loading = false;
    updateButtons();
  }
}

async function saveConfig(){

  if(
    !tenantId ||
    !editMode ||
    saving
  ){
    return;
  }

  const validation =
    validateDraft();

  if(!validation.ok){
    showMessage(
      validation.message,
      "error"
    );
    return;
  }

  saving = true;
  updateButtons();
  clearMessage();

  try{

    const response =
      await fetch(
        `${API}/booking-data/${encodeURIComponent(tenantId)}`,
        {
          method:"PUT",
          headers:authHeaders(true),

          body:JSON.stringify({
            standardFields:
              draftConfig.standardFields,

            customFields:
              draftConfig.customFields
          })
        }
      );

    const data =
      await response
        .json()
        .catch(()=>({}));

    if(!response.ok){
      throw new Error(
        data?.message ||
        "Unable to save Booking Data"
      );
    }

    savedConfig =
      normalizeConfig(data);

    draftConfig =
      clone(savedConfig);

    editMode = false;
    renderMatrix();

    showMessage(
      "Booking Data saved successfully.",
      "success"
    );

  }catch(err){

    showMessage(
      err.message ||
      "Unable to save Booking Data",
      "error"
    );

  }finally{

    saving = false;
    updateButtons();
  }
}

tenantSelect.addEventListener(
  "change",
  async ()=>{
    tenantId =
      tenantSelect.value;

    await loadConfig();
  }
);

refreshBtn.addEventListener(
  "click",
  async ()=>{

    const keep =
      tenantId;

    await loadTenants();

    tenantId =
      tenants.some(
        tenant =>
          String(tenant._id) ===
          String(keep)
      )
        ? keep
        : "";

    tenantSelect.value =
      tenantId;

    await loadConfig();
  }
);

editBtn.addEventListener(
  "click",
  async ()=>{

    if(
      !tenantId ||
      loading ||
      saving
    ){
      return;
    }

    /*
      First click:
      Edit -> unlock fields.

      Second click:
      Save -> validate + save + lock fields again.
    */
    if(!editMode){
      clearMessage();
      setEditMode(true);
      return;
    }

    await saveConfig();
  }
);

resetBtn.addEventListener(
  "click",
  ()=>{
    draftConfig =
      clone(savedConfig);

    clearMessage();
    renderMatrix();
  }
);

(async function init(){
  await loadTenants();
})();
