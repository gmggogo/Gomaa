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
    {year:"numeric",month:"short",day:"numeric"}
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
    if(
      value === null ||
      value === undefined ||
      clean(value) === ""
    ){
      continue;
    }

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
    .map(row=>clean(row?.label || row?.key))
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
    numberValue(
      p.baseAmount,
      s.basePrice
    ) +
    numberValue(
      p.serviceAmount
    );

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
          </tr>
        `).join("")
      : `<tr><td colspan="6" class="empty">No subscription payments yet.</td></tr>`;

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
      `<tr><td colspan="6" class="empty">Unable to load payment history.</td></tr>`;
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

E.pay.addEventListener("click",payNow);

(async()=>{
  await verifyReturn();
  await load();
})();
