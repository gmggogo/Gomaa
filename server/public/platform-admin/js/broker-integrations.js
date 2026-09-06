/*
DESTINATION PATH:
server/public/platform-admin/js/broker-integrations.js
*/

"use strict";

/*
DESTINATION PATH:
public/platform/js/broker-integrations.js
*/

(() => {

  const $ = (id) =>
    document.getElementById(id);

  const state = {
    items:[],
    editingId:""
  };

  function token(){

    return (
      sessionStorage.getItem("token") ||
      localStorage.getItem("token") ||
      ""
    );
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

  function boolValue(id){
    return $(id).value === "true";
  }

  function upper2(value){
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g,"")
      .slice(0,2);
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
      tenantId:
        $("tenantId").value.trim(),

      tenantSlug:
        $("tenantSlug").value.trim(),

      brokerName:
        $("brokerName").value.trim(),

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

    [
      "tenantId",
      "tenantSlug",
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
      if($(id)) $(id).value = "";
    });

    $("brokerCode").value = "";
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
        <td>${escapeHtml(item.tenantSlug || item.tenantId || "")}</td>
        <td>${escapeHtml(item.brokerName || "")}</td>
        <td><strong>${escapeHtml(item.brokerCode || "")}</strong></td>
        <td>${escapeHtml(item.connectionType || "")}</td>
        <td>${item.featureVisible ? "Visible" : "Hidden"}</td>
        <td>${item.billingEnabled ? "Active" : "Disabled"}</td>
        <td>$${Number(item.monthlyFlatFee || 0).toFixed(2)}</td>
        <td><span class="status ${escapeHtml(item.connectionStatus || "")}">${escapeHtml(item.connectionStatus || "")}</span></td>
        <td>${escapeHtml(lastReceived)}</td>
        <td>
          <button class="btn btn-light" data-edit="${item._id}">Edit</button>
          <button class="btn btn-light" data-test="${item._id}">Test</button>
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

  function escapeHtml(value){

    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  async function load(){

    const res =
      await fetch(
        "/api/platform/broker-integrations",
        {
          headers:headers(false)
        }
      );

    const data =
      await res.json();

    if(!res.ok){
      throw new Error(
        data.message ||
        "Failed to load integrations"
      );
    }

    state.items =
      data.integrations || [];

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

    setValue(
      "tenantId",
      item.tenantId
    );

    setValue(
      "tenantSlug",
      item.tenantSlug
    );

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

    const api =
      item.api || {};

    setValue(
      "apiEndpoint",
      api.endpoint
    );

    setValue(
      "apiAuthType",
      api.authType || "NONE"
    );

    setValue(
      "tokenUrl",
      api.tokenUrl
    );

    setValue(
      "pollEnabled",
      String(
        Boolean(
          api.pollEnabled
        )
      )
    );

    setValue(
      "pollMinutes",
      api.pollMinutes || 15
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

    /*
      Secret fields remain blank during editing.
      The backend keeps the old secret unless a new value is supplied.
    */
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
      if($(id)) $(id).value = "";
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

      const res =
        await fetch(
          "/api/platform/broker-integrations",
          {
            method:"POST",
            headers:headers(true),
            body:JSON.stringify(body)
          }
        );

      const data =
        await res.json();

      if(!res.ok){
        throw new Error(
          data.message ||
          "Failed to save connection"
        );
      }

      alert(
        "Broker connection saved."
      );

      clearEditor();
      await load();

    }catch(err){

      alert(
        err.message ||
        "Failed to save connection"
      );
    }
  }

  async function testConnection(id){

    const targetId =
      id || state.editingId;

    if(!targetId){
      alert(
        "Save the connection before testing."
      );
      return;
    }

    try{

      const res =
        await fetch(
          `/api/platform/broker-integrations/${encodeURIComponent(targetId)}/test`,
          {
            method:"POST",
            headers:headers(true),
            body:"{}"
          }
        );

      const data =
        await res.json();

      if(!res.ok){
        throw new Error(
          data.message ||
          "Connection test failed"
        );
      }

      alert(
        data.result?.message ||
        "Connection configuration passed."
      );

      await load();

    }catch(err){

      alert(
        err.message ||
        "Connection test failed"
      );
    }
  }

  $("connectionType")
    .addEventListener(
      "change",
      showConnectionBox
    );

  $("brokerCode")
    .addEventListener(
      "input",
      (event) => {
        event.target.value =
          upper2(
            event.target.value
          );
      }
    );

  $("saveBtn")
    .addEventListener(
      "click",
      save
    );

  $("testBtn")
    .addEventListener(
      "click",
      () => testConnection()
    );

  $("clearBtn")
    .addEventListener(
      "click",
      clearEditor
    );

  $("newIntegrationBtn")
    .addEventListener(
      "click",
      () => {
        clearEditor();
        window.scrollTo({
          top:0,
          behavior:"smooth"
        });
      }
    );

  showConnectionBox();

  load().catch(err => {
    console.error(err);
    alert(
      err.message ||
      "Failed to load broker integrations"
    );
  });

})();
