/* =========================
   AUTH
========================= */

const token =
  localStorage.getItem("token");

if(!token){

  window.location.href =
    "/admin/login.html";

}

/* =========================
   ELEMENTS
========================= */

const container =
  document.getElementById("billingContainer");

const historyContainer =
  document.getElementById("historyContainer");

const searchInput =
  document.getElementById("searchInput");

const statusFilter =
  document.getElementById("statusFilter");

const monthFilter =
  document.getElementById("monthFilter");

const yearFilter =
  document.getElementById("yearFilter");

const connectStripeBtn =
  document.getElementById("connectStripeBtn");

const openStripeBtn =
  document.getElementById("openStripeBtn");

/* STATS */

const totalCompaniesEl =
  document.getElementById("totalCompanies");

const activeCompaniesEl =
  document.getElementById("activeCompanies");

const pastDueCompaniesEl =
  document.getElementById("pastDueCompanies");

const lockedCompaniesEl =
  document.getElementById("lockedCompanies");

const totalRevenueEl =
  document.getElementById("totalRevenue");

const pendingPaymentsEl =
  document.getElementById("pendingPayments");

/* =========================
   DATA
========================= */

let companies = [];

/* =========================
   MONTHS
========================= */

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

if(monthFilter){

  months.forEach((m,i)=>{

    monthFilter.innerHTML += `
      <option value="${i + 1}">
        ${m}
      </option>
    `;

  });

}

/* =========================
   HELPERS
========================= */

function money(value){

  return "$" +
    Number(value || 0).toFixed(2);

}

function formatDate(value){

  if(!value) return "--";

  const d =
    new Date(value);

  if(isNaN(d.getTime())){
    return "--";
  }

  return d.toLocaleDateString(
    "en-US",
    {
      year:"numeric",
      month:"short",
      day:"numeric"
    }
  );

}

function toInputDate(value){

  if(!value) return "";

  const d =
    new Date(value);

  if(isNaN(d.getTime())){
    return "";
  }

  return d.toISOString()
    .split("T")[0];

}

function getStatusClass(status){

  const s =
    String(status || "")
      .toUpperCase();

  if(s === "PAST_DUE"){
    return "status-past";
  }

  if(s === "SUSPENDED"){
    return "status-suspended";
  }

  if(s === "PAID"){
    return "status-paid";
  }

  return "status-active";

}

async function safeJson(res){

  try{

    return await res.json();

  }catch(err){

    return {};

  }

}

/* =========================
   LOAD BILLING
========================= */

async function loadBilling(){

  try{

    container.innerHTML = `
      <tr>
        <td colspan="15" class="empty">
          Loading billing data...
        </td>
      </tr>
    `;

    const res =
      await fetch(
        "/api/admin/billing",
        {
          headers:{
            Authorization:
              "Bearer " + token
          }
        }
      );

    const data =
      await safeJson(res);

    if(!res.ok){

      throw new Error(
        data.message ||
        "Billing load failed"
      );

    }

    companies =
      Array.isArray(data)
        ? data
        : [];

    render(companies);

    updateStats(companies);

  }catch(err){

    console.log(err);

    container.innerHTML = `
      <tr>
        <td colspan="15" class="empty">
          Error loading companies
        </td>
      </tr>
    `;

  }

}

/* =========================
   UPDATE STATS
========================= */

function updateStats(list){

  const totalCompanies =
    list.length;

  const activeCompanies =
    list.filter(x =>
      x.billingStatus === "ACTIVE"
    ).length;

  const pastDueCompanies =
    list.filter(x =>
      x.billingStatus === "PAST_DUE"
    ).length;

  const lockedCompanies =
    list.filter(x =>
      x.billingLocked === true
    ).length;

  const totalRevenue =
    list.reduce((sum,c)=>{

      return sum + Number(
        c.revenue || 0
      );

    },0);

  const pendingPayments =
    list.reduce((sum,c)=>{

      return sum + Number(
        c.invoiceAmount || 0
      );

    },0);

  if(totalCompaniesEl){
    totalCompaniesEl.innerText =
      totalCompanies;
  }

  if(activeCompaniesEl){
    activeCompaniesEl.innerText =
      activeCompanies;
  }

  if(pastDueCompaniesEl){
    pastDueCompaniesEl.innerText =
      pastDueCompanies;
  }

  if(lockedCompaniesEl){
    lockedCompaniesEl.innerText =
      lockedCompanies;
  }

  if(totalRevenueEl){
    totalRevenueEl.innerText =
      money(totalRevenue);
  }

  if(pendingPaymentsEl){
    pendingPaymentsEl.innerText =
      money(pendingPayments);
  }

}

/* =========================
   RENDER TABLE
========================= */

function render(list){

  if(!list.length){

    container.innerHTML = `
      <tr>
        <td colspan="15" class="empty">
          No companies found
        </td>
      </tr>
    `;

    return;

  }

 container.innerHTML =
  list
    .filter(c => c)
    .map(c=>{

      return `

        <tr>

          <td>

            <div class="company-name">
              ${c.name || "--"}
            </div>

            <div class="company-small">
              ${c.email || "--"}
              <br>
              ${c.phone || "--"}
              <br>
              ${c.username || "--"}
            </div>

          </td>

          <td>

            <span class="
              badge
              ${getStatusClass(c.billingStatus)}
            ">
              ${c.billingStatus || "ACTIVE"}
            </span>

          </td>

          <td>

            ${formatDate(c.billingStartDate)}

            <br>

            →

            <br>

            ${formatDate(c.billingEndDate)}

          </td>

          <td>
            ${c.totalTrips || 0}
          </td>

          <td>
            ${c.individualTrips || 0}
          </td>

          <td>
            ${c.sharedTrips || 0}
          </td>

          <td>
            ${c.completedTrips || 0}
          </td>

          <td>
            ${c.noShowTrips || 0}
          </td>

          <td>
            ${c.cancelledTrips || 0}
          </td>

          <td>
            ${money(c.revenue)}
          </td>

          <td>
            <b>
              ${money(c.invoiceAmount)}
            </b>
          </td>

          <td>
            ${c.graceDays || 0} days
          </td>

          <td>
            ${formatDate(c.lastPaymentDate)}
          </td>

          <td>

            ${
              c.billingLocked

              ? `
                <span class="
                  badge
                  status-suspended
                ">
                  LOCKED
                </span>
              `

              : `
                <span class="
                  badge
                  status-active
                ">
                  OPEN
                </span>
              `
            }

          </td>

          <td class="actions">

            <div class="control-grid">

              <input
                type="date"
                class="small-input"
                id="start-${c._id}"
                value="${toInputDate(c.billingStartDate)}"
              >

              <input
                type="date"
                class="small-input"
                id="end-${c._id}"
                value="${toInputDate(c.billingEndDate)}"
              >

            </div>

            <div class="control-grid-3">

              <input
                type="number"
                class="small-input"
                placeholder="Grace"
                id="grace-${c._id}"
                value="${c.graceDays || 3}"
              >

              <input
                type="number"
                class="small-input"
                placeholder="Trips"
                id="trips-${c._id}"
                value="${c.totalTrips || 0}"
                readonly
              >

              <input
                type="text"
                class="small-input"
                value="${money(c.revenue)}"
                readonly
              >

            </div>

            <div class="btn-row">

              <button
                class="btn btn-blue"
                onclick="generateInvoice('${c._id}')"
              >
                Generate
              </button>

              <button
                class="btn btn-dark"
                onclick="openInvoice('${c._id}')"
              >
                Invoice
              </button>

              <button
                class="btn btn-red"
                onclick="lockCompany('${c._id}')"
              >
                Lock
              </button>

              <button
                class="btn btn-green"
                onclick="unlockCompany('${c._id}')"
              >
                Unlock
              </button>

              <button
                class="btn btn-yellow"
                onclick="markPaid('${c._id}')"
              >
                Paid
              </button>

            </div>

          </td>

        </tr>

      `;

    }).join("");

}

/* =========================
   GENERATE INVOICE
========================= */

async function generateInvoice(id){

  try{

    const startInput =
      document.getElementById(
        `start-${id}`
      );

    const endInput =
      document.getElementById(
        `end-${id}`
      );

    const graceInput =
      document.getElementById(
        `grace-${id}`
      );

    const start =
      startInput
        ? startInput.value
        : "";

    const end =
      endInput
        ? endInput.value
        : "";

    const grace =
      graceInput
        ? graceInput.value
        : 3;

    if(!start || !end){

      alert(
        "Please select billing start and end dates."
      );

      return;

    }

    const confirmGenerate =
      confirm(
        "Generate invoice from real revenue for this billing period?"
      );

    if(!confirmGenerate){
      return;
    }

    const res =
      await fetch(
        `/api/admin/generate-invoice/${id}`,
        {
          method:"PUT",

          headers:{
            "Content-Type":
              "application/json",

            Authorization:
              "Bearer " + token
          },

          body:JSON.stringify({

            billingStartDate:
              start,

            billingEndDate:
              end,

            graceDays:
              grace

          })
        }
      );

    const data =
      await safeJson(res);

    if(!res.ok){

      throw new Error(
        data.message ||
        "Invoice error"
      );

    }

    alert(
      "Invoice generated successfully"
    );

    await loadBilling();

  }catch(err){

    console.log(err);

    alert(
      err.message ||
      "Generate failed"
    );

  }

}

/* =========================
   OPEN INVOICE PAGE
========================= */

function openInvoice(id){

  window.open(
    `/admin/invoice.html?id=${encodeURIComponent(id)}`,
    "_blank"
  );

}

/* =========================
   LOCK
========================= */

async function lockCompany(id){

  try{

    const ok =
      confirm(
        "Are you sure you want to lock this company?"
      );

    if(!ok) return;

    const res =
      await fetch(
        `/api/admin/billing/${id}/lock`,
        {
          method:"PUT",

          headers:{
            Authorization:
              "Bearer " + token
          }
        }
      );

    const data =
      await safeJson(res);

    if(!res.ok){

      throw new Error(
        data.message ||
        "Lock failed"
      );

    }

    alert(
      "Company locked"
    );

    await loadBilling();

  }catch(err){

    console.log(err);

    alert(
      err.message ||
      "Lock failed"
    );

  }

}

/* =========================
   UNLOCK
========================= */

async function unlockCompany(id){

  try{

    const res =
      await fetch(
        `/api/admin/billing/${id}/unlock`,
        {
          method:"PUT",

          headers:{
            Authorization:
              "Bearer " + token
          }
        }
      );

    const data =
      await safeJson(res);

    if(!res.ok){

      throw new Error(
        data.message ||
        "Unlock failed"
      );

    }

    alert(
      "Company unlocked"
    );

    await loadBilling();

  }catch(err){

    console.log(err);

    alert(
      err.message ||
      "Unlock failed"
    );

  }

}

/* =========================
   MARK PAID
========================= */

async function markPaid(id){

  try{

    const ok =
      confirm(
        "Mark this invoice as paid?"
      );

    if(!ok) return;

    const res =
      await fetch(
        `/api/admin/billing/${id}/mark-paid`,
        {
          method:"PUT",

          headers:{
            Authorization:
              "Bearer " + token
          }
        }
      );

    const data =
      await safeJson(res);

    if(!res.ok){

      throw new Error(
        data.message ||
        "Payment failed"
      );

    }

    alert(
      "Payment marked successfully"
    );

    await loadBilling();

  }catch(err){

    console.log(err);

    alert(
      err.message ||
      "Payment failed"
    );

  }

}

/* =========================
   CONNECT STRIPE FOR COMPANY
========================= */

async function connectCompanyStripe(id){

  try{

    const res =
      await fetch(
        `/api/admin/billing/${id}/connect-stripe`,
        {
          method:"POST",

          headers:{
            Authorization:
              "Bearer " + token
          }
        }
      );

    const data =
      await safeJson(res);

    if(!res.ok){

      throw new Error(
        data.message ||
        "Stripe connect failed"
      );

    }

    if(!data.url){

      throw new Error(
        "Stripe URL not returned"
      );

    }

    window.location.href =
      data.url;

  }catch(err){

    console.log(err);

    alert(
      err.message ||
      "Stripe connect failed"
    );

  }

}

/* =========================
   FILTERS
========================= */

function applyFilters(){

  let list =
    [...companies];

  const search =
    searchInput
      ? searchInput.value
        .toLowerCase()
        .trim()
      : "";

  const status =
    statusFilter
      ? statusFilter.value
      : "";

  const month =
    monthFilter
      ? monthFilter.value
      : "";

  const year =
    yearFilter
      ? yearFilter.value
      : "";

  if(search){

    list =
      list.filter(company => {

        const text = `
${company?.name || ""}
${company?.email || ""}
${company?.phone || ""}
${company?.username || ""}
`
.toLowerCase();

        return text.includes(search);

      });

  }

  if(status){

    list =
      list.filter(company =>
        company.billingStatus === status
      );

  }

  if(month){

    list =
      list.filter(company => {

        if(!company.billingStartDate){
          return false;
        }

        const d =
          new Date(
            company.billingStartDate
          );

        return (
          d.getMonth() + 1
        ) == month;

      });

  }

  if(year){

    list =
      list.filter(company => {

        if(!company.billingStartDate){
          return false;
        }

        const d =
          new Date(
            company.billingStartDate
          );

        return (
          d.getFullYear()
        ) == year;

      });

  }

  render(list);

  updateStats(list);

}

/* =========================
   STRIPE BUTTONS
========================= */

if(connectStripeBtn){

  connectStripeBtn.addEventListener(
    "click",
    async ()=>{

      try{

        const companyName =
          prompt(
            "Enter company name"
          );

        if(!companyName) return;

        const res =
          await fetch(
            "/api/company/connect-stripe",
            {
              method:"POST",

              headers:{
                Authorization:
                  "Bearer " + token,

                "Content-Type":
                  "application/json"
              },

              body:JSON.stringify({
                company:companyName
              })
            }
          );

        const data =
          await safeJson(res);

        if(!res.ok){

          throw new Error(
            data.message ||
            "Stripe connect failed"
          );

        }

        if(data.url){

          window.open(
            data.url,
            "_blank"
          );

        }

      }catch(err){

        console.log(err);

        alert(
          err.message ||
          "Stripe connect failed"
        );

      }

    }
  );

}

if(openStripeBtn){

  openStripeBtn.addEventListener(
    "click",
    ()=>{

      window.open(
        "https://dashboard.stripe.com",
        "_blank"
      );

    }
  );

}

/* =========================
   EVENTS
========================= */

if(searchInput){

  searchInput.addEventListener(
    "input",
    applyFilters
  );

}

if(statusFilter){

  statusFilter.addEventListener(
    "change",
    applyFilters
  );

}

if(monthFilter){

  monthFilter.addEventListener(
    "change",
    applyFilters
  );

}

if(yearFilter){

  yearFilter.addEventListener(
    "input",
    applyFilters
  );

}

/* =========================
   INIT
========================= */

loadBilling();