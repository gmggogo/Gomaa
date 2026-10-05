DESTINATION: server/public/admin/js/mtm-marketplace-settings.js

"use strict";
/* DESTINATION PATH: server/public/admin/js/mtm-marketplace-settings.js */
(()=>{
  const $=id=>document.getElementById(id);
  const token=()=>String(localStorage.getItem("token")||"").trim();
  const headers=()=>({"Content-Type":"application/json","Authorization":`Bearer ${token()}`});
  const arr=v=>String(v||"").split(/[\s,]+/).map(x=>x.trim()).filter(Boolean);

  function engineMarkup(p,isLong){
    return `
      <div class="checks">
        <label><input id="${p}Enabled" type="checkbox"> Engine Enabled</label>
        <label><input id="${p}Auto" type="checkbox"> Auto Accept</label>
      </div>
      <div class="row">
        <div><label>Miles From</label><input id="${p}Min" type="number" min="0" value="${isLong?100:0}"></div>
        <div><label>Miles To</label><input id="${p}Max" type="number" min="0" value="${isLong?1000:99.99}"></div>
      </div>
      <div class="row">
        <div><label>Pickup Time From</label><input id="${p}PUFrom" type="time" value="00:00"></div>
        <div><label>Pickup Time To</label><input id="${p}PUTo" type="time" value="23:59"></div>
      </div>
      <div class="row">
        <div><label>Dropoff Time From</label><input id="${p}DOFrom" type="time" value="00:00"></div>
        <div><label>Dropoff Time To</label><input id="${p}DOTo" type="time" value="23:59"></div>
      </div>
      <div class="row">
        <div><label>Pickup ZIPs</label><input id="${p}PUZip" placeholder="85224, 85225"></div>
        <div><label>Dropoff ZIPs</label><input id="${p}DOZip" placeholder="85001, 85701"></div>
      </div>
      <div class="row">
        <div>
          <label>Zone Match</label>
          <select id="${p}Zone"><option>ANY</option><option>PICKUP</option><option>DROPOFF</option><option>EITHER</option><option>BOTH</option></select>
        </div>
        <div><label>Daily Trip Limit</label><input id="${p}Limit" type="number" min="0" value="0"></div>
      </div>
      <label>MTM Modes / Services</label>
      <input id="${p}Modes" placeholder="Cab, Paralift">
    `;
  }

  $("longEngine").insertAdjacentHTML("beforeend",engineMarkup("long",true));
  $("shortEngine").insertAdjacentHTML("beforeend",engineMarkup("short",false));

  async function api(path,opt={}){
    const response=await fetch(`/api/mtm-marketplace${path}`,{...opt,headers:headers()});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.message||`HTTP ${response.status}`);
    return data;
  }

  function readEngine(p){
    return {
      enabled:$(`${p}Enabled`).checked,
      autoAccept:$(`${p}Auto`).checked,
      milesMin:Number($(`${p}Min`).value)||0,
      milesMax:Number($(`${p}Max`).value)||0,
      dailyTripLimit:Number($(`${p}Limit`).value)||0,
      pickupTimeFrom:$(`${p}PUFrom`).value||"00:00",
      pickupTimeTo:$(`${p}PUTo`).value||"23:59",
      dropoffTimeFrom:$(`${p}DOFrom`).value||"00:00",
      dropoffTimeTo:$(`${p}DOTo`).value||"23:59",
      pickupZipCodes:arr($(`${p}PUZip`).value),
      dropoffZipCodes:arr($(`${p}DOZip`).value),
      zoneMatch:$(`${p}Zone`).value,
      modes:arr($(`${p}Modes`).value)
    };
  }

  function fillEngine(p,e={}){
    $(`${p}Enabled`).checked=!!e.enabled;
    $(`${p}Auto`).checked=!!e.autoAccept;
    const map=[["Min","milesMin"],["Max","milesMax"],["Limit","dailyTripLimit"],["PUFrom","pickupTimeFrom"],["PUTo","pickupTimeTo"],["DOFrom","dropoffTimeFrom"],["DOTo","dropoffTimeTo"],["Zone","zoneMatch"]];
    map.forEach(([suffix,key])=>{ if(e[key]!==undefined && e[key]!==null) $(`${p}${suffix}`).value=e[key]; });
    $(`${p}PUZip`).value=(e.pickupZipCodes||[]).join(", ");
    $(`${p}DOZip`).value=(e.dropoffZipCodes||[]).join(", ");
    $(`${p}Modes`).value=(e.modes||[]).join(", ");
  }

  function showStatus(session={}){
    const status=String(session.status||"DISCONNECTED").toUpperCase();
    const el=$("connectionStatus");
    el.textContent=status.replaceAll("_"," ");
    el.className="badge "+(status==="CONNECTED"?"ok":status==="VERIFICATION_REQUIRED"||status==="CONNECTING"?"warn":"bad");
    $("connectionMessage").textContent=session.lastError||session.message||"";
    $("verificationBox").style.display=status==="VERIFICATION_REQUIRED"?"block":"none";
  }

  async function load(){
    try{
      const [settings,status]=await Promise.all([api("/settings"),api("/status")]);
      const s=settings.settings||{};
      $("enabled").checked=!!s.enabled;
      $("connectionMethod").value=s.connectionMethod||"MTM_PORTAL";
      $("dateWindowDays").value=s.dateWindowDays||7;
      $("totalDailyTripLimit").value=s.totalDailyTripLimit||0;
      fillEngine("long",s.longEngine||{milesMin:100,milesMax:1000});
      fillEngine("short",s.shortEngine||{milesMin:0,milesMax:99.99});
      showStatus(status.session||{});
      const mock=s.connectionMethod==="MTM_MOCK";
      $("mtmUsername").disabled=mock; $("mtmPassword").disabled=mock; $("connectBtn").disabled=mock; $("disconnectBtn").disabled=mock;
      $("resetTestBtn").style.display=mock?"inline-block":"none";
    }catch(err){
      $("message").textContent=err.message;
    }
  }

  $("saveBtn").addEventListener("click",async()=>{
    try{
      $("message").textContent="Saving...";
      await api("/settings",{method:"PUT",body:JSON.stringify({
        enabled:$("enabled").checked,
        connectionMethod:$("connectionMethod").value,
        dateWindowDays:Number($("dateWindowDays").value)||7,
        totalDailyTripLimit:Number($("totalDailyTripLimit").value)||0,
        longEngine:readEngine("long"),
        shortEngine:readEngine("short")
      })});
      $("message").textContent="Saved.";
    }catch(err){ $("message").textContent=err.message; }
  });

  $("connectBtn").addEventListener("click",async()=>{
    try{
      $("connectionMessage").textContent="Connecting...";
      const data=await api("/connect",{method:"POST",body:JSON.stringify({
        username:$("mtmUsername").value.trim(),
        password:$("mtmPassword").value
      })});
      $("mtmPassword").value="";
      showStatus(data.session||data);
    }catch(err){ $("connectionMessage").textContent=err.message; }
  });

  $("verifyBtn").addEventListener("click",async()=>{
    try{
      const data=await api("/verify",{method:"POST",body:JSON.stringify({code:$("verificationCode").value.trim()})});
      $("verificationCode").value="";
      showStatus(data.session||data);
    }catch(err){ $("connectionMessage").textContent=err.message; }
  });

  $("cancelVerifyBtn").addEventListener("click",()=>{ $("verificationCode").value=""; $("verificationBox").style.display="none"; });

  $("disconnectBtn").addEventListener("click",async()=>{
    try{
      const data=await api("/disconnect",{method:"POST",body:"{}"});
      showStatus(data.session||{status:"DISCONNECTED"});
    }catch(err){ $("connectionMessage").textContent=err.message; }
  });

  $("connectionMethod").addEventListener("change",()=>{
    const mock=$("connectionMethod").value==="MTM_MOCK";
    $("mtmUsername").disabled=mock; $("mtmPassword").disabled=mock; $("connectBtn").disabled=mock; $("disconnectBtn").disabled=mock;
    $("resetTestBtn").style.display=mock?"inline-block":"none";
    if(mock) $("connectionMessage").textContent="TEST MODE uses simulated MTM trips. No username/password needed.";
  });

  $("resetTestBtn").addEventListener("click",async()=>{
    try{
      $("message").textContent="Resetting test trips...";
      const data=await api("/test/reset",{method:"POST",body:"{}"});
      $("message").textContent=data.message||"Test trips reset.";
    }catch(err){$("message").textContent=err.message;}
  });

  load();
})();