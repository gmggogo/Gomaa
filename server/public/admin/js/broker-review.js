"use strict";

/*
DESTINATION PATH:
server/public/admin/js/broker-review.js
*/

(() => {

  const $ = id =>
    document.getElementById(id);

  const state = {
    items:[],
    today:"",
    tomorrow:"",
    activeDay:"TODAY",
    selected:new Set(),
    editingId:""
  };

  function clean(value){
    return String(value ?? "").trim();
  }

  function token(){
    return (
      sessionStorage.getItem("token") ||
      sessionStorage.getItem("staffToken") ||
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

  async function api(
    url,
    options={}
  ){
    const res =
      await fetch(
        url,
        {
          cache:"no-store",
          ...options,
          headers:{
            ...headers(
              options.body !== undefined
            ),
            ...(options.headers || {})
          }
        }
      );

    const data =
      await res
        .json()
        .catch(()=>({}));

    if(!res.ok){
      throw new Error(
        data.message ||
        `Request failed (${res.status})`
      );
    }

    return data;
  }

  function esc(value){
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function normalizeStop(stop){
    if(typeof stop === "string"){
      return clean(stop);
    }

    return clean(
      stop?.address ||
      stop?.formattedAddress ||
      stop?.label
    );
  }

  function stopBoxes(stops){
    const list =
      Array.isArray(stops)
        ? stops
            .map(normalizeStop)
            .filter(Boolean)
        : [];

    if(!list.length){
      return `<div class="route-box">-</div>`;
    }

    return list
      .map(
        value=>
          `<div class="route-box">${esc(value)}</div>`
      )
      .join("");
  }

  function addressBox(value){
    return `
      <div class="route-box">
        ${esc(value || "-")}
      </div>
    `;
  }

  function itemDate(item){
    return (
      clean(item?.trip?.tripDate) ||
      clean(
        item?.externalTrips?.[0]
          ?.tripDate
      )
    );
  }

  function itemTime(item){
    return (
      clean(item?.trip?.tripTime) ||
      clean(
        item?.externalTrips?.[0]
          ?.tripTime
      )
    );
  }

  function visibleItems(){
    const wanted =
      state.activeDay === "TODAY"
        ? state.today
        : state.tomorrow;

    return state.items.filter(
      item=>
        itemDate(item) === wanted
    );
  }

  function isSelected(id){
    return state.selected.has(
      String(id)
    );
  }

  function notice(
    message="",
    type=""
  ){
    const box =
      $("notice");

    if(!box) return;

    box.textContent =
      message;

    box.className =
      "notice " +
      (
        message
          ? (
              type === "error"
                ? "error"
                : "ok"
            )
          : "hidden"
      );
  }

  function statusText(item){
    if(
      item.reviewConfirmed === true
    ){
      return (
        clean(
          item?.trip
            ?.dispatchStatus
        ) ||
        clean(
          item?.trip?.status
        ) ||
        "CONFIRMED"
      );
    }

    return "WAITING REVIEW";
  }

  function passengerRows(item){
    const externals =
      Array.isArray(
        item.externalTrips
      )
        ? item.externalTrips
        : [];

    if(
      item.processingMode !== "SHARED"
    ){
      const ex =
        externals[0] ||
        {};

      return {
        passenger:
          esc(
            ex.clientName ||
            item?.trip
              ?.clientName ||
            "-"
          ),
        phone:
          esc(
            ex.clientPhone ||
            item?.trip
              ?.clientPhone ||
            "-"
          ),
        brokerTrip:
          esc(
            ex.externalTripId ||
            item?.trip
              ?.brokerTripId ||
            "-"
          ),
        appointment:
          esc(
            ex.appointmentTime ||
            item?.trip
              ?.appointmentTime ||
            "-"
          ),
        returnTime:
          esc(
            ex.returnTime ||
            item?.trip
              ?.returnTime ||
            "-"
          )
      };
    }

    return {
      passenger:
        externals
          .map(
            ex=>
              `<div class="cell-item">${esc(ex.clientName || "-")}</div>`
          )
          .join(""),
      phone:
        externals
          .map(
            ex=>
              `<div class="cell-item">${esc(ex.clientPhone || "-")}</div>`
          )
          .join(""),
      brokerTrip:
        externals
          .map(
            ex=>
              `<div class="cell-item">${esc(ex.externalTripId || "-")}</div>`
          )
          .join(""),
      appointment:
        externals
          .map(
            ex=>
              `<div class="cell-item">${esc(ex.appointmentTime || "-")}</div>`
          )
          .join(""),
      returnTime:
        externals
          .map(
            ex=>
              `<div class="cell-item">${esc(ex.returnTime || "-")}</div>`
          )
          .join("")
    };
  }

  function renderTabs(){
    $("todayTab")
      ?.classList.toggle(
        "active",
        state.activeDay === "TODAY"
      );

    $("tomorrowTab")
      ?.classList.toggle(
        "active",
        state.activeDay === "TOMORROW"
      );

    $("todayLabel").textContent =
      state.today || "Today";

    $("tomorrowLabel").textContent =
      state.tomorrow || "Tomorrow";
  }

  function renderStats(){
    const list =
      visibleItems();

    $("totalCount").textContent =
      String(list.length);

    $("waitingCount").textContent =
      String(
        list.filter(
          item=>
            item.reviewConfirmed !== true
        ).length
      );

    $("confirmedCount").textContent =
      String(
        list.filter(
          item=>
            item.reviewConfirmed === true
        ).length
      );

    $("sharedCount").textContent =
      String(
        list.filter(
          item=>
            item.processingMode === "SHARED"
        ).length
      );
  }

  function renderTable(){

    const body =
      $("brokerReviewRows");

    if(!body){
      return;
    }

    const list =
      visibleItems();

    if(!list.length){
      body.innerHTML = `
        <tr>
          <td colspan="20" class="empty">
            No broker trips for this day.
          </td>
        </tr>
      `;

      return;
    }

    body.innerHTML =
      list.map(
        (item,index)=>{

          const trip =
            item.trip ||
            {};

          const firstExternal =
            item.externalTrips?.[0] ||
            {};

          const p =
            passengerRows(item);

          const shared =
            item.processingMode ===
            "SHARED";

          const status =
            statusText(item);

          const canSelect =
            item.reviewConfirmed !==
            true;

          return `
            <tr
              data-id="${esc(item.id)}"
              class="${item.reviewConfirmed ? "confirmed-row" : ""}"
            >
              <td>
                ${
                  canSelect
                    ? `<input
                         type="checkbox"
                         class="row-check"
                         data-select="${esc(item.id)}"
                         ${isSelected(item.id) ? "checked" : ""}
                       >`
                    : `<span class="confirmed-check">✓</span>`
                }
              </td>

              <td class="trip-number">
                ${esc(
                  trip.ghExternalTripNumber ||
                  firstExternal.ghExternalTripNumber ||
                  "-"
                )}
              </td>

              <td>
                <strong>
                  ${esc(
                    trip.brokerName ||
                    firstExternal.brokerName ||
                    firstExternal.brokerCode ||
                    "-"
                  )}
                </strong>
              </td>

              <td>
                <div class="cell-box">
                  ${p.brokerTrip}
                </div>
              </td>

              <td>
                <span class="mode ${shared ? "shared" : "individual"}">
                  ${shared ? "SHARED" : "INDIVIDUAL"}
                </span>
              </td>

              <td>
                ${esc(
                  item.sharedGroupId ||
                  trip.groupId ||
                  "-"
                )}
              </td>

              <td class="center-cell">${esc(itemDate(item))}</td>
              <td class="center-cell">${esc(itemTime(item))}</td>

              <td class="center-cell">
                <div class="cell-box">
                  ${p.appointment}
                </div>
              </td>

              <td class="center-cell">
                <div class="cell-box">
                  ${p.returnTime}
                </div>
              </td>

              <td class="center-cell">
                <div class="cell-box">
                  ${p.passenger}
                </div>
              </td>

              <td>
                <div class="cell-box">
                  ${p.phone}
                </div>
              </td>

              <td>
                ${addressBox(
                  trip.pickup ||
                  firstExternal.pickup
                )}
              </td>

              <td class="stops-cell">
                ${stopBoxes(
                  trip.stops ||
                  firstExternal.stops
                )}
              </td>

              <td>
                ${addressBox(
                  trip.dropoff ||
                  firstExternal.dropoff
                )}
              </td>

              <td>
                ${esc(
                  trip.serviceKey ||
                  firstExternal.serviceName ||
                  firstExternal.serviceKey ||
                  "-"
                )}
              </td>

              <td>
                ${esc(
                  trip.driverName ||
                  "-"
                )}
              </td>

              <td>
                ${esc(
                  trip.vehicleNumber ||
                  "-"
                )}
              </td>

              <td>
                <span class="status-badge">
                  ${esc(status)}
                </span>
              </td>

              <td>
                <div class="actions-cell">
                  <button
                    type="button"
                    class="btn edit-btn"
                    data-edit="${esc(item.id)}"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    class="btn delete-btn"
                    data-delete="${esc(item.id)}"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          `;
        }
      ).join("");

    body
      .querySelectorAll(
        "[data-select]"
      )
      .forEach(
        box=>{
          box.addEventListener(
            "change",
            ()=>{
              const id =
                box.dataset.select;

              if(box.checked){
                state.selected.add(id);
              }else{
                state.selected.delete(id);
              }

              updateSelectAllButton();
            }
          );
        }
      );

    body
      .querySelectorAll(
        "[data-edit]"
      )
      .forEach(
        btn=>{
          btn.addEventListener(
            "click",
            ()=>
              openEdit(
                btn.dataset.edit
              )
          );
        }
      );

    body
      .querySelectorAll(
        "[data-delete]"
      )
      .forEach(
        btn=>{
          btn.addEventListener(
            "click",
            ()=>
              deleteTrip(
                btn.dataset.delete
              )
          );
        }
      );
  }

  function updateSelectAllButton(){

    const available =
      visibleItems()
        .filter(
          item=>
            item.reviewConfirmed !==
            true
        );

    const allSelected =
      available.length > 0 &&
      available.every(
        item=>
          state.selected.has(
            String(item.id)
          )
      );

    $("selectAllBtn").textContent =
      allSelected
        ? "Unselect All"
        : "Select All";
  }

  function render(){
    renderTabs();
    renderStats();
    renderTable();
    updateSelectAllButton();
  }

  function setDay(day){
    state.activeDay =
      day;

    state.selected.clear();
    render();
  }

  function toggleSelectAll(){

    const available =
      visibleItems()
        .filter(
          item=>
            item.reviewConfirmed !==
            true
        );

    const allSelected =
      available.length > 0 &&
      available.every(
        item=>
          state.selected.has(
            String(item.id)
          )
      );

    if(allSelected){
      available.forEach(
        item=>
          state.selected.delete(
            String(item.id)
          )
      );
    }else{
      available.forEach(
        item=>
          state.selected.add(
            String(item.id)
          )
      );
    }

    render();
  }

  async function confirmSelected(){

    const ids =
      [...state.selected];

    if(!ids.length){
      notice(
        "Select at least one trip.",
        "error"
      );
      return;
    }

    if(
      !window.confirm(
        "Confirm selected broker trips and release them to Dispatch?"
      )
    ){
      return;
    }

    try{

      $("confirmSelectedBtn").disabled =
        true;

      const data =
        await api(
          "/api/broker-review/confirm-selected",
          {
            method:"POST",
            body:
              JSON.stringify({
                dispatchTripIds:ids
              })
          }
        );

      notice(
        data.message ||
        "Selected trips were released to Dispatch.",
        "ok"
      );

      state.selected.clear();

      await load();

    }catch(err){

      notice(
        err.message,
        "error"
      );

    }finally{

      $("confirmSelectedBtn").disabled =
        false;
    }
  }

  function findItem(id){
    return state.items.find(
      item=>
        String(item.id) ===
        String(id)
    );
  }

  function openEdit(id){

    const item =
      findItem(id);

    if(!item){
      return;
    }

    const trip =
      item.trip ||
      {};

    state.editingId =
      id;

    $("editDate").value =
      clean(
        trip.tripDate ||
        item.externalTrips?.[0]
          ?.tripDate
      );

    $("editTime").value =
      clean(
        trip.tripTime ||
        item.externalTrips?.[0]
          ?.tripTime
      );

    $("editPickup").value =
      clean(
        trip.pickup ||
        item.externalTrips?.[0]
          ?.pickup
      );

    $("editDropoff").value =
      clean(
        trip.dropoff ||
        item.externalTrips?.[0]
          ?.dropoff
      );

    $("editNotes").value =
      clean(
        trip.notes ||
        item.externalTrips?.[0]
          ?.notes
      );

    const shared =
      item.processingMode ===
      "SHARED";

    $("editPickup").disabled =
      shared;

    $("editDropoff").disabled =
      shared;

    $("routeLockNote")
      .classList.toggle(
        "hidden",
        !shared
      );

    $("editDialog")
      .showModal();
  }

  async function saveEdit(){

    if(!state.editingId){
      return;
    }

    try{

      const data =
        await api(
          `/api/broker-review/trips/${encodeURIComponent(state.editingId)}`,
          {
            method:"PATCH",
            body:
              JSON.stringify({
                tripDate:
                  $("editDate").value,
                tripTime:
                  $("editTime").value,
                pickup:
                  $("editPickup").value.trim(),
                dropoff:
                  $("editDropoff").value.trim(),
                notes:
                  $("editNotes").value.trim()
              })
          }
        );

      $("editDialog").close();
      state.editingId = "";

      notice(
        "Trip updated.",
        "ok"
      );

      await load();

    }catch(err){

      notice(
        err.message,
        "error"
      );
    }
  }

  async function deleteTrip(id){

    const item =
      findItem(id);

    if(!item){
      return;
    }

    const name =
      item.processingMode ===
      "SHARED"
        ? (
            item.sharedGroupId ||
            "this shared group"
          )
        : (
            item.externalTrips?.[0]
              ?.externalTripId ||
            "this trip"
          );

    const ok =
      window.confirm(
`WARNING

Delete ${name}?

This removes the broker review trip and its linked broker source record.
This action cannot be undone.`
      );

    if(!ok){
      return;
    }

    try{

      await api(
        `/api/broker-review/trips/${encodeURIComponent(id)}`,
        {
          method:"DELETE"
        }
      );

      state.selected.delete(
        String(id)
      );

      notice(
        "Trip deleted.",
        "ok"
      );

      await load();

    }catch(err){

      notice(
        err.message,
        "error"
      );
    }
  }

  async function load(){

    try{

      const data =
        await api(
          "/api/broker-review/bootstrap"
        );

      state.items =
        Array.isArray(data.items)
          ? data.items
          : [];

      state.today =
        clean(data.today);

      state.tomorrow =
        clean(data.tomorrow);

      /*
        Remove selections that no longer exist or are already confirmed.
      */
      const valid =
        new Set(
          state.items
            .filter(
              item=>
                item.reviewConfirmed !==
                true
            )
            .map(
              item=>
                String(item.id)
            )
        );

      state.selected =
        new Set(
          [...state.selected]
            .filter(
              id=>
                valid.has(id)
            )
        );

      render();

    }catch(err){

      notice(
        err.message ||
        "Failed to load Broker Review.",
        "error"
      );
    }
  }

  function bind(){

    $("todayTab")
      ?.addEventListener(
        "click",
        ()=>setDay("TODAY")
      );

    $("tomorrowTab")
      ?.addEventListener(
        "click",
        ()=>setDay("TOMORROW")
      );

    $("selectAllBtn")
      ?.addEventListener(
        "click",
        toggleSelectAll
      );

    $("confirmSelectedBtn")
      ?.addEventListener(
        "click",
        confirmSelected
      );

    $("closeEditBtn")
      ?.addEventListener(
        "click",
        ()=>{
          $("editDialog").close();
          state.editingId = "";
        }
      );

    $("cancelEditBtn")
      ?.addEventListener(
        "click",
        ()=>{
          $("editDialog").close();
          state.editingId = "";
        }
      );

    $("saveEditBtn")
      ?.addEventListener(
        "click",
        saveEdit
      );
  }

  document.addEventListener(
    "DOMContentLoaded",
    ()=>{
      bind();
      load();

      /*
        Keep status fresh while the page is open.
        This makes Driver / Dispatch status changes appear without refresh.
      */
      setInterval(
        ()=>{
          load().catch(()=>{});
        },
        15000
      );
    }
  );

})();
