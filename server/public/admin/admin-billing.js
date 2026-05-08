const token = localStorage.getItem("token");

if(!token){
  window.location.href = "/admin/login.html";
}

const container =
  document.getElementById(
    "billingContainer"
  );

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

const suspendedCompaniesEl =
  document.getElementById(
    "suspendedCompanies"
  );

const searchInput =
  document.getElementById(
    "searchInput"
  );

const statusFilter =
  document.getElementById(
    "statusFilter"
  );

/* =========================
   STRIPE PLATFORM CONNECT
========================= */

const connectStripeBtn =
  document.getElementById(
    "connectStripeBtn"
  );

if(connectStripeBtn){

  connectStripeBtn.addEventListener(
    "click",
    async ()=>{

      try{

        connectStripeBtn.disabled =
          true;

        connectStripeBtn.innerText =
          "Connecting...";

        const res = await fetch(
          "/api/company/connect-stripe",
          {
            method:"POST",

            headers:{
              Authorization:
                "Bearer " + token
            }
          }
        );

        const data =
          await res.json();

        if(!res.ok){

          throw new Error(
            data.message ||
            "Stripe connect failed"
          );

        }

        if(data.url){

          window.location.href =
            data.url;

          return;
        }

        alert(
          "No Stripe URL returned."
        );

      }catch(err){

        console.log(err);

        alert(
          err.message ||
          "Stripe connect failed"
        );

        connectStripeBtn.disabled =
          false;

        connectStripeBtn.innerText =
          "Connect Stripe Platform";

      }

    }
  );

}

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
          Authorization:
            "Bearer " + token
        }
      }
    );

    const companies =
      await res.json();

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

  if(totalCompaniesEl){

    totalCompaniesEl.innerText =
      companies.length;

  }

  if(activeCompaniesEl){

    activeCompaniesEl.innerText =
      companies.filter(
        c =>
          c.billingStatus ===
          "ACTIVE"
      ).length;

  }

  if(pastDueCompaniesEl){

    pastDueCompaniesEl.innerText =
      companies.filter(
        c =>
          c.billingStatus ===
          "PAST_DUE"
      ).length;

  }

  if(suspendedCompaniesEl){

    suspendedCompaniesEl.innerText =
      companies.filter(
        c =>
          c.billingStatus ===
          "SUSPENDED"
      ).length;

  }

}

/* =========================
   RENDER
========================= */

function renderCompanies(companies){

  if(
    !Array.isArray(companies) ||
    !companies.length
  ){

    container.innerHTML = `
      <tr>
        <td colspan="8" class="empty">
          No companies found
        </td>
      </tr>
    `;

    return;
  }

  container.innerHTML =
    companies.map(company=>{

      let statusClass =
        "status-active";

      if(
        company.billingStatus ===
        "PAST_DUE"
      ){

        statusClass =
          "status-past";

      }

      if(
        company.billingStatus ===
        "SUSPENDED"
      ){

        statusClass =
          "status-suspended";

      }

      return `

        <tr>

          <!-- COMPANY -->

          <td>

            <div class="company-name">

              ${company.name || "-"}

            </div>

            <div class="company-info">

              Status:
              <span class="${statusClass}">
                ${
                  company.billingStatus ||
                  "ACTIVE"
                }
              </span>

              <br>

              Phone:
              ${
                company.phone || "--"
              }

              <br>

              Username:
              ${
                company.username || "--"
              }

              <br>

              Locked:
              ${
                company.billingLocked
                  ? "YES"
                  : "NO"
              }

            </div>

          </td>

          <!-- STATUS -->

          <td>

            <span class="status ${statusClass}">

              ${
                company.billingStatus ||
                "ACTIVE"
              }

            </span>

          </td>

          <!-- CYCLE -->

          <td>

            ${
              company.billingCycle ||
              "MONTHLY"
            }

          </td>

          <!-- INVOICE -->

          <td>

            ${formatMoney(
              company.invoiceAmount
            )}

          </td>

          <!-- NEXT BILLING -->

          <td>

            ${formatDate(
              company.nextBillingDate
            )}

          </td>

          <!-- ACTIONS -->

          <td>

            ${
              company.billingLocked

              ? `

                <button
                  class="action-btn btn-unlock"
                  onclick="unlockCompany('${company._id}')">

                  Unlock

                </button>

              `

              : `

                <button
                  class="action-btn btn-lock"
                  onclick="lockCompany('${company._id}')">

                  Lock

                </button>

              `
            }

            <button
              class="action-btn"
              style="
                background:#2563eb;
                color:#fff;
                margin-left:8px;
              "
              onclick="markPaid('${company._id}')">

              Mark Paid

            </button>

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
    String(
      searchInput?.value || ""
    )
    .toLowerCase()
    .trim();

  const status =
    String(
      statusFilter?.value || ""
    );

  let filtered =
    [...allCompanies];

  if(search){

    filtered =
      filtered.filter(c=>{

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

    filtered =
      filtered.filter(
        c =>
          c.billingStatus ===
          status
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
          Authorization:
            "Bearer " + token
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
          Authorization:
            "Bearer " + token
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
          Authorization:
            "Bearer " + token
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

/* =========================
   INIT
========================= */

loadBilling();