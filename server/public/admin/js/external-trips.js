"use strict";

/*
DESTINATION PATH:
server/public/admin/js/external-trips.js

EXTERNAL TRIPS HUB R5
- Matches the current rebuilt external-trips.html.
- Loads broker trips from /api/external-trips.
- Loads enabled brokers and tenant services.
- Add Trip works with dynamic Stops UI.
- Edit / Delete work.
- Statistics cards are populated.
- No transfer to normal Trips Hub: broker flow stays isolated.
*/

(() => {

  const $ = id =>
    document.getElementById(id);

  const state = {
    trips:[],
    integrations:[],
    services:[],
    editingId:"",
    stopValues:[]
  };

  const NEW_BASELINE_KEY =
    "ghExternalTripsNewBaseline";

  function token(){
    return (
      sessionStorage.getItem("token") ||
      localStorage.getItem("token") ||
      sessionStorage.getItem("staffToken") ||
      ""
    );
  }

  function headers(json=true){
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

  function clean(value){
    return String(value ?? "").trim();
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function normalizeStopAddress(stop){
    if(stop === undefined || stop === null){
      return "";
    }

    if(typeof stop === "string"){
      return stop.trim();
    }

    if(typeof stop === "object"){
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

  function addressBox(value){
    return `
      <div class="address-box">
        ${escapeHtml(value || "-")}
      </div>
    `;
  }

  function stopBoxes(stops){
    const items =
      Array.isArray(stops)
        ? stops
            .map(normalizeStopAddress)
            .filter(Boolean)
        : [];

    if(!items.length){
      return `<div class="gh-stop-box">-</div>`;
    }

    return items
      .map(
        value=>`
          <div class="gh-stop-box">
            ${escapeHtml(value)}
          </div>
        `
      )
      .join("");
  }

  function selectedFilters(){
    return {
      brokerCode:
        clean($("brokerFilter")?.value),
      status:
        clean($("statusFilter")?.value),
      tripDate:
        clean($("dateFilter")?.value)
    };
  }

  function queryString(){
    const params =
      new URLSearchParams();

    for(
      const [key,value]
      of Object.entries(
        selectedFilters()
      )
    ){
      if(value){
        params.set(key,value);
      }
    }

    const raw =
      params.toString();

    return raw
      ? `?${raw}`
      : "";
  }

  async function requestJSON(
    url,
    options={}
  ){
    const response =
      await fetch(
        url,
        {
          cache:"no-store",
          ...options
        }
      );

    const data =
      await response
        .json()
        .catch(()=>({}));

    if(!response.ok){
      throw new Error(
        data.message ||
        `Request failed (${response.status})`
      );
    }

    return data;
  }

  async function loadBrokers(){
    const data =
      await requestJSON(
        "/api/external-trips/brokers",
        {
          headers:headers(false)
        }
      );

    state.integrations =
      Array.isArray(data.brokers)
        ? data.brokers
        : [];

    renderBrokerSelectors();
  }

  async function loadServices(){
    const data =
      await requestJSON(
        "/api/external-trips/services",
        {
          headers:headers(false)
        }
      );

    state.services =
      Array.isArray(data.services)
        ? data.services
        : [];

    renderServiceSelector();
  }

  async function loadTrips(){
    const data =
      await requestJSON(
        `/api/external-trips${queryString()}`,
        {
          headers:headers(false)
        }
      );

    state.trips =
      Array.isArray(data.trips)
        ? data.trips
        : [];

    ensureNewBaseline();
    render();
  }

  function renderBrokerSelectors(){
    const filter =
      $("brokerFilter");

    const dialog =
      $("brokerCode");

    if(!filter || !dialog){
      return;
    }

    const currentFilter =
      filter.value;

    const currentDialog =
      dialog.value;

    filter.innerHTML =
      `<option value="">All Brokers</option>`;

    dialog.innerHTML = "";

    for(const item of state.integrations){
      const code =
        clean(item.brokerCode);

      const label =
        `${clean(item.brokerName) || code} (${code})`;

      const filterOption =
        document.createElement("option");

      filterOption.value = code;
      filterOption.textContent = label;
      filter.appendChild(filterOption);

      const dialogOption =
        document.createElement("option");

      dialogOption.value = code;
      dialogOption.textContent = label;
      dialog.appendChild(dialogOption);
    }

    if(
      currentFilter &&
      [...filter.options]
        .some(
          option=>
            option.value === currentFilter
        )
    ){
      filter.value =
        currentFilter;
    }

    if(
      currentDialog &&
      [...dialog.options]
        .some(
          option=>
            option.value === currentDialog
        )
    ){
      dialog.value =
        currentDialog;
    }
  }

  function renderServiceSelector(){
    const select =
      $("serviceKey");

    if(!select){
      return;
    }

    const current =
      select.value;

    select.innerHTML = "";

    for(const service of state.services){
      const option =
        document.createElement("option");

      option.value =
        clean(service.key);

      option.textContent =
        clean(service.name) ||
        clean(service.key);

      select.appendChild(option);
    }

    if(
      current &&
      [...select.options]
        .some(
          option=>
            option.value === current
        )
    ){
      select.value =
        current;
    }
  }

  function ensureNewBaseline(){
    if(
      sessionStorage.getItem(
        NEW_BASELINE_KEY
      )
    ){
      return;
    }

    sessionStorage.setItem(
      NEW_BASELINE_KEY,
      new Date().toISOString()
    );
  }

  function isReturnTrip(trip){
    const number =
      clean(
        trip.ghExternalTripNumber ||
        trip.externalTripNumber
      ).toUpperCase();

    const brokerTripId =
      clean(
        trip.externalTripId
      ).toUpperCase();

    const brokerStatus =
      clean(
        trip.brokerStatus
      ).toUpperCase();

    const notes =
      clean(
        trip.notes
      ).toUpperCase();

    return (
      number.endsWith("-R") ||
      brokerTripId.endsWith("-R") ||
      brokerStatus === "RETURN" ||
      notes === "RETURN TRIP"
    );
  }

  function isNewTrip(trip){
    const baseline =
      sessionStorage.getItem(
        NEW_BASELINE_KEY
      );

    if(!baseline){
      return false;
    }

    const received =
      trip.receivedAt ||
      trip.createdAt ||
      "";

    if(!received){
      return false;
    }

    const receivedTime =
      new Date(received).getTime();

    const baselineTime =
      new Date(baseline).getTime();

    return (
      Number.isFinite(receivedTime) &&
      Number.isFinite(baselineTime) &&
      receivedTime > baselineTime
    );
  }

  function setStat(id,value){
    const el = $(id);
    if(el){
      el.textContent =
        String(value);
    }
  }

  function renderStats(){
    const trips =
      state.trips;

    const brokers =
      new Set(
        trips
          .map(
            trip=>
              clean(
                trip.brokerCode ||
                trip.brokerName
              )
          )
          .filter(Boolean)
      );

    const returnTrips =
      trips.filter(
        isReturnTrip
      ).length;

    const withStops =
      trips.filter(
        trip=>
          Array.isArray(trip.stops) &&
          trip.stops
            .map(normalizeStopAddress)
            .filter(Boolean)
            .length > 0
      ).length;

    const newTrips =
      trips.filter(
        isNewTrip
      ).length;

    setStat(
      "statTotalTrips",
      trips.length
    );

    setStat(
      "statNewTrips",
      newTrips
    );

    setStat(
      "statActiveBrokers",
      brokers.size
    );

    setStat(
      "statReturnTrips",
      returnTrips
    );

    setStat(
      "statWithStops",
      withStops
    );
  }

  function groupTripsByDate(){
    const groups =
      new Map();

    for(const trip of state.trips){
      const date =
        clean(trip.tripDate) ||
        "No Date";

      if(!groups.has(date)){
        groups.set(date,[]);
      }

      groups
        .get(date)
        .push(trip);
    }

    return groups;
  }

  function serviceDisplayName(trip){
    return (
      clean(trip.serviceName) ||
      clean(trip.serviceKey) ||
      "-"
    );
  }

  function phoenixPickupMillis(trip){

    const date =
      clean(trip?.tripDate);

    const time =
      clean(trip?.tripTime);

    if(
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^\d{2}:\d{2}(:\d{2})?$/.test(time)
    ){
      return null;
    }

    const normalizedTime =
      time.length === 5
        ? `${time}:00`
        : time;

    const value =
      new Date(
        `${date}T${normalizedTime}-07:00`
      ).getTime();

    return Number.isFinite(value)
      ? value
      : null;
  }

  function isOverdueWaiting(trip){

    const pickupMs =
      phoenixPickupMillis(trip);

    if(pickupMs === null){
      return false;
    }

    const now =
      Date.now();

    const graceMs =
      2 * 60 * 60 * 1000;

    return (
      now > pickupMs &&
      now < pickupMs + graceMs
    );
  }

  function render(){
    renderStats();

    const body =
      $("tripRows");

    if(!body){
      return;
    }

    body.innerHTML = "";

    if(!state.trips.length){
      const row =
        document.createElement("tr");

      row.innerHTML = `
        <td colspan="16"
            style="padding:24px;text-align:center;font-weight:800;color:#64748b;">
          No external trips found.
        </td>
      `;

      body.appendChild(row);
      return;
    }

    const groups =
      groupTripsByDate();

    for(
      const [date,trips]
      of groups
    ){
      const dateRow =
        document.createElement("tr");

      dateRow.className =
        "date-group-row";

      dateRow.innerHTML = `
        <td colspan="16">
          Trip Date: ${escapeHtml(date)}
        </td>
      `;

      body.appendChild(dateRow);

      for(const trip of trips){
        const tr =
          document.createElement("tr");

        if(isOverdueWaiting(trip)){
          tr.classList.add(
            "trip-row-overdue"
          );
        }

        tr.innerHTML = `
          <td class="trip-id">
            ${escapeHtml(
              trip.ghExternalTripNumber ||
              trip.externalTripNumber ||
              ""
            )}
          </td>

          <td>
            ${escapeHtml(
              trip.brokerName ||
              trip.brokerCode ||
              "-"
            )}
          </td>

          <td>
            ${escapeHtml(
              trip.externalTripId ||
              "-"
            )}
          </td>

          <td>
            ${escapeHtml(
              trip.tripTime ||
              "-"
            )}
          </td>

          <td>
            ${escapeHtml(
              trip.appointmentTime ||
              "-"
            )}
          </td>

          <td>
            ${escapeHtml(
              trip.returnTime ||
              "-"
            )}
          </td>

          <td>
            ${escapeHtml(
              trip.clientName ||
              "-"
            )}
          </td>

          <td>
            ${escapeHtml(
              trip.clientPhone ||
              "-"
            )}
          </td>

          <td>
            ${addressBox(
              trip.pickup
            )}
          </td>

          <td>
            ${stopBoxes(
              trip.stops
            )}
          </td>

          <td>
            ${addressBox(
              trip.dropoff
            )}
          </td>

          <td>
            ${escapeHtml(
              serviceDisplayName(trip)
            )}
          </td>

          <td class="notes">
            ${escapeHtml(
              trip.notes ||
              ""
            )}
          </td>

          <td>
            <span class="status ${escapeHtml(
              clean(trip.status)
                .toUpperCase()
            )}">
              ${escapeHtml(
                trip.status ||
                "-"
              )}
            </span>
          </td>

          <td>
            ${escapeHtml(
              trip.source ||
              trip.connectionType ||
              "-"
            )}
          </td>

          <td>
            <div class="action-stack">
              <button
                class="btn btn-light"
                type="button"
                data-edit="${escapeHtml(trip._id)}"
              >
                Edit
              </button>

              <button
                class="btn btn-danger"
                type="button"
                data-delete="${escapeHtml(trip._id)}"
              >
                Delete
              </button>
            </div>
          </td>
        `;

        body.appendChild(tr);
      }
    }

    body
      .querySelectorAll(
        "[data-edit]"
      )
      .forEach(
        button=>{
          button.addEventListener(
            "click",
            ()=>{
              editTrip(
                button.dataset.edit
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
        button=>{
          button.addEventListener(
            "click",
            ()=>{
              deleteTrip(
                button.dataset.delete
              );
            }
          );
        }
      );
  }

  function currentStopsFromUI(){
    const values = [];

    document
      .querySelectorAll(
        "#stopInputs .stop-address-input"
      )
      .forEach(
        input=>{
          const value =
            clean(input.value);

          if(value){
            values.push(value);
          }
        }
      );

    return values.slice(0,5);
  }

  function renderStopInputs(
    values=[]
  ){
    const wrap =
      $("stopInputs");

    if(!wrap){
      return;
    }

    const cleanValues =
      values
        .map(normalizeStopAddress)
        .filter(Boolean)
        .slice(0,5);

    state.stopValues =
      cleanValues.length
        ? cleanValues
        : [""];

    wrap.innerHTML = "";

    state.stopValues
      .forEach(
        (value,index)=>{

          const row =
            document.createElement("div");

          row.className =
            "stop-input-row";

          row.innerHTML = `
            <input
              class="stop-address-input"
              type="text"
              placeholder="Stop ${index + 1}"
              value="${escapeHtml(value)}"
            />

            <button
              class="btn btn-light stop-row-action"
              type="button"
              data-stop-index="${index}"
            >
              ${
                index ===
                state.stopValues.length - 1 &&
                state.stopValues.length < 5
                  ? "Add Stop"
                  : "Remove"
              }
            </button>
          `;

          wrap.appendChild(row);
        }
      );

    wrap
      .querySelectorAll(
        ".stop-row-action"
      )
      .forEach(
        button=>{

          button.addEventListener(
            "click",
            ()=>{

              const index =
                Number(
                  button.dataset.stopIndex
                );

              const current =
                currentStopsFromUI();

              const isLast =
                index ===
                state.stopValues.length - 1;

              const canAdd =
                isLast &&
                state.stopValues.length < 5;

              if(canAdd){
                state.stopValues = [
                  ...current,
                  ""
                ];
              }else{
                const raw =
                  [...document.querySelectorAll(
                    "#stopInputs .stop-address-input"
                  )]
                    .map(
                      input=>
                        clean(input.value)
                    );

                raw.splice(index,1);

                state.stopValues =
                  raw.length
                    ? raw
                    : [""];
              }

              renderStopInputs(
                state.stopValues
              );
            }
          );
        }
      );
  }

  function clearDialog(){
    state.editingId = "";

    const ids = [
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
    ];

    ids.forEach(
      id=>{
        const el = $(id);
        if(el){
          el.value = "";
        }
      }
    );

    if(
      $("brokerCode") &&
      $("brokerCode").options.length
    ){
      $("brokerCode").disabled = false;
      $("brokerCode").selectedIndex = 0;
    }

    if(
      $("serviceKey") &&
      $("serviceKey").options.length
    ){
      $("serviceKey").selectedIndex = 0;
    }

    renderStopInputs([""]);

    if($("dialogTitle")){
      $("dialogTitle").textContent =
        "Add External Trip";
    }

    if($("saveTripBtn")){
      $("saveTripBtn").textContent =
        "Save Trip";
    }
  }

  function openAdd(){
    clearDialog();

    if(!state.integrations.length){
      alert(
        "No broker connection is available for this tenant."
      );
      return;
    }

    if(!state.services.length){
      alert(
        "No service is available for this tenant."
      );
      return;
    }

    $("tripDialog")
      ?.showModal();
  }

  function editTrip(id){
    const trip =
      state.trips.find(
        item=>
          String(item._id) ===
          String(id)
      );

    if(!trip){
      return;
    }

    state.editingId =
      String(trip._id);

    if($("dialogTitle")){
      $("dialogTitle").textContent =
        "Edit External Trip";
    }

    if($("saveTripBtn")){
      $("saveTripBtn").textContent =
        "Save Changes";
    }

    if($("brokerCode")){
      $("brokerCode").value =
        clean(trip.brokerCode);

      /*
        Broker identity is part of the GH trip number.
        It cannot change after intake creation.
      */
      $("brokerCode").disabled = true;
    }

    if($("externalTripId")){
      $("externalTripId").value =
        clean(trip.externalTripId);
    }

    if($("tripDate")){
      $("tripDate").value =
        clean(trip.tripDate);
    }

    if($("tripTime")){
      $("tripTime").value =
        clean(trip.tripTime);
    }

    if($("appointmentTime")){
      $("appointmentTime").value =
        clean(trip.appointmentTime);
    }

    /*
      type="time" cannot display ON CALL.
      Leave blank for ON CALL return records in the editor.
    */
    if($("returnTime")){
      const returnTime =
        clean(trip.returnTime);

      $("returnTime").value =
        returnTime.toUpperCase() ===
        "ON CALL"
          ? ""
          : returnTime;
    }

    if($("clientName")){
      $("clientName").value =
        clean(trip.clientName);
    }

    if($("clientPhone")){
      $("clientPhone").value =
        clean(trip.clientPhone);
    }

    if($("memberId")){
      $("memberId").value =
        clean(trip.memberId);
    }

    if($("serviceKey")){
      $("serviceKey").value =
        clean(trip.serviceKey);
    }

    if($("pickup")){
      $("pickup").value =
        clean(trip.pickup);
    }

    if($("dropoff")){
      $("dropoff").value =
        clean(trip.dropoff);
    }

    if($("notes")){
      $("notes").value =
        clean(trip.notes);
    }

    renderStopInputs(
      Array.isArray(trip.stops)
        ? trip.stops
        : []
    );

    $("tripDialog")
      ?.showModal();
  }

  function brokerNameForCode(code){
    const item =
      state.integrations.find(
        integration=>
          clean(
            integration.brokerCode
          ) === clean(code)
      );

    return (
      clean(item?.brokerName) ||
      clean(code)
    );
  }

  function formPayload(){
    const brokerCode =
      clean(
        $("brokerCode")?.value
      );

    const stopValues =
      currentStopsFromUI();

    return {
      brokerCode,
      brokerName:
        brokerNameForCode(
          brokerCode
        ),

      externalTripId:
        clean(
          $("externalTripId")?.value
        ),

      /*
        Intake trips stay individual here.
        Trip Split is the only place that may group them as Shared.
      */
      tripType:"SINGLE",

      tripDate:
        clean(
          $("tripDate")?.value
        ),

      tripTime:
        clean(
          $("tripTime")?.value
        ),

      appointmentTime:
        clean(
          $("appointmentTime")?.value
        ),

      returnTime:
        clean(
          $("returnTime")?.value
        ),

      clientName:
        clean(
          $("clientName")?.value
        ),

      clientPhone:
        clean(
          $("clientPhone")?.value
        ),

      memberId:
        clean(
          $("memberId")?.value
        ),

      serviceKey:
        clean(
          $("serviceKey")?.value
        ) ||
        "STANDARD",

      pickup:
        clean(
          $("pickup")?.value
        ),

      stops:
        stopValues.map(
          (address,index)=>({
            address,
            sequence:index + 1
          })
        ),

      dropoff:
        clean(
          $("dropoff")?.value
        ),

      notes:
        clean(
          $("notes")?.value
        )
    };
  }

  function validatePayload(body){
    if(!body.brokerCode){
      return "Broker is required.";
    }

    if(!body.externalTripId){
      return "Broker Trip ID is required.";
    }

    if(!body.tripDate){
      return "Trip Date is required.";
    }

    if(!body.tripTime){
      return "Pickup Time is required.";
    }

    if(!body.clientName){
      return "Passenger Name is required.";
    }

    if(!body.pickup){
      return "Pickup Address is required.";
    }

    if(!body.dropoff){
      return "Drop-off Address is required.";
    }

    return "";
  }

  async function saveTrip(){
    try{
      const body =
        formPayload();

      const validationError =
        validatePayload(body);

      if(validationError){
        alert(validationError);
        return;
      }

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

      const data =
        await requestJSON(
          url,
          {
            method,
            headers:headers(true),
            body:
              JSON.stringify(body)
          }
        );

      $("tripDialog")
        ?.close();

      clearDialog();

      await loadTrips();

      if(!editing){
        console.log(
          "External Trip created:",
          data.trip ||
          data
        );
      }

    }catch(err){
      console.error(
        "EXTERNAL TRIP SAVE ERROR:",
        err
      );

      alert(
        err.message ||
        "Failed to save external trip"
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

    try{
      await requestJSON(
        `/api/external-trips/${encodeURIComponent(id)}`,
        {
          method:"DELETE",
          headers:headers(false)
        }
      );

      await loadTrips();

      /*
        Keep overdue styling current and let the backend move trips to
        Dispatch Review automatically when the two-hour grace period ends.
      */
      window.setInterval(
        ()=>{
          loadTrips()
            .catch(
              err=>
                console.error(
                  "EXTERNAL TRIPS AUTO REFRESH ERROR:",
                  err
                )
            );
        },
        60 * 1000
      );

    }catch(err){
      console.error(
        "EXTERNAL TRIP DELETE ERROR:",
        err
      );

      alert(
        err.message ||
        "Failed to delete external trip"
      );
    }
  }

  function bindEvents(){
    $("addTripBtn")
      ?.addEventListener(
        "click",
        openAdd
      );

    $("closeDialogBtn")
      ?.addEventListener(
        "click",
        ()=>{
          $("tripDialog")
            ?.close();
        }
      );

    $("cancelDialogBtn")
      ?.addEventListener(
        "click",
        ()=>{
          $("tripDialog")
            ?.close();
        }
      );

    $("saveTripBtn")
      ?.addEventListener(
        "click",
        saveTrip
      );

    $("refreshBtn")
      ?.addEventListener(
        "click",
        ()=>{
          loadTrips()
            .catch(
              err=>{
                console.error(err);
                alert(err.message);
              }
            );
        }
      );

    [
      "brokerFilter",
      "statusFilter",
      "dateFilter"
    ].forEach(
      id=>{
        $(id)
          ?.addEventListener(
            "change",
            ()=>{
              loadTrips()
                .catch(
                  err=>{
                    console.error(err);
                    alert(err.message);
                  }
                );
            }
          );
      }
    );
  }

  async function init(){
    bindEvents();

    renderStopInputs([""]);

    try{
      await Promise.all([
        loadBrokers(),
        loadServices()
      ]);

      await loadTrips();

    }catch(err){
      console.error(
        "EXTERNAL TRIPS HUB INIT ERROR:",
        err
      );

      alert(
        err.message ||
        "Failed to load External Trips Hub"
      );
    }
  }

  init();

})();
