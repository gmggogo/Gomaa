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
  amount:$("invoiceAmount"),
  next:$("nextPayment"),
  grace:$("gracePeriod"),
  cycle:$("billingCycle"),
  due:$("dueDate"),
  last:$("lastPayment"),
  access:$("accessState"),
  pay:$("payNowBtn"),
  history:$("historyBody"),
  msg:$("messageBox")
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

function render(data){
  current = data;

  const s = data.subscription || {};
  const t = data.tenant || {};

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

  E.plan.textContent = s.planName || "GH Mobility";
  E.planPrice.textContent = money(s.planPrice);
  E.amount.textContent = money(s.amountDue);
  E.next.textContent = dateText(s.nextBillingDate);
  E.grace.textContent = Number(s.graceDays || 0) + " days";
  E.cycle.textContent = s.billingCycle || "--";
  E.due.textContent = dateText(s.dueDate);
  E.last.textContent = dateText(s.lastPaymentDate);
  E.access.textContent = s.locked ? "PAYMENT REQUIRED" : "ACTIVE";

  const amount = Number(s.amountDue || 0);
  const canPay = s.canPay === true && amount > 0;

  E.pay.disabled = !canPay;

  if(canPay){
    E.pay.textContent = "Pay " + money(amount);
  }else if(s.paymentWindowOpensAt){
    E.pay.textContent =
      "Payment opens " +
      dateText(s.paymentWindowOpensAt);
  }else{
    E.pay.textContent = "No Payment Due";
  }

  const rows = Array.isArray(data.history) ? data.history : [];

  E.history.innerHTML = rows.length
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
