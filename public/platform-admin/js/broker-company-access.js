"use strict";

/*
DESTINATION PATH:
server/public/platform-admin/js/broker-company-access.js

PURPOSE:
Adds a clear tenant-level Broker Active / Inactive control to the
existing Platform Admin Broker Integrations page.

RULE:
ACTIVE:
- enabled = true
- featureVisible = true

INACTIVE:
- enabled = false
- featureVisible = false

This directly controls whether Broker Operations and Broker sections
are exposed to the tenant.
*/

(() => {

  const API =
    "/api/platform/broker-integrations";

  function token(){
    return String(
      sessionStorage.getItem(
        "staffToken"
      ) ||
      sessionStorage.getItem(
        "token"
      ) ||
      localStorage.getItem(
        "token"
      ) ||
      ""
    ).trim();
  }

  async function api(
    url,
    options = {}
  ){
    const response =
      await fetch(
        url,
        {
          cache:"no-store",
          ...options,
          headers:{
            "Content-Type":
              "application/json",
            Authorization:
              `Bearer ${token()}`,
            ...(
              options.headers ||
              {}
            )
          }
        }
      );

    const data =
      await response
        .json()
        .catch(
          ()=>({})
        );

    if(!response.ok){
      throw new Error(
        data.message ||
        `Request failed (${response.status})`
      );
    }

    return data;
  }

  function injectStyles(){
    if(
      document.getElementById(
        "brokerCompanyAccessStyles"
      )
    ){
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "brokerCompanyAccessStyles";

    style.textContent = `
      .broker-company-access{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-width:82px;
        min-height:32px;
        padding:0 11px;
        margin-left:6px;
        border:0;
        border-radius:8px;
        color:#fff;
        font-size:11px;
        font-weight:900;
        cursor:pointer;
      }

      .broker-company-access.is-active{
        background:#16834f;
      }

      .broker-company-access.is-inactive{
        background:#c43b3b;
      }

      .broker-company-access:disabled{
        opacity:.6;
        cursor:wait;
      }

      .broker-company-badge{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-width:70px;
        padding:4px 8px;
        border-radius:999px;
        font-size:10px;
        font-weight:900;
        margin-right:4px;
      }

      .broker-company-badge.is-active{
        background:#e2f7ea;
        color:#146837;
      }

      .broker-company-badge.is-inactive{
        background:#fde8e8;
        color:#a11e1e;
      }
    `;

    document.head
      .appendChild(
        style
      );
  }

  async function loadItems(){
    const data =
      await api(
        API
      );

    return Array.isArray(
      data.integrations
    )
      ? data.integrations
      : [];
  }

  function rowIntegrationId(
    row
  ){
    return (
      row.querySelector(
        "[data-edit]"
      )?.dataset.edit ||
      row.querySelector(
        "[data-test]"
      )?.dataset.test ||
      ""
    );
  }

  function isCompanyBrokerActive(
    item
  ){
    return (
      item?.enabled === true &&
      item?.featureVisible !== false
    );
  }

  async function setCompanyAccess(
    item,
    button
  ){
    const active =
      isCompanyBrokerActive(
        item
      );

    const next =
      !active;

    if(
      !window.confirm(
        next
          ? "Activate Broker access for this company?"
          : "Deactivate Broker access for this company?"
      )
    ){
      return;
    }

    button.disabled =
      true;

    try{
      await api(
        `${API}/${encodeURIComponent(item._id)}/access`,
        {
          method:"PATCH",
          body:
            JSON.stringify({
              enabled:next,
              featureVisible:next
            })
        }
      );

      window.location.reload();

    }catch(err){
      button.disabled =
        false;

      window.alert(
        err.message ||
        "Failed to update Broker access."
      );
    }
  }

  async function decorateRows(){
    const body =
      document.getElementById(
        "integrationRows"
      );

    if(!body){
      return;
    }

    let items = [];

    try{
      items =
        await loadItems();
    }catch(err){
      console.log(
        "BROKER COMPANY ACCESS LOAD ERROR:",
        err?.message || err
      );

      return;
    }

    const map =
      new Map(
        items.map(
          item => [
            String(
              item?._id || ""
            ),
            item
          ]
        )
      );

    body
      .querySelectorAll(
        "tr"
      )
      .forEach(row => {

        const id =
          rowIntegrationId(
            row
          );

        if(!id){
          return;
        }

        const item =
          map.get(
            String(id)
          );

        if(!item){
          return;
        }

        const actionCell =
          row.lastElementChild;

        if(
          !actionCell ||
          actionCell.querySelector(
            ".broker-company-access"
          )
        ){
          return;
        }

        const active =
          isCompanyBrokerActive(
            item
          );

        const badge =
          document.createElement(
            "span"
          );

        badge.className =
          "broker-company-badge " +
          (
            active
              ? "is-active"
              : "is-inactive"
          );

        badge.textContent =
          active
            ? "ACTIVE"
            : "INACTIVE";

        const button =
          document.createElement(
            "button"
          );

        button.type =
          "button";

        button.className =
          "broker-company-access " +
          (
            active
              ? "is-inactive"
              : "is-active"
          );

        button.textContent =
          active
            ? "Deactivate"
            : "Activate";

        button.addEventListener(
          "click",
          () =>
            setCompanyAccess(
              item,
              button
            )
        );

        actionCell.prepend(
          badge
        );

        actionCell.appendChild(
          button
        );
      });
  }

  function watchRows(){
    const body =
      document.getElementById(
        "integrationRows"
      );

    if(!body){
      return;
    }

    const observer =
      new MutationObserver(
        ()=>{
          decorateRows();
        }
      );

    observer.observe(
      body,
      {
        childList:true,
        subtree:false
      }
    );

    decorateRows();
  }

  document.addEventListener(
    "DOMContentLoaded",
    ()=>{
      injectStyles();

      /*
        Existing broker-integrations.js renders asynchronously.
        MutationObserver keeps the access buttons in sync after every render.
      */
      setTimeout(
        watchRows,
        100
      );
    },
    {
      once:true
    }
  );

})();
