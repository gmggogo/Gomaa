(function () {

  if(window.SUNBEAM_ADMIN_FLOATING_CHAT){
    return;
  }

  window.SUNBEAM_ADMIN_FLOATING_CHAT = true;

  const API = {
    onlineDrivers:"/api/driver-chat/admin/online-drivers",
    unread:"/api/driver-chat/admin/unread",
    messages:"/api/driver-chat/messages",
    read:"/api/driver-chat/read"
  };

  const POLL_MS = 5000;

  let onlineDrivers = [];
  let unreadByDriver = {};
  let totalUnread = 0;

  let selectedDriver = null;
  let pollTimer = null;
  let lastSignature = "";
  let sending = false;

  /* =========================
     HELPERS
  ========================= */

  function clean(v){
    return String(v ?? "").trim();
  }

  function getToken(){
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("adminToken") ||
      ""
    );
  }

  function authHeaders(extra = {}){

    const token = getToken();

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

  function driverId(driver){

    return clean(
      driver?._id ||
      driver?.id ||
      driver?.driverId ||
      ""
    );
  }

  function driverName(driver){

    return clean(
      driver?.name ||
      driver?.fullName ||
      driver?.username ||
      driver?.email ||
      "Driver"
    );
  }

  function driverMeta(driver){

    return clean(
      driver?.vehicleNumber ||
      driver?.phone ||
      driver?.email ||
      "Online"
    );
  }

  function initials(name){

    return clean(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0,2)
      .map(x=>x[0])
      .join("")
      .toUpperCase() ||
      "D";
  }

  function normalizeDrivers(payload){

    if(Array.isArray(payload)){
      return payload;
    }

    if(Array.isArray(payload?.drivers)){
      return payload.drivers;
    }

    if(Array.isArray(payload?.items)){
      return payload.items;
    }

    return [];
  }

  function normalizeMessages(payload){

    if(Array.isArray(payload)){
      return payload;
    }

    if(Array.isArray(payload?.messages)){
      return payload.messages;
    }

    if(Array.isArray(payload?.items)){
      return payload.items;
    }

    return [];
  }

  function senderType(message){

    const raw = clean(
      message?.senderType ||
      message?.senderRole ||
      message?.role
    ).toUpperCase();

    return raw === "DRIVER"
      ? "driver"
      : "dispatch";
  }

  function formatTime(value){

    if(!value) return "";

    const d = new Date(value);

    if(Number.isNaN(d.getTime())){
      return "";
    }

    return d.toLocaleTimeString(
      [],
      {
        hour:"numeric",
        minute:"2-digit"
      }
    );
  }

  function makeSignature(messages){

    return messages
      .map((m,index)=>[
        m?._id ||
        m?.id ||
        m?.messageId ||
        index,

        m?.text ||
        m?.message ||
        "",

        m?.createdAt ||
        m?.sentAt ||
        ""
      ].join("|"))
      .join("::");
  }

  function escapeHtml(value){

    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  /* =========================
     BUILD FLOATING UI
  ========================= */

  function mount(){

    if(
      document.getElementById(
        "sunbeamAdminChatRoot"
      )
    ){
      return;
    }

    const style =
      document.createElement("style");

    style.textContent = `
      #sunbeamAdminChatRoot,
      #sunbeamAdminChatRoot *{
        box-sizing:border-box;
      }

      #sunbeamAdminChatRoot{
        position:fixed;
        right:18px;
        bottom:18px;
        z-index:2147483000;

        font-family:
          Arial,
          Helvetica,
          sans-serif;
      }

      .sb-chat-fab{
        position:relative;

        width:62px;
        height:62px;

        display:flex;
        align-items:center;
        justify-content:center;

        padding:0;

        border-radius:50%;

        border:2px solid rgba(255,255,255,.86);

        color:#fff;

        background:
          radial-gradient(
            circle at 32% 25%,
            rgba(255,255,255,.32),
            transparent 30%
          ),
          linear-gradient(
            180deg,
            #28ef70 0%,
            #15bb56 100%
          );

        box-shadow:
          0 7px 0 rgba(0,92,37,.44),
          0 12px 22px rgba(0,0,0,.28);

        cursor:pointer;
      }

      .sb-chat-fab svg{
        width:30px;
        height:30px;
        fill:#fff;
      }

      .sb-chat-total{
        position:absolute;
        top:-7px;
        right:-7px;

        min-width:25px;
        height:25px;

        display:none;
        align-items:center;
        justify-content:center;

        padding:0 7px;

        border-radius:13px;

        color:#fff;
        background:#ff4f5f;

        border:2px solid #fff;

        font-size:12px;
        line-height:1;
        font-weight:900;
      }

      .sb-chat-total.show{
        display:flex;
      }

      .sb-chat-panel{
        position:absolute;

        right:0;
        bottom:76px;

        width:min(
          365px,
          calc(100vw - 24px)
        );

        height:min(
          600px,
          calc(100dvh - 110px)
        );

        display:none;
        flex-direction:column;

        overflow:hidden;

        border-radius:24px;

        background:
          radial-gradient(
            circle at 18% 8%,
            rgba(75,145,236,.16),
            transparent 35%
          ),
          linear-gradient(
            160deg,
            #0a315e 0%,
            #061c3b 55%,
            #03142d 100%
          );

        border-top:3px solid #ffe27a;
        border-left:3px solid #edb72a;
        border-right:3px solid #9e6800;
        border-bottom:5px solid #6f4900;

        box-shadow:
          0 10px 0 rgba(57,36,0,.40),
          0 20px 38px rgba(0,0,0,.35);
      }

      .sb-chat-panel.open{
        display:flex;
      }

      .sb-chat-header{
        flex:0 0 auto;

        min-height:64px;

        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;

        padding:12px 14px;

        border-bottom:
          1px solid
          rgba(255,210,38,.24);
      }

      .sb-chat-head-text{
        min-width:0;
      }

      .sb-chat-title{
        color:#fff;

        font-size:18px;
        font-weight:900;
      }

      .sb-chat-subtitle{
        margin-top:4px;

        color:#aeb9ca;

        font-size:11px;
        font-weight:800;
      }

      .sb-chat-head-actions{
        display:flex;
        gap:7px;
      }

      .sb-chat-head-btn{
        width:34px;
        height:34px;

        display:flex;
        align-items:center;
        justify-content:center;

        padding:0;

        border-radius:50%;

        border:
          1px solid
          rgba(255,210,38,.38);

        color:#fff;
        background:
          rgba(255,255,255,.065);

        font-size:18px;
        font-weight:900;

        cursor:pointer;
      }

      .sb-chat-body{
        flex:1;
        min-height:0;

        display:flex;
        flex-direction:column;

        overflow:hidden;
      }

      .sb-chat-error{
        display:none;

        margin:8px 10px 0;
        padding:8px 10px;

        border-radius:12px;

        color:#fff;
        background:
          rgba(161,28,37,.88);

        border:
          1px solid
          rgba(255,120,127,.35);

        font-size:11px;
        line-height:1.35;
        font-weight:800;
      }

      .sb-chat-error.show{
        display:block;
      }

      .sb-chat-drivers-view{
        flex:1;
        min-height:0;

        display:flex;
        flex-direction:column;
      }

      .sb-chat-search-wrap{
        padding:12px 12px 6px;
      }

      .sb-chat-search{
        width:100%;
        min-height:42px;

        padding:0 13px;

        outline:none;

        color:#fff;
        background:
          rgba(255,255,255,.07);

        border:
          1.5px solid
          rgba(255,210,38,.38);

        border-radius:16px;

        font-size:13px;
        font-weight:700;
      }

      .sb-chat-search::placeholder{
        color:#9aa7ba;
      }

      .sb-chat-driver-list{
        flex:1;
        min-height:0;

        overflow-y:auto;

        padding:
          5px 10px 12px;
      }

      .sb-chat-driver{
        width:100%;

        display:flex;
        align-items:center;
        gap:10px;

        margin-top:8px;
        padding:11px;

        border-radius:17px;

        border:
          1px solid
          rgba(255,210,38,.20);

        color:#fff;
        background:
          rgba(255,255,255,.045);

        text-align:left;

        cursor:pointer;
      }

      .sb-chat-driver-avatar{
        width:39px;
        height:39px;

        flex:0 0 39px;

        display:flex;
        align-items:center;
        justify-content:center;

        border-radius:50%;

        color:#ffd226;
        background:#0c315e;

        border:
          2px solid #ffd226;

        font-size:13px;
        font-weight:900;
      }

      .sb-chat-driver-main{
        min-width:0;
        flex:1;
      }

      .sb-chat-driver-name{
        display:block;

        color:#fff;

        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;

        font-size:14px;
        font-weight:900;
      }

      .sb-chat-driver-meta{
        display:flex;
        align-items:center;
        gap:6px;

        margin-top:4px;

        color:#c3cedd;

        font-size:10px;
        font-weight:700;
      }

      .sb-chat-online-dot{
        width:8px;
        height:8px;

        flex:0 0 8px;

        border-radius:50%;

        background:#28ef70;

        box-shadow:
          0 0 8px
          rgba(40,239,112,.52);
      }

      .sb-chat-driver-unread{
        min-width:23px;
        height:23px;

        display:none;
        align-items:center;
        justify-content:center;

        padding:0 7px;

        border-radius:12px;

        color:#fff;
        background:#ff4f5f;

        border:
          1px solid
          rgba(255,255,255,.75);

        font-size:11px;
        font-weight:900;
      }

      .sb-chat-driver-unread.show{
        display:flex;
      }

      .sb-chat-empty{
        margin:auto;

        width:calc(100% - 24px);

        padding:22px 16px;

        text-align:center;

        border-radius:18px;

        color:#fff;
        background:
          rgba(255,255,255,.045);

        border:
          1px solid
          rgba(255,255,255,.08);
      }

      .sb-chat-empty-title{
        font-size:16px;
        font-weight:900;
      }

      .sb-chat-empty-text{
        margin-top:7px;

        color:#aeb9ca;

        font-size:12px;
        line-height:1.45;
        font-weight:700;
      }

      .sb-chat-conversation{
        flex:1;
        min-height:0;

        display:none;
        flex-direction:column;
      }

      .sb-chat-conversation.open{
        display:flex;
      }

      .sb-chat-conversation-top{
        flex:0 0 auto;

        min-height:55px;

        display:flex;
        align-items:center;
        gap:10px;

        padding:10px 12px;

        border-bottom:
          1px solid
          rgba(255,210,38,.20);
      }

      .sb-chat-back{
        width:32px;
        height:32px;

        flex:0 0 32px;

        display:flex;
        align-items:center;
        justify-content:center;

        border-radius:50%;

        color:#fff;
        background:
          rgba(255,255,255,.06);

        border:
          1px solid
          rgba(255,210,38,.30);

        font-size:18px;
        font-weight:900;

        cursor:pointer;
      }

      .sb-chat-selected{
        min-width:0;
        flex:1;
      }

      .sb-chat-selected-name{
        color:#fff;

        font-size:14px;
        font-weight:900;

        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .sb-chat-selected-status{
        margin-top:3px;

        color:#28ef70;

        font-size:10px;
        font-weight:800;
      }

      .sb-chat-messages{
        flex:1;
        min-height:0;

        overflow-y:auto;

        padding:14px 12px;

        display:flex;
        flex-direction:column;
        gap:10px;
      }

      .sb-chat-message-row{
        width:100%;
        display:flex;
      }

      .sb-chat-message-row.driver{
        justify-content:flex-start;
      }

      .sb-chat-message-row.dispatch{
        justify-content:flex-end;
      }

      .sb-chat-message-bubble{
        max-width:82%;

        padding:
          9px 11px 8px;

        border-radius:16px;

        font-size:13px;
        line-height:1.38;

        box-shadow:
          0 4px 9px
          rgba(0,0,0,.14);
      }

      .sb-chat-message-row.driver
      .sb-chat-message-bubble{
        color:#fff;

        background:
          linear-gradient(
            180deg,
            #123d70 0%,
            #09274d 100%
          );

        border:
          1px solid
          rgba(255,210,38,.36);

        border-bottom-left-radius:6px;
      }

      .sb-chat-message-row.dispatch
      .sb-chat-message-bubble{
        color:#07172d;

        background:
          linear-gradient(
            180deg,
            #ffe76c 0%,
            #ffd226 100%
          );

        border:
          1px solid #9e6800;

        border-bottom-right-radius:6px;
      }

      .sb-chat-message-meta{
        margin-bottom:4px;

        font-size:9px;
        font-weight:900;

        opacity:.70;
      }

      .sb-chat-message-text{
        white-space:pre-wrap;
        word-break:break-word;
      }

      .sb-chat-message-time{
        margin-top:4px;

        text-align:right;

        font-size:9px;
        font-weight:800;

        opacity:.66;
      }

      .sb-chat-composer{
        flex:0 0 auto;

        display:grid;

        grid-template-columns:
          minmax(0,1fr)
          auto;

        gap:8px;

        align-items:end;

        padding:10px 11px 12px;

        border-top:
          1px solid
          rgba(255,210,38,.20);

        background:
          rgba(1,14,31,.54);
      }

      .sb-chat-input{
        width:100%;
        min-height:43px;
        max-height:105px;

        resize:none;

        padding:11px 13px;

        outline:none;

        color:#fff;
        background:
          rgba(255,255,255,.07);

        border:
          1.5px solid
          rgba(255,210,38,.42);

        border-radius:18px;

        font-family:inherit;
        font-size:13px;
        line-height:1.35;
        font-weight:700;
      }

      .sb-chat-send{
        width:44px;
        height:44px;

        display:flex;
        align-items:center;
        justify-content:center;

        padding:0;

        border-radius:50%;

        color:#07172d;

        background:
          linear-gradient(
            180deg,
            #ffe76c 0%,
            #ffd226 60%,
            #dda300 100%
          );

        border:
          1px solid #8b5a00;

        box-shadow:
          0 4px 0
          rgba(92,58,0,.40);

        font-size:19px;
        font-weight:900;

        cursor:pointer;
      }

      .sb-chat-send:disabled{
        opacity:.45;
        cursor:not-allowed;
      }

      @media(max-width:520px){

        #sunbeamAdminChatRoot{
          right:12px;
          bottom:12px;
        }

        .sb-chat-fab{
          width:58px;
          height:58px;
        }

        .sb-chat-panel{
          bottom:70px;

          width:
            calc(100vw - 24px);

          height:
            min(
              590px,
              calc(100dvh - 92px)
            );
        }

      }
    `;

    document.head.appendChild(style);

    const root =
      document.createElement("div");

    root.id =
      "sunbeamAdminChatRoot";

    root.innerHTML = `
      <button
        class="sb-chat-fab"
        id="sbChatFab"
        type="button"
        aria-label="Chat"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2.5 5.5h11v-2h-11v2zm0 4h8v-2h-8v2z"/>
        </svg>

        <span
          class="sb-chat-total"
          id="sbChatTotal"
        ></span>
      </button>

      <section
        class="sb-chat-panel"
        id="sbChatPanel"
      >

        <div class="sb-chat-header">

          <div class="sb-chat-head-text">

            <div
              class="sb-chat-title"
              id="sbChatTitle"
            >
              Chat
            </div>

            <div
              class="sb-chat-subtitle"
              id="sbChatSubtitle"
            >
              Online Drivers
            </div>

          </div>

          <div class="sb-chat-head-actions">

            <button
              class="sb-chat-head-btn"
              id="sbChatRefresh"
              type="button"
              aria-label="Refresh"
            >
              ↻
            </button>

            <button
              class="sb-chat-head-btn"
              id="sbChatClose"
              type="button"
              aria-label="Close"
            >
              ×
            </button>

          </div>

        </div>

        <div
          class="sb-chat-error"
          id="sbChatError"
        ></div>

        <div class="sb-chat-body">

          <section
            class="sb-chat-drivers-view"
            id="sbChatDriversView"
          >

            <div class="sb-chat-search-wrap">

              <input
                class="sb-chat-search"
                id="sbChatSearch"
                type="search"
                autocomplete="off"
                placeholder="Search online drivers..."
              />

            </div>

            <div
              class="sb-chat-driver-list"
              id="sbChatDriverList"
            ></div>

          </section>

          <section
            class="sb-chat-conversation"
            id="sbChatConversation"
          >

            <div class="sb-chat-conversation-top">

              <button
                class="sb-chat-back"
                id="sbChatBack"
                type="button"
                aria-label="Back"
              >
                ‹
              </button>

              <div class="sb-chat-selected">

                <div
                  class="sb-chat-selected-name"
                  id="sbChatSelectedName"
                >
                  Driver
                </div>

                <div
                  class="sb-chat-selected-status"
                >
                  ● Online
                </div>

              </div>

            </div>

            <div
              class="sb-chat-messages"
              id="sbChatMessages"
            ></div>

            <form
              class="sb-chat-composer"
              id="sbChatForm"
            >

              <textarea
                class="sb-chat-input"
                id="sbChatInput"
                rows="1"
                maxlength="2000"
                placeholder="Message driver..."
              ></textarea>

              <button
                class="sb-chat-send"
                id="sbChatSend"
                type="submit"
              >
                ➤
              </button>

            </form>

          </section>

        </div>

      </section>
    `;

    document.body.appendChild(root);

    bindUi();
  }

  /* =========================
     UI HELPERS
  ========================= */

  function showError(message){

    const el =
      document.getElementById(
        "sbChatError"
      );

    if(!el) return;

    const text = clean(message);

    if(!text){

      el.textContent = "";
      el.classList.remove("show");
      return;
    }

    el.textContent = text;
    el.classList.add("show");
  }

  function setBadge(el,count){

    if(!el) return;

    const n =
      Number(count || 0);

    if(n > 0){

      el.textContent =
        n > 99
          ? "99+"
          : String(n);

      el.classList.add("show");

    }else{

      el.textContent = "";
      el.classList.remove("show");

    }
  }

  function updateTotalBadge(){

    setBadge(
      document.getElementById(
        "sbChatTotal"
      ),
      totalUnread
    );
  }

  function openPanel(){

    document
      .getElementById(
        "sbChatPanel"
      )
      ?.classList.add("open");

    refreshAll();
  }

  function closePanel(){

    document
      .getElementById(
        "sbChatPanel"
      )
      ?.classList.remove("open");

    showDrivers();
  }

  function togglePanel(){

    const panel =
      document.getElementById(
        "sbChatPanel"
      );

    if(!panel) return;

    if(
      panel.classList.contains(
        "open"
      )
    ){
      closePanel();
    }else{
      openPanel();
    }
  }

  function showDrivers(){

    selectedDriver = null;
    lastSignature = "";

    const listView =
      document.getElementById(
        "sbChatDriversView"
      );

    const conversation =
      document.getElementById(
        "sbChatConversation"
      );

    if(listView){
      listView.style.display =
        "flex";
    }

    conversation?.classList.remove(
      "open"
    );

    const title =
      document.getElementById(
        "sbChatTitle"
      );

    const subtitle =
      document.getElementById(
        "sbChatSubtitle"
      );

    if(title){
      title.textContent = "Chat";
    }

    if(subtitle){
      subtitle.textContent =
        "Online Drivers";
    }

    renderDrivers();
  }

  async function openDriver(driver){

    selectedDriver = driver;
    lastSignature = "";

    const listView =
      document.getElementById(
        "sbChatDriversView"
      );

    const conversation =
      document.getElementById(
        "sbChatConversation"
      );

    if(listView){
      listView.style.display =
        "none";
    }

    conversation?.classList.add(
      "open"
    );

    const title =
      document.getElementById(
        "sbChatTitle"
      );

    const subtitle =
      document.getElementById(
        "sbChatSubtitle"
      );

    const name =
      document.getElementById(
        "sbChatSelectedName"
      );

    if(title){
      title.textContent =
        "Dispatch Chat";
    }

    if(subtitle){
      subtitle.textContent =
        "Driver Conversation";
    }

    if(name){
      name.textContent =
        driverName(driver);
    }

    await markRead();
    await loadMessages();
    await loadUnread();
  }

  /* =========================
     DRIVERS
  ========================= */

  function renderDrivers(){

    const list =
      document.getElementById(
        "sbChatDriverList"
      );

    if(!list) return;

    const search =
      clean(
        document.getElementById(
          "sbChatSearch"
        )?.value
      ).toLowerCase();

    const filtered =
      onlineDrivers.filter(driver=>{

        const text = [
          driverName(driver),
          driverMeta(driver)
        ]
          .join(" ")
          .toLowerCase();

        return (
          !search ||
          text.includes(search)
        );
      });

    list.innerHTML = "";

    if(!filtered.length){

      list.innerHTML = `
        <div class="sb-chat-empty">

          <div class="sb-chat-empty-title">
            No Online Drivers
          </div>

          <div class="sb-chat-empty-text">
            Online drivers will appear here automatically.
          </div>

        </div>
      `;

      return;
    }

    filtered.forEach(driver=>{

      const id =
        driverId(driver);

      const unread =
        Number(
          unreadByDriver[id] || 0
        );

      const button =
        document.createElement(
          "button"
        );

      button.type = "button";
      button.className =
        "sb-chat-driver";

      button.innerHTML = `
        <span class="sb-chat-driver-avatar">
          ${escapeHtml(
            initials(
              driverName(driver)
            )
          )}
        </span>

        <span class="sb-chat-driver-main">

          <span class="sb-chat-driver-name">
            ${escapeHtml(
              driverName(driver)
            )}
          </span>

          <span class="sb-chat-driver-meta">

            <span
              class="sb-chat-online-dot"
            ></span>

            Online

            ${
              driverMeta(driver)
                ? " · " +
                  escapeHtml(
                    driverMeta(driver)
                  )
                : ""
            }

          </span>

        </span>

        <span
          class="sb-chat-driver-unread ${
            unread > 0
              ? "show"
              : ""
          }"
        >
          ${
            unread > 99
              ? "99+"
              : unread
          }
        </span>
      `;

      button.addEventListener(
        "click",
        ()=>openDriver(driver)
      );

      list.appendChild(button);
    });
  }

  /* =========================
     ONLINE DRIVERS
  ========================= */

  async function loadOnlineDrivers(){

    try{

      const response =
        await fetch(
          API.onlineDrivers,
          {
            method:"GET",
            headers:authHeaders(),
            cache:"no-store"
          }
        );

      if(!response.ok){

        throw new Error(
          `Online drivers ${response.status}`
        );
      }

      const payload =
        await response.json();

      onlineDrivers =
        normalizeDrivers(payload);

      if(!selectedDriver){
        renderDrivers();
      }

      showError("");

    }catch(error){

      console.log(
        "ADMIN CHAT ONLINE ERROR:",
        error
      );

    }
  }

  /* =========================
     UNREAD COUNTERS
  ========================= */

  async function loadUnread(){

    try{

      const response =
        await fetch(
          API.unread,
          {
            method:"GET",
            headers:authHeaders(),
            cache:"no-store"
          }
        );

      if(!response.ok){

        throw new Error(
          `Unread ${response.status}`
        );
      }

      const payload =
        await response.json();

      totalUnread =
        Number(
          payload?.totalUnread ??
          payload?.total ??
          0
        );

      unreadByDriver =
        (
          payload?.byDriver &&
          typeof payload.byDriver ===
          "object"
        )
          ? payload.byDriver
          : {};

      updateTotalBadge();

      if(!selectedDriver){
        renderDrivers();
      }

    }catch(error){

      console.log(
        "ADMIN CHAT UNREAD ERROR:",
        error
      );

    }
  }

  /* =========================
     MESSAGES
  ========================= */

  async function loadMessages(){

    if(!selectedDriver){
      return;
    }

    const id =
      driverId(selectedDriver);

    if(!id){
      return;
    }

    try{

      const response =
        await fetch(
          `${API.messages}?driverId=${encodeURIComponent(id)}`,
          {
            method:"GET",
            headers:authHeaders(),
            cache:"no-store"
          }
        );

      if(!response.ok){

        throw new Error(
          `Messages ${response.status}`
        );
      }

      const payload =
        await response.json();

      renderMessages(
        normalizeMessages(payload)
      );

      showError("");

    }catch(error){

      showError(
        "Unable to load conversation."
      );

      console.log(
        "ADMIN CHAT MESSAGE ERROR:",
        error
      );

    }
  }

  function renderMessages(messages){

    const list =
      document.getElementById(
        "sbChatMessages"
      );

    if(!list) return;

    const signature =
      makeSignature(messages);

    if(
      signature ===
      lastSignature
    ){
      return;
    }

    lastSignature =
      signature;

    list.innerHTML = "";

    if(!messages.length){

      list.innerHTML = `
        <div class="sb-chat-empty">

          <div class="sb-chat-empty-title">
            No Messages Yet
          </div>

          <div class="sb-chat-empty-text">
            Start a conversation with this driver.
          </div>

        </div>
      `;

      return;
    }

    messages.forEach(message=>{

      const side =
        senderType(message);

      const row =
        document.createElement(
          "div"
        );

      row.className =
        `sb-chat-message-row ${side}`;

      const bubble =
        document.createElement(
          "div"
        );

      bubble.className =
        "sb-chat-message-bubble";

      const meta =
        document.createElement(
          "div"
        );

      meta.className =
        "sb-chat-message-meta";

      meta.textContent =
        side === "dispatch"
          ? "Dispatch"
          : (
              message?.senderName ||
              driverName(
                selectedDriver
              )
            );

      const body =
        document.createElement(
          "div"
        );

      body.className =
        "sb-chat-message-text";

      body.textContent =
        message?.text ??
        message?.message ??
        "";

      const time =
        document.createElement(
          "div"
        );

      time.className =
        "sb-chat-message-time";

      time.textContent =
        formatTime(
          message?.createdAt ||
          message?.sentAt
        );

      bubble.appendChild(meta);
      bubble.appendChild(body);

      if(time.textContent){
        bubble.appendChild(time);
      }

      row.appendChild(bubble);
      list.appendChild(row);
    });

    list.scrollTop =
      list.scrollHeight;
  }

  /* =========================
     SEND
  ========================= */

  async function sendMessage(text){

    if(
      sending ||
      !selectedDriver
    ){
      return;
    }

    const messageText =
      clean(text);

    if(!messageText){
      return;
    }

    const id =
      driverId(selectedDriver);

    if(!id){
      return;
    }

    sending = true;

    const button =
      document.getElementById(
        "sbChatSend"
      );

    if(button){
      button.disabled = true;
    }

    showError("");

    try{

      const response =
        await fetch(
          API.messages,
          {
            method:"POST",
            headers:authHeaders(),
            body:JSON.stringify({
              driverId:id,
              text:messageText,
              senderType:"DISPATCH",
              senderName:"Dispatch"
            })
          }
        );

      if(!response.ok){

        let serverMessage = "";

        try{

          const payload =
            await response.json();

          serverMessage =
            payload?.message ||
            payload?.error ||
            "";

        }catch{
          serverMessage = "";
        }

        throw new Error(
          serverMessage ||
          `Send failed ${response.status}`
        );
      }

      const input =
        document.getElementById(
          "sbChatInput"
        );

      if(input){
        input.value = "";
        resizeInput();
      }

      lastSignature = "";

      await loadMessages();

    }catch(error){

      showError(
        error?.message ||
        "Unable to send message."
      );

    }finally{

      sending = false;

      if(button){
        button.disabled = false;
      }

    }
  }

  /* =========================
     MARK READ
  ========================= */

  async function markRead(){

    if(!selectedDriver){
      return;
    }

    const id =
      driverId(selectedDriver);

    if(!id){
      return;
    }

    try{

      await fetch(
        API.read,
        {
          method:"PATCH",
          headers:authHeaders(),
          body:JSON.stringify({
            driverId:id,
            reader:"DISPATCH"
          })
        }
      );

      unreadByDriver[id] = 0;

      totalUnread =
        Object.values(
          unreadByDriver
        )
        .reduce(
          (sum,count)=>
            sum +
            Number(count || 0),
          0
        );

      updateTotalBadge();

    }catch(error){

      console.log(
        "ADMIN CHAT READ ERROR:",
        error
      );

    }
  }

  /* =========================
     REFRESH / POLLING
  ========================= */

  async function refreshAll(){

    await Promise.all([
      loadOnlineDrivers(),
      loadUnread()
    ]);

    if(selectedDriver){
      await loadMessages();
    }
  }

  function startPolling(){

    stopPolling();

    pollTimer =
      window.setInterval(
        refreshAll,
        POLL_MS
      );
  }

  function stopPolling(){

    if(pollTimer){

      window.clearInterval(
        pollTimer
      );

      pollTimer = null;
    }
  }

  /* =========================
     EVENTS
  ========================= */

  function resizeInput(){

    const input =
      document.getElementById(
        "sbChatInput"
      );

    if(!input) return;

    input.style.height =
      "auto";

    input.style.height =
      Math.min(
        input.scrollHeight,
        105
      ) + "px";
  }

  function bindUi(){

    document
      .getElementById(
        "sbChatFab"
      )
      ?.addEventListener(
        "click",
        togglePanel
      );

    document
      .getElementById(
        "sbChatClose"
      )
      ?.addEventListener(
        "click",
        closePanel
      );

    document
      .getElementById(
        "sbChatRefresh"
      )
      ?.addEventListener(
        "click",
        refreshAll
      );

    document
      .getElementById(
        "sbChatBack"
      )
      ?.addEventListener(
        "click",
        showDrivers
      );

    document
      .getElementById(
        "sbChatSearch"
      )
      ?.addEventListener(
        "input",
        renderDrivers
      );

    const input =
      document.getElementById(
        "sbChatInput"
      );

    input?.addEventListener(
      "input",
      resizeInput
    );

    input?.addEventListener(
      "keydown",
      function(event){

        if(
          event.key === "Enter" &&
          !event.shiftKey
        ){

          event.preventDefault();

          document
            .getElementById(
              "sbChatForm"
            )
            ?.requestSubmit();
        }

      }
    );

    document
      .getElementById(
        "sbChatForm"
      )
      ?.addEventListener(
        "submit",
        async function(event){

          event.preventDefault();

          await sendMessage(
            input?.value || ""
          );

        }
      );

    document.addEventListener(
      "visibilitychange",
      function(){

        if(document.hidden){

          stopPolling();

        }else{

          refreshAll();
          startPolling();

        }

      }
    );
  }

  /* =========================
     INIT
  ========================= */

  async function init(){

    mount();

    await refreshAll();

    startPolling();
  }

  if(
    document.readyState ===
    "loading"
  ){

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  }else{

    init();
  }

})();