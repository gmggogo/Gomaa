
"use strict";

const API = "/api/tenant-subscription";

function clean(v){ return String(v ?? "").trim(); }

const token =
  clean(sessionStorage.getItem("staffToken")) ||
  clean(localStorage.getItem("token"));

const role =
  (
    clean(sessionStorage.getItem("staffRole")) ||
    clean(localStorage.getItem("role"))
  )
  .toUpperCase()
  .replace(/[\s-]+/g,"_");

if(
  !token ||
  !["SUPER_ADMIN","SUPERADMIN","ADMIN"].includes(role)
){
  window.location.replace("/login.html");
}

const $ = id => document.getElementById(id);

const E = {
  company:$("companyName"),
  status:$("subscriptionStatus"),
  plan:$("planName"),
  planPrice:$("planPrice"),
  vehicleUsage:$("vehicleUsage"),
  serviceUsage:$("serviceUsage"),
  brokerUsage:$("brokerUsage"),
  amount:$("invoiceAmount"),
  next:$("nextPayment"),
  grace:$("gracePeriod"),
  cycle:$("billingCycle"),
  due:$("dueDate"),
  last:$("lastPayment"),
  access:$("accessState"),
  pay:$("payNowBtn"),
  printCurrent:$("printCurrentInvoiceBtn"),
  history:$("historyBody"),
  msg:$("messageBox"),

  packagePriceAmount:$("packagePriceAmount"),

  vehicleLimit:$("vehicleLimit"),
  actualVehicles:$("actualVehicles"),

  serviceLimit:$("serviceLimit"),
  enabledServices:$("enabledServices"),
  enabledServiceNames:$("enabledServiceNames"),

  brokerLimit:$("brokerLimit"),
  activeBrokers:$("activeBrokers"),
  enabledBrokerNames:$("enabledBrokerNames"),

  driverLimit:$("driverLimit"),
  activeDrivers:$("activeDrivers"),

  dispatcherLimit:$("dispatcherLimit"),
  activeDispatchers:$("activeDispatchers"),

  adminLimit:$("adminLimit"),
  activeAdmins:$("activeAdmins"),

  superAdminLimit:$("superAdminLimit"),
  activeSuperAdmins:$("activeSuperAdmins"),

  companyLimit:$("companyLimit"),
  activeCompanies:$("activeCompanies"),

  extraVehiclesLine:$("extraVehiclesLine"),
  extraBrokersLine:$("extraBrokersLine"),

  discountAmount:$("discountAmount"),
  creditAmount:$("creditAmount"),
  finalPlanPrice:$("finalPlanPrice")
};

let current = null;
let serviceCatalog = [];

function extractServiceRows(data){
  if(Array.isArray(data)) return data;
  if(Array.isArray(data?.services)) return data.services;
  if(Array.isArray(data?.data)) return data.data;
  if(Array.isArray(data?.items)) return data.items;
  return [];
}

function normalizeServiceKey(value){
  const raw = clean(value).toUpperCase().replace(/[\s-]+/g,"_");
  const compact = raw.replace(/_/g,"");

  if(compact === "STANDARD" || compact === "ST") return "ST";
  if(compact === "WHEELCHAIR" || compact === "WC" || compact === "WH") return "WH";
  if(compact === "SHARED" || compact === "SH") return "SH";
  if(compact === "LIMOUSINE" || compact === "LIMO" || compact === "LM") return "LM";
  if(compact === "TAXI" || compact === "TX") return "TX";
  if(compact === "XL" || compact === "XLSERVICE") return "XL";

  const custom = compact.match(/^CUSTOM([1-4])$/);
  if(custom) return "CUSTOM_" + custom[1];

  return raw;
}

function firstTwoServiceLetters(value){
  const letters = clean(value)
    .toUpperCase()
    .replace(/[^A-Z]/g,"")
    .slice(0,2);

  return letters.length === 2 ? letters : "";
}

function customServiceDisplayCode(gateKey){
  const key = normalizeServiceKey(gateKey);

  if(!/^CUSTOM_[1-4]$/.test(key)){
    return key;
  }

  const slot =
    Number(
      key.match(/^CUSTOM_([1-4])$/)?.[1] || 0
    );

  /*
    Custom service records do not always keep CUSTOM_n in serviceKey.
    After configuration, serviceKey/customServiceCode may become the
    real two-letter operational code (for example ME). The permanent
    link back to the Platform slot is customSlot, so match by slot first.
  */
  const row = serviceCatalog.find(service=>{
    const directSlot =
      Number(
        service?.customSlot ||
        service?.customServiceSlot ||
        0
      );

    if(slot && directSlot === slot){
      return true;
    }

    const identityCandidates = [
      service?.serviceIdentity,
      service?.gateKey,
      service?.platformServiceKey,
      service?.serviceKey,
      service?.key,
      service?.code
    ];

    return identityCandidates.some(value=>
      normalizeServiceKey(value) === key
    );
  });

  if(!row){
    return "";
  }

  return (
    firstTwoServiceLetters(
      row?.customServiceCode ||
      row?.serviceCode ||
      row?.serviceSuffix ||
      row?.companySuffix ||
      row?.reservedSuffix ||
      row?.suffix
    ) ||
    firstTwoServiceLetters(
      row?.title ||
      row?.name ||
      row?.serviceName
    )
  );
}

function displayServiceCode(value){
  const key = normalizeServiceKey(value);

  if(/^CUSTOM_[1-4]$/.test(key)){
    return customServiceDisplayCode(key);
  }

  if(["ST","WH","SH","LM","TX","XL"].includes(key)){
    return key;
  }

  return firstTwoServiceLetters(value) || clean(value);
}

async function loadServiceCatalog(){
  try{
    const res = await fetch(
      "/api/services/admin",
      {
        headers:{
          Authorization:"Bearer " + token
        },
        cache:"no-store"
      }
    );

    if(!res.ok){
      serviceCatalog = [];
      return;
    }

    const data = await res.json().catch(()=>[]);
    serviceCatalog = extractServiceRows(data);
  }catch(err){
    console.warn("SERVICE CATALOG LOAD ERROR:",err);
    serviceCatalog = [];
  }
}

function money(v){
  return new Intl.NumberFormat(
    "en-US",
    {style:"currency",currency:"USD"}
  ).format(Number(v || 0));
}

function dateText(v){
  if(!v) return "--";
  const d = new Date(v);
  if(Number.isNaN(d.getTime())) return "--";
  return d.toLocaleDateString(
    "en-US",
    {
      year:"numeric",
      month:"short",
      day:"numeric",
      timeZone:"UTC"
    }
  );
}

function esc(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}


function invoiceDateText(v){
  if(!v) return "--";
  const d = new Date(v);
  if(Number.isNaN(d.getTime())) return "--";
  return d.toLocaleDateString(
    "en-US",
    {
      year:"numeric",
      month:"long",
      day:"numeric",
      timeZone:"UTC"
    }
  );
}

function invoiceValue(v,fallback="--"){
  const s = clean(v);
  return s || fallback;
}

function invoiceSnapshotFromCurrent(){
  if(!current) return null;

  const s = current.subscription || {};
  const p = current.pricing || {};
  const u = current.usage || {};
  const inv = current.currentInvoice || {};

  return {
    ...inv,
    companyName:
      inv.companyName ||
      current.tenant?.name ||
      "Company",
    planName:
      inv.planName ||
      s.planName ||
      "GH Mobility",
    billingCycle:
      inv.billingCycle ||
      s.billingCycle ||
      "--",
    billingDueDate:
      inv.billingDueDate ||
      s.dueDate ||
      s.nextBillingDate ||
      null,
    packagePrice:Number(
      inv.packagePrice ??
      (
        Number(p.baseAmount || 0) +
        Number(p.serviceAmount || 0)
      )
    ),
    finalAmount:Number(
      inv.finalAmount ??
      p.finalAmount ??
      s.planPrice ??
      0
    ),
    vehicleLimit:Number(inv.vehicleLimit ?? p.maxVehicles ?? s.maxVehicles ?? 0),
    activeVehicles:Number(inv.activeVehicles ?? p.actualVehicles ?? u.actualVehicles ?? 0),
    serviceLimit:Number(inv.serviceLimit ?? p.maxServices ?? s.maxServices ?? 0),
    activeServices:Number(inv.activeServices ?? p.enabledServices ?? u.enabledServices ?? 0),
    enabledServices:Array.isArray(inv.enabledServices)
      ? inv.enabledServices
      : enabledServiceNames(current),
    brokerLimit:Number(inv.brokerLimit ?? p.maxBrokers ?? s.maxBrokers ?? 0),
    activeBrokers:Number(inv.activeBrokers ?? p.actualBrokers ?? u.actualBrokers ?? 0),
    enabledBrokers:Array.isArray(inv.enabledBrokers)
      ? inv.enabledBrokers
      : enabledBrokerNames(current),
    driverLimit:Number(inv.driverLimit ?? p.maxDrivers ?? s.maxDrivers ?? 0),
    activeDrivers:Number(inv.activeDrivers ?? p.actualDrivers ?? u.actualDrivers ?? 0),
    dispatcherLimit:Number(inv.dispatcherLimit ?? p.maxDispatchers ?? s.maxDispatchers ?? 0),
    activeDispatchers:Number(inv.activeDispatchers ?? p.actualDispatchers ?? u.actualDispatchers ?? 0),
    adminLimit:Number(inv.adminLimit ?? p.maxAdmins ?? s.maxAdmins ?? 0),
    activeAdmins:Number(inv.activeAdmins ?? p.actualAdmins ?? u.actualAdmins ?? 0),
    superAdminLimit:Number(inv.superAdminLimit ?? p.maxSuperAdmins ?? s.maxSuperAdmins ?? 0),
    activeSuperAdmins:Number(inv.activeSuperAdmins ?? p.actualSuperAdmins ?? u.actualSuperAdmins ?? 0),
    companyLimit:Number(inv.companyLimit ?? p.maxCompanies ?? s.maxCompanies ?? 0),
    activeCompanies:Number(inv.activeCompanies ?? p.actualCompanies ?? u.actualCompanies ?? 0),
    extraVehicles:Number(inv.extraVehicles ?? p.billableExtraVehicles ?? p.extraVehicles ?? 0),
    extraVehiclePrice:Number(inv.extraVehiclePrice ?? p.extraVehiclePrice ?? 0),
    extraVehicleAmount:Number(inv.extraVehicleAmount ?? p.vehicleAmount ?? 0),
    extraBrokers:Number(inv.extraBrokers ?? p.billableExtraBrokers ?? p.extraBrokers ?? 0),
    extraBrokerPrice:Number(inv.extraBrokerPrice ?? p.extraBrokerPrice ?? 0),
    extraBrokerAmount:Number(inv.extraBrokerAmount ?? p.brokerAmount ?? 0),
    discount:Number(inv.discount ?? p.discount ?? 0),
    credit:Number(inv.credit ?? p.credit ?? 0)
  };
}

function printInvoice(snapshot,payment=null){
  if(!snapshot) return;

  const paid = payment?.status === "PAID";
  const invoiceNumber =
    invoiceValue(
      payment?.invoiceNumber ||
      snapshot.invoiceNumber,
      "CURRENT"
    );

  const invoiceDate =
    payment?.paidAt ||
    payment?.createdAt ||
    snapshot.capturedAt ||
    new Date();

  const status =
    payment?.status ||
    (current?.subscription?.amountDue > 0 ? "DUE" : "CURRENT");

  const method =
    payment?.paymentMethod ||
    (paid ? "PAID" : "--");

  const amount =
    Number(
      payment?.amount ??
      snapshot.finalAmount ??
      0
    );

  const serviceNames =
    Array.isArray(snapshot.enabledServices) &&
    snapshot.enabledServices.length
      ? [
          ...new Set(
            snapshot.enabledServices
              .map(value=>displayServiceCode(value))
              .filter(Boolean)
          )
        ].join(", ")
      : "--";

  const brokerNames =
    Array.isArray(snapshot.enabledBrokers) &&
    snapshot.enabledBrokers.length
      ? snapshot.enabledBrokers.join(", ")
      : "--";

  const w = window.open("","_blank","width=980,height=900");

  if(!w){
    showMessage("Pop-up blocked. Allow pop-ups to print the invoice.","error");
    return;
  }

  w.document.write(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${esc(invoiceNumber)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#eef2f6;font-family:Arial,sans-serif;color:#172033}
.invoice{width:900px;max-width:calc(100% - 30px);margin:24px auto;background:#fff;border:1px solid #d5dde6}
.head{padding:28px 32px;background:#0b2747;color:#fff;display:flex;justify-content:space-between;gap:20px}
.brand h1{margin:0;font-size:28px}.brand div{margin-top:6px;font-size:12px;letter-spacing:1.4px}
.invoice-meta{text-align:right;font-size:12px;line-height:1.7}
.body{padding:28px 32px}
.company{padding:16px;border:1px solid #dbe3ea;background:#f8fafc;margin-bottom:20px}
.company strong{display:block;font-size:18px;margin-bottom:4px}
.section{margin-top:18px;border:1px solid #dbe3ea}
.section-title{padding:10px 12px;background:#10345c;color:#fff;font-weight:800;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0}
.item{padding:12px;border-right:1px solid #e6ebf0;border-bottom:1px solid #e6ebf0}
.item span{display:block;font-size:9px;color:#64748b;text-transform:uppercase;font-weight:800}
.item strong{display:block;margin-top:5px;font-size:13px}
.wide{grid-column:span 3}
.total{display:flex;justify-content:space-between;padding:16px 18px;background:#fff8da;border-top:2px solid #d6b24e;font-size:18px;font-weight:900;color:#7a5700}
.footer{padding:18px 32px 28px;color:#64748b;font-size:10px;text-align:center}
.actions{width:900px;max-width:calc(100% - 30px);margin:0 auto 24px;text-align:right}
.actions button{border:0;border-radius:8px;padding:10px 16px;background:#0b2747;color:#fff;font-weight:800;cursor:pointer}
@media print{
  body{background:#fff}
  .actions{display:none}
  .invoice{margin:0;border:0;width:100%;max-width:none}
}
</style>
</head>
<body>
<div class="actions"><button onclick="window.print()">Print / Save PDF</button></div>
<div class="invoice">
  <div class="head">
    <div class="brand">
      <h1>GH Mobility</h1>
      <div>SAAS SUBSCRIPTION INVOICE</div>
    </div>
    <div class="invoice-meta">
      <div><strong>Invoice:</strong> ${esc(invoiceNumber)}</div>
      <div><strong>Date:</strong> ${esc(invoiceDateText(invoiceDate))}</div>
      <div><strong>Cycle:</strong> ${esc(snapshot.billingCycle || "--")}</div>
      <div><strong>Status:</strong> ${esc(status)}</div>
      <div><strong>Method:</strong> ${esc(method || "--")}</div>
    </div>
  </div>
  <div class="body">
    <div class="company">
      <strong>${esc(snapshot.companyName || "Company")}</strong>
      <div>${esc(snapshot.planName || "GH Mobility")}</div>
      <div>Due Date: ${esc(invoiceDateText(snapshot.billingDueDate))}</div>
    </div>

    <div class="section">
      <div class="section-title">Plan Details</div>
      <div class="grid">
        <div class="item"><span>Package Price</span><strong>${esc(money(snapshot.packagePrice || 0))}</strong></div>
        <div class="item"><span>Vehicle Limit</span><strong>${Number(snapshot.vehicleLimit || 0)}</strong></div>
        <div class="item"><span>Active Vehicles</span><strong>${Number(snapshot.activeVehicles || 0)}</strong></div>
        <div class="item"><span>Service Limit</span><strong>${Number(snapshot.serviceLimit || 0)}</strong></div>
        <div class="item"><span>Active Services</span><strong>${Number(snapshot.activeServices || 0)}</strong></div>
        <div class="item"><span>Broker Limit</span><strong>${Number(snapshot.brokerLimit || 0)}</strong></div>
        <div class="item wide"><span>Enabled Services</span><strong>${esc(serviceNames)}</strong></div>
        <div class="item"><span>Active Brokers</span><strong>${Number(snapshot.activeBrokers || 0)}</strong></div>
        <div class="item wide"><span>Enabled Brokers</span><strong>${esc(brokerNames)}</strong></div>
        <div class="item"><span>Driver Limit / Active</span><strong>${Number(snapshot.driverLimit || 0)} / ${Number(snapshot.activeDrivers || 0)}</strong></div>
        <div class="item"><span>Dispatcher Limit / Active</span><strong>${Number(snapshot.dispatcherLimit || 0)} / ${Number(snapshot.activeDispatchers || 0)}</strong></div>
        <div class="item"><span>Admin Limit / Active</span><strong>${Number(snapshot.adminLimit || 0)} / ${Number(snapshot.activeAdmins || 0)}</strong></div>
        <div class="item"><span>Super Admin Limit / Active</span><strong>${Number(snapshot.superAdminLimit || 0)} / ${Number(snapshot.activeSuperAdmins || 0)}</strong></div>
        <div class="item"><span>Company Limit / Active</span><strong>${Number(snapshot.companyLimit || 0)} / ${Number(snapshot.activeCompanies || 0)}</strong></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Billing</div>
      <div class="grid">
        <div class="item"><span>Extra Vehicles</span><strong>${Number(snapshot.extraVehicles || 0)} × ${esc(money(snapshot.extraVehiclePrice || 0))} = ${esc(money(snapshot.extraVehicleAmount || 0))}</strong></div>
        <div class="item"><span>Extra Brokers</span><strong>${Number(snapshot.extraBrokers || 0)} × ${esc(money(snapshot.extraBrokerPrice || 0))} = ${esc(money(snapshot.extraBrokerAmount || 0))}</strong></div>
        <div class="item"><span>Discount</span><strong>-${esc(money(snapshot.discount || 0))}</strong></div>
        <div class="item"><span>Credit</span><strong>-${esc(money(snapshot.credit || 0))}</strong></div>
      </div>
      <div class="total">
        <span>Final Amount</span>
        <strong>${esc(money(amount))}</strong>
      </div>
    </div>
  </div>
  <div class="footer">Generated by GH Mobility SaaS Billing</div>
</div>
</body>
</html>
  `);

  w.document.close();
  w.focus();
}

function showMessage(text,type="info"){
  E.msg.textContent = text;
  E.msg.className = "message show " + type;
}

async function api(url,options={}){
  const res = await fetch(url,{
    ...options,
    headers:{
      ...(options.headers || {}),
      Authorization:"Bearer " + token
    },
    cache:"no-store"
  });

  const data = await res.json().catch(()=>({}));

  if(!res.ok){
    throw new Error(data.message || "Request failed");
  }

  return data;
}


function numberValue(...values){
  for(const value of values){
    const n = Number(value);
    if(Number.isFinite(n)){
      return n;
    }
  }
  return 0;
}

function enabledServiceNames(data){
  const p = data?.pricing || {};
  const u = data?.usage || {};
  const s = data?.subscription || {};

  const rows =
    Array.isArray(p.serviceControls) ? p.serviceControls :
    Array.isArray(u.services) ? u.services :
    Array.isArray(s.serviceControls) ? s.serviceControls :
    [];

  const names = rows
    .filter(row=>row?.accessEnabled !== false)
    .map(row=>{
      const raw =
        row?.key ||
        row?.serviceKey ||
        row?.code ||
        row?.label ||
        "";

      const code = displayServiceCode(raw);

      if(code){
        return code;
      }

      const fallback = clean(row?.label || raw);

      /*
        Never expose internal CUSTOM_n identities to the customer.
        If a custom slot has not been configured with a real service
        name/code yet, leave it out of the customer-facing list.
      */
      return /^CUSTOM_[1-4]$/i.test(fallback)
        ? ""
        : fallback;
    })
    .filter(Boolean);

  return [...new Set(names)];
}

function enabledBrokerRows(data){
  const candidates = [
    data?.brokers,
    data?.brokerConnections,
    data?.usage?.brokers,
    data?.pricing?.brokerControls,
    data?.subscription?.brokerControls
  ];

  for(const rows of candidates){
    if(Array.isArray(rows)){
      return rows.filter(row=>
        row?.enabled !== false &&
        row?.accessEnabled !== false &&
        row?.billingEnabled !== false
      );
    }
  }

  return [];
}

function enabledBrokerNames(data){
  return enabledBrokerRows(data)
    .map(row=>clean(
      row?.brokerName ||
      row?.name ||
      row?.label ||
      row?.brokerCode ||
      row?.code
    ))
    .filter(Boolean);
}

function render(data){
  current = data;

  const s = data.subscription || {};
  const t = data.tenant || {};
  const p = data.pricing || {};
  const u = data.usage || {};

  E.company.textContent =
    t.name ||
    t.companyName ||
    "Company";

  const status = clean(s.status || "ACTIVE").toUpperCase();
  const map = {
    ACTIVE:"active",
    TRIAL:"trial",
    PAST_DUE:"past_due",
    SUSPENDED:"suspended"
  };

  E.status.className = "badge " + (map[status] || "none");
  E.status.textContent = status.replace(/_/g," ");

  const actualVehicles =
    numberValue(
      p.actualVehicles,
      u.actualVehicles
    );

  const maxVehicles =
    numberValue(
      p.maxVehicles,
      s.maxVehicles
    );

  const enabledServices =
    numberValue(
      p.enabledServices,
      u.enabledServices
    );

  const maxServices =
    numberValue(
      p.maxServices,
      s.maxServices
    );

  const actualBrokers =
    numberValue(
      p.actualBrokers,
      u.actualBrokers,
      enabledBrokerRows(data).length
    );

  const maxBrokers =
    numberValue(
      p.maxBrokers,
      s.maxBrokers
    );

  const actualDrivers =
    numberValue(
      p.actualDrivers,
      u.actualDrivers
    );

  const maxDrivers =
    numberValue(
      p.maxDrivers,
      s.maxDrivers
    );

  const actualDispatchers =
    numberValue(
      p.actualDispatchers,
      u.actualDispatchers
    );

  const maxDispatchers =
    numberValue(
      p.maxDispatchers,
      s.maxDispatchers
    );

  const actualAdmins =
    numberValue(
      p.actualAdmins,
      u.actualAdmins
    );

  const maxAdmins =
    numberValue(
      p.maxAdmins,
      s.maxAdmins
    );

  const actualSuperAdmins =
    numberValue(
      p.actualSuperAdmins,
      u.actualSuperAdmins
    );

  const maxSuperAdmins =
    numberValue(
      p.maxSuperAdmins,
      s.maxSuperAdmins
    );

  const actualCompanies =
    numberValue(
      p.actualCompanies,
      u.actualCompanies
    );

  const maxCompanies =
    numberValue(
      p.maxCompanies,
      s.maxCompanies
    );

  /*
    Company-facing package price:
    all service pricing is bundled into one package total.
    Internal service-by-service pricing is intentionally not shown here.
  */
  const packagePrice =
    numberValue(p.baseAmount) +
    numberValue(p.serviceAmount);

  const extraVehicles =
    numberValue(
      p.billableExtraVehicles,
      p.extraVehicles
    );

  const extraVehiclePrice =
    numberValue(
      p.extraVehiclePrice,
      s.extraVehiclePrice
    );

  const extraBrokers =
    numberValue(
      p.billableExtraBrokers,
      p.extraBrokers
    );

  const extraBrokerPrice =
    numberValue(
      p.extraBrokerPrice,
      s.extraBrokerPrice
    );

  const serviceNames =
    enabledServiceNames(data);

  const brokerNames =
    enabledBrokerNames(data);

  E.plan.textContent =
    s.planName || "GH Mobility";

  E.planPrice.textContent =
    money(
      packagePrice ||
      s.planPrice ||
      p.finalAmount ||
      0
    );

  E.vehicleUsage.textContent =
    actualVehicles + " / " + maxVehicles;

  E.serviceUsage.textContent =
    enabledServices + " / " + maxServices;

  E.brokerUsage.textContent =
    actualBrokers + " / " + maxBrokers;

  E.amount.textContent =
    money(s.amountDue);

  E.next.textContent =
    dateText(s.nextBillingDate);

  E.grace.textContent =
    Number(s.graceDays || 0) + " days";

  E.cycle.textContent =
    s.billingCycle || "--";

  E.due.textContent =
    dateText(s.dueDate);

  E.last.textContent =
    dateText(s.lastPaymentDate);

  E.access.textContent =
    s.locked
      ? "PAYMENT REQUIRED"
      : "ACTIVE";

  E.packagePriceAmount.textContent =
    money(
      packagePrice ||
      s.planPrice ||
      p.finalAmount ||
      0
    );

  E.vehicleLimit.textContent =
    maxVehicles;

  E.actualVehicles.textContent =
    actualVehicles;

  E.serviceLimit.textContent =
    maxServices;

  E.enabledServices.textContent =
    enabledServices;

  E.enabledServiceNames.textContent =
    serviceNames.length
      ? serviceNames.join(", ")
      : "--";

  E.brokerLimit.textContent =
    maxBrokers;

  E.activeBrokers.textContent =
    actualBrokers;

  E.enabledBrokerNames.textContent =
    brokerNames.length
      ? [...new Set(brokerNames)].join(", ")
      : actualBrokers > 0
        ? actualBrokers + " active broker" + (actualBrokers === 1 ? "" : "s")
        : "--";

  E.driverLimit.textContent =
    maxDrivers;

  E.activeDrivers.textContent =
    actualDrivers;

  E.dispatcherLimit.textContent =
    maxDispatchers;

  E.activeDispatchers.textContent =
    actualDispatchers;

  E.adminLimit.textContent =
    maxAdmins;

  E.activeAdmins.textContent =
    actualAdmins;

  E.superAdminLimit.textContent =
    maxSuperAdmins;

  E.activeSuperAdmins.textContent =
    actualSuperAdmins;

  E.companyLimit.textContent =
    maxCompanies;

  E.activeCompanies.textContent =
    actualCompanies;

  E.extraVehiclesLine.textContent =
    extraVehicles +
    " × " +
    money(extraVehiclePrice) +
    " = " +
    money(p.vehicleAmount || 0);

  E.extraBrokersLine.textContent =
    extraBrokers +
    " × " +
    money(extraBrokerPrice) +
    " = " +
    money(p.brokerAmount || 0);

  E.discountAmount.textContent =
    "-" + money(p.discount || 0);

  E.creditAmount.textContent =
    "-" + money(p.credit || 0);

  E.finalPlanPrice.textContent =
    money(
      p.finalAmount ??
      s.planPrice ??
      s.amountDue ??
      0
    );

  const amount = Number(s.amountDue || 0);
  const canPay = s.canPay === true && amount > 0;

  E.pay.disabled = !canPay;

  if(canPay){
    E.pay.textContent =
      "Pay " + money(amount);
  }else if(s.paymentWindowOpensAt){
    E.pay.textContent =
      "Payment opens " +
      dateText(s.paymentWindowOpensAt);
  }else{
    E.pay.textContent =
      "No Payment Due";
  }

  const rows =
    Array.isArray(data.history)
      ? data.history
      : [];

  E.history.innerHTML =
    rows.length
      ? rows.map(r=>`
          <tr>
            <td>${esc(dateText(r.paidAt || r.createdAt))}</td>
            <td>${esc(r.invoiceNumber || "--")}</td>
            <td>${esc(r.billingCycle || "--")}</td>
            <td>${esc(r.paymentMethod || "--")}</td>
            <td>${esc(r.status || "--")}</td>
            <td class="amount">${esc(money(r.amount))}</td>
            <td>
              ${
                String(r.status || "").toUpperCase() === "PAID"
                  ? `<button class="print-invoice-btn small" data-print-payment="${esc(r._id || "")}" type="button">Print</button>`
                  : "--"
              }
            </td>
          </tr>
        `).join("")
      : `<tr><td colspan="7" class="empty">No subscription payments yet.</td></tr>`;

  if(s.locked){
    showMessage(
      "Subscription payment is required to restore full account access.",
      "error"
    );
  }
}

async function load(){
  try{
    const data = await api(API + "/me");
    render(data);
  }catch(err){
    console.error("PAYMENTS LOAD ERROR:",err);
    showMessage(err.message || "Unable to load subscription.","error");
    E.history.innerHTML =
      `<tr><td colspan="7" class="empty">Unable to load payment history.</td></tr>`;
  }
}

async function payNow(){
  const old = E.pay.textContent;

  try{
    E.pay.disabled = true;
    E.pay.textContent = "Opening Stripe...";

    const data = await api(
      API + "/checkout-session",
      {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:"{}"
      }
    );

    if(!data.url){
      throw new Error("Stripe checkout URL missing");
    }

    window.location.assign(data.url);

  }catch(err){
    console.error("PAY NOW ERROR:",err);
    showMessage(err.message || "Unable to start payment.","error");
    E.pay.disabled = true;
    E.pay.textContent = old;
    await load();
  }
}

async function verifyReturn(){
  const params = new URLSearchParams(location.search);
  const sessionId = params.get("session_id");

  if(params.get("cancelled") === "1"){
    showMessage("Payment was cancelled.","info");
    return;
  }

  if(!sessionId) return;

  try{
    const data = await api(
      API + "/verify?session_id=" + encodeURIComponent(sessionId)
    );

    if(data.paid){
      showMessage("Payment completed successfully.","ok");
    }else if(data.processing){
      showMessage("ACH payment is processing.","info");
    }else{
      showMessage("Payment is not completed yet.","info");
    }

    history.replaceState({},document.title,location.pathname);

  }catch(err){
    console.error("VERIFY ERROR:",err);
  }
}


if(E.printCurrent){
  E.printCurrent.addEventListener("click",()=>{
    printInvoice(
      invoiceSnapshotFromCurrent(),
      null
    );
  });
}

E.history.addEventListener("click",event=>{
  const btn =
    event.target.closest("[data-print-payment]");

  if(!btn || !current) return;

  const paymentId =
    clean(btn.dataset.printPayment);

  const payment =
    (Array.isArray(current.history) ? current.history : [])
      .find(row=>
        String(row?._id || "") === paymentId
      );

  if(!payment) return;

  let snapshot =
    payment.invoiceSnapshot &&
    typeof payment.invoiceSnapshot === "object"
      ? payment.invoiceSnapshot
      : null;

  if(!snapshot){
    snapshot = {
      companyName:
        current.tenant?.name ||
        "Company",
      planName:
        current.subscription?.planName ||
        "GH Mobility",
      billingCycle:
        payment.billingCycle ||
        current.subscription?.billingCycle ||
        "--",
      billingDueDate:
        payment.billingDueDate ||
        null,
      packagePrice:Number(payment.amount || 0),
      finalAmount:Number(payment.amount || 0),
      enabledServices:[],
      enabledBrokers:[]
    };
  }

  printInvoice(snapshot,payment);
});

E.pay.addEventListener("click",payNow);

(async()=>{
  await verifyReturn();
  await loadServiceCatalog();
  await load();
})();