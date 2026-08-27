"use strict";

function clean(v){ return String(v ?? "").trim(); }

const token =
  clean(localStorage.getItem("token")) ||
  clean(sessionStorage.getItem("staffToken"));

const role =
  (
    clean(localStorage.getItem("role")) ||
    clean(sessionStorage.getItem("staffRole"))
  )
  .toUpperCase()
  .replace(/[\s-]+/g,"_");

if(!token || role !== "PLATFORM_ADMIN"){
  window.location.replace("/login.html");
}

const cards = document.getElementById("tenantCards");
const searchInput = document.getElementById("searchInput");
const messageBox = document.getElementById("messageBox");
let records = [];

function esc(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function message(text,type="ok"){
  messageBox.textContent = text;
  messageBox.className = "message show " + type;
}

async function api(url,options={}){
  const res = await fetch(url,{
    ...options,
    headers:{
      ...(options.headers || {}),
      Authorization:"Bearer " + token
    },
    cache:"no-store"
  });

  const data = await res.json().catch(()=>({}));

  if(!res.ok){
    throw new Error(data.message || "Request failed");
  }

  return data;
}

function dateValue(v){
  if(!v) return "";
  const d = new Date(v);
  if(Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0,10);
}

function statusClass(v){
  const s = clean(v).toLowerCase();
  return ["active","trial","past_due","suspended"].includes(s) ? s : (s === "disabled" ? "suspended" : "none");
}

async function load(){
  cards.innerHTML = `<div class="empty">Loading tenants...</div>`;

  try{
    const tenants = await api("/api/platform-admin/tenants");

    if(!Array.isArray(tenants)){
      throw new Error("Invalid tenants response");
    }

    records = await Promise.all(
      tenants.map(async tenant=>{
        try{
          const data = await api(
            `/api/platform-subscription/tenants/${encodeURIComponent(tenant._id)}/subscription`
          );

          return {
            tenant,
            subscription:data.subscription || null
          };

        }catch(err){
          return {
            tenant,
            subscription:null
          };
        }
      })
    );

    render();

  }catch(err){
    console.error("PLATFORM BILLING LOAD ERROR:",err);
    cards.innerHTML = `<div class="empty">Unable to load tenants.</div>`;
    message(err.message || "Unable to load tenants.","error");
  }
}

function render(){
  const q = clean(searchInput.value).toLowerCase();

  const list = records.filter(item=>{
    const name = clean(item.tenant?.name).toLowerCase();
    const slug = clean(item.tenant?.slug).toLowerCase();
    return !q || name.includes(q) || slug.includes(q);
  });

  if(!list.length){
    cards.innerHTML = `<div class="empty">No tenants found.</div>`;
    return;
  }

  cards.innerHTML = list.map(item=>{
    const t = item.tenant || {};
    const s = item.subscription || {};
    const tenantEnabled = t.enabled !== false;
    const status = tenantEnabled
      ? clean(s.status || t.subscriptionStatus || "ACTIVE").toUpperCase()
      : "DISABLED";

    return `
      <article class="tenant-card" data-id="${esc(t._id)}">
        <div class="tenant-head">
          <div class="tenant-name">${esc(t.name || "Tenant")}</div>
          <div class="tenant-slug">${esc(t.slug || "")}</div>
        </div>

        <div class="tenant-body">
          <div class="field">
            <label>Plan Name</label>
            <input class="plan" value="${esc(s.planName || "GH Mobility")}">
          </div>

          <div class="row">
            <div class="field">
              <label>Billing Cycle</label>
              <select class="cycle" disabled>
                <option value="ANNUAL" ${s.billingCycle==="ANNUAL"?"selected":""}>Annual</option>
                <option value="MONTHLY" ${s.billingCycle==="MONTHLY"?"selected":""}>Monthly</option>
              </select>
            </div>

            <div class="field">
              <label>Amount</label>
              <input class="amount" type="number" min="0" step="0.01" value="${Number(s.amount || 0)}" disabled>
            </div>
          </div>

          <div class="row">
            <div class="field">
              <label>Due Date</label>
              <input class="due" type="date" value="${dateValue(s.dueDate)}" disabled>
            </div>

            <div class="field">
              <label>Grace Days</label>
              <input class="grace" type="number" min="0" max="60" value="${Number(s.graceDays ?? 3)}" disabled>
            </div>
          </div>

          <div class="status-line">
            <strong>Current Status</strong>
            <span class="badge ${statusClass(status)}">${esc(status)}</span>
          </div>

          <div class="actions">
            <button class="edit-btn" type="button" onclick="editTenant('${esc(t._id)}')">
              Edit
            </button>

            <button class="save" type="button" onclick="saveTenant('${esc(t._id)}')" disabled>
              Save Subscription
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}


function editTenant(id){
  const card = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if(!card) return;

  card.querySelectorAll("input,select").forEach(el=>{
    el.disabled = false;
  });

  const saveButton = card.querySelector(".save");
  if(saveButton){
    saveButton.disabled = false;
  }
}

async function saveTenant(id){
  const card = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if(!card) return;

  const payload = {
    planName:clean(card.querySelector(".plan").value) || "GH Mobility",
    billingCycle:card.querySelector(".cycle").value,
    amount:Number(card.querySelector(".amount").value || 0),
    dueDate:card.querySelector(".due").value || null,
    graceDays:Number(card.querySelector(".grace").value || 0)
  };

  try{
    await api(
      `/api/platform-subscription/tenants/${encodeURIComponent(id)}/subscription`,
      {
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload)
      }
    );

    message("Subscription updated successfully.","ok");
    await load();

  }catch(err){
    console.error("SAVE SUBSCRIPTION ERROR:",err);
    message(err.message || "Unable to update subscription.","error");
  }
}

window.editTenant = editTenant;
window.saveTenant = saveTenant;

searchInput.addEventListener("input",render);
document.getElementById("refreshBtn").addEventListener("click",load);

load();