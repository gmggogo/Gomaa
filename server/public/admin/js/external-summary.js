/*
DESTINATION PATH:
server/public/admin/js/external-summary.js
*/

"use strict";

/*
DESTINATION PATH:
public/admin/js/external-summary.js
*/

(() => {

  const $ = (id) =>
    document.getElementById(id);

  function token(){

    return (
      sessionStorage.getItem("token") ||
      localStorage.getItem("token") ||
      ""
    );
  }

  function headers(){

    return {
      Authorization:
        `Bearer ${token()}`
    };
  }

  function escapeHtml(value){

    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function buildQuery(){

    const params =
      new URLSearchParams();

    const from =
      $("fromDate").value;

    const to =
      $("toDate").value;

    const brokerCode =
      $("brokerCode").value
        .trim()
        .toUpperCase()
        .slice(0,2);

    if(from){
      params.set(
        "from",
        from
      );
    }

    if(to){
      params.set(
        "to",
        to
      );
    }

    if(brokerCode){
      params.set(
        "brokerCode",
        brokerCode
      );
    }

    const raw =
      params.toString();

    return raw
      ? `?${raw}`
      : "";
  }

  function setTotals(totals){

    $("totalTrips").textContent =
      totals.total || 0;

    $("receivedTrips").textContent =
      totals.received || 0;

    $("transferredTrips").textContent =
      totals.transferred || 0;

    $("cancelledTrips").textContent =
      totals.cancelled || 0;

    $("sharedTrips").textContent =
      totals.shared || 0;

    $("automaticTrips").textContent =
      totals.automatic || 0;

    $("manualTrips").textContent =
      totals.manual || 0;

    $("rejectedTrips").textContent =
      totals.rejected || 0;

    $("errorTrips").textContent =
      totals.errors || 0;
  }

  function renderRows(items){

    const body =
      $("summaryRows");

    body.innerHTML = "";

    for(const item of items){

      const tr =
        document.createElement("tr");

      tr.innerHTML = `
        <td>${escapeHtml(item._id?.brokerName || item._id?.brokerCode || "")}</td>
        <td><strong>${escapeHtml(item._id?.brokerCode || "")}</strong></td>
        <td>${Number(item.total || 0)}</td>
        <td>${Number(item.received || 0)}</td>
        <td>${Number(item.transferred || 0)}</td>
        <td>${Number(item.cancelled || 0)}</td>
        <td>${Number(item.shared || 0)}</td>
        <td>${Number(item.automatic || 0)}</td>
        <td>${Number(item.manual || 0)}</td>
        <td>${Number(item.rejected || 0)}</td>
        <td>${Number(item.errors || 0)}</td>
      `;

      body.appendChild(tr);
    }
  }

  async function load(){

    const res =
      await fetch(
        `/api/external-summary${buildQuery()}`,
        {
          headers:headers()
        }
      );

    const data =
      await res.json();

    if(!res.ok){
      throw new Error(
        data.message ||
        "Failed to load external summary"
      );
    }

    setTotals(
      data.totals || {}
    );

    renderRows(
      data.byBroker || []
    );
  }

  $("brokerCode")
    .addEventListener(
      "input",
      (event) => {
        event.target.value =
          event.target.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g,"")
            .slice(0,2);
      }
    );

  $("applyBtn")
    .addEventListener(
      "click",
      () => {
        load().catch(err => {
          alert(
            err.message ||
            "Failed to load external summary"
          );
        });
      }
    );

  load().catch(err => {
    console.error(err);
    alert(
      err.message ||
      "Failed to load external summary"
    );
  });

})();
