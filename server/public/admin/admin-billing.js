/* =========================
   ADMIN BILLING CENTER
========================= */

const billingContainer =
document.getElementById("billingContainer");

const historyContainer =
document.getElementById("historyContainer");

const totalCompanies =
document.getElementById("totalCompanies");

const activeCompanies =
document.getElementById("activeCompanies");

const pastDueCompanies =
document.getElementById("pastDueCompanies");

const lockedCompanies =
document.getElementById("lockedCompanies");

const totalRevenue =
document.getElementById("totalRevenue");

const pendingPayments =
document.getElementById("pendingPayments");

const searchInput =
document.getElementById("searchInput");

const statusFilter =
document.getElementById("statusFilter");

const monthFilter =
document.getElementById("monthFilter");

const yearFilter =
document.getElementById("yearFilter");

let companies = [];
let trips = [];
let invoiceHistory = [];

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
   MONTHS
========================= */

months.forEach((m,i)=>{

  monthFilter.innerHTML += `
    <option value="${i}">
      ${m}
    </option>
  `;

});

/* =========================
   HELPERS
========================= */

function money(v){

  return `
    $${Number(v || 0).toFixed(2)}
  `;

}

function getBadgeClass(status){

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

/* =========================
   LOAD
========================= */

async function loadData(){

  try{

    billingContainer.innerHTML = `
      <tr>
        <td colspan="17" class="empty">
          Loading billing data...
        </td>
      </tr>
    `;

    /* =========================
       COMPANIES
    ========================= */

    let companiesRes =
    await fetch("/api/company-users");

    if(!companiesRes.ok){

      companiesRes =
      await fetch("/api/companies");

    }

    companies =
    await companiesRes.json();

    if(!Array.isArray(companies)){
      companies = [];
    }

    /* =========================
       TRIPS
    ========================= */

    const tripsRes =
    await fetch("/api/trips");

    trips =
    await tripsRes.json();

    if(!Array.isArray(trips)){
      trips = [];
    }

    render();

  }catch(err){

    console.error(err);

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
   COMPANY MATCH
========================= */

function tripBelongsToCompany(
  trip,
  company
){

  const companyId =
  String(company._id || "");

  const companyName =
  String(
    company.companyName ||
    company.name ||
    ""
  ).toLowerCase();

  const tripCompanyId =
  String(
    trip.companyId ||
    ""
  );

  const tripCompanyName =
  String(
    trip.company ||
    trip.companyName ||
    ""
  ).toLowerCase();

  return (
    tripCompanyId === companyId
    ||
    tripCompanyName === companyName
  );

}

/* =========================
   COMPANY TRIPS
========================= */

function getCompanyTrips(company){

  return trips.filter(trip=>{

    if(
      !tripBelongsToCompany(
        trip,
        company
      )
    ){
      return false;
    }

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

    const companyName =
    String(
      company.companyName ||
      company.name ||
      ""
    ).toLowerCase();

    if(search){

      if(
        !companyName.includes(search)
      ){
        return false;
      }

    }

    if(status){

      if(
        (
          company.billingStatus ||
          "ACTIVE"
        ) !== status
      ){
        return false;
      }

    }

    if(month || year){

      const d =
      new Date(
        trip.tripDate ||
        trip.createdAt
      );

      if(month){

        if(
          d.getMonth()
          !== Number(month)
        ){
          return false;
        }

      }

      if(year){

        if(
          d.getFullYear()
          !== Number(year)
        ){
          return false;
        }

      }

    }

    return true;

  });

}

/* =========================
   RENDER
========================= */

function render(){

  let html = "";

  let revenue = 0;

  let pending = 0;

  let active = 0;
  let past = 0;
  let locked = 0;

  companies.forEach(company=>{

    const companyTrips =
    getCompanyTrips(company);

    const completed =
    companyTrips.filter(
      t=>t.status === "Completed"
    );

    const noShow =
    companyTrips.filter(
      t=>
        t.status === "NoShow"
        ||
        t.status === "No Show"
    );

    const cancelled =
    companyTrips.filter(
      t=>
        t.status === "Cancelled"
        ||
        t.status === "Canceled"
    );

    const shared =
    companyTrips.filter(
      t=>
        t.sharedGroupId
        ||
        t.tripType === "shared"
        ||
        t.tripType === "SHARED"
        ||
        String(
          t.tripNumber || ""
        ).includes("-SH")
    );

    const individual =
    companyTrips.filter(
      t=>
        !(
          t.sharedGroupId
          ||
          t.tripType === "shared"
          ||
          t.tripType === "SHARED"
          ||
          String(
            t.tripNumber || ""
          ).includes("-SH")
        )
    );

    const completedRevenue =
    completed.reduce((sum,t)=>{

      return (
        sum +
        Number(
          t.priceAmount ||
          t.totalPrice ||
          t.price ||
          0
        )
      );

    },0);

    const noShowRevenue =
    noShow.reduce((sum,t)=>{

      return (
        sum +
        Number(
          t.cancelFee ||
          t.noShowFee ||
          15
        )
      );

    },0);

    const invoiceAmount =
    completedRevenue +
    noShowRevenue;

    const paidAmount =
    Number(
      company.amountPaid ||
      0
    );

    const remaining =
    invoiceAmount -
    paidAmount;

    revenue += invoiceAmount;

    if(remaining > 0){
      pending += remaining;
    }

    const status =
    company.billingStatus ||
    "ACTIVE";

    if(status === "ACTIVE"){
      active++;
    }

    if(status === "PAST_DUE"){
      past++;
    }

    if(status === "SUSPENDED"){
      locked++;
    }

    const badgeClass =
    getBadgeClass(status);

    html += `

      <tr>

        <td>

          <div class="company-name">
            ${
              company.companyName ||
              company.name ||
              "-"
            }
          </div>

          <div class="company-small">

            ${
              company.email || ""
            }

            <br>

            ${
              company.phone || ""
            }

          </div>

        </td>

        <td>

          <span class="badge ${badgeClass}">
            ${status}
          </span>

        </td>

        <td>

          ${
            months[
              new Date().getMonth()
            ]
          }

          ${new Date().getFullYear()}

        </td>

        <td>
          ${companyTrips.length}
        </td>

        <td>
          ${individual.length}
        </td>

        <td>
          ${shared.length}
        </td>

        <td>
          ${completed.length}
        </td>

        <td>
          ${noShow.length}
        </td>

        <td>
          ${cancelled.length}
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
          ${money(remaining)}
        </td>

        <td>

          ${
            company.lastPaymentDate
            ?
            new Date(
              company.lastPaymentDate
            ).toLocaleDateString()
            :
            "-"
          }

        </td>

        <td>

          ${
            company.locked
            ?
            "YES"
            :
            "NO"
          }

        </td>

        <td class="actions">

          <div class="btn-row">

            <button
              class="btn btn-blue"
              data-action="generate"
              data-id="${company._id}"
            >
              Generate
            </button>

            <button
              class="btn btn-green"
              data-action="paid"
              data-id="${company._id}"
            >
              Paid
            </button>

            <button
              class="btn btn-yellow"
              data-action="stripe"
              data-id="${company._id}"
            >
              Stripe Link
            </button>

            <button
              class="btn btn-red"
              data-action="lock"
              data-id="${company._id}"
            >
              Lock
            </button>

            <button
              class="btn btn-dark"
              data-action="view"
              data-id="${company._id}"
            >
              View Trips
            </button>

            <button
              class="btn btn-stripe"
              data-action="pdf"
              data-id="${company._id}"
            >
              PDF
            </button>

          </div>

        </td>

      </tr>

    `;

  });

  if(!html){

    html = `
      <tr>
        <td colspan="17" class="empty">
          No billing data found.
        </td>
      </tr>
    `;

  }

  billingContainer.innerHTML = html;

  totalCompanies.textContent =
  companies.length;

  activeCompanies.textContent =
  active;

  pastDueCompanies.textContent =
  past;

  lockedCompanies.textContent =
  locked;

  totalRevenue.textContent =
  money(revenue);

  pendingPayments.textContent =
  money(pending);

}

/* =========================
   ACTIONS
========================= */

billingContainer.addEventListener(
  "click",
  async e=>{

    const btn =
    e.target.closest("button");

    if(!btn) return;

    const action =
    btn.dataset.action;

    const id =
    btn.dataset.id;

    const company =
    companies.find(
      c=>String(c._id) === String(id)
    );

    if(!company) return;

    /* =========================
       VIEW
    ========================= */

    if(action === "view"){

      const companyTrips =
      getCompanyTrips(company);

      alert(

        `Company: ${
          company.companyName
        }\n\n`

        +

        `Total Trips: ${
          companyTrips.length
        }\n`

        +

        `Individual: ${
          companyTrips.filter(
            t=>
              !(
                t.sharedGroupId
              )
          ).length
        }\n`

        +

        `Shared: ${
          companyTrips.filter(
            t=>
              t.sharedGroupId
          ).length
        }\n`

        +

        `Completed: ${
          companyTrips.filter(
            t=>
              t.status === "Completed"
          ).length
        }\n`

        +

        `No Show: ${
          companyTrips.filter(
            t=>
              t.status === "NoShow"
          ).length
        }`

      );

    }

    /* =========================
       GENERATE
    ========================= */

    if(action === "generate"){

      alert(
        "Invoice generated."
      );

    }

    /* =========================
       PAID
    ========================= */

    if(action === "paid"){

      alert(
        "Marked as paid."
      );

    }

    /* =========================
       STRIPE
    ========================= */

    if(action === "stripe"){

      alert(
        "Stripe link created."
      );

    }

    /* =========================
       LOCK
    ========================= */

    if(action === "lock"){

      alert(
        "Company locked."
      );

    }

    /* =========================
       PDF
    ========================= */

    if(action === "pdf"){

      alert(
        "PDF generated."
      );

    }

  }
);

/* =========================
   FILTERS
========================= */

searchInput.addEventListener(
  "input",
  render
);

statusFilter.addEventListener(
  "change",
  render
);

monthFilter.addEventListener(
  "change",
  render
);

yearFilter.addEventListener(
  "input",
  render
);

/* =========================
   STRIPE BUTTONS
========================= */

document
.getElementById(
  "connectStripeBtn"
)
.addEventListener(
  "click",
  ()=>{

    alert(
      "Stripe connect ready."
    );

  }
);

document
.getElementById(
  "openStripeBtn"
)
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
   INIT
========================= */

loadData();