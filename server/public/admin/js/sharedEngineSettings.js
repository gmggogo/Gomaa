"use strict";

/*
DESTINATION PATH:
server/public/admin/js/sharedEngineSettings.js

PURPOSE:
Admin Settings UI controller for Shared Engine.

EXPECTED HTML IDS:
sharedEngineSettingsSection
sharedEngineBrokerSection
sharedEngineEnabled
sharedEngineCompanyEnabled
sharedEngineReservedEnabled
sharedEngineBrokerEnabled
sharedEngineMaxGroupDistanceMiles
sharedEngineMaxExtraMiles
sharedEngineMaxExtraMinutes
sharedEngineAppointmentBufferMinutes
sharedEnginePickupLateToleranceMinutes
sharedEnginePickupEarlyWindowMinutes
sharedEngineMaxRidersPerGroup
sharedEngineSamePickupPriority
sharedEngineSameDropoffPriority
sharedEngineSaveBtn
sharedEngineStatus

IMPORTANT:
If Broker Contract is not enabled, sharedEngineBrokerSection is hidden.
*/

(function(){
  "use strict";

  function $(
    id
  ){
    return document
      .getElementById(
        id
      );
  }

  function token(){
    return (
      localStorage.getItem(
        "token"
      ) ||
      sessionStorage.getItem(
        "token"
      ) ||
      localStorage.getItem(
        "jwt"
      ) ||
      sessionStorage.getItem(
        "jwt"
      ) ||
      ""
    );
  }

  async function api(
    url,
    options = {}
  ){
    const headers = {
      "Content-Type":
        "application/json",
      ...(
        options.headers ||
        {}
      )
    };

    const authToken =
      token();

    if(authToken){
      headers.Authorization =
        "Bearer " +
        authToken;
    }

    const response =
      await fetch(
        url,
        {
          ...options,
          headers
        }
      );

    const data =
      await response
        .json()
        .catch(
          ()=>({})
        );

    if(!response.ok){
      throw new Error(
        data.message ||
        "Request failed"
      );
    }

    return data;
  }

  function boolValue(
    id,
    fallback = true
  ){
    const el =
      $(id);

    if(!el){
      return fallback;
    }

    if(
      el.type ===
      "checkbox"
    ){
      return el.checked;
    }

    return (
      String(
        el.value
      ).toLowerCase() ===
      "true"
    );
  }

  function numberValue(
    id,
    fallback
  ){
    const el =
      $(id);

    if(!el){
      return fallback;
    }

    const value =
      Number(
        el.value
      );

    return Number.isFinite(value)
      ? value
      : fallback;
  }

  function setBoolean(
    id,
    value
  ){
    const el =
      $(id);

    if(!el){
      return;
    }

    if(
      el.type ===
      "checkbox"
    ){
      el.checked =
        value !== false;
      return;
    }

    el.value =
      value === false
        ? "false"
        : "true";
  }

  function setNumber(
    id,
    value
  ){
    const el =
      $(id);

    if(!el){
      return;
    }

    el.value =
      Number(
        value ?? 0
      );
  }

  function setStatus(
    message,
    isError = false
  ){
    const el =
      $(
        "sharedEngineStatus"
      );

    if(!el){
      return;
    }

    el.textContent =
      message ||
      "";

    el.dataset.status =
      isError
        ? "error"
        : "ok";
  }

  function applyCapabilities(
    capabilities
  ){
    const sharedEnabled =
      capabilities
        ?.sharedServiceEnabled === true ||
      capabilities
        ?.sharedServiceFound === true;

    /*
      Platform Admin controls whether this tenant owns SHARED.
      Without SHARED, this entire engine is unavailable.
    */
    if(!sharedEnabled){
      window.location.replace(
        "settings.html"
      );

      return false;
    }

    /*
      Once SHARED is available:
      - Company Trips stays visible.
      - Reserved Trips stays visible.
      - Broker Trips appears only with an enabled Broker Contract.
    */
    const companyField =
      $(
        "sharedEngineCompanyEnabled"
      )
        ?.closest(
          ".settings-field"
        );

    const reservedField =
      $(
        "sharedEngineReservedEnabled"
      )
        ?.closest(
          ".settings-field"
        );

    const brokerSection =
      $(
        "sharedEngineBrokerSection"
      );

    if(companyField){
      companyField.style.display =
        "";
    }

    if(reservedField){
      reservedField.style.display =
        "";
    }

    if(brokerSection){
      brokerSection.style.display =
        capabilities
          ?.brokerContractEnabled === true
          ? ""
          : "none";
    }

    return true;
  }

  function applySettings(
    settings
  ){
    setBoolean(
      "sharedEngineEnabled",
      settings?.enabled
    );

    setBoolean(
      "sharedEngineCompanyEnabled",
      settings?.sources
        ?.company
        ?.enabled
    );

    setBoolean(
      "sharedEngineReservedEnabled",
      settings?.sources
        ?.reserved
        ?.enabled
    );

    setBoolean(
      "sharedEngineBrokerEnabled",
      settings?.sources
        ?.broker
        ?.enabled
    );

    setNumber(
      "sharedEngineMaxGroupDistanceMiles",
      settings
        ?.maxGroupDistanceMiles ??
        10
    );

    setNumber(
      "sharedEngineMaxExtraMiles",
      settings
        ?.maxExtraMiles ??
        10
    );

    setNumber(
      "sharedEngineMaxExtraMinutes",
      settings
        ?.maxExtraMinutes ??
        30
    );

    setNumber(
      "sharedEngineAppointmentBufferMinutes",
      settings
        ?.appointmentBufferMinutes ??
        10
    );

    setNumber(
      "sharedEnginePickupLateToleranceMinutes",
      settings
        ?.pickupLateToleranceMinutes ??
        5
    );

    setNumber(
      "sharedEnginePickupEarlyWindowMinutes",
      settings
        ?.pickupEarlyWindowMinutes ??
        20
    );

    setNumber(
      "sharedEngineMaxRidersPerGroup",
      settings
        ?.maxRidersPerGroup ??
        4
    );

    setBoolean(
      "sharedEngineSamePickupPriority",
      settings
        ?.samePickupPriority
    );

    setBoolean(
      "sharedEngineSameDropoffPriority",
      settings
        ?.sameDropoffPriority
    );
  }

  function payload(){
    return {
      enabled:
        boolValue(
          "sharedEngineEnabled",
          true
        ),

      sources:{
        company:{
          enabled:
            boolValue(
              "sharedEngineCompanyEnabled",
              true
            )
        },

        reserved:{
          enabled:
            boolValue(
              "sharedEngineReservedEnabled",
              true
            )
        },

        broker:{
          enabled:
            boolValue(
              "sharedEngineBrokerEnabled",
              true
            )
        }
      },

      maxGroupDistanceMiles:
        numberValue(
          "sharedEngineMaxGroupDistanceMiles",
          10
        ),

      maxExtraMiles:
        numberValue(
          "sharedEngineMaxExtraMiles",
          10
        ),

      maxExtraMinutes:
        numberValue(
          "sharedEngineMaxExtraMinutes",
          30
        ),

      appointmentBufferMinutes:
        numberValue(
          "sharedEngineAppointmentBufferMinutes",
          10
        ),

      pickupLateToleranceMinutes:
        numberValue(
          "sharedEnginePickupLateToleranceMinutes",
          5
        ),

      pickupEarlyWindowMinutes:
        numberValue(
          "sharedEnginePickupEarlyWindowMinutes",
          20
        ),

      maxRidersPerGroup:
        numberValue(
          "sharedEngineMaxRidersPerGroup",
          4
        ),

      samePickupPriority:
        boolValue(
          "sharedEngineSamePickupPriority",
          true
        ),

      sameDropoffPriority:
        boolValue(
          "sharedEngineSameDropoffPriority",
          true
        )
    };
  }

  async function load(){
    if(
      !$(
        "sharedEngineSettingsSection"
      )
    ){
      return;
    }

    try{
      setStatus(
        "Loading..."
      );

      const data =
        await api(
          "/api/shared-engine/settings"
        );

      const allowed =
        applyCapabilities(
          data.capabilities ||
          {}
        );

      if(!allowed){
        return;
      }

      applySettings(
        data.settings ||
        {}
      );

      setStatus(
        ""
      );

    }catch(err){
      setStatus(
        err.message,
        true
      );
    }
  }

  async function save(){
    const button =
      $(
        "sharedEngineSaveBtn"
      );

    if(button){
      button.disabled =
        true;
    }

    try{
      setStatus(
        "Saving..."
      );

      const data =
        await api(
          "/api/shared-engine/settings",
          {
            method:"POST",
            body:
              JSON.stringify(
                payload()
              )
          }
        );

      const allowed =
        applyCapabilities(
          data.capabilities ||
          {}
        );

      if(!allowed){
        return;
      }

      applySettings(
        data.settings ||
        {}
      );

      setStatus(
        "Shared Engine settings saved."
      );

    }catch(err){
      setStatus(
        err.message,
        true
      );

    }finally{
      if(button){
        button.disabled =
          false;
      }
    }
  }

  function bind(){
    const button =
      $(
        "sharedEngineSaveBtn"
      );

    if(button){
      button.addEventListener(
        "click",
        save
      );
    }
  }

  document
    .addEventListener(
      "DOMContentLoaded",
      ()=>{
        bind();
        load();
      }
    );

  window.SharedEngineSettingsUI = {
    load,
    save
  };
})();
