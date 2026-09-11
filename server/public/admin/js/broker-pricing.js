"use strict";

/*
DESTINATION PATH:
server/public/admin/js/broker-pricing.js
*/

(() => {

  const API_URL =
    "/api/broker-pricing";

  const token =
    sessionStorage.getItem("token") ||
    sessionStorage.getItem("staffToken") ||
    localStorage.getItem("token") ||
    "";

  const role =
    String(
      sessionStorage.getItem("role") ||
      localStorage.getItem("role") ||
      ""
    ).toUpperCase();

  const adminName =
    sessionStorage.getItem("name") ||
    localStorage.getItem("name") ||
    sessionStorage.getItem("fullName") ||
    localStorage.getItem("fullName") ||
    sessionStorage.getItem("username") ||
    localStorage.getItem("username") ||
    role ||
    "admin";

  const state = {
    brokers:[],
    selectedBrokerId:"",
    draftActive:false,
    draftServices:[],
    editingServiceKey:""
  };

  const $ =
    id=>
      document.getElementById(id);

  function clean(value){
    return String(value ?? "").trim();
  }

  function upper(value){
    return clean(value).toUpperCase();
  }

  function num(value){
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function bool(value){
    return (
      value === true ||
      String(value).toLowerCase() === "true" ||
      String(value) === "1"
    );
  }

  function money(value){
    return num(value).toFixed(2);
  }

  function esc(value){
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function authHeaders(){
    return {
      "Content-Type":"application/json",
      Authorization:
        `Bearer ${token}`
    };
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
            ...authHeaders(),
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

  function normalizeServiceCode(value){

    const compact =
      upper(value)
        .replace(/[_\s-]+/g,"");

    if(
      compact === "ST" ||
      compact === "STANDARD" ||
      compact.includes("STANDARD")
    ) return "ST";

    if(
      compact === "WH" ||
      compact === "WC" ||
      compact.includes("WHEELCHAIR")
    ) return "WH";

    if(
      compact === "SH" ||
      compact === "SHARED" ||
      compact.includes("SHARED")
    ) return "SH";

    if(
      compact === "LM" ||
      compact === "LIMO" ||
      compact.includes("LIMO")
    ) return "LM";

    if(
      compact === "TX" ||
      compact === "TAXI" ||
      compact.includes("TAXI")
    ) return "TX";

    if(
      compact === "XL" ||
      compact.startsWith("XL")
    ) return "XL";

    return upper(value);
  }

  function selectedBroker(){
    return state.brokers.find(
      broker=>
        String(broker._id) ===
        String(
          state.selectedBrokerId
        )
    );
  }

  function loadDraft(broker){

    const pricing =
      broker?.pricing ||
      {};

    state.draftActive =
      pricing.active === true;

    state.draftServices =
      Array.isArray(
        pricing.services
      )
        ? pricing.services.map(
            service=>({
              ...service,
              serviceKey:
                normalizeServiceCode(
                  service.serviceKey
                )
            })
          )
        : [];

    state.editingServiceKey = "";
  }

  function renderBrokerList(){

    const box =
      $("brokerList");

    if(!box) return;

    const q =
      clean(
        $("brokerSearch")?.value
      ).toLowerCase();

    const list =
      state.brokers.filter(
        broker=>
          clean(
            broker.brokerName
          )
            .toLowerCase()
            .includes(q) ||
          clean(
            broker.brokerCode
          )
            .toLowerCase()
            .includes(q)
      );

    if(!list.length){
      box.innerHTML =
        `<div class="empty">No brokers found.</div>`;
      return;
    }

    box.innerHTML =
      list.map(
        broker=>{

          const active =
            broker?.pricing
              ?.active === true;

          const selected =
            String(
              broker._id
            ) ===
            String(
              state.selectedBrokerId
            );

          return `
            <div
              class="broker-item ${selected ? "active" : ""}"
              data-broker-id="${esc(broker._id)}"
            >
              <div class="broker-row">
                <div>
                  <div class="broker-name">
                    ${esc(broker.brokerName || broker.brokerCode)}
                  </div>
                  <div class="broker-code">
                    ${esc(broker.brokerCode || "-")}
                  </div>
                </div>

                <span class="badge ${active ? "active" : "disabled"}">
                  ${active ? "ACTIVE" : "DISABLED"}
                </span>
              </div>
            </div>
          `;
        }
      ).join("");

    box
      .querySelectorAll(
        "[data-broker-id]"
      )
      .forEach(
        row=>{

          row.addEventListener(
            "click",
            ()=>{

              state.selectedBrokerId =
                row.dataset.brokerId ||
                "";

              const broker =
                selectedBroker();

              if(broker){
                loadDraft(broker);
              }

              render();
            }
          );
        }
      );
  }

  function selectInput(
    idx,
    field,
    label,
    value,
    options,
    disabled
  ){

    return `
      <div class="field">
        <label>${esc(label)}</label>

        <select
          ${disabled ? "disabled" : ""}
          data-field="${esc(field)}"
          data-index="${idx}"
        >
          ${
            options.map(
              option=>`
                <option
                  value="${esc(option.value)}"
                  ${
                    String(option.value) ===
                    String(value)
                      ? "selected"
                      : ""
                  }
                >
                  ${esc(option.label)}
                </option>
              `
            ).join("")
          }
        </select>
      </div>
    `;
  }

  function numberInput(
    idx,
    field,
    label,
    value,
    disabled,
    integer=false
  ){

    return `
      <div class="field">
        <label>${esc(label)}</label>

        <input
          type="number"
          min="0"
          step="${integer ? "1" : "0.01"}"
          value="${
            integer
              ? num(value)
              : money(value)
          }"
          ${disabled ? "disabled" : ""}
          data-field="${esc(field)}"
          data-index="${idx}"
        >
      </div>
    `;
  }

  function serviceCard(
    service,
    idx
  ){

    const key =
      normalizeServiceCode(
        service.serviceKey
      );

    const editing =
      state.draftActive &&
      state.editingServiceKey ===
        key;

    const locked =
      !editing;

    const shared =
      key === "SH" ||
      service.shared === true;

    return `
      <article class="service-card ${
        !state.draftActive
          ? "disabled"
          : editing
            ? "editing"
            : ""
      }">

        <div class="service-head">
          <div>
            <div class="service-title">
              ${esc(service.serviceName || key)}
            </div>

            <div class="service-sub">
              ${
                !state.draftActive
                  ? "Broker Pricing • Disabled"
                  : editing
                    ? "Broker Pricing • Editing"
                    : "Broker Pricing • Locked"
              }
            </div>
          </div>

          <div class="service-code">
            ${esc(key)}
          </div>
        </div>

        <div class="service-enable-row">
          <span>Service Access</span>

          <select
            data-field="enabled"
            data-index="${idx}"
            ${locked || !state.draftActive ? "disabled" : ""}
          >
            <option
              value="true"
              ${service.enabled === true ? "selected" : ""}
            >
              ENABLED
            </option>

            <option
              value="false"
              ${service.enabled !== true ? "selected" : ""}
            >
              DISABLED
            </option>
          </select>
        </div>

        <div class="form-grid">

          ${selectInput(
            idx,
            "pricingMode",
            "Pricing Mode",
            shared
              ? "SHARED"
              : upper(
                  service.pricingMode ||
                  "MILE"
                ),
            shared
              ? [
                  {
                    value:"SHARED",
                    label:"Shared"
                  }
                ]
              : [
                  {
                    value:"MILE",
                    label:"Per Mile"
                  },
                  {
                    value:"HOURLY",
                    label:"Hourly"
                  }
                ],
            locked ||
            !state.draftActive
          )}

          ${numberInput(idx,"baseFare","Base Fare",service.baseFare,locked || !state.draftActive)}
          ${numberInput(idx,"includedMiles","Included Miles",service.includedMiles,locked || !state.draftActive)}
          ${numberInput(idx,"perMile","Per Mile",service.perMile,locked || !state.draftActive)}
          ${numberInput(idx,"hourlyRate","Hourly Rate",service.hourlyRate,locked || !state.draftActive)}

          ${selectInput(
            idx,
            "hourlyBillingMode",
            "Hourly Billing",
            upper(
              service.hourlyBillingMode ||
              "FULL"
            ),
            [
              {value:"FULL",label:"Full Hour"},
              {value:"QUARTER",label:"Quarter Hour"}
            ],
            locked ||
            !state.draftActive
          )}

          ${
            key === "LM"
              ? `
                  <div class="policy-title">
                    Limousine Initial Time Package
                  </div>

                  ${numberInput(
                    idx,
                    "initialDurationMinutes",
                    "Initial Duration (Minutes)",
                    service.initialDurationMinutes,
                    locked ||
                    !state.draftActive,
                    true
                  )}

                  ${numberInput(
                    idx,
                    "initialPrice",
                    "Initial Price",
                    service.initialPrice,
                    locked ||
                    !state.draftActive
                  )}
                `
              : ""
          }

          ${numberInput(idx,"stopFee","Stop Fee",service.stopFee,locked || !state.draftActive)}
          ${numberInput(idx,"noShowFee","No Show Fee",service.noShowFee,locked || !state.draftActive)}

          ${
            shared
              ? numberInput(
                  idx,
                  "sharedPrice",
                  "Shared Price Per Passenger",
                  service.sharedPrice,
                  locked ||
                  !state.draftActive
                )
              : ""
          }

          <div class="policy-title">
            Broker Cancellation Policy
          </div>

          ${selectInput(
            idx,
            "cancelEnabled",
            "Cancellation Fee",
            String(
              service.cancelEnabled !== false
            ),
            [
              {value:"true",label:"ENABLED"},
              {value:"false",label:"DISABLED"}
            ],
            locked ||
            !state.draftActive
          )}

          ${numberInput(idx,"warningMinutes","Warning Minutes",service.warningMinutes,locked || !state.draftActive,true)}
          ${numberInput(idx,"cancelFee","Cancel Fee",service.cancelFee,locked || !state.draftActive)}

          <div class="policy-title">
            Add Stop Policy
          </div>

          ${
            shared
              ? `
                  <div class="shared-lock">
                    Add Stop is disabled for Shared service.
                  </div>
                `
              : `
                  ${selectInput(
                    idx,
                    "addStopEnabled",
                    "Add Stop",
                    String(
                      bool(
                        service.addStopEnabled
                      )
                    ),
                    [
                      {value:"true",label:"ENABLED"},
                      {value:"false",label:"DISABLED"}
                    ],
                    locked ||
                    !state.draftActive
                  )}

                  ${selectInput(
                    idx,
                    "addStopCustomTimeEnabled",
                    "Custom Time",
                    String(
                      bool(
                        service.addStopCustomTimeEnabled
                      )
                    ),
                    [
                      {value:"true",label:"ENABLED"},
                      {value:"false",label:"DISABLED"}
                    ],
                    locked ||
                    !state.draftActive
                  )}

                  ${numberInput(
                    idx,
                    "addStopCutoffMinutes",
                    "Cutoff Minutes",
                    service.addStopCutoffMinutes,
                    locked ||
                    !state.draftActive,
                    true
                  )}
                `
          }

        </div>

        <div class="card-actions">

          ${
            !state.draftActive
              ? `
                  <button
                    class="btn btn-locked"
                    type="button"
                    disabled
                  >
                    LOCKED
                  </button>
                `
              : editing
                ? `
                    <button
                      class="btn btn-save"
                      type="button"
                      data-save-service="${idx}"
                    >
                      SAVE
                    </button>
                  `
                : `
                    <button
                      class="btn btn-edit"
                      type="button"
                      data-edit-service="${idx}"
                    >
                      EDIT
                    </button>
                  `
          }

        </div>

      </article>
    `;
  }

  function renderMain(){

    const box =
      $("mainContent");

    if(!box) return;

    const broker =
      selectedBroker();

    if(!broker){
      box.innerHTML =
        `<div class="empty">Select a broker from the left.</div>`;
      return;
    }

    box.innerHTML = `
      <div class="selected-box">
        <div>
          <div class="selected-name">
            ${esc(broker.brokerName || broker.brokerCode)}
          </div>

          <div class="page-sub">
            Broker Code: ${esc(broker.brokerCode || "-")}
          </div>
        </div>

        <span class="badge ${state.draftActive ? "active" : "disabled"}">
          ${state.draftActive ? "ACTIVE" : "DISABLED"}
        </span>
      </div>

      <div class="toggle-row">
        <div>
          <div class="toggle-title">
            Broker Pricing
          </div>

          <div class="toggle-sub">
            This pricing profile is independent from all other pricing areas.
          </div>
        </div>

        <label class="switch">
          <input
            id="brokerPricingToggle"
            type="checkbox"
            ${state.draftActive ? "checked" : ""}
          >
          <span class="slider"></span>
        </label>
      </div>

      <div class="notice">
        ${
          state.draftActive
            ? "Broker pricing is active. Click EDIT on any service card to configure or enable it for this broker."
            : "Broker pricing is disabled. Turn it on, then click EDIT on the service cards you want to configure."
        }
      </div>

      <div class="services-grid">
        ${
          state.draftServices.length
            ? state.draftServices
                .map(
                  serviceCard
                )
                .join("")
            : `<div class="empty">No broker pricing services found.</div>`
        }
      </div>
    `;

    bindMainEvents();
  }

  function render(){
    renderBrokerList();
    renderMain();
  }

  function updateField(
    idx,
    field,
    value
  ){

    const service =
      state.draftServices[idx];

    if(!service) return;

    const key =
      normalizeServiceCode(
        service.serviceKey
      );

    if(
      state.editingServiceKey !==
      key
    ){
      return;
    }

    if([
      "baseFare",
      "includedMiles",
      "perMile",
      "hourlyRate",
      "initialDurationMinutes",
      "initialPrice",
      "stopFee",
      "noShowFee",
      "sharedPrice",
      "warningMinutes",
      "cancelFee",
      "addStopCutoffMinutes"
    ].includes(field)){

      service[field] =
        num(value);

      return;
    }

    if([
      "enabled",
      "cancelEnabled",
      "addStopEnabled",
      "addStopCustomTimeEnabled"
    ].includes(field)){

      service[field] =
        bool(value);

      return;
    }

    service[field] =
      value;
  }

  function bindMainEvents(){

    $("brokerPricingToggle")
      ?.addEventListener(
        "change",
        async e=>{

          const previous =
            state.draftActive;

          state.draftActive =
            e.target.checked === true;

          state.editingServiceKey = "";

          render();

          const ok =
            await savePricing(
              true
            );

          if(!ok){
            state.draftActive =
              previous;
            render();
          }
        }
      );

    document
      .querySelectorAll(
        "[data-edit-service]"
      )
      .forEach(
        button=>{

          button.addEventListener(
            "click",
            ()=>{

              const idx =
                Number(
                  button.dataset
                    .editService
                );

              const service =
                state.draftServices[
                  idx
                ];

              if(!service) return;

              state.editingServiceKey =
                normalizeServiceCode(
                  service.serviceKey
                );

              renderMain();
            }
          );
        }
      );

    document
      .querySelectorAll(
        "[data-save-service]"
      )
      .forEach(
        button=>{

          button.addEventListener(
            "click",
            async ()=>{

              const ok =
                await savePricing();

              if(ok){
                state.editingServiceKey = "";
                render();
                alert(
                  "Broker service pricing saved."
                );
              }
            }
          );
        }
      );

    document
      .querySelectorAll(
        "[data-field][data-index]"
      )
      .forEach(
        input=>{

          const eventName =
            input.tagName === "SELECT"
              ? "change"
              : "input";

          input.addEventListener(
            eventName,
            ()=>{

              updateField(
                Number(
                  input.dataset.index
                ),
                input.dataset.field,
                input.value
              );
            }
          );
        }
      );
  }

  async function savePricing(
    silent=false
  ){

    const broker =
      selectedBroker();

    if(!broker){
      return false;
    }

    try{

      const data =
        await api(
          `${API_URL}/${encodeURIComponent(broker._id)}`,
          {
            method:"PATCH",
            body:
              JSON.stringify({
                active:
                  state.draftActive,
                services:
                  state.draftServices,
                updatedBy:
                  adminName
              })
          }
        );

      broker.pricing =
        data.pricing;

      loadDraft(broker);

      render();

      return true;

    }catch(err){

      console.log(err);

      if(!silent){
        alert(
          err.message ||
          "Failed to save broker pricing."
        );
      }

      return false;
    }
  }

  async function load(){

    if(!token){
      window.location.href =
        "/login.html";
      return;
    }

    if(role !== "SUPER_ADMIN"){
      window.location.href =
        "/admin/dashboard.html";
      return;
    }

    try{

      const capabilityResponse =
        await fetch(
          "/api/shared-engine/settings",
          {
            cache:"no-store",
            headers:{
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      const capabilityData =
        await capabilityResponse
          .json()
          .catch(()=>({}));

      const brokerEnabled =
        capabilityResponse.ok &&
        capabilityData?.capabilities
          ?.brokerContractEnabled === true;

      if(!brokerEnabled){
        window.location.href =
          "/admin/dashboard.html";
        return;
      }

      const data =
        await api(
          `${API_URL}/bootstrap`
        );

      state.brokers =
        Array.isArray(
          data.brokers
        )
          ? data.brokers
          : [];

      if(
        !state.selectedBrokerId &&
        state.brokers.length
      ){
        state.selectedBrokerId =
          String(
            state.brokers[0]._id
          );
      }

      const broker =
        selectedBroker();

      if(broker){
        loadDraft(broker);
      }

      render();

    }catch(err){

      console.log(err);

      if($("mainContent")){
        $("mainContent").innerHTML =
          `<div class="empty">${esc(err.message || "Failed to load Broker Pricing.")}</div>`;
      }
    }
  }

  $("brokerSearch")
    ?.addEventListener(
      "input",
      renderBrokerList
    );

  document.addEventListener(
    "DOMContentLoaded",
    load
  );

})();
