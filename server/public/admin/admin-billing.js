/* =========================================
   ADMIN BILLING
   FIXED: DOM READY + SAFE ELEMENT BINDING
========================================= */

document.addEventListener("DOMContentLoaded", () => {

  /* =========================
     AUTH
  ========================= */

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
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g,"_");

  if(
    !token ||
    role !== "SUPER_ADMIN"
  ){
    window.location.replace(
      "/login.html"
    );
    return;
  }

  /* =========================
     ELEMENTS
  ========================= */

  const container =
    document.getElementById("billingContainer");

  const searchInput =
    document.getElementById("searchInput");

  const statusFilter =
    document.getElementById("statusFilter");

  const monthFilter =
    document.getElementById("monthFilter");

  const yearFilter =
    document.getElementById("yearFilter");

  const stripeStatus =
    document.getElementById("stripeStatus");

  const stripeAccountText =
    document.getElementById("stripeAccountText");

  const connectStripeBtn =
    document.getElementById("connectStripeBtn");

  const stripeDashboardBtn =
    document.getElementById("stripeDashboardBtn");

  /* =========================
     DATA
  ========================= */

  let companies = [];
  const paymentHistoryCache = new Map();
  const paymentHistoryFilters = new Map();
  let stripeAccountLinked = false;
  let stripePaymentReady = false;

  /* =========================
     MONTHS
  ========================= */

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  if(monthFilter){

    const existingValues =
      new Set(
        Array.from(
          monthFilter.options || []
        ).map(
          option =>
            String(option.value)
        )
      );

    months.forEach((m,i)=>{

      const value =
        String(i + 1);

      if(
        existingValues.has(
          value
        )
      ){
        return;
      }

      monthFilter.innerHTML += `
        <option value="${value}">
          ${m}
        </option>
      `;

    });

  }

  /* =========================
     HELPERS
  ========================= */

  function money(value){

    return "$" +
      Number(value || 0)
        .toFixed(2);

  }

  function getArizonaDate(value){

    if(!value) return null;

    return new Date(
      new Date(value).toLocaleString(
        "en-US",
        {
          timeZone:"America/Phoenix"
        }
      )
    );

  }

  function formatDate(value){

    if(!value) return "--";

    const d =
      getArizonaDate(value);

    if(
      !d ||
      isNaN(d.getTime())
    ){
      return "--";
    }

    return d.toLocaleDateString(
      "en-US",
      {
        year:"numeric",
        month:"short",
        day:"numeric",
        timeZone:"America/Phoenix"
      }
    );

  }

  function toInputDate(value){

    if(!value) return "";

    const d =
      getArizonaDate(value);

    if(
      !d ||
      isNaN(d.getTime())
    ){
      return "";
    }

    const year =
      d.getFullYear();

    const month =
      String(
        d.getMonth() + 1
      ).padStart(
        2,
        "0"
      );

    const day =
      String(
        d.getDate()
      ).padStart(
        2,
        "0"
      );

    return `${year}-${month}-${day}`;

  }

  async function safeJson(res){

    try{
      return await res.json();
    }catch(err){
      return {};
    }

  }

  async function fetchWithTimeout(
    url,
    options = {},
    timeoutMs = 10000
  ){

    const controller =
      new AbortController();

    const timer =
      setTimeout(
        ()=>controller.abort(),
        timeoutMs
      );

    try{

      return await fetch(
        url,
        {
          ...options,
          signal:controller.signal
        }
      );

    }finally{

      clearTimeout(timer);

    }

  }

  function getTenantSlug(){

    return String(
      localStorage.getItem("tenantSlug") ||
      sessionStorage.getItem("loginTenantSlug") ||
      ""
    )
    .trim()
    .toLowerCase();

  }

  function setStripeUi(
    type,
    text,
    accountId = ""
  ){

    if(!stripeStatus){
      return;
    }

    stripeStatus.className =
      "stripe-status " + type;

    stripeStatus.innerText =
      text;

    if(stripeAccountText){

      if(accountId){

        stripeAccountText.innerText =
          "Connected account: " +
          accountId;

      }else{

        stripeAccountText.innerText =
          type === "connected"
            ? "Stripe is connected and ready to receive payments."
            : "Connect the organization Stripe account to receive Company Billing and Get Quote payments.";

      }

    }

  }

  /* =========================
     STRIPE CONNECT
  ========================= */

  async function loadStripeStatus(){

    if(
      !stripeStatus ||
      !connectStripeBtn
    ){
      return;
    }

    try{

      setStripeUi(
        "pending",
        "CHECKING"
      );

      connectStripeBtn.disabled =
        false;

      if(stripeDashboardBtn){
        stripeDashboardBtn.disabled =
          true;
      }

      const res =
        await fetchWithTimeout(
          "/api/tenant-stripe/status",
          {
            headers:{
              Authorization:
                "Bearer " + token
            },
            cache:"no-store"
          },
          10000
        );

      const data =
        await safeJson(res);

      if(!res.ok){

        throw new Error(
          data.message ||
          "Unable to load Stripe status"
        );

      }

      stripeAccountLinked =
        data.connected === true &&
        !!data.stripeAccountId;

      stripePaymentReady =
        data.chargesEnabled === true &&
        data.detailsSubmitted === true;

      if(
        stripeAccountLinked &&
        stripePaymentReady
      ){

        setStripeUi(
          "connected",
          "CONNECTED",
          data.stripeAccountId || ""
        );

        connectStripeBtn.innerText =
          "Manage Stripe";

        if(stripeDashboardBtn){
          stripeDashboardBtn.style.display =
            "inline-flex";
        }

      }else if(stripeAccountLinked){

        setStripeUi(
          "pending",
          "ACTION REQUIRED",
          data.stripeAccountId || ""
        );

        connectStripeBtn.innerText =
          "Complete Stripe Setup";

        if(stripeDashboardBtn){
          stripeDashboardBtn.style.display =
            "inline-flex";
        }

      }else{

        setStripeUi(
          "pending",
          "NOT CONNECTED"
        );

        connectStripeBtn.innerText =
          "Connect Stripe";

        if(stripeDashboardBtn){
          stripeDashboardBtn.style.display =
            "none";
        }

      }

      connectStripeBtn.disabled =
        false;

      if(stripeDashboardBtn){
        stripeDashboardBtn.disabled =
          false;
      }

    }catch(err){

      stripeAccountLinked = false;
      stripePaymentReady = false;

      console.log(
        "STRIPE STATUS ERROR:",
        err
      );

      setStripeUi(
        "error",
        "NOT CONNECTED"
      );

      connectStripeBtn.innerText =
        "Connect Stripe";

      connectStripeBtn.disabled =
        false;

      if(stripeDashboardBtn){
        stripeDashboardBtn.style.display =
          "none";
      }

    }

  }

  async function connectStripe(){

    try{

      if(!connectStripeBtn){
        return;
      }

      if(stripeAccountLinked){
        await openStripeDashboard();
        return;
      }

      connectStripeBtn.disabled =
        true;

      connectStripeBtn.innerText =
        "Opening Stripe...";

      const res =
        await fetchWithTimeout(
          "/api/tenant-stripe/connect",
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json",

              Authorization:
                "Bearer " + token
            },

            body:JSON.stringify({
              tenantSlug:
                getTenantSlug()
            })
          },
          20000
        );

      const data =
        await safeJson(res);

      if(!res.ok){

        throw new Error(
          data.message ||
          "Unable to connect Stripe"
        );

      }

      if(!data.url){

        throw new Error(
          "Stripe onboarding link missing"
        );

      }

      window.location.href =
        data.url;

    }catch(err){

      console.log(
        "STRIPE CONNECT ERROR:",
        err
      );

      alert(
        err.message ||
        "Unable to connect Stripe"
      );

      connectStripeBtn.disabled =
        false;

      connectStripeBtn.innerText =
        "Connect Stripe";

    }

  }

  async function openStripeDashboard(){

    try{

      if(!stripeDashboardBtn){
        return;
      }

      stripeDashboardBtn.disabled =
        true;

      stripeDashboardBtn.innerText =
        "Opening...";

      const res =
        await fetchWithTimeout(
          "/api/tenant-stripe/dashboard-link",
          {
            method:"POST",

            headers:{
              Authorization:
                "Bearer " + token
            }
          },
          20000
        );

      const data =
        await safeJson(res);

      if(!res.ok){

        throw new Error(
          data.message ||
          "Unable to open Stripe dashboard"
        );

      }

      if(!data.url){

        throw new Error(
          "Stripe dashboard link missing"
        );

      }

      window.location.href =
        data.url;

    }catch(err){

      console.log(
        "STRIPE DASHBOARD ERROR:",
        err
      );

      alert(
        err.message ||
        "Unable to open Stripe dashboard"
      );

      stripeDashboardBtn.disabled =
        false;

      stripeDashboardBtn.innerText =
        "Open Stripe Dashboard";

    }

  }

  if(connectStripeBtn){

    connectStripeBtn.addEventListener(
      "click",
      connectStripe
    );

  }

  if(stripeDashboardBtn){

    stripeDashboardBtn.addEventListener(
      "click",
      openStripeDashboard
    );

  }

  /* =========================
     LOAD BILLING
  ========================= */

  async function loadBilling(){

    if(!container){
      console.error(
        "billingContainer not found"
      );
      return;
    }

    try{

      container.innerHTML = `
        <div class="empty">
          Loading billing...
        </div>
      `;

      const res =
        await fetch(
          "/api/admin/billing",
          {
            headers:{
              Authorization:
                "Bearer " + token
            },
            cache:"no-store"
          }
        );

      const data =
        await safeJson(res);

      if(!res.ok){

        throw new Error(
          data.message ||
          "Billing load failed"
        );

      }

      companies =
        Array.isArray(data)
          ? data
          : Array.isArray(data.companies)
            ? data.companies
            : [];

      render(companies);

    }catch(err){

      console.log(
        "ADMIN BILLING LOAD ERROR:",
        err
      );

      container.innerHTML = `
        <div class="empty">
          ${String(
            err.message ||
            "Error loading companies"
          )}
        </div>
      `;

    }

  }


  function historyYearOptions(rows){
    const years =
      [...new Set(
        (Array.isArray(rows) ? rows : [])
          .map(row=>{
            const d = new Date(row?.paidDate || row?.createdAt || 0);
            return Number.isNaN(d.getTime()) ? "" : String(d.getFullYear());
          })
          .filter(Boolean)
      )]
      .sort((a,b)=>Number(b)-Number(a));

    return [
      `<option value="">All Years</option>`,
      ...years.map(y=>`<option value="${y}">${y}</option>`)
    ].join("");
  }

  function historyMonthOptions(){
    return [
      `<option value="">All Months</option>`,
      ...months.map((name,index)=>
        `<option value="${index + 1}">${name}</option>`
      )
    ].join("");
  }

  function historyInvoiceNumber(row){
    const explicit =
      String(row?.invoiceNumber || "").trim();

    if(explicit){
      return explicit;
    }

    const suffix =
      String(row?._id || "")
        .slice(-8)
        .toUpperCase();

    return suffix
      ? `GH-COMP-${suffix}`
      : "--";
  }

  function filterHistoryRows(companyId,rows){
    const filter =
      paymentHistoryFilters.get(String(companyId)) ||
      {year:"",month:""};

    return (Array.isArray(rows) ? rows : [])
      .filter(row=>{
        const d =
          new Date(
            row?.paidDate ||
            row?.createdAt ||
            0
          );

        if(Number.isNaN(d.getTime())){
          return !filter.year && !filter.month;
        }

        if(
          filter.year &&
          String(d.getFullYear()) !==
          String(filter.year)
        ){
          return false;
        }

        if(
          filter.month &&
          String(d.getMonth() + 1) !==
          String(filter.month)
        ){
          return false;
        }

        return true;
      });
  }

  function renderPaymentHistory(companyId){
    const id = String(companyId || "");
    const body =
      document.getElementById(
        `historyBody-${id}`
      );

    if(!body) return;

    const rows =
      paymentHistoryCache.get(id) || [];

    const filtered =
      filterHistoryRows(id,rows);

    body.innerHTML =
      filtered.length
        ? filtered.map(row=>`
            <tr>
              <td>${formatDate(row.paidDate || row.createdAt)}</td>
              <td>${historyInvoiceNumber(row)}</td>
              <td>
                ${formatDate(row.billingStartDate)}
                -
                ${formatDate(row.billingEndDate)}
              </td>
              <td>${Number(row.totalTrips || 0)}</td>
              <td>${Number(row.completedTrips || 0)}</td>
              <td>${Number(row.sharedTrips || 0)}</td>
              <td>${Number(row.noShowTrips || 0)}</td>
              <td>${String(row.paymentMethod || "STRIPE")}</td>
              <td class="amount">${money(row.invoiceAmount)}</td>
              <td>
                <button
                  class="history-action"
                  type="button"
                  onclick="openHistoryInvoice('${id}','${String(row._id || "")}')"
                >
                  Open Invoice
                </button>
              </td>
              <td>
                <button
                  class="history-action print"
                  type="button"
                  onclick="printHistoryInvoice('${id}','${String(row._id || "")}')"
                >
                  Print
                </button>
              </td>
            </tr>
          `).join("")
        : `
          <tr>
            <td colspan="11" class="history-empty">
              No payment history found for this period.
            </td>
          </tr>
        `;
  }

  async function loadPaymentHistory(companyId){
    const id = String(companyId || "");

    const body =
      document.getElementById(
        `historyBody-${id}`
      );

    if(body){
      body.innerHTML = `
        <tr>
          <td colspan="11" class="history-empty">
            Loading payment history...
          </td>
        </tr>
      `;
    }

    try{
      const res =
        await fetch(
          `/api/admin/billing-history/${encodeURIComponent(id)}`,
          {
            headers:{
              Authorization:
                "Bearer " + token
            },
            cache:"no-store"
          }
        );

      const data =
        await safeJson(res);

      if(!res.ok){
        throw new Error(
          data.message ||
          "Unable to load payment history"
        );
      }

      const rows =
        Array.isArray(data.history)
          ? data.history
          : [];

      paymentHistoryCache.set(
        id,
        rows
      );

      const yearSelect =
        document.getElementById(
          `historyYear-${id}`
        );

      if(yearSelect){
        const selected =
          String(
            paymentHistoryFilters.get(id)?.year ||
            ""
          );

        yearSelect.innerHTML =
          historyYearOptions(rows);

        yearSelect.value =
          selected;
      }

      renderPaymentHistory(id);

    }catch(err){
      console.log(
        "PAYMENT HISTORY LOAD ERROR:",
        err
      );

      if(body){
        body.innerHTML = `
          <tr>
            <td colspan="11" class="history-empty">
              ${String(err.message || "Unable to load payment history")}
            </td>
          </tr>
        `;
      }
    }
  }

  window.setHistoryFilter =
  function setHistoryFilter(
    companyId,
    key,
    value
  ){
    const id =
      String(companyId || "");

    const current =
      paymentHistoryFilters.get(id) ||
      {year:"",month:""};

    current[key] =
      String(value || "");

    paymentHistoryFilters.set(
      id,
      current
    );

    renderPaymentHistory(id);
  };

  window.openHistoryInvoice =
  function openHistoryInvoice(
    companyId,
    historyId
  ){
    window.open(
      `/admin/invoice.html?id=${encodeURIComponent(companyId)}&historyId=${encodeURIComponent(historyId)}`,
      "_blank"
    );
  };

  window.printHistoryInvoice =
  function printHistoryInvoice(
    companyId,
    historyId
  ){
    window.open(
      `/admin/invoice.html?id=${encodeURIComponent(companyId)}&historyId=${encodeURIComponent(historyId)}&print=1`,
      "_blank"
    );
  };

  /* =========================
     RENDER
  ========================= */

  function render(list){

    if(!container){
      return;
    }

    if(!list.length){

      container.innerHTML = `
        <div class="empty">
          No companies found
        </div>
      `;

      return;
    }

    container.innerHTML =
      list.map(c=>{

        return `

          <div class="company-card">

            <div class="company-top">

              <div class="company-info-bar">

                <div class="company-info-item">
                  <span class="company-info-label">Company Name</span>
                  <strong class="company-info-value">
                    ${c.name || "--"}
                  </strong>
                </div>

                <div class="company-info-item">
                  <span class="company-info-label">Email</span>
                  <strong class="company-info-value">
                    ${c.email || "--"}
                  </strong>
                </div>

                <div class="company-info-item">
                  <span class="company-info-label">Phone</span>
                  <strong class="company-info-value">
                    ${c.phone || "--"}
                  </strong>
                </div>

              </div>

              <div class="company-status-wrap">

                ${
                  c.billingLocked

                    ? `
                      <span class="badge locked">
                        LOCKED
                      </span>
                    `

                    : `
                      <span class="badge active">
                        ACTIVE
                      </span>
                    `
                }

              </div>

            </div>

            <div class="stats-grid">

              <div class="stat-box">
                <div class="stat-label">
                  Trips
                </div>
                <div class="stat-value">
                  ${c.totalTrips || 0}
                </div>
              </div>

              <div class="stat-box">
                <div class="stat-label">
                  Completed
                </div>
                <div class="stat-value">
                  ${c.completedTrips || 0}
                </div>
              </div>

              <div class="stat-box">
                <div class="stat-label">
                  Shared
                </div>
                <div class="stat-value">
                  ${c.sharedTrips || 0}
                </div>
              </div>

              <div class="stat-box">
                <div class="stat-label">
                  No Show
                </div>
                <div class="stat-value">
                  ${c.noShowTrips || 0}
                </div>
              </div>

              <div class="stat-box">
                <div class="stat-label">
                  Revenue
                </div>
                <div class="stat-value">
                  ${money(c.revenue)}
                </div>
              </div>

              <div class="stat-box">
                <div class="stat-label">
                  Invoice
                </div>
                <div class="stat-value">
                  ${money(c.invoiceAmount)}
                </div>
              </div>

            </div>

            <div class="billing-grid">

              <div class="field">
                <label>
                  Billing Start
                </label>

                <input
                  type="date"
                  class="small-input"
                  id="start-${c._id}"
                  value="${toInputDate(c.billingStartDate)}"
                  disabled
                >
              </div>

              <div class="field">
                <label>
                  Billing End
                </label>

                <input
                  type="date"
                  class="small-input"
                  id="end-${c._id}"
                  value="${toInputDate(c.billingEndDate)}"
                  disabled
                >
              </div>

              <div class="field">
                <label>
                  Grace Days
                </label>

                <input
                  type="number"
                  class="small-input"
                  id="grace-${c._id}"
                  value="${c.graceDays || 3}"
                  disabled
                >
              </div>

              <div class="field">
                <label>
                  Last Payment
                </label>

                <input
                  type="text"
                  class="small-input"
                  value="${formatDate(c.lastPaymentDate)}"
                  disabled
                >
              </div>

            </div>

            <div class="btn-row">

              <button
                class="btn btn-blue"
                onclick="editBilling('${c._id}')"
                id="editBtn-${c._id}"
              >
                Edit
              </button>

              <button
                class="btn btn-green"
                onclick="saveBilling('${c._id}')"
                id="saveBtn-${c._id}"
                style="display:none;"
              >
                Save
              </button>

              <button
                class="btn btn-dark"
                onclick="openInvoice('${c._id}')"
              >
                Open Invoice
              </button>

              <button
                class="btn btn-yellow"
                onclick="markPaid('${c._id}')"
              >
                Mark Paid
              </button>

              <button
                class="btn btn-red"
                onclick="lockCompany('${c._id}')"
              >
                Lock
              </button>

              <button
                class="btn btn-green"
                onclick="unlockCompany('${c._id}')"
              >
                Unlock
              </button>

            </div>

            <section class="payment-history">
              <div class="payment-history-head">
                <div class="payment-history-title">
                  Payment History
                </div>
                <div class="payment-history-note">
                  Retained for 3 years
                </div>
              </div>

              <div class="payment-history-tools">
                <select
                  class="history-select"
                  id="historyYear-${c._id}"
                  onchange="setHistoryFilter('${c._id}','year',this.value)"
                >
                  <option value="">All Years</option>
                </select>

                <select
                  class="history-select"
                  id="historyMonth-${c._id}"
                  onchange="setHistoryFilter('${c._id}','month',this.value)"
                >
                  ${historyMonthOptions()}
                </select>
              </div>

              <div class="history-table-wrap">
                <table class="history-table">
                  <thead>
                    <tr>
                      <th>Paid Date</th>
                      <th>Invoice</th>
                      <th>Billing Period</th>
                      <th>Trips</th>
                      <th>Completed</th>
                      <th>Shared</th>
                      <th>No Show</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Invoice</th>
                      <th>Print</th>
                    </tr>
                  </thead>
                  <tbody id="historyBody-${c._id}">
                    <tr>
                      <td colspan="11" class="history-empty">
                        Loading payment history...
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

          </div>

        `;

      }).join("");

    list.forEach(company=>{
      loadPaymentHistory(
        company._id
      );
    });

  }

  /* =========================
     ACTIONS
     Expose to inline onclick
  ========================= */

  window.editBilling =
  function editBilling(id){

    const start =
      document.getElementById(
        `start-${id}`
      );

    const end =
      document.getElementById(
        `end-${id}`
      );

    const grace =
      document.getElementById(
        `grace-${id}`
      );

    const editBtn =
      document.getElementById(
        `editBtn-${id}`
      );

    const saveBtn =
      document.getElementById(
        `saveBtn-${id}`
      );

    if(start) start.disabled = false;
    if(end) end.disabled = false;
    if(grace) grace.disabled = false;

    if(editBtn){
      editBtn.style.display =
        "none";
    }

    if(saveBtn){
      saveBtn.style.display =
        "inline-flex";
    }

  };

  window.saveBilling =
  async function saveBilling(id){

    try{

      const start =
        document.getElementById(
          `start-${id}`
        )?.value || "";

      const end =
        document.getElementById(
          `end-${id}`
        )?.value || "";

      const grace =
        document.getElementById(
          `grace-${id}`
        )?.value || 3;

      if(!start || !end){

        alert(
          "Please select dates"
        );

        return;

      }

      const res =
        await fetch(
          `/api/admin/generate-invoice/${id}`,
          {
            method:"PUT",

            headers:{
              "Content-Type":
                "application/json",

              Authorization:
                "Bearer " + token
            },

            body:JSON.stringify({
              billingStartDate:start,
              billingEndDate:end,
              graceDays:grace
            })
          }
        );

      const data =
        await safeJson(res);

      if(!res.ok){

        throw new Error(
          data.message ||
          "Save failed"
        );

      }

      alert("Saved");

      await loadBilling();

    }catch(err){

      console.log(err);

      alert(
        err.message ||
        "Save failed"
      );

    }

  };

  window.openInvoice =
  function openInvoice(id){

    window.open(
      `/admin/invoice.html?id=${id}`,
      "_blank"
    );

  };

  window.lockCompany =
  async function lockCompany(id){

    try{

      const res =
        await fetch(
          `/api/admin/billing/${id}/lock`,
          {
            method:"PUT",
            headers:{
              Authorization:
                "Bearer " + token
            }
          }
        );

      const data =
        await safeJson(res);

      if(!res.ok){

        throw new Error(
          data.message ||
          "Lock failed"
        );

      }

      await loadBilling();

    }catch(err){

      console.log(err);

      alert(
        err.message ||
        "Lock failed"
      );

    }

  };

  window.unlockCompany =
  async function unlockCompany(id){

    try{

      const res =
        await fetch(
          `/api/admin/billing/${id}/unlock`,
          {
            method:"PUT",
            headers:{
              Authorization:
                "Bearer " + token
            }
          }
        );

      const data =
        await safeJson(res);

      if(!res.ok){

        throw new Error(
          data.message ||
          "Unlock failed"
        );

      }

      await loadBilling();

    }catch(err){

      console.log(err);

      alert(
        err.message ||
        "Unlock failed"
      );

    }

  };

  window.markPaid =
  async function markPaid(id){

    try{

      const company =
        companies.find(
          c => c._id === id
        );

      if(!company){
        return;
      }

      const ok =
        confirm(
          `Mark invoice as PAID?\n\n` +
          `Company: ${company.name}\n` +
          `Invoice Amount: ${money(company.invoiceAmount)}\n\n` +
          `This will:\n\n` +
          `• Reset invoice to $0\n` +
          `• Unlock company\n` +
          `• Start new billing cycle\n` +
          `• Reset current billing stats\n\n` +
          `Continue?`
        );

      if(!ok){
        return;
      }

      const res =
        await fetch(
          `/api/admin/billing-history/${id}/mark-paid`,
          {
            method:"PUT",
            headers:{
              Authorization:
                "Bearer " + token
            }
          }
        );

      const data =
        await safeJson(res);

      if(!res.ok){

        throw new Error(
          data.message ||
          "Payment failed"
        );

      }

      alert(
        "Invoice marked as PAID successfully"
      );

      await loadBilling();

    }catch(err){

      console.log(err);

      alert(
        err.message ||
        "Payment failed"
      );

    }

  };

  /* =========================
     FILTERS
  ========================= */

  function applyFilters(){

    let list =
      [...companies];

    const search =
      String(
        searchInput?.value ||
        ""
      )
      .toLowerCase()
      .trim();

    const status =
      String(
        statusFilter?.value ||
        ""
      );

    const month =
      String(
        monthFilter?.value ||
        ""
      );

    const year =
      String(
        yearFilter?.value ||
        ""
      );

    if(search){

      list =
        list.filter(c=>{

          const text = `
            ${c.name || ""}
            ${c.email || ""}
            ${c.phone || ""}
            ${c.username || ""}
          `
          .toLowerCase();

          return text.includes(
            search
          );

        });

    }

    if(status){

      list =
        list.filter(
          c =>
            c.billingStatus ===
            status
        );

    }

    if(month){

      list =
        list.filter(c=>{

          if(!c.billingStartDate){
            return false;
          }

          const d =
            new Date(
              c.billingStartDate
            );

          return (
            d.getMonth() + 1
          ) == month;

        });

    }

    if(year){

      list =
        list.filter(c=>{

          if(!c.billingStartDate){
            return false;
          }

          const d =
            new Date(
              c.billingStartDate
            );

          return (
            d.getFullYear()
          ) == year;

        });

    }

    render(list);

  }

  if(searchInput){
    searchInput.addEventListener(
      "input",
      applyFilters
    );
  }

  if(statusFilter){
    statusFilter.addEventListener(
      "change",
      applyFilters
    );
  }

  if(monthFilter){
    monthFilter.addEventListener(
      "change",
      applyFilters
    );
  }

  if(yearFilter){
    yearFilter.addEventListener(
      "input",
      applyFilters
    );
  }

  /* =========================
     INIT
  ========================= */

  loadStripeStatus();
  loadBilling();

});