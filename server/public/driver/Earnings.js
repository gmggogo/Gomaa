/* =========================================================
   FILE: public/driver/Earnings.js
   DISPLAY HOURS AS HOURS + MINUTES
========================================================= */

const token =
  String(
    localStorage.getItem("token") ||
    ""
  );

const driverId =
  String(
    localStorage.getItem("userId") ||
    localStorage.getItem("driverId") ||
    ""
  );

let currentMode =
  "today";

/* =========================
   HELPERS
========================= */

function authHeaders(){
  return {
    Authorization:
      `Bearer ${token}`
  };
}

function dateKey(date){

  const y =
    date.getFullYear();

  const m =
    String(
      date.getMonth() + 1
    ).padStart(2,"0");

  const d =
    String(
      date.getDate()
    ).padStart(2,"0");

  return `${y}-${m}-${d}`;
}

function getRange(mode){

  const now =
    new Date();

  const start =
    new Date(now);

  const end =
    new Date(now);

  if(mode === "week"){

    start.setDate(
      start.getDate() -
      start.getDay()
    );

    end.setTime(
      start.getTime()
    );

    end.setDate(
      end.getDate() + 6
    );

  }else if(
    mode === "month"
  ){

    start.setDate(1);

    end.setMonth(
      end.getMonth() + 1,
      0
    );
  }

  return {
    from:
      dateKey(start),

    to:
      dateKey(end)
  };
}

function hoursToText(value){

  const totalMinutes =
    Math.round(
      Number(value || 0) * 60
    );

  const hours =
    Math.floor(
      totalMinutes / 60
    );

  const minutes =
    totalMinutes % 60;

  return (
    `${hours} H ` +
    `${String(minutes).padStart(2,"0")} MIN`
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

function formatDateLabel(value){

  const d =
    new Date(
      `${value}T12:00:00`
    );

  return d.toLocaleDateString(
    "en-US",
    {
      weekday:"short",
      month:"short",
      day:"numeric",
      year:"numeric"
    }
  );
}

/* =========================
   LOAD
========================= */

async function loadEarnings(){

  const range =
    getRange(
      currentMode
    );

  document.getElementById(
    "periodLabel"
  ).textContent =
    `${range.from} → ${range.to}`;

  try{

    const query =
      new URLSearchParams({
        from:range.from,
        to:range.to
      });

    const response =
      await fetch(
        `/api/payroll/me?${query.toString()}`,
        {
          headers:
            authHeaders(),
          cache:"no-store"
        }
      );

    const data =
      await response.json();

    if(!response.ok){
      throw new Error(
        data.message ||
        "Unable to load earnings."
      );
    }

    document.getElementById(
      "totalDue"
    ).textContent =
      money(
        data.totalDue
      );

    document.getElementById(
      "totalHours"
    ).textContent =
      hoursToText(
        data.totalHours
      );

    document.getElementById(
      "regularHours"
    ).textContent =
      hoursToText(
        data.regularHours
      );

    document.getElementById(
      "overtimeHours"
    ).textContent =
      hoursToText(
        data.overtimeHours
      );

    document.getElementById(
      "paymentStatus"
    ).textContent =
      String(
        data.paymentStatus ||
        "UNPAID"
      );

    document.getElementById(
      "hourlyRate"
    ).textContent =
      money(
        data.hourlyRate
      );

    document.getElementById(
      "overtimeRate"
    ).textContent =
      money(
        data.overtimeRate
      );

    const list =
      document.getElementById(
        "list"
      );

    const days =
      Array.isArray(
        data.dailyHours
      )
        ? data.dailyHours
        : [];

    if(!days.length){

      list.innerHTML = `
        <div class="empty">
          No work hours for this period.
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
                ${formatDateLabel(day.date)}
              </div>

              <div class="day-hours">
                ${hoursToText(day.hours)}
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

    document.getElementById(
      "list"
    ).innerHTML = `
      <div class="error">
        ${error.message}
      </div>
    `;
  }
}

/* =========================
   TABS
========================= */

function setMode(mode){

  currentMode =
    mode;

  document
    .querySelectorAll(
      ".filters button"
    )
    .forEach(
      button=>
        button.classList.remove(
          "active"
        )
    );

  const button =
    document.getElementById(
      mode === "today"
        ? "btn-today"
        : mode === "week"
          ? "btn-week"
          : "btn-month"
    );

  button?.classList.add(
    "active"
  );

  loadEarnings();
}

document.getElementById(
  "btn-today"
)?.addEventListener(
  "click",
  ()=>setMode("today")
);

document.getElementById(
  "btn-week"
)?.addEventListener(
  "click",
  ()=>setMode("week")
);

document.getElementById(
  "btn-month"
)?.addEventListener(
  "click",
  ()=>setMode("month")
);

loadEarnings();