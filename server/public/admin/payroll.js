/* =========================================================
   FILE: public/admin/payroll.js

   SUPER ADMIN ONLY

   DRIVERS:
   - Automatic hours from trips.

   DISPATCHER / ADMIN / SUPER ADMIN:
   - Super Admin sets Enable/Disable.
   - Super Admin sets work days and credited hours/day.
   - Staff SIGN IN appears only on eligible scheduled days.
   - One SIGN IN credits scheduled hours.
   - No Sign Out.
========================================================= */

const token =
  String(
    localStorage.getItem("token") ||
    ""
  );

const role =
  String(
    localStorage.getItem("role") ||
    ""
  )
  .trim()
  .toUpperCase()
  .replace(/[\s-]+/g,"_");

if(
  !token ||
  ![
    "SUPER_ADMIN",
    "SUPERADMIN"
  ].includes(role)
){
  window.location.href =
    "dashboard.html";
}

const DAY_KEYS = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat"
];

const DAY_LABELS = {
  sun:"Sun",
  mon:"Mon",
  tue:"Tue",
  wed:"Wed",
  thu:"Thu",
  fri:"Fri",
  sat:"Sat"
};

let currentType =
  "driver";

let currentRows =
  [];

let currentPeriod = {
  from:"",
  to:"",
  timezone:""
};

let scheduleEditingId =
  "";


/* =========================
   HELPERS
========================= */

function authHeaders(
  json = false
){

  return {
    ...(json
      ? {
          "Content-Type":
            "application/json"
        }
      : {}),

    Authorization:
      `Bearer ${token}`
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

async function api(
  url,
  options = {}
){

  const response =
    await fetch(
      url,
      {
        cache:"no-store",
        ...options
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

function getRow(id){

  return currentRows.find(
    row=>
      String(row._id) ===
      String(id)
  );
}


/* =========================
   PERIOD
========================= */

async function loadPeriod(){

  const data =
    await api(
      "/api/payroll/period",
      {
        headers:
          authHeaders()
      }
    );

  currentPeriod = {
    from:
      data.period?.from ||
      "",

    to:
      data.period?.to ||
      "",

    timezone:
      data.timezone ||
      ""
  };

  document.getElementById(
    "currentPeriod"
  ).textContent =
    `${dateLabel(currentPeriod.from)} → ${dateLabel(currentPeriod.to)}`;

  document.getElementById(
    "timezoneText"
  ).textContent =
    currentPeriod.timezone
      ? `Server time • ${currentPeriod.timezone}`
      : "Server time";

  document.getElementById(
    "periodFrom"
  ).value =
    currentPeriod.from;

  document.getElementById(
    "periodTo"
  ).value =
    currentPeriod.to;
}

document.getElementById(
  "editPeriodBtn"
).addEventListener(
  "click",
  ()=>{

    document.getElementById(
      "periodEdit"
    ).classList.add(
      "show"
    );
  }
);

document.getElementById(
  "cancelPeriodBtn"
).addEventListener(
  "click",
  ()=>{

    document.getElementById(
      "periodEdit"
    ).classList.remove(
      "show"
    );
  }
);

document.getElementById(
  "savePeriodBtn"
).addEventListener(
  "click",
  async()=>{

    const from =
      document.getElementById(
        "periodFrom"
      ).value;

    const to =
      document.getElementById(
        "periodTo"
      ).value;

    if(
      !from ||
      !to ||
      from > to
    ){

      alert(
        "Select a valid pay period."
      );

      return;
    }

    if(
      !confirm(
        "Save this company-wide pay period?"
      )
    ){
      return;
    }

    try{

      await api(
        "/api/payroll/period",
        {
          method:"PUT",
          headers:
            authHeaders(true),
          body:
            JSON.stringify({
              from,
              to
            })
        }
      );

      document.getElementById(
        "periodEdit"
      ).classList.remove(
        "show"
      );

      await loadPeriod();
      await loadPayroll();

    }catch(error){

      alert(
        error.message
      );
    }
  }
);


/* =========================
   LOAD PAYROLL
========================= */

async function loadPayroll(){

  const body =
    document.getElementById(
      "payrollBody"
    );

  body.innerHTML = `
    <tr>
      <td>Loading...</td>
    </tr>
  `;

  try{

    const query =
      new URLSearchParams({
        type:currentType
      });

    const data =
      await api(
        `/api/payroll/people?${query.toString()}`,
        {
          headers:
            authHeaders()
        }
      );

    currentRows =
      Array.isArray(
        data.people
      )
        ? data.people
        : [];

    currentPeriod.from =
      data.from ||
      currentPeriod.from;

    currentPeriod.to =
      data.to ||
      currentPeriod.to;

    currentPeriod.timezone =
      data.timezone ||
      currentPeriod.timezone;

    render();

  }catch(error){

    console.error(
      "PAYROLL LOAD ERROR:",
      error
    );

    body.innerHTML = `
      <tr>
        <td>
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;
  }
}


/* =========================
   TABLE HEAD
========================= */

function renderHead(){

  const head =
    document.getElementById(
      "payrollHead"
    );

  if(
    currentType === "driver"
  ){

    head.innerHTML = `
      <tr>
        <th>Name</th>
        <th>Regular Hrs</th>
        <th>OT Hrs</th>
        <th>Total Hrs</th>
        <th>Hourly Rate</th>
        <th>OT Rate</th>
        <th>OT After / Week</th>
        <th>Regular Pay</th>
        <th>OT Pay</th>
        <th>Total Earnings</th>
        <th>Actions</th>
      </tr>
    `;

    return;
  }

  head.innerHTML = `
    <tr>
      <th>Name</th>
      <th>Enable</th>
      <th>Work Schedule</th>
      <th>Regular Hrs</th>
      <th>OT Hrs</th>
      <th>Total Hrs</th>
      <th>Hourly Rate</th>
      <th>OT Rate</th>
      <th>Weekly Hours</th>
      <th>Total Earnings</th>
      <th>Actions</th>
    </tr>
  `;
}


/* =========================
   RENDER
========================= */

function render(){

  renderHead();

  const body =
    document.getElementById(
      "payrollBody"
    );

  const totalHours =
    currentRows.reduce(
      (sum,row)=>
        sum +
        Number(
          row.totalHours ||
          0
        ),
      0
    );

  const totalDue =
    currentRows.reduce(
      (sum,row)=>
        sum +
        Number(
          row.totalDue ||
          0
        ),
      0
    );

  document.getElementById(
    "peopleCount"
  ).textContent =
    String(
      currentRows.length
    );

  document.getElementById(
    "allHours"
  ).textContent =
    hoursText(
      totalHours
    );

  document.getElementById(
    "allDue"
  ).textContent =
    money(
      totalDue
    );

  if(!currentRows.length){

    body.innerHTML = `
      <tr>
        <td colspan="11">
          No people found.
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML =
    currentRows
      .map(
        row=>
          currentType ===
            "driver"
            ? driverRow(row)
            : staffRow(row)
      )
      .join("");
}

function driverRow(row){

  const id =
    escapeHtml(
      row._id
    );

  return `
    <tr>

      <td class="name-cell">
        ${escapeHtml(row.name)}
      </td>

      <td>
        ${hoursText(row.regularHours)}
      </td>

      <td>
        ${hoursText(row.overtimeHours)}
      </td>

      <td>
        <b>${hoursText(row.totalHours)}</b>
      </td>

      <td>
        <input
          class="rate-input"
          id="rate-${id}"
          type="number"
          min="0"
          step="0.01"
          value="${Number(row.hourlyRate || 0)}"
          disabled>
      </td>

      <td>
        <input
          class="rate-input"
          id="ot-rate-${id}"
          type="number"
          min="0"
          step="0.01"
          value="${Number(row.overtimeRate || 0)}"
          disabled>
      </td>

      <td>
        <input
          class="rate-input"
          id="weekly-${id}"
          type="number"
          min="0"
          step="1"
          value="${Number(row.overtimeAfterHours ?? 40)}"
          disabled>
      </td>

      <td>${money(row.regularPay)}</td>
      <td>${money(row.overtimePay)}</td>

      <td>
        <b>${money(row.totalDue)}</b>
      </td>

      <td>
        <div class="actions">

          <button
            class="edit-btn"
            id="edit-${id}"
            type="button"
            onclick="editDriver('${id}')">
            Edit
          </button>

          <button
            class="save-btn"
            id="save-${id}"
            type="button"
            onclick="saveDriver('${id}')"
            disabled>
            Save
          </button>

        </div>
      </td>

    </tr>
  `;
}

function scheduleSummary(row){

  const schedule =
    row.staffSchedule ||
    {};

  const days =
    schedule.days ||
    {};

  const pieces = [];

  DAY_KEYS.forEach(
    key=>{

      const rule =
        days[key];

      if(
        rule?.enabled &&
        Number(
          rule.hours ||
          0
        ) > 0
      ){

        pieces.push(
          `${DAY_LABELS[key]} ${Number(rule.hours)}h`
        );
      }
    }
  );

  if(!pieces.length){
    return "No work days";
  }

  return pieces.join(" • ");
}

function staffRow(row){

  const id =
    escapeHtml(
      row._id
    );

  const enabled =
    row.staffSchedule
      ?.payrollEnabled === true;

  return `
    <tr>

      <td class="name-cell">
        ${escapeHtml(row.name)}
      </td>

      <td>
        <label class="enable-wrap">

          <input
            id="enabled-${id}"
            type="checkbox"
            ${enabled ? "checked" : ""}
            disabled>

          <span>
            ${enabled ? "Enabled" : "Disabled"}
          </span>

        </label>
      </td>

      <td>
        <div class="schedule-summary">
          ${escapeHtml(scheduleSummary(row))}
        </div>
      </td>

      <td>
        ${hoursText(row.regularHours)}
      </td>

      <td>
        ${hoursText(row.overtimeHours)}
      </td>

      <td>
        <b>${hoursText(row.totalHours)}</b>
      </td>

      <td>
        <input
          class="rate-input"
          id="rate-${id}"
          type="number"
          min="0"
          step="0.01"
          value="${Number(row.hourlyRate || 0)}"
          disabled>
      </td>

      <td>
        <input
          class="rate-input"
          id="ot-rate-${id}"
          type="number"
          min="0"
          step="0.01"
          value="${Number(row.overtimeRate || 0)}"
          disabled>
      </td>

      <td>
        <input
          class="rate-input"
          id="weekly-${id}"
          type="number"
          min="0"
          step="1"
          value="${Number(row.overtimeAfterHours ?? 40)}"
          disabled>
      </td>

      <td>
        <b>${money(row.totalDue)}</b>
      </td>

      <td>

        <div class="actions">

          <button
            class="schedule-btn"
            type="button"
            onclick="openSchedule('${id}')">
            Schedule
          </button>

          <button
            class="edit-btn"
            id="edit-${id}"
            type="button"
            onclick="editStaff('${id}')">
            Edit
          </button>

          <button
            class="save-btn"
            id="save-${id}"
            type="button"
            onclick="saveStaff('${id}')"
            disabled>
            Save
          </button>

        </div>

      </td>

    </tr>
  `;
}


/* =========================
   DRIVER EDIT / SAVE
========================= */

window.editDriver =
function(id){

  [
    `rate-${id}`,
    `ot-rate-${id}`,
    `weekly-${id}`
  ]
  .forEach(
    field=>{

      const el =
        document.getElementById(
          field
        );

      if(el){
        el.disabled = false;
      }
    }
  );

  document.getElementById(
    `edit-${id}`
  ).disabled = true;

  document.getElementById(
    `save-${id}`
  ).disabled = false;
};

window.saveDriver =
async function(id){

  try{

    await api(
      `/api/payroll/profile/driver/${encodeURIComponent(id)}`,
      {
        method:"PUT",
        headers:
          authHeaders(true),
        body:
          JSON.stringify({
            hourlyRate:
              Number(
                document.getElementById(
                  `rate-${id}`
                ).value ||
                0
              ),

            overtimeRate:
              Number(
                document.getElementById(
                  `ot-rate-${id}`
                ).value ||
                0
              ),

            overtimeAfterHours:
              Number(
                document.getElementById(
                  `weekly-${id}`
                ).value ||
                40
              )
          })
      }
    );

    await loadPayroll();

  }catch(error){

    alert(
      error.message
    );
  }
};


/* =========================
   STAFF EDIT / SAVE
========================= */

window.editStaff =
function(id){

  [
    `enabled-${id}`,
    `rate-${id}`,
    `ot-rate-${id}`,
    `weekly-${id}`
  ]
  .forEach(
    field=>{

      const el =
        document.getElementById(
          field
        );

      if(el){
        el.disabled = false;
      }
    }
  );

  document.getElementById(
    `edit-${id}`
  ).disabled = true;

  document.getElementById(
    `save-${id}`
  ).disabled = false;
};

window.saveStaff =
async function(id){

  const row =
    getRow(id);

  if(!row){
    return;
  }

  const days =
    row.staffSchedule
      ?.days ||
    {};

  try{

    await api(
      `/api/payroll/staff-schedule/${currentType}/${encodeURIComponent(id)}`,
      {
        method:"PUT",
        headers:
          authHeaders(true),
        body:
          JSON.stringify({
            payrollEnabled:
              document.getElementById(
                `enabled-${id}`
              ).checked,

            hourlyRate:
              Number(
                document.getElementById(
                  `rate-${id}`
                ).value ||
                0
              ),

            overtimeRate:
              Number(
                document.getElementById(
                  `ot-rate-${id}`
                ).value ||
                0
              ),

            weeklyHours:
              Number(
                document.getElementById(
                  `weekly-${id}`
                ).value ||
                40
              ),

            days
          })
      }
    );

    await loadPayroll();

  }catch(error){

    alert(
      error.message
    );
  }
};


/* =========================
   SCHEDULE MODAL
========================= */

window.openSchedule =
function(id){

  const row =
    getRow(id);

  if(!row){
    return;
  }

  scheduleEditingId =
    id;

  document.getElementById(
    "schedulePersonId"
  ).value =
    id;

  document.getElementById(
    "schedulePersonName"
  ).textContent =
    row.name ||
    "";

  const days =
    row.staffSchedule
      ?.days ||
    {};

  DAY_KEYS.forEach(
    key=>{

      const rule =
        days[key] ||
        {
          enabled:false,
          hours:0
        };

      document.getElementById(
        `day-${key}`
      ).checked =
        rule.enabled === true;

      document.getElementById(
        `hours-${key}`
      ).value =
        Number(
          rule.hours ||
          0
        );
    }
  );

  document.getElementById(
    "scheduleModal"
  ).classList.add(
    "show"
  );
};

document.getElementById(
  "cancelScheduleBtn"
).addEventListener(
  "click",
  ()=>{

    document.getElementById(
      "scheduleModal"
    ).classList.remove(
      "show"
    );
  }
);

document.getElementById(
  "saveScheduleBtn"
).addEventListener(
  "click",
  async()=>{

    const id =
      scheduleEditingId;

    const row =
      getRow(id);

    if(!id || !row){
      return;
    }

    const days = {};

    for(
      const key
      of DAY_KEYS
    ){

      const enabled =
        document.getElementById(
          `day-${key}`
        ).checked;

      const dayHours =
        Number(
          document.getElementById(
            `hours-${key}`
          ).value ||
          0
        );

      if(
        enabled &&
        (
          !Number.isFinite(
            dayHours
          ) ||
          dayHours <= 0 ||
          dayHours > 24
        )
      ){

        alert(
          `${DAY_LABELS[key]} needs valid scheduled hours.`
        );

        return;
      }

      days[key] = {
        enabled,
        hours:
          enabled
            ? dayHours
            : 0
      };
    }

    try{

      await api(
        `/api/payroll/staff-schedule/${currentType}/${encodeURIComponent(id)}`,
        {
          method:"PUT",
          headers:
            authHeaders(true),
          body:
            JSON.stringify({
              payrollEnabled:
                row.staffSchedule
                  ?.payrollEnabled === true,

              hourlyRate:
                Number(
                  row.hourlyRate ||
                  0
                ),

              overtimeRate:
                Number(
                  row.overtimeRate ||
                  0
                ),

              weeklyHours:
                Number(
                  row.overtimeAfterHours ??
                  40
                ),

              days
            })
        }
      );

      document.getElementById(
        "scheduleModal"
      ).classList.remove(
        "show"
      );

      await loadPayroll();

    }catch(error){

      alert(
        error.message
      );
    }
  }
);


/* =========================
   TABS
========================= */

document
  .querySelectorAll(
    ".tab-btn"
  )
  .forEach(
    button=>{

      button.addEventListener(
        "click",
        ()=>{

          document
            .querySelectorAll(
              ".tab-btn"
            )
            .forEach(
              tab=>
                tab.classList.remove(
                  "active"
                )
            );

          button.classList.add(
            "active"
          );

          currentType =
            String(
              button.dataset.type ||
              "driver"
            );

          loadPayroll();
        }
      );
    }
  );


/* =========================
   START
========================= */

(async function start(){

  try{

    await loadPeriod();
    await loadPayroll();

  }catch(error){

    console.error(
      "PAYROLL START ERROR:",
      error
    );

    alert(
      error.message
    );
  }

})();