"use strict";

const CompanyHelpCenter = (()=>{

  const state = {
    index:null,
    pages:new Map(),
    scope:"active",
    conversations:[],
    activeConversationId:"",
    identity:null,
    pollTimer:null
  };

  const $ =
    id=>document.getElementById(id);

  function token(){
    return String(
      sessionStorage.getItem("companyToken") ||
      localStorage.getItem("companyToken") ||
      (
        String(
          localStorage.getItem("role") ||
          ""
        ).toLowerCase() === "company"
          ? localStorage.getItem("token")
          : ""
      ) ||
      ""
    ).trim();
  }

  function headers(json=false){
    const result = {
      Authorization:
        "Bearer " + token()
    };

    if(json){
      result["Content-Type"] =
        "application/json";
    }

    return result;
  }

  function esc(value){
    return String(value ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  function clean(value){
    return String(value ?? "")
      .trim();
  }

  function fmt(value){
    if(!value) return "";
    try{
      return new Date(value)
        .toLocaleString();
    }catch(err){
      return "";
    }
  }

  async function jsonFetch(url,options={}){
    const response =
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
      await response
        .json()
        .catch(()=>({}));

    if(!response.ok){
      throw new Error(
        data?.message ||
        `HTTP ${response.status}`
      );
    }

    return data;
  }

  async function loadHelp(){
    const index =
      await fetch(
        "/companies/help-data/help-index.json",
        {
          cache:"no-store"
        }
      ).then(r=>r.json());

    state.index = index;

    for(const page of index.pages || []){
      const data =
        await fetch(
          "/companies/help-data/" +
          page.file,
          {
            cache:"no-store"
          }
        ).then(r=>r.json());

      state.pages.set(
        page.id,
        data
      );
    }

    renderPageFilter();
    renderHelp();
  }

  function renderPageFilter(){
    const select =
      $("helpPageFilter");

    for(const page of state.index?.pages || []){
      const option =
        document.createElement("option");

      option.value =
        page.id;

      option.textContent =
        page.name;

      select.appendChild(option);
    }
  }

  function helpRows(){
    const query =
      clean(
        $("helpSearch")?.value
      ).toLowerCase();

    const selected =
      clean(
        $("helpPageFilter")?.value
      );

    const rows = [];

    for(const pageMeta of state.index?.pages || []){
      if(
        selected &&
        pageMeta.id !== selected
      ){
        continue;
      }

      const page =
        state.pages.get(
          pageMeta.id
        );

      for(const task of page?.tasks || []){
        const haystack =
          [
            page.name,
            page.description,
            task.title,
            task.summary,
            ...(task.steps || []),
            ...(task.keywords || [])
          ]
          .join(" ")
          .toLowerCase();

        if(
          !query ||
          haystack.includes(query)
        ){
          rows.push({
            page,
            task
          });
        }
      }
    }

    return rows;
  }

  function renderHelp(){
    const selected =
      clean(
        $("helpPageFilter")?.value
      );

    const selectedBox =
      $("selectedPage");

    if(selected){
      const page =
        state.pages.get(
          selected
        );

      selectedBox.style.display =
        "block";

      $("selectedPageTitle").textContent =
        page?.name ||
        "";

      $("selectedPageDescription").textContent =
        page?.description ||
        "";

    }else{
      selectedBox.style.display =
        "none";
    }

    const rows =
      helpRows();

    const host =
      $("helpResults");

    if(!rows.length){
      host.innerHTML =
        `<div class="empty">No help article matches your search.</div>`;
      return;
    }

    host.innerHTML =
      rows
        .map(
          ({page,task})=>`
            <article class="result">
              <button type="button">
                ${esc(task.title)}
                <div style="margin-top:4px;font-size:11px;color:#7a5b10">
                  ${esc(page.name)}
                </div>
              </button>

              <div class="result-body">
                <p class="result-summary">
                  ${esc(task.summary)}
                </p>

                <ol>
                  ${(task.steps || []).map(step=>`<li>${esc(step)}</li>`).join("")}
                </ol>
              </div>
            </article>
          `
        )
        .join("");

    host
      .querySelectorAll(
        ".result > button"
      )
      .forEach(
        button=>{
          button.addEventListener(
            "click",
            ()=>{
              button
                .closest(".result")
                .classList
                .toggle("open");
            }
          );
        }
      );
  }

  async function loadIdentity(){
    const data =
      await jsonFetch(
        "/api/company-support/company/me"
      );

    state.identity =
      data.identity || {};

    $("supportCompanyName").textContent =
      state.identity.companyName ||
      "-";

    $("supportCompanyPhone").textContent =
      state.identity.companyPhone ||
      "Not Available";

    $("supportUserName").textContent =
      state.identity.userName ||
      "-";
  }

  async function loadConversations(){
    const data =
      await jsonFetch(
        "/api/company-support/company/conversations?scope=" +
        encodeURIComponent(
          state.scope
        )
      );

    state.conversations =
      Array.isArray(
        data.conversations
      )
        ? data.conversations
        : [];

    renderConversations();
  }

  function renderConversations(){
    const host =
      $("conversationList");

    if(!state.conversations.length){
      host.innerHTML =
        `<div class="empty">${
          state.scope === "history"
            ? "No resolved conversations."
            : "No active conversations."
        }</div>`;
      return;
    }

    host.innerHTML =
      state.conversations
        .map(
          conversation=>`
            <div
              class="conv-item ${
                String(conversation._id) ===
                state.activeConversationId
                  ? "active"
                  : ""
              }"
              data-id="${esc(conversation._id)}">

              <div class="conv-title">
                ${esc(conversation.subject)}
              </div>

              <div class="conv-meta">
                ${esc(conversation.status)}
              </div>

              <div class="conv-meta">
                ${
                  conversation.status === "RESOLVED"
                    ? "Resolved " + esc(fmt(conversation.resolvedAt))
                    : esc(fmt(conversation.lastMessageAt))
                }
              </div>

              ${
                Number(
                  conversation.companyUnreadCount ||
                  0
                ) > 0
                  ? `<div class="conv-meta"><b>${Number(conversation.companyUnreadCount)} new reply</b></div>`
                  : ""
              }
            </div>
          `
        )
        .join("");

    host
      .querySelectorAll(
        "[data-id]"
      )
      .forEach(
        row=>{
          row.addEventListener(
            "click",
            ()=>openConversation(
              row.dataset.id
            )
          );
        }
      );
  }

  function renderMessages(messages){
    const host =
      $("messages");

    host.innerHTML =
      (messages || [])
        .map(
          message=>{
            const superAdmin =
              message.senderType ===
              "SUPER_ADMIN";

            return `
              <div class="msg ${superAdmin ? "super" : "company"}">
                <div class="msg-meta">
                  ${esc(message.senderName || (superAdmin ? "Super Admin" : "Company"))}
                  · ${esc(message.senderRole || "")}
                  · ${esc(fmt(message.createdAt))}
                </div>
                <div class="msg-text">
                  ${esc(message.message)}
                </div>
              </div>
            `;
          }
        )
        .join("");

    host.scrollTop =
      host.scrollHeight;
  }

  async function openConversation(id){
    state.activeConversationId =
      clean(id);

    if(!state.activeConversationId){
      return;
    }

    const data =
      await jsonFetch(
        "/api/company-support/conversations/" +
        encodeURIComponent(
          state.activeConversationId
        )
      );

    const conversation =
      data.conversation ||
      {};

    $("chatEmpty").style.display =
      "none";

    $("chatView")
      .classList
      .add("show");

    $("chatSubject").textContent =
      conversation.subject ||
      "Support Conversation";

    $("chatStatus").textContent =
      "Status: " +
      (
        conversation.status ||
        "-"
      );

    const resolved =
      conversation.status ===
      "RESOLVED";

    $("resolvedInfo").style.display =
      resolved
        ? "block"
        : "none";

    $("resolvedInfo").innerHTML =
      resolved
        ? `<b>Resolved:</b> ${esc(fmt(conversation.resolvedAt))}<br>` +
          `<b>Resolved By:</b> ${esc(conversation.resolvedByName || "-")}`
        : "";

    $("composer").style.display =
      resolved
        ? "none"
        : "flex";

    renderMessages(
      data.messages ||
      []
    );

    await loadConversations();
  }

  function setScope(scope){
    state.scope =
      scope === "history"
        ? "history"
        : "active";

    state.activeConversationId =
      "";

    $("activeTabBtn")
      .classList
      .toggle(
        "active",
        state.scope === "active"
      );

    $("historyTabBtn")
      .classList
      .toggle(
        "active",
        state.scope === "history"
      );

    $("chatView")
      .classList
      .remove("show");

    $("chatEmpty").style.display =
      "flex";

    $("chatEmpty").textContent =
      state.scope === "history"
        ? "Select a resolved support conversation."
        : "Select a conversation or create a new support request.";

    loadConversations();
  }

  async function createConversation(){
    const subject =
      clean(
        $("supportSubject").value
      );

    const message =
      clean(
        $("supportDescription").value
      );

    if(!subject){
      alert("Subject is required");
      return;
    }

    if(!message){
      alert("Describe your issue");
      return;
    }

    const button =
      $("sendSupportBtn");

    button.disabled =
      true;

    try{
      const data =
        await jsonFetch(
          "/api/company-support/company/conversations",
          {
            method:"POST",
            body:JSON.stringify({
              subject,
              message
            })
          }
        );

      $("newSupportForm")
        .classList
        .remove("show");

      $("supportSubject").value =
        "";

      $("supportDescription").value =
        "";

      await setScope("active");

      if(data.conversation?._id){
        await openConversation(
          data.conversation._id
        );
      }

    }catch(err){
      alert(err.message);

    }finally{
      button.disabled =
        false;
    }
  }

  async function sendMessage(){
    const message =
      clean(
        $("messageInput").value
      );

    if(
      !message ||
      !state.activeConversationId
    ){
      return;
    }

    const button =
      $("sendMessageBtn");

    button.disabled =
      true;

    try{
      await jsonFetch(
        "/api/company-support/conversations/" +
        encodeURIComponent(
          state.activeConversationId
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
        state.activeConversationId
      );

    }catch(err){
      alert(err.message);

    }finally{
      button.disabled =
        false;
    }
  }

  async function poll(){
    try{
      await loadConversations();

      if(state.activeConversationId){
        await openConversation(
          state.activeConversationId
        );
      }
    }catch(err){}
  }

  function bind(){
    $("helpSearch")
      .addEventListener(
        "input",
        renderHelp
      );

    $("helpPageFilter")
      .addEventListener(
        "change",
        renderHelp
      );

    $("newSupportBtn")
      .addEventListener(
        "click",
        ()=>$("newSupportForm")
          .classList
          .add("show")
      );

    $("cancelSupportBtn")
      .addEventListener(
        "click",
        ()=>$("newSupportForm")
          .classList
          .remove("show")
      );

    $("sendSupportBtn")
      .addEventListener(
        "click",
        createConversation
      );

    $("activeTabBtn")
      .addEventListener(
        "click",
        ()=>setScope("active")
      );

    $("historyTabBtn")
      .addEventListener(
        "click",
        ()=>setScope("history")
      );

    $("sendMessageBtn")
      .addEventListener(
        "click",
        sendMessage
      );

    $("messageInput")
      .addEventListener(
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

  async function init(){
    if(!token()){
      window.location.replace(
        "/companies/company-login.html"
      );
      return;
    }

    bind();

    await Promise.all([
      loadHelp(),
      loadIdentity(),
      loadConversations()
    ]);

    clearInterval(
      state.pollTimer
    );

    state.pollTimer =
      setInterval(
        poll,
        12000
      );
  }

  return {
    init
  };

})();

CompanyHelpCenter.init();
