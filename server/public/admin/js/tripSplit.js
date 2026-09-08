"use strict";

/*
DESTINATION PATH:
server/public/admin/js/tripSplit.js

PURPOSE:
Broker Trip Split page controller.

FLOW:
- Loads today's and tomorrow's broker trips.
- Mixed or single broker filter.
- Select All.
- Share selected trips using Shared Engine.
- Restore Original only for selected shared groups.
- Edit/Delete unconfirmed original trips.
- Confirm one group or Confirm All.
- Confirmed trips go directly to Dispatch.
*/

(function(){
  const state = {
    trips:[],
    integrations:[],
    groups:[],
    excluded:[],
    selectedTripIds:new Set(),
    selectedGroupIds:new Set(),
    capabilities:{},
    editingId:"",
    confirmedCount:0,
    today:"",
    tomorrow:""
  };

  const $ = id => document.getElementById(id);

  function clean(value){
    return String(value ?? "").trim();
  }

  function escapeHtml(value){
    return clean(value)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function normalizeStopAddress(stop){
    if(stop === undefined || stop === null){
      return "";
    }

    if(typeof stop === "string"){
      return clean(stop);
    }

    if(typeof stop === "object"){
      return clean(
        stop.address ||
        stop.formattedAddress ||
        stop.formatted_address ||
        stop.description ||
        stop.label ||
        ""
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
            .slice(0,5)
        : [];

    if(!items.length){
      return `<div class="gh-stop-box"></div>`;
    }

    return items
      .map(address=>`
        <div class="gh-stop-box">
          ${escapeHtml(address)}
        </div>
      `)
      .join("");
  }

  function groupedVisibleTrips(){
    const groups = new Map();

    visibleTrips().forEach(trip=>{
      const date = clean(trip.tripDate) || "No Date";

      if(!groups.has(date)){
        groups.set(date,[]);
      }

      groups.get(date).push(trip);
    });

    return groups;
  }

  function token(){
    return (
      localStorage.getItem("token") ||
      sessionStorage.getItem("token") ||
      localStorage.getItem("jwt") ||
      sessionStorage.getItem("jwt") ||
      ""
    );
  }

  function authHeaders(){
    const headers = {
      "Content-Type":"application/json"
    };

    const t = token();

    if(t){
      headers.Authorization = "Bearer " + t;
    }

    return headers;
  }

  async function api(url,options = {}){
    const response = await fetch(url,{
      ...options,
      headers:{
        ...authHeaders(),
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(()=>({}));

    if(!response.ok){
      throw new Error(data.message || "Request failed");
    }

    return data;
  }

  function notice(message,type = "ok"){
    const el = $("pageNotice");
    if(!el) return;

    el.textContent = message || "";
    el.className = "notice";

    if(message){
      el.classList.add("show",type);
    }
  }

  function hasStops(trip){
    return Array.isArray(trip?.stops) && trip.stops.length > 0;
  }

  function isReturnTrip(trip){
    const number =
      clean(
        trip?.ghExternalTripNumber ||
        trip?.tripNumber
      ).toUpperCase();

    return (
      number.endsWith("-R") ||
      clean(
        trip?.brokerStatus
      ).toUpperCase() === "RETURN" ||
      trip?.isReturnTrip === true ||
      clean(
        trip?.tripLeg
      ).toUpperCase() === "RETURN"
    );
  }

  function isOnCallTrip(trip){
    const time =
      clean(
        trip?.tripTime ||
        trip?.pickupTime
      )
        .toUpperCase()
        .replace(/\s+/g," ");

    return (
      isReturnTrip(trip) &&
      (
        time === "ON CALL" ||
        time === "ON-CALL" ||
        time === "WILL CALL" ||
        time === "WILL-CALL"
      )
    );
  }

  function addressKey(value){
    return clean(value)
      .toLowerCase()
      .replace(/\s+/g," ");
  }

  function groupDropoffTime(
    group,
    trip
  ){
    const events =
      Array.isArray(
        group?.schedule
          ?.eventTimes
      )
        ? group.schedule.eventTimes
        : [];

    const target =
      addressKey(
        trip?.dropoff
      );

    const match =
      events.find(event=>
        clean(event?.type)
          .toLowerCase() ===
          "dropoff" &&
        addressKey(
          event?.address
        ) === target
      );

    return clean(
      match?.time
    );
  }

  function timeMinutes(value){
    const text =
      clean(value);

    const match =
      text.match(
        /^(\d{1,2}):(\d{2})$/
      );

    if(!match){
      return null;
    }

    return (
      Number(match[1]) * 60 +
      Number(match[2])
    );
  }

  function dropoffComparisonClass(
    dropoffTime,
    appointmentTime
  ){
    const drop =
      timeMinutes(
        dropoffTime
      );

    const appt =
      timeMinutes(
        appointmentTime
      );

    if(
      drop === null ||
      appt === null
    ){
      return "";
    }

    /*
      Cross-midnight appointments:
      23:30 pickup -> 00:15 appointment.
    */
    const normalizedAppt =
      appt < drop &&
      (drop - appt) > 720
        ? appt + 1440
        : appt;

    return drop <= normalizedAppt
      ? "time-ok"
      : "time-late";
  }

  function tripId(trip){
    return clean(trip?._id || trip?.id);
  }

  function tripStatus(trip){
    if(trip?.tripSplitConfirmed === true) return "Confirmed";
    if(isOnCallTrip(trip)) return "RETURN • ON CALL";
    if(isReturnTrip(trip)) return "RETURN";
    if(hasStops(trip)) return "Excluded";
    return clean(trip?.status || "Ready");
  }

  function groupedTripIds(){
    return new Set(
      state.groups.flatMap(group=>
        Array.isArray(group?.tripIds)
          ? group.tripIds.map(String)
          : []
      )
    );
  }

  function visibleTrips(){
    const broker = $("brokerFilter")?.value || "MIXED";
    const day = $("dayFilter")?.value || "ALL";
    const groupedIds = groupedTripIds();

    return state.trips.filter(trip=>{
      if(groupedIds.has(tripId(trip))){
        return false;
      }

      if(broker !== "MIXED" && clean(trip.brokerCode) !== broker){
        return false;
      }

      if(day === "TODAY" && clean(trip.tripDate) !== state.today){
        return false;
      }

      if(day === "TOMORROW" && clean(trip.tripDate) !== state.tomorrow){
        return false;
      }

      return true;
    });
  }

  function availableForShare(trip){
    return (
      !hasStops(trip) &&
      !isOnCallTrip(trip) &&
      trip?.tripSplitConfirmed !== true
    );
  }

  function renderBrokerFilter(){
    const select = $("brokerFilter");
    if(!select) return;

    const current = select.value || "MIXED";

    const brokers = [
      ...new Map(
        state.trips
          .filter(t=>clean(t.brokerCode))
          .map(t=>[
            clean(t.brokerCode),
            clean(t.brokerName || t.brokerCode)
          ])
      ).entries()
    ];

    select.innerHTML =
      `<option value="MIXED">Mixed</option>` +
      brokers
        .map(([code,name])=>
          `<option value="${escapeHtml(code)}">${escapeHtml(name)}</option>`
        )
        .join("");

    if([...select.options].some(o=>o.value === current)){
      select.value = current;
    }
  }

  function renderOriginalTrips(){
    const body = $("originalTripRows");
    if(!body) return;

    const trips = visibleTrips();
    $("originalCount").textContent = trips.length;

    if(!trips.length){
      body.innerHTML =
        `<tr>
          <td colspan="17">
            <div class="empty">
              No broker trips for this filter.
            </div>
          </td>
        </tr>`;
      return;
    }

    const groups = groupedVisibleTrips();
    const rows = [];

    for(const [date,dateTrips] of groups.entries()){
      rows.push(`
        <tr class="date-group-row">
          <td colspan="17">
            Trip Date: ${escapeHtml(date)}
          </td>
        </tr>
      `);

      dateTrips.forEach(trip=>{
        const id = tripId(trip);
        const excluded = hasStops(trip);
        const confirmed = trip?.tripSplitConfirmed === true;
        const onCall = isOnCallTrip(trip);
        const disabled = excluded || confirmed || onCall;
        const selected = state.selectedTripIds.has(id);

        const statusClass =
          confirmed ? "confirmed" :
          excluded ? "excluded" :
          "ready";

        rows.push(`
          <tr class="${isReturnTrip(trip) ? "return-trip-row" : ""}">
            <td class="check-cell">
              <input
                type="checkbox"
                class="trip-check"
                data-id="${escapeHtml(id)}"
                ${selected ? "checked" : ""}
                ${disabled ? "disabled" : ""}
              />
            </td>

            <td class="trip-id">
              ${escapeHtml(trip.ghExternalTripNumber || "-")}
              ${
                isReturnTrip(trip)
                  ? `<span class="return-trip-badge">RETURN</span>`
                  : ""
              }
            </td>

            <td>
              ${escapeHtml(trip.brokerName || trip.brokerCode || "-")}
            </td>

            <td class="small-cell">
              ${escapeHtml(trip.externalTripId || trip.brokerTripId || "-")}
            </td>

            <td class="small-cell">
              ${escapeHtml(trip.tripTime || trip.pickupTime || "-")}
            </td>

            <td class="small-cell">
              ${escapeHtml(trip.appointmentTime || "-")}
            </td>

            <td class="small-cell">
              ${escapeHtml(trip.returnTime || "-")}
            </td>

            <td>
              ${escapeHtml(trip.clientName || "-")}
            </td>

            <td>
              ${escapeHtml(trip.clientPhone || "-")}
            </td>

            <td class="address-cell">
              ${addressBox(trip.pickup)}
            </td>

            <td class="stops-cell">
              ${stopBoxes(trip.stops)}
            </td>

            <td class="address-cell">
              ${addressBox(trip.dropoff)}
            </td>

            <td>
              ${escapeHtml(trip.serviceName || trip.serviceKey || "STANDARD")}
            </td>

            <td class="notes-cell">
              ${escapeHtml(trip.notes || "-")}
            </td>

            <td>
              <span class="status ${statusClass}">
                ${escapeHtml(tripStatus(trip))}
              </span>
            </td>

            <td>
              ${escapeHtml(trip.source || "BROKER")}
            </td>

            <td>
              <div class="row-actions">
                <button
                  class="btn btn-dark edit-trip-btn"
                  data-id="${escapeHtml(id)}"
                  type="button"
                  ${confirmed ? "disabled" : ""}
                >
                  Edit
                </button>

                <button
                  class="btn btn-red delete-trip-btn"
                  data-id="${escapeHtml(id)}"
                  type="button"
                  ${confirmed ? "disabled" : ""}
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
        `);
      });
    }

    body.innerHTML = rows.join("");

    body.querySelectorAll(".trip-check").forEach(el=>{
      el.addEventListener("change",()=>{
        const id = el.dataset.id;

        if(el.checked){
          state.selectedTripIds.add(id);
        }else{
          state.selectedTripIds.delete(id);
        }

        renderStats();
      });
    });

    body.querySelectorAll(".edit-trip-btn").forEach(el=>{
      el.addEventListener("click",()=>openEdit(el.dataset.id));
    });

    body.querySelectorAll(".delete-trip-btn").forEach(el=>{
      el.addEventListener("click",()=>deleteTrip(el.dataset.id));
    });
  }

  function groupRouteText(group){
    const plan = Array.isArray(group.routePlan) ? group.routePlan : [];

    if(!plan.length){
      return "";
    }

    return plan
      .slice()
      .sort((a,b)=>Number(a.order || 0)-Number(b.order || 0))
      .map((point,index)=>{
        const type = clean(point.type).toUpperCase();
        return `${index + 1}. ${type} — ${clean(point.address)}`;
      })
      .join("<br>");
  }

  function renderGroups(){
    const wrap = $("sharedGroups");
    if(!wrap) return;

    $("groupCount").textContent = state.groups.length;

    if(!state.groups.length){
      wrap.innerHTML =
        `<div class="empty">No shared groups created yet.</div>`;
      return;
    }

    wrap.innerHTML = state.groups.map(group=>{
      const selected = state.selectedGroupIds.has(group.groupId);

      return `
        <div class="group-card">
          <div class="group-head">
            <div class="group-title">
              <input
                type="checkbox"
                class="group-check"
                data-id="${escapeHtml(group.groupId)}"
                ${selected ? "checked" : ""}
              />
              <span>${escapeHtml(group.groupId)}</span>
              <span class="status shared">Shared</span>
            </div>

            <div class="group-meta">
              <span>${escapeHtml(String(group.tripIds?.length || 0))} riders</span>
              <span>${escapeHtml(String(group.routeMiles || 0))} mi</span>
              <span>${escapeHtml(String(group.routeMinutes || 0))} min</span>
              <span>Pickup ${escapeHtml(group.calculatedFirstPickupTime || "-")}</span>
            </div>

            <div class="group-actions">
              <button
                class="btn btn-restore restore-group-btn"
                data-id="${escapeHtml(group.groupId)}"
                type="button"
              >Restore</button>

              <button
                class="btn btn-confirm-glow confirm-group-btn"
                data-id="${escapeHtml(group.groupId)}"
                type="button"
              >Confirm</button>
            </div>
          </div>

          <div class="table-wrap" style="border:0;border-radius:0">
            <table style="min-width:1220px">
              <thead>
                <tr>
                  <th class="group-trip-number-head">Trip Number</th>
                  <th>Broker</th>
                  <th>Broker Trip ID</th>
                  <th>Passenger</th>
                  <th>Pickup</th>
                  <th>Drop-off</th>
                  <th>Pickup Time</th>
                  <th class="dropoff-time-head">Drop-off Time</th>
                  <th class="appointment-head">Appointment</th>
                </tr>
              </thead>
              <tbody>
                ${(group.trips || []).map(trip=>{
                  const calculatedDropoff =
                    groupDropoffTime(
                      group,
                      trip
                    ) || "-";

                  const appointment =
                    clean(
                      trip.appointmentTime
                    ) || "-";

                  const compareClass =
                    dropoffComparisonClass(
                      calculatedDropoff,
                      appointment
                    );

                  return `
                    <tr>
                      <td class="group-trip-number">
                        ${escapeHtml(trip.ghExternalTripNumber || trip.tripNumber || "-")}
                      </td>
                      <td>${escapeHtml(trip.brokerName || trip.brokerCode || "-")}</td>
                      <td>${escapeHtml(trip.externalTripId || trip.brokerTripId || "-")}</td>
                      <td>${escapeHtml(trip.clientName || "-")}</td>
                      <td>${escapeHtml(trip.pickup || "-")}</td>
                      <td>${escapeHtml(trip.dropoff || "-")}</td>
                      <td>${escapeHtml(trip.tripTime || trip.pickupTime || "-")}</td>
                      <td class="dropoff-time-cell ${compareClass}">
                        ${escapeHtml(calculatedDropoff)}
                      </td>
                      <td class="appointment-cell">
                        ${escapeHtml(appointment)}
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>

          <div class="route-box">
            ${groupRouteText(group)}
          </div>
        </div>
      `;
    }).join("");

    wrap.querySelectorAll(".group-check").forEach(el=>{
      el.addEventListener("change",()=>{
        const id = el.dataset.id;

        if(el.checked){
          state.selectedGroupIds.add(id);
        }else{
          state.selectedGroupIds.delete(id);
        }

        renderStats();
      });
    });

    wrap.querySelectorAll(".restore-group-btn").forEach(el=>{
      el.addEventListener("click",()=>restoreGroups([el.dataset.id]));
    });

    wrap.querySelectorAll(".confirm-group-btn").forEach(el=>{
      el.addEventListener("click",()=>confirmGroups([el.dataset.id]));
    });
  }

  function renderStats(){
    $("statVisible").textContent = visibleTrips().length;
    $("statSelected").textContent =
      state.selectedTripIds.size + state.selectedGroupIds.size;
    $("statGroups").textContent = state.groups.length;
    $("statExcluded").textContent =
      visibleTrips().filter(hasStops).length + state.excluded.length;
    $("statConfirmed").textContent = state.confirmedCount;
  }

  function renderAll(){
    renderBrokerFilter();
    renderOriginalTrips();
    renderGroups();
    renderStats();

    const shareAllowed =
      state.capabilities?.sharedServiceEnabled === true ||
      state.capabilities?.sharedServiceFound === true;

    /*
      Trip Split belongs to Broker Operations.
      The page itself requires Broker.
      Only the Share action depends on the SHARED service.
    */
    $("shareBtn")
      ?.classList
      .toggle(
        "hidden",
        !shareAllowed
      );

    /*
      Restore Original belongs to the Shared feature too.
      If Shared is not enabled for this tenant, hide it exactly
      the same way as the Share button.
    */
    $("restoreBtn")
      ?.classList
      .toggle(
        "hidden",
        !shareAllowed
      );
  }

  function selectAll(){
    const available = visibleTrips().filter(availableForShare);

    const allSelected =
      available.length > 0 &&
      available.every(trip=>state.selectedTripIds.has(tripId(trip)));

    if(allSelected){
      available.forEach(trip=>state.selectedTripIds.delete(tripId(trip)));
    }else{
      available.forEach(trip=>state.selectedTripIds.add(tripId(trip)));
    }

    renderAll();
  }

  async function createShare(){
    const ids = [...state.selectedTripIds];

    if(ids.length < 2){
      notice("Select at least two eligible trips.","error");
      return;
    }

    try{
      $("shareBtn").disabled = true;
      notice("Building and saving shared groups...","ok");

      const result = await api("/api/trip-split/share",{
        method:"POST",
        body:JSON.stringify({
          tripIds:ids
        })
      });

      state.selectedTripIds.clear();
      state.selectedGroupIds.clear();

      await load({silent:true});

      const createdCount = Array.isArray(result.groups)
        ? result.groups.length
        : 0;

      notice(
        `${createdCount} shared group(s) created and saved.`,
        "ok"
      );
    }catch(err){
      notice(err.message,"error");
    }finally{
      $("shareBtn").disabled = false;
    }
  }

  async function restoreGroups(groupIds){
    const ids = [...new Set(groupIds.map(clean).filter(Boolean))];

    if(!ids.length){
      notice("Select at least one shared group to restore.","error");
      return;
    }

    try{
      await api("/api/trip-split/groups/restore",{
        method:"POST",
        body:JSON.stringify({
          groupIds:ids
        })
      });

      ids.forEach(id=>state.selectedGroupIds.delete(id));
      state.selectedTripIds.clear();

      await load({silent:true});
      notice("Selected group(s) restored to Individual Trips.","ok");
    }catch(err){
      notice(err.message,"error");
    }
  }

  function restoreSelected(){
    const ids = [...state.selectedGroupIds];

    if(!ids.length){
      notice("Select at least one shared group to restore.","error");
      return;
    }

    restoreGroups(ids);
  }

  async function confirmGroups(groupIds){
    const groups =
      state.groups.filter(group=>groupIds.includes(group.groupId));

    if(!groups.length){
      notice("No shared group selected.","error");
      return;
    }

    try{
      const result = await api("/api/trip-split/confirm",{
        method:"POST",
        body:JSON.stringify({
          groups:groups.map(group=>({
            groupId:group.groupId
          }))
        })
      });

      state.selectedGroupIds.clear();
      state.selectedTripIds.clear();

      await load({silent:true});
      notice("Selected shared group(s) moved to Broker Review.","ok");
    }catch(err){
      notice(err.message,"error");
    }
  }

  async function confirmAll(){
    const payloadGroups = state.groups.map(group=>({
      groupId:group.groupId
    }));

    const ungroupedIds = [...state.selectedTripIds];

    if(!payloadGroups.length && !ungroupedIds.length){
      notice("Nothing is selected to confirm.","error");
      return;
    }

    try{
      $("confirmAllBtn").disabled = true;

      await api("/api/trip-split/confirm",{
        method:"POST",
        body:JSON.stringify({
          groups:payloadGroups,
          tripIds:ungroupedIds
        })
      });

      state.selectedTripIds.clear();
      state.selectedGroupIds.clear();

      await load({silent:true});
      notice("All selected trips were moved to Broker Review.","ok");
    }catch(err){
      notice(err.message,"error");
    }finally{
      $("confirmAllBtn").disabled = false;
    }
  }

  function openEdit(id){
    const trip = state.trips.find(t=>tripId(t) === id);
    if(!trip) return;

    state.editingId = id;

    $("editPickupTime").value =
      clean(trip.tripTime || trip.pickupTime);
    $("editAppointmentTime").value =
      clean(trip.appointmentTime);
    $("editPickup").value =
      clean(trip.pickup);
    $("editDropoff").value =
      clean(trip.dropoff);

    $("editDialog").showModal();
  }

  async function saveEdit(){
    if(!state.editingId) return;

    try{
      const result = await api(
        `/api/trip-split/trips/${encodeURIComponent(state.editingId)}`,
        {
          method:"PATCH",
          body:JSON.stringify({
            tripTime:$("editPickupTime").value,
            appointmentTime:$("editAppointmentTime").value,
            pickup:$("editPickup").value.trim(),
            dropoff:$("editDropoff").value.trim()
          })
        }
      );

      $("editDialog").close();
      state.editingId = "";
      state.selectedTripIds.clear();
      state.selectedGroupIds.clear();

      await load({silent:true});
      notice("Trip updated. Any affected shared group was restored.","ok");
    }catch(err){
      notice(err.message,"error");
    }
  }

  async function deleteTrip(id){
    const trip = state.trips.find(t=>tripId(t) === id);
    if(!trip) return;

    const ok = window.confirm(
      "Delete this broker trip? This cannot be undone."
    );

    if(!ok) return;

    try{
      await api(
        `/api/trip-split/trips/${encodeURIComponent(id)}`,
        {method:"DELETE"}
      );

      state.selectedTripIds.clear();
      state.selectedGroupIds.clear();

      await load({silent:true});
      notice("Trip deleted.","ok");
    }catch(err){
      notice(err.message,"error");
    }
  }

  async function load(options = {}){
    const silent = options?.silent === true;

    try{
      if(!silent){
        notice("Loading broker trips...","ok");
      }

      const data = await api("/api/trip-split/bootstrap");

      state.capabilities = data.capabilities || {};
      state.trips = Array.isArray(data.trips) ? data.trips : [];
      state.groups = Array.isArray(data.groups) ? data.groups : [];
      state.integrations = Array.isArray(data.integrations) ? data.integrations : [];
      state.today = clean(data.today);
      state.tomorrow = clean(data.tomorrow);
      state.confirmedCount = Number(data.confirmedCount || 0);

      if(state.capabilities?.brokerContractEnabled !== true){
        $("tripSplitPage")?.classList.add("hidden");
        notice("Broker Contract is not enabled for this company.","error");
        return;
      }

      if(!silent){
        notice("");
      }
      renderAll();
    }catch(err){
      notice(err.message,"error");
    }
  }

  function bind(){
    $("brokerFilter")?.addEventListener("change",renderAll);
    $("dayFilter")?.addEventListener("change",renderAll);
    $("selectAllBtn")?.addEventListener("click",selectAll);
    $("shareBtn")?.addEventListener("click",createShare);
    $("restoreBtn")?.addEventListener("click",restoreSelected);
    $("confirmAllBtn")?.addEventListener("click",confirmAll);

    $("closeEditBtn")?.addEventListener("click",()=>{
      $("editDialog").close();
      state.editingId = "";
    });

    $("saveEditBtn")?.addEventListener("click",saveEdit);
  }

  document.addEventListener("DOMContentLoaded",()=>{
    bind();
    load();
  });
})();
