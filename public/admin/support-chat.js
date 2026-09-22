"use strict";

const SupportChat = (()=>{

  const state = {
    identity:null,
    conversations:[],
    activeId:"",
    pollTimer:null
  };

  const $ = id=>document.getElementById(id);

  function token(){
    return String(
      sessionStorage.getItem("staffToken") ||
      localStorage.getItem("token") ||
      ""
    ).trim();
  }

  function headers(json=false){
    const h = {
      Authorization:
        "Bearer " + token()
    };

    if(json){
      h["Content-Type"] =
        "application/json";
    }

    return h;
  }

  function esc(value){
    return String(value ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  function fmt(date){
    if(!date) return "";
    try{
      return new Date(date)
        .toLocaleString();
    }catch(err){
      return "";
    }
  }

  async function api(
    url,
    options={}
  ){
    const res =
      await fetch(
        url,
        {
          cache:"no-store",
          ...options,
          headers:{
            ...headers(
              !!options.body
            ),
            ...(options.headers || {})
          }
        }
      );

    const data =
      await res
        .json()
        .catch(()=>({}));

    if(!res.ok){
      throw new Error(
        data?.message ||
        "Request failed"
      );
    }

    return data;
  }

  async function loadIdentity(){
    const data =
      await api(
        "/api/platform-support/tenant/me"
      );

    state.identity =
      data.identity || {};

    $("companyName").textContent =
      state.identity.tenantName ||
      "-";

    const companyPhone =
      state.identity.companyPhone ||
      "";

    if(companyPhone){
      $("companyPhone").innerHTML =
        `<a href="tel:${esc(companyPhone)}">${esc(companyPhone)}</a>`;
    }else{
      $("companyPhone").textContent =
        "Not Available";
    }

    $("userName").textContent =
      state.identity.userName ||
      "-";

    $("userRole").textContent =
      state.identity.userRole ||
      "-";

    const userPhone =
      state.identity.userPhone ||
      "";

    if(userPhone){
      $("userPhone").innerHTML =
        `<a href="tel:${esc(userPhone)}">${esc(userPhone)}</a>`;
    }else{
      $("userPhone").textContent =
        "Not Available";
    }
  }

  async function loadList(){
    const data =
      await api(
        "/api/platform-support/tenant/conversations"
      );

    state.conversations =
      Array.isArray(
        data.conversations
      )
        ? data.conversations
        : [];

    renderList();
  }

  function renderList(){
    const host =
      $("conversationList");

    if(!state.conversations.length){
      host.innerHTML =
        `<div style="padding:12px;color:#718096;text-align:center">No support conversations yet.</div>`;
      return;
    }

    host.innerHTML =
      state.conversations
        .map(row=>`
          <div class="conv-item ${String(row._id) === state.activeId ? "active" : ""}"
               data-id="${esc(row._id)}">
            <div class="conv-item-title">${esc(row.subject)}</div>
            <div class="conv-item-meta">${esc(row.status || "")}</div>
            <div class="conv-item-meta">${esc(fmt(row.lastMessageAt))}</div>
            ${
              Number(row.tenantUnreadCount || 0) > 0
                ? `<div class="conv-item-meta"><b>${Number(row.tenantUnreadCount)} new reply</b></div>`
                : ""
            }
          </div>
        `)
        .join("");

    host
      .querySelectorAll(
        ".conv-item"
      )
      .forEach(item=>{
        item.addEventListener(
          "click",
          ()=>{
            openConversation(
              item.dataset.id
            );
          }
        );
      });
  }

  async function openConversation(
    id
  ){
    if(!id) return;

    state.activeId =
      String(id);

    const data =
      await api(
        "/api/platform-support/conversations/" +
        encodeURIComponent(
          state.activeId
        )
      );

    $("chatEmpty").style.display =
      "none";

    $("chatView").style.display =
      "flex";

    $("chatSubject").textContent =
      data.conversation?.subject ||
      "Support Conversation";

    $("chatStatus").textContent =
      "Status: " +
      (
        data.conversation?.status ||
        "-"
      );

    renderMessages(
      data.messages || []
    );

    await loadList();
  }

  function renderMessages(
    messages
  ){
    const host =
      $("messages");

    host.innerHTML =
      messages
        .map(message=>{
          const platform =
            message.senderType ===
            "PLATFORM_ADMIN";

          return `
            <div class="msg ${platform ? "platform" : "staff"}">
              <div class="msg-meta">
                ${esc(message.senderName || (platform ? "Platform Admin" : "Staff"))}
                · ${esc(message.senderRole || "")}
                · ${esc(fmt(message.createdAt))}
              </div>
              <div class="msg-text">${esc(message.message)}</div>
            </div>
          `;
        })
        .join("");

    host.scrollTop =
      host.scrollHeight;
  }

  async function sendMessage(){
    const text =
      String(
        $("messageInput").value ||
        ""
      ).trim();

    if(
      !text ||
      !state.activeId
    ){
      return;
    }

    $("sendMessageBtn").disabled =
      true;

    try{
      await api(
        "/api/platform-support/conversations/" +
        encodeURIComponent(
          state.activeId
        ) +
        "/messages",
        {
          method:"POST",
          body:JSON.stringify({
            message:text
          })
        }
      );

      $("messageInput").value =
        "";

      await openConversation(
        state.activeId
      );

    }catch(err){
      alert(
        err.message
      );

    }finally{
      $("sendMessageBtn").disabled =
        false;
    }
  }

  function showNew(){
    $("newSubject").value = "";
    $("newMessage").value = "";
    $("newConversationModal")
      .classList
      .add("show");
  }

  function hideNew(){
    $("newConversationModal")
      .classList
      .remove("show");
  }

  async function startNew(){
    const subject =
      String(
        $("newSubject").value ||
        ""
      ).trim();

    const message =
      String(
        $("newMessage").value ||
        ""
      ).trim();

    if(!subject){
      alert("Subject is required");
      return;
    }

    if(!message){
      alert("Describe your issue");
      return;
    }

    $("startNewBtn").disabled =
      true;

    try{
      const data =
        await api(
          "/api/platform-support/tenant/conversations",
          {
            method:"POST",
            body:JSON.stringify({
              subject,
              message
            })
          }
        );

      hideNew();
      await loadList();

      if(
        data.conversation?._id
      ){
        await openConversation(
          data.conversation._id
        );
      }

    }catch(err){
      alert(
        err.message
      );

    }finally{
      $("startNewBtn").disabled =
        false;
    }
  }

  function bind(){
    $("newConversationBtn")
      ?.addEventListener(
        "click",
        showNew
      );

    $("cancelNewBtn")
      ?.addEventListener(
        "click",
        hideNew
      );

    $("startNewBtn")
      ?.addEventListener(
        "click",
        startNew
      );

    $("sendMessageBtn")
      ?.addEventListener(
        "click",
        sendMessage
      );

    $("messageInput")
      ?.addEventListener(
        "keydown",
        event=>{
          if(
            event.key === "Enter" &&
            !event.shiftKey
          ){
            event.preventDefault();
            sendMessage();
          }
        }
      );
  }

  function startPolling(){
    clearInterval(
      state.pollTimer
    );

    state.pollTimer =
      setInterval(
        async ()=>{
          try{
            await loadList();

            if(state.activeId){
              await openConversation(
                state.activeId
              );
            }
          }catch(err){}
        },
        12000
      );
  }

  async function init(){
    try{
      bind();
      await loadIdentity();
      await loadList();
      startPolling();

    }catch(err){
      console.error(
        "SUPPORT CHAT:",
        err
      );

      alert(
        err.message ||
        "Support Chat failed to load"
      );
    }
  }

  return {
    init
  };

})();

SupportChat.init();
