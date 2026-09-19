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
    operationEnabled:false,
    operationFinalConfirmation:false,
    brokerOperationEnabled:false,
    brokerFinalConfirmation:false,
    shareServiceEnabled:false,
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
    node.className = `notice show ${type === "error" ? "error" : "ok"}`;
  }

  function hideNotice(){
    const node = el("autopilotNotice");
    if(!node)return;
    node.textContent = "";
    node.className = "notice";
  }

  function markUnsaved(){
    hideNotice();
    const saveState = el("autopilotSaveState");
    if(saveState){
      saveState.textContent = "Unsaved changes";
    }
  }

  function setStatus(prefix,isActive,labels={on:"Active",off:"Not Active"}){
    const status = el(`${prefix}Status`);
    const on = el(`${prefix}On`);
    const off = el(`${prefix}Off`);

    if(status){
      status.textContent = isActive ? labels.on : labels.off;
      status.classList.toggle("active",isActive);
      status.classList.toggle("inactive",!isActive);
    }

    on?.classList.toggle("selected",isActive);
    off?.classList.toggle("selected",!isActive);
  }

  function applyVisibility(){
    const brokerCard = el("brokerOperationCard");
    const shareWrap = el("shareServiceWrap");

    brokerCard?.classList.toggle(
      "hidden",
      !state.brokerContractEnabled
    );

    shareWrap?.classList.toggle(
      "hidden",
      !state.brokerSharedAvailable
    );

    const grid = el("operationGrid");
    if(grid){
      const visibleCount = [
        el("operationCard"),
        brokerCard
      ].filter(
        card=>card && !card.classList.contains("hidden")
      ).length;

      grid.classList.remove(
        "one-card",
        "two-cards",
        "three-cards"
      );
      grid.classList.add(
        visibleCount === 1 ? "one-card" : "two-cards"
      );
    }
  }

  function applyPermissions(){
    document.querySelectorAll(".mode-btn").forEach(button=>{
      button.disabled = !state.canEdit;
    });

    const save = el("saveAutopilotSettings");
    if(save){
      save.disabled = !state.canEdit;
      if(!state.canEdit){
        save.textContent = "View Only";
      }
    }
  }

  function render(){
    applyVisibility();

    setStatus("operation",state.operationEnabled);
    setStatus(
      "operationFinalConfirmation",
      state.operationFinalConfirmation,
      {on:"ON",off:"OFF"}
    );
    setStatus("brokerOperation",state.brokerOperationEnabled);
    setStatus(
      "brokerFinalConfirmation",
      state.brokerFinalConfirmation,
      {on:"ON",off:"OFF"}
    );
    setStatus("shareService",state.shareServiceEnabled);

    applyPermissions();
  }

  function bindMode(prefix,key,labels){
    el(`${prefix}On`)?.addEventListener("click",()=>{
      if(!state.canEdit)return;
      state[key] = true;
      setStatus(prefix,true,labels);
      markUnsaved();
    });

    el(`${prefix}Off`)?.addEventListener("click",()=>{
      if(!state.canEdit)return;
      state[key] = false;
      setStatus(prefix,false,labels);
      markUnsaved();
    });
  }

  async function request(url,options={}){
    const authToken = token();
    if(!authToken){
      throw new Error("Login session not found");
    }

    const response = await fetch(url,{
      cache:"no-store",
      ...options,
      headers:{
        ...(options.body ? {"Content-Type":"application/json"} : {}),
        ...(options.headers || {}),
        Authorization:`Bearer ${authToken}`
      }
    });

    const data = await response.json().catch(()=>({}));
    if(!response.ok){
      throw new Error(data?.message || `HTTP ${response.status}`);
    }
    return data;
  }

  function applyLoadedData(data){
    const settings = data?.settings || {};
    const capabilities = data?.capabilities || {};

    state.operationEnabled = settings.operationEnabled === true;
    state.operationFinalConfirmation = settings.operationFinalConfirmation === true;
    state.brokerOperationEnabled = settings.brokerOperationEnabled === true;
    state.brokerFinalConfirmation = settings.brokerFinalConfirmation === true;
    state.shareServiceEnabled = settings.shareServiceEnabled === true;

    state.brokerContractEnabled = capabilities.brokerContractEnabled === true;
    state.sharedServiceEnabled = capabilities.sharedServiceEnabled === true;
    state.brokerSharedAvailable = capabilities.brokerSharedAvailable === true;

    state.canEdit = data?.canEdit === true;
    render();

    return settings;
  }

  async function load(){
    try{
      const data = await request(API);
      const settings = applyLoadedData(data);
      state.loaded = true;

      const saveState = el("autopilotSaveState");
      if(saveState){
        saveState.textContent = settings.updatedAt
          ? `Saved · ${new Date(settings.updatedAt).toLocaleString()}`
          : "Ready · No Autopilot settings saved yet";
      }
    }catch(err){
      console.log("AUTOPILOT SETTINGS LOAD ERROR:",err);
      showNotice(err?.message || "Unable to load Autopilot settings","error");
      const saveState = el("autopilotSaveState");
      if(saveState){
        saveState.textContent = "Autopilot settings unavailable";
      }
    }
  }

  async function save(){
    if(!state.loaded || !state.canEdit)return;

    const button = el("saveAutopilotSettings");
    if(button){
      button.disabled = true;
      button.textContent = "Saving...";
    }

    try{
      const data = await request(API,{
        method:"POST",
        body:JSON.stringify({
          operationEnabled:state.operationEnabled,
          operationFinalConfirmation:state.operationFinalConfirmation,
          brokerOperationEnabled:state.brokerOperationEnabled,
          brokerFinalConfirmation:state.brokerFinalConfirmation,
          shareServiceEnabled:state.shareServiceEnabled
        })
      });

      const settings = applyLoadedData(data);
      const saveState = el("autopilotSaveState");
      if(saveState){
        saveState.textContent = settings.updatedAt
          ? `Saved · ${new Date(settings.updatedAt).toLocaleString()}`
          : "Saved";
      }
      showNotice("Autopilot settings saved successfully.","ok");
    }catch(err){
      console.log("AUTOPILOT SETTINGS SAVE ERROR:",err);
      showNotice(err?.message || "Unable to save Autopilot settings","error");
    }finally{
      if(button){
        button.disabled = !state.canEdit;
        button.textContent = state.canEdit ? "Save Settings" : "View Only";
      }
    }
  }

  document.addEventListener("DOMContentLoaded",()=>{
    bindMode("operation","operationEnabled");
    bindMode(
      "operationFinalConfirmation",
      "operationFinalConfirmation",
      {on:"ON",off:"OFF"}
    );
    bindMode("brokerOperation","brokerOperationEnabled");
    bindMode(
      "brokerFinalConfirmation",
      "brokerFinalConfirmation",
      {on:"ON",off:"OFF"}
    );
    bindMode("shareService","shareServiceEnabled");

    el("saveAutopilotSettings")?.addEventListener("click",save);
    load();
  });

})();
