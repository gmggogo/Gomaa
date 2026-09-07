"use strict";

/*
DESTINATION PATH:
server/public/admin/js/sharedEngineSettings.js

PURPOSE:
Shared Engine preset + custom settings UI.
*/

(function(){
  "use strict";

  const PRESET_DEFAULTS = {
    LONG:{
      miles:20,
      minutes:45
    },

    MEDIUM:{
      miles:10,
      minutes:30
    },

    SHORT:{
      miles:5,
      minutes:15
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

  function selectMode(
    mode
  ){
    activeMode =
      normalizeMode(
        mode
      );

    document
      .querySelectorAll(
        "[data-preset-mode]"
      )
      .forEach(
        card=>{
          card.classList.toggle(
            "active",
            card.dataset
              .presetMode ===
              activeMode
          );
        }
      );

    const custom =
      $(
        "sharedEngineCustomSettings"
      );

    if(custom){
      custom.classList.toggle(
        "hidden",
        activeMode !==
          "CUSTOM"
      );
    }
  }

  function applySettings(
    settings
  ){
    const presets =
      settings?.presets ||
      {};

    setNumber(
      "sharedPresetLongMiles",
      presets?.long?.miles ??
      PRESET_DEFAULTS
        .LONG.miles
    );

    setNumber(
      "sharedPresetLongMinutes",
      presets?.long?.minutes ??
      PRESET_DEFAULTS
        .LONG.minutes
    );

    setNumber(
      "sharedPresetMediumMiles",
      presets?.medium?.miles ??
      PRESET_DEFAULTS
        .MEDIUM.miles
    );

    setNumber(
      "sharedPresetMediumMinutes",
      presets?.medium?.minutes ??
      PRESET_DEFAULTS
        .MEDIUM.minutes
    );

    setNumber(
      "sharedPresetShortMiles",
      presets?.short?.miles ??
      PRESET_DEFAULTS
        .SHORT.miles
    );

    setNumber(
      "sharedPresetShortMinutes",
      presets?.short?.minutes ??
      PRESET_DEFAULTS
        .SHORT.minutes
    );

    setNumber(
      "sharedEngineMaxGroupDistanceMiles",
      settings
        ?.maxGroupDistanceMiles ??
        20
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
        45
    );

    setNumber(
      "sharedEngineAppointmentBufferMinutes",
      settings
        ?.appointmentBufferMinutes ??
        60
    );

    setNumber(
      "sharedEnginePickupLateToleranceMinutes",
      settings
        ?.pickupLateToleranceMinutes ??
        20
    );

    setNumber(
      "sharedEnginePickupEarlyWindowMinutes",
      settings
        ?.pickupEarlyWindowMinutes ??
        30
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

    selectMode(
      settings?.presetMode ||
      "LONG"
    );
  }

  function payload(){
    return {
      /*
        Engine is intentionally always on.
      */
      enabled:true,

      presetMode:
        activeMode,

      presets:{
        long:{
          miles:
            numberValue(
              "sharedPresetLongMiles",
              20
            ),

          minutes:
            numberValue(
              "sharedPresetLongMinutes",
              45
            )
        },

        medium:{
          miles:
            numberValue(
              "sharedPresetMediumMiles",
              10
            ),

          minutes:
            numberValue(
              "sharedPresetMediumMinutes",
              30
            )
        },

        short:{
          miles:
            numberValue(
              "sharedPresetShortMiles",
              5
            ),

          minutes:
            numberValue(
              "sharedPresetShortMinutes",
              15
            )
        }
      },

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
    document
      .querySelectorAll(
        "[data-preset-mode]"
      )
      .forEach(
        card=>{
          card.addEventListener(
            "click",
            event=>{
              if(
                event.target
                  .closest("input")
              ){
                return;
              }

              selectMode(
                card.dataset
                  .presetMode
              );
            }
          );
        }
      );

    document
      .querySelectorAll(
        ".preset-card input"
      )
      .forEach(
        input=>{
          input.addEventListener(
            "focus",
            ()=>{
              const card =
                input.closest(
                  "[data-preset-mode]"
                );

              if(card){
                selectMode(
                  card.dataset
                    .presetMode
                );
              }
            }
          );
        }
      );

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
