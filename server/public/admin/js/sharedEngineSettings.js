"use strict";

/*
DESTINATION PATH:
server/public/admin/js/sharedEngineSettings.js

PURPOSE:
Shared Engine preset + custom settings UI.
*/

(function(){
  "use strict";

  const PROFILE_DEFAULTS = {
    LONG:{
      maxGroupDistanceMiles:20,
      maxExtraMiles:10,
      maxExtraMinutes:45,
      appointmentBufferMinutes:60,
      pickupLateToleranceMinutes:20,
      pickupEarlyWindowMinutes:30,
      maxRidersPerGroup:4,
      samePickupPriority:true,
      sameDropoffPriority:true,
      sources:{
        company:{enabled:true},
        reserved:{enabled:true},
        broker:{enabled:true}
      }
    },

    MEDIUM:{
      maxGroupDistanceMiles:10,
      maxExtraMiles:10,
      maxExtraMinutes:30,
      appointmentBufferMinutes:60,
      pickupLateToleranceMinutes:20,
      pickupEarlyWindowMinutes:30,
      maxRidersPerGroup:4,
      samePickupPriority:true,
      sameDropoffPriority:true,
      sources:{
        company:{enabled:true},
        reserved:{enabled:true},
        broker:{enabled:true}
      }
    },

    SHORT:{
      maxGroupDistanceMiles:5,
      maxExtraMiles:10,
      maxExtraMinutes:15,
      appointmentBufferMinutes:60,
      pickupLateToleranceMinutes:20,
      pickupEarlyWindowMinutes:30,
      maxRidersPerGroup:4,
      samePickupPriority:true,
      sameDropoffPriority:true,
      sources:{
        company:{enabled:true},
        reserved:{enabled:true},
        broker:{enabled:true}
      }
    }
  };

  let activeMode =
    "LONG";

  function $(id){
    return document
      .getElementById(id);
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

  function boolValue(
    id,
    fallback = true
  ){
    const el =
      $(id);

    if(!el){
      return fallback;
    }

    return (
      String(
        el.value
      ).toLowerCase() ===
      "true"
    );
  }

  function setNumber(
    id,
    value
  ){
    const el =
      $(id);

    if(el){
      el.value =
        Number(
          value ?? 0
        );
    }
  }

  function setBoolean(
    id,
    value
  ){
    const el =
      $(id);

    if(el){
      el.value =
        value === false
          ? "false"
          : "true";
    }
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

  function normalizeMode(
    value
  ){
    const mode =
      String(
        value ||
        ""
      ).toUpperCase();

    return [
      "LONG",
      "MEDIUM",
      "SHORT",
      "CUSTOM"
    ].includes(mode)
      ? mode
      : "LONG";
  }

  function applyCapabilities(
    capabilities
  ){
    const sharedEnabled =
      capabilities
        ?.sharedServiceEnabled === true ||
      capabilities
        ?.sharedServiceFound === true;

    if(!sharedEnabled){
      window.location.replace(
        "settings.html"
      );

      return false;
    }

    const brokerSection =
      $(
        "sharedEngineBrokerSection"
      );

    if(brokerSection){
      brokerSection.style.display =
        capabilities
          ?.brokerContractEnabled === true
          ? ""
          : "none";
    }

    return true;
  }

  function setAdvancedEditable(
    editable
  ){
    const ids = [
      "sharedEngineMaxGroupDistanceMiles",
      "sharedEngineMaxExtraMiles",
      "sharedEngineMaxExtraMinutes",
      "sharedEngineAppointmentBufferMinutes",
      "sharedEnginePickupLateToleranceMinutes",
      "sharedEnginePickupEarlyWindowMinutes",
      "sharedEngineMaxRidersPerGroup",
      "sharedEngineSamePickupPriority",
      "sharedEngineSameDropoffPriority",
      "sharedEngineCompanyEnabled",
      "sharedEngineReservedEnabled",
      "sharedEngineBrokerEnabled"
    ];

    ids.forEach(
      id=>{
        const el = $(id);

        if(!el){
          return;
        }

        el.disabled =
          editable !== true;
      }
    );

    const settingsBox =
      $(
        "sharedEngineCustomSettings"
      );

    if(settingsBox){
      settingsBox.classList.toggle(
        "readonly-mode",
        editable !== true
      );
    }

    const note =
      $(
        "sharedEngineAdvancedNote"
      );

    if(note){
      note.textContent =
        editable
          ? "Custom profile is active. All settings below can be edited."
          : "This profile uses locked default settings. Select Custom to edit the values.";
    }
  }

  function applyProfileValues(
    mode
  ){
    const profile =
      PROFILE_DEFAULTS[
        mode
      ];

    if(!profile){
      return;
    }

    setNumber(
      "sharedEngineMaxGroupDistanceMiles",
      profile.maxGroupDistanceMiles
    );

    setNumber(
      "sharedEngineMaxExtraMiles",
      profile.maxExtraMiles
    );

    setNumber(
      "sharedEngineMaxExtraMinutes",
      profile.maxExtraMinutes
    );

    setNumber(
      "sharedEngineAppointmentBufferMinutes",
      profile.appointmentBufferMinutes
    );

    setNumber(
      "sharedEnginePickupLateToleranceMinutes",
      profile.pickupLateToleranceMinutes
    );

    setNumber(
      "sharedEnginePickupEarlyWindowMinutes",
      profile.pickupEarlyWindowMinutes
    );

    setNumber(
      "sharedEngineMaxRidersPerGroup",
      profile.maxRidersPerGroup
    );

    setBoolean(
      "sharedEngineSamePickupPriority",
      profile.samePickupPriority
    );

    setBoolean(
      "sharedEngineSameDropoffPriority",
      profile.sameDropoffPriority
    );

    setBoolean(
      "sharedEngineCompanyEnabled",
      profile.sources.company.enabled
    );

    setBoolean(
      "sharedEngineReservedEnabled",
      profile.sources.reserved.enabled
    );

    setBoolean(
      "sharedEngineBrokerEnabled",
      profile.sources.broker.enabled
    );
  }

  function selectMode(
    mode,
    options={}
  ){
    activeMode =
      normalizeMode(
        mode
      );

    const selector =
      $(
        "sharedEngineProfileSelect"
      );

    if(selector){
      selector.value =
        activeMode;
    }

    if(
      activeMode !== "CUSTOM" &&
      options.keepValues !== true
    ){
      applyProfileValues(
        activeMode
      );
    }

    setAdvancedEditable(
      activeMode === "CUSTOM"
    );
  }

  function applySettings(
    settings
  ){
    const mode =
      normalizeMode(
        settings?.presetMode ||
        "LONG"
      );

    if(mode === "CUSTOM"){
      setNumber(
        "sharedEngineMaxGroupDistanceMiles",
        settings?.maxGroupDistanceMiles ?? 20
      );

      setNumber(
        "sharedEngineMaxExtraMiles",
        settings?.maxExtraMiles ?? 10
      );

      setNumber(
        "sharedEngineMaxExtraMinutes",
        settings?.maxExtraMinutes ?? 45
      );

      setNumber(
        "sharedEngineAppointmentBufferMinutes",
        settings?.appointmentBufferMinutes ?? 60
      );

      setNumber(
        "sharedEnginePickupLateToleranceMinutes",
        settings?.pickupLateToleranceMinutes ?? 20
      );

      setNumber(
        "sharedEnginePickupEarlyWindowMinutes",
        settings?.pickupEarlyWindowMinutes ?? 30
      );

      setNumber(
        "sharedEngineMaxRidersPerGroup",
        settings?.maxRidersPerGroup ?? 4
      );

      setBoolean(
        "sharedEngineSamePickupPriority",
        settings?.samePickupPriority
      );

      setBoolean(
        "sharedEngineSameDropoffPriority",
        settings?.sameDropoffPriority
      );

      setBoolean(
        "sharedEngineCompanyEnabled",
        settings?.sources?.company?.enabled
      );

      setBoolean(
        "sharedEngineReservedEnabled",
        settings?.sources?.reserved?.enabled
      );

      setBoolean(
        "sharedEngineBrokerEnabled",
        settings?.sources?.broker?.enabled
      );

      selectMode(
        "CUSTOM",
        {
          keepValues:true
        }
      );

      return;
    }

    selectMode(
      mode
    );
  }

  function payload(){
    return {
      enabled:true,
      presetMode:
        activeMode,

      maxGroupDistanceMiles:
        numberValue(
          "sharedEngineMaxGroupDistanceMiles",
          20
        ),

      maxExtraMiles:
        numberValue(
          "sharedEngineMaxExtraMiles",
          10
        ),

      maxExtraMinutes:
        numberValue(
          "sharedEngineMaxExtraMinutes",
          45
        ),

      appointmentBufferMinutes:
        numberValue(
          "sharedEngineAppointmentBufferMinutes",
          60
        ),

      pickupLateToleranceMinutes:
        numberValue(
          "sharedEnginePickupLateToleranceMinutes",
          20
        ),

      pickupEarlyWindowMinutes:
        numberValue(
          "sharedEnginePickupEarlyWindowMinutes",
          30
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
      }
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
    const advancedToggle =
      $(
        "sharedEngineAdvancedToggle"
      );

    if(advancedToggle){
      advancedToggle.addEventListener(
        "click",
        toggleAdvancedSettings
      );
    }

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
    const selector =
      $(
        "sharedEngineProfileSelect"
      );

    if(selector){
      selector.addEventListener(
        "change",
        ()=>{
          selectMode(
            selector.value
          );
        }
      );
    }

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
    save,
    selectMode
  };
})();
