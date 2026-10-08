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


  function friendlyTripNumber(row={}){
    const value=String(
      row.meta?.tripNumber ||
      row.tripNumber ||
      ""
    ).trim();

    const internal=String(
      row.externalTripId ||
      row.meta?.portalTripId ||
      ""
    ).trim();

    if(!value){
      return "—";
    }

    if(
      internal &&
      value===internal
    ){
      return "—";
    }

    if(
      value.length>=16 &&
      /^[A-Za-z0-9+/_=-]+$/.test(value) &&
      !/^\d+$/.test(value)
    ){
      return "—";
    }

    return value;
  }

  function displayTripDate(row={}){
    const raw=String(
      row.tripDate ||
      row.meta?.tripDate ||
      row.pickupTime ||
      row.meta?.tripTime ||
      ""
    );

    const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[2]}/${m[3]}/${m[1]}` : (raw || "—");
  }

  function displayPickupTime(row={}){
    const raw=String(
      row.pickupTime ||
      row.meta?.tripTime ||
      row.meta?.appointmentTime ||
      ""
    );

    const m=raw.match(/T?(\d{1,2}):(\d{2})/);
    if(!m) return raw || "—";

    let hour=Number(m[1]);
    const minute=m[2];
    const ap=hour>=12 ? "PM" : "AM";
    hour=hour%12 || 12;

    return `${hour}:${minute} ${ap}`;
  }

  function zoneDistance(row={}){
    const zone=row.meta?.zone || {};
    const parts=[];

    if(Number.isFinite(Number(zone.pickupDistanceMiles))){
      parts.push(`PU ${Number(zone.pickupDistanceMiles).toFixed(1)} mi`);
    }

    if(Number.isFinite(Number(zone.dropoffDistanceMiles))){
      parts.push(`DO ${Number(zone.dropoffDistanceMiles).toFixed(1)} mi`);
    }

    return parts.join(" / ") || "—";
  }


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

  /*
    Local Browser Agent controller.
    The agent is installed once on the office computer and starts with Windows.
    Super Admin never sees/copies pairing tokens.
  */
  const LOCAL_AGENT_ORIGIN="http://127.0.0.1:18733";

  async function localAgent(path,opt={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);

    try{
      const response=await fetch(
        `${LOCAL_AGENT_ORIGIN}${path}`,
        {
          ...opt,
          mode:"cors",
          cache:"no-store",
          signal:controller.signal,
          headers:{
            "Content-Type":"application/json",
            ...(opt.headers||{})
          }
        }
      );

      const data=await response.json().catch(()=>({}));

      if(!response.ok){
        throw new Error(
          data.message ||
          `Local Agent HTTP ${response.status}`
        );
      }

      return data;
    }finally{
      clearTimeout(timer);
    }
  }

  const state={
    connections:[],
    activity:[],
    selectedConnectionId:"",
    localStatus:null,
    cloudAgentStatus:null,
    serverPreflight:null,
    loginConsole:{
      open:false,
      timer:null,
      frame:null,
      publicKey:null,
      busy:false
    }
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

  function setStage(
    id,
    text,
    stateName="warn"
  ){
    const el=$(id);

    if(!el){
      return;
    }

    el.textContent=
      text;

    el.classList.remove(
      "ready-yes",
      "ready-warn",
      "ready-no"
    );

    el.classList.add(
      stateName==="yes"
        ? "ready-yes"
        : (
            stateName==="no"
              ? "ready-no"
              : "ready-warn"
          )
    );
  }

  function renderAgentDiagnostics(){
    const host=$("agentDiagnostics");
    if(!host){
      return;
    }

    const session=
      state.localStatus?.session ||
      null;

    const cloud=
      state.localStatus?.cloud===true;

    if(!cloud || !session){
      host.hidden=true;
      return;
    }

    host.hidden=false;

    const set=(id,value)=>{
      const el=$(id);
      if(!el){
        return;
      }

      el.textContent=
        value===undefined ||
        value===null ||
        value===""
          ? "—"
          : String(value);
    };

    set("diagCurrentUrl",session.currentUrl);
    set("diagCurrentTitle",session.currentTitle);
    set("diagLogin",session.loginDetected===true ? "YES" : "NO");
    set("diagTripsPage",session.tripsPageDetected===true ? "YES" : "NO");
    set("diagDiscovered",Number(session.discovered || 0));
    set("diagPosted",Number(session.discoveriesPosted || 0));
    set("diagNetwork",Number(session.networkCandidates || 0));
    set("diagDom",Number(session.domCandidates || 0));

    set(
      "diagDiscoveryType",
      [
        session.lastDiscoveryType || "",
        session.lastDiscoveryAt || ""
      ].filter(Boolean).join(" · ") || "—"
    );

    set(
      "diagMapper",
      [
        session.mapperReady===true ? "READY" : "WAITING",
        session.mapperMethod || ""
      ].filter(Boolean).join(" · ")
    );

    set("diagLastError",session.lastError || "—");
  }

  function renderReadiness(){
    const item=
      selectedConnection();

    const local=
      state.localStatus?.session ||
      null;

    const preflight=
      state.serverPreflight ||
      null;

    renderAgentDiagnostics();

    if(!item){
      setStage(
        "stageAgent",
        "No Connection",
        "no"
      );

      setStage(
        "stageBrowser",
        "Not Started",
        "warn"
      );

      setStage(
        "stageLogin",
        "Waiting",
        "warn"
      );

      setStage(
        "stageDiscovery",
        "Waiting",
        "warn"
      );

      setStage(
        "stageMapping",
        "Waiting",
        "warn"
      );

      setStage(
        "stageAction",
        "Not Validated",
        "warn"
      );

      return;
    }

    if(
      state.localStatus?.agentOnline===true
    ){
      setStage(
        "stageAgent",
        "READY",
        "yes"
      );
    }else{
      setStage(
        "stageAgent",
        "OFFLINE",
        "no"
      );
    }

    if(
      local?.running &&
      local?.debugAttached
    ){
      setStage(
        "stageBrowser",
        "CONNECTED",
        "yes"
      );

    }else if(local?.running){
      setStage(
        "stageBrowser",
        "STARTING",
        "warn"
      );

    }else{
      setStage(
        "stageBrowser",
        "Not Started",
        "warn"
      );
    }

    if(local?.loginDetected){
      setStage(
        "stageLogin",
        "DETECTED",
        "yes"
      );

    }else if(local?.running){
      setStage(
        "stageLogin",
        "Waiting Login",
        "warn"
      );

    }else{
      setStage(
        "stageLogin",
        "Waiting",
        "warn"
      );
    }

    const discoveries=
      Number(
        item.discoveriesReceived ||
        0
      );

    const posted=
      Number(
        local?.discoveriesPosted ||
        0
      );

    if(
      discoveries>0 ||
      posted>0
    ){
      const method=
        local?.lastDiscoveryType ||
        item?.mapper?.lastDiscoveryType ||
        "DISCOVERY";

      setStage(
        "stageDiscovery",
        `${method} · ${Math.max(discoveries,posted)}`,
        "yes"
      );

    }else if(
      local?.tripsPageDetected
    ){
      setStage(
        "stageDiscovery",
        "Trips Page Seen",
        "warn"
      );

    }else{
      setStage(
        "stageDiscovery",
        "Waiting",
        "warn"
      );
    }

    if(item?.mapper?.ready){
      setStage(
        "stageMapping",
        item.mapper.method ||
        "READY",
        "yes"
      );

    }else if(
      preflight?.mapping?.method
    ){
      setStage(
        "stageMapping",
        `${preflight.mapping.method} · WAITING`,
        "warn"
      );

    }else{
      setStage(
        "stageMapping",
        "WAITING",
        "warn"
      );
    }

    const actionReady=
      item?.mapper?.actionReady===true ||
      preflight?.action?.ready===true;

    const actionDetected=
      item?.mapper?.actionDetected===true ||
      preflight?.action?.detected===true ||
      local?.actionDetected===true;

    if(actionReady){
      setStage(
        "stageAction",
        "VERIFIED",
        "yes"
      );

    }else if(actionDetected){
      setStage(
        "stageAction",
        "Detected · Needs Validation",
        "warn"
      );

    }else{
      setStage(
        "stageAction",
        "Not Detected",
        "warn"
      );
    }
  }


  function hasPaidMarketplaceAccess(item){
    return Boolean(
      item &&
      item.enabled !== false &&
      item.featureVisible !== false &&
      item.billingEnabled === true &&
      item.paidMarketplaceAccess !== false
    );
  }

  function consoleConnectionPath(suffix=""){
    const item=selectedConnection();
    if(!item) throw new Error("No broker account selected");
    if(!hasPaidMarketplaceAccess(item)){
      throw new Error("Marketplace access for this broker is disabled by Platform Admin or billing is inactive.");
    }
    return `/connections/${encodeURIComponent(item.connectionId)}/login-console${suffix}`;
  }

  function pemToArrayBuffer(pem){
    const body=String(pem||"")
      .replace(/-----BEGIN PUBLIC KEY-----/g,"")
      .replace(/-----END PUBLIC KEY-----/g,"")
      .replace(/\s+/g,"");

    const binary=atob(body);
    const bytes=new Uint8Array(binary.length);

    for(let i=0;i<binary.length;i++){
      bytes[i]=binary.charCodeAt(i);
    }

    return bytes.buffer;
  }

  async function encryptConsoleText(plainText,pem){
    if(!window.crypto?.subtle){
      throw new Error("Secure browser encryption is not available.");
    }

    if(!pem){
      throw new Error("Oracle login console encryption key is not ready yet.");
    }

    const publicKey=
      await crypto.subtle.importKey(
        "spki",
        pemToArrayBuffer(pem),
        {
          name:"RSA-OAEP",
          hash:"SHA-256"
        },
        false,
        ["encrypt"]
      );

    const bytes=
      new TextEncoder()
        .encode(
          String(plainText||"")
        );

    if(bytes.length>180){
      throw new Error("Send login text in shorter parts (maximum about 180 characters at a time).");
    }

    const encrypted=
      await crypto.subtle.encrypt(
        {
          name:"RSA-OAEP"
        },
        publicKey,
        bytes
      );

    const data=
      new Uint8Array(
        encrypted
      );

    let binary="";
    for(const value of data){
      binary+=String.fromCharCode(value);
    }

    return btoa(binary);
  }

  function setLoginConsoleStatus(text){
    const el=$("loginConsoleStatus");
    if(el) el.textContent=String(text||"");
  }

  function renderLoginConsoleFrame(frame){
    if(!frame) return;

    state.loginConsole.frame=frame;

    if(frame.consolePublicKey){
      state.loginConsole.publicKey=
        frame.consolePublicKey;
    }

    const imageEl=$("loginConsoleImage");
    if(
      imageEl &&
      frame.imageData
    ){
      imageEl.src=
        `data:image/png;base64,${frame.imageData}`;
    }

    const urlEl=$("loginConsoleUrl");
    if(urlEl){
      urlEl.textContent=
        frame.currentUrl ||
        "";
    }

    const status=[];
    status.push(
      frame.loginDetected
        ? "Portal page detected"
        : "Waiting for portal"
    );

    if(frame.tripsPageDetected){
      status.push("Trips page detected");
    }

    setLoginConsoleStatus(
      status.join(" · ")
    );
  }

  async function pollLoginConsoleFrame(){
    if(!state.loginConsole.open){
      return;
    }

    try{
      const data=
        await bridge(
          consoleConnectionPath("/frame")
        );

      if(data.frame){
        renderLoginConsoleFrame(
          data.frame
        );
      }else{
        setLoginConsoleStatus(
          "Waiting for Oracle browser frame..."
        );
      }

    }catch(err){
      setLoginConsoleStatus(
        err.message ||
        "Login console frame failed."
      );
    }
  }

  function startLoginConsolePolling(){
    if(state.loginConsole.timer){
      clearInterval(
        state.loginConsole.timer
      );
    }

    state.loginConsole.timer=
      setInterval(
        pollLoginConsoleFrame,
        1200
      );
  }

  function stopLoginConsolePolling(){
    if(state.loginConsole.timer){
      clearInterval(
        state.loginConsole.timer
      );
      state.loginConsole.timer=null;
    }
  }

  async function queueLoginConsoleAction(action,payload={}){
    if(state.loginConsole.busy){
      return;
    }

    state.loginConsole.busy=true;

    try{
      await bridge(
        consoleConnectionPath("/action"),
        {
          method:"POST",
          body:
            JSON.stringify({
              action,
              ...payload
            })
        }
      );

      setTimeout(
        ()=>pollLoginConsoleFrame(),
        220
      );

    }finally{
      state.loginConsole.busy=false;
    }
  }

  async function openLoginConsole(){
    const item=selectedConnection();
    if(!item) return;

    if(!hasPaidMarketplaceAccess(item)){
      setLoginConsoleStatus(
        "Marketplace access is disabled by Platform Admin or billing is inactive."
      );
      return;
    }

    const overlay=$("loginConsoleOverlay");
    const broker=$("loginConsoleBroker");

    if(broker){
      broker.textContent=
        `${item.brokerName || item.brokerCode || "Broker"} · ${item.accountLabel || "Primary Account"}`;
    }

    state.loginConsole.open=true;
    state.loginConsole.frame=null;
    state.loginConsole.publicKey=null;

    if(overlay){
      overlay.classList.add("open");
      overlay.setAttribute("aria-hidden","false");
    }

    setLoginConsoleStatus(
      "Opening Oracle broker browser..."
    );

    try{
      await bridge(
        consoleConnectionPath("/open"),
        {
          method:"POST",
          body:"{}"
        }
      );

      await pollLoginConsoleFrame();
      startLoginConsolePolling();

    }catch(err){
      setLoginConsoleStatus(
        err.message ||
        "Failed to open login console."
      );
    }
  }

  function closeLoginConsole(){
    state.loginConsole.open=false;
    stopLoginConsolePolling();

    const overlay=$("loginConsoleOverlay");
    if(overlay){
      overlay.classList.remove("open");
      overlay.setAttribute("aria-hidden","true");
    }

    const text=$("loginConsoleText");
    if(text){
      text.value="";
    }
  }

  function renderConnectLoginVisibility(){
    const btn=$("connectBtn");
    const item=selectedConnection();

    if(!btn){
      return;
    }

    if(!item){
      btn.hidden=true;
      return;
    }

    const session=
      state.localStatus?.session ||
      null;

    const oracleOnline=
      state.localStatus?.cloud===true &&
      state.localStatus?.agentOnline===true;

    const authenticated=
      oracleOnline &&
      session?.running===true &&
      session?.debugAttached===true &&
      session?.loginDetected===true;

    /*
      Desired UX:
      - authenticated Oracle broker session => hide Connect/Login completely
      - expired/logged-out/not-yet-authenticated => show it again
      - the same button reopens the secure Oracle login console when needed
    */
    btn.hidden=authenticated;

    if(authenticated){
      btn.disabled=true;
      btn.textContent="Connect / Login";
    }else{
      btn.disabled=false;
      btn.textContent=
        oracleOnline && session?.running
          ? "Login / Reconnect"
          : "Connect / Login";
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
      $("connectBtn").hidden=true;
      $("connectBtn").disabled=true;
      $("loginConsoleBtn").disabled=true;
      $("disconnectBtn").disabled=true;
      $("scanBtn").disabled=true;
      renderReadiness();
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
      <div class="detail-cell">
        <span class="detail-label">Portal</span>
        <span class="detail-value">${esc(portalHost(item) || "—")}</span>
      </div>

      <div class="detail-cell">
        <span class="detail-label">Mapping</span>
        <span class="detail-inline">
          <span class="detail-value ${item.mapper?.ready ? "ready" : ""}">
            ${esc(item.mapper?.ready ? "READY" : "WAITING")}
          </span>
          <span class="detail-sub">Discoveries: ${Number(item.discoveriesReceived || 0)}</span>
        </span>
      </div>

      <div class="detail-cell">
        <span class="detail-label">Connection ID</span>
        <span class="detail-value">${esc(item.connectionId || "—")}</span>
      </div>
    `;

    $("loginConsoleBtn").disabled=false;
    $("disconnectBtn").disabled=false;

    $("scanBtn").disabled=
      item?.mapper?.ready!==true;

    renderReadiness();
    renderConnectLoginVisibility();
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
        ? rows.map(r=>{
            const action=String(r.action || "").toUpperCase();
            const rowClass=
              action==="MATCHED"
                ? "activity-matched"
                : (
                    action==="SEEN"
                      ? "activity-seen"
                      : ""
                  );

            return `
            <tr class="${rowClass}">
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
              <td>${esc(friendlyTripNumber(r))}</td>
              <td>${esc(displayTripDate(r))}</td>
              <td>${esc(displayPickupTime(r))}</td>
              <td>${esc(r.meta?.pickupAddress || "—")}</td>
              <td>${esc(r.meta?.dropoffAddress || "—")}</td>
              <td>${esc(r.mode || r.meta?.mode || "—")}</td>
              <td>${r.miles ?? "—"}</td>
              <td>${esc(r.reason || (r.action==="MATCHED" ? "MATCHED" : "—"))}</td>
              <td>${esc(zoneDistance(r))}</td>
              <td>${esc(r.message || "")}</td>
            </tr>
          `;
          }).join("")
        : '<tr><td colspan="14">No activity for this broker/account yet.</td></tr>';
  }

  function renderAll(){
    ensureSelection();
    renderBrokerNav();
    renderSelectedConnection();
    renderActivity();
  }

  function selectedCloudAgentState(cloudStatus,item){
    const connectionId=String(item?.connectionId || "");
    const nodes=Array.isArray(cloudStatus?.nodes)
      ? cloudStatus.nodes
      : [];

    const onlineNodes=nodes.filter(node=>node?.online===true);

    for(const node of onlineNodes){
      const sessions=Array.isArray(node?.sessions)
        ? node.sessions
        : [];

      const session=sessions.find(
        row=>String(row?.connectionId || "")===connectionId
      );

      if(session){
        return {
          agentOnline:true,
          cloud:true,
          nodeId:node?.nodeId || "",
          session
        };
      }
    }

    if(onlineNodes.length){
      return {
        agentOnline:true,
        cloud:true,
        nodeId:onlineNodes[0]?.nodeId || "",
        session:null
      };
    }

    return null;
  }

  async function refreshPreflight(){
    const item=
      selectedConnection();

    if(!item){
      state.localStatus=null;
      state.cloudAgentStatus=null;
      state.serverPreflight=null;
      renderReadiness();
      return;
    }

    const connectionId=
      encodeURIComponent(
        item.connectionId
      );

    const [
      cloudResult,
      localResult,
      serverResult
    ]=
      await Promise.all([
        bridge(
          "/agent-cloud-status"
        )
        .catch(
          ()=>({
            success:false,
            configured:false,
            nodes:[]
          })
        ),

        localAgent(
          `/status?connectionId=${connectionId}`,
          {
            method:"GET"
          }
        )
        .then(
          data=>({
            agentOnline:true,
            cloud:false,
            ...(data||{})
          })
        )
        .catch(
          ()=>({
            agentOnline:false,
            cloud:false,
            session:null
          })
        ),

        bridge(
          `/preflight?connectionId=${connectionId}`
        )
        .catch(
          err=>({
            success:false,
            ready:false,
            message:
              err.message ||
              "Server preflight failed"
          })
        )
      ]);

    state.cloudAgentStatus=
      cloudResult;

    const cloudSelected=
      selectedCloudAgentState(
        cloudResult,
        item
      );

    state.localStatus=
      cloudSelected ||
      localResult;

    state.serverPreflight=
      serverResult;

    renderReadiness();

    const statusEl=
      $("connectionStatus");

    if(statusEl && cloudSelected?.agentOnline===true){
      const session=
        cloudSelected?.session ||
        null;

      const authenticated=
        session?.running===true &&
        session?.debugAttached===true &&
        session?.loginDetected===true;

      if(authenticated){
        statusEl.textContent=
          "Oracle Cloud Agent is connected and authenticated for this broker.";

        if(state.loginConsole?.open===true){
          closeLoginConsole();
        }
      }else if(
        session?.running ||
        session?.debugAttached
      ){
        statusEl.textContent=
          "Oracle Cloud Agent is connected. Broker login is required.";
      }else{
        statusEl.textContent=
          "Oracle Cloud Agent is online. Waiting for this broker session.";
      }

      renderConnectLoginVisibility();
    }
  }

  async function connectSelected(){
    const item=selectedConnection();

    if(!item){
      return;
    }

    try{
      $("connectBtn").disabled=true;

      /*
        Oracle Cloud Agent is the primary always-on agent. When it is online,
        never fall back to 127.0.0.1 on the admin's laptop and never show the
        old "agent is not running on this computer" message.
      */
      const cloudResult=
        await bridge(
          "/agent-cloud-status"
        )
        .catch(
          ()=>({
            success:false,
            nodes:[]
          })
        );

      const cloudSelected=
        selectedCloudAgentState(
          cloudResult,
          item
        );

      if(cloudSelected?.agentOnline===true){
        state.cloudAgentStatus=
          cloudResult;
        state.localStatus=
          cloudSelected;

        const session=
          cloudSelected?.session ||
          null;

        const authenticated=
          session?.running===true &&
          session?.debugAttached===true &&
          session?.loginDetected===true;

        if(authenticated){
          $("connectionStatus").textContent=
            "Oracle Cloud Agent is connected and authenticated for this broker.";
          renderReadiness();
          renderConnectLoginVisibility();
          await load();
          return;
        }

        $("connectionStatus").textContent=
          "Broker login is required. Opening secure Oracle login...";

        renderReadiness();
        renderConnectLoginVisibility();

        await openLoginConsole();
        return;
      }

      $("connectionStatus").textContent=
        "Running preflight checks...";

      const serverCheck=
        await bridge(
          `/preflight?connectionId=${encodeURIComponent(item.connectionId)}`
        );

      if(serverCheck.ready!==true){
        throw new Error(
          serverCheck.message ||
          "Server-side Marketplace preflight did not pass."
        );
      }

      const localCheck=
        await localAgent(
          "/preflight",
          {
            method:"POST",
            body:
              JSON.stringify({
                connectionId:
                  item.connectionId,

                portalUrl:
                  item.portalUrl ||
                  serverCheck.portalUrl ||
                  "",

                ghBaseUrl:
                  window.location.origin
              })
          }
        );

      if(localCheck.ready!==true){
        throw new Error(
          localCheck.message ||
          "Local Browser Agent preflight did not pass."
        );
      }

      $("connectionStatus").textContent=
        "Preflight passed. Starting secure browser connection...";

      /*
        GH creates a short-lived connection-scoped discovery token.
        It is handed directly to the local GH Browser Agent and is never
        displayed to the Super Admin.
      */
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

      const portalUrl=
        prepared.portalUrl ||
        item.portalUrl ||
        "";

      if(!portalUrl){
        throw new Error(
          "Provider Portal URL is missing for this broker connection."
        );
      }

      const result=
        await localAgent(
          "/connect",
          {
            method:"POST",
            body:JSON.stringify({
              ghBaseUrl:
                window.location.origin,
              agentToken:
                prepared.agentToken,
              connectionId:
                prepared.connectionId ||
                item.connectionId,
              portalUrl,
              brokerName:
                prepared.brokerName ||
                item.brokerName ||
                "",
              brokerCode:
                prepared.brokerCode ||
                item.brokerCode ||
                "",
              accountLabel:
                prepared.accountLabel ||
                item.accountLabel ||
                "Primary Account"
            })
          }
        );

      $("connectionStatus").textContent=
        result.alreadyRunning
          ? "Broker browser is already open. Continue in that window."
          : "Broker browser opened. Sign in directly on the broker website.";

      await load();
      await refreshPreflight();

    }catch(err){
      const message=
        String(
          err?.message ||
          err ||
          ""
        );

      if(
        err?.name==="AbortError" ||
        /failed to fetch|networkerror|load failed/i.test(message)
      ){
        $("connectionStatus").textContent=
          "Oracle Cloud Agent is not available right now, and no local fallback agent was found on this computer.";
      }else{
        $("connectionStatus").textContent=
          message ||
          "Failed to start broker connection.";
      }
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
      /*
        Stop only this connection's local browser/profile.
        If the local agent is offline, still clear the server-side state.
      */
      await localAgent(
        "/disconnect",
        {
          method:"POST",
          body:JSON.stringify({
            connectionId:item.connectionId
          })
        }
      ).catch(()=>{});

      await bridge(
        `/connections/${encodeURIComponent(item.connectionId)}/disconnect`,
        {
          method:"POST",
          body:"{}"
        }
      );

      $("connectionStatus").textContent=
        "Disconnected.";

      state.localStatus=null;
      state.serverPreflight=null;

      await load();
      await refreshPreflight();

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
    renderConnectLoginVisibility();

      await refreshPreflight();

    }catch(err){
      $("scanStatus").textContent=
        err.message ||
        "Failed to load Marketplace.";
    }
  }

  $("refreshBtn")
    ?.addEventListener(
      "click",
      async()=>{
        const btn=$("refreshBtn");

        try{
          if(btn){
            btn.disabled=true;
            btn.classList.add("refreshing");
            btn.textContent="Refreshing...";
          }

          await load();
        }finally{
          if(btn){
            btn.disabled=false;
            btn.classList.remove("refreshing");
            btn.textContent="Refresh";
          }
        }
      }
    );


  $("loginConsoleBtn")
    ?.addEventListener(
      "click",
      openLoginConsole
    );

  $("loginConsoleClose")
    ?.addEventListener(
      "click",
      closeLoginConsole
    );

  $("loginConsoleOverlay")
    ?.addEventListener(
      "click",
      event=>{
        if(event.target===$("loginConsoleOverlay")){
          closeLoginConsole();
        }
      }
    );

  $("loginConsoleRefresh")
    ?.addEventListener(
      "click",
      ()=>queueLoginConsoleAction("SCREENSHOT")
        .catch(err=>setLoginConsoleStatus(err.message))
    );

  $("loginConsoleReload")
    ?.addEventListener(
      "click",
      ()=>queueLoginConsoleAction("RELOAD")
        .catch(err=>setLoginConsoleStatus(err.message))
    );

  $("loginConsoleTab")
    ?.addEventListener(
      "click",
      ()=>queueLoginConsoleAction("KEY",{key:"Tab"})
        .catch(err=>setLoginConsoleStatus(err.message))
    );

  $("loginConsoleEnter")
    ?.addEventListener(
      "click",
      ()=>queueLoginConsoleAction("KEY",{key:"Enter"})
        .catch(err=>setLoginConsoleStatus(err.message))
    );

  $("loginConsoleBackspace")
    ?.addEventListener(
      "click",
      ()=>queueLoginConsoleAction("KEY",{key:"Backspace"})
        .catch(err=>setLoginConsoleStatus(err.message))
    );

  $("loginConsoleImage")
    ?.addEventListener(
      "click",
      event=>{
        const image=event.currentTarget;
        const rect=image.getBoundingClientRect();

        if(
          !rect.width ||
          !rect.height
        ){
          return;
        }

        const xRatio=
          Math.max(
            0,
            Math.min(
              1,
              (event.clientX-rect.left)/rect.width
            )
          );

        const yRatio=
          Math.max(
            0,
            Math.min(
              1,
              (event.clientY-rect.top)/rect.height
            )
          );

        queueLoginConsoleAction(
          "CLICK",
          {
            xRatio,
            yRatio
          }
        )
        .catch(
          err=>
            setLoginConsoleStatus(
              err.message
            )
        );
      }
    );

  async function sendSecureLoginConsoleText(){
    const input=$("loginConsoleText");
    const value=String(input?.value||"");

    if(!value){
      return;
    }

    try{
      setLoginConsoleStatus(
        "Encrypting login text..."
      );

      const encryptedText=
        await encryptConsoleText(
          value,
          state.loginConsole.publicKey
        );

      if(input){
        input.value="";
      }

      await queueLoginConsoleAction(
        "TEXT",
        {
          encryptedText
        }
      );

      setLoginConsoleStatus(
        "Secure text sent to Oracle browser."
      );

    }catch(err){
      setLoginConsoleStatus(
        err.message ||
        "Secure text failed."
      );
    }
  }

  $("loginConsoleSendText")
    ?.addEventListener(
      "click",
      sendSecureLoginConsoleText
    );

  $("loginConsoleText")
    ?.addEventListener(
      "keydown",
      event=>{
        if(event.key==="Enter"){
          event.preventDefault();
          sendSecureLoginConsoleText();
        }
      }
    );

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
