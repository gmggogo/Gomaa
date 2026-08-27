"use strict";

const token =
  String(
    sessionStorage.getItem("staffToken") ||
    localStorage.getItem("token") ||
    ""
  ).trim();

const role =
  String(
    sessionStorage.getItem("staffRole") ||
    localStorage.getItem("role") ||
    ""
  )
  .toUpperCase()
  .replace(/[\s-]+/g,"_");

if(
  !token ||
  role !== "PLATFORM_ADMIN"
){
  window.location.replace("/login.html");
}

const cards =
  document.getElementById("tenantCards");

const searchInput =
  document.getElementById("searchInput");

const messageBox =
  document.getElementById("messageBox");

let tenants = [];

function showMessage(
  text,
  type="ok"
){
  messageBox.textContent = text;
  messageBox.className =
    "message show " + type;
}

function clearMessage(){
  messageBox.className = "message";
  messageBox.textContent = "";
}

function esc(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

async function api(
  url,
  options={}
){
  const res =
    await fetch(
      url,
      {
        ...options,
        headers:{
          ...(options.headers || {}),
          Authorization:
            "Bearer " + token
        },
        cache:"no-store"
      }
    );

  const data =
    await res.json()
      .catch(()=>({}));

  if(!res.ok){
    throw new Error(
      data.message ||
      "Request failed"
    );
  }

  return data;
}

function statusClass(status){
  const key =
    String(status || "NONE")
      .toLowerCase();

  if(
    [
      "active",
      "trial",
      "past_due",
      "suspended"
    ].includes(key)
  ){
    return key;
  }

  return "none";
}

function dateInputValue(value){
  if(!value){
    return "";
  }

  const d = new Date(value);

  if(Number.isNaN(d.getTime())){
    return "";
  }

  return d
    .toISOString()
    .slice(0,10);
}

async function loadTenantSubscription(
  tenant
){
  try{
    const data =
      await api(
        `/api/platform-subscription/tenants/${encodeURIComponent(tenant._id)}/subscription`
      );

    return {
      tenant,
      subscription:
        data.subscription || null
    };
  }catch(err){
    return {
      tenant,
      subscription:null
    };
  }
}

async function load(){

  clearMessage();

  cards.innerHTML =
    `<div class="empty">Loading tenants...</div>`;

  try{

    const tenantResponse =
      await api(
        "/api/platform-admin/tenants"
      );

    const list =
      Array.isArray(tenantResponse)
        ? tenantResponse
        : (
            tenantResponse.tenants ||
            tenantResponse.items ||
            []
          );

    const results =
      await Promise.all(
        list.map(
          loadTenantSubscription
        )
      );

    tenants = results;

    render();

  }catch(err){

    console.error(err);

    cards.innerHTML =
      `<div class="empty">Unable to load tenants.</div>`;

    showMessage(
      err.message ||
      "Unable to load tenants.",
      "error"
    );
  }
}

function render(){

  const q =
    String(searchInput.value || "")
      .trim()
      .toLowerCase();

  const rows =
    tenants.filter(item=>{

      const name =
        String(
          item.tenant?.name ||
          ""
        ).toLowerCase();

      const slug =
        String(
          item.tenant?.slug ||
          ""
        ).toLowerCase();

      return (
        !q ||
        name.includes(q) ||
        slug.includes(q)
      );
    });

  if(!rows.length){
    cards.innerHTML =
      `<div class="empty">No tenants found.</div>`;
    return;
  }

  cards.innerHTML =
    rows.map(item=>{

      const t =
        item.tenant || {};

      const s =
        item.subscription || {};

      const status =
        String(
          s.status ||
          "NOT SET"
        ).toUpperCase();

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
                <select class="cycle">
                  <option value="ANNUAL" ${s.billingCycle === "ANNUAL" ? "selected" : ""}>Annual</option>
                  <option value="MONTHLY" ${s.billingCycle === "MONTHLY" ? "selected" : ""}>Monthly</option>
                </select>
              </div>

              <div class="field">
                <label>Amount</label>
                <input class="amount" type="number" min="0" step="0.01" value="${Number(s.amount || 0)}">
              </div>

            </div>

            <div class="row">

              <div class="field">
                <label>Due Date</label>
                <input class="due" type="date" value="${dateInputValue(s.dueDate)}">
              </div>

              <div class="field">
                <label>Grace Days</label>
                <input class="grace" type="number" min="0" max="60" value="${Number(s.graceDays ?? 3)}">
              </div>

            </div>

            <div class="status-line">
              <strong>Current Status</strong>
              <span class="badge ${statusClass(s.status)}">${esc(status)}</span>
            </div>

            <button class="save" type="button" onclick="saveTenant('${esc(t._id)}')">
              Save Subscription
            </button>

          </div>

        </article>
      `;
    }).join("");
}

async function saveTenant(
  tenantId
){

  clearMessage();

  const card =
    document.querySelector(
      `[data-id="${CSS.escape(tenantId)}"]`
    );

  if(!card){
    return;
  }

  const payload = {
    planName:
      card.querySelector(".plan").value.trim(),

    billingCycle:
      card.querySelector(".cycle").value,

    amount:
      Number(
        card.querySelector(".amount").value || 0
      ),

    dueDate:
      card.querySelector(".due").value || null,

    graceDays:
      Number(
        card.querySelector(".grace").value || 0
      )
  };

  try{

    await api(
      `/api/platform-subscription/tenants/${encodeURIComponent(tenantId)}/subscription`,
      {
        method:"PUT",
        headers:{
          "Content-Type":"application/json"
        },
        body:
          JSON.stringify(payload)
      }
    );

    showMessage(
      "Subscription updated successfully.",
      "ok"
    );

    await load();

  }catch(err){

    console.error(err);

    showMessage(
      err.message ||
      "Unable to update subscription.",
      "error"
    );
  }
}

window.saveTenant =
  saveTenant;

searchInput.addEventListener(
  "input",
  render
);

document
  .getElementById("refreshBtn")
  .addEventListener(
    "click",
    load
  );

load();
