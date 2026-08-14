(function () {

  if(window.SUNBEAM_ADMIN_CHAT){
    return;
  }

  window.SUNBEAM_ADMIN_CHAT = true;

  const API = {
    drivers:"/api/drivers",
    messages:"/api/driver-chat/messages"
  };

  const POLL_MS = 5000;

  let drivers = [];
  let selectedDriver = null;
  let polling = null;
  let sending = false;
  let lastSignature = "";

  function $(id){
    return document.getElementById(id);
  }

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
      headers.Authorization = `Bearer ${token}`;
      headers["x-access-token"] = token;
    }

    return headers;
  }

  function showError(message){

    const el = $("adminChatError");
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

  function driverId(driver){

    return (
      driver?._id ||
      driver?.id ||
      driver?.driverId ||
      ""
    );
  }

  function driverName(driver){

    return (
      driver?.name ||
      driver?.fullName ||
      driver?.username ||
      driver?.email ||
      "Driver"
    );
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

  async function loadDrivers(){

    try{

      const response = await fetch(
        API.drivers,
        {
          method:"GET",
          headers:authHeaders(),
          cache:"no-store"
        }
      );

      if(!response.ok){
        throw new Error(
          `Unable to load drivers (${response.status})`
        );
      }

      const payload = await response.json();

      drivers = normalizeDrivers(payload);

      renderDrivers();
      showError("");

    }catch(error){

      showError(
        error?.message ||
        "Unable to load drivers."
      );

    }

  }

  function renderDrivers(){

    const list = $("driverList");
    const search = clean(
      $("driverSearch")?.value
    ).toLowerCase();

    if(!list) return;

    list.innerHTML = "";

    const filtered = drivers.filter((driver)=>{

      const haystack = [
        driverName(driver),
        driver?.email,
        driver?.phone,
        driver?.vehicleNumber
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !search || haystack.includes(search);

    });

    if(!filtered.length){

      const empty = document.createElement("div");

      empty.className = "admin-empty";
      empty.innerHTML = `
        <div class="admin-empty-title">No Drivers</div>
        <div class="admin-empty-text">
          No matching drivers were found.
        </div>
      `;

      list.appendChild(empty);
      return;
    }

    filtered.forEach((driver)=>{

      const id = driverId(driver);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "driver-item";

      if(
        selectedDriver &&
        driverId(selectedDriver) === id
      ){
        button.classList.add("active");
      }

      const initials = driverName(driver)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0,2)
        .map(x=>x[0])
        .join("")
        .toUpperCase();

      button.innerHTML = `
        <span class="driver-avatar-small">
          ${initials || "D"}
        </span>

        <span class="driver-item-main">
          <span class="driver-item-name">
            ${escapeHtml(driverName(driver))}
          </span>

          <span class="driver-item-meta">
            ${escapeHtml(
              clean(driver?.vehicleNumber) ||
              clean(driver?.phone) ||
              "Driver"
            )}
          </span>
        </span>
      `;

      button.addEventListener(
        "click",
        ()=>selectDriver(driver)
      );

      list.appendChild(button);

    });

  }

  function escapeHtml(value){

    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function setComposerEnabled(enabled){

    const input = $("adminMessageInput");
    const button = $("adminSendButton");

    if(input){
      input.disabled = !enabled;
    }

    if(button){
      button.disabled = !enabled || sending;
    }

  }

  async function selectDriver(driver){

    selectedDriver = driver;
    lastSignature = "";

    renderDrivers();

    const name = $("selectedDriverName");
    const status = $("selectedDriverStatus");

    if(name){
      name.textContent = driverName(driver);
    }

    if(status){
      status.textContent = "Driver conversation";
    }

    setComposerEnabled(true);

    await loadMessages();

    startPolling();

  }

  function messageId(message,index){

    return String(
      message?._id ||
      message?.id ||
      message?.messageId ||
      `${index}-${message?.createdAt || ""}`
    );
  }

  function makeSignature(messages){

    return messages
      .map((m,i)=>[
        messageId(m,i),
        m?.text || m?.message || "",
        m?.createdAt || m?.sentAt || ""
      ].join("|"))
      .join("::");

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

    const date = new Date(value);

    if(Number.isNaN(date.getTime())){
      return "";
    }

    return date.toLocaleTimeString(
      [],
      {
        hour:"numeric",
        minute:"2-digit"
      }
    );
  }

  function renderMessages(messages){

    const list = $("adminMessages");

    if(!list) return;

    const signature = makeSignature(messages);

    if(signature === lastSignature){
      return;
    }

    lastSignature = signature;

    list.innerHTML = "";

    if(!messages.length){

      list.innerHTML = `
        <div class="admin-empty">
          <div class="admin-empty-title">
            No Messages Yet
          </div>

          <div class="admin-empty-text">
            Start a conversation with this driver.
          </div>
        </div>
      `;

      return;
    }

    messages.forEach((message)=>{

      const side = senderType(message);

      const row = document.createElement("div");
      row.className = `message-row ${side}`;

      const bubble = document.createElement("div");
      bubble.className = "message-bubble";

      const meta = document.createElement("div");
      meta.className = "message-meta";
      meta.textContent =
        side === "dispatch"
          ? "Dispatch"
          : (
              message?.senderName ||
              driverName(selectedDriver)
            );

      const body = document.createElement("div");
      body.className = "message-text";
      body.textContent =
        message?.text ??
        message?.message ??
        "";

      const time = document.createElement("div");
      time.className = "message-time";
      time.textContent = formatTime(
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

    list.scrollTop = list.scrollHeight;

  }

  async function loadMessages(){

    if(!selectedDriver){
      return;
    }

    const id = driverId(selectedDriver);

    if(!id){
      return;
    }

    try{

      const response = await fetch(
        `${API.messages}?driverId=${encodeURIComponent(id)}`,
        {
          method:"GET",
          headers:authHeaders(),
          cache:"no-store"
        }
      );

      if(!response.ok){
        throw new Error(
          `Unable to load chat (${response.status})`
        );
      }

      const payload = await response.json();

      renderMessages(
        normalizeMessages(payload)
      );

      showError("");

    }catch(error){

      showError(
        error?.message ||
        "Unable to load chat."
      );

    }

  }

  async function sendMessage(text){

    if(
      sending ||
      !selectedDriver
    ){
      return;
    }

    const messageText = clean(text);

    if(!messageText){
      return;
    }

    const id = driverId(selectedDriver);

    if(!id){
      return;
    }

    sending = true;
    setComposerEnabled(true);
    showError("");

    try{

      const response = await fetch(
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

        let message = "";

        try{
          const data = await response.json();

          message =
            data?.message ||
            data?.error ||
            "";
        }catch{
          message = "";
        }

        throw new Error(
          message ||
          `Unable to send message (${response.status})`
        );
      }

      const input = $("adminMessageInput");

      if(input){
        input.value = "";
        autoResize();
      }

      await loadMessages();

    }catch(error){

      showError(
        error?.message ||
        "Unable to send message."
      );

    }finally{

      sending = false;
      setComposerEnabled(true);

    }

  }

  function autoResize(){

    const input = $("adminMessageInput");

    if(!input) return;

    input.style.height = "auto";

    input.style.height =
      Math.min(
        input.scrollHeight,
        120
      ) + "px";

  }

  function bindUi(){

    const search = $("driverSearch");
    const form = $("adminChatForm");
    const input = $("adminMessageInput");

    if(search){
      search.addEventListener(
        "input",
        renderDrivers
      );
    }

    if(input){

      input.addEventListener(
        "input",
        autoResize
      );

      input.addEventListener(
        "keydown",
        function(event){

          if(
            event.key === "Enter" &&
            !event.shiftKey
          ){

            event.preventDefault();
            form?.requestSubmit();

          }

        }
      );

    }

    if(form){

      form.addEventListener(
        "submit",
        async function(event){

          event.preventDefault();

          await sendMessage(
            input?.value || ""
          );

        }
      );

    }

  }

  function startPolling(){

    stopPolling();

    polling = window.setInterval(
      loadMessages,
      POLL_MS
    );

  }

  function stopPolling(){

    if(polling){
      window.clearInterval(polling);
      polling = null;
    }

  }

  async function init(){

    bindUi();
    setComposerEnabled(false);

    await loadDrivers();

    document.addEventListener(
      "visibilitychange",
      function(){

        if(document.hidden){

          stopPolling();

        }else if(selectedDriver){

          loadMessages();
          startPolling();

        }

      }
    );

  }

  if(document.readyState === "loading"){

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  }else{

    init();

  }

})();