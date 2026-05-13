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

const searchInput =
  document.getElementById("searchInput");

const statusFilter =
  document.getElementById("statusFilter");

const monthFilter =
  document.getElementById("monthFilter");

const yearFilter =
  document.getElementById("yearFilter");

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
    Number(value || 0)
      .toFixed(2);

}

/* =========================
   ARIZONA DATE HELPERS
========================= */

function getArizonaDate(value){

  if(!value) return null;

  return new Date(
    new Date(value).toLocaleString(
      "en-US",
      {
        timeZone:"America/Phoenix"
      }
    )
  );

}

function formatDate(value){

  if(!value) return "--";

  const d =
    getArizonaDate(value);

  if(!d || isNaN(d.getTime())){
    return "--";
  }

  return d.toLocaleDateString(
    "en-US",
    {
      year:"numeric",
      month:"short",
      day:"numeric",
      timeZone:"America/Phoenix"
    }
  );

}

function toInputDate(value){

  if(!value) return "";

  const d =
    getArizonaDate(value);

  if(!d || isNaN(d.getTime())){
    return "";
  }

  const year =
    d.getFullYear();

  const month =
    String(d.getMonth() + 1)
      .padStart(2,"0");

  const day =
    String(d.getDate())
      .padStart(2,"0");

  return `${year}-${month}-${day}`;

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
      <div class="empty">
        Loading billing...
      </div>
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

  }catch(err){

    console.log(err);

    container.innerHTML = `
      <div class="empty">
        Error loading companies
      </div>
    `;

  }

}

/* =========================
   RENDER
========================= */

function render(list){

  if(!list.length){

    container.innerHTML = `
      <div class="empty">
        No companies found
      </div>
    `;

    return;

  }

  container.innerHTML =
    list.map(c=>{

      return `

        <div class="company-card">

          <!-- TOP -->

          <div class="company-top">

            <div class="company-box">

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

            </div>

            <div>

              ${
                c.billingLocked

                ? `
                  <span class="badge locked">
                    LOCKED
                  </span>
                `

                : `
                  <span class="badge active">
                    ACTIVE
                  </span>
                `
              }

            </div>

          </div>

          <!-- STATS -->

          <div class="stats-grid">

            <div class="stat-box">
              <div class="stat-label">
                Trips
              </div>
              <div class="stat-value">
                ${c.totalTrips || 0}
              </div>
            </div>

            <div class="stat-box">
              <div class="stat-label">
                Completed
              </div>
              <div class="stat-value">
                ${c.completedTrips || 0}
              </div>
            </div>

            <div class="stat-box">
              <div class="stat-label">
                Shared
              </div>
              <div class="stat-value">
                ${c.sharedTrips || 0}
              </div>
            </div>

            <div class="stat-box">
              <div class="stat-label">
                No Show
              </div>
              <div class="stat-value">
                ${c.noShowTrips || 0}
              </div>
            </div>

            <div class="stat-box">
              <div class="stat-label">
                Revenue
              </div>
              <div class="stat-value">
                ${money(c.revenue)}
              </div>
            </div>

            <div class="stat-box">
              <div class="stat-label">
                Invoice
              </div>
              <div class="stat-value">
                ${money(c.invoiceAmount)}
              </div>
            </div>

          </div>

          <!-- BILLING -->

          <div class="billing-grid">

            <div class="field">

              <label>
                Billing Start
              </label>

              <input
                type="date"
                class="small-input"
                id="start-${c._id}"
                value="${toInputDate(c.billingStartDate)}"
                disabled
              >

            </div>

            <div class="field">

              <label>
                Billing End
              </label>

              <input
                type="date"
                class="small-input"
                id="end-${c._id}"
                value="${toInputDate(c.billingEndDate)}"
                disabled
              >

            </div>

            <div class="field">

              <label>
                Grace Days
              </label>

              <input
                type="number"
                class="small-input"
                id="grace-${c._id}"
                value="${c.graceDays || 3}"
                disabled
              >

            </div>

            <div class="field">

              <label>
                Last Payment
              </label>

              <input
                type="text"
                class="small-input"
                value="${formatDate(c.lastPaymentDate)}"
                disabled
              >

            </div>

          </div>

          <!-- BUTTONS -->

          <div class="btn-row">

            <button
              class="btn btn-blue"
              onclick="editBilling('${c._id}')"
              id="editBtn-${c._id}"
            >
              Edit
            </button>

            <button
              class="btn btn-green"
              onclick="saveBilling('${c._id}')"
              id="saveBtn-${c._id}"
              style="display:none;"
            >
              Save
            </button>

            <button
              class="btn btn-dark"
              onclick="openInvoice('${c._id}')"
            >
              Open Invoice
            </button>

            <button
              class="btn btn-yellow"
              onclick="markPaid('${c._id}')"
            >
              Mark Paid
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

          </div>

        </div>

      `;

    }).join("");

}

/* =========================
   EDIT
========================= */

function editBilling(id){

  document.getElementById(
    `start-${id}`
  ).disabled = false;

  document.getElementById(
    `end-${id}`
  ).disabled = false;

  document.getElementById(
    `grace-${id}`
  ).disabled = false;

  document.getElementById(
    `editBtn-${id}`
  ).style.display = "none";

  document.getElementById(
    `saveBtn-${id}`
  ).style.display = "inline-flex";

}

/* =========================
   SAVE
========================= */

async function saveBilling(id){

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

    if(!start || !end){

      alert(
        "Please select dates"
      );

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

            billingStartDate:start,

            billingEndDate:end,

            graceDays:grace

          })
        }
      );

    const data =
      await safeJson(res);

    if(!res.ok){

      throw new Error(
        data.message ||
        "Save failed"
      );

    }

    document.getElementById(
      `start-${id}`
    ).disabled = true;

    document.getElementById(
      `end-${id}`
    ).disabled = true;

    document.getElementById(
      `grace-${id}`
    ).disabled = true;

    document.getElementById(
      `editBtn-${id}`
    ).style.display = "inline-flex";

    document.getElementById(
      `saveBtn-${id}`
    ).style.display = "none";

    alert("Saved");

    await loadBilling();

  }catch(err){

    console.log(err);

    alert(
      err.message ||
      "Save failed"
    );

  }

}

/* =========================
   OPEN INVOICE
========================= */

function openInvoice(id){

  window.open(
    `/admin/invoice.html?id=${id}`,
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
      await safeJson(res);

    if(!res.ok){

      throw new Error(
        data.message ||
        "Lock failed"
      );

    }

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

    const company =
      companies.find(c => c._id === id);

    if(!company){
      return;
    }

    const ok = confirm(

      `Mark invoice as PAID?\n\n` +

      `Company: ${company.name}\n` +

      `Invoice Amount: ${money(company.invoiceAmount)}\n\n` +

      `This will:\n\n` +

      `• Reset invoice to $0\n` +
      `• Unlock company\n` +
      `• Start new billing cycle\n` +
      `• Reset current billing stats\n\n` +

      `Continue?`

    );

    if(!ok){
      return;
    }

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
      "Invoice marked as PAID successfully"
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
   FILTERS
========================= */

function applyFilters(){

  let list =
    [...companies];

  const search =
    searchInput.value
      .toLowerCase()
      .trim();

  const status =
    statusFilter.value;

  const month =
    monthFilter.value;

  const year =
    yearFilter.value;

  if(search){

    list =
      list.filter(c=>{

        const text = `
          ${c.name || ""}
          ${c.email || ""}
          ${c.phone || ""}
          ${c.username || ""}
        `
        .toLowerCase();

        return text.includes(search);

      });

  }

  if(status){

    list =
      list.filter(c=>
        c.billingStatus === status
      );

  }

  if(month){

    list =
      list.filter(c=>{

        if(!c.billingStartDate){
          return false;
        }

        const d =
          new Date(c.billingStartDate);

        return (
          d.getMonth() + 1
        ) == month;

      });

  }

  if(year){

    list =
      list.filter(c=>{

        if(!c.billingStartDate){
          return false;
        }

        const d =
          new Date(c.billingStartDate);

        return (
          d.getFullYear()
        ) == year;

      });

  }

  render(list);

}

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