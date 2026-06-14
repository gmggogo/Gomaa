/* =====================================================
   SMART DISPATCH ENGINE SETTINGS
   Settings Page Only
   Engine runs inside Dispatch
===================================================== */

document.addEventListener("DOMContentLoaded", async function(){

/* ================= SECURITY ================= */

const token = localStorage.getItem("token") || "";
const role  = localStorage.getItem("role") || "";

if(
  !token ||
  ![
    "superadmin",
    "admin",
    "dispatcher"
  ].includes(role)
){
  window.location.href = "/admin/login.html";
  return;
}

/* ================= CONFIG ================= */

const API_URL =
  "/api/smart-dispatch-engine";

/* ================= STATE ================= */

let savedSettings = {};
let editMode = false;
let dirty = false;

const DEFAULTS = {

  enabled:true,

  strategy:"SMART",

  requireActiveDriver:true,
  requireScheduleMatch:true,
  requireServiceMatch:true,

  maxPickupDistanceMiles:50,
  maxDeadheadMiles:25,

  useGoogleDistance:true,
  topDriversToCheck:3,

  minBufferMinutes:30,
  maxTripsPerDriver:20,

  enableTimeConflict:true,

  enableFairDistribution:true,
  maxDriverLoadPercent:80,

  autoAssignNewTrips:false,
  autoReassignUnassigned:true,
  autoAssignSharedTrips:true,

  distanceWeight:40,
  travelTimeWeight:30,
  loadWeight:20,
  conflictWeight:10

};

/* ================= HELPERS ================= */

function $(id){
  return document.getElementById(id);
}

function num(v,def=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function toast(msg){
  const el = $("toast");

  if(!el){
    alert(msg);
    return;
  }

  el.textContent = msg;
  el.classList.add("show");

  clearTimeout(toast._t);

  toast._t = setTimeout(()=>{
    el.classList.remove("show");
  },1800);
}

function strategyLabel(v){
  const map = {
    DISTANCE:"Distance First",
    TIME:"Time First",
    BALANCED:"Balanced Dispatch",
    SMART:"Smart Score"
  };

  return map[v] || v || "-";
}

/* ================= FIELD CONTROL ================= */

function setInput(id,value){
  const el = $(id);
  if(el) el.value = value ?? "";
}

function getInput(id,def=0){
  const el = $(id);
  if(!el) return def;
  return num(el.value,def);
}

function setSelect(id,value){
  const el = $(id);
  if(el) el.value = value || "";
}

function getSelect(id,def=""){
  const el = $(id);
  return el ? el.value : def;
}

function setToggle(field,value){

  const btn =
    document.querySelector(
      `[data-field="${field}"]`
    );

  if(!btn) return;

  btn.dataset.value =
    value === true ? "true" : "false";

  if(value === true){
    btn.classList.add("active");
    btn.textContent = "ACTIVE";
  }else{
    btn.classList.remove("active");
    btn.textContent = "DISABLED";
  }

}

function getToggle(field){

  const btn =
    document.querySelector(
      `[data-field="${field}"]`
    );

  return btn?.dataset.value === "true";

}

/* ================= FORM ================= */

function fillForm(data){

  const s = {
    ...DEFAULTS,
    ...(data || {})
  };

  savedSettings = {
    ...s
  };

  setToggle("enabled",s.enabled);

  setSelect("strategy",s.strategy);

  setToggle("requireActiveDriver",s.requireActiveDriver);
  setToggle("requireScheduleMatch",s.requireScheduleMatch);
  setToggle("requireServiceMatch",s.requireServiceMatch);

  setInput("maxPickupDistanceMiles",s.maxPickupDistanceMiles);
  setInput("maxDeadheadMiles",s.maxDeadheadMiles);
  setToggle("useGoogleDistance",s.useGoogleDistance);
  setInput("topDriversToCheck",s.topDriversToCheck);

  setInput("minBufferMinutes",s.minBufferMinutes);
  setInput("maxTripsPerDriver",s.maxTripsPerDriver);
  setToggle("enableTimeConflict",s.enableTimeConflict);

  setToggle("enableFairDistribution",s.enableFairDistribution);
  setInput("maxDriverLoadPercent",s.maxDriverLoadPercent);

  setToggle("autoAssignNewTrips",s.autoAssignNewTrips);
  setToggle("autoReassignUnassigned",s.autoReassignUnassigned);
  setToggle("autoAssignSharedTrips",s.autoAssignSharedTrips);

  setInput("distanceWeight",s.distanceWeight);
  setInput("travelTimeWeight",s.travelTimeWeight);
  setInput("loadWeight",s.loadWeight);
  setInput("conflictWeight",s.conflictWeight);

  dirty = false;

  updateAll();

}

function readForm(){

  return {

    enabled:getToggle("enabled"),

    strategy:getSelect("strategy","SMART"),

    requireActiveDriver:getToggle("requireActiveDriver"),
    requireScheduleMatch:getToggle("requireScheduleMatch"),
    requireServiceMatch:getToggle("requireServiceMatch"),

    maxPickupDistanceMiles:getInput("maxPickupDistanceMiles",50),
    maxDeadheadMiles:getInput("maxDeadheadMiles",25),

    useGoogleDistance:getToggle("useGoogleDistance"),
    topDriversToCheck:getInput("topDriversToCheck",3),

    minBufferMinutes:getInput("minBufferMinutes",30),
    maxTripsPerDriver:getInput("maxTripsPerDriver",20),

    enableTimeConflict:getToggle("enableTimeConflict"),

    enableFairDistribution:getToggle("enableFairDistribution"),
    maxDriverLoadPercent:getInput("maxDriverLoadPercent",80),

    autoAssignNewTrips:getToggle("autoAssignNewTrips"),
    autoReassignUnassigned:getToggle("autoReassignUnassigned"),
    autoAssignSharedTrips:getToggle("autoAssignSharedTrips"),

    distanceWeight:getInput("distanceWeight",40),
    travelTimeWeight:getInput("travelTimeWeight",30),
    loadWeight:getInput("loadWeight",20),
    conflictWeight:getInput("conflictWeight",10)

  };

}

/* ================= EDIT MODE ================= */

function setEditMode(on){

  editMode = on === true;

  document
    .querySelectorAll("input,select")
    .forEach(el=>{
      el.disabled = !editMode;
    });

  document
    .querySelectorAll(".toggle")
    .forEach(btn=>{
      btn.disabled = !editMode;
      btn.classList.toggle(
        "locked",
        !editMode
      );
    });

  const editBtn = $("editBtn");
  const saveBtn = $("saveBtn");
  const cancelBtn = $("cancelBtn");
  const resetBtn = $("resetBtn");

  if(editBtn){
    editBtn.style.display =
      editMode ? "none" : "inline-block";
  }

  if(saveBtn){
    saveBtn.style.display =
      editMode ? "inline-block" : "none";
  }

  if(cancelBtn){
    cancelBtn.style.display =
      editMode ? "inline-block" : "none";
  }

  if(resetBtn){
    resetBtn.disabled = !editMode;
  }

  updateDirtyLabel();

}

/* ================= VALIDATION ================= */

function getWeightTotal(){

  return (
    getInput("distanceWeight",0) +
    getInput("travelTimeWeight",0) +
    getInput("loadWeight",0) +
    getInput("conflictWeight",0)
  );

}

function validate(){

  const s = readForm();

  if(s.maxPickupDistanceMiles < 0){
    return "Maximum pickup distance is invalid";
  }

  if(s.maxDeadheadMiles < 0){
    return "Maximum deadhead distance is invalid";
  }

  if(s.topDriversToCheck < 1){
    return "Top drivers to check must be at least 1";
  }

  if(s.minBufferMinutes < 0){
    return "Minimum buffer is invalid";
  }

  if(s.maxTripsPerDriver < 0){
    return "Maximum trips per driver is invalid";
  }

  if(
    s.maxDriverLoadPercent < 0 ||
    s.maxDriverLoadPercent > 100
  ){
    return "Maximum driver load must be between 0% and 100%";
  }

  if(s.strategy === "SMART"){
    if(getWeightTotal() !== 100){
      return "Smart Score weights must equal 100%";
    }
  }

  return "";

}

/* ================= UI UPDATES ================= */

function updateWeightTotal(){

  const total = getWeightTotal();
  const box = $("weightTotal");

  if(!box) return;

  box.textContent =
    "Total Weight: " + total + "%";

  box.classList.remove("good","bad");

  if(total === 100){
    box.classList.add("good");
  }else{
    box.classList.add("bad");
  }

}

function updateStrategyView(){

  const strategy =
    getSelect("strategy","SMART");

  const card = $("weightCard");

  if(card){
    card.style.display =
      strategy === "SMART"
        ? "block"
        : "none";
  }

}

function updatePreview(){

  const s = readForm();

  const previewStatus = $("previewStatus");
  const previewStrategy = $("previewStrategy");
  const previewGoogle = $("previewGoogle");
  const previewTopDrivers = $("previewTopDrivers");
  const previewWeights = $("previewWeights");

  if(previewStatus){
    previewStatus.textContent =
      s.enabled ? "ACTIVE" : "DISABLED";
  }

  if(previewStrategy){
    previewStrategy.textContent =
      strategyLabel(s.strategy);
  }

  if(previewGoogle){
    previewGoogle.textContent =
      s.useGoogleDistance ? "ACTIVE" : "DISABLED";
  }

  if(previewTopDrivers){
    previewTopDrivers.textContent =
      String(s.topDriversToCheck);
  }

  if(previewWeights){
    previewWeights.textContent =
      getWeightTotal() + "%";
  }

}

function updateDirtyLabel(){

  const el = $("dirtyLabel");

  if(!el) return;

  if(dirty && editMode){
    el.style.display = "inline-block";
    el.textContent = "Unsaved Changes";
  }else{
    el.style.display = "none";
  }

}

function updateAll(){
  updateWeightTotal();
  updateStrategyView();
  updatePreview();
  updateDirtyLabel();
}

/* ================= API ================= */

async function loadSettings(){

  try{

    const res = await fetch(API_URL);

    if(!res.ok){
      throw new Error("Load failed");
    }

    const data = await res.json();

    fillForm(data);

  }catch(err){

    console.log(
      "SMART DISPATCH LOAD ERROR:",
      err
    );

    fillForm(DEFAULTS);

  }

}

async function saveSettings(){

  const error = validate();

  if(error){
    toast(error);
    return;
  }

  const data = readForm();

  try{

    const res = await fetch(API_URL,{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify(data)
    });

    const result = await res.json();

    if(!res.ok || result.success === false){
      toast(
        result.message ||
        "Save failed"
      );
      return;
    }

    savedSettings = {
      ...data
    };

    dirty = false;

    fillForm(savedSettings);

    setEditMode(false);

    toast("Settings saved");

  }catch(err){

    console.log(
      "SMART DISPATCH SAVE ERROR:",
      err
    );

    toast("Save failed");

  }

}

/* ================= EVENTS ================= */

function markDirty(){

  if(!editMode) return;

  dirty = true;

  updateAll();

}

function bindEvents(){

  $("editBtn")?.addEventListener("click",()=>{
    setEditMode(true);
    toast("Edit mode enabled");
  });

  $("cancelBtn")?.addEventListener("click",()=>{

    fillForm(savedSettings);
    setEditMode(false);
    toast("Changes cancelled");

  });

  $("saveBtn")?.addEventListener("click",saveSettings);

  $("resetBtn")?.addEventListener("click",()=>{

    if(!editMode) return;

    fillForm(DEFAULTS);
    setEditMode(true);
    dirty = true;
    updateAll();
    toast("Default settings loaded");

  });

  document
    .querySelectorAll("input,select")
    .forEach(el=>{

      el.addEventListener("input",markDirty);
      el.addEventListener("change",markDirty);

    });

  document
    .querySelectorAll(".toggle")
    .forEach(btn=>{

      btn.addEventListener("click",()=>{

        if(!editMode) return;

        const field = btn.dataset.field;

        setToggle(
          field,
          !getToggle(field)
        );

        markDirty();

      });

    });

}

/* ================= INIT ================= */

bindEvents();

await loadSettings();

setEditMode(false);

});