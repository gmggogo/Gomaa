// =========================
// FILE: public/admin/service-management.js
// SERVICE MANAGEMENT
// GET QUOTE + FACILITY + RESERVED
// ADD STOP POLICY READY
// =========================

console.log("SERVICE JS LOADED");

/* =========================
   SECURITY
========================= */

const token = localStorage.getItem("token") || "";
const role  = localStorage.getItem("role") || "";

if(!token || !["SUPER_ADMIN","admin","dispatcher"].includes(role)){
  window.location.href = "/login.html";
}


/* =========================
   DOM
========================= */

const servicesGrid =
document.getElementById("servicesGrid");

const companyServicesGrid =
document.getElementById("companyServicesGrid");

const reservedServicesGrid =
document.getElementById("reservedServicesGrid");

const driverServicesGrid =
document.getElementById("driverServicesGrid");

const bookingHoursServicesGrid =
document.getElementById("bookingHoursServicesGrid");

/* =========================
   STATE
========================= */

let services = [];
let brokerBookingEnabled = false;

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

function isLimousineService(service){

  if(!service) return false;

  const values = [
    service.serviceKey,
    service.key,
    service.code,
    service.serviceCode,
    service.serviceType,
    service.companySuffix,
    service.reservedSuffix,
    service.suffix,
    service.title,
    service.name
  ].map(upper);

  return values.some(v =>
    v === "LM" ||
    v === "LIMO" ||
    v === "LIMOUSINE" ||
    v.includes("LIMOUSINE")
  );
}

function limousineInitialFields(section,service){

  if(!isLimousineService(service)){
    return "";
  }

  let duration = 0;
  let price = 0;

  if(section === "getquote"){
    duration = service.initialDurationMinutes ?? 60;
    price = service.initialPrice ?? 0;
  }

  if(section === "facility"){
    duration = service.companyInitialDurationMinutes ?? service.initialDurationMinutes ?? 60;
    price = service.companyInitialPrice ?? service.initialPrice ?? 0;
  }

  if(section === "reserved"){
    duration = service.reservedInitialDurationMinutes ?? service.companyInitialDurationMinutes ?? service.initialDurationMinutes ?? 60;
    price = service.reservedInitialPrice ?? service.companyInitialPrice ?? service.initialPrice ?? 0;
  }

  return `
    <div class="policy-title">Limousine Initial Time Package</div>

    ${inputField({
      section,
      service,
      name:"initialduration",
      label:"Initial Duration (Minutes)",
      value:Number(duration || 0),
      type:"number",
      min:0,
      step:15
    })}

    ${inputField({
      section,
      service,
      name:"initialprice",
      label:"Initial Price",
      value:Number(price || 0),
      type:"number",
      min:0,
      step:0.01
    })}

    <div class="add-stop-note">
      Limousine only: this price covers the Initial Duration.
      After that duration ends, Hourly Rate starts and Hourly Billing
      decides whether extra time is charged by Full Hour or Quarter Hour.
    </div>
  `;
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

  if(section === "driver"){
    return `driver-${name}-${id}`;
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
  step=null,
  locked=false
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
        ${locked ? `data-locked="true"` : ""}
        ${editAttr(section,service._id)}
        class="${locked ? "locked-service-field" : ""}"
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
   DRIVER WAIT TIMER BLOCK
========================= */

function driverWaitTimerFields(service){

  return `
    <div class="policy-title">
      Driver Wait Timers
    </div>

    ${
      onOffSelect({
        section:"driver",
        service,
        name:"pickupwaitenabled",
        label:"Pickup Wait Timer",
        value:service.driverPickupWaitEnabled !== false,
        enabledLabel:"ENABLED",
        disabledLabel:"DISABLED"
      })
    }

    ${
      inputField({
        section:"driver",
        service,
        name:"pickupwaitminutes",
        label:"Pickup Wait Minutes",
        value:Number(
          service.driverPickupWaitMinutes ?? 10
        ),
        type:"number",
        min:0,
        step:1
      })
    }

    ${
      onOffSelect({
        section:"driver",
        service,
        name:"stopwaitenabled",
        label:"Stop Wait Timer",
        value:service.driverStopWaitEnabled !== false,
        enabledLabel:"ENABLED",
        disabledLabel:"DISABLED"
      })
    }

    ${
      inputField({
        section:"driver",
        service,
        name:"stopwaitminutes",
        label:"Stop Wait Minutes",
        value:Number(
          service.driverStopWaitMinutes ?? 5
        ),
        type:"number",
        min:0,
        step:1
      })
    }

    <div class="add-stop-note">
      Pickup and Stop timers are independent.
      If a timer is disabled, it will not appear in Driver Map.
      If enabled, Driver Map uses the minutes saved for this service.
      Shared passengers at the same pickup use one Pickup timer.
    </div>
  `;
}

function renderDriverTimerCard(service){

  const card =
    document.createElement("div");

  card.className =
    "service-card driver-timer-card";

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
            Driver App • ${esc(service.serviceKey || "")}
          </div>
        </div>

      </div>

    </div>

    <div class="warning-box warning-blue">
      Configure Driver Map waiting behavior for this service.
    </div>

    <div class="fields">
      ${driverWaitTimerFields(service)}
    </div>

    <div class="buttons">

      <button
        class="edit-btn"
        onclick="enableDriverTimerEdit('${service._id}')"
      >
        EDIT
      </button>

      <button
        class="save-btn"
        onclick="saveDriverTimerService('${service._id}')"
      >
        SAVE
      </button>

    </div>
  `;

  return card;
}

function buildDriverTimerPayload(id){

  return {
    driverPickupWaitEnabled:
      getValue(
        "driver",
        id,
        "pickupwaitenabled"
      ) === "true",

    driverPickupWaitMinutes:
      getNumberValue(
        "driver",
        id,
        "pickupwaitminutes"
      ),

    driverStopWaitEnabled:
      getValue(
        "driver",
        id,
        "stopwaitenabled"
      ) === "true",

    driverStopWaitMinutes:
      getNumberValue(
        "driver",
        id,
        "stopwaitminutes"
      )
  };
}

function enableDriverTimerEdit(id){
  enableSectionEdit(
    "driver",
    id
  );
}

async function saveDriverTimerService(id){

  try{

    const payload =
      buildDriverTimerPayload(id);

    const res =
      await fetch(
        `/api/services/${id}`,
        {
          method:"PUT",
          headers:{
            "Content-Type":"application/json",
            Authorization:"Bearer " + token
          },
          body:JSON.stringify(payload)
        }
      );

    const data =
      await res.json().catch(()=>({}));

    if(
      !res.ok ||
      data.success === false
    ){
      alert(
        data.message ||
        "Driver Timer Save Failed"
      );
      return;
    }

    alert("Driver Wait Timers Saved");

    await loadServices();

  }catch(err){

    console.log(err);
    alert("Driver Timer Save Failed");
  }
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

    ${limousineInitialFields("getquote",service)}

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
  type:"text",
  locked:true
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

    ${limousineInitialFields("facility",service)}

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

    ${limousineInitialFields("reserved",service)}

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
   SERVICE BOOKING HOURS
========================= */

const bookingHourSections = [
  { key:"getQuote", label:"Get Quote" },
  { key:"facility", label:"Facility" },
  { key:"reserved", label:"Reserved" },
  { key:"facilityOverride", label:"Facility Override" }
];

function bookingRule(service,key){

  const rule =
    service?.bookingHours?.[key] || {};

  const mode =
    ["24_HOURS","CUSTOM","DISABLED"].includes(
      upper(rule.mode)
    )
      ? upper(rule.mode)
      : "24_HOURS";

  return {
    mode,
    from:clean(rule.from) || "00:00",
    to:clean(rule.to) || "23:59"
  };
}

function bookingFieldId(serviceId,section,name){
  return `booking-${section}-${name}-${serviceId}`;
}

function bookingModeClass(mode){

  if(mode === "CUSTOM"){
    return "booking-mode-custom";
  }

  if(mode === "DISABLED"){
    return "booking-mode-disabled";
  }

  return "booking-mode-24";
}

function bookingHoursRow(service,section){

  const rule =
    bookingRule(service,section.key);

  const modeId =
    bookingFieldId(
      service._id,
      section.key,
      "mode"
    );

  const fromId =
    bookingFieldId(
      service._id,
      section.key,
      "from"
    );

  const toId =
    bookingFieldId(
      service._id,
      section.key,
      "to"
    );

  const custom =
    rule.mode === "CUSTOM";

  return `
    <div class="booking-hours-row">

      <div class="booking-hours-source">
        ${esc(section.label)}
      </div>

      <div class="booking-hours-field">
        <label>Availability</label>
        <select
          id="${modeId}"
          class="${bookingModeClass(rule.mode)}"
          data-booking-edit="${service._id}"
          data-booking-mode="${service._id}-${section.key}"
          disabled
          onchange="updateBookingHoursRow('${service._id}','${section.key}')"
        >
          <option value="24_HOURS" ${rule.mode === "24_HOURS" ? "selected" : ""}>24 Hours</option>
          <option value="CUSTOM" ${rule.mode === "CUSTOM" ? "selected" : ""}>Custom</option>
          <option value="DISABLED" ${rule.mode === "DISABLED" ? "selected" : ""}>Disabled</option>
        </select>
      </div>

      <div class="booking-hours-field">
        <label>From</label>
        <input
          id="${fromId}"
          type="time"
          value="${esc(rule.from)}"
          data-booking-edit="${service._id}"
          data-booking-time="${service._id}-${section.key}"
          disabled
          class="booking-time-locked"
        >
      </div>

      <div class="booking-hours-field">
        <label>To</label>
        <input
          id="${toId}"
          type="time"
          value="${esc(rule.to)}"
          data-booking-edit="${service._id}"
          data-booking-time="${service._id}-${section.key}"
          disabled
          class="booking-time-locked"
        >
      </div>

    </div>
  `;
}

function renderBookingHoursCard(service){

  const card =
    document.createElement("div");

  card.className =
    "service-card booking-hours-card";

  const rows =
    bookingHourSections
      .map(section =>
        bookingHoursRow(
          service,
          section
        )
      )
      .join("");

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
            Booking Hours • ${esc(service.serviceKey || "")}
          </div>
        </div>

      </div>

    </div>

    <div class="warning-box warning-blue">
      Configure when this service can be booked from each booking section.
    </div>

    <div class="booking-hours-list">
      ${rows}
    </div>

    <div class="buttons">
      <button
        class="edit-btn"
        onclick="enableBookingHoursEdit('${service._id}')"
      >
        EDIT
      </button>

      <button
        class="save-btn"
        onclick="saveBookingHours('${service._id}')"
      >
        SAVE
      </button>
    </div>
  `;

  return card;
}

function updateBookingHoursRow(serviceId,sectionKey){

  const modeEl =
    document.getElementById(
      bookingFieldId(
        serviceId,
        sectionKey,
        "mode"
      )
    );

  const fromEl =
    document.getElementById(
      bookingFieldId(
        serviceId,
        sectionKey,
        "from"
      )
    );

  const toEl =
    document.getElementById(
      bookingFieldId(
        serviceId,
        sectionKey,
        "to"
      )
    );

  if(!modeEl || !fromEl || !toEl){
    return;
  }

  modeEl.classList.remove(
    "booking-mode-24",
    "booking-mode-custom",
    "booking-mode-disabled"
  );

  modeEl.classList.add(
    bookingModeClass(modeEl.value)
  );

  const editable =
    modeEl.disabled === false;

  const custom =
    modeEl.value === "CUSTOM";

  fromEl.disabled =
    !(editable && custom);

  toEl.disabled =
    !(editable && custom);

  fromEl.classList.toggle(
    "booking-time-locked",
    fromEl.disabled
  );

  toEl.classList.toggle(
    "booking-time-locked",
    toEl.disabled
  );
}

function enableBookingHoursEdit(serviceId){

  const fields =
    document.querySelectorAll(
      `[data-booking-edit="${serviceId}"]`
    );

  fields.forEach(el=>{
    el.disabled = false;
  });

  bookingHourSections
    .forEach(section =>
      updateBookingHoursRow(
        serviceId,
        section.key
      )
    );
}

function readBookingHoursPayload(serviceId){

  const bookingHours = {};

  bookingHourSections.forEach(section=>{

    const existingService =
      services.find(
        item =>
          String(item._id) ===
          String(serviceId)
      );

    const existing =
      bookingRule(
        existingService,
        section.key
      );

    const modeEl =
      document.getElementById(
        bookingFieldId(
          serviceId,
          section.key,
          "mode"
        )
      );

    const fromEl =
      document.getElementById(
        bookingFieldId(
          serviceId,
          section.key,
          "from"
        )
      );

    const toEl =
      document.getElementById(
        bookingFieldId(
          serviceId,
          section.key,
          "to"
        )
      );

    bookingHours[section.key] = {
      mode:modeEl?.value || existing.mode,
      from:fromEl?.value || existing.from,
      to:toEl?.value || existing.to
    };
  });

  return {
    bookingHours
  };
}

async function saveBookingHours(serviceId){

  try{

    const payload =
      readBookingHoursPayload(serviceId);

    const res =
      await fetch(
        `/api/services/${serviceId}`,
        {
          method:"PUT",
          headers:{
            "Content-Type":"application/json",
            Authorization:"Bearer " + token
          },
          body:JSON.stringify(payload)
        }
      );

    const data =
      await res.json().catch(()=>({}));

    if(!res.ok || data.success === false){
      alert(data.message || "Booking Hours Save Failed");
      return;
    }

    const savedService =
      data?.service && typeof data.service === "object"
        ? data.service
        : null;

    if(!savedService || !savedService.bookingHours){
      alert("Booking Hours Save Failed: server did not return saved booking hours");
      return;
    }

    /*
      Verify the exact values returned by MongoDB before changing the UI.
      Never silently replace the user's selected time with defaults.
    */
    for(const section of bookingHourSections){
      const sent = payload.bookingHours?.[section.key] || {};
      const stored = bookingRule(savedService,section.key);

      if(
        upper(sent.mode) !== stored.mode ||
        clean(sent.from) !== stored.from ||
        clean(sent.to) !== stored.to
      ){
        alert("Booking Hours Save Failed: saved values do not match the selected values");
        return;
      }
    }

    const index = services.findIndex(
      item => String(item._id) === String(serviceId)
    );

    if(index >= 0){
      services[index] = savedService;
    }

    /* Lock the existing controls without rebuilding the card. */
    bookingHourSections.forEach(section=>{
      const modeEl = document.getElementById(
        bookingFieldId(serviceId,section.key,"mode")
      );
      const fromEl = document.getElementById(
        bookingFieldId(serviceId,section.key,"from")
      );
      const toEl = document.getElementById(
        bookingFieldId(serviceId,section.key,"to")
      );

      if(modeEl) modeEl.disabled = true;
      if(fromEl){
        fromEl.disabled = true;
        fromEl.classList.add("booking-time-locked");
      }
      if(toEl){
        toEl.disabled = true;
        toEl.classList.add("booking-time-locked");
      }
    });

    alert("Booking Hours Saved");

  }catch(err){
    console.log(err);
    alert("Booking Hours Save Failed");
  }
}

async function loadBookingHoursContext(){

  try{

    const res =
      await fetch(
        "/api/services/booking-hours-context",
        {
          headers:{
            Authorization:"Bearer " + token
          }
        }
      );

    const data =
      await res.json().catch(()=>({}));

    brokerBookingEnabled =
      res.ok &&
      data.success !== false &&
      data.brokerEnabled === true;

  }catch(err){
    console.log(err);
    brokerBookingEnabled = false;
  }
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

  /*
    CUSTOM SERVICE MASTER GATE:
    /api/services/admin already returns only the custom slots that Platform Admin
    enabled for this tenant. An enabled custom slot must still be named first by
    Super Admin before it becomes a real selectable/priced service in the normal
    Service Management sections.

    Core services are never affected by customConfigured.
  */
  const visibleServices = services.filter(service => {
    const slot = Number(service?.customSlot || 0);

    if(slot >= 1 && slot <= 4){
      return service?.customConfigured === true;
    }

    return true;
  });

  // Keep one consistent service order across every Service Management section.
  // Known services use the order below; configured custom services are appended.
  const serviceOrder = [
    "STANDARD",
    "LIMOUSINE",
    "WHEELCHAIR",
    "TAXI",
    "SHARED",
    "XL"
  ];

  const getServiceOrderIndex = (service) => {
    const values = [
      service?.title,
      service?.name,
      service?.serviceKey,
      service?.key,
      service?.code,
      service?.serviceCode
    ].map(upper);

    for(let i = 0; i < serviceOrder.length; i++){
      if(values.some(value => value === serviceOrder[i])){
        return i;
      }
    }

    return serviceOrder.length;
  };

  visibleServices.sort((a,b)=>{
    const aIndex = getServiceOrderIndex(a);
    const bIndex = getServiceOrderIndex(b);

    if(aIndex !== bIndex){
      return aIndex - bIndex;
    }

    return clean(a?.title || a?.name || a?.serviceKey)
      .localeCompare(clean(b?.title || b?.name || b?.serviceKey));
  });

  if(bookingHoursServicesGrid){
    bookingHoursServicesGrid.innerHTML = "";

    visibleServices.forEach(service=>{
      bookingHoursServicesGrid.appendChild(
        renderBookingHoursCard(service)
      );
    });
  }

  if(driverServicesGrid){
    driverServicesGrid.innerHTML = "";

    visibleServices.forEach(service=>{
      driverServicesGrid.appendChild(
        renderDriverTimerCard(service)
      );
    });
  }

  if(servicesGrid){
    servicesGrid.innerHTML = "";

    visibleServices.forEach(service=>{
      servicesGrid.appendChild(
        renderCard("getquote",service)
      );
    });
  }

  if(companyServicesGrid){
    companyServicesGrid.innerHTML = "";

    visibleServices.forEach(service=>{
      companyServicesGrid.appendChild(
        renderCard("facility",service)
      );
    });
  }

  if(reservedServicesGrid){
    reservedServicesGrid.innerHTML = "";

    visibleServices.forEach(service=>{
      reservedServicesGrid.appendChild(
        renderCard("reserved",service)
      );
    });
  }
}


const CUSTOM_ICON_OPTIONS = [
  ["GENERIC_TRANSPORT","🚚","Transport"],
  ["SEDAN","🚗","Sedan"],["SUV","🚙","SUV"],["MINIVAN","🚐","Minivan"],
  ["WHEELCHAIR","♿","Wheelchair"],["LIMOUSINE","🚘","Limousine"],
  ["TAXI","🚕","Taxi"],["SHARED","👥","Shared"],
  ["CARGO_VAN","📦","Cargo Van"],["SPRINTER_VAN","🚐","Sprinter Van"],
  ["PICKUP_TRUCK","🛻","Pickup Truck"],["BOX_TRUCK","🚚","Box Truck"],
  ["MOVING_TRUCK","🚛","Moving Truck"],["FLATBED","🚛","Flatbed"],
  ["SEMI_TRUCK","🚛","Semi Truck"],["TRACTOR_TRAILER","🚛","Tractor Trailer"],
  ["HEAVY_DUTY","🚚","Heavy Duty"],["COURIER","📦","Courier"],
  ["MEDICAL","🏥","Medical"],["ESCORT","🧑‍🦽","Escort"]
];

const CUSTOM_VEHICLE_OPTIONS = [
  ["GENERIC","Generic / Any"],["SEDAN","Sedan"],["SUV","SUV"],
  ["MINIVAN","Minivan"],["WHEELCHAIR_VAN","Wheelchair Van"],
  ["LIMOUSINE","Limousine"],["TAXI","Taxi"],["CARGO_VAN","Cargo Van"],
  ["SPRINTER_VAN","Sprinter / High Roof Van"],["PICKUP_TRUCK","Pickup Truck"],
  ["BOX_TRUCK","Box Truck"],["MOVING_TRUCK","Moving Truck"],
  ["FLATBED","Flatbed"],["SEMI_TRUCK","Semi Truck"],
  ["TRACTOR_TRAILER","Tractor Trailer"],["HEAVY_DUTY","Heavy Duty Truck"],
  ["COURIER","Courier Vehicle"]
];

function customTransportProfile(slot){

  const service =
    customServices().find(
      row => Number(row.customSlot) === Number(slot)
    );

  const byId = id => document.getElementById(id);

  return {
    iconKey:upper(byId(`custom-icon-${slot}`)?.value || service?.iconKey || "GENERIC_TRANSPORT"),
    serviceCategory:upper(byId(`custom-category-${slot}`)?.value || service?.serviceCategory || "PASSENGER"),
    vehicleCategory:upper(byId(`custom-vehicle-${slot}`)?.value || service?.vehicleCategory || "GENERIC"),
    requiresCDL:byId(`custom-cdl-${slot}`)?.checked === true,
    cdlClass:upper(byId(`custom-cdl-class-${slot}`)?.value || ""),
    minimumVehicleCapacityLb:Math.max(0,Number(byId(`custom-capacity-${slot}`)?.value || 0) || 0),
    requiresLiftGate:byId(`custom-liftgate-${slot}`)?.checked === true,
    refrigeratedRequired:byId(`custom-reefer-${slot}`)?.checked === true,
    hazmatRequired:byId(`custom-hazmat-${slot}`)?.checked === true
  };
}

async function saveCustomTransportProfile(slot){

  const service =
    customServices().find(
      row => Number(row.customSlot) === Number(slot)
    );

  if(
    !service?._id ||
    service?.customConfigured !== true ||
    !clean(service?.title)
  ){
    alert("This Custom Service must be named and activated by Platform Admin first.");
    return;
  }

  const response = await fetch(`/api/services/${service._id}`,{
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + token
    },
    body:JSON.stringify(customTransportProfile(slot))
  });

  const data = await response.json().catch(()=>({}));

  if(!response.ok){
    alert(data?.message || "Failed To Save Transport Profile");
    return;
  }

  await loadServices();
}

/* =========================
   CUSTOM SERVICES (4 SLOTS)
========================= */

function customServices(){
  return services
    .filter(service => Number(service?.customSlot || 0) >= 1)
    .sort((a,b) => Number(a.customSlot) - Number(b.customSlot));
}

function renderCustomServiceManager(){

  const anchor = servicesGrid || companyServicesGrid || reservedServicesGrid;
  if(!anchor || !anchor.parentElement) return;

  let box = document.getElementById("customServicesManager");
  if(!box){
    box = document.createElement("section");
    box.id = "customServicesManager";
    box.style.margin = "0 0 18px 0";
    box.style.padding = "16px";
    box.style.border = "1px solid #d9e2ec";
    box.style.borderRadius = "12px";
    anchor.parentElement.insertBefore(box,anchor);
  }

  const rows = customServices();

  /*
    No custom slot was granted by Platform Admin for this tenant. Keep the
    Service Management page exactly as it was for the six core services.
  */
  if(!rows.length){
    box.remove();
    return;
  }

  box.innerHTML = `
    <div style="font-weight:800;font-size:18px;margin-bottom:6px">Custom Services</div>
    <div style="font-size:13px;margin-bottom:12px">
      Custom Service names are assigned by GH Mobility Platform Admin.
      Company admins can configure pricing, booking surfaces, vehicle profile, and operating rules only.
    </div>

    <div style="display:grid;gap:12px">
      ${rows.map(service => {
        const slot = Number(service.customSlot);
        const iconKey = upper(service.iconKey || "GENERIC_TRANSPORT");
        const serviceCategory = upper(service.serviceCategory || "PASSENGER");
        const vehicleCategory = upper(service.vehicleCategory || "GENERIC");
        const cdlClass = upper(service.cdlClass || "");

        return `
          <div style="border:1px solid #d9e2ec;border-radius:10px;padding:12px;background:#fff">
            <div style="display:grid;grid-template-columns:90px 1fr 100px;gap:8px;align-items:center">
              <strong>Slot ${slot}</strong>

              <div
                style="
                  padding:9px 10px;
                  border:1px solid #cbd5e1;
                  border-radius:8px;
                  background:#f8fafc;
                  font-weight:700;
                "
              >
                ${esc(service.title || `Custom Service ${slot}`)}
              </div>

              <div
                style="
                  padding:9px 10px;
                  border:1px solid #cbd5e1;
                  border-radius:8px;
                  background:#f8fafc;
                  text-align:center;
                  font-weight:800;
                "
                title="Platform-assigned service code"
              >
                ${esc(service.customServiceCode || service.serviceKey || "--")}
              </div>
            </div>

            <div style="font-size:11px;color:#64748b;margin-top:6px">
              Name and service code are controlled by Platform Admin.
            </div>

            <details style="margin-top:10px">
              <summary style="cursor:pointer;font-weight:700">Transport / Vehicle Profile</summary>
              <div style="display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;margin-top:12px">
                <label><div style="font-size:12px;font-weight:700;margin-bottom:4px">Icon</div>
                  <select id="custom-icon-${slot}" style="width:100%;padding:8px">
                    ${CUSTOM_ICON_OPTIONS.map(([key,emoji,label])=>`<option value="${key}" ${key===iconKey?"selected":""}>${emoji} ${esc(label)}</option>`).join("")}
                  </select>
                </label>

                <label><div style="font-size:12px;font-weight:700;margin-bottom:4px">Service Category</div>
                  <select id="custom-category-${slot}" style="width:100%;padding:8px">
                    <option value="PASSENGER" ${serviceCategory==="PASSENGER"?"selected":""}>Passenger</option>
                    <option value="CARGO" ${serviceCategory==="CARGO"?"selected":""}>Cargo / Freight</option>
                    <option value="MIXED" ${serviceCategory==="MIXED"?"selected":""}>Mixed</option>
                  </select>
                </label>

                <label><div style="font-size:12px;font-weight:700;margin-bottom:4px">Required Vehicle</div>
                  <select id="custom-vehicle-${slot}" style="width:100%;padding:8px">
                    ${CUSTOM_VEHICLE_OPTIONS.map(([key,label])=>`<option value="${key}" ${key===vehicleCategory?"selected":""}>${esc(label)}</option>`).join("")}
                  </select>
                </label>

                <label><div style="font-size:12px;font-weight:700;margin-bottom:4px">Min Capacity (lb)</div>
                  <input id="custom-capacity-${slot}" type="number" min="0" value="${Number(service.minimumVehicleCapacityLb || 0)}" style="width:100%;padding:8px">
                </label>

                <label style="display:flex;align-items:center;gap:8px"><input id="custom-cdl-${slot}" type="checkbox" ${service.requiresCDL===true?"checked":""}> Requires CDL</label>

                <label><div style="font-size:12px;font-weight:700;margin-bottom:4px">CDL Class</div>
                  <select id="custom-cdl-class-${slot}" style="width:100%;padding:8px">
                    <option value="" ${!cdlClass?"selected":""}>Not Required</option>
                    <option value="A" ${cdlClass==="A"?"selected":""}>Class A</option>
                    <option value="B" ${cdlClass==="B"?"selected":""}>Class B</option>
                    <option value="C" ${cdlClass==="C"?"selected":""}>Class C</option>
                  </select>
                </label>

                <label style="display:flex;align-items:center;gap:8px"><input id="custom-liftgate-${slot}" type="checkbox" ${service.requiresLiftGate===true?"checked":""}> Lift Gate Required</label>
                <label style="display:flex;align-items:center;gap:8px"><input id="custom-reefer-${slot}" type="checkbox" ${service.refrigeratedRequired===true?"checked":""}> Refrigerated</label>
                <label style="display:flex;align-items:center;gap:8px"><input id="custom-hazmat-${slot}" type="checkbox" ${service.hazmatRequired===true?"checked":""}> Hazmat Required</label>

                <div><button type="button" class="save-btn" onclick="saveCustomTransportProfile(${slot})" ${service.customConfigured?"":"disabled"}>Save Profile</button></div>
              </div>
            </details>
          </div>
        `;
      }).join("")}
    </div>
  `;
}


/* =========================
   LOAD
========================= */

async function loadServices(){

  try{

    const res =
      await fetch("/api/services/admin",{
        headers:{
          Authorization:"Bearer " + token
        }
      });

    services =
      await res.json();

    if(!Array.isArray(services)){
      services = [];
    }

    await loadBookingHoursContext();

    renderServices();
    renderCustomServiceManager();

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

    const facilitySuffixId =
      fieldId("facility",id,"suffix");

    if(
      section === "facility" &&
      el.id === facilitySuffixId
    ){

      el.disabled = true;
      el.readOnly = true;

      el.style.background = "#e5e7eb";
      el.style.border = "1px solid #cbd5e1";
      el.style.color = "#475569";
      el.style.cursor = "not-allowed";
      el.style.fontWeight = "800";

      return;
    }

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

    initialDurationMinutes:
      isLimousineService(service)
        ? getNumberValue("getquote",id,"initialduration")
        : Number(service?.initialDurationMinutes || 0),

    initialPrice:
      isLimousineService(service)
        ? getNumberValue("getquote",id,"initialprice")
        : Number(service?.initialPrice || 0),

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

    companyInitialDurationMinutes:
      isLimousineService(service)
        ? getNumberValue("facility",id,"initialduration")
        : Number(service?.companyInitialDurationMinutes || 0),

    companyInitialPrice:
      isLimousineService(service)
        ? getNumberValue("facility",id,"initialprice")
        : Number(service?.companyInitialPrice || 0),

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

    reservedInitialDurationMinutes:
      isLimousineService(service)
        ? getNumberValue("reserved",id,"initialduration")
        : Number(service?.reservedInitialDurationMinutes || 0),

    reservedInitialPrice:
      isLimousineService(service)
        ? getNumberValue("reserved",id,"initialprice")
        : Number(service?.reservedInitialPrice || 0),

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
            "Content-Type":"application/json",
            Authorization:"Bearer " + token
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
            "Content-Type":"application/json",
            Authorization:"Bearer " + token
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
  updateVisualSelect,
  enableDriverTimerEdit,
  saveDriverTimerService,
  enableBookingHoursEdit,
  saveBookingHours,
  saveCustomTransportProfile,
  updateBookingHoursRow
});

/* =========================
   START
========================= */

loadServices();