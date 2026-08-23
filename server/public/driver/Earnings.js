/* =========================================================
   FILE: public/driver/Earnings.js

   CURRENT COMPANY PAY PERIOD ONLY
   SERVER + TENANT TIMEZONE
   NO Paid / Unpaid
========================================================= */

const token =
  String(
    localStorage.getItem("token") ||
    ""
  );


/* =========================
   HELPERS
========================= */

function hoursText(value){

  const totalMinutes =
    Math.round(
      Number(value || 0) *
      60
    );

  const h =
    Math.floor(
      totalMinutes / 60
    );

  const m =
    totalMinutes % 60;

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

function dateLabel(key){

  if(!key){
    return "-";
  }

  const [
    y,
    m,
    d
  ] =
    key
      .split("-")
      .map(Number);

  return new Date(
    Date.UTC(
      y,
      m - 1,
      d,
      12
    )
  ).toLocaleDateString(
    "en-US",
    {
      month:"short",
      day:"numeric",
      year:"numeric",
      timeZone:"UTC"
    }
  );
}

function escapeHtml(value){

  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}


/* =========================
   LOAD
========================= */

async function loadEarnings(){

  const list =
    document.getElementById(
      "list"
    );

  try{

    const response =
      await fetch(
        "/api/payroll/me",
        {
          headers:{
            Authorization:
              `Bearer ${token}`
          },

          cache:"no-store"
        }
      );

    const data =
      await response
        .json();

    if(!response.ok){

      throw new Error(
        data.message ||
        "Unable to load earnings."
      );
    }

    const e =
      data.earnings ||
      {};

    document.getElementById(
      "periodLabel"
    ).textContent =
      `${dateLabel(data.from)} → ${dateLabel(data.to)}`;

    document.getElementById(
      "timezoneLabel"
    ).textContent =
      data.timezone
        ? `Server time • ${data.timezone}`
        : "Server time";

    document.getElementById(
      "periodLength"
    ).textContent =
      `${Number(data.lengthDays || 0)} DAYS`;

    document.getElementById(
      "totalDue"
    ).textContent =
      money(
        e.totalDue
      );

    document.getElementById(
      "totalHours"
    ).textContent =
      hoursText(
        e.totalHours
      );

    document.getElementById(
      "regularHours"
    ).textContent =
      hoursText(
        e.regularHours
      );

    document.getElementById(
      "overtimeHours"
    ).textContent =
      hoursText(
        e.overtimeHours
      );

    document.getElementById(
      "hourlyRate"
    ).textContent =
      money(
        e.hourlyRate
      );

    document.getElementById(
      "overtimeRate"
    ).textContent =
      money(
        e.overtimeRate
      );

    const days =
      Array.isArray(
        e.dailyHours
      )
        ? e.dailyHours
        : [];

    if(!days.length){

      list.innerHTML = `
        <div class="empty">
          No work hours in the current pay period.
        </div>
      `;

      return;
    }

    list.innerHTML =
      days
        .map(
          day=>`
            <div class="day-card">

              <div class="day-date">
                ${escapeHtml(dateLabel(day.date))}
              </div>

              <div class="day-hours">
                ${hoursText(day.hours)}
              </div>

            </div>
          `
        )
        .join("");

  }catch(error){

    console.error(
      "EARNINGS LOAD ERROR:",
      error
    );

    list.innerHTML = `
      <div class="error">
        ${escapeHtml(error.message)}
      </div>
    `;
  }
}

loadEarnings();