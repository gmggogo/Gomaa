"use strict";

/*
DESTINATION PATH:
server/public/admin/js/external-trips.js

EXTERNAL TRIPS HUB REBUILD R1
*/

(() => {

  const $ =
    id =>
      document.getElementById(
        id
      );

  const state = {
    
    newTripsBaselineAt:"",
    baselineInitialized:false,
trips:[],
    integrations:[],
    services:[],
    editingId:"",
    stopCount:1
  };

  const MAX_STOPS = 5;

  function token(){
    return (
      sessionStorage.getItem("token") ||
      localStorage.getItem("token") ||
      ""
    );
  }

  function headers(
    json = true
  ){
    const h = {
      Authorization:
        `Bearer ${token()}`
    };

    if(json){
      h["Content-Type"] =
        "application/json";
    }

    return h;
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function clean(value){
    return String(
      value ?? ""
    ).trim();
  }

  function normalizeServiceKey(
    value
  ){
    const raw =
      clean(value)
        .toUpperCase()
        .replace(/[_-]+/g," ")
        .replace(/\s+/g," ");

    if(!raw){
      return "STANDARD";
    }

    if(
      raw === "ST" ||
      raw === "STD" ||
      raw.includes("STANDARD")
    ){
      return "STANDARD";
    }

    if(
      raw === "SH" ||
      raw.includes("SHARED")
    ){
      return "SHARED";
    }

    return raw.replace(
      /\s+/g,
      "_"
    );
  }

  function displayService(
    value
  ){
    return normalizeServiceKey(
      value
    )
      .toLowerCase()
      .split("_")
      .map(
        part =>
          part
            ? (
                part[0]
                  .toUpperCase() +
                part.slice(1)
              )
            : ""
      )
      .join(" ");
  }


  function neutralTripNumber(value){
    const raw = clean(value).toUpperCase();

    if(!raw){
      return "";
    }

    /*
      Compatibility with test/history rows created before neutral numbering:
      MTM-000123-ST   -> MTM-000123
      MTM-000123-SH   -> MTM-000123
      MTM-000123-ST-R -> MTM-000123-R
    */
    return raw.replace(
      /-(ST|SH|WH|WC|TX|LM|XL)(-R)?$/,
      (_match,_suffix,returnPart)=>
        returnPart || ""
    );
  }

  function normalizeStopAddress(
    stop
  ){
    if(
      stop === undefined ||
      stop === null
    ){
      return "";
    }

    if(
      typeof stop ===
      "string"
    ){
      return stop.trim();
    }

    if(
      typeof stop ===
      "object"
    ){
      return clean(
        stop.address ||
        stop.formattedAddress ||
        stop.formatted_address ||
        stop.description ||
        stop.label
      );
    }

    return clean(stop);
  }

  function stopBoxes(stops){
    const items =
      Array.isArray(stops)
        ? stops
            .map(
              normalizeStopAddress
            )
            .filter(Boolean)
            .slice(0,MAX_STOPS)
        : [];

    /*
      Always show one stop box, even when the trip has no stop.
    */
    if(!items.length){
      return `
        <div class="gh-stop-box"></div>
      `;
    }

    return items
      .map(
        address => `
          <div class="gh-stop-box">
            ${escapeHtml(address)}
          </div>
        `
      )
      .join("");
  }

  function addressBox(value){
    return `
      <div class="address-box">
        ${escapeHtml(value || "-")}
      </div>
    `;
  }

  function selectedFilters(){
    return {
      brokerCode:
        $("brokerFilter").value,
      status:
        $("statusFilter").value,
      tripDate:
        $("dateFilter").value
    };
  }

  function queryString(){
    const filters =
      selectedFilters();

    const params =
      new URLSearchParams();

    for(
      const [key,value]
      of Object.entries(filters)
    ){
      if(value){
        params.set(
          key,
          value
        );
      }
    }

    const raw =
      params.toString();

    return raw
      ? `?${raw}`
      : "";
  }

  function clearTripFilters(){
    $("brokerFilter").value =
      "";
    $("statusFilter").value =
      "";
    $("dateFilter").value =
      "";
  }

  function upsertTripInState(
    trip
  ){
    if(
      !trip ||
      !trip._id
    ){
      return;
    }

    const index =
      state.trips.findIndex(
        item =>
          String(item._id) ===
          String(trip._id)
      );

    if(index >= 0){
      state.trips[index] =
        trip;
    }else{
      state.trips.push(
        trip
      );
    }

    state.trips.sort(
      (a,b)=>{
        const aKey =
          `${a.tripDate || ""} ${a.tripTime || ""} ${a.createdAt || ""}`;

        const bKey =
          `${b.tripDate || ""} ${b.tripTime || ""} ${b.createdAt || ""}`;

        return aKey.localeCompare(
          bKey
        );
      }
    );
  }

  async function loadBrokers(){
    const res =
      await fetch(
        "/api/external-trips/brokers",
        {
          headers:
            headers(false)
        }
      );

    const data =
      await res.json();

    if(!res.ok){
      throw new Error(
        data.message ||
        "Failed to load enabled brokers"
      );
    }

    state.integrations =
      data.brokers ||
      [];

    renderBrokerSelectors();
    renderStats();
  }

  async function loadServices(){
    const res =
      await fetch(
        "/api/external-trips/services",
        {
          headers:
            headers(false)
        }
      );

    const data =
      await res.json();

    if(!res.ok){
      throw new Error(
        data.message ||
        "Failed to load tenant services"
      );
    }

    state.services =
      Array.isArray(
        data.services
      )
        ? data.services
        : [];

    if(
      !state.services.some(
        item =>
          normalizeServiceKey(
            item.key
          ) === "STANDARD"
      )
    ){
      state.services.unshift({
        key:"STANDARD",
        name:"Standard"
      });
    }

    renderDialogServiceOptions();
  }

  async function loadTrips(){
    const res =
      await fetch(
        `/api/external-trips${queryString()}`,
        {
          headers:
            headers(false)
        }
      );

    const data =
      await res.json();

    if(!res.ok){
      throw new Error(
        data.message ||
        "Failed to load external trips"
      );
    }

    state.trips =
      data.trips ||
      [];
      initializeNewTripsBaseline();

    render();
  }

  function renderBrokerSelectors(){
    const currentFilter =
      $("brokerFilter").value;

    const currentDialog =
      $("brokerCode").value;

    $("brokerFilter").innerHTML =
      `<option value="">All Brokers</option>`;

    $("brokerCode").innerHTML =
      "";

    for(
      const item
      of state.integrations
    ){
      const label =
        `${item.brokerName} (${item.brokerCode})`;

      const filterOption =
        document.createElement(
          "option"
        );

      filterOption.value =
        item.brokerCode;

      filterOption.textContent =
        label;

      $("brokerFilter")
        .appendChild(
          filterOption
        );

      const dialogOption =
        document.createElement(
          "option"
        );

      dialogOption.value =
        item.brokerCode;

      dialogOption.textContent =
        label;

      $("brokerCode")
        .appendChild(
          dialogOption
        );
    }

    if(currentFilter){
      $("brokerFilter").value =
        currentFilter;
    }

    if(currentDialog){
      $("brokerCode").value =
        currentDialog;
    }
  }

  function serviceOptionsHtml(
    selectedValue
  ){
    const selected =
      normalizeServiceKey(
        selectedValue ||
        "STANDARD"
      );

    const seen =
      new Set();

    const options = [];

    for(
      const item
      of state.services
    ){
      const key =
        normalizeServiceKey(
          item.key
        );

      if(
        !key ||
        seen.has(key)
      ){
        continue;
      }

      seen.add(key);

      options.push(`
        <option
          value="${escapeHtml(key)}"
          ${key === selected ? "selected" : ""}
        >
          ${escapeHtml(item.name || displayService(key))}
        </option>
      `);
    }

    /*
      If a broker supplied a service name that is not yet in the tenant list,
      keep it visible for that trip instead of silently losing broker data.
    */
    if(
      selected &&
      !seen.has(selected)
    ){
      options.push(`
        <option
          value="${escapeHtml(selected)}"
          selected
        >
          ${escapeHtml(displayService(selected))}
        </option>
      `);
    }

    return options.join("");
  }

  function renderDialogServiceOptions(){
    const select =
      $("serviceKey");

    if(!select){
      return;
    }

    const current =
      normalizeServiceKey(
        select.value ||
        "STANDARD"
      );

    select.innerHTML =
      serviceOptionsHtml(
        current
      );

    select.value =
      current;
  }



  function receivedAtMs(trip){
    const raw =
      trip?.receivedAt ||
      trip?.createdAt ||
      trip?.lastBrokerUpdateAt ||
      "";

    if(!raw){
      return 0;
    }

    const ms =
      new Date(raw).getTime();

    return Number.isFinite(ms)
      ? ms
      : 0;
  }

  function initializeNewTripsBaseline(){
    if(state.baselineInitialized){
      return;
    }

    const trips =
      Array.isArray(state.trips)
        ? state.trips
        : [];

    let latest = 0;

    trips.forEach(trip=>{
      latest = Math.max(
        latest,
        receivedAtMs(trip)
      );
    });

    state.newTripsBaselineAt =
      latest
        ? new Date(latest).toISOString()
        : new Date().toISOString();

    state.baselineInitialized = true;
  }

  function newTripsCount(){
    if(!state.baselineInitialized){
      return 0;
    }

    const baseline =
      new Date(
        state.newTripsBaselineAt
      ).getTime();

    if(!Number.isFinite(baseline)){
      return 0;
    }

    return (
      Array.isArray(state.trips)
        ? state.trips
        : []
    )
      .filter(
        trip =>
          receivedAtMs(trip) >
          baseline
      )
      .length;
  }

  function renderStats(){
    const trips =
      Array.isArray(state.trips)
        ? state.trips
        : [];

    const totalTrips =
      trips.length;

    const newTrips =
      newTripsCount();

    /*
      Active Brokers means enabled broker integrations for this tenant.
      This is intentionally independent from the current trip/date/status
      filter so the card shows how many broker connections are active.
    */
    const activeBrokers =
      new Set(
        (Array.isArray(state.integrations)
          ? state.integrations
          : []
        )
          .map(
            item =>
              clean(
                item?.brokerCode
              )
          )
          .filter(Boolean)
      ).size;

    const returnTrips =
      trips.filter(
        trip =>
          Boolean(
            clean(
              trip?.returnTime
            )
          )
      ).length;

    const withStops =
      trips.filter(
        trip =>
          Array.isArray(
            trip?.stops
          ) &&
          trip.stops.some(
            stop =>
              Boolean(
                normalizeStopAddress(
                  stop
                )
              )
          )
      ).length;

    if($("statTotalTrips")){
      $("statTotalTrips").textContent =
        totalTrips;
    }

    if($("statNewTrips")){
      $("statNewTrips").textContent =
        newTrips;
    }

    if($("statActiveBrokers")){
      $("statActiveBrokers").textContent =
        activeBrokers;
    }

    if($("statReturnTrips")){
      $("statReturnTrips").textContent =
        returnTrips;
    }

    if($("statWithStops")){
      $("statWithStops").textContent =
        withStops;
    }
  }

  function groupedTrips(){
    const groups =
      new Map();

    for(
      const trip
      of state.trips
    ){
      const date =
        clean(
          trip.tripDate
        ) ||
        "No Date";

      if(!groups.has(date)){
        groups.set(
          date,
          []
        );
      }

      groups
        .get(date)
        .push(trip);
    }

    return groups;
  }

  function render(){
    renderStats();
    const body =
      $("tripRows");

    body.innerHTML =
      "";

    if(!state.trips.length){
      body.innerHTML = `
        <tr>
          <td
            colspan="16"
            style="padding:18px;font-weight:800;color:#64748b;"
          >
            No external trips found.
          </td>
        </tr>
      `;

      return;
    }

    const groups =
      groupedTrips();

    for(
      const [date,trips]
      of groups.entries()
    ){
      const dateRow =
        document.createElement(
          "tr"
        );

      dateRow.className =
        "date-group-row";

      dateRow.innerHTML = `
        <td colspan="16">
          Trip Date: ${escapeHtml(date)}
        </td>
      `;

      body.appendChild(
        dateRow
      );

      for(
        const trip
        of trips
      ){
        const tr =
          document.createElement(
            "tr"
          );

        tr.innerHTML = `
          <td class="trip-id">
            ${escapeHtml(neutralTripNumber(trip.ghExternalTripNumber || ""))}
          </td>

          <td>
            ${escapeHtml(trip.brokerName || trip.brokerCode || "")}
          </td>

          <td>
            ${escapeHtml(trip.externalTripId || "-")}
          </td>

          <td>
            ${escapeHtml(trip.tripTime || "")}
          </td>

          <td>
            ${escapeHtml(trip.appointmentTime || "-")}
          </td>

          <td>
            ${escapeHtml(trip.returnTime || "-")}
          </td>

          <td>
            ${escapeHtml(trip.clientName || "")}
          </td>

          <td>
            ${escapeHtml(trip.clientPhone || "")}
          </td>

          <td>
            ${addressBox(trip.pickup)}
          </td>

          <td>
            ${stopBoxes(trip.stops)}
          </td>

          <td>
            ${addressBox(trip.dropoff)}
          </td>

          <td>
            <select
              class="service-cell-select"
              data-service="${escapeHtml(trip._id)}"
            >
              ${serviceOptionsHtml(trip.serviceKey || trip.serviceName || "STANDARD")}
            </select>
          </td>

          <td class="notes">
            ${escapeHtml(trip.notes || "")}
          </td>

          <td>
            <span
              class="status ${escapeHtml(trip.status || "")}"
            >
              ${escapeHtml(trip.status || "")}
            </span>
          </td>

          <td>
            ${escapeHtml(trip.source || "")}
          </td>

          <td>
            <div class="action-stack">
              <button
                class="btn btn-light"
                data-edit="${escapeHtml(trip._id)}"
              >
                Edit
              </button>

              <button
                class="btn btn-danger"
                data-delete="${escapeHtml(trip._id)}"
              >
                Delete
              </button>
            </div>
          </td>
        `;

        body.appendChild(
          tr
        );
      }
    }

    body
      .querySelectorAll(
        "[data-edit]"
      )
      .forEach(
        btn => {
          btn.addEventListener(
            "click",
            () => {
              editTrip(
                btn.dataset.edit
              );
            }
          );
        }
      );

    body
      .querySelectorAll(
        "[data-delete]"
      )
      .forEach(
        btn => {
          btn.addEventListener(
            "click",
            () => {
              deleteTrip(
                btn.dataset.delete
              );
            }
          );
        }
      );

    body
      .querySelectorAll(
        "[data-service]"
      )
      .forEach(
        select => {
          select.addEventListener(
            "change",
            () => {
              updateTripService(
                select.dataset.service,
                select.value
              ).catch(
                err => {
                  alert(
                    err.message ||
                    "Failed to update service"
                  );
                  loadTrips()
                    .catch(console.error);
                }
              );
            }
          );
        }
      );
  }

  function renderStopInputs(
    values = [""]
  ){
    const list =
      $("stopInputs");

    if(!list){
      return;
    }

    const cleaned =
      Array.isArray(values)
        ? values
            .map(
              normalizeStopAddress
            )
            .slice(0,MAX_STOPS)
        : [];

    const actual =
      cleaned.length
        ? cleaned
        : [""];

    state.stopCount =
      actual.length;

    list.innerHTML =
      actual
        .map(
          (value,index) => `
            <div class="stop-input-row">
              <input
                class="stop-input"
                data-stop-index="${index}"
                value="${escapeHtml(value)}"
                placeholder="Stop ${index + 1} address"
              />

              ${
                index === 0
                  ? `
                    <button
                      type="button"
                      class="btn btn-light add-stop-btn"
                      id="addStopBtn"
                    >
                      + Stop
                    </button>
                  `
                  : `
                    <button
                      type="button"
                      class="btn btn-danger remove-stop-btn"
                      data-remove-stop="${index}"
                    >
                      Remove
                    </button>
                  `
              }
            </div>
          `
        )
        .join("");

    $("addStopBtn")
      ?.addEventListener(
        "click",
        () => {
          if(
            state.stopCount >=
            MAX_STOPS
          ){
            alert(
              "Maximum 5 stops."
            );
            return;
          }

          const current =
            collectStopValues(
              true
            );

          current.push("");

          renderStopInputs(
            current
          );
        }
      );

    list
      .querySelectorAll(
        "[data-remove-stop]"
      )
      .forEach(
        btn => {
          btn.addEventListener(
            "click",
            () => {
              const index =
                Number(
                  btn.dataset
                    .removeStop
                );

              const current =
                collectStopValues(
                  true
                );

              current.splice(
                index,
                1
              );

              renderStopInputs(
                current.length
                  ? current
                  : [""]
              );
            }
          );
        }
      );
  }

  function collectStopValues(
    preserveEmpty = false
  ){
    const values =
      [...document
        .querySelectorAll(
          ".stop-input"
        )]
        .map(
          input =>
            clean(
              input.value
            )
        );

    return preserveEmpty
      ? values
      : values.filter(Boolean);
  }

  function clearDialog(){
    state.editingId =
      "";

    [
      "externalTripId",
      "tripDate",
      "tripTime",
      "appointmentTime",
      "returnTime",
      "clientName",
      "clientPhone",
      "memberId",
      "pickup",
      "dropoff",
      "notes"
    ].forEach(
      id => {
        $(id).value =
          "";
      }
    );

    $("tripType").value =
      "SINGLE";

    renderDialogServiceOptions();

    if($("serviceKey")){
      $("serviceKey").value =
        "STANDARD";
    }

    renderStopInputs(
      [""]
    );

    $("dialogTitle").textContent =
      "Add External Trip";
  }

  function openAdd(){
    clearDialog();

    if(
      !state.integrations.length
    ){
      alert(
        "No broker connection is available for this tenant."
      );

      return;
    }

    $("tripDialog")
      .showModal();
  }

  function editTrip(id){
    const trip =
      state.trips.find(
        x =>
          String(x._id) ===
          String(id)
      );

    if(!trip){
      return;
    }

    state.editingId =
      trip._id;

    $("dialogTitle").textContent =
      "Edit External Trip";

    $("brokerCode").value =
      trip.brokerCode ||
      "";

    $("externalTripId").value =
      trip.externalTripId ||
      "";

    $("tripType").value =
      trip.tripType ||
      "SINGLE";

    $("tripDate").value =
      trip.tripDate ||
      "";

    $("tripTime").value =
      trip.tripTime ||
      "";

    $("appointmentTime").value =
      trip.appointmentTime ||
      "";

    $("returnTime").value =
      trip.returnTime ||
      "";

    $("clientName").value =
      trip.clientName ||
      "";

    $("clientPhone").value =
      trip.clientPhone ||
      "";

    $("memberId").value =
      trip.memberId ||
      "";

    renderDialogServiceOptions();

    $("serviceKey").value =
      normalizeServiceKey(
        trip.serviceKey ||
        trip.serviceName ||
        "STANDARD"
      );

    $("pickup").value =
      trip.pickup ||
      "";

    renderStopInputs(
      Array.isArray(
        trip.stops
      ) &&
      trip.stops.length
        ? trip.stops
        : [""]
    );

    $("dropoff").value =
      trip.dropoff ||
      "";

    $("notes").value =
      trip.notes ||
      "";

    $("tripDialog")
      .showModal();
  }

  function brokerNameForCode(
    code
  ){
    const item =
      state.integrations.find(
        x =>
          x.brokerCode ===
          code
      );

    return (
      item?.brokerName ||
      code
    );
  }

  function formPayload(){
    const brokerCode =
      $("brokerCode").value;

    const stops =
      collectStopValues()
        .slice(
          0,
          MAX_STOPS
        )
        .map(
          (address,index) => ({
            address,
            sequence:
              index + 1
          })
        );

    return {
      brokerCode,

      brokerName:
        brokerNameForCode(
          brokerCode
        ),

      externalTripId:
        $("externalTripId")
          .value
          .trim(),

      tripType:
        $("tripType").value,

      tripDate:
        $("tripDate").value,

      tripTime:
        $("tripTime").value,

      appointmentTime:
        $("appointmentTime").value,

      returnTime:
        $("returnTime").value,

      clientName:
        $("clientName")
          .value
          .trim(),

      clientPhone:
        $("clientPhone")
          .value
          .trim(),

      memberId:
        $("memberId")
          .value
          .trim(),

      serviceKey:
        normalizeServiceKey(
          $("serviceKey").value ||
          "STANDARD"
        ),

      serviceName:
        displayService(
          $("serviceKey").value ||
          "STANDARD"
        ),

      pickup:
        $("pickup")
          .value
          .trim(),

      stops,

      dropoff:
        $("dropoff")
          .value
          .trim(),

      notes:
        $("notes")
          .value
          .trim()
    };
  }

  async function saveTrip(){
    try{
      const body =
        formPayload();

      const editing =
        Boolean(
          state.editingId
        );

      const url =
        editing
          ? `/api/external-trips/${encodeURIComponent(state.editingId)}`
          : "/api/external-trips/manual";

      const method =
        editing
          ? "PATCH"
          : "POST";

      const res =
        await fetch(
          url,
          {
            method,
            headers:
              headers(true),
            body:
              JSON.stringify(
                body
              )
          }
        );

      const data =
        await res.json();

      if(!res.ok){
        throw new Error(
          data.message ||
          "Failed to save external trip"
        );
      }

      $("tripDialog")
        .close();

      if(!editing){
        clearTripFilters();
      }

      if(data.trip){
        upsertTripInState(
          data.trip
        );

        render();
      }

      await loadTrips();

    }catch(err){
      alert(
        err.message ||
        "Failed to save external trip"
      );
    }
  }

  async function updateTripService(
    id,
    serviceKey
  ){
    const normalized =
      normalizeServiceKey(
        serviceKey ||
        "STANDARD"
      );

    const res =
      await fetch(
        `/api/external-trips/${encodeURIComponent(id)}`,
        {
          method:"PATCH",
          headers:
            headers(true),
          body:
            JSON.stringify({
              serviceKey:
                normalized,
              serviceName:
                displayService(
                  normalized
                )
            })
        }
      );

    const data =
      await res.json();

    if(!res.ok){
      throw new Error(
        data.message ||
        "Failed to update service"
      );
    }

    if(data.trip){
      upsertTripInState(
        data.trip
      );
    }
  }

  async function deleteTrip(id){
    if(
      !confirm(
        "Delete this external trip?"
      )
    ){
      return;
    }

    const res =
      await fetch(
        `/api/external-trips/${encodeURIComponent(id)}`,
        {
          method:"DELETE",
          headers:
            headers(false)
        }
      );

    const data =
      await res.json();

    if(!res.ok){
      alert(
        data.message ||
        "Failed to delete external trip"
      );

      return;
    }

    await loadTrips();
  }

  $("addTripBtn")
    .addEventListener(
      "click",
      openAdd
    );

  $("closeDialogBtn")
    .addEventListener(
      "click",
      () =>
        $("tripDialog")
          .close()
    );

  $("cancelDialogBtn")
    .addEventListener(
      "click",
      () =>
        $("tripDialog")
          .close()
    );

  $("saveTripBtn")
    .addEventListener(
      "click",
      saveTrip
    );

  $("refreshBtn")
    .addEventListener(
      "click",
      () => {
        loadTrips()
          .catch(
            console.error
          );
      }
    );

  [
    "brokerFilter",
    "statusFilter",
    "dateFilter"
  ].forEach(
    id => {
      $(id)
        .addEventListener(
          "change",
          () => {
            loadTrips()
              .catch(
                console.error
              );
          }
        );
    }
  );

  Promise.all([
    loadBrokers(),
    loadServices(),
    loadTrips()
  ])
  .then(
    () => {
      renderStopInputs(
        [""]
      );
    }
  )
  .catch(
    err => {
      console.error(err);

      alert(
        err.message ||
        "Failed to load External Trips Hub"
      );
    }
  );

})();
