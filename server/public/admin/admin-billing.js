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
  document.getElementById(
    "billingContainer"
  );

const historyContainer =
  document.getElementById(
    "historyContainer"
  );

const searchInput =
  document.getElementById(
    "searchInput"
  );

const statusFilter =
  document.getElementById(
    "statusFilter"
  );

const monthFilter =
  document.getElementById(
    "monthFilter"
  );

const yearFilter =
  document.getElementById(
    "yearFilter"
  );

const connectStripeBtn =
  document.getElementById(
    "connectStripeBtn"
  );

const openStripeBtn =
  document.getElementById(
    "openStripeBtn"
  );

/* STATS */

const totalCompaniesEl =
  document.getElementById(
    "totalCompanies"
  );

const activeCompaniesEl =
  document.getElementById(
    "activeCompanies"
  );

const pastDueCompaniesEl =
  document.getElementById(
    "pastDueCompanies"
  );

const lockedCompaniesEl =
  document.getElementById(
    "lockedCompanies"
  );

const totalRevenueEl =
  document.getElementById(
    "totalRevenue"
  );

const pendingPaymentsEl =
  document.getElementById(
    "pendingPayments"
  );

/* =========================
   DATA
========================= */

let companies = [];
let invoiceHistory = [];

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

months.forEach((m,i)=>{

  monthFilter.innerHTML += `
    <option value="${i+1}">
      ${m}
    </option>
  `;

});

/* =========================
   HELPERS
========================= */

function money(v){

  return "$" +
    Number(v || 0).toFixed(2);

}

function formatDate(v){

  if(!v) return "--";

  const d = new Date(v);

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

function getStatusClass(status){

  if(status === "PAST_DUE"){
    return "status-past";
  }

  if(status === "SUSPENDED"){
    return "status-suspended";
  }

  if(status === "PAID"){
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

  totalCompaniesEl.innerText =
    list.length;

  activeCompaniesEl.innerText =
    list.filter(
      x =>
        x.billingStatus ===
        "ACTIVE"
    ).length;

  pastDueCompaniesEl.innerText =
    list.filter(
      x =>
        x.billingStatus ===
        "PAST_DUE"
    ).length;

  lockedCompaniesEl.innerText =
    list.filter(
      x =>
        x.billingLocked === true
    ).length;

  const totalRevenue =
    list.reduce(
      (a,b)=>
        a +
        Number(
          b.revenue || 0
        ),
      0
    );

  totalRevenueEl.innerText =
    money(totalRevenue);

  const pending =
    list.reduce(
      (a,b)=>
        a +
        Number(
          b.invoiceAmount || 0
        ),
      0
    );

  pendingPaymentsEl.innerText =
    money(pending);

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
    list.map(c=>{

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

            ${c.graceDays || 0}
            days

          </td>

          <td>

            ${formatDate(
              c.lastPaymentDate
            )}

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
                value="${
                  c.billingStartDate
                  ? new Date(c.billingStartDate)
                    .toISOString()
                    .split("T")[0]
                  : ""
                }"
              >

              <input
                type="date"
                class="small-input"
                id="end-${c._id}"
                value="${
                  c.billingEndDate
                  ? new Date(c.billingEndDate)
                    .toISOString()
                    .split("T")[0]
                  : ""
                }"
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
                placeholder="Invoice"
                id="invoice-${c._id}"
                value="${c.invoiceAmount || 0}"
              >

              <input
                type="number"
                class="small-input"
                placeholder="Trips"
                id="trips-${c._id}"
                value="${c.totalTrips || 0}"
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

    const start =
      document.getElementById(
        `start-${id}`
      ).value;

    const end =
      document.getElementById(
        `end-${id}`
      ).value;

    const grace =
      document.getElementById(
        `grace-${id}`
      ).value;

    const invoice =
      document.getElementById(
        `invoice-${id}`
      ).value;

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

            billingStartDate:start,

            billingEndDate:end,

            graceDays:grace,

            invoiceAmount:invoice

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

    alert("Invoice generated");

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
      await res.json();

    if(!res.ok){

      alert(
        data.message ||
        "Lock failed"
      );

      return;

    }

    alert("Company locked");

    await loadBilling();

  }catch(err){

    console.log(err);

    alert("Lock failed");

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
      await res.json();

    if(!res.ok){

      alert(
        data.message ||
        "Unlock failed"
      );

      return;

    }

    alert("Company unlocked");

    await loadBilling();

  }catch(err){

    console.log(err);

    alert("Unlock failed");

  }

}

/* =========================
   MARK PAID
========================= */

async function markPaid(id){

  try{

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
      await res.json();

    if(!res.ok){

      alert(
        data.message ||
        "Payment failed"
      );

      return;

    }

    alert("Payment marked successfully");

    await loadBilling();

  }catch(err){

    console.log(err);

    alert("Payment failed");

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

  let list = [...companies];

  const s =
    searchInput.value
      .toLowerCase()
      .trim();

  const status =
    statusFilter.value;

  const month =
    monthFilter.value;

  const year =
    yearFilter.value;

  if(s){

    list =
      list.filter(x=>

        String(x.name || "")
          .toLowerCase()
          .includes(s)

      );

  }

  if(status){

    list =
      list.filter(
        x =>
          x.billingStatus === status
      );

  }

  if(month){

    list =
      list.filter(x=>{

        if(!x.billingStartDate){
          return false;
        }

        const d =
          new Date(
            x.billingStartDate
          );

        return (
          d.getMonth() + 1
        ) == month;

      });

  }

  if(year){

    list =
      list.filter(x=>{

        if(!x.billingStartDate){
          return false;
        }

        const d =
          new Date(
            x.billingStartDate
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

connectStripeBtn
.addEventListener(
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
        await res.json();

      if(!res.ok){

        alert(
          data.message ||
          "Stripe connect failed"
        );

        return;

      }

      if(data.url){

        window.open(
          data.url,
          "_blank"
        );

      }

    }catch(err){

      console.log(err);

      alert("Stripe connect failed");

    }

  }
);

openStripeBtn
.addEventListener(
  "click",
  ()=>{

    window.open(
      "https://dashboard.stripe.com",
      "_blank"
    );

  }
);

/* =========================
   EVENTS
========================= */

searchInput.addEventListener(
  "input",
  applyFilters
);

statusFilter.addEventListener(
  "change",
  applyFilters
);

monthFilter.addEventListener(
  "change",
  applyFilters
);

yearFilter.addEventListener(
  "input",
  applyFilters
);

/* =========================
   INIT
========================= */

loadBilling();