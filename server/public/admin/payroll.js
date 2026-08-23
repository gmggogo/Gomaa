const token =
  localStorage.getItem("token") || "";

const role =
  String(
    localStorage.getItem("role") || ""
  );

if(
  !token ||
  ![
    "SUPER_ADMIN",
    "admin",
    "dispatcher"
  ].includes(role)
){
  window.location.href = "/login.html";
}

const canEdit =
  role === "SUPER_ADMIN";

let currentType = "driver";
let currentRows = [];

const body =
  document.getElementById("payrollBody");

const fromDate =
  document.getElementById("fromDate");

const toDate =
  document.getElementById("toDate");

const loadBtn =
  document.getElementById("loadBtn");

const addEmployeeBtn =
  document.getElementById("addEmployeeBtn");

function authHeaders(json=false){
  return {
    ...(json
      ? {"Content-Type":"application/json"}
      : {}),
    Authorization:"Bearer " + token
  };
}

function dateKey(date){
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function setupDefaultPeriod(){
  const now = new Date();
  const start = new Date(now);

  start.setDate(
    start.getDate() -
    start.getDay()
  );

  const end = new Date(start);
  end.setDate(end.getDate()+6);

  fromDate.value = dateKey(start);
  toDate.value = dateKey(end);
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
  return Number(value || 0).toFixed(2);
}

function formatMoney(value){
  return new Intl.NumberFormat(
    "en-US",
    {
      style:"currency",
      currency:"USD"
    }
  ).format(Number(value || 0));
}

function validPeriod(){
  return (
    fromDate.value &&
    toDate.value &&
    fromDate.value <= toDate.value
  );
}

async function api(url,options={}){
  const res = await fetch(
    url,
    {
      cache:"no-store",
      ...options
    }
  );

  const data =
    await res.json().catch(()=>({}));

  if(!res.ok){
    throw new Error(
      data.message ||
      `HTTP ${res.status}`
    );
  }

  return data;
}

async function loadPayroll(){
  if(!validPeriod()){
    alert("Select a valid date range");
    return;
  }

  body.innerHTML = `
    <tr>
      <td colspan="12">Loading...</td>
    </tr>
  `;

  try{
    const query = new URLSearchParams({
      type:currentType,
      from:fromDate.value,
      to:toDate.value
    });

    const data = await api(
      `/api/payroll/people?${query.toString()}`,
      {
        headers:authHeaders()
      }
    );

    currentRows =
      Array.isArray(data.people)
        ? data.people
        : [];

    render();

  }catch(err){
    console.error(err);

    body.innerHTML = `
      <tr>
        <td colspan="12">
          ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}

function render(){
  const totalHours =
    currentRows.reduce(
      (sum,row)=>
        sum +
        Number(row.totalHours || 0),
      0
    );

  const totalDue =
    currentRows.reduce(
      (sum,row)=>
        sum +
        Number(row.totalDue || 0),
      0
    );

  document.getElementById("peopleCount")
    .textContent = currentRows.length;

  document.getElementById("allHours")
    .textContent = formatHours(totalHours);

  document.getElementById("allDue")
    .textContent = formatMoney(totalDue);

  addEmployeeBtn.style.display =
    canEdit &&
    currentType === "employee"
      ? "inline-block"
      : "none";

  if(!currentRows.length){
    body.innerHTML = `
      <tr>
        <td colspan="12">No people found.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML =
    currentRows.map(row=>{
      const id = escapeHtml(row._id);

      const rateField =
        canEdit
          ? `
            <input
              type="number"
              step="0.01"
              min="0"
              id="rate-${id}"
              value="${Number(row.hourlyRate || 0)}"
            >
          `
          : formatMoney(row.hourlyRate);

      const otRateField =
        canEdit
          ? `
            <input
              type="number"
              step="0.01"
              min="0"
              id="ot-rate-${id}"
              value="${Number(row.overtimeRate || 0)}"
            >
          `
          : formatMoney(row.overtimeRate);

      const thresholdField =
        canEdit
          ? `
            <input
              type="number"
              step="1"
              min="0"
              id="ot-after-${id}"
              value="${Number(row.overtimeAfterHours ?? 40)}"
            >
          `
          : escapeHtml(row.overtimeAfterHours);

      const hoursButton =
        canEdit &&
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

      const saveButton =
        canEdit
          ? `
            <button
              class="save-btn"
              type="button"
              onclick="saveProfile('${id}')">
              Save
            </button>
          `
          : "";

      const paid =
        row.paymentStatus === "PAID";

      const paidButton =
        canEdit
          ? `
            <button
              class="paid-btn"
              type="button"
              ${paid ? "disabled" : ""}
              onclick="markPaid('${id}')">
              ${paid ? "PAID" : "Mark Paid"}
            </button>
          `
          : "";

      return `
        <tr>
          <td class="name-cell">
            ${escapeHtml(row.name)}
            ${
              row.jobTitle
                ? `<div style="font-size:12px;color:#64748b;margin-top:4px;">${escapeHtml(row.jobTitle)}</div>`
                : ""
            }
          </td>

          <td>${formatHours(row.regularHours)}</td>
          <td>${formatHours(row.overtimeHours)}</td>
          <td><b>${formatHours(row.totalHours)}</b></td>
          <td>${rateField}</td>
          <td>${otRateField}</td>
          <td>${thresholdField}</td>
          <td>${formatMoney(row.regularPay)}</td>
          <td>${formatMoney(row.overtimePay)}</td>
          <td><b>${formatMoney(row.totalDue)}</b></td>

          <td class="${paid ? "status-paid" : "status-unpaid"}">
            ${paid ? "PAID" : "UNPAID"}
          </td>

          <td>
            <div style="display:flex;gap:7px;flex-wrap:wrap;">
              ${hoursButton}
              ${saveButton}
              ${paidButton}
            </div>
          </td>
        </tr>
      `;
    }).join("");
}

window.saveProfile =
async function(id){
  try{
    const hourlyRate =
      Number(
        document.getElementById(`rate-${id}`)?.value || 0
      );

    const overtimeRate =
      Number(
        document.getElementById(`ot-rate-${id}`)?.value || 0
      );

    const overtimeAfterHours =
      Number(
        document.getElementById(`ot-after-${id}`)?.value || 0
      );

    await api(
      `/api/payroll/profile/${currentType}/${encodeURIComponent(id)}`,
      {
        method:"PUT",
        headers:authHeaders(true),
        body:JSON.stringify({
          hourlyRate,
          overtimeRate,
          overtimeAfterHours
        })
      }
    );

    await loadPayroll();

  }catch(err){
    alert(err.message);
  }
};

window.markPaid =
async function(id){
  const row =
    currentRows.find(
      item=>String(item._id) === String(id)
    );

  if(!row) return;

  const ok = confirm(
    `Mark ${row.name} as PAID for ${fromDate.value} through ${toDate.value}?\n\nAmount: ${formatMoney(row.totalDue)}\n\nThis does not send money. It only records payment status.`
  );

  if(!ok) return;

  try{
    await api(
      `/api/payroll/mark-paid/${currentType}/${encodeURIComponent(id)}`,
      {
        method:"POST",
        headers:authHeaders(true),
        body:JSON.stringify({
          from:fromDate.value,
          to:toDate.value
        })
      }
    );

    await loadPayroll();

  }catch(err){
    alert(err.message);
  }
};

const hoursModal =
  document.getElementById("hoursModal");

window.openHours =
function(id){
  document.getElementById("hoursPersonId")
    .value = id;

  document.getElementById("hoursDate")
    .value = fromDate.value;

  document.getElementById("hoursValue")
    .value = "";

  document.getElementById("hoursNote")
    .value = "";

  hoursModal.classList.add("show");
};

document.getElementById("closeHoursBtn")
.addEventListener(
  "click",
  ()=>{
    hoursModal.classList.remove("show");
  }
);

document.getElementById("saveHoursBtn")
.addEventListener(
  "click",
  async()=>{
    const id =
      document.getElementById("hoursPersonId").value;

    const workDate =
      document.getElementById("hoursDate").value;

    const workHours =
      Number(
        document.getElementById("hoursValue").value
      );

    const note =
      document.getElementById("hoursNote").value;

    try{
      await api(
        `/api/payroll/hours/${currentType}/${encodeURIComponent(id)}`,
        {
          method:"PUT",
          headers:authHeaders(true),
          body:JSON.stringify({
            workDate,
            hours:workHours,
            note
          })
        }
      );

      hoursModal.classList.remove("show");
      await loadPayroll();

    }catch(err){
      alert(err.message);
    }
  }
);

const employeeModal =
  document.getElementById("employeeModal");

addEmployeeBtn.addEventListener(
  "click",
  ()=>{
    [
      "employeeName",
      "employeeNumber",
      "employeeJobTitle",
      "employeePhone",
      "employeeEmail"
    ].forEach(id=>{
      document.getElementById(id).value = "";
    });

    employeeModal.classList.add("show");
  }
);

document.getElementById("closeEmployeeBtn")
.addEventListener(
  "click",
  ()=>{
    employeeModal.classList.remove("show");
  }
);

document.getElementById("saveEmployeeBtn")
.addEventListener(
  "click",
  async()=>{
    const name =
      document.getElementById("employeeName")
        .value.trim();

    if(!name){
      alert("Employee name required");
      return;
    }

    try{
      await api(
        "/api/payroll/employees",
        {
          method:"POST",
          headers:authHeaders(true),
          body:JSON.stringify({
            name,
            employeeNumber:
              document.getElementById("employeeNumber").value.trim(),
            jobTitle:
              document.getElementById("employeeJobTitle").value.trim(),
            phone:
              document.getElementById("employeePhone").value.trim(),
            email:
              document.getElementById("employeeEmail").value.trim()
          })
        }
      );

      employeeModal.classList.remove("show");
      await loadPayroll();

    }catch(err){
      alert(err.message);
    }
  }
);

document.querySelectorAll(".tab-btn")
.forEach(button=>{
  button.addEventListener(
    "click",
    ()=>{
      document.querySelectorAll(".tab-btn")
        .forEach(btn=>btn.classList.remove("active"));

      button.classList.add("active");
      currentType = button.dataset.type;
      loadPayroll();
    }
  );
});

loadBtn.addEventListener(
  "click",
  loadPayroll
);

setupDefaultPeriod();
loadPayroll();