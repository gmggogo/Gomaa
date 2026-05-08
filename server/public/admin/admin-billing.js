/* =========================
   AUTH CHECK
========================= */

const token = localStorage.getItem("token");

if (!token) {
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

function formatDate(d) {
  if (!d) return "--";

  const date = new Date(d);

  if (isNaN(date.getTime())) return "--";

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function money(v) {
  return "$" + Number(v || 0).toFixed(2);
}

function safeText(v) {
  return String(v || "--");
}

function getDaysClass(days) {
  if (days <= 3) return "days-danger";
  if (days <= 7) return "days-warning";
  return "days-good";
}

function getProgressColor(days) {
  if (days <= 3) return "#dc2626";
  if (days <= 7) return "#ca8a04";
  return "#16a34a";
}

function getStatusClass(status) {
  if (status === "PAST_DUE") return "status-past";
  if (status === "SUSPENDED") return "status-suspended";
  return "status-active";
}

function getProgressPercent(c) {
  const daysLeft = Number(c.daysLeft || 0);

  let totalDays = 30;

  if (c.billingCycle === "WEEKLY") {
    totalDays = 7;
  }

  return Math.max(
    0,
    Math.min(100, (daysLeft / totalDays) * 100)
  );
}

/* =========================
   LOAD BILLING
========================= */

async function load() {
  try {
    container.innerHTML = `
      <tr>
        <td colspan="13" class="empty">
          Loading billing data...
        </td>
      </tr>
    `;

    const res = await fetch("/api/admin/billing", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Billing load failed");
    }

    companies = Array.isArray(data) ? data : [];

    render(companies);
    updateStats(companies);

  } catch (err) {
    console.log(err);

    container.innerHTML = `
      <tr>
        <td colspan="13" class="empty">
          Error loading billing data
        </td>
      </tr>
    `;
  }
}

/* =========================
   STATS
========================= */

function updateStats(list) {
  totalEl.innerText = list.length;

  activeEl.innerText =
    list.filter(x => x.billingStatus === "ACTIVE").length;

  pastDueEl.innerText =
    list.filter(x => x.billingStatus === "PAST_DUE").length;

  suspendedEl.innerText =
    list.filter(x => x.billingStatus === "SUSPENDED").length;
}

/* =========================
   RENDER
========================= */

function render(list) {
  if (!list.length) {
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
    const status =
      c.billingStatus || "ACTIVE";

    const statusClass =
      getStatusClass(status);

    const days =
      Number(c.daysLeft || 0);

    const progress =
      getProgressPercent(c);

    const lockedHtml = c.billingLocked
      ? `
        <span style="
          color:#dc2626;
          font-weight:900;
        ">
          LOCKED
        </span>
      `
      : `
        <span style="
          color:#16a34a;
          font-weight:900;
        ">
          OPEN
        </span>
      `;

    return `
      <tr>

        <td>
          <div class="company-name">
            ${safeText(c.name)}
          </div>

          <div class="company-small">
            Username: ${safeText(c.username)}
            <br>
            Email: ${safeText(c.email)}
          </div>
        </td>

        <td>
          <span class="badge ${statusClass}">
            ${status}
          </span>
        </td>

        <td>
          ${safeText(c.billingCycle || "MONTHLY")}
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
          ${Number(c.graceDays || 0)} Days
        </td>

        <td>
          ${lockedHtml}
        </td>

        <td>
          ${safeText(c.billingNotes)}
        </td>

        <td>
          <div class="actions">

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

            <button
              class="btn paid"
              onclick="markPaid('${c._id}')"
            >
              Mark Paid
            </button>

          </div>
        </td>

      </tr>
    `;
  }).join("");
}

/* =========================
   FILTER
========================= */

function applyFilters() {
  let list = [...companies];

  const s =
    search.value.toLowerCase().trim();

  const f =
    filter.value;

  if (s) {
    list = list.filter(x =>
      String(x.name || "").toLowerCase().includes(s) ||
      String(x.username || "").toLowerCase().includes(s) ||
      String(x.email || "").toLowerCase().includes(s)
    );
  }

  if (f) {
    list = list.filter(x => x.billingStatus === f);
  }

  render(list);
}

/* =========================
   ACTIONS
========================= */

async function lockCompany(id) {
  try {
    const ok = confirm(
      "Are you sure you want to lock this company?"
    );

    if (!ok) return;

    const res = await fetch(
      `/api/admin/billing/${id}/lock`,
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token
        }
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Lock failed");
    }

    await load();

  } catch (err) {
    console.log(err);
    alert(err.message || "Lock failed");
  }
}

async function unlockCompany(id) {
  try {
    const res = await fetch(
      `/api/admin/billing/${id}/unlock`,
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token
        }
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Unlock failed");
    }

    await load();

  } catch (err) {
    console.log(err);
    alert(err.message || "Unlock failed");
  }
}

async function markPaid(id) {
  try {
    const ok = confirm(
      "Mark this company as paid and renew billing?"
    );

    if (!ok) return;

    const res = await fetch(
      `/api/admin/billing/${id}/mark-paid`,
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token
        }
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Mark paid failed");
    }

    await load();

  } catch (err) {
    console.log(err);
    alert(err.message || "Mark paid failed");
  }
}

/* =========================
   STRIPE CONNECT
========================= */

async function connectStripe() {
  try {
    const company =
      prompt("Enter Company Name");

    if (!company) return;

    const res = await fetch(
      "/api/company/connect-stripe",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({
          company
        })
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Stripe connection failed");
    }

    if (data.url) {
      window.location.href = data.url;
      return;
    }

    alert(data.message || "Stripe connected");

  } catch (err) {
    console.log(err);
    alert(err.message || "Stripe connection failed");
  }
}

/* =========================
   EVENTS
========================= */

if (search) {
  search.addEventListener("input", applyFilters);
}

if (filter) {
  filter.addEventListener("change", applyFilters);
}

if (connectStripeBtn) {
  connectStripeBtn.addEventListener("click", connectStripe);
}

/* =========================
   INIT
========================= */

load();