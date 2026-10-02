(function () {

  if(window.__SUNBEAM_DRIVER_NAV__){
    return;
  }

  window.__SUNBEAM_DRIVER_NAV__ = true;

  const ROUTES = {
    dashboard:"dashboard.html",
    trips:"trips.html",
    map:"map.html",
    chat:"chat.html",
    login:"login.html"
  };

  const CHAT_API = {
    messages:"/api/driver-chat/messages",
    read:"/api/driver-chat/read"
  };

  const CHAT_POLL_MS = 5000;

  let chatPollTimer = null;

  function currentPage(){

    const page =
      String(
        window.location.pathname || ""
      )
      .split("/")
      .pop()
      .toLowerCase();

    if(page === "trips.html"){
      return "trips";
    }

    if(page === "map.html"){
      return "map";
    }

    if(page === "chat.html"){
      return "chat";
    }

    return "dashboard";
  }

  function safeParse(json,fallback = null){

    try{
      return JSON.parse(json);
    }catch{
      return fallback;
    }
  }

  function getLoggedDriver(){

    return safeParse(
      localStorage.getItem("loggedDriver"),
      {}
    );
  }

  function getDriverId(){

    const driver =
      getLoggedDriver();

    return String(
      driver?._id ||
      driver?.id ||
      driver?.driverId ||
      ""
    ).trim();
  }

  function getToken(){

    return (
      localStorage.getItem("driverToken") ||
      localStorage.getItem("token") ||
      ""
    );
  }

  function authHeaders(extra = {}){

    const token =
      getToken();

    const headers = {
      "Content-Type":"application/json",
      ...extra
    };

    if(token){

      headers.Authorization =
        `Bearer ${token}`;

      headers["x-access-token"] =
        token;
    }

    return headers;
  }

  function go(key){

    const target =
      ROUTES[key];

    if(!target){
      return;
    }

    const driver =
      getLoggedDriver();

    const tenantSlug = String(
      driver?.tenantSlug ||
      driver?.tenant ||
      localStorage.getItem("tenantSlug") ||
      localStorage.getItem("tenant") ||
      sessionStorage.getItem("driverLoginTenantSlug") ||
      ""
    ).trim();

    window.location.href =
      tenantSlug
        ? `${target}?tenant=${encodeURIComponent(tenantSlug)}`
        : target;
  }

  function logout(){

    stopChatPolling();

    /*
      Preserve the tenant BEFORE clearing the driver session.
      This is the company login context, not the authenticated driver.
    */
    const loggedDriver =
      getLoggedDriver();

    const tenantSlug = String(
      loggedDriver?.tenantSlug ||
      loggedDriver?.tenant ||
      localStorage.getItem("tenantSlug") ||
      localStorage.getItem("tenant") ||
      sessionStorage.getItem("driverLoginTenantSlug") ||
      ""
    ).trim();

    if(tenantSlug){
      sessionStorage.setItem(
        "driverLoginTenantSlug",
        tenantSlug
      );

      localStorage.setItem(
        "tenant",
        tenantSlug
      );

      localStorage.setItem(
        "tenantSlug",
        tenantSlug
      );
    }

    /* Clear DRIVER AUTH only */
    localStorage.removeItem("driverToken");
    localStorage.removeItem("loggedDriver");
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("driverName");
    localStorage.removeItem("name");
    localStorage.removeItem("companyName");
    localStorage.removeItem("company");
    localStorage.removeItem("driverId");
    localStorage.removeItem("systemTimezone");
    localStorage.removeItem("appTimezone");

    /*
      Return to the SAME tenant login link.
      Example:
      /driver/login.html?tenant=sony
    */
    window.location.href =
      tenantSlug
        ? `${ROUTES.login}?tenant=${encodeURIComponent(tenantSlug)}`
        : ROUTES.login;
  }

  function homeSvg(){

    return `
      <span class="nav-svg nav-home" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M3.5 11.2 12 4l8.5 7.2v8.8a1 1 0 0 1-1 1h-5.5v-6h-4v6H4.5a1 1 0 0 1-1-1z"></path>
        </svg>
      </span>
    `;
  }

  function tripsSvg(){

    return `
      <span class="nav-svg nav-trips" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6 8.5 8 5.8h8L18 8.5h1a2 2 0 0 1 2 2v4.7a1 1 0 0 1-1 1h-1v1.8a1 1 0 0 1-1 1h-1.2a1 1 0 0 1-1-1v-1.8H8.2v1.8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1.8H4a1 1 0 0 1-1-1v-4.7a2 2 0 0 1 2-2zm2.6 0h6.8l-1.1-1.7H9.7zM7 14.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm10 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z"></path>
        </svg>
      </span>
    `;
  }

  function mapSvg(){

    return `
      <span class="nav-svg nav-map" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 22s6-6.2 6-11a6 6 0 1 0-12 0c0 4.8 6 11 6 11zm0-8.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z"></path>
        </svg>
      </span>
    `;
  }

  function chatSvg(){

    return `
      <span class="nav-chat-wrap">
        <span class="nav-svg nav-chat" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 4c4.9 0 8.8 3.3 8.8 7.4 0 4.1-3.9 7.4-8.8 7.4-1.1 0-2.2-.2-3.2-.5L4 20l1.5-4.1c-1.5-1.3-2.3-2.8-2.3-4.5C3.2 7.3 7.1 4 12 4zm-3.3 6.4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm3.3 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm3.3 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"></path>
          </svg>
        </span>

        <span
          class="driver-chat-unread"
          id="driverChatUnread"
          aria-label="Unread chat messages"
        ></span>
      </span>
    `;
  }

  function logoutSvg(){

    return `
      <span class="nav-svg nav-logout" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6 3h7a1 1 0 0 1 0 2H7v14h6a1 1 0 0 1 0 2H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"></path>
          <path d="M13 8.2a1 1 0 0 1 1.4 0l3.6 3.6-3.6 3.6a1 1 0 0 1-1.4-1.4l1.9-1.8H10a1 1 0 1 1 0-2h4.9L13 9.6a1 1 0 0 1 0-1.4z"></path>
        </svg>
      </span>
    `;
  }

  function ensureChatBadgeStyle(){

    if(
      document.getElementById(
        "driverChatUnreadStyle"
      )
    ){
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "driverChatUnreadStyle";

    style.textContent = `
      #navChat .nav-chat-wrap{
        position:relative;
        display:inline-flex;
        align-items:center;
        justify-content:center;
      }

      #navChat .driver-chat-unread{
        position:absolute;
        top:-7px;
        right:-12px;

        min-width:19px;
        height:19px;

        display:none;
        align-items:center;
        justify-content:center;

        padding:0 5px;

        border-radius:10px;

        color:#04172f;
        background:#28ef70;

        border:2px solid #ffffff;

        box-shadow:
          0 0 9px rgba(40,239,112,.70),
          0 2px 5px rgba(0,0,0,.28);

        font-size:10px;
        line-height:1;
        font-weight:900;

        z-index:5;
      }

      #navChat .driver-chat-unread.show{
        display:flex;
      }
    `;

    document.head.appendChild(
      style
    );
  }

  function renderNavigation(){

    const root =
      document.getElementById(
        "driverNav"
      );

    if(!root){
      return;
    }

    ensureChatBadgeStyle();

    const active =
      currentPage();

    root.innerHTML = `
      <div class="nav">

        <button
          id="navHome"
          class="${active === "dashboard" ? "active" : ""}"
          type="button"
        >
          ${homeSvg()}
          Home
        </button>

        <button
          id="navTrips"
          class="${active === "trips" ? "active" : ""}"
          type="button"
        >
          ${tripsSvg()}
          Trips
        </button>

        <button
          id="navMap"
          class="${active === "map" ? "active" : ""}"
          type="button"
        >
          ${mapSvg()}
          Map
        </button>

        <button
          id="navChat"
          class="${active === "chat" ? "active" : ""}"
          type="button"
        >
          ${chatSvg()}
          Chat
        </button>

        <button
          id="navLogout"
          type="button"
        >
          ${logoutSvg()}
          Logout
        </button>

      </div>
    `;

    document
      .getElementById("navHome")
      ?.addEventListener(
        "click",
        ()=>go("dashboard")
      );

    document
      .getElementById("navTrips")
      ?.addEventListener(
        "click",
        ()=>go("trips")
      );

    document
      .getElementById("navMap")
      ?.addEventListener(
        "click",
        ()=>go("map")
      );

    document
      .getElementById("navChat")
      ?.addEventListener(
        "click",
        ()=>go("chat")
      );

    document
      .getElementById("navLogout")
      ?.addEventListener(
        "click",
        logout
      );

    initChatUnread();
  }

  function setUnreadBadge(count){

    const badge =
      document.getElementById(
        "driverChatUnread"
      );

    if(!badge){
      return;
    }

    const total =
      Number(count || 0);

    if(total > 0){

      badge.textContent =
        total > 99
          ? "99+"
          : String(total);

      badge.classList.add(
        "show"
      );

    }else{

      badge.textContent = "";

      badge.classList.remove(
        "show"
      );
    }
  }

  async function markDriverMessagesRead(){

    const driverId =
      getDriverId();

    if(!driverId){
      return;
    }

    try{

      await fetch(
        CHAT_API.read,
        {
          method:"PATCH",
          headers:authHeaders(),
          body:JSON.stringify({
            driverId,
            reader:"DRIVER"
          })
        }
      );

      setUnreadBadge(0);

    }catch(error){

      console.log(
        "DRIVER CHAT READ ERROR:",
        error
      );
    }
  }

  async function loadDriverUnread(){

    const driverId =
      getDriverId();

    if(!driverId){
      setUnreadBadge(0);
      return;
    }

    /*
      While the driver is already on the Chat page,
      incoming dispatch messages are considered read.
    */
    if(currentPage() === "chat"){

      await markDriverMessagesRead();
      return;
    }

    try{

      const response =
        await fetch(
          `${CHAT_API.messages}?driverId=${encodeURIComponent(driverId)}`,
          {
            method:"GET",
            headers:authHeaders(),
            cache:"no-store"
          }
        );

      if(!response.ok){
        return;
      }

      const payload =
        await response.json();

      const messages =
        Array.isArray(payload)
          ? payload
          : (
              Array.isArray(payload?.messages)
                ? payload.messages
                : []
            );

      const unread =
        messages.filter(message=>{

          const sender =
            String(
              message?.senderType ||
              message?.senderRole ||
              ""
            ).toUpperCase();

          return (
            sender === "DISPATCH" &&
            message?.readByDriver !== true
          );

        }).length;

      setUnreadBadge(unread);

    }catch(error){

      console.log(
        "DRIVER CHAT UNREAD ERROR:",
        error
      );
    }
  }

  function startChatPolling(){

    stopChatPolling();

    chatPollTimer =
      window.setInterval(
        loadDriverUnread,
        CHAT_POLL_MS
      );
  }

  function stopChatPolling(){

    if(chatPollTimer){

      window.clearInterval(
        chatPollTimer
      );

      chatPollTimer = null;
    }
  }

  function initChatUnread(){

    loadDriverUnread();
    startChatPolling();

    document.addEventListener(
      "visibilitychange",
      function(){

        if(document.hidden){

          stopChatPolling();

        }else{

          loadDriverUnread();
          startChatPolling();

        }

      },
      {
        once:false
      }
    );
  }

  window.goHome =
    ()=>go("dashboard");

  window.goTrips =
    ()=>go("trips");

  window.goMap =
    ()=>go("map");

  window.goChat =
    ()=>go("chat");

  window.logout =
    logout;

  if(
    document.readyState ===
    "loading"
  ){

    document.addEventListener(
      "DOMContentLoaded",
      renderNavigation
    );

  }else{

    renderNavigation();
  }

})();