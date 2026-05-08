const token = localStorage.getItem("token");
const companyName = localStorage.getItem("name") || "";

if(!token){
  window.location.href = "company-login.html";
}

const billingStatusEl = document.getElementById("billingStatus");
const invoiceAmountEl = document.getElementById("invoiceAmount");
const nextBillingDateEl = document.getElementById("nextBillingDate");
const billingCycleEl = document.getElementById("billingCycle");
const billingAlert = document.getElementById("billingAlert");
const achPayBtn = document.getElementById("achPayBtn");
const paymentHistoryBody = document.getElementById("paymentHistoryBody");

/* =========================
   HELPERS
========================= */

function formatMoney(value){
  return "$" + Number(value || 0).toFixed(2);
}

function formatDate(value){
  if(!value) return "--";

  const d = new Date(value);

  if(isNaN(d.getTime())) return "--";

  return d.toLocaleDateString("en-US",{
    year:"numeric",
    month:"short",
    day:"numeric"
  });
}

function daysUntil(dateValue){
  if(!dateValue) return null;

  const due = new Date(dateValue);
  if(isNaN(due.getTime())) return null;

  const now = new Date();

  const diff = due.getTime() - now.getTime();

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function setStatusColor(status){

  billingStatusEl.className = "";

  if(status === "ACTIVE"){
    billingStatusEl.classList.add("status-active");
  }

  if(status === "PAST_DUE"){
    billingStatusEl.classList.add("status-past");
  }

  if(status === "SUSPENDED"){
    billingStatusEl.classList.add("status-suspended");
  }

}

/* =========================
   ALERT
========================= */

function renderAlert(company){

  billingAlert.className = "alert";

  const status = company.billingStatus || "ACTIVE";
  const locked = company.billingLocked === true;
  const dueDays = daysUntil(company.nextBillingDate);

  if(locked || status === "SUSPENDED"){

    billingAlert.classList.add("active","alert-red");

    billingAlert.innerHTML = `
      ACCOUNT SUSPENDED — Payment is required to continue adding trips.
    `;

    return;
  }

  if(status === "PAST_DUE"){

    billingAlert.classList.add("active","alert-red");

    billingAlert.innerHTML = `
      PAYMENT OVERDUE — Please complete payment to avoid account suspension.
    `;

    return;
  }

  if(dueDays !== null && dueDays <= 3 && dueDays >= 0){

    billingAlert.classList.add("active","alert-yellow");

    billingAlert.innerHTML = `
      Payment due in ${dueDays} day${dueDays === 1 ? "" : "s"}.
    `;

    return;
  }

  if(status === "ACTIVE"){

    billingAlert.classList.add("active","alert-green");

    billingAlert.innerHTML = `
      Account active. Next payment date: ${formatDate(company.nextBillingDate)}.
    `;

  }

}

/* =========================
   LOAD PAYMENT DATA
========================= */

async function loadPayment(){

  try{

    const res = await fetch(
      `/api/company/billing?company=${encodeURIComponent(companyName)}`,
      {
        headers:{
          Authorization:"Bearer " + token
        }
      }
    );

    if(!res.ok){
      throw new Error("Unable to load billing data");
    }

    const company = await res.json();

    renderBilling(company);

  }catch(err){

    console.log(err);

    billingAlert.className = "alert active alert-red";
    billingAlert.innerText = "Unable to load payment information.";

  }

}

/* =========================
   RENDER BILLING
========================= */

function renderBilling(company){

  const status = company.billingStatus || "ACTIVE";

  billingStatusEl.innerText = status;
  setStatusColor(status);

  invoiceAmountEl.innerText = formatMoney(company.invoiceAmount || 0);

  nextBillingDateEl.innerText = formatDate(company.nextBillingDate);

  billingCycleEl.innerText = company.billingCycle || "MONTHLY";

  renderAlert(company);

  if(company.billingLocked || status === "SUSPENDED"){
    achPayBtn.innerText = "Pay To Unlock Account";
  }else{
    achPayBtn.innerText = "Pay With Bank";
  }

}

/* =========================
   ACH PAYMENT
========================= */

achPayBtn.addEventListener("click", async ()=>{

  try{

    achPayBtn.disabled = true;
    achPayBtn.innerText = "Creating Payment...";

    const res = await fetch("/api/company/create-ach-payment",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:JSON.stringify({
        company: companyName
      })
    });

  const text = await res.text();

let data = {};

try{
  data = JSON.parse(text);
}catch{

  console.log("SERVER RESPONSE:");
  console.log(text);

  throw new Error(
    "Server did not return JSON.\nCheck backend route."
  );

}

if(!res.ok){

  throw new Error(
    data.message || "Payment error"
  );

}

    if(data.url){
      window.location.href = data.url;
      return;
    }

    alert("Payment session created, but no checkout URL returned.");

  }catch(err){

    console.log(err);

    alert(err.message || "Payment failed");

    achPayBtn.disabled = false;
    achPayBtn.innerText = "Pay With Bank";

  }

});

/* =========================
   INIT
========================= */

loadPayment();

