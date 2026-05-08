const token = localStorage.getItem("token");

if(!token){
  window.location.href = "/admin/login.html";
}

const container = document.getElementById("billingContainer");

let companies = [];

/* =========================
   LOAD
========================= */
async function loadBilling(){

  const res = await fetch("/api/admin/billing",{
    headers:{ Authorization:"Bearer "+token }
  });

  companies = await res.json();

  render();
  updateStats();
}

/* =========================
   STATS
========================= */
function updateStats(){

  document.getElementById("totalCompanies").innerText =
    companies.length;

  document.getElementById("activeCompanies").innerText =
    companies.filter(c=>c.billingStatus==="ACTIVE").length;

  document.getElementById("pastDueCompanies").innerText =
    companies.filter(c=>c.billingStatus==="PAST_DUE").length;

  document.getElementById("suspendedCompanies").innerText =
    companies.filter(c=>c.billingStatus==="SUSPENDED").length;
}

/* =========================
   RENDER TABLE
========================= */
function render(){

  container.innerHTML = "";

  companies.forEach(c=>{

    let color = "";

    if(c.billingStatus==="ACTIVE") color="green";
    if(c.billingStatus==="PAST_DUE") color="orange";
    if(c.billingStatus==="SUSPENDED") color="red";

    container.innerHTML += `
      <tr>

        <td>${c.name}</td>

        <td class="${color}">
          ${c.billingStatus}
        </td>

        <td>${format(c.billingStartDate)}</td>
        <td>${format(c.billingEndDate)}</td>

        <td>${c.daysLeft || 0}</td>

        <td>

          <button class="lock" onclick="lock('${c._id}')">Lock</button>

          <button class="unlock" onclick="unlock('${c._id}')">Unlock</button>

          <button class="paid" onclick="paid('${c._id}')">Paid</button>

        </td>

      </tr>
    `;
  });
}

/* =========================
   SAVE SETTINGS
========================= */
async function saveSettings(){

  await fetch("/api/admin/billing-settings",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer "+token
    },
    body:JSON.stringify({
      startDate:document.getElementById("startDate").value,
      duration:document.getElementById("duration").value,
      graceDays:document.getElementById("grace").value
    })
  });

  loadBilling();
}

/* =========================
   ACTIONS
========================= */

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

/* =========================
   STRIPE
========================= */

document.getElementById("connectStripeBtn")
.addEventListener("click", async ()=>{

  const res = await fetch("/api/company/connect-stripe",{
    method:"POST",
    headers:{ Authorization:"Bearer "+token }
  });

  const data = await res.json();

  if(data.url){
    window.location.href = data.url;
  }

});

/* =========================
   FORMAT DATE
========================= */
function format(d){
  if(!d) return "--";
  return new Date(d).toLocaleDateString();
}

/* INIT */
loadBilling();