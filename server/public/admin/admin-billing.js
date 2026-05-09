/* =========================
   ADMIN BILLING CENTER
========================= */

const billingContainer = document.getElementById("billingContainer");
const historyContainer = document.getElementById("historyContainer");

const totalCompanies = document.getElementById("totalCompanies");
const activeCompanies = document.getElementById("activeCompanies");
const pastDueCompanies = document.getElementById("pastDueCompanies");
const lockedCompanies = document.getElementById("lockedCompanies");
const totalRevenue = document.getElementById("totalRevenue");
const pendingPayments = document.getElementById("pendingPayments");

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const monthFilter = document.getElementById("monthFilter");
const yearFilter = document.getElementById("yearFilter");

let companies = [];
let trips = [];

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

/* =========================
   MONTH FILTER
========================= */

function fillMonthFilter() {
  if (!monthFilter) return;

  months.forEach((m, i) => {
    monthFilter.innerHTML += `
      <option value="${i}">
        ${m}
      </option>
    `;
  });
}

/* =========================
   HELPERS
========================= */

function money(value) {
  return "$" + Number(value || 0).toFixed(2);
}

function safeText(value) {
  return value || "-";
}

function getTripDate(trip) {
  return new Date(
    trip.tripDate ||
    trip.date ||
    trip.createdAt ||
    Date.now()
  );
}

function getTripPrice(trip) {
  return Number(
    trip.priceAmount ||
    trip.totalPrice ||
    trip.price ||
    trip.amount ||
    0
  );
}

function isCompleted(trip) {
  return trip.status === "Completed";
}

function isNoShow(trip) {
  return (
    trip.status === "NoShow" ||
    trip.status === "No Show"
  );
}

function isCancelled(trip) {
  return (
    trip.status === "Cancelled" ||
    trip.status === "Canceled"
  );
}

function isSharedTrip(trip) {
  return Boolean(
    trip.sharedGroupId ||
    trip.groupId ||
    trip.sharedTripId ||
    trip.isShared === true ||
    trip.tripType === "shared" ||
    trip.tripType === "SHARED" ||
    String(trip.tripNumber || "").toUpperCase().includes("-SH")
  );
}

function isIndividualTrip(trip) {
  return !isSharedTrip(trip);
}

function getCompanyName(company) {
  return (
    company.companyName ||
    company.name ||
    company.facilityName ||
    "-"
  );
}

function getCompanyEmail(company) {
  return (
    company.email ||
    company.companyEmail ||
    ""
  );
}

function getCompanyPhone(company) {
  return (
    company.phone ||
    company.companyPhone ||
    ""
  );
}

function getCompanyStatus(company) {
  return company.billingStatus || company.status || "ACTIVE";
}

function getCompanyPaid(company) {
  return Number(
    company.amountPaid ||
    company.paidAmount ||
    company.totalPaid ||
    0
  );
}

/* =========================
   LOAD DATA
========================= */

async function loadData() {
  try {
    billingContainer.innerHTML = `
      <tr>
        <td colspan="17" class="empty">
          Loading billing data...
        </td>
      </tr>
    `;

    const companiesRes = await fetch("/api/company-users");
    companies = await companiesRes.json();

    const tripsRes = await fetch("/api/trips");
    trips = await tripsRes.json();

    if (!Array.isArray(companies)) companies = [];
    if (!Array.isArray(trips)) trips = [];

    render();

  } catch (err) {
    console.error("Billing load error:", err);

    billingContainer.innerHTML = `
      <tr>
        <td colspan="17" class="empty">
          Failed to load billing data.
        </td>
      </tr>
    `;
  }
}

/* =========================
   COMPANY TRIP MATCH
========================= */

function tripBelongsToCompany(trip, company) {
  const companyId = String(company._id || company.id || "");
  const companyName = String(getCompanyName(company)).toLowerCase();

  const tripCompanyId = String(
    trip.companyId ||
    trip.companyUserId ||
    trip.facilityId ||
    ""
  );

  const tripCompanyName = String(
    trip.company ||
    trip.companyName ||
    trip.facility ||
    trip.facilityName ||
    ""
  ).toLowerCase();

  return (
    tripCompanyId === companyId ||
    tripCompanyName === companyName
  );
}

/* =========================
   FILTER COMPANY TRIPS
========================= */

function getCompanyTrips(company) {
  return trips.filter(trip => {
    if (!tripBelongsToCompany(trip, company)) {
      return false;
    }

    const monthValue = monthFilter.value;
    const yearValue = yearFilter.value;

    if (monthValue !== "" || yearValue !== "") {
      const d = getTripDate(trip);

      if (monthValue !== "") {
        if (d.getMonth() !== Number(monthValue)) {
          return false;
        }
      }

      if (yearValue !== "") {
        if (d.getFullYear() !== Number(yearValue)) {
          return false;
        }
      }
    }

    return true;
  });
}

/* =========================
   FILTER COMPANIES
========================= */

function getFilteredCompanies() {
  const search = String(searchInput.value || "").toLowerCase().trim();
  const status = statusFilter.value;

  return companies.filter(company => {
    const name = getCompanyName(company).toLowerCase();
    const email = getCompanyEmail(company).toLowerCase();
    const phone = getCompanyPhone(company).toLowerCase();

    if (search) {
      const match =
        name.includes(search) ||
        email.includes(search) ||
        phone.includes(search);

      if (!match) return false;
    }

    if (status) {
      if (getCompanyStatus(company) !== status) {
        return false;
      }
    }

    return true;
  });
}

/* =========================
   STATUS BADGE
========================= */

function getBadgeClass(status) {
  if (status === "PAST_DUE") return "status-past";
  if (status === "SUSPENDED") return "status-suspended";
  if (status === "PAID") return "status-paid";
  return "status-active";
}

/* =========================
   PERIOD TEXT
========================= */

function getPeriodText() {
  const monthValue = monthFilter.value;
  const yearValue = yearFilter.value;

  const year = yearValue || new Date().getFullYear();

  if (monthValue !== "") {
    return `${months[Number(monthValue)]} ${year}`;
  }

  return `All Months ${year}`;
}

/* =========================
   RENDER
========================= */

function render() {
  let html = "";

  let totalRevenueAmount = 0;
  let totalPendingAmount = 0;

  let activeCount = 0;
  let pastDueCount = 0;
  let lockedCount = 0;

  const filteredCompanies = getFilteredCompanies();

  filteredCompanies.forEach(company => {
    const companyTrips = getCompanyTrips(company);

    const individualTrips = companyTrips.filter(isIndividualTrip);
    const sharedTrips = companyTrips.filter(isSharedTrip);

    const completedTrips = companyTrips.filter(isCompleted);
    const noShowTrips = companyTrips.filter(isNoShow);
    const cancelledTrips = companyTrips.filter(isCancelled);

    const completedRevenue = completedTrips.reduce((sum, trip) => {
      return sum + getTripPrice(trip);
    }, 0);

    const noShowRevenue = noShowTrips.reduce((sum, trip) => {
      return sum + Number(trip.cancelFee || trip.noShowFee || 15);
    }, 0);

    const invoiceAmount = completedRevenue + noShowRevenue;
    const paidAmount = getCompanyPaid(company);
    const remainingAmount = Math.max(0, invoiceAmount - paidAmount);

    totalRevenueAmount += invoiceAmount;

    const status = getCompanyStatus(company);

    if (status === "ACTIVE") activeCount++;
    if (status === "PAST_DUE") pastDueCount++;
    if (status === "SUSPENDED") lockedCount++;

    if (status === "PAST_DUE" || remainingAmount > 0) {
      totalPendingAmount += remainingAmount;
    }

    const badgeClass = getBadgeClass(status);

    html += `
      <tr>

        <td>
          <div class="company-name">
            ${safeText(getCompanyName(company))}
          </div>

          <div class="company-small">
            ${getCompanyEmail(company)}
            <br>
            ${getCompanyPhone(company)}
          </div>
        </td>

        <td>
          <span class="badge ${badgeClass}">
            ${status}
          </span>
        </td>

        <td>
          ${getPeriodText()}
        </td>

        <td>
          ${companyTrips.length}
        </td>

        <td>
          ${individualTrips.length}
        </td>

        <td>
          ${sharedTrips.length}
        </td>

        <td>
          ${completedTrips.length}
        </td>

        <td>
          ${noShowTrips.length}
        </td>

        <td>
          ${cancelledTrips.length}
        </td>

        <td>
          ${money(completedRevenue)}
        </td>

        <td>
          ${money(invoiceAmount)}
        </td>

        <td>
          ${money(paidAmount)}
        </td>

        <td>
          ${money(remainingAmount)}
        </td>

        <td>
          ${
            company.lastPaymentDate
              ? new Date(company.lastPaymentDate).toLocaleDateString()
              : "-"
          }
        </td>

        <td>
          ${company.locked ? "YES" : "NO"}
        </td>

        <td class="actions">
          <div class="btn-row">

            <button
              class="btn btn-blue"
              data-action="generate"
              data-company-id="${company._id || company.id}"
            >
              Generate
            </button>

            <button
              class="btn btn-green"
              data-action="mark-paid"
              data-company-id="${company._id || company.id}"
            >
              Paid
            </button>

            <button
              class="btn btn-yellow"
              data-action="stripe-link"
              data-company-id="${company._id || company.id}"
            >
              Stripe Link
            </button>

            <button
              class="btn btn-red"
              data-action="lock"
              data-company-id="${company._id || company.id}"
            >
              Lock
            </button>

            <button
              class="btn btn-dark"
              data-action="view-trips"
              data-company-id="${company._id || company.id}"
            >
              View Trips
            </button>

            <button
              class="btn btn-stripe"
              data-action="pdf"
              data-company-id="${company._id || company.id}"
            >
              PDF
            </button>

          </div>
        </td>

      </tr>
    `;
  });

  if (!html) {
    html = `
      <tr>
        <td colspan="17" class="empty">
          No billing data found.
        </td>
      </tr>
    `;
  }

  billingContainer.innerHTML = html;

  totalCompanies.textContent = companies.length;
  activeCompanies.textContent = activeCount;
  pastDueCompanies.textContent = pastDueCount;
  lockedCompanies.textContent = lockedCount;

  totalRevenue.textContent = money(totalRevenueAmount);
  pendingPayments.textContent = money(totalPendingAmount);
}

/* =========================
   ACTION BUTTONS
========================= */

billingContainer.addEventListener("click", async e => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.dataset.action;
  const companyId = btn.dataset.companyId;

  const company = companies.find(c => {
    return String(c._id || c.id) === String(companyId);
  });

  if (!company) return;

  if (action === "view-trips") {
    const companyTrips = getCompanyTrips(company);

    alert(
      `Company: ${getCompanyName(company)}\n\n` +
      `Total Trips: ${companyTrips.length}\n` +
      `Individual: ${companyTrips.filter(isIndividualTrip).length}\n` +
      `Shared: ${companyTrips.filter(isSharedTrip).length}\n` +
      `Completed: ${companyTrips.filter(isCompleted).length}\n` +
      `No Show: ${companyTrips.filter(isNoShow).length}\n` +
      `Cancelled: ${companyTrips.filter(isCancelled).length}`
    );

    return;
  }

  if (action === "generate") {
    alert("Generate invoice button is ready.");
    return;
  }

  if (action === "mark-paid") {
    alert("Mark paid button is ready.");
    return;
  }

  if (action === "stripe-link") {
    alert("Stripe payment link button is ready.");
    return;
  }

  if (action === "lock") {
    alert("Lock account button is ready.");
    return;
  }

  if (action === "pdf") {
    alert("PDF invoice button is ready.");
    return;
  }
});

/* =========================
   STRIPE BUTTONS
========================= */

const connectStripeBtn = document.getElementById("connectStripeBtn");
const openStripeBtn = document.getElementById("openStripeBtn");

if (connectStripeBtn) {
  connectStripeBtn.addEventListener("click", () => {
    alert("Stripe connect is ready.");
  });
}

if (openStripeBtn) {
  openStripeBtn.addEventListener("click", () => {
    window.open("https://dashboard.stripe.com/", "_blank");
  });
}

/* =========================
   FILTER EVENTS
========================= */

searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);
monthFilter.addEventListener("change", render);
yearFilter.addEventListener("input", render);

/* =========================
   INIT
========================= */

fillMonthFilter();
loadData();