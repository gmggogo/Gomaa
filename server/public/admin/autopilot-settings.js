"use strict";

/*
DESTINATION PATH:
server/public/admin/autopilot-settings.js

PURPOSE:
Autopilot Settings page controller.
*/

(function(){

  const API = "/api/autopilot-settings";

  const state = {
    companyAutopilot:false,
    brokerAutopilot:false,
    brokerSharedAutopilot:false,
    brokerContractEnabled:false,
    sharedServiceEnabled:false,
    brokerSharedAvailable:false,
    canEdit:false,
    loaded:false
  };

  function token(){
    return String(
      sessionStorage.getItem("staffToken") ||
      localStorage.getItem("token") ||
      ""
    ).trim();
  }

  function el(id){
    return document.getElementById(id);
  }

  function showNotice(message,type="ok"){
    const node = el("autopilotNotice");
    if(!node)return;

    node.textContent = String(message || "");
    node.className =
      `notice show ${type === "error" ? "error" : "ok"}`;
  }

  function hideNotice(){
    const node = el("autopilotNotice");
    if(!node)return;
    node.textContent = "";
    node.className = "notice";
  }

  function setStatus(prefix,isActive){
    const status = el(`${prefix}Status`);
    const on = el(`${prefix}On`);
    const off = el(`${prefix}Off`);

    if(status){
      status.textContent =
        isActive ? "Active" : "Not Active";
      status.classList.toggle("active",isActive);
      status.classList.toggle("inactive",!isActive);
    }

    if(on){
      on.classList.toggle("selected",isActive);
    }

    if(off){
      off.classList.toggle("selected",!isActive);
    }
  }

  function applyVisibility(){
    el("brokerAutopilotCard")
      ?.classList.toggle(
        "hidden",
        !state.brokerContractEnabled
      );

    el("brokerSharedAutopilotCard")
      ?.classList.toggle(
        "hidden",
        !state.brokerSharedAvailable
      );
  }

  function applyPermissions(){
    document
      .querySelectorAll(".mode-btn")
      .forEach(button=>{
        button.disabled =
          !state.canEdit;
      });

    const save =
      el("saveAutopilotSettings");

    if(save){
      save.disabled =
        !state.canEdit;

      if(!state.canEdit){
        save.textContent = "View Only";
      }
    }
  }

  function render(){
    applyVisibility();

    setStatus(
      "companyAutopilot",
      state.companyAutopilot
    );

    setStatus(
      "brokerAutopilot",
      state.brokerAutopilot
    );

    setStatus(
      "brokerSharedAutopilot",
      state.brokerSharedAutopilot
    );

    applyPermissions();
  }

  function bindMode(prefix,key){
    el(`${prefix}On`)
      ?.addEventListener(
        "click",
        ()=>{
          if(!state.canEdit)return;
          state[key] = true;
          setStatus(prefix,true);
          hideNotice();
          el("autopilotSaveState").textContent =
            "Unsaved changes";
        }
      );

    el(`${prefix}Off`)
      ?.addEventListener(
        "click",
        ()=>{
          if(!state.canEdit)return;
          state[key] = false;
          setStatus(prefix,false);
          hideNotice();
          el("autopilotSaveState").textContent =
            "Unsaved changes";
        }
      );
  }

  async function request(
    url,
    options={}
  ){
    const authToken = token();

    if(!authToken){
      throw new Error("Login session not found");
    }

    const response =
      await fetch(
        url,
        {
          cache:"no-store",
          ...options,
          headers:{
            ...(options.body
              ? {"Content-Type":"application/json"}
              : {}),
            ...(options.headers || {}),
            Authorization:
              `Bearer ${authToken}`
          }
        }
      );

    const data =
      await response
        .json()
        .catch(()=>({}));

    if(!response.ok){
      throw new Error(
        data?.message ||
        `HTTP ${response.status}`
      );
    }

    return data;
  }

  async function load(){
    try{
      const data =
        await request(API);

      const settings =
        data?.settings || {};

      const capabilities =
        data?.capabilities || {};

      state.companyAutopilot =
        settings.companyAutopilot === true;

      state.brokerAutopilot =
        settings.brokerAutopilot === true;

      state.brokerSharedAutopilot =
        settings.brokerSharedAutopilot === true;

      state.brokerContractEnabled =
        capabilities.brokerContractEnabled === true;

      state.sharedServiceEnabled =
        capabilities.sharedServiceEnabled === true;

      state.brokerSharedAvailable =
        capabilities.brokerSharedAvailable === true;

      state.canEdit =
        data?.canEdit === true;

      state.loaded = true;

      render();

      const saveState =
        el("autopilotSaveState");

      if(saveState){
        if(settings.updatedAt){
          const date =
            new Date(settings.updatedAt);

          saveState.textContent =
            `Saved · ${date.toLocaleString()}`;
        }else{
          saveState.textContent =
            "Ready · No Autopilot settings saved yet";
        }
      }

    }catch(err){
      console.log(
        "AUTOPILOT SETTINGS LOAD ERROR:",
        err
      );

      showNotice(
        err?.message ||
        "Unable to load Autopilot settings",
        "error"
      );

      const saveState =
        el("autopilotSaveState");

      if(saveState){
        saveState.textContent =
          "Autopilot settings unavailable";
      }
    }
  }

  async function save(){
    if(!state.loaded || !state.canEdit){
      return;
    }

    const button =
      el("saveAutopilotSettings");

    if(button){
      button.disabled = true;
      button.textContent = "Saving...";
    }

    try{
      const data =
        await request(
          API,
          {
            method:"POST",
            body:JSON.stringify({
              companyAutopilot:
                state.companyAutopilot,
              brokerAutopilot:
                state.brokerAutopilot,
              brokerSharedAutopilot:
                state.brokerSharedAutopilot
            })
          }
        );

      const settings =
        data?.settings || {};

      const capabilities =
        data?.capabilities || {};

      state.companyAutopilot =
        settings.companyAutopilot === true;

      state.brokerAutopilot =
        settings.brokerAutopilot === true;

      state.brokerSharedAutopilot =
        settings.brokerSharedAutopilot === true;

      state.brokerContractEnabled =
        capabilities.brokerContractEnabled === true;

      state.sharedServiceEnabled =
        capabilities.sharedServiceEnabled === true;

      state.brokerSharedAvailable =
        capabilities.brokerSharedAvailable === true;

      render();

      const saveState =
        el("autopilotSaveState");

      if(saveState){
        saveState.textContent =
          settings.updatedAt
            ? `Saved · ${new Date(settings.updatedAt).toLocaleString()}`
            : "Saved";
      }

      showNotice(
        "Autopilot settings saved successfully.",
        "ok"
      );

    }catch(err){
      console.log(
        "AUTOPILOT SETTINGS SAVE ERROR:",
        err
      );

      showNotice(
        err?.message ||
        "Unable to save Autopilot settings",
        "error"
      );

    }finally{
      if(button){
        button.disabled =
          !state.canEdit;
        button.textContent =
          state.canEdit
            ? "Save Settings"
            : "View Only";
      }
    }
  }

  document.addEventListener(
    "DOMContentLoaded",
    ()=>{
      bindMode(
        "companyAutopilot",
        "companyAutopilot"
      );

      bindMode(
        "brokerAutopilot",
        "brokerAutopilot"
      );

      bindMode(
        "brokerSharedAutopilot",
        "brokerSharedAutopilot"
      );

      el("saveAutopilotSettings")
        ?.addEventListener(
          "click",
          save
        );

      load();
    }
  );

})();
