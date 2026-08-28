"use strict";

document.addEventListener("DOMContentLoaded",()=>{

  function clean(v){
    return String(v ?? "").trim();
  }

  function esc(v){
    return String(v ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function money(v){
    const n = Number(v || 0);
    return "$" + (Number.isFinite(n) ? n : 0).toFixed(2);
  }

  function dateText(v){
    if(!v) return "--";

    const d = new Date(v);

    return Number.isNaN(d.getTime())
      ? "--"
      : d.toLocaleDateString("en-US");
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
    document.getElementById("companyCards");

  const searchInput =
    document.getElementById("searchInput");

  const statusFilter =
    document.getElementById("statusFilter");

  const messageBox =
    document.getElementById("messageBox");

  let dataStore = {
    defaultPackage:null,
    companies:[]
  };

  let defaultBackup = null;

  function showMessage(text,type="ok"){
    messageBox.textContent = text;
    messageBox.className =
      "message show " + type;
  }

  function clearMessage(){
    messageBox.textContent = "";
    messageBox.className =
      "message";
  }

  async function api(url,options={}){
    const res =
      await fetch(url,{
        ...options,
        headers:{
          ...(options.headers || {}),
          Authorization:"Bearer " + token
        },
        cache:"no-store"
      });

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

  function badgeClass(v){
    const s = clean(v).toLowerCase();

    if(["active","connected","paid"].includes(s)){
      return "active";
    }

    if(["disabled","suspended","failed","canceled"].includes(s)){
      return "disabled";
    }

    if(["past_due","pending","processing"].includes(s)){
      return "pending";
    }

    return "";
  }

  async function loadStripe(){
    const badge =
      document.getElementById("stripeStatusBadge");

    try{
      const data =
        await api("/api/platform-stripe/status");

      const connected =
        data.connected === true;

      badge.textContent =
        connected
          ? "CONNECTED"
          : "NOT CONNECTED";

      badge.className =
        "badge " +
        (connected ? "connected" : "disabled");

      document.getElementById("stripeAccountId").textContent =
        data.accountId || "--";

      document.getElementById("stripeMode").textContent =
        data.mode || "--";

      document.getElementById("stripeCharges").textContent =
        data.chargesEnabled
          ? "ENABLED"
          : "DISABLED";

      document.getElementById("stripePayouts").textContent =
        data.payoutsEnabled
          ? "ENABLED"
          : "DISABLED";

      const dashboard =
        document.getElementById("stripeDashboardBtn");

      dashboard.disabled =
        !data.dashboardUrl;

      dashboard.dataset.url =
        data.dashboardUrl || "";

    }catch(err){
      console.error(err);

      badge.textContent =
        "NOT CONNECTED";

      badge.className =
        "badge disabled";
    }
  }

  const defaultIds = [
    "dPackageName",
    "dBasePrice",
    "dIncludedVehicles",
    "dIncludedServices",
    "dBillingCycle",
    "dExtraVehiclePrice",
    "dExtraServicePrice",
    "dPackageStatus"
  ];

  function lockDefault(locked){
    defaultIds.forEach(id=>{
      document.getElementById(id).disabled =
        locked;
    });

    document.getElementById("defaultEditBtn").disabled =
      !locked;

    document.getElementById("defaultSaveBtn").disabled =
      locked;

    document.getElementById("defaultCancelBtn").disabled =
      locked;
  }

  function fillDefault(row){
    if(!row) return;

    document.getElementById("dPackageName").value =
      row.packageName || "";

    document.getElementById("dBasePrice").value =
      Number(row.basePrice || 0);

    document.getElementById("dIncludedVehicles").value =
      Number(row.includedVehicles || 0);

    document.getElementById("dIncludedServices").value =
      Number(row.includedServices || 0);

    document.getElementById("dBillingCycle").value =
      row.billingCycle || "MONTHLY";

    document.getElementById("dExtraVehiclePrice").value =
      Number(row.extraVehiclePrice || 0);

    document.getElementById("dExtraServicePrice").value =
      Number(row.extraServicePrice || 0);

    document.getElementById("dPackageStatus").value =
      row.packageStatus || "ACTIVE";

    const badge =
      document.getElementById("defaultPackageBadge");

    badge.textContent =
      row.packageStatus || "ACTIVE";

    badge.className =
      "badge " +
      (
        row.packageStatus === "DISABLED"
          ? "disabled"
          : "active"
      );

    lockDefault(true);
  }

  function readDefault(){
    return {
      packageName:
        clean(document.getElementById("dPackageName").value),

      basePrice:
        Number(document.getElementById("dBasePrice").value || 0),

      includedVehicles:
        Number(document.getElementById("dIncludedVehicles").value || 0),

      includedServices:
        Number(document.getElementById("dIncludedServices").value || 0),

      billingCycle:
        document.getElementById("dBillingCycle").value,

      extraVehiclePrice:
        Number(document.getElementById("dExtraVehiclePrice").value || 0),

      extraServicePrice:
        Number(document.getElementById("dExtraServicePrice").value || 0),

      packageStatus:
        document.getElementById("dPackageStatus").value
    };
  }

  function companyStatus(row){
    if(row.tenant?.enabled === false){
      return "DISABLED";
    }

    return clean(
      row.subscription?.status ||
      row.tenant?.subscriptionStatus ||
      "ACTIVE"
    ).toUpperCase();
  }

  function controlTable(rows,type){
    if(!Array.isArray(rows) || !rows.length){
      return `
        <tr>
          <td colspan="3">
            No ${type === "vehicle" ? "vehicles" : "services"} found.
          </td>
        </tr>
      `;
    }

    return rows.map(row=>`
      <tr
        data-control-type="${type}"
        data-control-key="${esc(row.key)}"
        data-control-label="${esc(row.label)}"
      >
        <td>${esc(row.label)}</td>
        <td>
          <input
            class="access-toggle"
            type="checkbox"
            ${row.accessEnabled !== false ? "checked" : ""}
            disabled
          >
        </td>
        <td>
          <input
            class="billing-toggle"
            type="checkbox"
            ${row.billingEnabled !== false ? "checked" : ""}
            disabled
          >
        </td>
      </tr>
    `).join("");
  }

  function render(){
    const q =
      clean(searchInput.value).toLowerCase();

    const filter =
      clean(statusFilter.value).toUpperCase();

    const list =
      dataStore.companies.filter(row=>{
        const name =
          clean(row.tenant?.name).toLowerCase();

        const slug =
          clean(row.tenant?.slug).toLowerCase();

        const status =
          companyStatus(row);

        return (
          (!q || name.includes(q) || slug.includes(q)) &&
          (!filter || status === filter)
        );
      });

    if(!list.length){
      cards.innerHTML =
        `<div class="empty">No companies found.</div>`;
      return;
    }

    cards.innerHTML =
      list.map(row=>{
        const t = row.tenant || {};
        const s = row.subscription || {};
        const p = row.pricing || {};
        const status = companyStatus(row);

        return `
          <article class="card" data-id="${esc(t.id)}">

            <div class="card-head">
              <div>
                <div class="card-name">${esc(t.name || "Company")}</div>
                <div class="card-slug">${esc(t.slug || "")}</div>
              </div>

              <span class="badge ${badgeClass(status)}">
                ${esc(status)}
              </span>
            </div>

            <div class="card-body">

              <div class="subhead">Company Usage</div>

              <div class="usage">
                <div class="info"><span>Actual Vehicles</span><strong>${Number(p.actualVehicles || 0)}</strong></div>
                <div class="info"><span>Enabled Services</span><strong>${Number(p.enabledServices || 0)}</strong></div>
                <div class="info"><span>Included Vehicles</span><strong>${Number(p.includedVehicles || 0)}</strong></div>
                <div class="info"><span>Included Services</span><strong>${Number(p.includedServices || 0)}</strong></div>
                <div class="info"><span>Extra Vehicles</span><strong>${Number(p.extraVehicles || 0)}</strong></div>
                <div class="info"><span>Extra Services</span><strong>${Number(p.extraServices || 0)}</strong></div>
                <div class="info"><span>Last Payment</span><strong>${dateText(s.lastPaymentDate)}</strong></div>
                <div class="info"><span>Next Payment</span><strong>${dateText(s.nextBillingDate || s.dueDate)}</strong></div>
              </div>

              <div class="subhead">Access & Billing Controls</div>

              <table class="controls">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Access</th>
                    <th>Billing</th>
                  </tr>
                </thead>
                <tbody>
                  ${controlTable(p.vehicleControls,"vehicle")}
                </tbody>
              </table>

              <table class="controls">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Access</th>
                    <th>Billing</th>
                  </tr>
                </thead>
                <tbody>
                  ${controlTable(p.serviceControls,"service")}
                </tbody>
              </table>

              <div class="subhead">Company Pricing Overrides</div>

              <div class="company-grid">

                <div class="field">
                  <label>Package Name</label>
                  <input class="plan-name" value="${esc(s.planName || "")}" disabled>
                </div>

                <div class="field">
                  <label>Billing Cycle</label>
                  <select class="cycle" disabled>
                    <option value="MONTHLY" ${s.billingCycle === "MONTHLY" ? "selected" : ""}>Monthly</option>
                    <option value="ANNUAL" ${s.billingCycle === "ANNUAL" ? "selected" : ""}>Annual</option>
                  </select>
                </div>

                <div class="field">
                  <label>Subscription Status</label>
                  <select class="status" disabled>
                    <option value="ACTIVE" ${s.status === "ACTIVE" ? "selected" : ""}>Active</option>
                    <option value="TRIAL" ${s.status === "TRIAL" ? "selected" : ""}>Trial</option>
                    <option value="PAST_DUE" ${s.status === "PAST_DUE" ? "selected" : ""}>Past Due</option>
                    <option value="SUSPENDED" ${s.status === "SUSPENDED" ? "selected" : ""}>Suspended</option>
                  </select>
                </div>

                <div class="field">
                  <label>Base Package Enabled</label>
                  <select class="base-enabled" disabled>
                    <option value="true" ${s.basePackageEnabled !== false ? "selected" : ""}>Active</option>
                    <option value="false" ${s.basePackageEnabled === false ? "selected" : ""}>Disabled</option>
                  </select>
                </div>

                <div class="field">
                  <label>Custom Base Price</label>
                  <input class="base-price" type="number" min="0" step="0.01" value="${Number(s.basePrice || 0)}" disabled>
                </div>

                <div class="field">
                  <label>Included Vehicles</label>
                  <input class="included-vehicles" type="number" min="0" value="${Number(s.includedVehicles || 0)}" disabled>
                </div>

                <div class="field">
                  <label>Included Services</label>
                  <input class="included-services" type="number" min="0" value="${Number(s.includedServices || 0)}" disabled>
                </div>

                <div class="field">
                  <label>Extra Vehicle Price</label>
                  <input class="extra-vehicle-price" type="number" min="0" step="0.01" value="${Number(s.extraVehiclePrice || 0)}" disabled>
                </div>

                <div class="field">
                  <label>Extra Service Price</label>
                  <input class="extra-service-price" type="number" min="0" step="0.01" value="${Number(s.extraServicePrice || 0)}" disabled>
                </div>

                <div class="field">
                  <label>Free Extra Vehicles</label>
                  <input class="free-extra-vehicles" type="number" min="0" value="${Number(s.freeExtraVehicles || 0)}" disabled>
                </div>

                <div class="field">
                  <label>Free Extra Services</label>
                  <input class="free-extra-services" type="number" min="0" value="${Number(s.freeExtraServices || 0)}" disabled>
                </div>

                <div class="field">
                  <label>Discount</label>
                  <input class="discount" type="number" min="0" step="0.01" value="${Number(s.discount || 0)}" disabled>
                </div>

                <div class="field">
                  <label>Credit</label>
                  <input class="credit" type="number" min="0" step="0.01" value="${Number(s.credit || 0)}" disabled>
                </div>

                <div class="field">
                  <label>Final Price Override</label>
                  <input class="final-override" type="number" min="0" step="0.01" value="${s.finalPriceOverride === null || s.finalPriceOverride === undefined ? "" : Number(s.finalPriceOverride)}" disabled>
                </div>

                <div class="field">
                  <label>Grace Days</label>
                  <input class="grace-days" type="number" min="0" max="60" value="${Number(s.graceDays ?? 3)}" disabled>
                </div>

                <div class="field">
                  <label>Due Date</label>
                  <input class="due-date" type="date" value="${s.dueDate ? new Date(s.dueDate).toISOString().slice(0,10) : ""}" disabled>
                </div>

              </div>

              <div class="total">
                <span>Current Final Amount</span>
                <strong>${money(p.finalAmount)}</strong>
              </div>

              <div class="actions">
                <button class="btn primary" data-action="edit" type="button">Edit</button>
                <button class="btn purple" data-action="preview" type="button">Preview Price</button>
                <button class="btn gold" data-action="save" type="button" disabled>Save Pricing</button>
                <button class="btn gray" data-action="cancel" type="button" disabled>Cancel</button>
                <button class="btn primary" data-action="history" type="button">Payment History</button>
              </div>

            </div>
          </article>
        `;
      }).join("");
  }

  function setEditing(card,editing){
    card.querySelectorAll(
      ".card-body input,.card-body select"
    ).forEach(el=>{
      el.disabled = !editing;
    });

    card.querySelector('[data-action="edit"]').disabled =
      editing;

    card.querySelector('[data-action="save"]').disabled =
      !editing;

    card.querySelector('[data-action="cancel"]').disabled =
      !editing;
  }

  function readControls(card,type){
    return [
      ...card.querySelectorAll(
        `[data-control-type="${type}"]`
      )
    ].map(row=>({
      key:row.dataset.controlKey,
      label:row.dataset.controlLabel,
      accessEnabled:
        row.querySelector(".access-toggle")?.checked === true,
      billingEnabled:
        row.querySelector(".billing-toggle")?.checked === true
    }));
  }

  function readCard(card){
    const override =
      clean(
        card.querySelector(".final-override").value
      );

    return {
      planName:
        clean(card.querySelector(".plan-name").value),

      billingCycle:
        card.querySelector(".cycle").value,

      status:
        card.querySelector(".status").value,

      basePackageEnabled:
        card.querySelector(".base-enabled").value === "true",

      basePrice:
        Number(card.querySelector(".base-price").value || 0),

      includedVehicles:
        Number(card.querySelector(".included-vehicles").value || 0),

      includedServices:
        Number(card.querySelector(".included-services").value || 0),

      extraVehiclePrice:
        Number(card.querySelector(".extra-vehicle-price").value || 0),

      extraServicePrice:
        Number(card.querySelector(".extra-service-price").value || 0),

      freeExtraVehicles:
        Number(card.querySelector(".free-extra-vehicles").value || 0),

      freeExtraServices:
        Number(card.querySelector(".free-extra-services").value || 0),

      discount:
        Number(card.querySelector(".discount").value || 0),

      credit:
        Number(card.querySelector(".credit").value || 0),

      finalPriceOverride:
        override === ""
          ? null
          : Number(override),

      graceDays:
        Number(card.querySelector(".grace-days").value || 0),

      dueDate:
        card.querySelector(".due-date").value || null,

      vehicleControls:
        readControls(card,"vehicle"),

      serviceControls:
        readControls(card,"service")
    };
  }

  function openModal(id){
    document.getElementById(id)
      .classList.add("show");
  }

  function closeModal(id){
    document.getElementById(id)
      .classList.remove("show");
  }

  function previewMarkup(p){
    return `
      <table class="breakdown">
        <tr><th>Pricing Item</th><th>Calculation</th></tr>
        <tr><td>Base Package</td><td>${money(p.baseAmount)}</td></tr>
        <tr><td>Actual Vehicles</td><td>${Number(p.actualVehicles || 0)}</td></tr>
        <tr><td>Included Vehicles</td><td>${Number(p.includedVehicles || 0)}</td></tr>
        <tr><td>Billable Extra Vehicles</td><td>${Number(p.billableExtraVehicles || 0)} × ${money(p.extraVehiclePrice)} = ${money(p.vehicleAmount)}</td></tr>
        <tr><td>Enabled Services</td><td>${Number(p.enabledServices || 0)}</td></tr>
        <tr><td>Included Services</td><td>${Number(p.includedServices || 0)}</td></tr>
        <tr><td>Billable Extra Services</td><td>${Number(p.billableExtraServices || 0)} × ${money(p.extraServicePrice)} = ${money(p.serviceAmount)}</td></tr>
        <tr><td>Discount</td><td>-${money(p.discount)}</td></tr>
        <tr><td>Credit</td><td>-${money(p.credit)}</td></tr>
        <tr><td><strong>Final Amount</strong></td><td><strong>${money(p.finalAmount)}</strong></td></tr>
      </table>
    `;
  }

  async function previewCard(card){
    try{
      const id = card.dataset.id;

      const data =
        await api(
          `/api/platform-subscription/tenants/${encodeURIComponent(id)}/preview`,
          {
            method:"POST",
            headers:{
              "Content-Type":"application/json"
            },
            body:JSON.stringify(
              readCard(card)
            )
          }
        );

      document.getElementById("previewBody").innerHTML =
        previewMarkup(data.pricing);

      openModal("previewModal");

    }catch(err){
      showMessage(err.message,"error");
    }
  }

  async function saveCard(card){
    if(
      !window.confirm(
        "Save this company's pricing changes?"
      )
    ){
      return;
    }

    try{
      const id = card.dataset.id;

      await api(
        `/api/platform-subscription/tenants/${encodeURIComponent(id)}/subscription`,
        {
          method:"PUT",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify(
            readCard(card)
          )
        }
      );

      showMessage(
        "Company pricing saved successfully.",
        "ok"
      );

      await loadBilling();

    }catch(err){
      showMessage(err.message,"error");
    }
  }

  async function showHistory(card){
    try{
      const id = card.dataset.id;

      const data =
        await api(
          `/api/platform-subscription/tenants/${encodeURIComponent(id)}/payment-history`
        );

      const rows =
        Array.isArray(data.history)
          ? data.history
          : [];

      document.getElementById("historyBody").innerHTML =
        rows.length
          ? `
            <table class="breakdown">
              <tr>
                <th>Payment Date</th>
                <th>Invoice Number</th>
                <th>Billing Cycle</th>
                <th>Payment Method</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>

              ${rows.map(row=>`
                <tr>
                  <td>${dateText(row.paidAt || row.createdAt)}</td>
                  <td>${esc(row.invoiceNumber || "--")}</td>
                  <td>${esc(row.billingCycle || "--")}</td>
                  <td>${esc(row.paymentMethod || "--")}</td>
                  <td>${esc(row.status || "--")}</td>
                  <td>${money(row.amount)}</td>
                </tr>
              `).join("")}
            </table>
          `
          : `<div class="empty">No payment history.</div>`;

      openModal("historyModal");

    }catch(err){
      showMessage(err.message,"error");
    }
  }

  async function loadBilling(){
    cards.innerHTML =
      `<div class="empty">Loading companies...</div>`;

    try{
      const data =
        await api(
          "/api/platform-subscription/bootstrap"
        );

      dataStore.defaultPackage =
        data.defaultPackage || null;

      dataStore.companies =
        Array.isArray(data.companies)
          ? data.companies
          : [];

      fillDefault(
        dataStore.defaultPackage
      );

      render();

    }catch(err){
      cards.innerHTML =
        `<div class="empty">Unable to load companies.</div>`;

      showMessage(
        err.message,
        "error"
      );
    }
  }

  document.getElementById("defaultEditBtn")
    .addEventListener("click",()=>{
      defaultBackup =
        readDefault();

      lockDefault(false);
    });

  document.getElementById("defaultCancelBtn")
    .addEventListener("click",()=>{
      fillDefault(
        defaultBackup ||
        dataStore.defaultPackage
      );

      defaultBackup = null;
    });

  document.getElementById("defaultSaveBtn")
    .addEventListener("click",async()=>{
      if(
        !window.confirm(
          "Save the new Default Package? It will apply to new companies only."
        )
      ){
        return;
      }

      try{
        const result =
          await api(
            "/api/platform-subscription/default-package",
            {
              method:"PUT",
              headers:{
                "Content-Type":"application/json"
              },
              body:JSON.stringify(
                readDefault()
              )
            }
          );

        dataStore.defaultPackage =
          result.defaultPackage;

        fillDefault(
          result.defaultPackage
        );

        showMessage(
          "Default Package saved. Existing company pricing was not changed.",
          "ok"
        );

      }catch(err){
        showMessage(
          err.message,
          "error"
        );
      }
    });

  searchInput.addEventListener(
    "input",
    render
  );

  statusFilter.addEventListener(
    "change",
    render
  );

  document.getElementById("refreshBtn")
    .addEventListener("click",()=>{
      clearMessage();
      loadBilling();
      loadStripe();
    });

  document.getElementById("stripeRefreshBtn")
    .addEventListener(
      "click",
      loadStripe
    );

  document.getElementById("stripeDashboardBtn")
    .addEventListener("click",event=>{
      const url =
        clean(
          event.currentTarget.dataset.url
        );

      if(url){
        window.open(
          url,
          "_blank",
          "noopener"
        );
      }
    });

  cards.addEventListener("click",event=>{
    const button =
      event.target.closest("button");

    if(!button) return;

    const card =
      button.closest(".card");

    if(!card) return;

    const action =
      button.dataset.action;

    if(action === "edit"){
      setEditing(card,true);
      return;
    }

    if(action === "cancel"){
      render();
      return;
    }

    if(action === "preview"){
      previewCard(card);
      return;
    }

    if(action === "save"){
      saveCard(card);
      return;
    }

    if(action === "history"){
      showHistory(card);
    }
  });

  document.querySelectorAll("[data-close]")
    .forEach(button=>{
      button.addEventListener("click",()=>{
        closeModal(
          button.dataset.close
        );
      });
    });

  document.querySelectorAll(".modal")
    .forEach(modal=>{
      modal.addEventListener("click",event=>{
        if(event.target === modal){
          modal.classList.remove("show");
        }
      });
    });

  loadStripe();
  loadBilling();
});