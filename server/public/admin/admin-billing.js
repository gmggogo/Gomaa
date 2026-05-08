const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "/admin/login.html";
}

/* =========================
   ELEMENTS
========================= */

const container = document.getElementById("billingContainer");

const totalCompaniesEl = document.getElementById("totalCompanies");
const activeCompaniesEl = document.getElementById("activeCompanies");
const pastDueCompaniesEl = document.getElementById("pastDueCompanies");
const suspendedCompaniesEl = document.getElementById("suspendedCompanies");

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");

const connectStripeBtn = document.getElementById("connectStripeBtn");

/* =========================
   DATA
========================= */

let allCompanies = [];

/* =========================
   STRIPE CONNECT
========================= */

if (connectStripeBtn) {
  connectStripeBtn.addEventListener("click", async () => {
    try {
      connectStripeBtn.disabled = true;
      connectStripeBtn.innerText = "Connecting...";

      const res = await fetch("/api/company/connect-stripe", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token
        }
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Stripe error");

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      alert("No Stripe URL returned");

    } catch (err) {
      console.log(err);
      alert(err.message || "Stripe failed");

      connectStripeBtn.disabled = false;
      connectStripeBtn.innerText = "Connect Stripe Platform";
    }
  });
}

/* =========================
   LOAD BILLING
========================= */

async function loadBilling() {
  try {
    const res = await fetch("/api/admin/billing", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json();

    allCompanies = Array.isArray(data) ? data : [];

    updateCounters(allCompanies);
    renderCompanies(allCompanies);

  } catch (err) {
    console.log(err);

    container.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;padding:20px;">
          Error loading billing data
        </td>
      </tr>
    `;
  }
}

/* =========================
   COUNTERS
========================= */

function updateCounters(companies) {
  if (totalCompaniesEl)
    totalCompaniesEl.innerText = companies.length;

  if (activeCompaniesEl)
    activeCompaniesEl.innerText =
      companies.filter(c => c.billingStatus === "ACTIVE").length;

  if (pastDueCompaniesEl)
    pastDueCompaniesEl.innerText =
      companies.filter(c => c.billingStatus === "PAST_DUE").length;

  if (suspendedCompaniesEl)
    suspendedCompaniesEl.innerText =
      companies.filter(c => c.billingStatus === "SUSPENDED").length;
}

/* =========================
   FORMAT HELPERS
========================= */

function formatDate(d) {
  if (!d) return "--";
  return new Date(d).toLocaleDateString("en-US");
}

function formatMoney(v) {
  return "$" + Number(v || 0).toFixed(2);
}

/* =========================
   RENDER TABLE
========================= */

function renderCompanies(companies) {
  if (!companies.length) {
    container.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;padding:20px;">
          No companies found
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = companies.map(c => {

    let statusClass = "status-active";

    if (c.billingStatus === "PAST_DUE") statusClass = "status-past";
    if (c.billingStatus === "SUSPENDED") statusClass = "status-suspended";

    const period =
      c.billingStartDate && c.billingEndDate
        ? `${formatDate(c.billingStartDate)} → ${formatDate(c.billingEndDate)}`
        : "--";

    const grace = c.graceDays ?? 0;

    return `
      <tr>

        <!-- COMPANY -->
        <td>
          <b>${c.name || "-"}</b>
          <div style="font-size:12px;color:#64748b;margin-top:5px;">
            ${c.username || ""}
          </div>
        </td>

        <!-- STATUS -->
        <td>
          <span class="${statusClass}">
            ${c.billingStatus || "ACTIVE"}
          </span>
        </td>

        <!-- CYCLE -->
        <td>
          ${c.billingCycle || "MONTHLY"}
        </td>

        <!-- INVOICE -->
        <td>
          ${formatMoney(c.invoiceAmount)}
        </td>

        <!-- PERIOD -->
        <td>
          ${period}
        </td>

        <!-- GRACE -->
        <td>
          ${grace} days
        </td>

        <!-- NEXT BILLING -->
        <td>
          ${formatDate(c.nextBillingDate)}
        </td>

        <!-- LOCK -->
        <td>
          ${c.billingLocked ? "🔴 LOCKED" : "🟢 ACTIVE"}
        </td>

        <!-- ACTIONS -->
        <td>

          ${
            c.billingLocked
              ? `<button class="btn btn-unlock" onclick="unlockCompany('${c._id}')">Unlock</button>`
              : `<button class="btn btn-lock" onclick="lockCompany('${c._id}')">Lock</button>`
          }

          <button class="btn btn-paid" onclick="markPaid('${c._id}')">
            Mark Paid
          </button>

        </td>

      </tr>
    `;

  }).join("");
}

/* =========================
   FILTER
========================= */

function applyFilters() {
  let list = [...allCompanies];

  const search = (searchInput?.value || "").toLowerCase();
  const status = statusFilter?.value || "";

  if (search) {
    list = list.filter(c =>
      (c.name || "").toLowerCase().includes(search) ||
      (c.username || "").toLowerCase().includes(search)
    );
  }

  if (status) {
    list = list.filter(c => c.billingStatus === status);
  }

  // ترتيب مهم
  list.sort((a, b) => {
    const order = { SUSPENDED: 1, PAST_DUE: 2, ACTIVE: 3 };
    return (order[a.billingStatus] || 3) - (order[b.billingStatus] || 3);
  });

  renderCompanies(list);
}

/* =========================
   ACTIONS
========================= */

async function lockCompany(id) {
  await fetch(`/api/admin/billing/${id}/lock`, {
    method: "PUT",
    headers: { Authorization: "Bearer " + token }
  });

  loadBilling();
}

async function unlockCompany(id) {
  await fetch(`/api/admin/billing/${id}/unlock`, {
    method: "PUT",
    headers: { Authorization: "Bearer " + token }
  });

  loadBilling();
}

async function markPaid(id) {
  await fetch(`/api/admin/billing/${id}/mark-paid`, {
    method: "PUT",
    headers: { Authorization: "Bearer " + token }
  });

  loadBilling();
}

/* =========================
   BILLING SETTINGS SAVE
========================= */

async function saveBillingSettingsToServer() {
  const billingCycle = document.getElementById("billingCycle").value;
  const billingDuration = Number(document.getElementById("billingDuration").value || 30);
  const graceDays = Number(document.getElementById("graceDays").value || 3);

  try {
    const res = await fetch("/api/admin/billing/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({
        billingCycle,
        billingDuration,
        graceDays
      })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.message || "Save failed");

    alert("Billing settings saved ✅");

    loadBilling();

  } catch (err) {
    console.log(err);
    alert(err.message || "Error saving settings");
  }
}

/* =========================
   EVENTS
========================= */

if (searchInput) searchInput.addEventListener("input", applyFilters);
if (statusFilter) statusFilter.addEventListener("change", applyFilters);

/* =========================
   INIT
========================= */

loadBilling();