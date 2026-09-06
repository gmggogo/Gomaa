"use strict";

/*
DESTINATION PATH:
server/public/platform-admin/js/broker-integrations.js
*/

(() => {

  const $ = (id) =>
    document.getElementById(id);

  const state = {
    items:[],
    tenants:[],
    editingId:""
  };

  function token(){
    return String(
      sessionStorage.getItem("staffToken") ||
      sessionStorage.getItem("token") ||
      localStorage.getItem("token") ||
      ""
    ).trim();
  }

  function headers(json=true){

    const h = {
      Authorization:
        `Bearer ${token()}`
    };

    if(json){
      h["Content-Type"] =
        "application/json";
    }

    return h;
  }

  async function api(url, options = {}){

    const res =
      await fetch(
        url,
        {
          ...options,
          headers:{
            ...headers(
              options.body !== undefined
            ),
            ...(options.headers || {})
          },
          cache:"no-store"
        }
      );

    const data =
      await res
        .json()
        .catch(()=>({}));

    if(!res.ok){
      throw new Error(
        data.message ||
        `Request failed (${res.status})`
      );
    }

    return data;
  }

  function boolValue(id){
    return $(id).value === "true";
  }

  function upper2(value){
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g,"")
      .slice(0,2);
  }

  function escapeHtml(value){

    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function selectedTenant(){

    const id =
      String(
        $("tenantSelect")?.value ||
        ""
      ).trim();

    return state.tenants.find(
      row =>
        String(row?._id || "") === id
    ) || null;
  }

  function applySelectedTenant(){

    const tenant =
      selectedTenant();

    $("tenantId").value =
      tenant?._id
        ? String(tenant._id)
        : "";

    $("tenantSlug").value =
      tenant?.slug ||
      "";
  }

  function renderTenantOptions(){

    const select =
      $("tenantSelect");

    if(!select){
      return;
    }

    const current =
      String(
        select.value ||
        $("tenantId")?.value ||
        ""
      ).trim();

    select.innerHTML =
      `<option value="">Select Company</option>` +
      state.tenants
        .map(tenant => {

          const id =
            String(
              tenant?._id ||
              ""
            );

          const name =
            tenant?.name ||
            tenant?.slug ||
            "Company";

          const enabled =
            tenant?.enabled !== false;

          return `
            <option
              value="${escapeHtml(id)}"
              ${id === current ? "selected" : ""}
            >
              ${escapeHtml(name)}${enabled ? "" : " (Disabled)"}
            </option>
          `;
        })
        .join("");

    applySelectedTenant();
  }

  async function loadTenants(){

    const tenants =
      await api(
        "/api/platform-admin/tenants"
      );

    if(!Array.isArray(tenants)){
      throw new Error(
        "Invalid companies response"
      );
    }

    state.tenants =
      tenants;

    renderTenantOptions();
  }

  function tenantName(tenantId, tenantSlug){

    const id =
      String(
        tenantId ||
        ""
      );

    const slug =
      String(
        tenantSlug ||
        ""
      ).toLowerCase();

    const tenant =
      state.tenants.find(row =>
        String(row?._id || "") === id ||
        String(row?.slug || "")
          .toLowerCase() === slug
      );

    return (
      tenant?.name ||
      tenantSlug ||
      tenantId ||
      ""
    );
  }

  function showConnectionBox(){

    const type =
      $("connectionType").value;

    document
      .querySelectorAll(".connection-box")
      .forEach((box) => {
        box.classList.toggle(
          "active",
          box.dataset.type === type
        );
      });
  }

  function payload(){

    applySelectedTenant();

    const tenant =
      selectedTenant();

    if(!tenant){
      throw new Error(
        "Select a company."
      );
    }

    const tenantId =
      String(
        tenant._id ||
        ""
      ).trim();

    const tenantSlug =
      String(
        tenant.slug ||
        ""
      ).trim();

    if(!tenantId){
      throw new Error(
        "Selected company is missing its Tenant ID."
      );
    }

    const brokerName =
      $("brokerName").value.trim();

    if(!brokerName){
      throw new Error(
        "Broker Name is required."
      );
    }

    const brokerCode =
      upper2(
        $("brokerCode").value
      );

    if(brokerCode.length !== 2){
      throw new Error(
        "Broker Code must contain exactly two letters or numbers."
      );
    }

    return {
      tenantId,
      tenantSlug,

      brokerName,
      brokerCode,

      connectionType:
        $("connectionType").value,

      monthlyFlatFee:
        Number(
          $("monthlyFlatFee").value ||
          0
        ),

      featureVisible:
        boolValue("featureVisible"),

      enabled:
        boolValue("enabled"),

      billingEnabled:
        boolValue("billingEnabled"),

      api:{
        endpoint:
          $("apiEndpoint").value.trim(),

        authType:
          $("apiAuthType").value,

        apiKeyEncrypted:
          $("apiKey").value,

        bearerTokenEncrypted:
          $("bearerToken").value,

        usernameEncrypted:
          $("apiUsername").value,

        passwordEncrypted:
          $("apiPassword").value,

        clientIdEncrypted:
          $("clientId").value,

        clientSecretEncrypted:
          $("clientSecret").value,

        tokenUrl:
          $("tokenUrl").value.trim(),

        pollEnabled:
          boolValue("pollEnabled"),

        pollMinutes:
          Number(
            $("pollMinutes").value ||
            15
          )
      },

      webhook:{
        inboundPath:
          $("webhookInboundPath").value.trim(),

        secretEncrypted:
          $("webhookSecret").value,

        signatureHeader:
          $("signatureHeader").value.trim(),

        signatureAlgorithm:
          $("signatureAlgorithm").value
      },

      sftp:{
        host:
          $("sftpHost").value.trim(),

        port:
          Number(
            $("sftpPort").value ||
            22
          ),

        usernameEncrypted:
          $("sftpUsername").value,

        passwordEncrypted:
          $("sftpPassword").value,

        privateKeyEncrypted:
          $("sftpPrivateKey").value,

        remotePath:
          $("sftpRemotePath").value.trim(),

        filePattern:
          $("sftpFilePattern").value.trim(),

        processedPath:
          $("sftpProcessedPath").value.trim()
      },

      fileImport:{
        allowedTypes:
          $("allowedTypes").value
            .split(",")
            .map(v => v.trim().toLowerCase())
            .filter(Boolean),

        delimiter:
          $("delimiter").value || ",",

        hasHeaderRow:
          boolValue("hasHeaderRow")
      }
    };
  }

  function clearEditor(){

    state.editingId = "";

    $("tenantSelect").value = "";
    $("tenantId").value = "";
    $("tenantSlug").value = "";

    [
      "brokerName",
      "brokerCode",
      "apiEndpoint",
      "apiKey",
      "bearerToken",
      "apiUsername",
      "apiPassword",
      "clientId",
      "clientSecret",
      "tokenUrl",
      "webhookInboundPath",
      "webhookSecret",
      "signatureHeader",
      "sftpHost",
      "sftpUsername",
      "sftpPassword",
      "sftpPrivateKey",
      "sftpRemotePath",
      "sftpFilePattern",
      "sftpProcessedPath"
    ].forEach(id => {
      if($(id)){
        $(id).value = "";
      }
    });

    $("connectionType").value = "API";
    $("monthlyFlatFee").value = "0";
    $("featureVisible").value = "true";
    $("enabled").value = "true";
    $("billingEnabled").value = "true";
    $("apiAuthType").value = "NONE";
    $("pollEnabled").value = "false";
    $("pollMinutes").value = "15";
    $("signatureAlgorithm").value = "NONE";
    $("sftpPort").value = "22";
    $("allowedTypes").value = "csv,json,xlsx";
    $("delimiter").value = ",";
    $("hasHeaderRow").value = "true";

    showConnectionBox();
  }

  function render(){

    const body =
      $("integrationRows");

    body.innerHTML = "";

    if(!state.items.length){

      body.innerHTML = `
        <tr>
          <td colspan="10">
            No broker connections configured.
          </td>
        </tr>
      `;

      return;
    }

    for(const item of state.items){

      const tr =
        document.createElement("tr");

      const lastReceived =
        item.lastReceivedAt
          ? new Date(
              item.lastReceivedAt
            ).toLocaleString()
          : "-";

      tr.innerHTML = `
        <td>${escapeHtml(tenantName(item.tenantId,item.tenantSlug))}</td>
        <td>${escapeHtml(item.brokerName || "")}</td>
        <td><strong>${escapeHtml(item.brokerCode || "")}</strong></td>
        <td>${escapeHtml(item.connectionType || "")}</td>
        <td>${item.featureVisible ? "Visible" : "Hidden"}</td>
        <td>${item.billingEnabled ? "Active" : "Disabled"}</td>
        <td>$${Number(item.monthlyFlatFee || 0).toFixed(2)}</td>
        <td><span class="status ${escapeHtml(item.connectionStatus || "")}">${escapeHtml(item.connectionStatus || "")}</span></td>
        <td>${escapeHtml(lastReceived)}</td>
        <td>
          <button class="btn btn-light" data-edit="${escapeHtml(item._id)}">Edit</button>
          <button class="btn btn-light" data-test="${escapeHtml(item._id)}">Test</button>
        </td>
      `;

      body.appendChild(tr);
    }

    body
      .querySelectorAll("[data-edit]")
      .forEach(btn => {
        btn.addEventListener("click", () => {
          editItem(
            btn.dataset.edit
          );
        });
      });

    body
      .querySelectorAll("[data-test]")
      .forEach(btn => {
        btn.addEventListener("click", () => {
          testConnection(
            btn.dataset.test
          );
        });
      });
  }

  async function loadIntegrations(){

    const data =
      await api(
        "/api/platform/broker-integrations"
      );

    state.items =
      data.integrations ||
      [];

    render();
  }

  function setValue(id,value){

    if($(id)){
      $(id).value =
        value ?? "";
    }
  }

  function editItem(id){

    const item =
      state.items.find(
        x => x._id === id
      );

    if(!item){
      return;
    }

    state.editingId =
      item._id;

    const matchingTenant =
      state.tenants.find(row =>
        String(row?._id || "") ===
          String(item.tenantId || "") ||
        String(row?.slug || "")
          .toLowerCase() ===
          String(item.tenantSlug || "")
            .toLowerCase()
      );

    setValue(
      "tenantSelect",
      matchingTenant?._id ||
      item.tenantId ||
      ""
    );

    applySelectedTenant();

    if(!matchingTenant){
      setValue(
        "tenantId",
        item.tenantId
      );

      setValue(
        "tenantSlug",
        item.tenantSlug
      );
    }

    setValue(
      "brokerName",
      item.brokerName
    );

    setValue(
      "brokerCode",
      item.brokerCode
    );

    setValue(
      "connectionType",
      item.connectionType
    );

    setValue(
      "monthlyFlatFee",
      item.monthlyFlatFee || 0
    );

    setValue(
      "featureVisible",
      String(
        Boolean(
          item.featureVisible
        )
      )
    );

    setValue(
      "enabled",
      String(
        Boolean(
          item.enabled
        )
      )
    );

    setValue(
      "billingEnabled",
      String(
        Boolean(
          item.billingEnabled
        )
      )
    );

    const apiData =
      item.api || {};

    setValue(
      "apiEndpoint",
      apiData.endpoint
    );

    setValue(
      "apiAuthType",
      apiData.authType || "NONE"
    );

    setValue(
      "tokenUrl",
      apiData.tokenUrl
    );

    setValue(
      "pollEnabled",
      String(
        Boolean(
          apiData.pollEnabled
        )
      )
    );

    setValue(
      "pollMinutes",
      apiData.pollMinutes || 15
    );

    const webhook =
      item.webhook || {};

    setValue(
      "webhookInboundPath",
      webhook.inboundPath
    );

    setValue(
      "signatureHeader",
      webhook.signatureHeader
    );

    setValue(
      "signatureAlgorithm",
      webhook.signatureAlgorithm || "NONE"
    );

    const sftp =
      item.sftp || {};

    setValue(
      "sftpHost",
      sftp.host
    );

    setValue(
      "sftpPort",
      sftp.port || 22
    );

    setValue(
      "sftpRemotePath",
      sftp.remotePath
    );

    setValue(
      "sftpFilePattern",
      sftp.filePattern
    );

    setValue(
      "sftpProcessedPath",
      sftp.processedPath
    );

    const fileImport =
      item.fileImport || {};

    setValue(
      "allowedTypes",
      (
        fileImport.allowedTypes ||
        ["csv","json","xlsx"]
      ).join(",")
    );

    setValue(
      "delimiter",
      fileImport.delimiter || ","
    );

    setValue(
      "hasHeaderRow",
      String(
        fileImport.hasHeaderRow !== false
      )
    );

    [
      "apiKey",
      "bearerToken",
      "apiUsername",
      "apiPassword",
      "clientId",
      "clientSecret",
      "webhookSecret",
      "sftpUsername",
      "sftpPassword",
      "sftpPrivateKey"
    ].forEach(id => {
      if($(id)){
        $(id).value = "";
      }
    });

    showConnectionBox();

    window.scrollTo({
      top:0,
      behavior:"smooth"
    });
  }

  async function save(){

    try{

      const body =
        payload();

      const data =
        await api(
          "/api/platform/broker-integrations",
          {
            method:"POST",
            body:JSON.stringify(body)
          }
        );

      alert(
        data.message ||
        "Broker connection saved."
      );

      clearEditor();

      await loadIntegrations();

    }catch(err){

      alert(
        err.message ||
        "Failed to save connection"
      );
    }
  }

  async function testConnection(id){

    const targetId =
      id ||
      state.editingId;

    if(!targetId){

      alert(
        "Save the connection before testing."
      );

      return;
    }

    try{

      const data =
        await api(
          `/api/platform/broker-integrations/${encodeURIComponent(targetId)}/test`,
          {
            method:"POST",
            body:"{}"
          }
        );

      alert(
        data.result?.message ||
        "Connection configuration passed."
      );

      await loadIntegrations();

    }catch(err){

      alert(
        err.message ||
        "Connection test failed"
      );
    }
  }

  $("tenantSelect")
    ?.addEventListener(
      "change",
      applySelectedTenant
    );

  $("connectionType")
    ?.addEventListener(
      "change",
      showConnectionBox
    );

  $("brokerCode")
    ?.addEventListener(
      "input",
      event => {
        event.target.value =
          upper2(
            event.target.value
          );
      }
    );

  $("saveBtn")
    ?.addEventListener(
      "click",
      save
    );

  $("testBtn")
    ?.addEventListener(
      "click",
      () => testConnection()
    );

  $("clearBtn")
    ?.addEventListener(
      "click",
      clearEditor
    );

  $("newIntegrationBtn")
    ?.addEventListener(
      "click",
      () => {
        clearEditor();

        window.scrollTo({
          top:0,
          behavior:"smooth"
        });
      }
    );

  async function init(){

    showConnectionBox();

    try{

      await loadTenants();
      await loadIntegrations();

    }catch(err){

      console.error(
        "BROKER INTEGRATIONS INIT ERROR:",
        err
      );

      alert(
        err.message ||
        "Failed to load Broker Integrations."
      );
    }
  }

  init();

})();
