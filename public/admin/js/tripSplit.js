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
    originalTrips:[],
    individualTrips:[],
    integrations:[],
    brokerFields:[],
    groups:[],
    excluded:[],
    selectedTripIds:new Set(),
    selectedIndividualIds:new Set(),
    selectedGroupIds:new Set(),
    capabilities:{},
    editingId:"",
    confirmedTrips:[],
    shareBaselines:[],
    confirmedCount:0,
    today:"",
    tomorrow:"",
    activeTab:"ORIGINAL"
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

  function displayTripNotes(trip){
    if(!trip){
      return "";
    }

    /*
      SOURCE NOTE PRIORITY:
      show the note received from the original company/source instead of
      internal/generated labels such as Automatic Shared.
    */
    const passengerNotes =
      Array.isArray(trip.passengers)
        ? trip.passengers
            .map(passenger=>
              clean(
                passenger?.notes ||
                passenger?.instructions ||
                passenger?.tripNotes ||
                passenger?.specialInstructions
              )
            )
            .filter(Boolean)
        : [];

    const uniquePassengerNotes =
      [...new Set(passengerNotes)];

    if(uniquePassengerNotes.length){
      return uniquePassengerNotes.join(" | ");
    }

    const raw =
      trip.rawPayload &&
      typeof trip.rawPayload === "object"
        ? trip.rawPayload
        : {};

    const rawPassengerNotes =
      Array.isArray(raw.passengers)
        ? raw.passengers
            .map(passenger=>
              clean(
                passenger?.notes ||
                passenger?.instructions ||
                passenger?.tripNotes ||
                passenger?.specialInstructions
              )
            )
            .filter(Boolean)
        : [];

    const uniqueRawPassengerNotes =
      [...new Set(rawPassengerNotes)];

    if(uniqueRawPassengerNotes.length){
      return uniqueRawPassengerNotes.join(" | ");
    }

    return clean(
      raw.companyNotes ||
      raw.facilityNotes ||
      raw.customerNotes ||
      raw.tripNotes ||
      raw.specialInstructions ||
      raw.driverInstructions ||
      raw.notes ||
      trip.brokerNotes ||
      trip.notes
    );
  }

  function groupedVisibleTrips(){
    const groups = new Map();

    filteredOriginalTrips().forEach(trip=>{
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

  function searchTextForTrip(trip){
    const stops =
      Array.isArray(trip?.stops)
        ? trip.stops.map(normalizeStopAddress).join(" ")
        : "";

    return [
      trip?.ghExternalTripNumber,
      trip?.tripNumber,
      trip?.externalTripId,
      trip?.brokerTripId,
      trip?.brokerCode,
      trip?.brokerName,
      trip?.clientName,
      trip?.clientPhone,
      trip?.memberId,
      trip?.pickup,
      trip?.dropoff,
      trip?.serviceName,
      trip?.serviceKey,
      displayTripNotes(trip),
      stops
    ]
      .map(clean)
      .join(" ")
      .toLowerCase();
  }

  function currentSearch(){
    return clean(
      $("tripSearch")?.value
    ).toLowerCase();
  }

  function matchesSearch(trip){
    const query = currentSearch();

    if(!query){
      return true;
    }

    return searchTextForTrip(trip).includes(query);
  }

  function matchesCurrentFilters(item){
    const broker = $("brokerFilter")?.value || "MIXED";
    const day = $("dayFilter")?.value || "ALL";
    const date = clean(item?.tripDate);

    if(day === "TODAY" && date !== state.today){
      return false;
    }

    if(day === "TOMORROW" && date !== state.tomorrow){
      return false;
    }

    if(broker !== "MIXED"){
      const directBroker = clean(item?.brokerCode);

      if(directBroker === broker){
        return true;
      }

      const memberTrips = Array.isArray(item?.trips)
        ? item.trips
        : [];

      return memberTrips.some(
        trip=>clean(trip?.brokerCode) === broker
      );
    }

    return true;
  }

  function filteredOriginalTrips(){
    return state.originalTrips.filter(trip=>{
      return (
        matchesCurrentFilters(trip) &&
        matchesSearch(trip)
      );
    });
  }

  function filteredIndividualTrips(){
    return state.individualTrips.filter(trip=>{
      return (
        matchesCurrentFilters(trip) &&
        matchesSearch(trip)
      );
    });
  }

  function visibleGroups(){
    const query = currentSearch();

    return state.groups.filter(group=>{
      if(!matchesCurrentFilters(group)){
        return false;
      }

      if(!query){
        return true;
      }

      const memberTrips =
        Array.isArray(group?.trips)
          ? group.trips
          : [];

      return (
        clean(group?.groupId).toLowerCase().includes(query) ||
        memberTrips.some(matchesSearch)
      );
    });
  }

  function visibleConfirmedTrips(){
    return state.confirmedTrips.filter(matchesCurrentFilters);
  }

  function sharedTripCountForCurrentFilter(){
    const broker = $("brokerFilter")?.value || "MIXED";

    return visibleGroups().reduce((total,group)=>{
      const trips = Array.isArray(group?.trips)
        ? group.trips
        : [];

      if(broker === "MIXED"){
        return total + (
          trips.length ||
          (Array.isArray(group?.tripIds) ? group.tripIds.length : 0)
        );
      }

      return total + trips.filter(
        trip=>clean(trip?.brokerCode) === broker
      ).length;
    },0);
  }

  function visibleTrips(){
    return filteredIndividualTrips();
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

  function brokerColumnFields(){
    return (Array.isArray(state.brokerFields) ? state.brokerFields : [])
      .filter(field=>field?.showColumn === true);
  }

  function brokerDynamicValue(source,key){
    const list = Array.isArray(source?.brokerDynamicData) ? source.brokerDynamicData : [];
    const row = list.find(item=>clean(item?.key) === clean(key));
    return row?.value ?? "";
  }

  function brokerDynamicCells(source){
    return brokerColumnFields()
      .map(field=>`<td class="broker-dynamic-cell">${escapeHtml(brokerDynamicValue(source,field.key) || "-")}</td>`)
      .join("");
  }

  function syncBrokerDynamicHeaders(){
    const apply = (selector,statusText)=>{
      const row = document.querySelector(selector);
      if(!row) return;
      row.querySelectorAll("[data-broker-dynamic-head]").forEach(el=>el.remove());
      const target = [...row.children].find(th=>clean(th.textContent) === statusText);
      if(!target) return;
      brokerColumnFields().forEach(field=>{
        const th=document.createElement("th");
        th.dataset.brokerDynamicHead=field.key;
        th.textContent=field.label || field.key;
        th.style.minWidth="110px";
        row.insertBefore(th,target);
      });
    };

    apply(".original-table thead tr","Status");
    apply(".individual-table thead tr","Status");
  }

  function renderOriginalTrips(){
    const body = $("originalTripRows");
    if(!body) return;

    const trips = filteredOriginalTrips();
    $("originalCount").textContent = trips.length;

    if(!trips.length){
      body.innerHTML =
        `<tr>
          <td colspan="${17 + brokerColumnFields().length}">
            <div class="empty">
              No original trips for this filter.
            </div>
          </td>
        </tr>`;
      return;
    }

    const groups = new Map();

    trips.forEach(trip=>{
      const date = clean(trip.tripDate) || "No Date";
      if(!groups.has(date)){
        groups.set(date,[]);
      }
      groups.get(date).push(trip);
    });

    const rows = [];

    for(const [date,dateTrips] of groups.entries()){
      rows.push(`
        <tr class="date-group-row">
          <td colspan="${17 + brokerColumnFields().length}">
            Trip Date: ${escapeHtml(date)}
          </td>
        </tr>
      `);

      dateTrips.forEach(trip=>{
        const id = tripId(trip);
        const confirmed = trip?.tripSplitConfirmed === true;
        const disabled = confirmed;
        const selected = state.selectedTripIds.has(id);

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

            <td>${escapeHtml(trip.brokerName || trip.brokerCode || "-")}</td>
            <td class="small-cell">${escapeHtml(trip.externalTripId || trip.brokerTripId || "-")}</td>
            <td class="small-cell">${escapeHtml(trip.tripTime || trip.pickupTime || "-")}</td>
            <td class="small-cell">${escapeHtml(trip.appointmentTime || "-")}</td>
            <td class="small-cell">${escapeHtml(trip.returnTime || "-")}</td>
            <td>${escapeHtml(trip.clientName || "-")}</td>
            <td>${escapeHtml(trip.clientPhone || "-")}</td>
            <td class="address-cell">${addressBox(trip.pickup)}</td>
            <td class="stops-cell">${stopBoxes(trip.stops)}</td>
            <td class="address-cell">${addressBox(trip.dropoff)}</td>
            <td>${escapeHtml(trip.serviceName || trip.serviceKey || "STANDARD")}</td>
            <td class="notes-cell">${escapeHtml(displayTripNotes(trip) || "-")}</td>

            ${brokerDynamicCells(trip)}

            <td>
              <span class="status ready">
                ${escapeHtml(
                  hasStops(trip)
                    ? "INDIVIDUAL • STOPS"
                    : tripStatus(trip)
                )}
              </span>
            </td>

            <td>${escapeHtml(trip.source || "BROKER")}</td>

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

    const groups = visibleGroups();

    $("groupCount").textContent = groups.length;

    if(!groups.length){
      wrap.innerHTML =
        `<div class="empty">No shared groups created yet.</div>`;
      return;
    }

    wrap.innerHTML = groups.map(group=>{
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
                  ${brokerColumnFields().map(field=>`<th>${escapeHtml(field.label || field.key)}</th>`).join("")}
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
                      ${brokerDynamicCells(trip)}
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

        renderGroups();
        renderStats();
      });
    });

  }

  function renderIndividualTrips(){
    const body = $("individualTripRows");
    if(!body) return;

    const trips = filteredIndividualTrips();

    if($("individualCount")){
      $("individualCount").textContent =
        trips.length;
    }

    if(!trips.length){
      body.innerHTML = `
        <tr>
          <td colspan="${12 + brokerColumnFields().length}">
            <div class="empty">
              No individual trips for this filter.
            </div>
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML =
      trips.map(trip=>{
        const id = tripId(trip);
        const selected =
          state.selectedIndividualIds.has(id);

        return `
          <tr class="${isReturnTrip(trip) ? "return-trip-row" : ""}">
            <td>
              <input
                type="checkbox"
                class="individual-check"
                data-id="${escapeHtml(id)}"
                ${selected ? "checked" : ""}
              />
            </td>

            <td class="individual-trip-number">
              ${escapeHtml(trip.ghExternalTripNumber || trip.tripNumber || "-")}
              ${
                isReturnTrip(trip)
                  ? `<span class="return-trip-badge">RETURN</span>`
                  : ""
              }
            </td>

            <td>${escapeHtml(trip.brokerName || trip.brokerCode || "-")}</td>
            <td>${escapeHtml(trip.externalTripId || trip.brokerTripId || "-")}</td>
            <td>${escapeHtml(trip.tripTime || trip.pickupTime || "-")}</td>
            <td>${escapeHtml(trip.appointmentTime || "-")}</td>
            <td>${escapeHtml(trip.clientName || "-")}</td>

            <td class="individual-address">
              ${addressBox(trip.pickup)}
            </td>

            <td class="individual-stops">
              ${stopBoxes(trip.stops)}
            </td>

            <td class="individual-address">
              ${addressBox(trip.dropoff)}
            </td>

            <td>${escapeHtml(trip.serviceName || trip.serviceKey || "STANDARD")}</td>

            ${brokerDynamicCells(trip)}

            <td>
              <span class="status ready">
                ${escapeHtml(tripStatus(trip))}
              </span>
            </td>

          </tr>
        `;
      }).join("");

    body.querySelectorAll(".individual-check").forEach(el=>{
      el.addEventListener("change",()=>{
        const id = clean(el.dataset.id);

        if(el.checked){
          state.selectedIndividualIds.add(id);
        }else{
          state.selectedIndividualIds.delete(id);
        }

        renderIndividualTrips();
        renderStats();
      });
    });

  }

  async function restoreIndividualTrips(ids){
    const tripIds =
      ids
        .map(clean)
        .filter(Boolean)
        .filter(id=>
          state.selectedIndividualIds.has(id)
        );

    if(!tripIds.length){
      notice(
        "Select at least one individual trip to restore.",
        "error"
      );
      return;
    }

    try{
      await api("/api/trip-split/individual/restore",{
        method:"POST",
        body:JSON.stringify({
          tripIds
        })
      });

      tripIds.forEach(id=>
        state.selectedIndividualIds.delete(id)
      );

      await load({silent:true});
      setActiveTab("ORIGINAL");

      notice(
        "Selected individual trip(s) restored to Original Trips.",
        "ok"
      );
    }catch(err){
      notice(err.message,"error");
    }
  }

  async function confirmIndividualTrips(ids){
    const tripIds =
      ids
        .map(clean)
        .filter(Boolean)
        .filter(id=>
          state.selectedIndividualIds.has(id)
        );

    if(!tripIds.length){
      notice(
        "Select at least one individual trip to confirm.",
        "error"
      );
      return;
    }

    try{
      await api("/api/trip-split/confirm",{
        method:"POST",
        body:JSON.stringify({
          tripIds
        })
      });

      tripIds.forEach(id=>
        state.selectedIndividualIds.delete(id)
      );

      await load({silent:true});

      notice(
        "Selected individual trip(s) moved to Broker Review.",
        "ok"
      );
    }catch(err){
      notice(err.message,"error");
    }
  }

  function restoreSelectedIndividuals(){
    const ids = [...state.selectedIndividualIds];
    restoreIndividualTrips(ids);
  }

  function confirmSelectedIndividuals(){
    const ids = [...state.selectedIndividualIds];
    confirmIndividualTrips(ids);
  }

  function renderStats(){
    const originals =
      filteredOriginalTrips();

    const individuals =
      filteredIndividualTrips();

    const groups =
      visibleGroups();

    const confirmedTrips =
      visibleConfirmedTrips();

    const sharedCount =
      sharedTripCountForCurrentFilter();

    $("statTotalTrips").textContent =
      originals.length +
      individuals.length +
      sharedCount;

    $("statNewTrips").textContent =
      originals.filter(
        trip=>trip?.isNewTrip === true
      ).length;

    $("statIndividual").textContent =
      individuals.length;

    $("statGroups").textContent =
      sharedCount;

    $("statSelected").textContent =
      state.selectedTripIds.size +
      state.selectedIndividualIds.size +
      state.selectedGroupIds.size;

    $("statConfirmed").textContent =
      confirmedTrips.length;

    const activeBrokers =
      new Set(
        originals
          .map(trip=>clean(
            trip?.brokerCode ||
            trip?.brokerName
          ))
          .filter(Boolean)
      ).size;

    if($("statActiveBrokers")){
      $("statActiveBrokers").textContent =
        activeBrokers;
    }

    const selectedCount =
      state.activeTab === "INDIVIDUAL"
        ? state.selectedIndividualIds.size
        : state.activeTab === "SHARED"
          ? state.selectedGroupIds.size
          : state.selectedTripIds.size;

    const restoreButton =
      $("restoreBtn");

    if(restoreButton){
      restoreButton.disabled =
        state.activeTab === "ORIGINAL" ||
        selectedCount < 1;
    }

    const confirmButton =
      $("confirmAllBtn");

    if(confirmButton){
      confirmButton.disabled =
        selectedCount < 1;
    }

    const shareButton =
      $("shareBtn");

    if(shareButton){
      const eligibleSelected =
        state.activeTab === "ORIGINAL"
          ? filteredOriginalTrips()
              .filter(availableForShare)
              .filter(trip=>
                state.selectedTripIds.has(
                  tripId(trip)
                )
              )
              .length
          : 0;

      shareButton.disabled =
        state.activeTab !== "ORIGINAL" ||
        eligibleSelected < 2;
    }

    const selectButton =
      $("selectAllBtn");

    if(selectButton){
      let ids = [];
      let selectedSet = null;

      if(state.activeTab === "INDIVIDUAL"){
        ids =
          filteredIndividualTrips()
            .map(trip=>tripId(trip))
            .filter(Boolean);
        selectedSet =
          state.selectedIndividualIds;
      }else if(state.activeTab === "SHARED"){
        ids =
          visibleGroups()
            .map(group=>clean(group.groupId))
            .filter(Boolean);
        selectedSet =
          state.selectedGroupIds;
      }else{
        ids =
          filteredOriginalTrips()
            .filter(
              trip=>
                trip?.tripSplitConfirmed !== true
            )
            .map(trip=>tripId(trip))
            .filter(Boolean);
        selectedSet =
          state.selectedTripIds;
      }

      const allSelected =
        ids.length > 0 &&
        ids.every(id=>selectedSet.has(id));

      selectButton.textContent =
        allSelected
          ? "Unselect All"
          : "Select All";
    }
  }

  function sharedFeatureEnabled(){
    return (
      state.capabilities?.sharedServiceEnabled === true ||
      state.capabilities?.sharedServiceFound === true
    );
  }

  function setActiveTab(tab){
    let next = clean(tab).toUpperCase();

    if(
      next === "SHARED" &&
      !sharedFeatureEnabled()
    ){
      next = "ORIGINAL";
    }

    if(!["ORIGINAL","INDIVIDUAL","SHARED"].includes(next)){
      next = "ORIGINAL";
    }

    state.activeTab = next;

    document
      .querySelectorAll(".split-tab")
      .forEach(btn=>{
        btn.classList.toggle(
          "active",
          clean(btn.dataset.tab).toUpperCase() === next
        );
      });

    document
      .querySelectorAll("[data-trip-panel]")
      .forEach(panel=>{
        panel.classList.toggle(
          "trip-panel-hidden",
          clean(panel.dataset.tripPanel).toUpperCase() !== next
        );
      });

    renderStats();
  }

  function updateTabsVisibility(){
    const sharedAllowed =
      sharedFeatureEnabled();

    $("sharedTabBtn")
      ?.classList
      .toggle(
        "hidden",
        !sharedAllowed
      );

    $("splitTabs")
      ?.classList
      .toggle(
        "two-tabs",
        !sharedAllowed
      );

    if(
      !sharedAllowed &&
      state.activeTab === "SHARED"
    ){
      state.activeTab = "ORIGINAL";
    }

    setActiveTab(
      state.activeTab
    );

    const withStops =
      individuals.filter(
        trip=>hasStops(trip)
      ).length;

    if($("statWithStops")){
      $("statWithStops").textContent =
        withStops;
    }
  }

  function renderAll(){
    renderBrokerFilter();
    renderOriginalTrips();
    renderGroups();
    renderIndividualTrips();
    renderStats();
    updateTabsVisibility();

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
      Restore is a common top action for Individual and Shared tabs.
      It must remain visible even when Shared service is disabled.
    */
    $("restoreBtn")
      ?.classList
      .remove(
        "hidden"
      );
  }

  function selectAll(){

    let ids = [];
    let selectedSet = null;

    if(state.activeTab === "INDIVIDUAL"){
      ids =
        filteredIndividualTrips()
          .map(trip=>tripId(trip))
          .filter(Boolean);

      selectedSet =
        state.selectedIndividualIds;

    }else if(state.activeTab === "SHARED"){
      ids =
        visibleGroups()
          .map(group=>clean(group.groupId))
          .filter(Boolean);

      selectedSet =
        state.selectedGroupIds;

    }else{
      ids =
        filteredOriginalTrips()
          .filter(
            trip=>
              trip?.tripSplitConfirmed !== true
          )
          .map(trip=>tripId(trip))
          .filter(Boolean);

      selectedSet =
        state.selectedTripIds;
    }

    const allSelected =
      ids.length > 0 &&
      ids.every(id=>selectedSet.has(id));

    if(allSelected){
      ids.forEach(id=>selectedSet.delete(id));
    }else{
      ids.forEach(id=>selectedSet.add(id));
    }

    renderAll();
  }

  async function createShare(){
    const eligibleIds =
      new Set(
        filteredOriginalTrips()
          .filter(availableForShare)
          .map(trip=>tripId(trip))
      );

    const ids =
      [...state.selectedTripIds]
        .filter(id=>eligibleIds.has(id));

    if(state.activeTab !== "ORIGINAL"){
      notice("Share is available from Original Trips only.","error");
      return;
    }

    if(ids.length < 2){
      notice("Select at least two eligible original trips to share.","error");
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
      state.selectedIndividualIds.clear();
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

    if(state.activeTab === "INDIVIDUAL"){
      restoreSelectedIndividuals();
      return;
    }

    if(state.activeTab === "SHARED"){
      const ids =
        [...state.selectedGroupIds];

      if(!ids.length){
        notice("Select at least one shared group to restore.","error");
        return;
      }

      restoreGroups(ids);
      return;
    }

    notice(
      "Restore is available from Individual Trips or Shared Group Trips.",
      "error"
    );
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

    if(state.activeTab === "INDIVIDUAL"){
      await confirmSelectedIndividuals();
      return;
    }

    if(state.activeTab === "SHARED"){
      const ids =
        [...state.selectedGroupIds];

      if(!ids.length){
        notice("Select at least one shared group to confirm.","error");
        return;
      }

      await confirmGroups(ids);
      return;
    }

    const tripIds =
      [...state.selectedTripIds]
        .filter(Boolean);

    if(!tripIds.length){
      notice("Select at least one original trip to confirm.","error");
      return;
    }

    try{
      $("confirmAllBtn").disabled = true;

      await api("/api/trip-split/confirm",{
        method:"POST",
        body:JSON.stringify({
          tripIds
        })
      });

      state.selectedTripIds.clear();

      await load({silent:true});

      notice(
        "Selected original trip(s) moved to Broker Review as Individual Trips.",
        "ok"
      );
    }catch(err){
      notice(err.message,"error");
    }finally{
      $("confirmAllBtn").disabled = false;
    }
  }

  function ensureEditDialogLayout(){
    const dialog =
      $("editDialog");

    if(!dialog){
      return;
    }

    if(
      dialog.dataset.tripSplitEditReady ===
      "true"
    ){
      return;
    }

    dialog.dataset.tripSplitEditReady =
      "true";

    dialog.classList.add(
      "trip-split-edit-dialog"
    );

    dialog.innerHTML = `
      <div class="trip-edit-shell">

        <div class="trip-edit-head">
          <div>
            <div class="trip-edit-title">
              Edit Trip
            </div>
            <div class="trip-edit-subtitle">
              Update trip information before Broker Review
            </div>
          </div>

          <button
            id="closeEditBtn"
            class="trip-edit-close"
            type="button"
          >
            Close
          </button>
        </div>

        <div class="trip-edit-body">

          <div class="trip-edit-grid">

            <div class="trip-edit-field">
              <label for="editPickupTime">
                Pickup Time
              </label>
              <input
                id="editPickupTime"
                type="time"
              />
            </div>

            <div class="trip-edit-field">
              <label for="editAppointmentTime">
                Appointment Time
              </label>
              <input
                id="editAppointmentTime"
                type="time"
              />
            </div>

            <div class="trip-edit-field trip-edit-full">
              <label for="editPickup">
                Pickup
              </label>
              <input
                id="editPickup"
                type="text"
                autocomplete="off"
              />
            </div>

            <div class="trip-edit-field trip-edit-full">
              <div class="trip-edit-stops-head">
                <label>
                  Stops
                </label>

                <button
                  id="editAddStopBtn"
                  class="trip-edit-add-stop"
                  type="button"
                >
                  + Add Stop
                </button>
              </div>

              <div
                id="editStopRows"
                class="trip-edit-stop-list"
              ></div>
            </div>

            <div class="trip-edit-field trip-edit-full">
              <label for="editDropoff">
                Drop-off
              </label>
              <input
                id="editDropoff"
                type="text"
                autocomplete="off"
              />
            </div>

          </div>

          <div class="trip-edit-actions">
            <button
              id="cancelEditBtn"
              class="trip-edit-cancel"
              type="button"
            >
              Cancel
            </button>

            <button
              id="saveEditBtn"
              class="trip-edit-save"
              type="button"
            >
              Save Changes
            </button>
          </div>

        </div>

      </div>
    `;

    if(!$("tripSplitEditStyles")){
      const style =
        document.createElement(
          "style"
        );

      style.id =
        "tripSplitEditStyles";

      style.textContent = `
        .trip-split-edit-dialog{
          width:min(820px,calc(100vw - 28px));
          max-width:820px;
          padding:0;
          border:0;
          border-radius:18px;
          overflow:hidden;
          box-shadow:0 24px 70px rgba(15,23,42,.28);
          background:#fff;
        }

        .trip-split-edit-dialog::backdrop{
          background:rgba(15,23,42,.42);
          backdrop-filter:blur(2px);
        }

        .trip-edit-shell{
          width:100%;
          background:#fff;
        }

        .trip-edit-head{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:18px;
          padding:22px 24px 18px;
          border-bottom:1px solid #e5e7eb;
          background:#f8fafc;
        }

        .trip-edit-title{
          font-size:20px;
          font-weight:800;
          color:#0f172a;
          line-height:1.2;
        }

        .trip-edit-subtitle{
          margin-top:5px;
          font-size:12px;
          color:#64748b;
        }

        .trip-edit-close{
          min-width:74px;
          height:38px;
          border:1px solid #d1d5db;
          border-radius:9px;
          background:#fff;
          color:#334155;
          font-weight:700;
          cursor:pointer;
        }

        .trip-edit-body{
          padding:22px 24px 24px;
        }

        .trip-edit-grid{
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:16px;
        }

        .trip-edit-field{
          min-width:0;
        }

        .trip-edit-full{
          grid-column:1 / -1;
        }

        .trip-edit-field label{
          display:block;
          margin:0 0 7px;
          font-size:12px;
          font-weight:800;
          color:#334155;
        }

        .trip-edit-field input{
          width:100%;
          box-sizing:border-box;
          min-height:44px;
          padding:10px 12px;
          border:1px solid #cbd5e1;
          border-radius:9px;
          background:#fff;
          color:#0f172a;
          font:inherit;
          outline:none;
        }

        .trip-edit-field input:focus{
          border-color:#64748b;
          box-shadow:0 0 0 3px rgba(100,116,139,.12);
        }

        .trip-edit-stops-head{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin-bottom:8px;
        }

        .trip-edit-stops-head label{
          margin:0;
        }

        .trip-edit-add-stop{
          height:34px;
          padding:0 14px;
          border:0;
          border-radius:8px;
          background:#334155;
          color:#fff;
          font-size:12px;
          font-weight:800;
          cursor:pointer;
        }

        .trip-edit-add-stop:disabled{
          opacity:.5;
          cursor:not-allowed;
        }

        .trip-edit-stop-list{
          display:flex;
          flex-direction:column;
          gap:8px;
        }

        .trip-edit-stop-row{
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          gap:8px;
          align-items:center;
        }

        .trip-edit-stop-remove{
          min-width:76px;
          height:44px;
          padding:0 12px;
          border:1px solid #fecaca;
          border-radius:9px;
          background:#fff1f2;
          color:#b91c1c;
          font-size:12px;
          font-weight:800;
          cursor:pointer;
        }

        .trip-edit-no-stops{
          padding:11px 12px;
          border:1px dashed #cbd5e1;
          border-radius:9px;
          background:#f8fafc;
          color:#64748b;
          font-size:12px;
        }

        .trip-edit-actions{
          display:flex;
          justify-content:flex-end;
          gap:10px;
          margin-top:22px;
          padding-top:18px;
          border-top:1px solid #e5e7eb;
        }

        .trip-edit-cancel,
        .trip-edit-save{
          min-width:110px;
          height:42px;
          border-radius:9px;
          font-weight:800;
          cursor:pointer;
        }

        .trip-edit-cancel{
          border:1px solid #d1d5db;
          background:#fff;
          color:#334155;
        }

        .trip-edit-save{
          border:0;
          background:#15803d;
          color:#fff;
        }

        @media (max-width:640px){
          .trip-edit-head{
            padding:18px 16px 14px;
          }

          .trip-edit-body{
            padding:18px 16px;
          }

          .trip-edit-grid{
            grid-template-columns:1fr;
          }

          .trip-edit-full{
            grid-column:auto;
          }

          .trip-edit-actions{
            flex-direction:column-reverse;
          }

          .trip-edit-cancel,
          .trip-edit-save{
            width:100%;
          }
        }
      `;

      document.head.appendChild(
        style
      );
    }
  }

  function readEditStops(){
    return [
      ...document.querySelectorAll(
        "#editStopRows .edit-stop-input"
      )
    ]
      .map(input=>clean(input.value))
      .filter(Boolean)
      .slice(0,5);
  }

  function renderEditStops(stops=[]){
    ensureEditDialogLayout();

    const rows =
      $("editStopRows");

    if(!rows){
      return;
    }

    const values =
      Array.isArray(stops)
        ? stops
            .map(value=>
              typeof value === "string"
                ? clean(value)
                : normalizeStopAddress(value)
            )
            .slice(0,5)
        : [];

    if(!values.length){
      rows.innerHTML = `
        <div class="trip-edit-no-stops">
          No stops added.
        </div>
      `;
    }else{
      rows.innerHTML =
        values
          .map((value,index)=>`
            <div class="trip-edit-stop-row">
              <input
                class="edit-stop-input"
                type="text"
                value="${escapeHtml(value)}"
                placeholder="Stop ${index + 1} address"
                autocomplete="off"
              />

              <button
                class="trip-edit-stop-remove"
                type="button"
                data-index="${index}"
              >
                Remove
              </button>
            </div>
          `)
          .join("");
    }

    rows
      .querySelectorAll(
        ".trip-edit-stop-remove"
      )
      .forEach(button=>{
        button.addEventListener(
          "click",
          ()=>{
            const index =
              Number(
                button.dataset.index
              );

            const current =
              [
                ...rows.querySelectorAll(
                  ".edit-stop-input"
                )
              ]
                .map(input=>clean(input.value));

            current.splice(
              index,
              1
            );

            renderEditStops(
              current
            );
          }
        );
      });

    const addButton =
      $("editAddStopBtn");

    if(addButton){
      addButton.disabled =
        values.length >= 5;
    }
  }

  function addEditStop(){
    const current =
      [
        ...document.querySelectorAll(
          "#editStopRows .edit-stop-input"
        )
      ]
        .map(input=>clean(input.value));

    if(current.length >= 5){
      notice(
        "Maximum 5 stops.",
        "error"
      );
      return;
    }

    renderEditStops([
      ...current,
      ""
    ]);

    const inputs =
      document.querySelectorAll(
        "#editStopRows .edit-stop-input"
      );

    inputs[
      inputs.length - 1
    ]?.focus();
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

    renderEditStops(
      Array.isArray(trip.stops)
        ? trip.stops
        : []
    );

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
            dropoff:$("editDropoff").value.trim(),
            stops:
              readEditStops()
                .map((address,index)=>({
                  address,
                  sequence:index + 1
                }))
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
      state.brokerFields = Array.isArray(data.brokerFields) ? data.brokerFields : [];
      state.originalTrips =
        Array.isArray(data.originalTrips)
          ? data.originalTrips
          : [];

      state.individualTrips =
        Array.isArray(data.individualTrips)
          ? data.individualTrips
          : [];

      state.trips = [
        ...state.originalTrips,
        ...state.individualTrips
      ];
      state.groups = Array.isArray(data.groups) ? data.groups : [];
      state.integrations = Array.isArray(data.integrations) ? data.integrations : [];
      state.today = clean(data.today);
      state.tomorrow = clean(data.tomorrow);
      state.confirmedTrips = Array.isArray(data.confirmedTrips)
        ? data.confirmedTrips
        : [];
      state.shareBaselines = Array.isArray(data.shareBaselines)
        ? data.shareBaselines
        : [];
      state.confirmedCount = state.confirmedTrips.length;

      syncBrokerDynamicHeaders();

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
    ensureEditDialogLayout();

    document
      .querySelectorAll(".split-tab")
      .forEach(btn=>{
        btn.addEventListener("click",()=>{
          setActiveTab(btn.dataset.tab);
        });
      });

    $("brokerFilter")?.addEventListener("change",renderAll);
    $("dayFilter")?.addEventListener("change",renderAll);
    $("tripSearch")?.addEventListener("input",renderAll);
    $("selectAllBtn")?.addEventListener("click",selectAll);
    $("shareBtn")?.addEventListener("click",createShare);
    $("restoreBtn")?.addEventListener("click",restoreSelected);
    $("confirmAllBtn")?.addEventListener("click",confirmAll);

    const closeEditDialog = ()=>{
      $("editDialog")?.close();
      state.editingId = "";
    };

    $("closeEditBtn")
      ?.addEventListener(
        "click",
        closeEditDialog
      );

    $("cancelEditBtn")
      ?.addEventListener(
        "click",
        closeEditDialog
      );

    $("editAddStopBtn")
      ?.addEventListener(
        "click",
        addEditStop
      );

    $("saveEditBtn")
      ?.addEventListener(
        "click",
        saveEdit
      );
  }

  document.addEventListener("DOMContentLoaded",()=>{
    bind();
    load();
  });
})();