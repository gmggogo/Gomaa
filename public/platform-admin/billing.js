
"use strict";

/* GH Mobility SaaS Billing - Broker Billing UI V2 */

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
      : d.toLocaleDateString(
          "en-US",
          {
            year:"numeric",
            month:"numeric",
            day:"numeric",
            timeZone:"UTC"
          }
        );
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
    defaultBackup:null,
    brokers:[]
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

  function tenantBrokers(tenant){
    const id = clean(tenant?.id || tenant?._id);
    const slug = clean(tenant?.slug).toLowerCase();

    return state.brokers.filter(item=>{
      const itemId = clean(item?.tenantId);
      const itemSlug = clean(item?.tenantSlug).toLowerCase();
      return (id && itemId === id) || (slug && itemSlug === slug);
    });
  }

  function brokerStats(row){
    const list = tenantBrokers(row?.tenant);
    const actual = list.length;
    const billingActive = list.filter(x=>x?.billingEnabled !== false).length;
    const included = Number(row?.subscription?.includedBrokers ?? state.defaultPackage?.includedBrokers ?? 0);
    const extraPrice = Number(row?.subscription?.extraBrokerPrice ?? state.defaultPackage?.extraBrokerPrice ?? 0);
    const freeExtra = Number(row?.subscription?.freeExtraBrokers ?? 0);
    const billableExtra = Math.max(0,billingActive - included - freeExtra);
    const amount = billableExtra * extraPrice;

    return {list,actual,billingActive,included,extraPrice,freeExtra,billableExtra,amount};
  }

  function mergeBrokerPricing(pricing,row){
    const p = pricing || {};
    const b = brokerStats(row);
    const backendHasBrokerAmount = p.brokerAmount !== undefined && p.brokerAmount !== null;
    const brokerAmount = backendHasBrokerAmount ? Number(p.brokerAmount || 0) : b.amount;
    const backendFinal = Number(p.finalAmount || 0);
    const finalAmount = backendHasBrokerAmount ? backendFinal : backendFinal + brokerAmount;

    return {
      ...p,
      brokerAmount,
      finalAmount,
      actualBrokers:b.actual,
      billingActiveBrokers:b.billingActive,
      includedBrokers:Number(p.includedBrokers ?? b.included),
      billableExtraBrokers:Number(p.billableExtraBrokers ?? b.billableExtra),
      extraBrokerPrice:Number(p.extraBrokerPrice ?? b.extraPrice)
    };
  }

  function pricingWithBrokers(row){
    return mergeBrokerPricing(row?.pricing || {},row);
  }

  async function loadBrokers(){
    try{
      const data = await api('/api/platform/broker-integrations');
      state.brokers = Array.isArray(data?.integrations) ? data.integrations : [];
    }catch(err){
      state.brokers = [];
      console.warn('Broker billing usage could not be loaded:',err);
    }
  }

  function brokerUsageRows(row){
    const list = brokerStats(row).list;
    if(!list.length){
      return `<tr><td colspan="4">No broker connections found.</td></tr>`;
    }

    return list.map(item=>`
      <tr>
        <td>${esc(item.brokerName || item.brokerCode || 'Broker')}</td>
        <td><strong>${esc(item.brokerCode || '--')}</strong></td>
        <td><span class="badge ${item.enabled === false ? 'disabled' : 'active'}">${item.enabled === false ? 'Disabled' : 'Active'}</span></td>
        <td><span class="badge ${item.billingEnabled === false ? 'disabled' : 'active'}">${item.billingEnabled === false ? 'Free / Off' : 'Billable'}</span></td>
      </tr>
    `).join('');
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
      label = "Disabled";
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

  function servicePricingRows(row,p,s){
    const controls = Array.isArray(p.serviceControls) ? p.serviceControls : [];
    const saved = Array.isArray(s.servicePricing) ? s.servicePricing : [];

    if(!controls.length){
      return `<tr><td colspan="5">No active services found for this company.</td></tr>`;
    }

    const savedMap = new Map(
      saved.map(item=>[
        clean(item?.key).toUpperCase(),
        item
      ])
    );

    let remainingIncluded = Number(s.includedServices || 0);

    return controls.map(control=>{
      const key = clean(control.key).toUpperCase();
      const old = savedMap.get(key);

      let included = old?.included === true;

      if(!old && control.billingEnabled !== false && remainingIncluded > 0){
        included = true;
        remainingIncluded -= 1;
      }else if(old?.included === true && remainingIncluded > 0){
        remainingIncluded -= 1;
      }

      const monthlyPrice = Number(
        old?.monthlyPrice ??
        s.extraServicePrice ??
        0
      );

      const active = control.accessEnabled !== false;
      const billing = control.billingEnabled !== false;

      return `
        <tr
          class="service-price-row"
          data-service-key="${esc(key)}"
          data-service-label="${esc(control.label || key)}"
        >
          <td><strong>${esc(control.label || key)}</strong></td>
          <td>
            <label class="toggle ${included ? "on" : "off"}">
              <input
                class="service-included-toggle"
                type="checkbox"
                ${included ? "checked" : ""}
                disabled
              >
              <span>${included ? "Included" : "Add-on"}</span>
            </label>
          </td>
          <td><span class="badge ${active ? "active" : "disabled"}">${active ? "Active" : "Disabled"}</span></td>
          <td><span class="badge ${billing ? "active" : "disabled"}">${billing ? "Billable" : "Off"}</span></td>
          <td>
            <input
              class="service-monthly-price service-price-input"
              type="number"
              min="0"
              step="0.01"
              value="${Number.isFinite(monthlyPrice) ? monthlyPrice : 0}"
              disabled
            >
          </td>
        </tr>
      `;
    }).join("");
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
    const p = pricingWithBrokers(row);
    const status = companyStatus(row);
    const enabled = t.enabled !== false;

    const includedBrokerCount =
      Number(s.includedBrokers ?? state.defaultPackage?.includedBrokers ?? 0);

    const maxBrokerCount =
      Number(s.maxBrokers ?? state.defaultPackage?.maxBrokers ?? includedBrokerCount);

    companyDetail.innerHTML = `
      <div class="company-header company-header-centered">
        <div class="company-title company-title-centered">
          <h2>${esc(t.name || "Company")}</h2>
          <p>${esc(t.slug || "")}</p>
        </div>

        <div class="company-actions company-actions-corner">
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
          <strong>${Number(p.actualVehicles || 0)} / ${Number(p.maxVehicles || 0)}</strong>
        </div>

        <div class="summary-card">
          <span>Services</span>
          <strong>${Number(p.enabledServices || 0)} / ${Number(p.maxServices || 0)}</strong>
        </div>

        <div class="summary-card broker-card">
          <span>Active Brokers</span>
          <strong>${Number(p.actualBrokers || 0)} / ${maxBrokerCount}</strong>
        </div>

        <div class="summary-card">
          <span>Next Payment</span>
          <strong>${dateText(s.nextBillingDate || s.dueDate)}</strong>
        </div>
      </div>

      <div class="detail-tabs detail-tabs-centered">
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
              <div class="info"><span>Package Price</span><strong>${money(p.baseAmount)}</strong></div>
              <div class="info"><span>Next Payment</span><strong>${dateText(s.nextBillingDate || s.dueDate)}</strong></div>
              <div class="info"><span>Vehicle Limit</span><strong>${Number(p.maxVehicles || 0)}</strong></div>
              <div class="info"><span>Service Limit</span><strong>${Number(p.maxServices || 0)}</strong></div>
              <div class="info"><span>Broker Limit</span><strong>${maxBrokerCount}</strong></div>
              <div class="info"><span>Grace Period</span><strong>${Number(s.graceDays ?? 0)} days</strong></div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Live Usage vs Allowed Limits</div>
          <div class="section-body table-wrap">
            <table class="table usage-limit-table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Allowed Limit</th>
                  <th>Actual Active</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Vehicles</td><td>${Number(p.maxVehicles || 0)}</td><td>${Number(p.actualVehicles || 0)}</td></tr>
                <tr><td>Drivers</td><td>${Number(p.maxDrivers || 0)}</td><td>${Number(p.actualDrivers || 0)}</td></tr>
                <tr><td>Dispatchers</td><td>${Number(p.maxDispatchers || 0)}</td><td>${Number(p.actualDispatchers || 0)}</td></tr>
                <tr><td>Admins</td><td>${Number(p.maxAdmins || 0)}</td><td>${Number(p.actualAdmins || 0)}</td></tr>
                <tr><td>Super Admins</td><td>${Number(p.maxSuperAdmins || 0)}</td><td>${Number(p.actualSuperAdmins || 0)}</td></tr>
                <tr><td>Companies</td><td>${Number(p.maxCompanies || 0)}</td><td>${Number(p.actualCompanies || 0)}</td></tr>
                <tr><td>Services</td><td>${Number(p.maxServices || 0)}</td><td>${Number(p.enabledServices || 0)}</td></tr>
                <tr><td>Brokers</td><td>${maxBrokerCount}</td><td>${Number(p.actualBrokers || 0)}</td></tr>
              </tbody>
            </table>
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

        <div class="section broker-section">
          <div class="section-title">
            <span>Broker Connections</span>
            <span class="section-count">${Number(p.actualBrokers || 0)} active</span>
          </div>
          <div class="section-body table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Broker</th>
                  <th>Code</th>
                  <th>Access</th>
                  <th>Billing</th>
                </tr>
              </thead>
              <tbody>${brokerUsageRows(row)}</tbody>
            </table>
            <div class="broker-note">Only enabled, billing-active broker connections are counted automatically for SaaS billing.</div>
          </div>
        </div>

        <div class="actions">
          <button class="btn primary" data-action="edit-usage" type="button">Edit Access & Billing</button>
          <button class="btn gold" data-action="save-usage" type="button" disabled>Save Changes</button>
          <button class="btn gray" data-action="cancel-company" type="button" disabled>Cancel</button>
        </div>

      </div>

      <div class="panel" data-panel="pricing">

        <div class="pricing-section-block">
          <div class="pricing-section-heading">Package & Subscription</div>
          <div class="grid-3 pricing-grid">
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
              <label>Base Package Price (No Service)</label>
              <input class="base-price" type="number" min="0" step="0.01" value="${Number(s.basePrice || 0)}" disabled>
            </div>

            <div class="field">
              <label>Due Date</label>
              <input class="due-date" type="date" value="${s.dueDate ? new Date(s.dueDate).toISOString().slice(0,10) : ""}" disabled>
            </div>
          </div>
        </div>

        <div class="pricing-section-block">
          <div class="pricing-section-heading">Allowed Limits</div>

          <div class="grid-4 pricing-grid">
            <div class="field">
              <label>Vehicle Limit</label>
              <input class="max-vehicles" type="number" min="0" value="${Number(s.maxVehicles || 0)}" disabled>
            </div>

            <div class="field">
              <label>Driver Limit</label>
              <input class="max-drivers" type="number" min="0" value="${Number(s.maxDrivers || 0)}" disabled>
            </div>

            <div class="field">
              <label>Dispatcher Limit</label>
              <input class="max-dispatchers" type="number" min="0" value="${Number(s.maxDispatchers || 0)}" disabled>
            </div>

            <div class="field">
              <label>Admin Limit</label>
              <input class="max-admins" type="number" min="0" value="${Number(s.maxAdmins || 0)}" disabled>
            </div>

            <div class="field">
              <label>Super Admin Limit</label>
              <input class="max-super-admins" type="number" min="0" value="${Number(s.maxSuperAdmins || 0)}" disabled>
            </div>

            <div class="field">
              <label>Company Limit</label>
              <input class="max-companies" type="number" min="0" value="${Number(s.maxCompanies || 0)}" disabled>
            </div>

            <div class="field">
              <label>Service Limit</label>
              <input class="max-services" type="number" min="0" value="${Number(s.maxServices || 0)}" disabled>
            </div>

            <div class="field broker-field">
              <label>Broker Limit</label>
              <input class="max-brokers" type="number" min="0" value="${maxBrokerCount}" disabled>
            </div>
          </div>

          <input class="included-vehicles" type="hidden" value="${Number(s.includedVehicles || 0)}">
          <input class="included-brokers" type="hidden" value="${includedBrokerCount}">

          <div class="live-count-strip">
            <span>Active Vehicles <strong>${Number(p.actualVehicles || 0)}</strong></span>
            <span>Active Drivers <strong>${Number(p.actualDrivers || 0)}</strong></span>
            <span>Active Dispatchers <strong>${Number(p.actualDispatchers || 0)}</strong></span>
            <span>Active Admins <strong>${Number(p.actualAdmins || 0)}</strong></span>
            <span>Active Super Admins <strong>${Number(p.actualSuperAdmins || 0)}</strong></span>
            <span>Active Companies <strong>${Number(p.actualCompanies || 0)}</strong></span>
            <span>Active Services <strong>${Number(p.enabledServices || 0)}</strong></span>
            <span>Active Brokers <strong>${Number(p.actualBrokers || 0)}</strong></span>
          </div>
        </div>

        <div class="pricing-section-block service-pricing-block">
          <div class="pricing-section-heading">Service Pricing</div>
          <div class="pricing-help">
            Choose the service included with this company package. The package price is the base package plus the full price of the selected Included service. Every other active service is charged at its full monthly add-on price.
          </div>
          <input class="included-services" type="hidden" value="${Number(s.includedServices || 0)}">
          <div class="table-wrap">
            <table class="table service-pricing-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Base Package</th>
                  <th>Access</th>
                  <th>Billing</th>
                  <th>Monthly Add-on Price</th>
                </tr>
              </thead>
              <tbody>
                ${servicePricingRows(row,p,s)}
              </tbody>
            </table>
          </div>
        </div>

        <div class="pricing-section-block">
          <div class="pricing-section-heading">Extra Unit Pricing & Adjustments</div>
          <div class="grid-4 pricing-grid">
            <div class="field">
              <label>Extra Vehicle Price</label>
              <input class="extra-vehicle-price" type="number" min="0" step="0.01" value="${Number(s.extraVehiclePrice || 0)}" disabled>
            </div>

            <div class="field broker-field">
              <label>Extra Broker Price</label>
              <input class="extra-broker-price" type="number" min="0" step="0.01" value="${Number(s.extraBrokerPrice ?? state.defaultPackage?.extraBrokerPrice ?? 0)}" disabled>
            </div>

            <div class="field">
              <label>Default New Service Price</label>
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

            <div class="field broker-field">
              <label>Free Extra Brokers</label>
              <input class="free-extra-brokers" type="number" min="0" value="${Number(s.freeExtraBrokers || 0)}" disabled>
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
          </div>
        </div>

        <div class="pricing-section-block billing-breakdown-block">
          <div class="pricing-section-heading">Billing Breakdown</div>
          <div class="price-box">
            <div class="price-line"><span>Base Package</span><strong>${money(p.basePackageAmount ?? s.basePrice ?? 0)}</strong></div>
            <div class="price-line"><span>Included Service</span><strong>+${money(p.includedServicePriceTotal || 0)}</strong></div>
            <div class="price-line"><span>Package Price</span><strong>${money(p.baseAmount)}</strong></div>
            <div class="price-line"><span>Extra Vehicles</span><strong>${Number(p.billableExtraVehicles || 0)} × ${money(p.extraVehiclePrice)} = ${money(p.vehicleAmount)}</strong></div>
            ${
              Array.isArray(p.serviceCharges) && p.serviceCharges.length
                ? p.serviceCharges.map(item=>`
                    <div class="price-line">
                      <span>${esc(item.label || item.key)}${item.free ? " (Free Extra)" : ""}</span>
                      <strong>${money(item.amount)}</strong>
                    </div>
                  `).join("")
                : `<div class="price-line"><span>Extra Services</span><strong>${money(p.serviceAmount)}</strong></div>`
            }
            <div class="price-line broker-price-line"><span>Extra Brokers</span><strong>${Number(p.billableExtraBrokers || 0)} × ${money(p.extraBrokerPrice)} = ${money(p.brokerAmount)}</strong></div>
            <div class="price-line"><span>Discount</span><strong>-${money(p.discount)}</strong></div>
            <div class="price-line"><span>Credit</span><strong>-${money(p.credit)}</strong></div>
            <div class="price-total"><span>Final Amount</span><strong>${money(p.finalAmount)}</strong></div>
          </div>

          <div class="actions pricing-actions">
            <button class="btn primary" data-action="edit-pricing" type="button">Edit</button>
            <button class="btn blue" data-action="preview-pricing" type="button">Preview Price</button>
            <button class="btn gold" data-action="save-pricing" type="button" disabled>Save Pricing</button>
            <button class="btn gray" data-action="cancel-company" type="button" disabled>Cancel</button>
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
            <div class="empty-state">Payment history loads automatically when this tab opens.</div>
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

        if(input.classList.contains("service-included-toggle")){
          label.className = input.checked ? "toggle on" : "toggle off";
          text.textContent = input.checked ? "Included" : "Add-on";
          return;
        }

        if(input.classList.contains("billing-toggle")){
          if(input.checked){
            label.className = "toggle on";
            text.textContent = "Enabled";
          }else{
            label.className = "toggle free";
            text.textContent = "Disabled";
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

  function readServicePricing(){
    return [
      ...companyDetail.querySelectorAll(".service-price-row")
    ].map(row=>({
      key:clean(row.dataset.serviceKey).toUpperCase(),
      label:clean(row.dataset.serviceLabel),
      included:
        row.querySelector(".service-included-toggle")?.checked === true,
      monthlyPrice:Number(
        row.querySelector(".service-monthly-price")?.value || 0
      )
    })).filter(row=>row.key);
  }

  function readCompanyForm(){
    const q = selector => companyDetail.querySelector(selector);

    const override = clean(q(".final-override")?.value);
    const servicePricing = readServicePricing();
    const includedServiceCount =
      servicePricing.filter(row=>row.included).length;

    return {
      planName:clean(q(".plan-name")?.value),
      billingCycle:q(".cycle")?.value || "MONTHLY",
      status:q(".status")?.value || "ACTIVE",
      basePackageEnabled:q(".base-enabled")?.value === "true",
      basePrice:Number(q(".base-price")?.value || 0),
      includedVehicles:Number(q(".included-vehicles")?.value || 0),
      includedServices:includedServiceCount,
      includedBrokers:Number(q(".included-brokers")?.value || 0),
      maxDrivers:Number(q(".max-drivers")?.value || 0),
      maxVehicles:Number(q(".max-vehicles")?.value || 0),
      maxAdmins:Number(q(".max-admins")?.value || 0),
      maxSuperAdmins:Number(q(".max-super-admins")?.value || 0),
      maxDispatchers:Number(q(".max-dispatchers")?.value || 0),
      maxCompanies:Number(q(".max-companies")?.value || 0),
      maxServices:Number(q(".max-services")?.value || 0),
      maxBrokers:Number(q(".max-brokers")?.value || 0),
      extraVehiclePrice:Number(q(".extra-vehicle-price")?.value || 0),
      extraServicePrice:Number(q(".extra-service-price")?.value || 0),
      extraBrokerPrice:Number(q(".extra-broker-price")?.value || 0),
      freeExtraVehicles:Number(q(".free-extra-vehicles")?.value || 0),
      freeExtraServices:Number(q(".free-extra-services")?.value || 0),
      freeExtraBrokers:Number(q(".free-extra-brokers")?.value || 0),
      discount:Number(q(".discount")?.value || 0),
      credit:Number(q(".credit")?.value || 0),
      finalPriceOverride:override === "" ? null : Number(override),
      graceDays:Number(q(".grace-days")?.value || 0),
      dueDate:q(".due-date")?.value || null,
      vehicleControls:readControls("vehicle"),
      serviceControls:readControls("service"),
      servicePricing
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

      const p = mergeBrokerPricing(result.pricing || {},row);

      window.alert(
        [
          `Base Package: ${money(p.basePackageAmount ?? p.baseAmount)}`,
          `Included Service: +${money(p.includedServicePriceTotal || 0)}`,
          `Package Price: ${money(p.baseAmount)}`,
          `Extra Vehicles: ${Number(p.billableExtraVehicles || 0)} x ${money(p.extraVehiclePrice)} = ${money(p.vehicleAmount)}`,
          `Extra Services: ${money(p.serviceAmount)}`,
          `Extra Brokers: ${Number(p.billableExtraBrokers || brokerStats(row).billableExtra || 0)} x ${money(p.extraBrokerPrice ?? brokerStats(row).extraPrice)} = ${money(p.brokerAmount ?? brokerStats(row).amount)}`,
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
    "dIncludedBrokers",
    "dMaxDrivers",
    "dMaxVehicles",
    "dMaxAdmins",
    "dMaxSuperAdmins",
    "dMaxDispatchers",
    "dMaxCompanies",
    "dMaxServices",
    "dMaxBrokers",
    "dBillingCycle",
    "dExtraVehiclePrice",
    "dExtraServicePrice",
    "dExtraBrokerPrice",
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
    document.getElementById("dIncludedBrokers").value = Number(row.includedBrokers || 0);
    document.getElementById("dMaxDrivers").value = Number(row.maxDrivers ?? 5);
    document.getElementById("dMaxVehicles").value = Number(row.maxVehicles ?? row.includedVehicles ?? 5);
    document.getElementById("dMaxAdmins").value = Number(row.maxAdmins ?? 2);
    document.getElementById("dMaxSuperAdmins").value = Number(row.maxSuperAdmins ?? 2);
    document.getElementById("dMaxDispatchers").value = Number(row.maxDispatchers ?? 2);
    document.getElementById("dMaxCompanies").value = Number(row.maxCompanies ?? 3);
    document.getElementById("dMaxServices").value = Number(row.maxServices ?? row.includedServices ?? 1);
    document.getElementById("dMaxBrokers").value = Number(row.maxBrokers ?? row.includedBrokers ?? 1);
    document.getElementById("dBillingCycle").value = row.billingCycle || "MONTHLY";
    document.getElementById("dExtraVehiclePrice").value = Number(row.extraVehiclePrice || 0);
    document.getElementById("dExtraServicePrice").value = Number(row.extraServicePrice || 0);
    document.getElementById("dExtraBrokerPrice").value = Number(row.extraBrokerPrice || 0);
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
      includedBrokers:Number(document.getElementById("dIncludedBrokers").value || 0),
      maxDrivers:Number(document.getElementById("dMaxDrivers").value || 0),
      maxVehicles:Number(document.getElementById("dMaxVehicles").value || 0),
      maxAdmins:Number(document.getElementById("dMaxAdmins").value || 0),
      maxSuperAdmins:Number(document.getElementById("dMaxSuperAdmins").value || 0),
      maxDispatchers:Number(document.getElementById("dMaxDispatchers").value || 0),
      maxCompanies:Number(document.getElementById("dMaxCompanies").value || 0),
      maxServices:Number(document.getElementById("dMaxServices").value || 0),
      maxBrokers:Number(document.getElementById("dMaxBrokers").value || 0),
      billingCycle:document.getElementById("dBillingCycle").value,
      extraVehiclePrice:Number(document.getElementById("dExtraVehiclePrice").value || 0),
      extraServicePrice:Number(document.getElementById("dExtraServicePrice").value || 0),
      extraBrokerPrice:Number(document.getElementById("dExtraBrokerPrice").value || 0),
      packageStatus:document.getElementById("dPackageStatus").value
    };
  }

  async function loadBilling(preserveSelection=false){
    try{
      const oldId = state.selectedId;

      const data = await api("/api/platform-subscription/bootstrap");

      state.defaultPackage = data.defaultPackage || null;
      state.companies = Array.isArray(data.companies) ? data.companies : [];
      await loadBrokers();

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

    const paymentsWasOpen =
      companyDetail
        .querySelector(
          '.detail-tab[data-tab="payments"]'
        )
        ?.classList
        .contains("active") === true;

    state.selectedId =
      item.dataset.companyId;

    renderSidebar();
    renderCompany();

    if(paymentsWasOpen){
      activateCompanyTab("payments");
      loadHistory(true);
    }
  });

  companyDetail.addEventListener("click",event=>{
    const tab = event.target.closest("[data-tab]");
    if(tab){
      const tabName =
        tab.dataset.tab || "";

      activateCompanyTab(
        tabName
      );

      if(tabName === "payments"){
        loadHistory(true);
      }

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
