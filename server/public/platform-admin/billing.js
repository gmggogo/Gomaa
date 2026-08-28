"use strict";

document.addEventListener("DOMContentLoaded",()=>{

  const clean = v => String(v ?? "").trim();

  const esc = v => String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");

  const money = v => {
    const n = Number(v || 0);
    return "$" + (Number.isFinite(n) ? n : 0).toFixed(2);
  };

  const dateText = v => {
    if(!v) return "--";
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? "--"
      : d.toLocaleDateString("en-US");
  };

  const normalizeRole = v => clean(v)
    .toUpperCase()
    .replace(/[\s-]+/g,"_");

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

  const state = {
    companies:[],
    defaultPackage:null,
    selectedId:"",
    filter:"",
    search:"",
    defaultBackup:null
  };

  const messageBox = document.getElementById("messageBox");
  const companyList = document.getElementById("companyList");
  const companyDetail = document.getElementById("companyDetail");
  const searchInput = document.getElementById("searchInput");

  function showMessage(text,type="ok"){
    messageBox.textContent = text;
    messageBox.className = "message show " + type;
  }

  function clearMessage(){
    messageBox.textContent = "";
    messageBox.className = "message";
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
      throw new Error(
        data.message ||
        `Request failed (${res.status})`
      );
    }

    return data;
  }

  function companyStatus(row){
    if(row?.tenant?.enabled === false){
      return "DISABLED";
    }

    return clean(
      row?.subscription?.status ||
      row?.tenant?.subscriptionStatus ||
      "ACTIVE"
    ).toUpperCase();
  }

  function badgeClass(status){
    const s = clean(status).toLowerCase();

    if(["active","connected","paid"].includes(s)){
      return "active";
    }

    if(["disabled","suspended","failed","canceled"].includes(s)){
      return "disabled";
    }

    if(["pending","processing","past_due"].includes(s)){
      return "pending";
    }

    return "";
  }

  function filteredCompanies(){
    return state.companies.filter(row=>{
      const name = clean(row.tenant?.name).toLowerCase();
      const slug = clean(row.tenant?.slug).toLowerCase();
      const status = companyStatus(row);

      return (
        (!state.search || name.includes(state.search) || slug.includes(state.search)) &&
        (!state.filter || status === state.filter)
      );
    });
  }

  function selectedCompany(){
    return state.companies.find(
      row=>String(row.tenant?.id) === String(state.selectedId)
    ) || null;
  }

  function renderSidebar(){
    const list = filteredCompanies();

    if(!list.length){
      companyList.innerHTML =
        `<div class="empty-state">No companies found.</div>`;
      return;
    }

    companyList.innerHTML = list.map(row=>{
      const t = row.tenant || {};
      const status = companyStatus(row);
      const active =
        String(t.id) === String(state.selectedId);

      return `
        <button
          class="company-item ${active ? "active" : ""}"
          data-company-id="${esc(t.id)}"
          type="button"
        >
          <div class="company-item-row">
            <div class="company-item-name">${esc(t.name || "Company")}</div>
            <span class="badge ${badgeClass(status)}">${esc(status)}</span>
          </div>
          <div class="company-item-sub">${esc(t.slug || "")}</div>
        </button>
      `;
    }).join("");
  }

  function toggleCell(row,kind){
    const enabled =
      kind === "access"
        ? row.accessEnabled !== false
        : row.billingEnabled !== false;

    let label = enabled ? "Enabled" : "Disabled";
    let cls = enabled ? "on" : "off";

    if(kind === "billing" && !enabled){
      label = "Free";
      cls = "free";
    }

    const fieldClass =
      kind === "access"
        ? "access-toggle"
        : "billing-toggle";

    return `
      <label class="toggle ${cls}">
        <input
          class="${fieldClass}"
          type="checkbox"
          ${enabled ? "checked" : ""}
          disabled
        >
        <span>${label}</span>
      </label>
    `;
  }

  function usageRows(rows,type){
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
        <td>${toggleCell(row,"access")}</td>
        <td>${toggleCell(row,"billing")}</td>
      </tr>
    `).join("");
  }

  function renderCompany(){
    const row = selectedCompany();

    if(!row){
      companyDetail.innerHTML =
        `<div class="empty-state">Select a company to view billing details.</div>`;
      return;
    }

    const t = row.tenant || {};
    const s = row.subscription || {};
    const p = row.pricing || {};
    const status = companyStatus(row);
    const enabled = t.enabled !== false;

    companyDetail.innerHTML = `
      <div class="company-header">
        <div class="company-title">
          <h2>${esc(t.name || "Company")}</h2>
          <p>${esc(t.slug || "")}</p>
        </div>

        <div class="company-actions">
          <span class="badge ${badgeClass(status)}">${esc(status)}</span>

          <button
            class="btn ${enabled ? "red" : "green"}"
            data-action="toggle-company"
            data-enabled="${enabled ? "true" : "false"}"
            type="button"
          >
            ${enabled ? "Disable Company" : "Enable Company"}
          </button>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <span>Current Amount</span>
          <strong>${money(p.finalAmount)}</strong>
        </div>

        <div class="summary-card">
          <span>Vehicles</span>
          <strong>${Number(p.actualVehicles || 0)} / ${Number(p.includedVehicles || 0)}</strong>
        </div>

        <div class="summary-card">
          <span>Services</span>
          <strong>${Number(p.enabledServices || 0)} / ${Number(p.includedServices || 0)}</strong>
        </div>

        <div class="summary-card">
          <span>Next Payment</span>
          <strong>${dateText(s.nextBillingDate || s.dueDate)}</strong>
        </div>
      </div>

      <div class="detail-tabs">
        <button class="detail-tab active" data-tab="overview" type="button">Overview</button>
        <button class="detail-tab" data-tab="usage" type="button">Usage & Access</button>
        <button class="detail-tab" data-tab="pricing" type="button">Pricing</button>
        <button class="detail-tab" data-tab="payments" type="button">Payments</button>
      </div>

      <div class="panel active" data-panel="overview">

        <div class="section">
          <div class="section-title">Subscription Overview</div>
          <div class="section-body">
            <div class="grid-4">
              <div class="info"><span>Plan</span><strong>${esc(s.planName || "--")}</strong></div>
              <div class="info"><span>Billing Cycle</span><strong>${esc(s.billingCycle || "--")}</strong></div>
              <div class="info"><span>Last Payment</span><strong>${dateText(s.lastPaymentDate)}</strong></div>
              <div class="info"><span>Next Payment</span><strong>${dateText(s.nextBillingDate || s.dueDate)}</strong></div>
              <div class="info"><span>Grace Period</span><strong>${Number(s.graceDays ?? 0)} days</strong></div>
              <div class="info"><span>Base Price</span><strong>${money(s.basePrice)}</strong></div>
              <div class="info"><span>Extra Vehicle Price</span><strong>${money(s.extraVehiclePrice)}</strong></div>
              <div class="info"><span>Extra Service Price</span><strong>${money(s.extraServicePrice)}</strong></div>
            </div>
          </div>
        </div>

      </div>

      <div class="panel" data-panel="usage">

        <div class="section">
          <div class="section-title">Vehicles</div>
          <div class="section-body table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Access</th>
                  <th>Billing</th>
                </tr>
              </thead>
              <tbody>
                ${usageRows(p.vehicleControls,"vehicle")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Services</div>
          <div class="section-body table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Access</th>
                  <th>Billing</th>
                </tr>
              </thead>
              <tbody>
                ${usageRows(p.serviceControls,"service")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="actions">
          <button class="btn primary" data-action="edit-usage" type="button">Edit Access & Billing</button>
          <button class="btn gold" data-action="save-usage" type="button" disabled>Save Changes</button>
          <button class="btn gray" data-action="cancel-company" type="button" disabled>Cancel</button>
        </div>

      </div>

      <div class="panel" data-panel="pricing">

        <div class="section">
          <div class="section-title">Company Pricing</div>

          <div class="section-body">

            <div class="grid-3">

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

            <div class="price-box">
              <div class="price-line"><span>Base Package</span><strong>${money(p.baseAmount)}</strong></div>
              <div class="price-line"><span>Extra Vehicles</span><strong>${Number(p.billableExtraVehicles || 0)} × ${money(p.extraVehiclePrice)} = ${money(p.vehicleAmount)}</strong></div>
              <div class="price-line"><span>Extra Services</span><strong>${Number(p.billableExtraServices || 0)} × ${money(p.extraServicePrice)} = ${money(p.serviceAmount)}</strong></div>
              <div class="price-line"><span>Discount</span><strong>-${money(p.discount)}</strong></div>
              <div class="price-line"><span>Credit</span><strong>-${money(p.credit)}</strong></div>
              <div class="price-total"><span>Final Amount</span><strong>${money(p.finalAmount)}</strong></div>
            </div>

            <div class="actions">
              <button class="btn primary" data-action="edit-pricing" type="button">Edit</button>
              <button class="btn blue" data-action="preview-pricing" type="button">Preview Price</button>
              <button class="btn gold" data-action="save-pricing" type="button" disabled>Save Pricing</button>
              <button class="btn gray" data-action="cancel-company" type="button" disabled>Cancel</button>
            </div>

          </div>
        </div>

      </div>

      <div class="panel" data-panel="payments">
        <div class="section">
          <div class="section-title">
            <span>Payment History</span>
            <button class="btn primary" data-action="load-history" type="button">Refresh History</button>
          </div>

          <div class="section-body" id="inlineHistory">
            <div class="empty-state">Open payment history to load records.</div>
          </div>
        </div>
      </div>
    `;

    bindToggleLabels(companyDetail);
  }

  function bindToggleLabels(scope){
    scope.querySelectorAll(".toggle input").forEach(input=>{
      input.addEventListener("change",()=>{
        const label = input.closest(".toggle");
        const text = label.querySelector("span");

        if(input.classList.contains("billing-toggle")){
          if(input.checked){
            label.className = "toggle on";
            text.textContent = "Enabled";
          }else{
            label.className = "toggle free";
            text.textContent = "Free";
          }
        }else{
          if(input.checked){
            label.className = "toggle on";
            text.textContent = "Enabled";
          }else{
            label.className = "toggle off";
            text.textContent = "Disabled";
          }
        }
      });
    });
  }

  function activateCompanyTab(tabName){
    companyDetail.querySelectorAll(".detail-tab").forEach(btn=>{
      btn.classList.toggle(
        "active",
        btn.dataset.tab === tabName
      );
    });

    companyDetail.querySelectorAll(".panel").forEach(panel=>{
      panel.classList.toggle(
        "active",
        panel.dataset.panel === tabName
      );
    });
  }

  function readControls(type){
    return [
      ...companyDetail.querySelectorAll(
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

  function readCompanyForm(){
    const q = selector => companyDetail.querySelector(selector);

    const override = clean(q(".final-override")?.value);

    return {
      planName:clean(q(".plan-name")?.value),
      billingCycle:q(".cycle")?.value || "MONTHLY",
      status:q(".status")?.value || "ACTIVE",
      basePackageEnabled:q(".base-enabled")?.value === "true",
      basePrice:Number(q(".base-price")?.value || 0),
      includedVehicles:Number(q(".included-vehicles")?.value || 0),
      includedServices:Number(q(".included-services")?.value || 0),
      extraVehiclePrice:Number(q(".extra-vehicle-price")?.value || 0),
      extraServicePrice:Number(q(".extra-service-price")?.value || 0),
      freeExtraVehicles:Number(q(".free-extra-vehicles")?.value || 0),
      freeExtraServices:Number(q(".free-extra-services")?.value || 0),
      discount:Number(q(".discount")?.value || 0),
      credit:Number(q(".credit")?.value || 0),
      finalPriceOverride:override === "" ? null : Number(override),
      graceDays:Number(q(".grace-days")?.value || 0),
      dueDate:q(".due-date")?.value || null,
      vehicleControls:readControls("vehicle"),
      serviceControls:readControls("service")
    };
  }

  function setPricingEdit(editing){
    companyDetail.querySelectorAll(
      '[data-panel="pricing"] input,[data-panel="pricing"] select'
    ).forEach(el=>{
      el.disabled = !editing;
    });

    const save = companyDetail.querySelector('[data-action="save-pricing"]');
    const cancel = companyDetail.querySelector('[data-panel="pricing"] [data-action="cancel-company"]');
    const edit = companyDetail.querySelector('[data-action="edit-pricing"]');

    if(save) save.disabled = !editing;
    if(cancel) cancel.disabled = !editing;
    if(edit) edit.disabled = editing;
  }

  function setUsageEdit(editing){
    companyDetail.querySelectorAll(
      '[data-panel="usage"] .toggle input'
    ).forEach(el=>{
      el.disabled = !editing;
    });

    const save = companyDetail.querySelector('[data-action="save-usage"]');
    const cancel = companyDetail.querySelector('[data-panel="usage"] [data-action="cancel-company"]');
    const edit = companyDetail.querySelector('[data-action="edit-usage"]');

    if(save) save.disabled = !editing;
    if(cancel) cancel.disabled = !editing;
    if(edit) edit.disabled = editing;
  }

  async function saveCompany(){
    const row = selectedCompany();
    if(!row) return;

    if(!window.confirm("Save this company's billing changes?")){
      return;
    }

    try{
      await api(
        `/api/platform-subscription/tenants/${encodeURIComponent(row.tenant.id)}/subscription`,
        {
          method:"PUT",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify(readCompanyForm())
        }
      );

      showMessage("Company billing saved successfully.","ok");
      await loadBilling(true);

    }catch(err){
      showMessage(err.message,"error");
    }
  }

  async function previewPricing(){
    const row = selectedCompany();
    if(!row) return;

    try{
      const result = await api(
        `/api/platform-subscription/tenants/${encodeURIComponent(row.tenant.id)}/preview`,
        {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify(readCompanyForm())
        }
      );

      const p = result.pricing || {};

      window.alert(
        [
          `Base Package: ${money(p.baseAmount)}`,
          `Extra Vehicles: ${Number(p.billableExtraVehicles || 0)} x ${money(p.extraVehiclePrice)} = ${money(p.vehicleAmount)}`,
          `Extra Services: ${Number(p.billableExtraServices || 0)} x ${money(p.extraServicePrice)} = ${money(p.serviceAmount)}`,
          `Discount: -${money(p.discount)}`,
          `Credit: -${money(p.credit)}`,
          `Final Amount: ${money(p.finalAmount)}`
        ].join("\n")
      );

    }catch(err){
      showMessage(err.message,"error");
    }
  }

  async function toggleCompany(){
    const row = selectedCompany();
    if(!row) return;

    const currentlyEnabled = row.tenant.enabled !== false;
    const nextEnabled = !currentlyEnabled;

    if(
      !window.confirm(
        `${nextEnabled ? "Enable" : "Disable"} ${row.tenant.name}?`
      )
    ){
      return;
    }

    try{
      await api(
        `/api/platform-subscription/tenants/${encodeURIComponent(row.tenant.id)}/enabled`,
        {
          method:"PUT",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({enabled:nextEnabled})
        }
      );

      showMessage(
        nextEnabled
          ? "Company enabled successfully."
          : "Company disabled successfully.",
        "ok"
      );

      await loadBilling(true);

    }catch(err){
      showMessage(err.message,"error");
    }
  }

  async function loadHistory(inline=true){
    const row = selectedCompany();
    if(!row) return;

    try{
      const result = await api(
        `/api/platform-subscription/tenants/${encodeURIComponent(row.tenant.id)}/payment-history`
      );

      const history = Array.isArray(result.history)
        ? result.history
        : [];

      const html = history.length
        ? `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Cycle</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${history.map(item=>`
                  <tr>
                    <td>${dateText(item.paidAt || item.createdAt)}</td>
                    <td>${esc(item.invoiceNumber || "--")}</td>
                    <td>${esc(item.billingCycle || "--")}</td>
                    <td>${esc(item.paymentMethod || "--")}</td>
                    <td><span class="badge ${badgeClass(item.status)}">${esc(item.status || "--")}</span></td>
                    <td>${money(item.amount)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `
        : `<div class="empty-state">No payment history.</div>`;

      if(inline){
        const target = document.getElementById("inlineHistory");
        if(target) target.innerHTML = html;
      }else{
        document.getElementById("historyBody").innerHTML = html;
        document.getElementById("historyModal").classList.add("show");
      }

    }catch(err){
      showMessage(err.message,"error");
    }
  }

  async function loadPaymentSummary(){
    try{
      const result = await api(
        "/api/platform-subscription/payment-summary"
      );

      document.getElementById("mActive").textContent =
        Number(result.metrics?.activeCompanies || 0);

      document.getElementById("mDisabled").textContent =
        Number(result.metrics?.disabledCompanies || 0);

      document.getElementById("mPastDue").textContent =
        Number(result.metrics?.pastDueCompanies || 0);

      document.getElementById("mRecurring").textContent =
        money(result.metrics?.recurringAmount);

      document.getElementById("mPaidMonth").textContent =
        money(result.metrics?.paidThisMonth);

      document.getElementById("mOutstanding").textContent =
        money(result.metrics?.outstanding);

      const rows = Array.isArray(result.companies)
        ? result.companies
        : [];

      document.getElementById("summaryTableBody").innerHTML =
        rows.map(row=>`
          <tr>
            <td>${esc(row.name || "Company")}</td>
            <td>${esc(row.planName || "--")}</td>
            <td>${money(row.amount)}</td>
            <td>${dateText(row.lastPaymentDate)}</td>
            <td>${dateText(row.nextPaymentDate)}</td>
            <td><span class="badge ${badgeClass(row.status)}">${esc(row.status || "--")}</span></td>
          </tr>
        `).join("");

    }catch(err){
      showMessage(err.message,"error");
    }
  }

  function setTopView(view){
    document.querySelectorAll(".top-tab").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.view === view);
    });

    document.getElementById("companiesView").style.display =
      view === "companies" ? "grid" : "none";

    document.getElementById("summaryView").classList.toggle(
      "active",
      view === "summary"
    );

    document.getElementById("settingsView").classList.toggle(
      "active",
      view === "settings"
    );

    if(view === "summary"){
      loadPaymentSummary();
    }
  }

  async function loadStripe(){
    const badge = document.getElementById("stripeStatusBadge");

    try{
      const data = await api("/api/platform-stripe/status");

      const connected = data.connected === true;

      badge.textContent = connected
        ? "CONNECTED"
        : "NOT CONNECTED";

      badge.className =
        "badge " + (connected ? "connected" : "disabled");

      document.getElementById("stripeAccountId").textContent =
        data.accountId || "--";

      document.getElementById("stripeMode").textContent =
        data.mode || "--";

      document.getElementById("stripeCharges").textContent =
        data.chargesEnabled ? "ENABLED" : "DISABLED";

      document.getElementById("stripePayouts").textContent =
        data.payoutsEnabled ? "ENABLED" : "DISABLED";

      const dashboard = document.getElementById("stripeDashboardBtn");
      dashboard.disabled = !data.dashboardUrl;
      dashboard.dataset.url = data.dashboardUrl || "";

    }catch(err){
      badge.textContent = "NOT CONNECTED";
      badge.className = "badge disabled";
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
      document.getElementById(id).disabled = locked;
    });

    document.getElementById("defaultEditBtn").disabled = !locked;
    document.getElementById("defaultSaveBtn").disabled = locked;
    document.getElementById("defaultCancelBtn").disabled = locked;
  }

  function fillDefault(row){
    if(!row) return;

    document.getElementById("dPackageName").value = row.packageName || "";
    document.getElementById("dBasePrice").value = Number(row.basePrice || 0);
    document.getElementById("dIncludedVehicles").value = Number(row.includedVehicles || 0);
    document.getElementById("dIncludedServices").value = Number(row.includedServices || 0);
    document.getElementById("dBillingCycle").value = row.billingCycle || "MONTHLY";
    document.getElementById("dExtraVehiclePrice").value = Number(row.extraVehiclePrice || 0);
    document.getElementById("dExtraServicePrice").value = Number(row.extraServicePrice || 0);
    document.getElementById("dPackageStatus").value = row.packageStatus || "ACTIVE";

    const badge = document.getElementById("defaultPackageBadge");
    badge.textContent = row.packageStatus || "ACTIVE";
    badge.className =
      "badge " + (row.packageStatus === "DISABLED" ? "disabled" : "active");

    lockDefault(true);
  }

  function readDefault(){
    return {
      packageName:clean(document.getElementById("dPackageName").value),
      basePrice:Number(document.getElementById("dBasePrice").value || 0),
      includedVehicles:Number(document.getElementById("dIncludedVehicles").value || 0),
      includedServices:Number(document.getElementById("dIncludedServices").value || 0),
      billingCycle:document.getElementById("dBillingCycle").value,
      extraVehiclePrice:Number(document.getElementById("dExtraVehiclePrice").value || 0),
      extraServicePrice:Number(document.getElementById("dExtraServicePrice").value || 0),
      packageStatus:document.getElementById("dPackageStatus").value
    };
  }

  async function loadBilling(preserveSelection=false){
    try{
      const oldId = state.selectedId;

      const data = await api("/api/platform-subscription/bootstrap");

      state.defaultPackage = data.defaultPackage || null;
      state.companies = Array.isArray(data.companies) ? data.companies : [];

      if(
        preserveSelection &&
        state.companies.some(row=>String(row.tenant?.id) === String(oldId))
      ){
        state.selectedId = oldId;
      }else if(
        !state.selectedId ||
        !state.companies.some(row=>String(row.tenant?.id) === String(state.selectedId))
      ){
        state.selectedId = state.companies[0]?.tenant?.id || "";
      }

      fillDefault(state.defaultPackage);
      renderSidebar();
      renderCompany();

    }catch(err){
      companyList.innerHTML =
        `<div class="empty-state">Unable to load companies.</div>`;

      showMessage(err.message,"error");
    }
  }

  document.querySelectorAll(".top-tab").forEach(btn=>{
    btn.addEventListener("click",()=>{
      setTopView(btn.dataset.view);
    });
  });

  searchInput.addEventListener("input",()=>{
    state.search = clean(searchInput.value).toLowerCase();
    renderSidebar();
  });

  document.querySelectorAll(".filter-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      state.filter = btn.dataset.filter || "";

      document.querySelectorAll(".filter-btn").forEach(x=>{
        x.classList.toggle("active",x === btn);
      });

      renderSidebar();
    });
  });

  companyList.addEventListener("click",event=>{
    const item = event.target.closest("[data-company-id]");
    if(!item) return;

    state.selectedId = item.dataset.companyId;
    renderSidebar();
    renderCompany();
  });

  companyDetail.addEventListener("click",event=>{
    const tab = event.target.closest("[data-tab]");
    if(tab){
      activateCompanyTab(tab.dataset.tab);
      return;
    }

    const button = event.target.closest("[data-action]");
    if(!button) return;

    const action = button.dataset.action;

    if(action === "toggle-company"){
      toggleCompany();
      return;
    }

    if(action === "edit-pricing"){
      setPricingEdit(true);
      return;
    }

    if(action === "preview-pricing"){
      previewPricing();
      return;
    }

    if(action === "save-pricing"){
      saveCompany();
      return;
    }

    if(action === "edit-usage"){
      setUsageEdit(true);
      return;
    }

    if(action === "save-usage"){
      saveCompany();
      return;
    }

    if(action === "cancel-company"){
      renderCompany();
      return;
    }

    if(action === "load-history"){
      loadHistory(true);
    }
  });

  document.getElementById("defaultEditBtn")
    .addEventListener("click",()=>{
      state.defaultBackup = readDefault();
      lockDefault(false);
    });

  document.getElementById("defaultCancelBtn")
    .addEventListener("click",()=>{
      fillDefault(state.defaultBackup || state.defaultPackage);
      state.defaultBackup = null;
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
        const result = await api(
          "/api/platform-subscription/default-package",
          {
            method:"PUT",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify(readDefault())
          }
        );

        state.defaultPackage = result.defaultPackage;
        fillDefault(result.defaultPackage);

        showMessage(
          "Default Package saved. Existing company pricing was not changed.",
          "ok"
        );

      }catch(err){
        showMessage(err.message,"error");
      }
    });

  document.getElementById("stripeRefreshBtn")
    .addEventListener("click",loadStripe);

  document.getElementById("stripeDashboardBtn")
    .addEventListener("click",event=>{
      const url = clean(event.currentTarget.dataset.url);
      if(url){
        window.open(url,"_blank","noopener");
      }
    });

  document.querySelectorAll("[data-close]").forEach(button=>{
    button.addEventListener("click",()=>{
      document.getElementById(button.dataset.close).classList.remove("show");
    });
  });

  setTopView("companies");
  loadStripe();
  loadBilling();
});
