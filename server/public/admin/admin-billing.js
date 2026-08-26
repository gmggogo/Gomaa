/* =========================================
   ADMIN BILLING
   RESILIENT TENANT BILLING + STRIPE CONNECT
========================================= */

(function(){

  "use strict";

  function normalizeRole(value){
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g,"_");
  }

  function sessionValue(sessionKey, legacyKey){
    return String(
      sessionStorage.getItem(sessionKey) ||
      localStorage.getItem(legacyKey) ||
      ""
    ).trim();
  }

  function getToken(){
    return sessionValue("staffToken","token");
  }

  function getRole(){
    const role =
      normalizeRole(
        sessionValue("staffRole","role")
      );

    if(role === "SUPERADMIN"){
      return "SUPER_ADMIN";
    }

    return role;
  }

  function getTenantSlug(){
    return String(
      sessionStorage.getItem("staffTenantSlug") ||
      sessionStorage.getItem("loginTenantSlug") ||
      localStorage.getItem("tenantSlug") ||
      ""
    )
    .trim()
    .toLowerCase();
  }

  function syncLegacyAuth(){

    const token =
      sessionStorage.getItem("staffToken");

    const role =
      sessionStorage.getItem("staffRole");

    const tenantId =
      sessionStorage.getItem("staffTenantId");

    const tenantSlug =
      sessionStorage.getItem("staffTenantSlug");

    if(token){
      localStorage.setItem("token",token);
    }

    if(role){
      localStorage.setItem("role",role);
    }

    if(tenantId){
      localStorage.setItem("tenantId",tenantId);
    }

    if(tenantSlug){
      localStorage.setItem("tenantSlug",tenantSlug);
    }
  }

  function start(){

    syncLegacyAuth();

    const token =
      getToken();

    const role =
      getRole();

    if(
      !token ||
      ![
        "SUPER_ADMIN",
        "ADMIN"
      ].includes(role)
    ){
      window.location.href =
        "/login.html";
      return;
    }

    const container =
      document.getElementById(
        "billingContainer"
      );

    const searchInput =
      document.getElementById(
        "searchInput"
      );

    const statusFilter =
      document.getElementById(
        "statusFilter"
      );

    const monthFilter =
      document.getElementById(
        "monthFilter"
      );

    const yearFilter =
      document.getElementById(
        "yearFilter"
      );

    const stripeStatus =
      document.getElementById(
        "stripeStatus"
      );

    const stripeAccountText =
      document.getElementById(
        "stripeAccountText"
      );

    const connectStripeBtn =
      document.getElementById(
        "connectStripeBtn"
      );

    const stripeDashboardBtn =
      document.getElementById(
        "stripeDashboardBtn"
      );

    let companies = [];

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

      months.forEach((month,index)=>{

        const value =
          String(index + 1);

        if(
          existingValues.has(value)
        ){
          return;
        }

        const option =
          document.createElement(
            "option"
          );

        option.value =
          value;

        option.textContent =
          month;

        monthFilter.appendChild(
          option
        );

      });

    }

    function money(value){
      return "$" +
        Number(value || 0)
          .toFixed(2);
    }

    function getArizonaDate(value){

      if(!value){
        return null;
      }

      return new Date(
        new Date(value)
          .toLocaleString(
            "en-US",
            {
              timeZone:
                "America/Phoenix"
            }
          )
      );
    }

    function formatDate(value){

      if(!value){
        return "--";
      }

      const date =
        getArizonaDate(value);

      if(
        !date ||
        Number.isNaN(
          date.getTime()
        )
      ){
        return "--";
      }

      return date.toLocaleDateString(
        "en-US",
        {
          year:"numeric",
          month:"short",
          day:"numeric",
          timeZone:
            "America/Phoenix"
        }
      );
    }

    function toInputDate(value){

      if(!value){
        return "";
      }

      const date =
        getArizonaDate(value);

      if(
        !date ||
        Number.isNaN(
          date.getTime()
        )
      ){
        return "";
      }

      const year =
        date.getFullYear();

      const month =
        String(
          date.getMonth() + 1
        ).padStart(2,"0");

      const day =
        String(
          date.getDate()
        ).padStart(2,"0");

      return (
        `${year}-${month}-${day}`
      );
    }

    async function readResponse(res){

      const text =
        await res.text();

      if(!text){
        return {};
      }

      try{
        return JSON.parse(text);
      }catch(err){
        return {
          message:text
        };
      }
    }

    async function apiFetch(
      url,
      options = {},
      timeoutMs = 15000
    ){

      const controller =
        new AbortController();

      const timer =
        setTimeout(
          ()=>{
            controller.abort();
          },
          timeoutMs
        );

      try{

        const headers = {
          ...(options.headers || {}),
          Authorization:
            "Bearer " + getToken()
        };

        const res =
          await fetch(
            url,
            {
              ...options,
              headers,
              signal:
                controller.signal,
              cache:"no-store"
            }
          );

        const data =
          await readResponse(res);

        if(!res.ok){

          const error =
            new Error(
              data.message ||
              `Request failed (${res.status})`
            );

          error.status =
            res.status;

          throw error;
        }

        return data;

      }catch(err){

        if(
          err &&
          err.name ===
            "AbortError"
        ){
          throw new Error(
            "Request timed out"
          );
        }

        throw err;

      }finally{

        clearTimeout(
          timer
        );
      }
    }

    function setStripeUi(
      type,
      text,
      accountId = ""
    ){

      if(stripeStatus){

        stripeStatus.className =
          "stripe-status " +
          type;

        stripeStatus.textContent =
          text;
      }

      if(stripeAccountText){

        if(accountId){

          stripeAccountText.textContent =
            "Connected account: " +
            accountId;

        }else if(
          type === "connected"
        ){

          stripeAccountText.textContent =
            "Stripe is connected and ready to receive payments.";

        }else{

          stripeAccountText.textContent =
            "Connect the organization Stripe account to receive Company Billing and Get Quote payments.";
        }
      }
    }

    async function loadStripeStatus(){

      if(!connectStripeBtn){
        return;
      }

      setStripeUi(
        "pending",
        "CHECKING"
      );

      /*
        Keep Connect Stripe usable even if the status endpoint
        is slow or unavailable.
      */
      connectStripeBtn.disabled =
        false;

      try{

        const data =
          await apiFetch(
            "/api/tenant-stripe/status",
            {
              method:"GET"
            },
            10000
          );

        const connected =
          data.connected === true &&
          data.chargesEnabled === true;

        if(connected){

          setStripeUi(
            "connected",
            "CONNECTED",
            data.stripeAccountId ||
            ""
          );

          connectStripeBtn.textContent =
            "Manage Stripe";

          if(stripeDashboardBtn){

            stripeDashboardBtn.style.display =
              "inline-flex";

            stripeDashboardBtn.disabled =
              false;
          }

        }else{

          setStripeUi(
            "pending",
            data.stripeAccountId
              ? "SETUP REQUIRED"
              : "NOT CONNECTED",
            data.stripeAccountId ||
            ""
          );

          connectStripeBtn.textContent =
            data.stripeAccountId
              ? "Continue Stripe Setup"
              : "Connect Stripe";

          if(stripeDashboardBtn){

            stripeDashboardBtn.style.display =
              "none";
          }
        }

      }catch(err){

        console.log(
          "STRIPE STATUS ERROR:",
          err
        );

        setStripeUi(
          "error",
          "NOT CONNECTED"
        );

        connectStripeBtn.textContent =
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

      if(!connectStripeBtn){
        return;
      }

      const originalText =
        connectStripeBtn.textContent ||
        "Connect Stripe";

      try{

        connectStripeBtn.disabled =
          true;

        connectStripeBtn.textContent =
          "Opening Stripe...";

        const data =
          await apiFetch(
            "/api/tenant-stripe/connect",
            {
              method:"POST",
              headers:{
                "Content-Type":
                  "application/json"
              },
              body:
                JSON.stringify({
                  tenantSlug:
                    getTenantSlug()
                })
            },
            20000
          );

        if(!data.url){

          throw new Error(
            "Stripe onboarding link missing"
          );
        }

        window.location.assign(
          data.url
        );

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

        connectStripeBtn.textContent =
          originalText;
      }
    }

    async function openStripeDashboard(){

      if(!stripeDashboardBtn){
        return;
      }

      const originalText =
        stripeDashboardBtn.textContent ||
        "Open Stripe Dashboard";

      try{

        stripeDashboardBtn.disabled =
          true;

        stripeDashboardBtn.textContent =
          "Opening...";

        const data =
          await apiFetch(
            "/api/tenant-stripe/dashboard-link",
            {
              method:"POST"
            },
            20000
          );

        if(!data.url){

          throw new Error(
            "Stripe dashboard link missing"
          );
        }

        window.location.assign(
          data.url
        );

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

        stripeDashboardBtn.textContent =
          originalText;
      }
    }

    async function loadBilling(){

      if(!container){

        console.error(
          "billingContainer not found"
        );

        return;
      }

      container.innerHTML = `
        <div class="empty">
          Loading billing...
        </div>
      `;

      try{

        let data;

        try{

          data =
            await apiFetch(
              "/api/admin/billing",
              {
                method:"GET"
              },
              15000
            );

        }catch(primaryErr){

          console.log(
            "ADMIN BILLING PRIMARY LOAD ERROR:",
            primaryErr
          );

          /*
            Fallback keeps the company list available if the billing
            calculation endpoint is temporarily slow. Saved billing
            fields on each company are still rendered.
          */
          data =
            await apiFetch(
              "/api/users/company",
              {
                method:"GET"
              },
              10000
            );
        }

        companies =
          Array.isArray(data)
            ? data
            : Array.isArray(
                data.companies
              )
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
        list.map(company=>{

          return `

            <div class="company-card">

              <div class="company-top">

                <div class="company-box">

                  <div class="company-name">
                    ${company.name || company.username || "--"}
                  </div>

                  <div class="company-small">
                    ${company.email || "--"}
                    <br>
                    ${company.phone || "--"}
                    <br>
                    ${company.username || "--"}
                  </div>

                </div>

                <div>

                  ${
                    company.billingLocked
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
                    ${company.totalTrips || 0}
                  </div>
                </div>

                <div class="stat-box">
                  <div class="stat-label">
                    Completed
                  </div>
                  <div class="stat-value">
                    ${company.completedTrips || 0}
                  </div>
                </div>

                <div class="stat-box">
                  <div class="stat-label">
                    Shared
                  </div>
                  <div class="stat-value">
                    ${company.sharedTrips || 0}
                  </div>
                </div>

                <div class="stat-box">
                  <div class="stat-label">
                    No Show
                  </div>
                  <div class="stat-value">
                    ${company.noShowTrips || 0}
                  </div>
                </div>

                <div class="stat-box">
                  <div class="stat-label">
                    Revenue
                  </div>
                  <div class="stat-value">
                    ${money(company.revenue)}
                  </div>
                </div>

                <div class="stat-box">
                  <div class="stat-label">
                    Invoice
                  </div>
                  <div class="stat-value">
                    ${money(company.invoiceAmount)}
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
                    id="start-${company._id}"
                    value="${toInputDate(company.billingStartDate)}"
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
                    id="end-${company._id}"
                    value="${toInputDate(company.billingEndDate)}"
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
                    id="grace-${company._id}"
                    value="${company.graceDays || 3}"
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
                    value="${formatDate(company.lastPaymentDate)}"
                    disabled
                  >
                </div>

              </div>

              <div class="btn-row">

                <button
                  class="btn btn-blue"
                  onclick="editBilling('${company._id}')"
                  id="editBtn-${company._id}"
                >
                  Edit
                </button>

                <button
                  class="btn btn-green"
                  onclick="saveBilling('${company._id}')"
                  id="saveBtn-${company._id}"
                  style="display:none;"
                >
                  Save
                </button>

                <button
                  class="btn btn-dark"
                  onclick="openInvoice('${company._id}')"
                >
                  Open Invoice
                </button>

                <button
                  class="btn btn-yellow"
                  onclick="markPaid('${company._id}')"
                >
                  Mark Paid
                </button>

                <button
                  class="btn btn-red"
                  onclick="lockCompany('${company._id}')"
                >
                  Lock
                </button>

                <button
                  class="btn btn-green"
                  onclick="unlockCompany('${company._id}')"
                >
                  Unlock
                </button>

              </div>

            </div>
          `;

        }).join("");
    }

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

        if(start){
          start.disabled = false;
        }

        if(end){
          end.disabled = false;
        }

        if(grace){
          grace.disabled = false;
        }

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

          await apiFetch(
            `/api/admin/generate-invoice/${id}`,
            {
              method:"PUT",
              headers:{
                "Content-Type":
                  "application/json"
              },
              body:
                JSON.stringify({
                  billingStartDate:
                    start,
                  billingEndDate:
                    end,
                  graceDays:
                    grace
                })
            }
          );

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

          await apiFetch(
            `/api/admin/billing/${id}/lock`,
            {
              method:"PUT"
            }
          );

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

          await apiFetch(
            `/api/admin/billing/${id}/unlock`,
            {
              method:"PUT"
            }
          );

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
              row =>
                String(row._id) ===
                String(id)
            );

          if(!company){
            return;
          }

          const ok =
            confirm(
              `Mark invoice as PAID?\n\n` +
              `Company: ${company.name || company.username || "--"}\n` +
              `Invoice Amount: ${money(company.invoiceAmount)}\n\n` +
              `This will reset the invoice, unlock the company, and start a new billing cycle.\n\n` +
              `Continue?`
            );

          if(!ok){
            return;
          }

          await apiFetch(
            `/api/admin/billing/${id}/mark-paid`,
            {
              method:"PUT"
            }
          );

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
          list.filter(company=>{

            const text = `
              ${company.name || ""}
              ${company.email || ""}
              ${company.phone || ""}
              ${company.username || ""}
            `.toLowerCase();

            return text.includes(
              search
            );
          });
      }

      if(status){

        list =
          list.filter(
            company =>
              String(
                company.billingStatus ||
                ""
              ) === status
          );
      }

      if(month){

        list =
          list.filter(company=>{

            if(
              !company.billingStartDate
            ){
              return false;
            }

            const date =
              new Date(
                company.billingStartDate
              );

            return (
              date.getMonth() + 1
            ) == month;
          });
      }

      if(year){

        list =
          list.filter(company=>{

            if(
              !company.billingStartDate
            ){
              return false;
            }

            const date =
              new Date(
                company.billingStartDate
              );

            return (
              date.getFullYear()
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

    if(connectStripeBtn){

      connectStripeBtn.disabled =
        false;

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

    /*
      Run independently so a slow Stripe request can never
      block the company billing list.
    */
    loadBilling();

    loadStripeStatus();

    window.addEventListener(
      "pageshow",
      ()=>{
        loadStripeStatus();
      }
    );
  }

  if(
    document.readyState ===
    "loading"
  ){

    document.addEventListener(
      "DOMContentLoaded",
      start,
      {
        once:true
      }
    );

  }else{

    start();
  }

})();
