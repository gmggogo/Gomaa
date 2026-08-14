(function () {

  if(window.SUNBEAM_DRIVER_CHAT){
    return;
  }

  window.SUNBEAM_DRIVER_CHAT = true;

  const API = {
    messages:"/api/driver-chat/messages"
  };

  const POLL_MS = 5000;

  let pollTimer = null;
  let sending = false;
  let lastSignature = "";

  function $(id){
    return document.getElementById(id);
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

  function getToken(){
    return (
      localStorage.getItem("driverToken") ||
      localStorage.getItem("token") ||
      ""
    );
  }

  function ensureSession(){

    const driver = getLoggedDriver();

    if(
      !driver ||
      Object.keys(driver).length === 0
    ){
      window.location.href = "login.html";
      return false;
    }

    return true;
  }

  function loadDriverName(){

    const el = $("driverName");
    if(!el) return;

    const driver = getLoggedDriver();

    el.textContent =
      driver?.name ||
      driver?.fullName ||
      driver?.username ||
      driver?.email ||
      "Driver";
  }

  function showError(message){

    const el = $("chatError");
    if(!el) return;

    const text = String(message || "").trim();

    if(!text){
      el.textContent = "";
      el.classList.remove("show");
      return;
    }

    el.textContent = text;
    el.classList.add("show");
  }

  function setConnection(isOnline,text){

    const dot = $("connectionDot");
    const label = $("connectionText");

    if(dot){
      dot.classList.toggle(
        "online",
        Boolean(isOnline)
      );
    }

    if(label){
      label.textContent =
        text ||
        (isOnline ? "Connected" : "Waiting for server");
    }
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

  function escapeText(value){
    return String(value ?? "");
  }

  function senderType(message){

    const raw = String(
      message?.senderType ||
      message?.senderRole ||
      message?.role ||
      ""
    ).toLowerCase();

    if(
      raw === "driver" ||
      raw === "DRIVER".toLowerCase()
    ){
      return "driver";
    }

    return "dispatch";
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

  function renderMessages(messages){

    const list = $("messages");
    const empty = $("emptyChat");

    if(!list) return;

    const signature = makeSignature(messages);

    if(signature === lastSignature){
      return;
    }

    lastSignature = signature;

    list.innerHTML = "";

    if(!messages.length){

      if(empty){
        list.appendChild(empty);
        empty.style.display = "";
      }

      return;
    }

    messages.forEach((message,index)=>{

      const side = senderType(message);

      const row = document.createElement("div");
      row.className = `message-row ${side}`;
      row.dataset.messageId = messageId(message,index);

      const bubble = document.createElement("div");
      bubble.className = "message-bubble";

      const meta = document.createElement("div");
      meta.className = "message-meta";

      meta.textContent =
        side === "driver"
          ? "You"
          : (
              message?.senderName ||
              message?.dispatchName ||
              "Dispatch"
            );

      const body = document.createElement("div");
      body.className = "message-text";
      body.textContent = escapeText(
        message?.text ??
        message?.message ??
        ""
      );

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

    try{

      const response = await fetch(
        API.messages,
        {
          method:"GET",
          headers:authHeaders(),
          cache:"no-store"
        }
      );

      if(!response.ok){
        throw new Error(
          `Chat server returned ${response.status}`
        );
      }

      const payload = await response.json();

      const messages = normalizeMessages(payload);

      renderMessages(messages);
      setConnection(true,"Connected");
      showError("");

    }catch(error){

      setConnection(false,"Waiting for server");

      /*
        The backend will be created next.
        Keep the page working visually without inventing messages.
      */

      if(
        error &&
        String(error.message || "").includes("404")
      ){
        showError("");
      }

    }

  }

  async function sendMessage(text){

    if(sending) return;

    const cleanText = String(text || "").trim();

    if(!cleanText){
      return;
    }

    const input = $("messageInput");
    const button = $("sendButton");

    sending = true;

    if(button){
      button.disabled = true;
    }

    showError("");

    try{

      const driver = getLoggedDriver();

      const response = await fetch(
        API.messages,
        {
          method:"POST",
          headers:authHeaders(),
          body:JSON.stringify({
            text:cleanText,
            senderType:"DRIVER",
            driverId:
              driver?._id ||
              driver?.id ||
              driver?.driverId ||
              null
          })
        }
      );

      if(!response.ok){

        let errorText = "";

        try{
          const data = await response.json();
          errorText =
            data?.message ||
            data?.error ||
            "";
        }catch{
          errorText = "";
        }

        throw new Error(
          errorText ||
          `Unable to send message (${response.status})`
        );
      }

      if(input){
        input.value = "";
        autoResizeInput();
      }

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

  function autoResizeInput(){

    const input = $("messageInput");
    if(!input) return;

    input.style.height = "auto";

    input.style.height =
      Math.min(
        input.scrollHeight,
        120
      ) + "px";
  }

  function bindForm(){

    const form = $("chatForm");
    const input = $("messageInput");

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

    if(input){

      input.addEventListener(
        "input",
        autoResizeInput
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

  }

  function startPolling(){

    stopPolling();

    pollTimer = window.setInterval(
      loadMessages,
      POLL_MS
    );

  }

  function stopPolling(){

    if(pollTimer){

      window.clearInterval(pollTimer);
      pollTimer = null;

    }

  }

  function bindVisibility(){

    document.addEventListener(
      "visibilitychange",
      function(){

        if(document.hidden){

          stopPolling();

        }else{

          if(!ensureSession()){
            return;
          }

          loadDriverName();
          loadMessages();
          startPolling();

        }

      }
    );

  }

  async function init(){

    if(!ensureSession()){
      return;
    }

    loadDriverName();
    bindForm();
    bindVisibility();

    await loadMessages();
    startPolling();

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