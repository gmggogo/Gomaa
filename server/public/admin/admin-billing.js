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

/* =========================
   DATA
========================= */

let companies = [];

/* =========================
   HELPERS
========================= */

function money(v){

  return "$" +
    Number(v || 0).toFixed(2);

}

function formatDate(v){

  if(!v) return "--";

  const d =
    new Date(v);

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

function toInputDate(v){

  if(!v) return "";

  const d =
    new Date(v);

  if(isNaN(d.getTime())){
    return "";
  }

  return d.toISOString()
    .split("T")[0];

}

function getStatusClass(status){

  const s =
    String(status || "")
      .toUpperCase();

  if(s === "PAST_DUE"){
    return "status-past";
  }

  if(s === "SUSPENDED"){
    return "status-suspended";
  }

  return "status-active";

}

async function safeJson(res){

  try{

    return await res.json();

  }catch{

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
        Loading billing data...
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
    list.map(c=>`

      <div class="company-card">

        <div class="card-top">

          <div class="company-box">

            <h3>
              ${c.name || "--"}
            </h3>

            <p>
              ${c.email || "--"}
              <br>
              ${c.phone || "--"}
              <br>
              ${c.username || "--"}
            </p>

          </div>

          <div class="
            status-box
            ${getStatusClass(c.billingStatus)}
          ">

            ${c.billingStatus || "ACTIVE"}

          </div>

        </div>

        <div class="stats-grid">

          <div class="stat">
            <h4>Total Trips</h4>
            <p>${c.totalTrips || 0}</p>
          </div>

          <div class="stat">
            <h4>Completed</h4>
            <p>${c.completedTrips || 0}</p>
          </div>

          <div class="stat">
            <h4>Shared</h4>
            <p>${c.sharedTrips || 0}</p>
          </div>

          <div class="stat">
            <h4>No Show</h4>
            <p>${c.noShowTrips || 0}</p>
          </div>

          <div class="stat">
            <h4>Revenue</h4>
            <p>${money(c.revenue)}</p>
          </div>

          <div class="stat">
            <h4>Invoice</h4>
            <p>${money(c.invoiceAmount)}</p>
          </div>

        </div>

        <div class="settings-grid">

          <div class="field">

            <label>
              Billing Start
            </label>

            <input
              type="date"
              id="start-${c._id}"
              value="${toInputDate(c.billingStartDate)}"
            >

          </div>

          <div class="field">

            <label>
              Billing End
            </label>

            <input
              type="date"
              id="end-${c._id}"
              value="${toInputDate(c.billingEndDate)}"
            >

          </div>

          <div class="field">

            <label>
              Grace Days
            </label>

            <input
              type="number"
              id="grace-${c._id}"
              value="${c.graceDays || 3}"
            >

          </div>

          <div class="field">

            <label>
              Last Payment
            </label>

            <input
              value="${formatDate(c.lastPaymentDate)}"
              readonly
            >

          </div>

        </div>

        <div class="actions">

          <button
            class="btn btn-blue"
            onclick="generateInvoice('${c._id}')"
          >
            Generate Invoice
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

    `).join("");

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

    if(!start || !end){

      alert(
        "Select billing dates first"
      );

      return;

    }

    const ok =
      confirm(
        "Generate invoice for this company?"
      );

    if(!ok) return;

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
        "Invoice failed"
      );

    }

    alert(
      "Invoice generated successfully"
    );

    loadBilling();

  }catch(err){

    console.log(err);

    alert(
      err.message ||
      "Generate failed"
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

    const ok =
      confirm(
        "Lock this company?"
      );

    if(!ok) return;

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

    alert(
      "Company locked"
    );

    loadBilling();

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

    alert(
      "Company unlocked"
    );

    loadBilling();

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

    const ok =
      confirm(
        "Mark invoice as paid?"
      );

    if(!ok) return;

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
      "Invoice marked as paid"
    );

    loadBilling();

  }catch(err){

    console.log(err);

    alert(
      err.message ||
      "Payment failed"
    );

  }

}

/* =========================
   SEARCH
========================= */

if(searchInput){

  searchInput.addEventListener(
    "input",
    ()=>{

      const value =
        searchInput.value
          .toLowerCase()
          .trim();

      const filtered =
        companies.filter(c=>{

          const text = `
            ${c.name || ""}
            ${c.email || ""}
            ${c.phone || ""}
            ${c.username || ""}
          `
          .toLowerCase();

          return text.includes(value);

        });

      render(filtered);

    }
  );

}

/* =========================
   INIT
========================= */

loadBilling();