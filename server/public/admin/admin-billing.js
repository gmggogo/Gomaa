const token = localStorage.getItem("token");

if(!token){
  window.location.href = "/admin/login.html";
}

const container = document.getElementById("billingContainer");

let companies = [];

/* =====================
   LOAD BILLING
===================== */
async function loadBilling(){

  const res = await fetch("/api/admin/billing",{
    headers:{
      Authorization:"Bearer " + token
    }
  });

  companies = await res.json();

  render();
}

/* =====================
   RENDER
===================== */
function render(){

  container.innerHTML = "";

  if(!companies.length){
    container.innerHTML = `
      <tr><td colspan="6">No companies</td></tr>
    `;
    return;
  }

  companies.forEach(c=>{

    let statusClass = "active";

    if(c.billingStatus==="PAST_DUE") statusClass="past";
    if(c.billingStatus==="SUSPENDED") statusClass="suspended";

    container.innerHTML += `
      <tr>

        <td>${c.name || "-"}</td>

        <td class="${statusClass}">
          ${c.billingStatus || "ACTIVE"}
        </td>

        <td>${format(c.billingStartDate)}</td>
        <td>${format(c.billingEndDate)}</td>

        <td>${c.daysLeft || 0}</td>

        <td>

          <button class="btn-lock" onclick="lock('${c._id}')">Lock</button>

          <button class="btn-unlock" onclick="unlock('${c._id}')">Unlock</button>

          <button class="btn-paid" onclick="paid('${c._id}')">Paid</button>

        </td>

      </tr>
    `;
  });
}

/* =====================
   SAVE SETTINGS
===================== */
async function saveSettings(){

  const startDate = document.getElementById("startDate").value;
  const duration = document.getElementById("duration").value;
  const grace = document.getElementById("grace").value;

  await fetch("/api/admin/billing-settings",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + token
    },
    body: JSON.stringify({
      startDate,
      duration,
      graceDays: grace
    })
  });

  alert("Saved");

  loadBilling();
}

/* =====================
   ACTIONS
===================== */

async function lock(id){

  await fetch(`/api/admin/billing/${id}/lock`,{
    method:"PUT",
    headers:{ Authorization:"Bearer "+token }
  });

  loadBilling();
}

async function unlock(id){

  await fetch(`/api/admin/billing/${id}/unlock`,{
    method:"PUT",
    headers:{ Authorization:"Bearer "+token }
  });

  loadBilling();
}

async function paid(id){

  await fetch(`/api/admin/billing/${id}/mark-paid`,{
    method:"PUT",
    headers:{ Authorization:"Bearer "+token }
  });

  loadBilling();
}

/* =====================
   STRIPE
===================== */

document.getElementById("connectStripeBtn")
.addEventListener("click", async ()=>{

  const res = await fetch("/api/company/connect-stripe",{
    method:"POST",
    headers:{
      Authorization:"Bearer "+token
    }
  });

  const data = await res.json();

  if(data.url){
    window.location.href = data.url;
  }

});

/* =====================
   FORMAT
===================== */
function format(d){
  if(!d) return "--";
  return new Date(d).toLocaleDateString();
}

/* INIT */
loadBilling();