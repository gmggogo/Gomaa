/*
DESTINATION PATH:
server/public/admin/js/external-trips.js
*/

"use strict";

/*
DESTINATION PATH:
public/admin/js/external-trips.js
*/

(() => {

  const $ = (id) =>
    document.getElementById(id);

  const state = {
    trips:[],
    integrations:[],
    editingId:""
  };

  function token(){

    return (
      sessionStorage.getItem("token") ||
      localStorage.getItem("token") ||
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

  function escapeHtml(value){

    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function stopText(stops){

    if(!Array.isArray(stops) || !stops.length){
      return "-";
    }

    return stops
      .map(s => s.address || "")
      .filter(Boolean)
      .join(" → ");
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

    for(const [key,value] of Object.entries(filters)){
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

  async function loadBrokers(){

    const res =
      await fetch(
        "/api/external-trips/brokers",
        {
          headers:headers(false)
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
      data.brokers || [];

    renderBrokerSelectors();
  }

  async function loadTrips(){

    const res =
      await fetch(
        `/api/external-trips${queryString()}`,
        {
          headers:headers(false)
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
      data.trips || [];

    render();
  }

  function renderBrokerSelectors(){

    const currentFilter =
      $("brokerFilter").value;

    const currentDialog =
      $("brokerCode").value;

    $("brokerFilter").innerHTML =
      `<option value="">All Brokers</option>`;

    $("brokerCode").innerHTML = "";

    for(const item of state.integrations){

      const label =
        `${item.brokerName} (${item.brokerCode})`;

      const filterOption =
        document.createElement("option");

      filterOption.value =
        item.brokerCode;

      filterOption.textContent =
        label;

      $("brokerFilter")
        .appendChild(
          filterOption
        );

      const dialogOption =
        document.createElement("option");

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

  function render(){

    const body =
      $("tripRows");

    body.innerHTML = "";

    for(const trip of state.trips){

      const tr =
        document.createElement("tr");

      const transferred =
        Boolean(
          trip.transferredToTripsHub
        );

      tr.innerHTML = `
        <td class="trip-id">${escapeHtml(trip.ghExternalTripNumber || "")}</td>
        <td>${escapeHtml(trip.brokerName || trip.brokerCode || "")}</td>
        <td>${escapeHtml(trip.externalTripId || "-")}</td>
        <td>${escapeHtml(trip.tripDate || "")}</td>
        <td>${escapeHtml(trip.tripTime || "")}</td>
        <td>${escapeHtml(trip.clientName || "")}</td>
        <td>${escapeHtml(trip.clientPhone || "")}</td>
        <td>${escapeHtml(trip.pickup || "")}</td>
        <td>${escapeHtml(stopText(trip.stops))}</td>
        <td>${escapeHtml(trip.dropoff || "")}</td>
        <td>${escapeHtml(trip.serviceName || trip.serviceKey || "")}</td>
        <td class="notes">${escapeHtml(trip.notes || "")}</td>
        <td><span class="status ${escapeHtml(trip.status || "")}">${escapeHtml(trip.status || "")}</span></td>
        <td>${escapeHtml(trip.source || "")}</td>
        <td>
          ${
            transferred
              ? `<span class="status TRANSFERRED">Moved</span>`
              : `
                <button class="btn btn-light" data-edit="${trip._id}">Edit</button>
                <button class="btn btn-danger" data-delete="${trip._id}">Delete</button>
                <button class="btn btn-primary" data-transfer="${trip._id}">Send to Trips Hub</button>
              `
          }
        </td>
      `;

      body.appendChild(tr);
    }

    body
      .querySelectorAll("[data-edit]")
      .forEach(btn => {
        btn.addEventListener("click", () => {
          editTrip(
            btn.dataset.edit
          );
        });
      });

    body
      .querySelectorAll("[data-delete]")
      .forEach(btn => {
        btn.addEventListener("click", () => {
          deleteTrip(
            btn.dataset.delete
          );
        });
      });

    body
      .querySelectorAll("[data-transfer]")
      .forEach(btn => {
        btn.addEventListener("click", () => {
          transferTrip(
            btn.dataset.transfer
          );
        });
      });
  }

  function clearDialog(){

    state.editingId = "";

    [
      "externalTripId",
      "tripDate",
      "tripTime",
      "appointmentTime",
      "returnTime",
      "clientName",
      "clientPhone",
      "memberId",
      "serviceKey",
      "pickup",
      "stops",
      "dropoff",
      "notes"
    ].forEach(id => {
      $(id).value = "";
    });

    $("tripType").value =
      "SINGLE";

    $("dialogTitle").textContent =
      "Add External Trip";
  }

  function openAdd(){

    clearDialog();

    if(!state.integrations.length){
      alert(
        "No broker connection is available for this tenant."
      );
      return;
    }

    $("tripDialog").showModal();
  }

  function editTrip(id){

    const trip =
      state.trips.find(
        x => x._id === id
      );

    if(!trip){
      return;
    }

    state.editingId =
      trip._id;

    $("dialogTitle").textContent =
      "Edit External Trip";

    $("brokerCode").value =
      trip.brokerCode || "";

    $("externalTripId").value =
      trip.externalTripId || "";

    $("tripType").value =
      trip.tripType || "SINGLE";

    $("tripDate").value =
      trip.tripDate || "";

    $("tripTime").value =
      trip.tripTime || "";

    $("appointmentTime").value =
      trip.appointmentTime || "";

    $("returnTime").value =
      trip.returnTime || "";

    $("clientName").value =
      trip.clientName || "";

    $("clientPhone").value =
      trip.clientPhone || "";

    $("memberId").value =
      trip.memberId || "";

    $("serviceKey").value =
      trip.serviceKey || "";

    $("pickup").value =
      trip.pickup || "";

    $("stops").value =
      (trip.stops || [])
        .map(s => s.address || "")
        .filter(Boolean)
        .join("\n");

    $("dropoff").value =
      trip.dropoff || "";

    $("notes").value =
      trip.notes || "";

    $("tripDialog").showModal();
  }

  function brokerNameForCode(code){

    const item =
      state.integrations.find(
        x => x.brokerCode === code
      );

    return item?.brokerName || code;
  }

  function formPayload(){

    const brokerCode =
      $("brokerCode").value;

    const stops =
      $("stops").value
        .split("\n")
        .map(v => v.trim())
        .filter(Boolean)
        .map((address,index) => ({
          address,
          sequence:index + 1
        }));

    return {
      brokerCode,
      brokerName:
        brokerNameForCode(
          brokerCode
        ),

      externalTripId:
        $("externalTripId").value.trim(),

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
        $("clientName").value.trim(),

      clientPhone:
        $("clientPhone").value.trim(),

      memberId:
        $("memberId").value.trim(),

      serviceKey:
        $("serviceKey").value.trim(),

      pickup:
        $("pickup").value.trim(),

      stops,

      dropoff:
        $("dropoff").value.trim(),

      notes:
        $("notes").value.trim()
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
            headers:headers(true),
            body:JSON.stringify(body)
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

      $("tripDialog").close();

      await loadTrips();

    }catch(err){

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

    const res =
      await fetch(
        `/api/external-trips/${encodeURIComponent(id)}`,
        {
          method:"DELETE",
          headers:headers(false)
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

  async function transferTrip(id){

    if(
      !confirm(
        "Send this trip to the main Trips Hub?"
      )
    ){
      return;
    }

    const res =
      await fetch(
        `/api/external-transfer/${encodeURIComponent(id)}`,
        {
          method:"POST",
          headers:headers(true),
          body:"{}"
        }
      );

    const data =
      await res.json();

    if(!res.ok){
      alert(
        data.message ||
        "Failed to transfer trip"
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
      () => $("tripDialog").close()
    );

  $("cancelDialogBtn")
    .addEventListener(
      "click",
      () => $("tripDialog").close()
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
        loadTrips().catch(console.error);
      }
    );

  [
    "brokerFilter",
    "statusFilter",
    "dateFilter"
  ].forEach(id => {
    $(id).addEventListener(
      "change",
      () => {
        loadTrips().catch(console.error);
      }
    );
  });

  Promise.all([
    loadBrokers(),
    loadTrips()
  ]).catch(err => {
    console.error(err);
    alert(
      err.message ||
      "Failed to load External Trips Hub"
    );
  });

})();
