/* =========================================================
   FILE: public/admin/payroll.js
   SUPER ADMIN ONLY
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

/* =========================
   ELEMENTS
========================= */

const body =
  document.getElementById(
    "payrollBody"
  );

const fromDate =
  document.getElementById(
    "fromDate"
  );

const toDate =
  document.getElementById(
    "toDate"
  );

const loadBtn =
  document.getElementById(
    "loadBtn"
  );

const addEmployeeBtn =
  document.getElementById(
    "addEmployeeBtn"
  );

const hoursModal =
  document.getElementById(
    "hoursModal"
  );

const employeeModal =
  document.getElementById(
    "employeeModal"
  );

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

function setupDefaultPeriod(){

  const now =
    new Date();

  const start =
    new Date(now);

  start.setDate(
    start.getDate() -
    start.getDay()
  );

  const end =
    new Date(start);

  end.setDate(
    end.getDate() + 6
  );

  fromDate.value =
    dateKey(start);

  toDate.value =
    dateKey(end);
}

function escapeHtml(value){

  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function formatHours(value){

  return Number(
    value || 0
  ).toFixed(2);
}

function formatMoney(value){

  return new Intl.NumberFormat(
    "en-US",
    {
      style:"currency",
      currency:"USD"
    }
  )
  .format(
    Number(value || 0)
  );
}

function validPeriod(){

  return (
    fromDate.value &&
    toDate.value &&
    fromDate.value <=
    toDate.value
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
   LOAD
========================= */

async function loadPayroll(){

  if(!validPeriod()){

    alert(
      "Select a valid date range."
    );

    return;
  }

  body.innerHTML = `
    <tr>
      <td colspan="12">
        Loading...
      </td>
    </tr>
  `;

  try{

    const query =
      new URLSearchParams({
        type:currentType,
        from:fromDate.value,
        to:toDate.value
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

    render();

  }catch(error){

    console.error(
      "PAYROLL LOAD ERROR:",
      error
    );

    body.innerHTML = `
      <tr>
        <td colspan="12">
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

  const totalHours =
    currentRows.reduce(
      (sum,row)=>
        sum +
        Number(
          row.totalHours || 0
        ),
      0
    );

  const totalDue =
    currentRows.reduce(
      (sum,row)=>
        sum +
        Number(
          row.totalDue || 0
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
    formatHours(
      totalHours
    );

  document.getElementById(
    "allDue"
  ).textContent =
    formatMoney(
      totalDue
    );

  addEmployeeBtn.style.display =
    currentType === "employee"
      ? "inline-block"
      : "none";

  if(!currentRows.length){

    body.innerHTML = `
      <tr>
        <td colspan="12">
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

          const paid =
            row.paymentStatus ===
            "PAID";

          const title =
            row.jobTitle
              ? `
                <div class="name-sub">
                  ${escapeHtml(row.jobTitle)}
                </div>
              `
              : "";

          const manualHoursButton =
            currentType !== "driver"
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
                ${formatHours(row.regularHours)}
              </td>

              <td>
                ${formatHours(row.overtimeHours)}
              </td>

              <td>
                <b>
                  ${formatHours(row.totalHours)}
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
                ${formatMoney(row.regularPay)}
              </td>

              <td>
                ${formatMoney(row.overtimePay)}
              </td>

              <td>
                <b>
                  ${formatMoney(row.totalDue)}
                </b>
              </td>

              <td
                class="${
                  paid
                    ? "status-paid"
                    : "status-unpaid"
                }">

                ${
                  paid
                    ? "PAID"
                    : "UNPAID"
                }

              </td>

              <td>

                <div class="actions">

                  ${manualHoursButton}

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

                  <button
                    class="paid-btn"
                    type="button"
                    onclick="markPaid('${id}')"
                    ${paid ? "disabled" : ""}>
                    ${
                      paid
                        ? "Paid"
                        : "Mark Paid"
                    }
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
   EDIT
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

  const editButton =
    document.getElementById(
      `edit-${id}`
    );

  const saveButton =
    document.getElementById(
      `save-${id}`
    );

  if(editButton){
    editButton.disabled = true;
  }

  if(saveButton){
    saveButton.disabled = false;
  }

  document.getElementById(
    `rate-${id}`
  )?.focus();
};

/* =========================
   SAVE PROFILE
========================= */

window.saveProfile =
async function(id){

  const saveButton =
    document.getElementById(
      `save-${id}`
    );

  try{

    if(saveButton){
      saveButton.disabled = true;
    }

    const hourlyRate =
      Number(
        document.getElementById(
          `rate-${id}`
        )?.value ||
        0
      );

    const overtimeRate =
      Number(
        document.getElementById(
          `ot-rate-${id}`
        )?.value ||
        0
      );

    const overtimeAfterHours =
      Number(
        document.getElementById(
          `ot-after-${id}`
        )?.value ||
        0
      );

    await api(
      `/api/payroll/profile/${currentType}/${encodeURIComponent(id)}`,
      {
        method:"PUT",
        headers:
          authHeaders(true),
        body:
          JSON.stringify({
            hourlyRate,
            overtimeRate,
            overtimeAfterHours
          })
      }
    );

    await loadPayroll();

  }catch(error){

    if(saveButton){
      saveButton.disabled = false;
    }

    alert(
      error.message
    );
  }
};

/* =========================
   MARK PAID
========================= */

window.markPaid =
async function(id){

  const row =
    currentRows.find(
      item=>
        String(item._id) ===
        String(id)
    );

  if(!row){
    return;
  }

  const ok =
    confirm(
      `Mark ${row.name} as PAID?\n\n` +
      `Period: ${fromDate.value} through ${toDate.value}\n` +
      `Amount: ${formatMoney(row.totalDue)}\n\n` +
      `This records payment status only. It does not send money.`
    );

  if(!ok){
    return;
  }

  try{

    await api(
      `/api/payroll/mark-paid/${currentType}/${encodeURIComponent(id)}`,
      {
        method:"POST",
        headers:
          authHeaders(true),
        body:
          JSON.stringify({
            from:
              fromDate.value,
            to:
              toDate.value
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
   HOURS MODAL
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
    fromDate.value;

  document.getElementById(
    "hoursValue"
  ).value =
    "";

  document.getElementById(
    "hoursNote"
  ).value =
    "";

  hoursModal.classList.add(
    "show"
  );
};

document.getElementById(
  "closeHoursBtn"
)
.addEventListener(
  "click",
  ()=>{

    hoursModal.classList.remove(
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

      hoursModal.classList.remove(
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
   EMPLOYEE MODAL
========================= */

addEmployeeBtn
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

    employeeModal.classList.add(
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

    employeeModal.classList.remove(
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

      employeeModal.classList.remove(
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
              btn=>
                btn.classList.remove(
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
   EVENTS
========================= */

loadBtn.addEventListener(
  "click",
  loadPayroll
);

/* =========================
   START
========================= */

setupDefaultPeriod();
loadPayroll();