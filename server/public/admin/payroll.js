/* =========================================================
   FILE: public/admin/payroll.js

   SUPER ADMIN ONLY
   AUTOMATIC COMPANY-WIDE PAY PERIOD
   NO PAID / UNPAID
   NO MARK PAID
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

let currentType =
  "driver";

let currentRows =
  [];

let currentPeriod = {
  from:"",
  to:"",
  timezone:""
};


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

  const date =
    new Date(
      Date.UTC(
        y,
        m - 1,
        d,
        12
      )
    );

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
)
.addEventListener(
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
)
.addEventListener(
  "click",
  ()=>{

    document.getElementById(
      "periodFrom"
    ).value =
      currentPeriod.from;

    document.getElementById(
      "periodTo"
    ).value =
      currentPeriod.to;

    document.getElementById(
      "periodEdit"
    ).classList.remove(
      "show"
    );
  }
);

document.getElementById(
  "savePeriodBtn"
)
.addEventListener(
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

    const ok =
      confirm(
        "Save this company-wide pay period?\n\n" +
        "The same duration will repeat automatically for every future payroll period."
      );

    if(!ok){
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
      <td colspan="11">
        Loading...
      </td>
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

    currentPeriod = {
      from:
        data.from ||
        currentPeriod.from,

      to:
        data.to ||
        currentPeriod.to,

      timezone:
        data.timezone ||
        currentPeriod.timezone
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

    render();

  }catch(error){

    console.error(
      "PAYROLL LOAD ERROR:",
      error
    );

    body.innerHTML = `
      <tr>
        <td colspan="11">
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;
  }
}


/* =========================
   RENDER
========================= */

function render(){

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

  document.getElementById(
    "addEmployeeBtn"
  ).style.display =
    currentType ===
      "employee"
      ? "inline-block"
      : "none";

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
        row=>{

          const id =
            escapeHtml(
              row._id
            );

          const title =
            row.jobTitle
              ? `
                <div class="name-sub">
                  ${escapeHtml(row.jobTitle)}
                </div>
              `
              : "";

          const hoursButton =
            currentType !==
              "driver"
              ? `
                <button
                  class="hours-btn"
                  type="button"
                  onclick="openHours('${id}')">
                  Hours
                </button>
              `
              : "";

          return `
            <tr>

              <td class="name-cell">
                ${escapeHtml(row.name)}
                ${title}
              </td>

              <td>
                ${hoursText(row.regularHours)}
              </td>

              <td>
                ${hoursText(row.overtimeHours)}
              </td>

              <td>
                <b>
                  ${hoursText(row.totalHours)}
                </b>
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
                  id="ot-after-${id}"
                  type="number"
                  min="0"
                  step="1"
                  value="${Number(row.overtimeAfterHours ?? 40)}"
                  disabled>
              </td>

              <td>
                ${money(row.regularPay)}
              </td>

              <td>
                ${money(row.overtimePay)}
              </td>

              <td>
                <b>
                  ${money(row.totalDue)}
                </b>
              </td>

              <td>
                <div class="actions">

                  ${hoursButton}

                  <button
                    class="edit-btn"
                    id="edit-${id}"
                    type="button"
                    onclick="editProfile('${id}')">
                    Edit
                  </button>

                  <button
                    class="save-btn"
                    id="save-${id}"
                    type="button"
                    onclick="saveProfile('${id}')"
                    disabled>
                    Save
                  </button>

                </div>
              </td>

            </tr>
          `;
        }
      )
      .join("");
}


/* =========================
   EDIT / SAVE RATE
========================= */

window.editProfile =
function(id){

  [
    `rate-${id}`,
    `ot-rate-${id}`,
    `ot-after-${id}`
  ]
  .forEach(
    fieldId=>{

      const input =
        document.getElementById(
          fieldId
        );

      if(input){
        input.disabled = false;
      }
    }
  );

  const edit =
    document.getElementById(
      `edit-${id}`
    );

  const save =
    document.getElementById(
      `save-${id}`
    );

  if(edit){
    edit.disabled = true;
  }

  if(save){
    save.disabled = false;
  }

  document.getElementById(
    `rate-${id}`
  )?.focus();
};

window.saveProfile =
async function(id){

  const save =
    document.getElementById(
      `save-${id}`
    );

  try{

    if(save){
      save.disabled = true;
    }

    await api(
      `/api/payroll/profile/${currentType}/${encodeURIComponent(id)}`,
      {
        method:"PUT",
        headers:
          authHeaders(true),
        body:
          JSON.stringify({
            hourlyRate:
              Number(
                document
                  .getElementById(
                    `rate-${id}`
                  )
                  ?.value ||
                0
              ),

            overtimeRate:
              Number(
                document
                  .getElementById(
                    `ot-rate-${id}`
                  )
                  ?.value ||
                0
              ),

            overtimeAfterHours:
              Number(
                document
                  .getElementById(
                    `ot-after-${id}`
                  )
                  ?.value ||
                40
              )
          })
      }
    );

    await loadPayroll();

  }catch(error){

    if(save){
      save.disabled = false;
    }

    alert(
      error.message
    );
  }
};


/* =========================
   MANUAL HOURS
========================= */

window.openHours =
function(id){

  document.getElementById(
    "hoursPersonId"
  ).value =
    id;

  document.getElementById(
    "hoursDate"
  ).value =
    currentPeriod.from;

  document.getElementById(
    "hoursValue"
  ).value =
    "";

  document.getElementById(
    "hoursNote"
  ).value =
    "";

  document.getElementById(
    "hoursModal"
  ).classList.add(
    "show"
  );
};

document.getElementById(
  "closeHoursBtn"
)
.addEventListener(
  "click",
  ()=>{

    document.getElementById(
      "hoursModal"
    ).classList.remove(
      "show"
    );
  }
);

document.getElementById(
  "saveHoursBtn"
)
.addEventListener(
  "click",
  async()=>{

    const id =
      document.getElementById(
        "hoursPersonId"
      ).value;

    const workDate =
      document.getElementById(
        "hoursDate"
      ).value;

    const workHours =
      Number(
        document.getElementById(
          "hoursValue"
        ).value
      );

    const note =
      document.getElementById(
        "hoursNote"
      ).value.trim();

    if(
      !workDate ||
      workDate <
        currentPeriod.from ||
      workDate >
        currentPeriod.to
    ){

      alert(
        "Work date must be inside the current pay period."
      );

      return;
    }

    if(
      !Number.isFinite(
        workHours
      ) ||
      workHours < 0 ||
      workHours > 24
    ){

      alert(
        "Enter valid work hours."
      );

      return;
    }

    try{

      await api(
        `/api/payroll/hours/${currentType}/${encodeURIComponent(id)}`,
        {
          method:"PUT",
          headers:
            authHeaders(true),
          body:
            JSON.stringify({
              workDate,
              hours:workHours,
              note
            })
        }
      );

      document.getElementById(
        "hoursModal"
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
   EMPLOYEE
========================= */

document.getElementById(
  "addEmployeeBtn"
)
.addEventListener(
  "click",
  ()=>{

    [
      "employeeName",
      "employeeNumber",
      "employeeJobTitle",
      "employeePhone",
      "employeeEmail"
    ]
    .forEach(
      id=>{

        const input =
          document.getElementById(
            id
          );

        if(input){
          input.value = "";
        }
      }
    );

    document.getElementById(
      "employeeModal"
    ).classList.add(
      "show"
    );
  }
);

document.getElementById(
  "closeEmployeeBtn"
)
.addEventListener(
  "click",
  ()=>{

    document.getElementById(
      "employeeModal"
    ).classList.remove(
      "show"
    );
  }
);

document.getElementById(
  "saveEmployeeBtn"
)
.addEventListener(
  "click",
  async()=>{

    const name =
      document.getElementById(
        "employeeName"
      ).value.trim();

    if(!name){

      alert(
        "Employee name required."
      );

      return;
    }

    try{

      await api(
        "/api/payroll/employees",
        {
          method:"POST",
          headers:
            authHeaders(true),
          body:
            JSON.stringify({
              name,

              employeeNumber:
                document
                  .getElementById(
                    "employeeNumber"
                  )
                  .value
                  .trim(),

              jobTitle:
                document
                  .getElementById(
                    "employeeJobTitle"
                  )
                  .value
                  .trim(),

              phone:
                document
                  .getElementById(
                    "employeePhone"
                  )
                  .value
                  .trim(),

              email:
                document
                  .getElementById(
                    "employeeEmail"
                  )
                  .value
                  .trim()
            })
        }
      );

      document.getElementById(
        "employeeModal"
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