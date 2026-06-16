// =========================
// FILE: public/admin/service-management.js
// SERVICE MANAGEMENT
// GET QUOTE + FACILITY + RESERVED
// ADD STOP POLICY READY
// =========================

console.log("SERVICE JS LOADED");

/* =========================
   DOM
========================= */

const servicesGrid =
document.getElementById("servicesGrid");

const companyServicesGrid =
document.getElementById("companyServicesGrid");

const reservedServicesGrid =
document.getElementById("reservedServicesGrid");

/* =========================
   STATE
========================= */

let services = [];

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function upper(v){
  return clean(v).toUpperCase();
}

function num(v){
  return Number(v || 0);
}

function bool(v){
  return v === true || String(v).toLowerCase() === "true";
}

function esc(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function money(v){
  return Number(v || 0);
}

function isSharedService(service){

  if(!service) return false;

  const key =
    upper(service.serviceKey);

  const title =
    upper(service.title || service.name);

  const pricing =
    upper(service.pricingMode);

  const companyPricing =
    upper(service.companyPricingMode);

  const reservedPricing =
    upper(service.reservedPricingMode);

  const suffix =
    upper(service.companySuffix || service.suffix);

  return (
    service.companyShared === true ||
    service.shared === true ||
    key === "SHARED" ||
    key === "SH" ||
    title === "SHARED" ||
    suffix === "SH" ||
    pricing === "SHARED" ||
    companyPricing === "SHARED" ||
    reservedPricing === "SHARED"
  );
}

function statusClass(active){
  return active ? "status-on" : "status-off";
}

function addStopClass(active){
  return active ? "addstop-on" : "addstop-off";
}

function optionSelected(a,b){
  return String(a || "").toUpperCase() === String(b || "").toUpperCase()
    ? "selected"
    : "";
}

function enabledText(v){
  return v ? "ACTIVE" : "DISABLED";
}

function enabledStatusText(v,target){
  if(v){
    return target + " Can Use This Service";
  }

  return "This Service Is Disabled";
}

/* =========================
   FIELD BUILDERS
========================= */

function fieldId(section,id,name){

  if(section === "getquote"){
    return `${name}-${id}`;
  }

  if(section === "facility"){
    return `company-${name}-${id}`;
  }

  if(section === "reserved"){
    return `reserved-${name}-${id}`;
  }

  return `${name}-${id}`;
}

function editAttr(section,id){
  return `data-edit-key="${section}-${id}"`;
}

function inputField({
  section,
  service,
  name,
  label,
  value,
  type="number",
  min=null,
  step=null
}){

  const id =
    fieldId(section,service._id,name);

  return `
    <div class="field">
      <label>${label}</label>

      <input
        type="${type}"
        id="${id}"
        value="${esc(value)}"
        ${min !== null ? `min="${min}"` : ""}
        ${step !== null ? `step="${step}"` : ""}
        disabled
        ${editAttr(section,service._id)}
      >
    </div>
  `;
}

function selectField({
  section,
  service,
  name,
  label,
  value,
  options,
  visual=false
}){

  const id =
    fieldId(section,service._id,name);

  const selectedValue =
    String(value);

  let visualClass = "";

  if(visual){
    visualClass =
      bool(value)
        ? "status-on"
        : "status-off";
  }

  return `
    <div class="field">
      <label>${label}</label>

      <select
        id="${id}"
        class="${visualClass}"
        data-visual="${visual ? "status" : ""}"
        disabled
        ${editAttr(section,service._id)}
        onchange="updateVisualSelect(this)"
      >
        ${
          options.map(opt=>`
            <option
              value="${esc(opt.value)}"
              ${
                String(opt.value) === selectedValue
                ? "selected"
                : ""
              }
            >
              ${esc(opt.label)}
            </option>
          `).join("")
        }
      </select>
    </div>
  `;
}

function onOffSelect({
  section,
  service,
  name,
  label,
  value,
  enabledLabel="ENABLED",
  disabledLabel="DISABLED",
  addStopVisual=false
}){

  const id =
    fieldId(section,service._id,name);

  const active =
    bool(value);

  const cls =
    addStopVisual
      ? addStopClass(active)
      : statusClass(active);

  return `
    <div class="field">
      <label>${label}</label>

      <select
        id="${id}"
        class="${cls}"
        data-visual="${addStopVisual ? "addstop" : "status"}"
        disabled
        ${editAttr(section,service._id)}
        onchange="updateVisualSelect(this)"
      >
        <option value="true" ${active ? "selected" : ""}>
          ${enabledLabel}
        </option>

        <option value="false" ${!active ? "selected" : ""}>
          ${disabledLabel}
        </option>
      </select>
    </div>
  `;
}

function pricingModeSelect(section,service,value){
  return selectField({
    section,
    service,
    name:"mode",
    label:"Pricing Mode",
    value:upper(value || "MILE"),
    options:[
      {value:"MILE",label:"Per Mile"},
      {value:"HOURLY",label:"Hourly"},
      {value:"SHARED",label:"Shared"}
    ]
  });
}

function hourlyModeSelect(section,service,value){
  return selectField({
    section,
    service,
    name:"hourmode",
    label:"Hourly Billing",
    value:upper(value || "FULL"),
    options:[
      {value:"FULL",label:"Full Hour"},
      {value:"QUARTER",label:"Quarter Hour"}
    ]
  });
}

function disableCancelSelect(section,service,value){

  /*
    هنا القيمة المخزنة اسمها disableCancel
    true معناها Disabled
    false معناها Enabled
    عشان كده بنقلب اللون:
    Enabled = أخضر
    Disabled = أحمر
  */

  const id =
    fieldId(section,service._id,"disablecancel");

  const disabled =
    bool(value);

  const cls =
    disabled
      ? "status-off"
      : "status-on";

  return `
    <div class="field">
      <label>Warning & Cancel Fee Status</label>

      <select
        id="${id}"
        class="${cls}"
        data-visual="reverse-status"
        disabled
        ${editAttr(section,service._id)}
        onchange="updateVisualSelect(this)"
      >
        <option value="false" ${!disabled ? "selected" : ""}>
          ENABLED
        </option>

        <option value="true" ${disabled ? "selected" : ""}>
          DISABLED
        </option>
      </select>
    </div>
  `;
}

/* =========================
   ADD STOP BLOCK
========================= */

function addStopBlock(section,service){

  const shared =
    isSharedService(service);

  if(shared){
    return `
      <div class="add-stop-title">
        <div>Add Stop</div>
        <span>Locked For Shared</span>
      </div>

      <div class="shared-lock">
        Add Stop is disabled for Shared service permanently.
        Shared trips cannot receive added stops because the route belongs
        to multiple passengers.
      </div>
    `;
  }

  let enabledField = "";
  let customField = "";
  let minutesField = "";

  if(section === "getquote"){
    enabledField = "getQuoteAddStopEnabled";
    customField = "getQuoteAddStopCustomTimeEnabled";
    minutesField = "getQuoteAddStopCutoffMinutes";
  }

  if(section === "facility"){
    enabledField = "companyAddStopEnabled";
    customField = "companyAddStopCustomTimeEnabled";
    minutesField = "companyAddStopCutoffMinutes";
  }

  if(section === "reserved"){
    enabledField = "reservedAddStopEnabled";
    customField = "reservedAddStopCustomTimeEnabled";
    minutesField = "reservedAddStopCutoffMinutes";
  }

  return `
    <div class="add-stop-title">
      <div>Add Stop Policy</div>
      <span>Enabled / Disabled + Custom Cutoff</span>
    </div>

    ${
      onOffSelect({
        section,
        service,
        name:"addstop",
        label:"Add Stop",
        value:service[enabledField] === true,
        enabledLabel:"ENABLED",
        disabledLabel:"DISABLED",
        addStopVisual:true
      })
    }

    ${
      onOffSelect({
        section,
        service,
        name:"addstopcustom",
        label:"Custom Time",
        value:service[customField] === true,
        enabledLabel:"ENABLED",
        disabledLabel:"DISABLED",
        addStopVisual:true
      })
    }

    ${
      inputField({
        section,
        service,
        name:"addstopminutes",
        label:"Cutoff Minutes",
        value:Number(service[minutesField] || 0),
        type:"number",
        min:0,
        step:1
      })
    }

    <div class="add-stop-note">
      If Add Stop is disabled, the button will not appear.
      If Custom Time is disabled, Add Stop can stay available until dropoff.
      If Custom Time is enabled and minutes = 0, the button stays available
      until the trip start time.
      If minutes = 15 and trip time is 9:00, the button hides at 8:45.
    </div>
  `;
}

/* =========================
   PRICING BLOCKS
========================= */

function getQuoteFields(service){

  return `
    ${pricingModeSelect("getquote",service,service.pricingMode)}

    ${inputField({
      section:"getquote",
      service,
      name:"base",
      label:"Base Fare",
      value:service.baseFare || 0
    })}

    ${inputField({
      section:"getquote",
      service,
      name:"included",
      label:"Included Miles",
      value:service.includedMiles || 0
    })}

    ${inputField({
      section:"getquote",
      service,
      name:"mile",
      label:"Per Mile",
      value:service.perMile || 0
    })}

    ${inputField({
      section:"getquote",
      service,
      name:"hour",
      label:"Hourly Rate",
      value:service.hourlyRate || 0
    })}

    ${hourlyModeSelect("getquote",service,service.hourlyBillingMode)}

    ${inputField({
      section:"getquote",
      service,
      name:"stop",
      label:"Stop Fee",
      value:service.stopFee || 0
    })}

    ${inputField({
      section:"getquote",
      service,
      name:"noshow",
      label:"No Show Fee",
      value:service.noShowFee || 0
    })}

    ${inputField({
      section:"getquote",
      service,
      name:"shared",
      label:"Shared Price",
      value:service.sharedPrice || 0
    })}

    <div class="policy-title">Warning Policy</div>

    ${disableCancelSelect("getquote",service,service.disableCancel)}

    ${inputField({
      section:"getquote",
      service,
      name:"minutes",
      label:"Warning Minutes",
      value:service.warningMinutes || 0
    })}

    ${inputField({
      section:"getquote",
      service,
      name:"cancel",
      label:"Cancel Fee",
      value:service.cancelFee || 0
    })}

    ${
      selectField({
        section:"getquote",
        service,
        name:"pricingcard",
        label:"Show Top Pricing Card",
        value:String(service.showPricingCard !== false),
        options:[
          {value:"true",label:"ON"},
          {value:"false",label:"OFF"}
        ],
        visual:false
      })
    }

    ${addStopBlock("getquote",service)}
  `;
}

function facilityFields(service){

  return `
    ${inputField({
      section:"facility",
      service,
      name:"suffix",
      label:"Service Suffix",
      value:service.companySuffix || service.suffix || "ST",
      type:"text"
    })}

    ${
      selectField({
        section:"facility",
        service,
        name:"shared",
        label:"Shared Service",
        value:String(service.companyShared === true),
        options:[
          {value:"false",label:"No"},
          {value:"true",label:"Yes"}
        ],
        visual:false
      })
    }

    ${pricingModeSelect(
      "facility",
      service,
      service.companyPricingMode || service.pricingMode
    )}

    ${inputField({
      section:"facility",
      service,
      name:"base",
      label:"Base Fare",
      value:service.companyBaseFare ?? service.baseFare ?? 0
    })}

    ${inputField({
      section:"facility",
      service,
      name:"included",
      label:"Included Miles",
      value:service.companyIncludedMiles ?? service.includedMiles ?? 0
    })}

    ${inputField({
      section:"facility",
      service,
      name:"mile",
      label:"Per Mile",
      value:service.companyPerMile ?? service.perMile ?? 0
    })}

    ${inputField({
      section:"facility",
      service,
      name:"hour",
      label:"Hourly Rate",
      value:service.companyHourlyRate ?? service.hourlyRate ?? 0
    })}

    ${hourlyModeSelect(
      "facility",
      service,
      service.companyHourlyBillingMode || service.hourlyBillingMode
    )}

    ${inputField({
      section:"facility",
      service,
      name:"stop",
      label:"Stop Fee",
      value:service.companyStopFee ?? service.stopFee ?? 0
    })}

    ${inputField({
      section:"facility",
      service,
      name:"noshow",
      label:"No Show Fee",
      value:service.companyNoShowFee ?? service.noShowFee ?? 0
    })}

    ${inputField({
      section:"facility",
      service,
      name:"sharedprice",
      label:"Shared Price",
      value:service.companySharedPrice ?? service.sharedPrice ?? 0
    })}

    <div class="policy-title">Facility Warning Policy</div>

    ${disableCancelSelect("facility",service,service.companyDisableCancel)}

    ${inputField({
      section:"facility",
      service,
      name:"minutes",
      label:"Warning Minutes",
      value:service.companyWarningMinutes ?? service.warningMinutes ?? 0
    })}

    ${inputField({
      section:"facility",
      service,
      name:"cancel",
      label:"Cancel Fee",
      value:service.companyCancelFee ?? service.cancelFee ?? 0
    })}

    ${addStopBlock("facility",service)}
  `;
}

function reservedFields(service){

  return `
    ${inputField({
      section:"reserved",
      service,
      name:"suffix",
      label:"Reserved Suffix",
      value:service.reservedSuffix || service.companySuffix || service.suffix || "RV",
      type:"text"
    })}

    ${
      selectField({
        section:"reserved",
        service,
        name:"shared",
        label:"Shared Service",
        value:String(service.reservedShared === true),
        options:[
          {value:"false",label:"No"},
          {value:"true",label:"Yes"}
        ],
        visual:false
      })
    }

    ${pricingModeSelect(
      "reserved",
      service,
      service.reservedPricingMode ||
      service.companyPricingMode ||
      service.pricingMode
    )}

    ${inputField({
      section:"reserved",
      service,
      name:"base",
      label:"Base Fare",
      value:service.reservedBaseFare ?? service.companyBaseFare ?? service.baseFare ?? 0
    })}

    ${inputField({
      section:"reserved",
      service,
      name:"included",
      label:"Included Miles",
      value:service.reservedIncludedMiles ?? service.companyIncludedMiles ?? service.includedMiles ?? 0
    })}

    ${inputField({
      section:"reserved",
      service,
      name:"mile",
      label:"Per Mile",
      value:service.reservedPerMile ?? service.companyPerMile ?? service.perMile ?? 0
    })}

    ${inputField({
      section:"reserved",
      service,
      name:"hour",
      label:"Hourly Rate",
      value:service.reservedHourlyRate ?? service.companyHourlyRate ?? service.hourlyRate ?? 0
    })}

    ${hourlyModeSelect(
      "reserved",
      service,
      service.reservedHourlyBillingMode ||
      service.companyHourlyBillingMode ||
      service.hourlyBillingMode
    )}

    ${inputField({
      section:"reserved",
      service,
      name:"stop",
      label:"Stop Fee",
      value:service.reservedStopFee ?? service.companyStopFee ?? service.stopFee ?? 0
    })}

    ${inputField({
      section:"reserved",
      service,
      name:"noshow",
      label:"No Show Fee",
      value:service.reservedNoShowFee ?? service.companyNoShowFee ?? service.noShowFee ?? 0
    })}

    ${inputField({
      section:"reserved",
      service,
      name:"sharedprice",
      label:"Shared Price",
      value:service.reservedSharedPrice ?? service.companySharedPrice ?? service.sharedPrice ?? 0
    })}

    <div class="policy-title">Reserved Warning Policy</div>

    ${disableCancelSelect("reserved",service,service.reservedDisableCancel)}

    ${inputField({
      section:"reserved",
      service,
      name:"minutes",
      label:"Warning Minutes",
      value:service.reservedWarningMinutes ?? service.companyWarningMinutes ?? service.warningMinutes ?? 0
    })}

    ${inputField({
      section:"reserved",
      service,
      name:"cancel",
      label:"Cancel Fee",
      value:service.reservedCancelFee ?? service.companyCancelFee ?? service.cancelFee ?? 0
    })}

    ${addStopBlock("reserved",service)}
  `;
}

/* =========================
   CARD RENDER
========================= */

function getSectionInfo(section,service){

  if(section === "getquote"){
    return {
      title:"Get Quote",
      target:"Customers",
      enabled:service.enabled === true,
      cardClass:"getquote-card",
      visibleText:service.enabled === true
        ? "Visible To Customers"
        : "Hidden From Customers"
    };
  }

  if(section === "facility"){
    return {
      title:"Facility",
      target:"Facilities",
      enabled:service.companyEnabled === true,
      cardClass:"facility-card",
      visibleText:service.companyEnabled === true
        ? "Visible To Facilities"
        : "Hidden From Facilities"
    };
  }

  if(section === "reserved"){
    return {
      title:"Reserved",
      target:"Reserved Trips",
      enabled:service.reservedEnabled === true,
      cardClass:"reserved-card",
      visibleText:service.reservedEnabled === true
        ? "Visible To Reserved Trips"
        : "Hidden From Reserved Trips"
    };
  }

  return {
    title:"",
    target:"Services",
    enabled:false,
    cardClass:"",
    visibleText:""
  };
}

function renderCard(section,service){

  const info =
    getSectionInfo(section,service);

  let fields = "";

  if(section === "getquote"){
    fields = getQuoteFields(service);
  }

  if(section === "facility"){
    fields = facilityFields(service);
  }

  if(section === "reserved"){
    fields = reservedFields(service);
  }

  const card =
    document.createElement("div");

  card.className =
    `service-card ${info.cardClass}`;

  card.innerHTML = `

    <div class="service-top">

      <div class="service-info">

        <div class="service-icon">
          ${service.icon || "🚘"}
        </div>

        <div>

          <div class="service-name">
            ${esc(service.title || service.name || "")}
          </div>

          <div class="service-status">
            ${info.title} • ${info.visibleText}
          </div>

        </div>

      </div>

      <button
        class="
          toggle-btn
          ${
            info.enabled
            ? "toggle-on"
            : "toggle-off"
          }
        "
        onclick="toggleSectionService('${section}','${service._id}')"
      >
        ${
          info.enabled
          ? "ACTIVE"
          : "DISABLED"
        }
      </button>

    </div>

    <div class="
      warning-box
      ${
        info.enabled
        ? "warning-green"
        : "warning-red"
      }
    ">
      ${
        info.enabled
        ? enabledStatusText(true,info.target)
        : enabledStatusText(false,info.target)
      }
    </div>

    <div class="fields">
      ${fields}
    </div>

    <div class="buttons">

      <button
        class="edit-btn"
        onclick="enableSectionEdit('${section}','${service._id}')"
      >
        EDIT
      </button>

      <button
        class="save-btn"
        onclick="saveSectionService('${section}','${service._id}')"
      >
        SAVE
      </button>

    </div>
  `;

  return card;
}

/* =========================
   RENDER ALL
========================= */

function renderServices(){

  if(servicesGrid){
    servicesGrid.innerHTML = "";

    services.forEach(service=>{
      servicesGrid.appendChild(
        renderCard("getquote",service)
      );
    });
  }

  if(companyServicesGrid){
    companyServicesGrid.innerHTML = "";

    services.forEach(service=>{
      companyServicesGrid.appendChild(
        renderCard("facility",service)
      );
    });
  }

  if(reservedServicesGrid){
    reservedServicesGrid.innerHTML = "";

    services.forEach(service=>{
      reservedServicesGrid.appendChild(
        renderCard("reserved",service)
      );
    });
  }
}

/* =========================
   LOAD
========================= */

async function loadServices(){

  try{

    const res =
      await fetch("/api/services/admin");

    services =
      await res.json();

    if(!Array.isArray(services)){
      services = [];
    }

    renderServices();

  }catch(err){

    console.log(err);
    alert("Failed To Load Services");

  }

}

/* =========================
   ENABLE EDIT
========================= */

function enableSectionEdit(section,id){

  const fields =
    document.querySelectorAll(
      `[data-edit-key="${section}-${id}"]`
    );

  fields.forEach(el=>{

    el.disabled = false;

    if(
      el.dataset.visual === "status" ||
      el.dataset.visual === "reverse-status" ||
      el.dataset.visual === "addstop"
    ){
      updateVisualSelect(el);
      return;
    }

    el.style.background = "#fff";
    el.style.border = "2px solid #145cff";

  });
}

/* =========================
   VISUAL SELECT
========================= */

function updateVisualSelect(el){

  if(!el) return;

  const visual =
    el.dataset.visual || "";

  el.classList.remove(
    "status-on",
    "status-off",
    "addstop-on",
    "addstop-off"
  );

  if(visual === "status"){
    if(el.value === "true"){
      el.classList.add("status-on");
    }else{
      el.classList.add("status-off");
    }
  }

  if(visual === "reverse-status"){
    if(el.value === "false"){
      el.classList.add("status-on");
    }else{
      el.classList.add("status-off");
    }
  }

  if(visual === "addstop"){
    if(el.value === "true"){
      el.classList.add("addstop-on");
    }else{
      el.classList.add("addstop-off");
    }
  }
}

/* =========================
   READ PAYLOAD
========================= */

function getValue(section,id,name){
  const el =
    document.getElementById(
      fieldId(section,id,name)
    );

  return el ? el.value : "";
}

function getNumberValue(section,id,name){
  return Number(getValue(section,id,name) || 0);
}

function forceNoAddStopForShared(payload,service){

  if(!isSharedService(service)){
    return payload;
  }

  payload.getQuoteAddStopEnabled = false;
  payload.getQuoteAddStopCustomTimeEnabled = false;
  payload.getQuoteAddStopCutoffMinutes = 0;

  payload.companyAddStopEnabled = false;
  payload.companyAddStopCustomTimeEnabled = false;
  payload.companyAddStopCutoffMinutes = 0;

  payload.reservedAddStopEnabled = false;
  payload.reservedAddStopCustomTimeEnabled = false;
  payload.reservedAddStopCutoffMinutes = 0;

  return payload;
}

function buildGetQuotePayload(id){

  const service =
    services.find(s => String(s._id) === String(id));

  const payload = {

    pricingMode:
      getValue("getquote",id,"mode"),

    baseFare:
      getNumberValue("getquote",id,"base"),

    includedMiles:
      getNumberValue("getquote",id,"included"),

    perMile:
      getNumberValue("getquote",id,"mile"),

    hourlyRate:
      getNumberValue("getquote",id,"hour"),

    hourlyBillingMode:
      getValue("getquote",id,"hourmode"),

    stopFee:
      getNumberValue("getquote",id,"stop"),

    noShowFee:
      getNumberValue("getquote",id,"noshow"),

    sharedPrice:
      getNumberValue("getquote",id,"shared"),

    warningMinutes:
      getNumberValue("getquote",id,"minutes"),

    cancelFee:
      getNumberValue("getquote",id,"cancel"),

    disableCancel:
      getValue("getquote",id,"disablecancel") === "true",

    showPricingCard:
      getValue("getquote",id,"pricingcard") === "true",

    getQuoteAddStopEnabled:
      getValue("getquote",id,"addstop") === "true",

    getQuoteAddStopCustomTimeEnabled:
      getValue("getquote",id,"addstopcustom") === "true",

    getQuoteAddStopCutoffMinutes:
      getNumberValue("getquote",id,"addstopminutes")
  };

  return forceNoAddStopForShared(
    payload,
    service
  );
}

function buildFacilityPayload(id){

  const service =
    services.find(s => String(s._id) === String(id));

  const payload = {

    companySuffix:
      getValue("facility",id,"suffix"),

    companyShared:
      getValue("facility",id,"shared") === "true",

    companyPricingMode:
      getValue("facility",id,"mode"),

    companyBaseFare:
      getNumberValue("facility",id,"base"),

    companyIncludedMiles:
      getNumberValue("facility",id,"included"),

    companyPerMile:
      getNumberValue("facility",id,"mile"),

    companyHourlyRate:
      getNumberValue("facility",id,"hour"),

    companyHourlyBillingMode:
      getValue("facility",id,"hourmode"),

    companyStopFee:
      getNumberValue("facility",id,"stop"),

    companyNoShowFee:
      getNumberValue("facility",id,"noshow"),

    companySharedPrice:
      getNumberValue("facility",id,"sharedprice"),

    companyWarningMinutes:
      getNumberValue("facility",id,"minutes"),

    companyCancelFee:
      getNumberValue("facility",id,"cancel"),

    companyDisableCancel:
      getValue("facility",id,"disablecancel") === "true",

    companyAddStopEnabled:
      getValue("facility",id,"addstop") === "true",

    companyAddStopCustomTimeEnabled:
      getValue("facility",id,"addstopcustom") === "true",

    companyAddStopCutoffMinutes:
      getNumberValue("facility",id,"addstopminutes")
  };

  return forceNoAddStopForShared(
    payload,
    {
      ...service,
      companyShared:payload.companyShared,
      companyPricingMode:payload.companyPricingMode,
      companySuffix:payload.companySuffix
    }
  );
}

function buildReservedPayload(id){

  const service =
    services.find(s => String(s._id) === String(id));

  const payload = {

    reservedSuffix:
      getValue("reserved",id,"suffix"),

    reservedShared:
      getValue("reserved",id,"shared") === "true",

    reservedPricingMode:
      getValue("reserved",id,"mode"),

    reservedBaseFare:
      getNumberValue("reserved",id,"base"),

    reservedIncludedMiles:
      getNumberValue("reserved",id,"included"),

    reservedPerMile:
      getNumberValue("reserved",id,"mile"),

    reservedHourlyRate:
      getNumberValue("reserved",id,"hour"),

    reservedHourlyBillingMode:
      getValue("reserved",id,"hourmode"),

    reservedStopFee:
      getNumberValue("reserved",id,"stop"),

    reservedNoShowFee:
      getNumberValue("reserved",id,"noshow"),

    reservedSharedPrice:
      getNumberValue("reserved",id,"sharedprice"),

    reservedWarningMinutes:
      getNumberValue("reserved",id,"minutes"),

    reservedCancelFee:
      getNumberValue("reserved",id,"cancel"),

    reservedDisableCancel:
      getValue("reserved",id,"disablecancel") === "true",

    reservedAddStopEnabled:
      getValue("reserved",id,"addstop") === "true",

    reservedAddStopCustomTimeEnabled:
      getValue("reserved",id,"addstopcustom") === "true",

    reservedAddStopCutoffMinutes:
      getNumberValue("reserved",id,"addstopminutes")
  };

  return forceNoAddStopForShared(
    payload,
    {
      ...service,
      reservedShared:payload.reservedShared,
      reservedPricingMode:payload.reservedPricingMode,
      reservedSuffix:payload.reservedSuffix
    }
  );
}

/* =========================
   SAVE
========================= */

async function saveSectionService(section,id){

  try{

    let url = "";
    let payload = {};

    if(section === "getquote"){
      url = `/api/services/${id}`;
      payload = buildGetQuotePayload(id);
    }

    if(section === "facility"){
      url = `/api/services/${id}`;
      payload = buildFacilityPayload(id);
    }

    if(section === "reserved"){
      url = `/api/services/${id}`;
      payload = buildReservedPayload(id);
    }

    if(!url){
      alert("Invalid section");
      return;
    }

    const res =
      await fetch(
        url,
        {
          method:"PUT",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify(payload)
        }
      );

    const data =
      await res.json().catch(()=>({}));

    if(!res.ok || data.success === false){
      alert(data.message || "Save Failed");
      return;
    }

    alert("Service Saved");

    await loadServices();

  }catch(err){

    console.log(err);
    alert("Save Failed");

  }
}

/* =========================
   TOGGLE
========================= */

async function toggleSectionService(section,id){

  try{

    const service =
      services.find(
        s => String(s._id) === String(id)
      );

    if(!service) return;

    let payload = {};

    if(section === "getquote"){
      payload = {
        enabled:!service.enabled
      };
    }

    if(section === "facility"){
      payload = {
        companyEnabled:!service.companyEnabled
      };
    }

    if(section === "reserved"){
      payload = {
        reservedEnabled:!service.reservedEnabled
      };
    }

    const res =
      await fetch(
        `/api/services/${id}`,
        {
          method:"PUT",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify(payload)
        }
      );

    const data =
      await res.json().catch(()=>({}));

    if(!res.ok || data.success === false){
      alert(data.message || "Toggle Failed");
      return;
    }

    await loadServices();

  }catch(err){

    console.log(err);
    alert("Toggle Failed");

  }
}

/* =========================
   GLOBAL EXPORTS
========================= */

Object.assign(window,{
  enableSectionEdit,
  saveSectionService,
  toggleSectionService,
  updateVisualSelect
});

/* =========================
   START
========================= */

loadServices();