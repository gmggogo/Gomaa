"use strict";

document.addEventListener("DOMContentLoaded", () => {

  function clean(v){
    return String(v ?? "").trim();
  }

  function normalizeRole(v){
    return clean(v)
      .toUpperCase()
      .replace(/[\s-]+/g,"_");
  }

  const token =
    clean(sessionStorage.getItem("staffToken")) ||
    clean(localStorage.getItem("token"));

  const role =
    normalizeRole(
      clean(sessionStorage.getItem("staffRole")) ||
      clean(localStorage.getItem("role"))
    );

  if(!token || role !== "PLATFORM_ADMIN"){
    window.location.replace("/login.html");
    return;
  }

  const cards =
    document.getElementById("tenantCards");

  const searchInput =
    document.getElementById("searchInput");

  const refreshBtn =
    document.getElementById("refreshBtn");

  const messageBox =
    document.getElementById("messageBox");

  const stripeStatusBadge =
    document.getElementById("stripeStatusBadge");

  const stripeAccountId =
    document.getElementById("stripeAccountId");

  const stripeMode =
    document.getElementById("stripeMode");

  const stripeCharges =
    document.getElementById("stripeCharges");

  const stripePayouts =
    document.getElementById("stripePayouts");

  const stripeRefreshBtn =
    document.getElementById("stripeRefreshBtn");

  const stripeDashboardBtn =
    document.getElementById("stripeDashboardBtn");

  let records = [];

  function esc(v){
    return String(v ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function showMessage(text,type="ok"){
    if(!messageBox){
      return;
    }

    messageBox.textContent = text;
    messageBox.className =
      "message show " + type;
  }

  function clearMessage(){
    if(!messageBox){
      return;
    }

    messageBox.textContent = "";
    messageBox.className = "message";
  }

  async function api(url,options={}){
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
      await res.json().catch(()=>({}));

    if(!res.ok){
      throw new Error(
        data.message ||
        `Request failed (${res.status})`
      );
    }

    return data;
  }

  function dateValue(v){
    if(!v){
      return "";
    }

    const d =
      new Date(v);

    if(Number.isNaN(d.getTime())){
      return "";
    }

    return d
      .toISOString()
      .slice(0,10);
  }

  function statusClass(v){
    const s =
      clean(v)
        .toLowerCase();

    if(s === "active"){
      return "active";
    }

    if(s === "trial"){
      return "trial";
    }

    if(s === "past_due"){
      return "past_due";
    }

    if(
      s === "suspended" ||
      s === "disabled"
    ){
      return "suspended";
    }

    return "none";
  }

  async function loadPlatformStripe(){

    if(
      !stripeStatusBadge ||
      !stripeAccountId ||
      !stripeMode ||
      !stripeCharges ||
      !stripePayouts
    ){
      return;
    }

    try{

      const data =
        await api(
          "/api/platform-stripe/status"
        );

      const connected =
        data.connected === true;

      stripeStatusBadge.textContent =
        connected
          ? "CONNECTED"
          : "NOT CONNECTED";

      stripeStatusBadge.className =
        "stripe-badge" +
        (connected ? " connected" : "");

      stripeAccountId.textContent =
        data.accountId ||
        "--";

      stripeMode.textContent =
        data.mode ||
        "--";

      stripeCharges.textContent =
        data.chargesEnabled === true
          ? "ENABLED"
          : "DISABLED";

      stripePayouts.textContent =
        data.payoutsEnabled === true
          ? "ENABLED"
          : "DISABLED";

      if(stripeDashboardBtn){

        stripeDashboardBtn.disabled =
          !data.dashboardUrl;

        stripeDashboardBtn.dataset.url =
          data.dashboardUrl ||
          "";
      }

    }catch(err){

      console.error(
        "PLATFORM STRIPE STATUS ERROR:",
        err
      );

      stripeStatusBadge.textContent =
        "NOT CONNECTED";

      stripeStatusBadge.className =
        "stripe-badge";

      stripeAccountId.textContent = "--";
      stripeMode.textContent = "--";
      stripeCharges.textContent = "--";
      stripePayouts.textContent = "--";

      /*
        Stripe status failure must NEVER stop
        the tenant billing cards from loading.
      */
      showMessage(
        err.message ||
        "Unable to load platform Stripe account.",
        "error"
      );
    }
  }

  async function loadTenants(){

    if(!cards){
      return;
    }

    cards.innerHTML =
      `<div class="empty">Loading tenants...</div>`;

    try{

      const tenants =
        await api(
          "/api/platform-admin/tenants"
        );

      if(!Array.isArray(tenants)){
        throw new Error(
          "Invalid tenants response"
        );
      }

      records =
        await Promise.all(
          tenants.map(
            async tenant=>{

              try{

                const data =
                  await api(
                    `/api/platform-subscription/tenants/${encodeURIComponent(tenant._id)}/subscription`
                  );

                return {
                  tenant,
                  subscription:
                    data.subscription ||
                    null
                };

              }catch(err){

                console.error(
                  "TENANT SUBSCRIPTION LOAD ERROR:",
                  tenant?._id,
                  err
                );

                return {
                  tenant,
                  subscription:null
                };
              }
            }
          )
        );

      render();

    }catch(err){

      console.error(
        "PLATFORM BILLING LOAD ERROR:",
        err
      );

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

    if(!cards){
      return;
    }

    const q =
      clean(
        searchInput?.value
      ).toLowerCase();

    const list =
      records.filter(item=>{

        const name =
          clean(
            item.tenant?.name
          ).toLowerCase();

        const slug =
          clean(
            item.tenant?.slug
          ).toLowerCase();

        return (
          !q ||
          name.includes(q) ||
          slug.includes(q)
        );
      });

    if(!list.length){

      cards.innerHTML =
        `<div class="empty">No tenants found.</div>`;

      return;
    }

    cards.innerHTML =
      list.map(item=>{

        const t =
          item.tenant ||
          {};

        const s =
          item.subscription ||
          {};

        const tenantEnabled =
          t.enabled !== false;

        const status =
          tenantEnabled
            ? clean(
                s.status ||
                t.subscriptionStatus ||
                "ACTIVE"
              ).toUpperCase()
            : "DISABLED";

        return `
          <article
            class="tenant-card"
            data-id="${esc(t._id)}"
          >

            <div class="tenant-head">

              <div class="tenant-name">
                ${esc(t.name || "Tenant")}
              </div>

              <div class="tenant-slug">
                ${esc(t.slug || "")}
              </div>

            </div>

            <div class="tenant-body">

              <div class="field">

                <label>
                  Plan Name
                </label>

                <input
                  class="plan"
                  value="${esc(s.planName || "GH Mobility")}"
                  disabled
                >

              </div>

              <div class="row">

                <div class="field">

                  <label>
                    Billing Cycle
                  </label>

                  <select
                    class="cycle"
                    disabled
                  >
                    <option
                      value="ANNUAL"
                      ${s.billingCycle === "ANNUAL" ? "selected" : ""}
                    >
                      Annual
                    </option>

                    <option
                      value="MONTHLY"
                      ${s.billingCycle === "MONTHLY" ? "selected" : ""}
                    >
                      Monthly
                    </option>
                  </select>

                </div>

                <div class="field">

                  <label>
                    Amount
                  </label>

                  <input
                    class="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value="${Number(s.amount || 0)}"
                    disabled
                  >

                </div>

              </div>

              <div class="row">

                <div class="field">

                  <label>
                    Due Date
                  </label>

                  <input
                    class="due"
                    type="date"
                    value="${dateValue(s.dueDate)}"
                    disabled
                  >

                </div>

                <div class="field">

                  <label>
                    Grace Days
                  </label>

                  <input
                    class="grace"
                    type="number"
                    min="0"
                    max="60"
                    value="${Number(s.graceDays ?? 3)}"
                    disabled
                  >

                </div>

              </div>

              <div class="status-line">

                <strong>
                  Current Status
                </strong>

                <span
                  class="badge ${statusClass(status)}"
                >
                  ${esc(status)}
                </span>

              </div>

              <div class="actions">

                <button
                  class="edit-btn"
                  type="button"
                  data-action="edit"
                >
                  Edit
                </button>

                <button
                  class="save"
                  type="button"
                  data-action="save"
                  disabled
                >
                  Save Subscription
                </button>

              </div>

            </div>

          </article>
        `;
      }).join("");
  }

  function editTenant(card){

    if(!card){
      return;
    }

    card
      .querySelectorAll(
        "input,select"
      )
      .forEach(el=>{
        el.disabled = false;
      });

    const saveButton =
      card.querySelector(
        ".save"
      );

    if(saveButton){
      saveButton.disabled =
        false;
    }
  }

  async function saveTenant(card){

    if(!card){
      return;
    }

    const id =
      clean(
        card.dataset.id
      );

    if(!id){
      return;
    }

    const plan =
      card.querySelector(
        ".plan"
      );

    const cycle =
      card.querySelector(
        ".cycle"
      );

    const amount =
      card.querySelector(
        ".amount"
      );

    const due =
      card.querySelector(
        ".due"
      );

    const grace =
      card.querySelector(
        ".grace"
      );

    const payload = {

      planName:
        clean(
          plan?.value
        ) ||
        "GH Mobility",

      billingCycle:
        cycle?.value ||
        "ANNUAL",

      amount:
        Number(
          amount?.value ||
          0
        ),

      dueDate:
        due?.value ||
        null,

      graceDays:
        Number(
          grace?.value ||
          0
        )
    };

    try{

      clearMessage();

      await api(
        `/api/platform-subscription/tenants/${encodeURIComponent(id)}/subscription`,
        {
          method:"PUT",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              payload
            )
        }
      );

      showMessage(
        "Subscription updated successfully.",
        "ok"
      );

      await loadTenants();

    }catch(err){

      console.error(
        "SAVE SUBSCRIPTION ERROR:",
        err
      );

      showMessage(
        err.message ||
        "Unable to update subscription.",
        "error"
      );
    }
  }

  if(searchInput){

    searchInput.addEventListener(
      "input",
      render
    );
  }

  if(refreshBtn){

    refreshBtn.addEventListener(
      "click",
      ()=>{
        clearMessage();
        loadTenants();
        loadPlatformStripe();
      }
    );
  }

  if(stripeRefreshBtn){

    stripeRefreshBtn.addEventListener(
      "click",
      ()=>{
        clearMessage();
        loadPlatformStripe();
      }
    );
  }

  if(stripeDashboardBtn){

    stripeDashboardBtn.addEventListener(
      "click",
      ()=>{

        const url =
          clean(
            stripeDashboardBtn.dataset.url
          );

        if(url){

          window.open(
            url,
            "_blank",
            "noopener"
          );
        }
      }
    );
  }

  if(cards){

    cards.addEventListener(
      "click",
      event=>{

        const button =
          event.target.closest(
            "button"
          );

        if(!button){
          return;
        }

        const card =
          button.closest(
            ".tenant-card"
          );

        if(!card){
          return;
        }

        if(
          button.dataset.action ===
          "edit"
        ){
          editTenant(card);
          return;
        }

        if(
          button.dataset.action ===
          "save"
        ){
          saveTenant(card);
        }
      }
    );
  }

  /*
    Load tenant cards independently.
    Even if Stripe status fails,
    tenant cards still load.
  */
  loadTenants();
  loadPlatformStripe();

});
