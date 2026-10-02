/* =========================================================
   FILE: public/driver/summary.js
   DRIVER PAYROLL SUMMARY
   CURRENT PERIOD + ROLLING LAST 6 MONTHS
========================================================= */

const token =
  String(
    localStorage.getItem("token") ||
    localStorage.getItem("driverToken") ||
    ""
  );

function authHeaders(){
  return {
    Authorization:
      `Bearer ${token}`
  };
}

function hoursText(value){

  const minutes =
    Math.round(
      Number(value || 0) * 60
    );

  const h =
    Math.floor(
      minutes / 60
    );

  const m =
    minutes % 60;

  return (
    `${h} H ` +
    `${String(m).padStart(2,"0")} MIN`
  );
}

function money(value){

  return new Intl.NumberFormat(
    "en-US",
    {
      style:"currency",
      currency:"USD"
    }
  ).format(
    Number(value || 0)
  );
}

function parseKey(key){

  const [
    y,
    m,
    d
  ] =
    String(key || "")
      .split("-")
      .map(Number);

  if(!y || !m || !d){
    return null;
  }

  return new Date(
    Date.UTC(
      y,
      m - 1,
      d,
      12
    )
  );
}

function dateText(key){

  const date =
    parseKey(key);

  if(!date){
    return "-";
  }

  return date
    .toLocaleDateString(
      "en-US",
      {
        month:"short",
        day:"numeric",
        year:"numeric",
        timeZone:"UTC"
      }
    );
}

function daysRemaining(
  todayKey,
  endKey
){

  const today =
    parseKey(todayKey);

  const end =
    parseKey(endKey);

  if(!today || !end){
    return "";
  }

  const days =
    Math.max(
      0,
      Math.ceil(
        (
          end.getTime() -
          today.getTime()
        ) /
        86400000
      )
    );

  return days === 1
    ? "1 Day Left"
    : `${days} Days Left`;
}

function escapeHtml(value){

  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function api(url){

  const response =
    await fetch(
      url,
      {
        headers:
          authHeaders(),
        cache:"no-store"
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
      `HTTP ${response.status}`
    );
  }

  return data;
}

async function load(){

  const list =
    document.getElementById(
      "historyList"
    );

  try{

    const [
      current,
      historyData
    ] =
      await Promise.all([
        api(
          "/api/payroll/me"
        ),
        api(
          "/api/payroll/history"
        )
      ]);

    const earnings =
      current.earnings ||
      {};

    document.getElementById(
      "currentPeriod"
    ).textContent =
      `${dateText(current.from)} → ${dateText(current.to)}`;

    document.getElementById(
      "daysLeft"
    ).textContent =
      daysRemaining(
        current.serverToday,
        current.to
      );

    document.getElementById(
      "currentHours"
    ).textContent =
      hoursText(
        earnings.totalHours
      );

    document.getElementById(
      "currentTrips"
    ).textContent =
      String(
        Number(
          earnings.tripCount ||
          0
        )
      );

    document.getElementById(
      "currentEarnings"
    ).textContent =
      money(
        earnings.totalDue
      );

    const rows =
      Array.isArray(
        historyData.history
      )
        ? historyData.history
        : [];

    if(!rows.length){

      list.innerHTML = `
        <div class="empty">
          No closed payroll periods yet.
        </div>
      `;

      return;
    }

    list.innerHTML =
      rows
        .map(
          row=>`
            <div class="history-row">

              <div class="history-date">
                ${escapeHtml(dateText(row.periodStart))}
                <br>
                ${escapeHtml(dateText(row.periodEnd))}
              </div>

              <div class="history-center">
                ${escapeHtml(hoursText(row.totalHours))}
                <span>
                  ${Number(row.tripCount || 0)} Trips
                </span>
              </div>

              <div class="history-money">
                ${escapeHtml(money(row.totalDue))}
              </div>

            </div>
          `
        )
        .join("");

  }catch(error){

    console.error(
      "DRIVER SUMMARY ERROR:",
      error
    );

    list.innerHTML = `
      <div class="error">
        ${escapeHtml(error.message)}
      </div>
    `;
  }
}

load();