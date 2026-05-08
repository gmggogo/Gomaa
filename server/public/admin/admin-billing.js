const token = localStorage.getItem("token");

if(!token){
  window.location.href = "/admin/login.html";
}

const container = document.getElementById("billingContainer");

const totalCompaniesEl =
  document.getElementById("totalCompanies");

const activeCompaniesEl =
  document.getElementById("activeCompanies");

const pastDueCompaniesEl =
  document.getElementById("pastDueCompanies");

const suspendedCompaniesEl =
  document.getElementById("suspendedCompanies");

const searchInput =
  document.getElementById("searchInput");

const statusFilter =
  document.getElementById("statusFilter");

let allCompanies = [];

/* =========================
   HELPERS
========================= */

function formatDate(date){

  if(!date) return "--";

  try{
    return new Date(date)
      .toLocaleDateString("en-US");
  }catch{
    return "--";
  }

}

function formatMoney(value){

  return "$" +
    Number(value || 0).toFixed(2);

}

/* =========================
   LOAD BILLING
========================= */

async function loadBilling(){

  try{

    const res = await fetch(
      "/api/admin/billing",
      {
        headers:{
          Authorization:"Bearer " + token
        }
      }
    );

    const companies = await res.json();

    allCompanies =
      Array.isArray(companies)
        ? companies
        : [];

    updateCounters(allCompanies);

    renderCompanies(allCompanies);

  }catch(err){

    console.log(err);

    container.innerHTML = `
      <tr>
        <td colspan="8" class="empty">
          Error loading billing data
        </td>
      </tr>
    `;

  }

}

/* =========================
   COUNTERS
========================= */

function updateCounters(companies){

  totalCompaniesEl.innerText =
    companies.length;

  activeCompaniesEl.innerText =
    companies.filter(
      c => c.billingStatus === "ACTIVE"
    ).length;

  pastDueCompaniesEl.innerText =
    companies.filter(
      c => c.billingStatus === "PAST_DUE"
    ).length;

  suspendedCompaniesEl.innerText =
    companies.filter(
      c => c.billingStatus === "SUSPENDED"
    ).length;

}

/* =========================
   RENDER
========================= */

function renderCompanies(companies){

  if(!Array.isArray(companies) ||
     !companies.length){

    container.innerHTML = `
      <tr>
        <td colspan="8" class="empty">
          No companies found
        </td>
      </tr>
    `;

    return;
  }

  container.innerHTML = companies.map(company=>{

    let statusClass =
      "status-active";

    if(company.billingStatus === "PAST_DUE"){
      statusClass = "status-past";
    }

    if(company.billingStatus === "SUSPENDED"){
      statusClass = "status-suspended";
    }

    return `

      <tr>

        <!-- COMPANY -->
        <td>

          <div class="company-name">
            ${company.name || "-"}
          </div>

          <div class="company-small">

            Status:
            <span class="${statusClass}">
              ${company.billingStatus || "ACTIVE"}
            </span>

            <br>

            Phone:
            ${company.phone || "--"}

            <br>

            Username:
            ${company.username || "--"}

          </div>

        </td>

        <!-- STATUS -->
        <td>

          <span class="status-badge ${statusClass}">
            ${company.billingStatus || "ACTIVE"}
          </span>

        </td>

        <!-- CYCLE -->
        <td>
          ${company.billingCycle || "MONTHLY"}
        </td>

        <!-- INVOICE -->
        <td>

          <span class="amount">
            ${formatMoney(company.invoiceAmount)}
          </span>

        </td>

        <!-- NEXT BILLING -->
        <td>
          ${formatDate(company.nextBillingDate)}
        </td>

        <!-- LOCK -->
        <td>

          ${
            company.billingLocked

            ? `
              <span class="locked-yes">
                YES
              </span>
            `

            : `
              <span class="locked-no">
                NO
              </span>
            `
          }

        </td>

        <!-- NOTES -->
        <td>
          ${company.billingNotes || "--"}
        </td>

        <!-- ACTIONS -->
        <td>

          <div class="action-buttons">

            ${
              company.billingLocked

              ? `
                <button
                  class="btn btn-unlock"
                  onclick="unlockCompany('${company._id}')">
                  Unlock
                </button>
              `

              : `
                <button
                  class="btn btn-lock"
                  onclick="lockCompany('${company._id}')">
                  Lock
                </button>
              `
            }

            <button
              class="btn btn-paid"
              onclick="markPaid('${company._id}')">
              Mark Paid
            </button>

          </div>

        </td>

      </tr>

    `;

  }).join("");

}

/* =========================
   SEARCH + FILTER
========================= */

function applyFilters(){

  const search =
    String(searchInput.value || "")
    .toLowerCase()
    .trim();

  const status =
    String(statusFilter.value || "");

  let filtered =
    [...allCompanies];

  if(search){

    filtered = filtered.filter(c=>{

      return (
        String(c.name || "")
          .toLowerCase()
          .includes(search)

        ||

        String(c.username || "")
          .toLowerCase()
          .includes(search)
      );

    });

  }

  if(status){

    filtered = filtered.filter(
      c => c.billingStatus === status
    );

  }

  renderCompanies(filtered);

}

/* =========================
   LOCK
========================= */

async function lockCompany(id){

  try{

    await fetch(
      `/api/admin/billing/${id}/lock`,
      {
        method:"PUT",
        headers:{
          Authorization:"Bearer " + token
        }
      }
    );

    loadBilling();

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

    await fetch(
      `/api/admin/billing/${id}/unlock`,
      {
        method:"PUT",
        headers:{
          Authorization:"Bearer " + token
        }
      }
    );

    loadBilling();

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

    await fetch(
      `/api/admin/billing/${id}/mark-paid`,
      {
        method:"PUT",
        headers:{
          Authorization:"Bearer " + token
        }
      }
    );

    loadBilling();

  }catch(err){

    console.log(err);

    alert("Mark paid failed");

  }

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

/* =========================
   INIT
========================= */

loadBilling();