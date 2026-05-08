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

const container = document.getElementById("billingContainer");

const totalEl = document.getElementById("totalCompanies");
const activeEl = document.getElementById("activeCompanies");
const pastEl = document.getElementById("pastDueCompanies");
const suspEl = document.getElementById("suspendedCompanies");

const search = document.getElementById("searchInput");
const filter = document.getElementById("statusFilter");

/* =========================
   STRIPE CONNECT (FIXED)
========================= */

document.getElementById("connectStripeBtn")
.addEventListener("click", async ()=>{

  try{

    const res = await fetch("/api/company/connect-stripe",{
      method:"POST",
      headers:{
        Authorization:"Bearer " + token
      }
    });

    const data = await res.json();

    if(!res.ok) throw new Error(data.message);

    if(data.url){
      window.location.href = data.url;
    }

  }catch(err){
    alert(err.message);
  }

});

/* =========================
   LOAD
========================= */

let companies = [];

async function load(){

  const res = await fetch("/api/admin/billing",{
    headers:{
      Authorization:"Bearer " + token
    }
  });

  const data = await res.json();

  companies = data || [];

  render(companies);
  stats(companies);

}

/* =========================
   STATS
========================= */

function stats(list){

  totalEl.innerText = list.length;

  activeEl.innerText =
    list.filter(x=>x.billingStatus==="ACTIVE").length;

  pastEl.innerText =
    list.filter(x=>x.billingStatus==="PAST_DUE").length;

  suspEl.innerText =
    list.filter(x=>x.billingStatus==="SUSPENDED").length;

}

/* =========================
   RENDER
========================= */

function render(list){

  container.innerHTML = list.map(c=>{

    let cls = "status-active";

    if(c.billingStatus==="PAST_DUE") cls="status-past";
    if(c.billingStatus==="SUSPENDED") cls="status-suspended";

    return `
      <tr>
        <td>${c.name}</td>

        <td class="${cls}">
          ${c.billingStatus}
        </td>

        <td>${c.billingCycle}</td>

        <td>$${c.invoiceAmount||0}</td>

        <td>${format(c.billingStartDate)}</td>

        <td>${format(c.billingEndDate)}</td>

        <td>${c.daysLeft||0}</td>

        <td>${c.billingLocked?"YES":"NO"}</td>

        <td>
          <button onclick="lock('${c._id}')">Lock</button>
          <button onclick="unlock('${c._id}')">Unlock</button>
          <button onclick="paid('${c._id}')">Paid</button>
        </td>
      </tr>
    `;

  }).join("");

}

/* =========================
   FORMAT
========================= */

function format(d){
  if(!d) return "--";
  return new Date(d).toLocaleDateString();
}

/* =========================
   ACTIONS
========================= */

async function lock(id){
  await fetch(`/api/admin/billing/${id}/lock`,{
    method:"PUT",
    headers:{Authorization:"Bearer "+token}
  });
  load();
}

async function unlock(id){
  await fetch(`/api/admin/billing/${id}/unlock`,{
    method:"PUT",
    headers:{Authorization:"Bearer "+token}
  });
  load();
}

async function paid(id){
  await fetch(`/api/admin/billing/${id}/mark-paid`,{
    method:"PUT",
    headers:{Authorization:"Bearer "+token}
  });
  load();
}

/* =========================
   FILTER
========================= */

search.addEventListener("input",()=>{
  const v = search.value.toLowerCase();
  render(companies.filter(c=>
    c.name?.toLowerCase().includes(v)
  ));
});

filter.addEventListener("change",()=>{
  const v = filter.value;
  if(!v) return render(companies);
  render(companies.filter(c=>c.billingStatus===v));
});

/* =========================
   INIT
========================= */

load();