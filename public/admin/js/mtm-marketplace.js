
"use strict";
/* DESTINATION PATH: server/public/admin/js/mtm-marketplace.js */
(()=>{
  const $=id=>document.getElementById(id);
  const token=()=>String(localStorage.getItem("token")||"").trim();
  const headers=()=>({"Content-Type":"application/json","Authorization":`Bearer ${token()}`});

  async function api(path,opt={}){
    const response=await fetch(`/api/mtm-marketplace${path}`,{...opt,headers:headers()});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.message||`HTTP ${response.status}`);
    return data;
  }

  function connection(session={}){
    const s=String(session.status||"DISCONNECTED").toUpperCase();
    const el=$("connectionStatus");
    el.textContent=s.replaceAll("_"," ");
    el.className="badge "+(s==="CONNECTED"?"ok":s==="VERIFICATION_REQUIRED"||s==="CONNECTING"?"warn":"bad");
  }

  function engineLabel(engine={}){
    if(!engine.enabled) return "OFF";
    return engine.autoAccept ? "AUTO" : "ON";
  }

  function activityRows(rows=[]){
    $("activityRows").innerHTML=rows.length?rows.map(row=>`
      <tr>
        <td>${row.occurredAt?new Date(row.occurredAt).toLocaleString():"—"}</td>
        <td>${row.engine||"—"}</td>
        <td>${row.action||"—"}</td>
        <td>${row.externalTripId||row.tripNumber||"—"}</td>
        <td>${row.miles??"—"}</td>
        <td>${row.message||""}</td>
      </tr>`).join(""):`<tr><td colspan="6" class="muted">No activity yet.</td></tr>`;
  }

  async function load(){
    try{
      const [settings,status,activity]=await Promise.all([
        api("/settings"),
        api("/status"),
        api("/activity?limit=100")
      ]);
      const s=settings.settings||{};
      connection(status.session||{});
      $("longStatus").textContent=engineLabel(s.longEngine||{});
      $("shortStatus").textContent=engineLabel(s.shortEngine||{});
      $("lastScan").textContent=s.lastScanAt?new Date(s.lastScanAt).toLocaleString():"—";
      const rows=activity.activity||[];
      const today=new Date().toDateString();
      $("claimedToday").textContent=rows.filter(x=>String(x.action||"").toUpperCase()==="CLAIMED" && x.occurredAt && new Date(x.occurredAt).toDateString()===today).length;
      $("resetTestBtn").style.display=s.connectionMethod==="MTM_MOCK"?"inline-block":"none";
      activityRows(rows);
      $("scanStatus").textContent=s.enabled?"Marketplace enabled":"Marketplace disabled";
    }catch(err){
      $("scanStatus").textContent=err.message;
    }
  }

  $("refreshBtn").addEventListener("click",load);
  $("scanBtn").addEventListener("click",async()=>{
    try{
      $("scanBtn").disabled=true;
      $("scanStatus").textContent="Scanning...";
      const result=await api("/scan",{method:"POST",body:"{}"});
      $("scanStatus").textContent=result.message||"Scan completed.";
      await load();
    }catch(err){
      $("scanStatus").textContent=err.message;
    }finally{
      $("scanBtn").disabled=false;
    }
  });

  $("resetTestBtn").addEventListener("click",async()=>{
    try{
      $("scanStatus").textContent="Resetting Mock MTM...";
      const data=await api("/test/reset",{method:"POST",body:"{}"});
      $("scanStatus").textContent=data.message||"Mock reset.";
      await load();
    }catch(err){$("scanStatus").textContent=err.message;}
  });

  load();
  setInterval(load,15000);
})();