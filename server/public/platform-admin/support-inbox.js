"use strict";

const PlatformSupportInbox = (()=>{

  const state = {
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

  async function loadList(){
    const status =
      $("statusFilter")?.value ||
      "";

    const query =
      status
        ? "?status=" +
          encodeURIComponent(
            status
          )
        : "";

    const data =
      await api(
        "/api/platform-support/platform/conversations" +
        query
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
      host.innerHTML = `
        <tr>
          <td
            class="support-table-empty"
            colspan="5">
            No support conversations.
          </td>
        </tr>
      `;
      return;
    }

    host.innerHTML =
      state.conversations
        .map(row=>{
          const unread =
            Number(
              row.platformUnreadCount ||
              0
            );

          const status =
            String(
              row.status ||
              "OPEN"
            );

          const statusLabel =
            status
              .replaceAll("_"," ");

          return `
            <tr
              class="${String(row._id) === state.activeId ? "active" : ""}"
              data-id="${esc(row._id)}">

              <td class="support-company-cell">
                ${esc(row.tenantName || "Company")}
              </td>

              <td class="support-subject-cell">
                ${esc(row.subject || "-")}
              </td>

              <td>
                <span class="support-status ${esc(status)}">
                  ${esc(statusLabel)}
                </span>
              </td>

              <td>
                ${esc(fmt(row.lastMessageAt))}
              </td>

              <td>
                ${
                  unread > 0
                    ? `<span class="support-unread-pill">${unread > 99 ? "99+" : unread}</span>`
                    : `<span class="support-zero">0</span>`
                }
              </td>

            </tr>
          `;
        })
        .join("");

    host
      .querySelectorAll(
        "tr[data-id]"
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

    const c =
      data.conversation ||
      {};

    $("emptyState").style.display =
      "none";

    $("chatView").style.display =
      "flex";

    $("subject").textContent =
      c.subject ||
      "Support Conversation";

    $("companyName").textContent =
      c.tenantName ||
      "-";

    const companyPhone =
      c.companyPhone ||
      "";

    $("companyPhone").innerHTML =
      companyPhone
        ? `<a href="tel:${esc(companyPhone)}">${esc(companyPhone)}</a>`
        : "Not Available";

    $("openedBy").textContent =
      c.createdByName ||
      "-";

    $("openedRole").textContent =
      c.createdByRole ||
      "-";

    const userPhone =
      c.createdByPhone ||
      "";

    $("openedPhone").innerHTML =
      userPhone
        ? `<a href="tel:${esc(userPhone)}">${esc(userPhone)}</a>`
        : "Not Available";

    $("createdAt").textContent =
      fmt(
        c.createdAt
      );

    $("conversationStatus").value =
      c.status ||
      "OPEN";

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
            <div class="msg ${platform ? "platform" : "tenant"}">
              <div class="meta">
                ${esc(message.senderName || (platform ? "Platform Admin" : "Tenant Staff"))}
                · ${esc(message.senderRole || "")}
                ${message.senderPhone ? ` · ${esc(message.senderPhone)}` : ""}
                · ${esc(fmt(message.createdAt))}
              </div>
              <div class="text">${esc(message.message)}</div>
            </div>
          `;
        })
        .join("");

    host.scrollTop =
      host.scrollHeight;
  }

  async function send(){
    const message =
      String(
        $("messageInput").value ||
        ""
      ).trim();

    if(
      !message ||
      !state.activeId
    ){
      return;
    }

    $("sendBtn").disabled =
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
            message
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
      $("sendBtn").disabled =
        false;
    }
  }

  async function changeStatus(){
    if(!state.activeId){
      return;
    }

    try{
      await api(
        "/api/platform-support/platform/conversations/" +
        encodeURIComponent(
          state.activeId
        ) +
        "/status",
        {
          method:"PATCH",
          body:JSON.stringify({
            status:
              $("conversationStatus")
                .value
          })
        }
      );

      await openConversation(
        state.activeId
      );

    }catch(err){
      alert(
        err.message
      );
    }
  }

  function bind(){
    $("statusFilter")
      ?.addEventListener(
        "change",
        loadList
      );

    $("sendBtn")
      ?.addEventListener(
        "click",
        send
      );

    $("conversationStatus")
      ?.addEventListener(
        "change",
        changeStatus
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
            send();
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
    const role =
      String(
        sessionStorage.getItem("staffRole") ||
        localStorage.getItem("role") ||
        ""
      ).trim();

    if(role !== "PLATFORM_ADMIN"){
      window.location.replace(
        "/login.html"
      );
      return;
    }

    bind();
    await loadList();
    startPolling();
  }

  return {
    init
  };

})();

PlatformSupportInbox.init();
