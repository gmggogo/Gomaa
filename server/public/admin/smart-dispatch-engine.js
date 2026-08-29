/* SMART DISPATCH ENGINE — COMPACT PRESET SETTINGS */
document.addEventListener("DOMContentLoaded",async()=>{

const token=localStorage.getItem("token")||"";
const role=String(localStorage.getItem("role")||"").trim().toUpperCase();
if(!token||!["SUPER_ADMIN","ADMIN","DISPATCHER"].includes(role)){window.location.href="/login.html";return;}

const API_URL="/api/smart-dispatch-engine";
const $=id=>document.getElementById(id);

const DEFAULTS={enabled:true,strategy:"SMART",requireActiveDriver:true,requireScheduleMatch:true,requireServiceMatch:true,maxPickupDistanceMiles:50,maxDeadheadMiles:25,useGoogleDistance:true,topDriversToCheck:3,minBufferMinutes:30,maxTripsPerDriver:20,enableTimeConflict:true,enableFairDistribution:true,maxDriverLoadPercent:80,autoAssignNewTrips:false,autoReassignUnassigned:true,autoAssignSharedTrips:true,distanceWeight:40,travelTimeWeight:30,loadWeight:20,conflictWeight:10};

const PRESETS={
  SMART:{title:"Smart Score",description:"Uses distance, travel time, workload and schedule protection for the strongest overall match.",values:{maxPickupDistanceMiles:50,maxDeadheadMiles:25,topDriversToCheck:5,minBufferMinutes:30,maxTripsPerDriver:20,enableTimeConflict:true,enableFairDistribution:true,maxDriverLoadPercent:80,distanceWeight:40,travelTimeWeight:30,loadWeight:20,conflictWeight:10}},
  DISTANCE:{title:"Nearest Driver",description:"Prioritizes the closest qualified driver while still protecting schedule and service matching.",values:{maxPickupDistanceMiles:35,maxDeadheadMiles:20,topDriversToCheck:5,minBufferMinutes:30,maxTripsPerDriver:20,enableTimeConflict:true,enableFairDistribution:false,maxDriverLoadPercent:90,distanceWeight:70,travelTimeWeight:20,loadWeight:0,conflictWeight:10}},
  TIME:{title:"Best Time",description:"Prioritizes the safest arrival time and avoids drivers with tight or conflicting schedules.",values:{maxPickupDistanceMiles:50,maxDeadheadMiles:25,topDriversToCheck:5,minBufferMinutes:45,maxTripsPerDriver:20,enableTimeConflict:true,enableFairDistribution:false,maxDriverLoadPercent:90,distanceWeight:15,travelTimeWeight:65,loadWeight:5,conflictWeight:15}},
  BALANCED:{title:"Fair Distribution",description:"Balances trips between qualified drivers while respecting distance, time and daily workload.",values:{maxPickupDistanceMiles:45,maxDeadheadMiles:25,topDriversToCheck:5,minBufferMinutes:30,maxTripsPerDriver:16,enableTimeConflict:true,enableFairDistribution:true,maxDriverLoadPercent:75,distanceWeight:30,travelTimeWeight:25,loadWeight:30,conflictWeight:15}}
};

let settings={...DEFAULTS};
let dirty=false;

function number(value,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;}
function toast(message){const el=$("toast");if(!el){window.alert(message);return;}el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),1800);}
function setToggle(field,value){const button=document.querySelector(`[data-field="${field}"]`);if(!button)return;const active=value===true;button.dataset.value=active?"true":"false";button.classList.toggle("active",active);button.textContent=active?"ENABLED":"DISABLED";}
function getToggle(field){return document.querySelector(`[data-field="${field}"]`)?.dataset.value==="true";}
function setInput(id,value){const input=$(id);if(input)input.value=value??"";}
function getInput(id,fallback){return number($(id)?.value,fallback);}
function setDirty(value=true){dirty=value===true;const label=$("dirtyLabel");if(label)label.style.visibility=dirty?"visible":"hidden";}

function updateVisibleState(){
  const enabled=getToggle("enabled");
  const status=$("engineStatus");
  if(status){status.textContent=enabled?"ENABLED":"DISABLED";status.classList.toggle("active",enabled);}
  const strategy=$("strategy")?.value||"SMART";
  const preset=PRESETS[strategy]||PRESETS.SMART;
  if($("presetTitle"))$("presetTitle").textContent=preset.title;
  if($("presetDescription"))$("presetDescription").textContent=preset.description;
}

function writeSettingsToForm(data){
  settings={...DEFAULTS,...(data||{})};
  setToggle("enabled",settings.enabled===true);
  setToggle("autoAssignNewTrips",settings.autoAssignNewTrips===true);
  if($("strategy"))$("strategy").value=PRESETS[settings.strategy]?settings.strategy:"SMART";
  ["requireActiveDriver","requireScheduleMatch","requireServiceMatch","useGoogleDistance","enableTimeConflict","enableFairDistribution","autoReassignUnassigned","autoAssignSharedTrips"].forEach(field=>setToggle(field,settings[field]===true));
  ["maxPickupDistanceMiles","maxDeadheadMiles","topDriversToCheck","minBufferMinutes","maxTripsPerDriver","maxDriverLoadPercent","distanceWeight","travelTimeWeight","loadWeight","conflictWeight"].forEach(field=>setInput(field,settings[field]));
  setDirty(false);
  updateVisibleState();
}

function applyPreset(strategy){
  const key=PRESETS[strategy]?strategy:"SMART";
  const selected=PRESETS[key];
  const keepEnabled=getToggle("enabled");
  const keepAutoAssign=getToggle("autoAssignNewTrips");
  settings={...settings,strategy:key,requireActiveDriver:true,requireScheduleMatch:true,requireServiceMatch:true,useGoogleDistance:true,autoReassignUnassigned:true,autoAssignSharedTrips:true,...selected.values,enabled:keepEnabled,autoAssignNewTrips:keepAutoAssign};
  writeSettingsToForm(settings);
  setDirty(true);
}

function readSettingsFromForm(){
  return {enabled:getToggle("enabled"),strategy:$("strategy")?.value||"SMART",requireActiveDriver:getToggle("requireActiveDriver"),requireScheduleMatch:getToggle("requireScheduleMatch"),requireServiceMatch:getToggle("requireServiceMatch"),maxPickupDistanceMiles:getInput("maxPickupDistanceMiles",50),maxDeadheadMiles:getInput("maxDeadheadMiles",25),useGoogleDistance:getToggle("useGoogleDistance"),topDriversToCheck:getInput("topDriversToCheck",3),minBufferMinutes:getInput("minBufferMinutes",30),maxTripsPerDriver:getInput("maxTripsPerDriver",20),enableTimeConflict:getToggle("enableTimeConflict"),enableFairDistribution:getToggle("enableFairDistribution"),maxDriverLoadPercent:getInput("maxDriverLoadPercent",80),autoAssignNewTrips:getToggle("autoAssignNewTrips"),autoReassignUnassigned:getToggle("autoReassignUnassigned"),autoAssignSharedTrips:getToggle("autoAssignSharedTrips"),distanceWeight:getInput("distanceWeight",40),travelTimeWeight:getInput("travelTimeWeight",30),loadWeight:getInput("loadWeight",20),conflictWeight:getInput("conflictWeight",10)};
}

async function loadSettings(){
  try{
    const response=await fetch(API_URL,{cache:"no-store",headers:{Authorization:"Bearer "+token,"x-access-token":token}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||"Load failed");
    writeSettingsToForm(data.settings&&typeof data.settings==="object"?data.settings:data);
  }catch(error){console.log("SMART DISPATCH LOAD ERROR:",error);writeSettingsToForm(DEFAULTS);toast("Default settings loaded");}
}

async function saveSettings(){
  const button=$("saveBtn");
  const data=readSettingsFromForm();
  if(button){button.disabled=true;button.textContent="Saving...";}
  try{
    const response=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token,"x-access-token":token},body:JSON.stringify(data)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result.success===false)throw new Error(result.message||"Save failed");
    writeSettingsToForm(result.settings&&typeof result.settings==="object"?result.settings:data);
    toast("Settings saved");
  }catch(error){console.log("SMART DISPATCH SAVE ERROR:",error);toast(error.message||"Save failed");}
  finally{if(button){button.disabled=false;button.textContent="Save Settings";}}
}

document.querySelectorAll("#enabledBtn,#autoAssignNewTripsBtn").forEach(button=>button.addEventListener("click",()=>{setToggle(button.dataset.field,!getToggle(button.dataset.field));settings={...settings,[button.dataset.field]:getToggle(button.dataset.field)};setDirty(true);updateVisibleState();}));
$("strategy")?.addEventListener("change",event=>applyPreset(event.target.value));
$("saveBtn")?.addEventListener("click",saveSettings);
await loadSettings();

});
