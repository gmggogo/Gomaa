/*
=========================================================
GH MOBILITY / SUNBEAM
ROLE BASED ADMIN DASHBOARD

FILE:
D:\Sunbeamllc\server\public\admin\dashboard.js

USES EXISTING APIS ONLY:
- GET /api/trips
- GET /api/services/admin
- GET /api/admin/billing   (SUPER_ADMIN only)

IMPORTANT:
- Dispatcher: operations only.
- Admin: operations + admin shortcuts.
- Super Admin: full tenant finance + payroll shortcuts.
- PLATFORM_ADMIN is not a tenant dashboard role.
- Shared trips are grouped so they are not double counted.
- "New Trips" follows Trips Hub rule: booked within last 2 hours.
=========================================================
*/

(function(){

  "use strict";

  const token =
    localStorage.getItem("token") || "";

  const rawRole =
    String(localStorage.getItem("role") || "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g,"_");

  const role =
    rawRole === "SUPERADMIN"
      ? "SUPER_ADMIN"
      : rawRole === "DISPATCHER"
        ? "DISPATCHER"
        : rawRole === "PLATFORM_ADMIN"
          ? "PLATFORM_ADMIN"
          : "ADMIN";

  if(!token){

    window.location.href =
      "/login.html";

    return;
  }

  /*
    Platform Admin has its own product area.
    Never show tenant finance dashboard to Platform Admin.
  */
  if(role === "PLATFORM_ADMIN"){

    window.location.href =
      "/platform-admin/dashboard.html";

    return;
  }

  const API_TRIPS =
    "/api/trips";

  const API_SERVICES =
    "/api/services/admin";

  const API_BILLING =
    "/api/admin/billing";

  let trips = [];
  let services = [];
  let companies = [];

  /* =========================
     HELPERS
  ========================= */

  function $(id){
    return document.getElementById(id);
  }

  function safe(v){
    return String(v ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;");
  }

  function clean(v){
    return String(v ?? "")
      .trim();
  }

  function cleanStatus(v){

    return clean(v)
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .toLowerCase();
  }

  function statusKey(v){
    return cleanStatus(v)
      .replace(/\s+/g,"");
  }

  function money(v){

    return "$" +
      Number(v || 0)
        .toLocaleString(
          "en-US",
          {
            minimumFractionDigits:2,
            maximumFractionDigits:2
          }
        );
  }

  function formatDate(value){

    if(!value){
      return "--";
    }

    const d =
      new Date(value);

    if(isNaN(d.getTime())){
      return "--";
    }

    return d.toLocaleDateString(
      "en-US",
      {
        month:"short",
        day:"numeric",
        year:"numeric",
        timeZone:
          localStorage.getItem("systemTimezone") ||
          localStorage.getItem("appTimezone") ||
          "America/Phoenix"
      }
    );
  }

  function authHeaders(){

    return token
      ? {
          Authorization:
            "Bearer " + token
        }
      : {};
  }

  async function fetchJson(url){

    const res =
      await fetch(
        url,
        {
          headers:
            authHeaders(),
          cache:"no-store"
        }
      );

    const data =
      await res.json()
        .catch(()=>null);

    if(!res.ok){

      throw new Error(
        data?.message ||
        `Request failed (${res.status})`
      );
    }

    return data;
  }

  /* =========================
     TIME
     Match system / tenant timezone.
  ========================= */

  function timezone(){

    return (
      localStorage.getItem("systemTimezone") ||
      localStorage.getItem("appTimezone") ||
      "America/Phoenix"
    );
  }

  function dateKeyFromValue(value){

    if(!value){
      return "";
    }

    const d =
      value instanceof Date
        ? value
        : new Date(value);

    if(isNaN(d.getTime())){
      return "";
    }

    const parts =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:timezone(),
          year:"numeric",
          month:"2-digit",
          day:"2-digit"
        }
      )
      .formatToParts(d);

    const year =
      parts.find(p=>p.type==="year")?.value || "";

    const month =
      parts.find(p=>p.type==="month")?.value || "";

    const day =
      parts.find(p=>p.type==="day")?.value || "";

    return `${year}-${month}-${day}`;
  }

  function todayKey(){

    return dateKeyFromValue(
      new Date()
    );
  }

  /*
    Trip date is already stored as YYYY-MM-DD wall-clock date.
    Prefer that exact value to avoid browser timezone movement.
  */
  function tripDateKey(trip){

    const raw =
      clean(trip?.tripDate);

    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
      return raw;
    }

    if(raw){
      const parsed = new Date(raw);
      if(!isNaN(parsed.getTime())){
        return dateKeyFromValue(parsed);
      }
    }

    return "";
  }

  /* =========================
     TRIPS HUB STATUS LOGIC
  ========================= */

  function isActiveStatus(status){

    const s = statusKey(status);

    return (
      s === "booked" ||
      s === "scheduled" ||
      s === "confirmed" ||
      s === "paid"
    );
  }

  function isCompletedStatus(status){

    const s = statusKey(status);

    return (
      s === "completed" ||
      s === "complete" ||
      s === "dropoff" ||
      s === "droppedoff"
    );
  }

  function isCancelledStatus(status){

    const s = statusKey(status);

    return (
      s === "cancelled" ||
      s === "canceled" ||
      s.includes("cancel")
    );
  }

  function isNoShowStatus(status){

    const s = statusKey(status);

    return (
      s === "noshow" ||
      s.includes("noshow")
    );
  }

  function isNotCompletedStatus(status){

    return statusKey(status)
      .includes("notcompleted");
  }

  function isAttentionStatus(status){

    return (
      isCancelledStatus(status) ||
      isNoShowStatus(status) ||
      isNotCompletedStatus(status)
    );
  }

  function isDispatchedStatus(status){

    const s =
      statusKey(status);

    return [
      "assigned",
      "sent",
      "accepted",
      "dispatched",
      "received",
      "ontrip",
      "inprogress",
      "arrived",
      "pickedup",
      "pickup"
    ].includes(s);
  }

  function isOnTripStatus(status){

    const s =
      statusKey(status);

    return [
      "accepted",
      "ontrip",
      "inprogress",
      "arrived",
      "pickedup",
      "pickup"
    ].includes(s);
  }

  function getBookedDateObj(trip){

    return new Date(
      trip?.bookedAt ||
      trip?.createdAt ||
      trip?.updatedAt ||
      0
    );
  }

  /*
    EXACT CURRENT TRIPS HUB IDEA:
    New = booked within last 2 hours.
  */
  function isNewTrip(trip){

    const d =
      getBookedDateObj(trip);

    return (
      !isNaN(d.getTime()) &&
      Date.now() - d.getTime()
        <= 2 * 60 * 60 * 1000
    );
  }

  /* =========================
     SHARED GROUP ENGINE
  ========================= */

  function isSharedTrip(trip){

    return (
      trip?.isShared === true ||
      String(trip?.tripType || "")
        .toUpperCase() === "SHARED" ||
      String(trip?.type || "")
        .toLowerCase() === "shared" ||
      clean(trip?.tripNumber)
        .toUpperCase()
        .includes("-SH") ||
      (
        Array.isArray(trip?.passengers) &&
        trip.passengers.length > 0
      )
    );
  }

  function getSharedKey(trip){

    return (
      clean(trip?.groupId) ||
      clean(trip?.tripNumber) ||
      String(
        trip?._id ||
        trip?.id ||
        ""
      )
    );
  }

  function getRealPassengers(group){

    const first =
      group[0] || {};

    if(
      Array.isArray(first.passengers) &&
      first.passengers.length
    ){
      return first.passengers;
    }

    return group.map(
      (trip,index)=>({
        passengerId:
          "P" + (index + 1),

        clientName:
          trip.clientName ||
          trip.name ||
          "",

        status:
          trip.status ||
          "Scheduled"
      })
    );
  }

  function buildTripItems(list){

    const sharedMap =
      new Map();

    list.forEach(trip=>{

      if(!isSharedTrip(trip)){
        return;
      }

      const key =
        getSharedKey(trip);

      if(!sharedMap.has(key)){
        sharedMap.set(key,[]);
      }

      sharedMap
        .get(key)
        .push(trip);
    });

    const used =
      new Set();

    const items = [];

    list.forEach(trip=>{

      if(isSharedTrip(trip)){

        const key =
          getSharedKey(trip);

        if(used.has(key)){
          return;
        }

        used.add(key);

        const group =
          (
            sharedMap.get(key) ||
            [trip]
          )
          .sort(
            (a,b)=>
              Number(a.passengerIndex || 0) -
              Number(b.passengerIndex || 0)
          );

        items.push({
          kind:"shared",
          key,
          trip:group[0],
          group
        });

        return;
      }

      items.push({
        kind:"trip",
        key:String(
          trip?._id ||
          trip?.id ||
          ""
        ),
        trip
      });
    });

    return items;
  }

  function itemStatuses(item){

    if(item.kind !== "shared"){

      return [
        item.trip?.status || ""
      ];
    }

    const passengers =
      getRealPassengers(item.group);

    if(passengers.length){

      return passengers.map(
        p=>p?.status ||
        item.trip?.status ||
        ""
      );
    }

    return item.group.map(
      t=>t?.status || ""
    );
  }

  function itemRepresentativeStatus(item){

    const statuses =
      itemStatuses(item);

    if(!statuses.length){
      return item.trip?.status || "Scheduled";
    }

    /*
      Do NOT invent a "Mixed" status.
      Each passenger keeps its own final status.
      For this small dashboard label only, choose operational priority.
    */
    if(statuses.some(isOnTripStatus)){
      return "On Trip";
    }

    if(statuses.some(isDispatchedStatus)){
      return "Dispatched";
    }

    if(statuses.some(s=>statusKey(s)==="confirmed")){
      return "Confirmed";
    }

    if(statuses.some(s=>statusKey(s)==="paid")){
      return "Paid";
    }

    if(statuses.every(isCompletedStatus)){
      return "Completed";
    }

    if(statuses.every(isNoShowStatus)){
      return "No Show";
    }

    if(statuses.every(isCancelledStatus)){
      return "Cancelled";
    }

    if(statuses.every(isNotCompletedStatus)){
      return "Not Completed";
    }

    /*
      If passenger statuses differ,
      show the main trip status rather than making up "Mixed".
    */
    return (
      item.trip?.status ||
      statuses[0] ||
      "Scheduled"
    );
  }

  function itemIsHubActive(item){

    const statuses =
      itemStatuses(item);

    return statuses.some(
      isActiveStatus
    );
  }

  function itemIsNew(item){

    if(item.kind === "shared"){

      return item.group.some(
        isNewTrip
      );
    }

    return isNewTrip(
      item.trip
    );
  }

  function itemIsToday(item){

    return tripDateKey(
      item.trip
    ) === todayKey();
  }

  function itemIsCompletedToday(item){

    if(!itemIsToday(item)){
      return false;
    }

    const statuses =
      itemStatuses(item);

    /*
      Shared: count group once if at least one rider finished.
      Passenger-level totals still remain in Review/Summary.
    */
    return statuses.some(
      isCompletedStatus
    );
  }

  function itemNeedsAttention(item){

    return itemStatuses(item)
      .some(isAttentionStatus);
  }

  function itemIsDispatched(item){

    const trip =
      item.trip || {};

    const assignmentStatus =
      trip.dispatchStatus ||
      trip.assignmentStatus ||
      trip.driverStatus ||
      "";

    return (
      itemStatuses(item)
        .some(isDispatchedStatus) ||
      isDispatchedStatus(
        assignmentStatus
      ) ||
      trip.driverAssigned === true ||
      !!trip.driverId ||
      !!trip.driverName
    );
  }

  function itemIsOnTrip(item){

    const trip =
      item.trip || {};

    return (
      itemStatuses(item)
        .some(isOnTripStatus) ||
      isOnTripStatus(
        trip.dispatchStatus ||
        trip.assignmentStatus ||
        ""
      )
    );
  }

  /* =========================
     SERVICE HELPERS
  ========================= */

  /*
    DASHBOARD SERVICE VISIBILITY POLICY

    The platform endpoint /api/services/admin must already return only
    services allowed for this tenant by Platform Admin.

    Inside the tenant, a service remains visible on the dashboard
    as long as AT LEAST ONE of these three channels is enabled:

      1) Get Quote Display
      2) Reserved Display
      3) Companies Enable

    It disappears from the dashboard ONLY when all three are OFF.

    This is intentionally OR logic, not first-field-wins logic.
  */

  function boolFlag(value){

    if(value === true) return true;
    if(value === false) return false;

    const s =
      String(value ?? "")
        .trim()
        .toLowerCase();

    if(
      s === "true" ||
      s === "1" ||
      s === "yes" ||
      s === "on" ||
      s === "enabled" ||
      s === "enable"
    ){
      return true;
    }

    if(
      s === "false" ||
      s === "0" ||
      s === "no" ||
      s === "off" ||
      s === "disabled" ||
      s === "disable" ||
      s === ""
    ){
      return false;
    }

    return Boolean(value);
  }

  function getQuoteEnabled(service){

    return boolFlag(
      service?.getQuoteEnabled ??
      service?.getQuoteDisplay ??
      service?.quoteEnabled ??
      service?.displayInGetQuote ??
      service?.showInGetQuote ??
      service?.getquoteEnabled ??
      false
    );
  }

  function reservedEnabled(service){

    return boolFlag(
      service?.reservedEnabled ??
      service?.reservedDisplay ??
      service?.displayInReserved ??
      service?.showInReserved ??
      service?.reservationEnabled ??
      false
    );
  }

  function companiesEnabled(service){

    return boolFlag(
      service?.companyEnabled ??
      service?.companiesEnabled ??
      service?.companyEnable ??
      service?.companiesEnable ??
      service?.displayInCompanies ??
      service?.showInCompanies ??
      false
    );
  }

  function serviceEnabled(service){

    if(!service){
      return false;
    }

    return (
      getQuoteEnabled(service) ||
      reservedEnabled(service) ||
      companiesEnabled(service)
    );
  }

  function serviceCode(service){

    return clean(
      service?.serviceKey ||
      service?.serviceCode ||
      service?.serviceType ||
      service?.suffix ||
      service?.companySuffix ||
      service?.code ||
      ""
    )
    .toUpperCase();
  }

  function serviceName(service){

    return (
      service?.title ||
      service?.name ||
      service?.serviceName ||
      serviceCode(service) ||
      "Service"
    );
  }

  function extractServices(data){

    if(Array.isArray(data)){
      return data;
    }

    if(Array.isArray(data?.services)){
      return data.services;
    }

    if(Array.isArray(data?.items)){
      return data.items;
    }

    return [];
  }

  function tripServiceCode(trip){

    const direct =
      clean(
        trip?.serviceKey ||
        trip?.serviceCode ||
        trip?.serviceType ||
        trip?.serviceSuffix ||
        trip?.service ||
        ""
      )
      .toUpperCase();

    if(direct){
      return direct;
    }

    const num =
      clean(trip?.tripNumber)
        .toUpperCase();

    for(
      const code of
      ["SH","XL","WH","TX","LM","ST"]
    ){

      if(
        num.includes("-" + code)
      ){
        return code;
      }
    }

    return isSharedTrip(trip)
      ? "SH"
      : "";
  }

  function tripServiceName(trip){

    const code =
      tripServiceCode(trip);

    const found =
      services.find(
        service=>
          serviceCode(service) === code
      );

    return found
      ? serviceName(found)
      : (
          trip?.serviceName ||
          code ||
          "--"
        );
  }

  /* =========================
     ROLE / QUICK ACCESS
  ========================= */

  const commonQuick = [
    {
      title:"Trips Hub",
      sub:"Reservations & new trips",
      href:"trips-hub.html"
    },
    {
      title:"Trips",
      sub:"Trip operations",
      href:"trips.html"
    },
    {
      title:"Dispatch",
      sub:"Assign & send drivers",
      href:"dispatch.html"
    },
    {
      title:"Final Confirmation",
      sub:"Finalize completed trips",
      href:"dispatch-final-confirmation.html"
    },
    {
      title:"Dispatch Review",
      sub:"Review final operations",
      href:"dispatch-review.html"
    },
    {
      title:"Driver Schedule",
      sub:"Driver availability",
      href:"driver-schedule.html"
    },
    {
      title:"Drivers Map",
      sub:"Live driver locations",
      href:"maps.html"
    }
  ];

  const adminQuick = [
    {
      title:"Add User",
      sub:"Manage staff accounts",
      href:"users.html"
    },
    {
      title:"Summary",
      sub:"Operational summary",
      href:"summary.html"
    },
    {
      title:"Refunds",
      sub:"Refund review",
      href:"refunds.html"
    },
    {
      title:"System Design",
      sub:"Organization branding",
      href:"system-design.html"
    },
    {
      title:"Smart Dispatch",
      sub:"Dispatch automation",
      href:"smart-dispatch-engine.html"
    }
  ];

  const superQuick = [
    {
      title:"Admin Billing",
      sub:"Contracted companies",
      href:"admin-billing.html"
    },
    {
      title:"Payments",
      sub:"Payment management",
      href:"payments.html"
    },
    {
      title:"Service Management",
      sub:"Pricing & services",
      href:"service-management.html"
    },
    {
      title:"Facility Pricing",
      sub:"Company overrides",
      href:"facility-pricing-override.html"
    },
    {
      title:"Payroll & Earnings",
      sub:"Staff payroll",
      href:"payroll.html"
    },
    {
      title:"Payroll Summary",
      sub:"Payroll history",
      href:"payroll-summary.html"
    }
  ];

  function renderRole(){

    const roleText =
      role === "SUPER_ADMIN"
        ? "Super Admin"
        : role === "DISPATCHER"
          ? "Dispatcher"
          : "Admin";

    if($("dashboardRole")){
      $("dashboardRole")
        .textContent =
          roleText;
    }

    if($("dashboardSubtitle")){

      $("dashboardSubtitle")
        .textContent =
          role === "SUPER_ADMIN"
            ? "Operations, services, company billing and payroll overview"
            : role === "DISPATCHER"
              ? "Live trip and dispatch operations"
              : "Operations and administration overview";
    }

    if(role === "SUPER_ADMIN"){

      $("superAdminFinance")
        ?.style
        .setProperty(
          "display",
          "block"
        );
    }

    let shortcuts =
      [...commonQuick];

    if(role !== "DISPATCHER"){
      shortcuts.push(
        ...adminQuick
      );
    }

    if(role === "SUPER_ADMIN"){
      shortcuts.push(
        ...superQuick
      );
    }

    const grid =
      $("quickAccessGrid");

    if(!grid){
      return;
    }

    grid.innerHTML =
      shortcuts
        .map(item=>`
          <a
            class="quick-card metal-card"
            href="${safe(item.href)}"
          >
            <div class="quick-title">
              ${safe(item.title)}
            </div>

            <div class="quick-sub">
              ${safe(item.sub)}
            </div>
          </a>
        `)
        .join("");
  }

  /* =========================
     RENDER SERVICES
  ========================= */

  function renderServices(){

    const grid =
      $("enabledServicesGrid");

    if(!grid){
      return;
    }

    if(!services.length){

      grid.innerHTML =
        '<div class="loading-box">No services found</div>';

      return;
    }

    /*
      Dashboard rule:
      - Platform Admin OFF => service is not expected from /api/services/admin.
      - Tenant: if ANY of Get Quote / Reserved / Companies is ON => show.
      - If ALL THREE are OFF => hide completely.
    */
    const visibleServices =
      services.filter(
        serviceEnabled
      );

    if(!visibleServices.length){

      grid.innerHTML =
        '<div class="loading-box">No enabled services</div>';

      return;
    }

    grid.innerHTML =
      visibleServices
        .map(service=>{

          const channels = [];

          if(getQuoteEnabled(service)){
            channels.push("Get Quote");
          }

          if(reservedEnabled(service)){
            channels.push("Reserved");
          }

          if(companiesEnabled(service)){
            channels.push("Companies");
          }

          return `
            <div class="service-pill">
              <div class="service-name">
                ${safe(serviceName(service))}
              </div>

              <div class="service-state">
                ${safe(channels.join(" • "))}
              </div>
            </div>
          `;
        })
        .join("");
  }

  /* =========================
     RENDER TRIP STATS
  ========================= */

  function renderTripStats(){

    const items =
      buildTripItems(trips);

    const hubActive =
      items.filter(
        itemIsHubActive
      );

    const newItems =
      hubActive.filter(
        itemIsNew
      );

    const today =
      items.filter(
        itemIsToday
      );

    const dispatched =
      today.filter(
        itemIsDispatched
      );

    const completed =
      items.filter(
        itemIsCompletedToday
      );

    const attention =
      items.filter(
        itemNeedsAttention
      );

    if($("hubTripsValue")){
      $("hubTripsValue")
        .textContent =
          hubActive.length;
    }

    if($("newTripsValue")){
      $("newTripsValue")
        .textContent =
          newItems.length;
    }

    if($("todayTripsValue")){
      $("todayTripsValue")
        .textContent =
          today.length;
    }

    if($("dispatchedValue")){
      $("dispatchedValue")
        .textContent =
          dispatched.length;
    }

    if($("completedValue")){
      $("completedValue")
        .textContent =
          completed.length;
    }

    if($("attentionValue")){
      $("attentionValue")
        .textContent =
          attention.length;
    }

    renderLatest(
      items
    );
  }

  function passengerLabel(item){

    if(item.kind === "shared"){

      const passengers =
        getRealPassengers(
          item.group
        );

      return (
        "Shared Group" +
        (
          passengers.length
            ? ` (${passengers.length})`
            : ""
        )
      );
    }

    return (
      item.trip?.clientName ||
      item.trip?.passengerName ||
      item.trip?.name ||
      item.trip?.company ||
      "--"
    );
  }

  function statusClass(status){

    if(isCompletedStatus(status)){
      return "completed";
    }

    if(isCancelledStatus(status)){
      return "cancelled";
    }

    if(isNoShowStatus(status)){
      return "noshow";
    }

    if(isOnTripStatus(status)){
      return "ontrip";
    }

    return "";
  }

  function renderLatest(items){

    const tbody =
      $("latestTripsBody");

    if(!tbody){
      return;
    }

    const latest =
      [...items]
        .sort(
          (a,b)=>
            getBookedDateObj(b.trip) -
            getBookedDateObj(a.trip)
        )
        .slice(0,8);

    if(!latest.length){

      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="loading-box">
              No trips found
            </div>
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML =
      latest
        .map(item=>{

          const trip =
            item.trip || {};

          const status =
            itemRepresentativeStatus(
              item
            );

          return `
            <tr>
              <td>
                ${safe(
                  trip.tripNumber ||
                  trip.bookingNumber ||
                  "--"
                )}
              </td>

              <td>
                ${safe(
                  tripServiceName(trip)
                )}
              </td>

              <td>
                ${safe(
                  passengerLabel(item)
                )}
              </td>

              <td>
                ${safe(
                  trip.tripDate ||
                  "--"
                )}
              </td>

              <td>
                ${safe(
                  trip.tripTime ||
                  "--"
                )}
              </td>

              <td>
                <span class="status-chip ${statusClass(status)}">
                  ${safe(status)}
                </span>
              </td>
            </tr>
          `;
        })
        .join("");
  }

  /* =========================
     SUPER ADMIN BILLING
  ========================= */

  function renderBilling(){

    if(role !== "SUPER_ADMIN"){
      return;
    }

    const totalInvoices =
      companies.reduce(
        (sum,c)=>
          sum +
          Number(c?.invoiceAmount || 0),
        0
      );

    const totalRevenue =
      companies.reduce(
        (sum,c)=>
          sum +
          Number(c?.revenue || 0),
        0
      );

    const pastDue =
      companies.filter(c=>{

        const s =
          String(
            c?.billingStatus ||
            ""
          )
          .toUpperCase();

        return (
          s === "PAST_DUE" ||
          s === "SUSPENDED" ||
          c?.billingLocked === true
        );
      });

    const active =
      companies.filter(c=>
        c?.billingLocked !== true &&
        String(
          c?.billingStatus ||
          "ACTIVE"
        )
        .toUpperCase() ===
          "ACTIVE"
      );

    const locked =
      companies.filter(
        c=>
          c?.billingLocked === true ||
          String(
            c?.billingStatus || ""
          )
          .toUpperCase() ===
            "SUSPENDED"
      );

    const nextDates =
      companies
        .map(
          c=>
            c?.nextBillingDate
              ? new Date(c.nextBillingDate)
              : null
        )
        .filter(
          d=>
            d &&
            !isNaN(d.getTime())
        )
        .sort(
          (a,b)=>a-b
        );

    $("companiesValue")
      .textContent =
        companies.length;

    $("invoiceValue")
      .textContent =
        money(totalInvoices);

    $("revenueValue")
      .textContent =
        money(totalRevenue);

    $("pastDueValue")
      .textContent =
        pastDue.length;

    $("activeCompaniesValue")
      .textContent =
        active.length;

    $("lockedCompaniesValue")
      .textContent =
        locked.length;

    $("nextCompanyDue")
      .textContent =
        nextDates.length
          ? formatDate(
              nextDates[0]
            )
          : "--";

    /*
      DO NOT FAKE PLATFORM SUBSCRIPTION DATA.

      Current confirmed /api/admin/billing is company/facility billing
      inside the tenant. It is NOT proof of the tenant's bill to
      GH Mobility Platform Admin.

      These placeholders intentionally stay "not configured"
      until a platform-subscription endpoint is added.
    */
    $("platformBillingStatus")
      .textContent =
        "NOT CONFIGURED";

    $("platformPlan")
      .textContent =
        "--";

    $("platformNextPayment")
      .textContent =
        "--";

    $("platformAmount")
      .textContent =
        "--";
  }

  /* =========================
     LOADERS
  ========================= */

  async function loadTrips(){

    const data =
      await fetchJson(
        API_TRIPS
      );

    trips =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.trips)
          ? data.trips
          : [];

    renderTripStats();
  }

  async function loadServices(){

    const data =
      await fetchJson(
        API_SERVICES
      );

    services =
      extractServices(data);

    renderServices();
  }

  async function loadBilling(){

    if(role !== "SUPER_ADMIN"){
      return;
    }

    try{

      const data =
        await fetchJson(
          API_BILLING
        );

      companies =
        Array.isArray(data)
          ? data
          : [];

    }catch(err){

      console.log(
        "DASHBOARD BILLING ERROR:",
        err
      );

      companies = [];
    }

    renderBilling();
  }

  async function refresh(){

    const btn =
      $("refreshDashboardBtn");

    if(btn){
      btn.disabled = true;
      btn.textContent =
        "Refreshing...";
    }

    try{

      await Promise.all([
        loadTrips()
          .catch(err=>{
            console.log(
              "DASHBOARD TRIPS ERROR:",
              err
            );

            trips = [];
            renderTripStats();
          }),

        loadServices()
          .catch(err=>{
            console.log(
              "DASHBOARD SERVICES ERROR:",
              err
            );

            services = [];
            renderServices();
          }),

        loadBilling()
      ]);

    }finally{

      if(btn){
        btn.disabled = false;
        btn.textContent =
          "Refresh";
      }
    }
  }

  /* =========================
     CARD NAVIGATION
  ========================= */

  function bindCards(){

    document
      .querySelectorAll(
        "[data-href]"
      )
      .forEach(card=>{

        card.addEventListener(
          "click",
          ()=>{

            const href =
              card.dataset.href;

            if(href){
              location.href = href;
            }
          }
        );
      });

    $("refreshDashboardBtn")
      ?.addEventListener(
        "click",
        refresh
      );
  }

  /* =========================
     INIT
  ========================= */

  document.addEventListener(
    "DOMContentLoaded",
    ()=>{

      renderRole();
      bindCards();
      refresh();

      /*
        Keep dashboard current without hammering the server.
      */
      setInterval(
        refresh,
        60000
      );
    }
  );

})();