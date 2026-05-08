const token = localStorage.getItem("token");

if(!token){
  window.location.href = "/admin/login.html";
}

const container = document.getElementById("billingContainer");

/* =========================
   LOAD BILLING
========================= */

async function loadBilling(){

  try{

    const res = await fetch("/api/admin/billing",{
      headers:{
        Authorization:"Bearer " + token
      }
    });

    const companies = await res.json();

    renderCompanies(companies);

  }catch(err){

    console.log(err);

    container.innerHTML = `
      <div class="card">
        Error loading billing data
      </div>
    `;

  }

}

/* =========================
   RENDER
========================= */

function renderCompanies(companies){

  if(!Array.isArray(companies) || !companies.length){

    container.innerHTML = `
      <div class="card">
        No companies found
      </div>
    `;

    return;
  }

  container.innerHTML = companies.map(company=>{

    let statusClass = "status-active";

    if(company.billingStatus === "PAST_DUE"){
      statusClass = "status-past";
    }

    if(company.billingStatus === "SUSPENDED"){
      statusClass = "status-suspended";
    }

    return `

      <div class="card">

        <h3>${company.name || "-"}</h3>

        <div class="row">
          <strong>Status:</strong>
          <span class="${statusClass}">
            ${company.billingStatus || "ACTIVE"}
          </span>
        </div>

        <div class="row">
          <strong>Cycle:</strong>
          ${company.billingCycle || "MONTHLY"}
        </div>

        <div class="row">
          <strong>Invoice:</strong>
          $${Number(company.invoiceAmount || 0).toFixed(2)}
        </div>

        <div class="row">
          <strong>Next Billing:</strong>
          ${
            company.nextBillingDate
              ? new Date(company.nextBillingDate).toLocaleDateString()
              : "--"
          }
        </div>

        <div class="row">
          <strong>Locked:</strong>
          ${company.billingLocked ? "YES" : "NO"}
        </div>

        <div class="row">
          <strong>Notes:</strong>
          ${company.billingNotes || "--"}
        </div>

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

      </div>

    `;

  }).join("");

}

/* =========================
   LOCK
========================= */

async function lockCompany(id){

  try{

    await fetch(`/api/admin/billing/${id}/lock`,{
      method:"PUT",
      headers:{
        Authorization:"Bearer " + token
      }
    });

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

    await fetch(`/api/admin/billing/${id}/unlock`,{
      method:"PUT",
      headers:{
        Authorization:"Bearer " + token
      }
    });

    loadBilling();

  }catch(err){

    console.log(err);

    alert("Unlock failed");

  }

}

/* =========================
   INIT
========================= */

loadBilling();