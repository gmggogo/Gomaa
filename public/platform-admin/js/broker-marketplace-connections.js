"use strict";
/* DESTINATION PATH: server/public/platform-admin/js/broker-marketplace-connections.js */
(()=>{
  const $=id=>document.getElementById(id);
  const state={integrations:[],connections:[]};
  const token=()=>String(sessionStorage.getItem("staffToken")||sessionStorage.getItem("token")||localStorage.getItem("token")||"").trim();
  const headers=()=>({"Content-Type":"application/json",Authorization:`Bearer ${token()}`});
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

  async function api(url,opt={}){
    const r=await fetch(url,{...opt,headers:{...headers(),...(opt.headers||{})},cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.message||`HTTP ${r.status}`);
    return d;
  }

  function tenantName(item){
    const row=state.integrations.find(x=>String(x._id)===String(item.brokerIntegrationId));
    return row?.tenantSlug||item.tenantSlug||item.tenantId||"";
  }

  function renderIntegrationOptions(){
    const el=$("marketBrokerIntegration");
    if(!el) return;
    const current=el.value;
    el.innerHTML='<option value="">Select Broker Integration</option>'+state.integrations.map(x=>
      `<option value="${esc(x._id)}">${esc(x.tenantSlug||x.tenantId)} — ${esc(x.brokerName)} (${esc(x.brokerCode)})</option>`
    ).join("");
    if([...el.options].some(o=>o.value===current)) el.value=current;
  }

  function renderConnections(){
    const body=$("marketplaceConnectionRows");
    if(!body) return;
    if(!state.connections.length){body.innerHTML='<tr><td colspan="8">No Marketplace connections configured.</td></tr>';return;}
    body.innerHTML=state.connections.map(x=>`<tr>
      <td>${esc(tenantName(x))}</td><td>${esc(x.brokerName)} (${esc(x.brokerCode)})</td><td>${esc(x.accountLabel)}</td>
      <td style="max-width:300px;word-break:break-all">${esc(x.portalUrl)}</td><td>${x.billingEnabled?"Active":"Disabled"}</td>
      <td>$${Number(x.monthlyFlatFee||0).toFixed(2)}</td><td><span class="status ${esc(x.connectionStatus||"")}">${esc(x.connectionStatus||"")}</span></td>
      <td><button class="btn btn-light" data-market-edit="${esc(x._id)}">Edit</button></td>
    </tr>`).join("");
    body.querySelectorAll("[data-market-edit]").forEach(btn=>btn.addEventListener("click",()=>edit(btn.dataset.marketEdit)));
  }

  function clear(){
    $("marketplaceConnectionRecordId").value="";$("marketBrokerIntegration").value="";$("marketAccountLabel").value="Primary Account";
    $("marketPortalUrl").value="";$("marketMonthlyFee").value="0";$("marketFeatureVisible").value="true";$("marketEnabled").value="true";$("marketBillingEnabled").value="true";
  }

  function edit(id){
    const x=state.connections.find(v=>String(v._id)===String(id)); if(!x) return;
    $("marketplaceConnectionRecordId").value=x._id;$("marketBrokerIntegration").value=String(x.brokerIntegrationId||"");
    $("marketAccountLabel").value=x.accountLabel||"Primary Account";$("marketPortalUrl").value=x.portalUrl||"";$("marketMonthlyFee").value=Number(x.monthlyFlatFee||0);
    $("marketFeatureVisible").value=String(x.featureVisible!==false);$("marketEnabled").value=String(x.enabled!==false);$("marketBillingEnabled").value=String(x.billingEnabled!==false);
    $("marketplaceConnectionPanel")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function load(){
    const [a,b]=await Promise.all([api("/api/platform/broker-integrations"),api("/api/platform/broker-integrations/marketplace-connections")]);
    state.integrations=a.integrations||[];state.connections=b.connections||[];renderIntegrationOptions();renderConnections();
  }

  async function save(){
    const integration=state.integrations.find(x=>String(x._id)===String($("marketBrokerIntegration").value));
    if(!integration) return alert("Select a Broker Integration first.");
    const portalUrl=$("marketPortalUrl").value.trim(); if(!portalUrl) return alert("Provider Portal URL is required.");
    try{
      await api("/api/platform/broker-integrations/marketplace-connections",{method:"POST",body:JSON.stringify({
        _id:$("marketplaceConnectionRecordId").value||undefined,tenantId:integration.tenantId,tenantSlug:integration.tenantSlug,
        brokerIntegrationId:integration._id,accountLabel:$("marketAccountLabel").value.trim()||"Primary Account",portalUrl,
        monthlyFlatFee:Number($("marketMonthlyFee").value||0),featureVisible:$("marketFeatureVisible").value==="true",
        enabled:$("marketEnabled").value==="true",billingEnabled:$("marketBillingEnabled").value==="true"
      })});
      clear();await load();alert("Marketplace connection saved.");
    }catch(e){alert(e.message);}
  }

  $("saveMarketplaceConnectionBtn")?.addEventListener("click",save);
  $("clearMarketplaceConnectionBtn")?.addEventListener("click",clear);
  clear();load().catch(e=>console.error("MARKETPLACE CONNECTIONS:",e));
})();
