"use strict";

/*
DESTINATION PATH:
server/public/admin/js/marketplace.js

Marketplace multi-broker UI.
- Left broker/account navigation.
- One selected broker at a time.
- Connection-specific activity only.
- Legacy/unscoped activity is intentionally hidden.
- Manual Pair Token UI is removed from the Super Admin page.
*/

(()=>{
  const $=id=>document.getElementById(id);

  const token=()=>String(
    localStorage.getItem("token") ||
    sessionStorage.getItem("token") ||
    ""
  ).trim();

  const headers=()=>({
    "Content-Type":"application/json",
    Authorization:`Bearer ${token()}`
  });

  const esc=v=>String(v??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

  async function api(base,path,opt={}){
    const res=await fetch(
      base+path,
      {
        ...opt,
        headers:{
          ...headers(),
          ...(opt.headers||{})
        },
        cache:"no-store"
      }
    );

    const data=await res.json().catch(()=>({}));

    if(!res.ok){
      throw new Error(
        data.message ||
        `HTTP ${res.status}`
      );
    }

    return data;
  }

  const bridge=(p,o)=>
    api("/api/provider-portal-bridge",p,o);

  const market=(p,o)=>
    api("/api/marketplace",p,o);

  const state={
    connections:[],
    activity:[],
    selectedConnectionId:""
  };

  const palette=[
    "#d79a00",
    "#2867b2",
    "#198754",
    "#7b4db3",
    "#c74f50",
    "#0d7c86",
    "#aa6b22",
    "#475569"
  ];

  function hashText(value){
    let h=0;
    const s=String(value||"");
    for(let i=0;i<s.length;i++){
      h=((h<<5)-h)+s.charCodeAt(i);
      h|=0;
    }
    return Math.abs(h);
  }

  function brokerColor(item){
    const key=
      item?.brokerCode ||
      item?.brokerName ||
      item?.connectionId ||
      "";
    return palette[
      hashText(key)%palette.length
    ];
  }

  function badge(status){
    const s=String(
      status || "CONFIGURED"
    ).toUpperCase();

    const c=
      s==="CONNECTED"
        ? "ok"
        : (
            ["PAIRING","WAITING_LOGIN","TESTING","CONFIGURED"]
              .includes(s)
              ? "warn"
              : "bad"
          );

    return `<span class="badge ${c}">${esc(s.replaceAll("_"," "))}</span>`;
  }

  function selectedConnection(){
    return state.connections.find(
      x=>String(x.connectionId)===
         String(state.selectedConnectionId)
    ) || null;
  }

  function ensureSelection(){
    if(
      state.selectedConnectionId &&
      state.connections.some(
        x=>String(x.connectionId)===
           String(state.selectedConnectionId)
      )
    ){
      return;
    }

    state.selectedConnectionId=
      state.connections[0]?.connectionId || "";
  }

  function renderBrokerNav(){
    const host=$("brokerNav");

    if(!state.connections.length){
      host.innerHTML=
        '<div class="empty">No Marketplace broker connections are enabled.</div>';
      return;
    }

    host.innerHTML=
      state.connections.map(item=>{
        const active=
          String(item.connectionId)===
          String(state.selectedConnectionId);

        const accent=brokerColor(item);

        return `
          <button
            type="button"
            class="broker-tab ${active?"active":""}"
            data-broker-id="${esc(item.connectionId)}"
            style="--accent:${accent}"
          >
            <div class="broker-tab-name">
              ${esc(item.brokerName || item.brokerCode || "Broker")}
            </div>
            <div class="broker-tab-account">
              ${esc(item.accountLabel || "Primary Account")}
              ${item.brokerCode ? ` · ${esc(item.brokerCode)}` : ""}
            </div>
          </button>
        `;
      }).join("");

    host
      .querySelectorAll("[data-broker-id]")
      .forEach(btn=>{
        btn.addEventListener(
          "click",
          ()=>{
            state.selectedConnectionId=
              btn.dataset.brokerId || "";

            load();
          }
        );
      });
  }

  function portalHost(item){
    if(item?.sourceHost){
      return item.sourceHost;
    }

    try{
      return new URL(item?.portalUrl || "").host;
    }catch(_){
      return item?.portalUrl || "";
    }
  }

  function renderSelectedConnection(){
    const item=selectedConnection();
    const hero=$("brokerHero");

    if(!item){
      $("selectedBrokerName").textContent="Marketplace";
      $("selectedBrokerSub").textContent="No broker account selected.";
      $("selectedBrokerBadge").innerHTML="";
      $("selectedBrokerDetails").innerHTML=
        '<div class="empty">No active Marketplace connection.</div>';
      $("connectBtn").disabled=true;
      $("disconnectBtn").disabled=true;
      $("scanBtn").disabled=true;
      return;
    }

    const accent=brokerColor(item);
    hero.style.setProperty("--accent",accent);

    $("selectedBrokerName").textContent=
      item.brokerName ||
      item.brokerCode ||
      "Broker";

    $("selectedBrokerSub").textContent=
      `${item.accountLabel || "Primary Account"}${item.brokerCode ? ` · ${item.brokerCode}` : ""}`;

    $("selectedBrokerBadge").innerHTML=
      badge(item.connectionStatus);

    $("selectedBrokerDetails").innerHTML=`
      <div class="row">
        <span class="muted">Portal:</span>
        <strong>${esc(portalHost(item) || "—")}</strong>
      </div>

      <div class="row">
        <span class="muted">Mapping:</span>
        <strong>${esc(item.mapper?.ready ? "READY" : "WAITING")}</strong>
        <span class="muted">
          Discoveries: ${Number(item.discoveriesReceived || 0)}
        </span>
      </div>

      <div class="row">
        <span class="muted">Connection ID:</span>
        <span>${esc(item.connectionId || "—")}</span>
      </div>
    `;

    $("connectBtn").disabled=false;
    $("disconnectBtn").disabled=false;
    $("scanBtn").disabled=false;
  }

  function rowConnectionId(row){
    return String(
      row?.connectionId ||
      row?.marketplaceConnectionId ||
      row?.brokerIntegrationId ||
      row?.meta?.connectionId ||
      row?.meta?.marketplaceConnectionId ||
      row?.meta?.brokerIntegrationId ||
      ""
    ).trim();
  }

  function renderActivity(){
    const selected=String(
      state.selectedConnectionId || ""
    );

    /*
      Hide old legacy rows that do not identify a broker connection.
      They are the pre-multi-broker test rows seen on the old page.
    */
    const rows=
      state.activity.filter(row=>{
        const id=rowConnectionId(row);
        return Boolean(id) && id===selected;
      });

    $("activityRows").innerHTML=
      rows.length
        ? rows.map(r=>`
            <tr>
              <td>
                ${r.occurredAt
                  ? esc(new Date(r.occurredAt).toLocaleString())
                  : "—"}
              </td>
              <td>${esc(r.engine || "—")}</td>
              <td>${esc(r.action || "—")}</td>
              <td>
                ${esc(
                  [
                    r.meta?.brokerName,
                    r.meta?.accountLabel
                  ]
                  .filter(Boolean)
                  .join(" / ") ||
                  selectedConnection()?.brokerName ||
                  "—"
                )}
              </td>
              <td>${esc(r.externalTripId || "—")}</td>
              <td>${r.miles ?? "—"}</td>
              <td>${esc(r.message || "")}</td>
            </tr>
          `).join("")
        : '<tr><td colspan="7">No activity for this broker/account yet.</td></tr>';
  }

  function renderAll(){
    ensureSelection();
    renderBrokerNav();
    renderSelectedConnection();
    renderActivity();
  }

  async function connectSelected(){
    const item=selectedConnection();

    if(!item){
      return;
    }

    /*
      Super Admin no longer sees/copies a Pair Token.
      The temporary token is prepared internally for the next local-agent
      automatic handoff step. Portal credentials/MFA are still entered only
      on the broker website.
    */
    try{
      $("connectBtn").disabled=true;
      $("connectionStatus").textContent=
        "Preparing this broker connection...";

      const prepared=
        await bridge(
          "/pair",
          {
            method:"POST",
            body:JSON.stringify({
              connectionId:item.connectionId
            })
          }
        );

      /*
        Keep the token out of the visible UI.
        The current browser-agent automatic handoff is the next local-agent
        transport step; do not expose the token to the Super Admin.
      */
      if(prepared?.agentToken){
        sessionStorage.setItem(
          `ghMarketplacePair:${item.connectionId}`,
          prepared.agentToken
        );
      }

      if(item.portalUrl){
        window.open(
          item.portalUrl,
          "_blank",
          "noopener"
        );
      }

      $("connectionStatus").textContent=
        "Portal opened. Sign in directly on the broker website.";

      await load();

    }catch(err){
      $("connectionStatus").textContent=
        err.message ||
        "Failed to prepare broker connection.";
    }finally{
      $("connectBtn").disabled=false;
    }
  }

  async function disconnectSelected(){
    const item=selectedConnection();

    if(!item){
      return;
    }

    try{
      await bridge(
        `/connections/${encodeURIComponent(item.connectionId)}/disconnect`,
        {
          method:"POST",
          body:"{}"
        }
      );

      sessionStorage.removeItem(
        `ghMarketplacePair:${item.connectionId}`
      );

      $("connectionStatus").textContent=
        "Disconnected.";

      await load();

    }catch(err){
      $("connectionStatus").textContent=
        err.message ||
        "Disconnect failed.";
    }
  }

  async function scanSelected(){
    const item=selectedConnection();

    if(!item){
      return;
    }

    try{
      $("scanBtn").disabled=true;
      $("scanStatus").textContent=
        `Scanning ${item.brokerName || "selected broker"}...`;

      const data=
        await market(
          "/scan",
          {
            method:"POST",
            body:JSON.stringify({
              connectionId:item.connectionId
            })
          }
        );

      $("scanStatus").textContent=
        data.message ||
        "Scan complete.";

      await load();

    }catch(err){
      $("scanStatus").textContent=
        err.message ||
        "Scan failed.";
    }finally{
      $("scanBtn").disabled=false;
    }
  }

  let legacyCleanupDone=false;

  async function load(){
    try{
      const connectionsData=
        await bridge("/connections");

      state.connections=
        Array.isArray(connectionsData.connections)
          ? connectionsData.connections
          : [];

      ensureSelection();

      if(!legacyCleanupDone){
        legacyCleanupDone=true;
        await market(
          "/activity/cleanup-legacy",
          {
            method:"POST",
            body:"{}"
          }
        ).catch(()=>{});
      }

      const connectionId=
        String(
          state.selectedConnectionId ||
          ""
        );

      const activityData=
        connectionId
          ? await market(
              `/activity?connectionId=${encodeURIComponent(connectionId)}&limit=200`
            )
          : {activity:[]};

      state.activity=
        Array.isArray(activityData.activity)
          ? activityData.activity
          : [];

      renderAll();

    }catch(err){
      $("scanStatus").textContent=
        err.message ||
        "Failed to load Marketplace.";
    }
  }

  $("refreshBtn")
    ?.addEventListener("click",load);

  $("connectBtn")
    ?.addEventListener(
      "click",
      connectSelected
    );

  $("disconnectBtn")
    ?.addEventListener(
      "click",
      disconnectSelected
    );

  $("scanBtn")
    ?.addEventListener(
      "click",
      scanSelected
    );

  load();

  setInterval(
    load,
    15000
  );
})();
