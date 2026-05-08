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

/* =========================
   DATA
========================= */

let companies = [];

/* =========================
   FORMAT HELPERS
========================= */

function formatDate(d) {
  if (!d) return "--";
  return new Date(d).toLocaleDateString("en-US");
}

function money(v) {
  return "$" + Number(v || 0).toFixed(2);
}

/* =========================
   LOAD
========================= */

async function load() {

  try {

    const res = await fetch("/api/admin/billing", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json();

    companies = Array.isArray(data) ? data : [];

    render(companies);
    updateStats(companies);

  } catch (err) {

    console.log(err);

    container.innerHTML = `
      <tr>
        <td colspan="8">Error loading data</td>
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
      <tr><td colspan="8">No data</td></tr>
    `;
    return;
  }

  container.innerHTML = list.map(c => {

    let statusClass = "status-active";

    if (c.billingStatus === "PAST_DUE")
      statusClass = "status-past";

    if (c.billingStatus === "SUSPENDED")
      statusClass = "status-suspended";

    return `
      <tr>

        <td>
          <div class="company-name">${c.name}</div>
          <div class="company-small">
            Username: ${c.username}<br>
            Days Left: ${c.daysLeft ?? 0}<br>
            Locked: ${c.billingLocked ? "YES" : "NO"}
          </div>
        </td>

        <td>
          <span class="${statusClass}">
            ${c.billingStatus}
          </span>
        </td>

        <td>${c.billingCycle}</td>

        <td>${money(c.invoiceAmount)}</td>

        <td>${formatDate(c.billingEndDate)}</td>

        <td>${c.billingLocked ? "YES" : "NO"}</td>

        <td>${c.billingNotes || "--"}</td>

        <td>

          <button onclick="lock('${c._id}')">Lock</button>
          <button onclick="unlock('${c._id}')">Unlock</button>
          <button onclick="markPaid('${c._id}')">Paid</button>

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

  const s = search.value.toLowerCase().trim();
  const f = filter.value;

  if (s) {
    list = list.filter(x =>
      x.name?.toLowerCase().includes(s) ||
      x.username?.toLowerCase().includes(s)
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

async function lock(id) {

  await fetch(`/api/admin/billing/${id}/lock`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token
    }
  });

  load();
}

async function unlock(id) {

  await fetch(`/api/admin/billing/${id}/unlock`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token
    }
  });

  load();
}

async function markPaid(id) {

  await fetch(`/api/admin/billing/${id}/mark-paid`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token
    }
  });

  load();
}

/* =========================
   EVENTS
========================= */

search.addEventListener("input", applyFilters);
filter.addEventListener("change", applyFilters);

/* =========================
   INIT
========================= */

load();