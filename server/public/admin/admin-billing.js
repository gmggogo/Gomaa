const token = localStorage.getItem("token");

const container = document.getElementById("billingContainer");

/* =========================
   SAVE SETTINGS
========================= */
async function saveSettings(){

  const body = {
    startDate: document.getElementById("startDate").value,
    duration: document.getElementById("duration").value,
    graceDays: document.getElementById("grace").value,
    cycle: document.getElementById("cycle").value
  };

  await fetch("/api/admin/billing-settings",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer "+token
    },
    body: JSON.stringify(body)
  });

  load();
}

/* =========================
   STRIPE
========================= */
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

/* =========================
   LOAD
========================= */
async function load(){

  const res = await fetch("/api/admin/billing",{
    headers:{Authorization:"Bearer "+token}
  });

  const data = await res.json();

  container.innerHTML = data.map(c=>{

    let cls = "status-active";
    if(c.billingStatus==="PAST_DUE") cls="status-past";
    if(c.billingStatus==="SUSPENDED") cls="status-suspended";

    return `
      <tr>

        <td><b>${c.name}</b></td>

        <td class="${cls}">
          ${c.billingStatus}
        </td>

        <td>${fmt(c.billingStartDate)}</td>
        <td>${fmt(c.billingEndDate)}</td>

        <td>${c.daysLeft || 0}</td>

        <td>

          <div class="actions">

            ${
              c.billingLocked
              ? `<button class="unlock" onclick="unlock('${c._id}')">Unlock</button>`
              : `<button class="lock" onclick="lock('${c._id}')">Lock</button>`
            }

            <button class="paid" onclick="paid('${c._id}')">
              Paid
            </button>

          </div>

        </td>

      </tr>
    `;

  }).join("");

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
   FORMAT
========================= */
function fmt(d){
  if(!d) return "--";
  return new Date(d).toLocaleDateString();
}

/* INIT */
load();