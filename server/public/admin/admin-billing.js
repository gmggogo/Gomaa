/* =========================
   AUTH
========================= */

const token = localStorage.getItem("token");

if(!token){
  window.location.href = "/admin/login.html";
}

/* =========================
   ELEMENTS
========================= */

const container =
  document.getElementById("billingContainer");

const totalEl =
  document.getElementById("totalCompanies");

const activeEl =
  document.getElementById("activeCompanies");

const pastDueEl =
  document.getElementById("pastDueCompanies");

const suspendedEl =
  document.getElementById("suspendedCompanies");

const search =
  document.getElementById("searchInput");

const filter =
  document.getElementById("statusFilter");

const connectStripeBtn =
  document.getElementById("connectStripeBtn");

/* =========================
   DATA
========================= */

let companies = [];

/* =========================
   HELPERS
========================= */

function formatDate(d){

  if(!d) return "--";

  const date = new Date(d);

  if(isNaN(date.getTime())) return "--";

  return date.toLocaleDateString(
    "en-US",
    {
      year:"numeric",
      month:"short",
      day:"numeric"
    }
  );

}

function money(v){
  return "$" + Number(v || 0).toFixed(2);
}

function getDaysClass(days){

  if(days <= 3) return "days-danger";

  if(days <= 7) return "days-warning";

  return "days-good";

}

function getProgressColor(days){

  if(days <= 3) return "#dc2626";

  if(days <= 7) return "#ca8a04";

  return "#16a34a";

}

function getStatusClass(status){

  if(status === "PAST_DUE"){
    return "status-past";
  }

  if(status === "SUSPENDED"){
    return "status-suspended";
  }

  return "status-active";

}

/* =========================
   LOAD
========================= */

async function load(){

  try{

    const res = await fetch(
      "/api/admin/billing",
      {
        headers:{
          Authorization:"Bearer " + token
        }
      }
    );

    const data = await res.json();

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
        <td colspan="13" class="empty">
          Error loading data
        </td>
      </tr>
    `;

  }

}

/* =========================
   STATS
========================= */

function updateStats(list){

  totalEl.innerText =
    list.length;

  activeEl.innerText =
    list.filter(
      x => x.billingStatus === "ACTIVE"
    ).length;

  pastDueEl.innerText =
    list.filter(
      x => x.billingStatus === "PAST_DUE"
    ).length;

  suspendedEl.innerText =
    list.filter(
      x => x.billingStatus === "SUSPENDED"
    ).length;

}

/* =========================
   RENDER
========================= */

function render(list){

  if(!list.length){

    container.innerHTML = `
      <tr>
        <td colspan="13" class="empty">
          No companies found
        </td>
      </tr>
    `;

    return;
  }

  container.innerHTML = list.map(c => {

    const days =
      Number(c.daysLeft || 0);

    const progress =
      Math.max(
        0,
        Math.min(
          100,
          (days / 30) * 100
        )
      );

    return `

      <tr>

        <td>

          <div class="company-name">
            ${c.name || "--"}
          </div>

          <div class="company-small">

            Username:
            ${c.username || "--"}

            <br>

            Email:
            ${c.email || "--"}

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
          ${c.billingCycle || "MONTHLY"}
        </td>

        <td>
          ${money(c.invoiceAmount)}
        </td>

        <td>
          ${formatDate(c.billingStartDate)}
        </td>

        <td>
          ${formatDate(c.billingEndDate)}
        </td>

        <td>
          ${formatDate(c.nextBillingDate)}
        </td>

        <td>
          ${formatDate(c.lastPaymentDate)}
        </td>

        <td>

          <div class="${getDaysClass(days)}">
            ${days}
          </div>

          <div class="progress">

            <div
              class="progress-bar"
              style="
                width:${progress}%;
                background:${getProgressColor(days)};
              "
            ></div>

          </div>

        </td>

        <td>
          ${c.graceDays || 0} Days
        </td>

        <td>

          ${
            c.billingLocked
            ? `
              <span class="badge status-suspended">
                LOCKED
              </span>
            `
            : `
              <span class="badge status-active">
                OPEN
              </span>
            `
          }

        </td>

        <td>
          ${c.billingNotes || "--"}
        </td>

        <td>

          <div class="actions">

            <input
              type="date"
              class="date-input"
              id="start-${c._id}"
            >

            <input
              type="date"
              class="date-input"
              id="end-${c._id}"
            >

            <div class="btn-row">

              <button
                class="btn save"
                onclick="saveBilling('${c._id}')"
              >
                Save
              </button>

              <button
                class="btn lock"
                onclick="lockCompany('${c._id}')"
              >
                Lock
              </button>

              <button
                class="btn unlock"
                onclick="unlockCompany('${c._id}')"
              >
                Unlock
              </button>

            </div>

          </div>

        </td>

      </tr>

    `;

  }).join("");

}

/* =========================
   FILTERS
========================= */

function applyFilters(){

  let list = [...companies];

  const s =
    search.value
      .toLowerCase()
      .trim();

  const f =
    filter.value;

  if(s){

    list = list.filter(x =>

      String(x.name || "")
        .toLowerCase()
        .includes(s)

      ||

      String(x.username || "")
        .toLowerCase()
        .includes(s)

      ||

      String(x.email || "")
        .toLowerCase()
        .includes(s)

    );

  }

  if(f){

    list = list.filter(
      x => x.billingStatus === f
    );

  }

  render(list);

}

/* =========================
   SAVE BILLING DATES
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

    if(!start || !end){

      alert(
        "Please select dates"
      );

      return;
    }

    const res = await fetch(
      `/api/admin/billing/${id}/dates`,
      {
        method:"PUT",

        headers:{
          "Content-Type":"application/json",
          Authorization:"Bearer " + token
        },

        body:JSON.stringify({
          billingStartDate:start,
          billingEndDate:end
        })
      }
    );

    const data = await res.json();

    if(!res.ok){

      throw new Error(
        data.message ||
        "Save failed"
      );

    }

    load();

  }catch(err){

    console.log(err);

    alert(
      err.message ||
      "Save failed"
    );

  }

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

    load();

  }catch(err){

    console.log(err);

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

    load();

  }catch(err){

    console.log(err);

  }

}

/* =========================
   STRIPE
========================= */

async function connectStripe(){

  try{

    const company =
      prompt(
        "Enter Company Name"
      );

    if(!company) return;

    const res = await fetch(
      "/api/company/connect-stripe",
      {
        method:"POST",

        headers:{
          "Content-Type":"application/json",
          Authorization:"Bearer " + token
        },

        body:JSON.stringify({
          company
        })
      }
    );

    const data = await res.json();

    if(data.url){

      window.location.href =
        data.url;

    }else{

      alert(
        data.message ||
        "Stripe error"
      );

    }

  }catch(err){

    console.log(err);

    alert(
      "Stripe connection failed"
    );

  }

}

/* =========================
   EVENTS
========================= */

search.addEventListener(
  "input",
  applyFilters
);

filter.addEventListener(
  "change",
  applyFilters
);

connectStripeBtn.addEventListener(
  "click",
  connectStripe
);

/* =========================
   INIT
========================= */

load();