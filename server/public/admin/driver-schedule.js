/* ===============================
   AUTH + ADMIN NAME
================================ */
const userRaw = localStorage.getItem("loggedUser");
if (!userRaw) location.href = "login.html";
const admin = JSON.parse(userRaw);

document.getElementById("adminName").innerText = admin.name;

/* ===============================
   API
================================ */
const DRIVERS_API = "/api/admin/users?role=driver";

/* ===============================
   STORAGE
================================ */
const STORAGE_KEY = "driverSchedule";
let schedule = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

/* ===============================
   DATE (ARIZONA)
================================ */
function azDate(d = new Date()) {
  return new Date(d.toLocaleString("en-US", { timeZone: "America/Phoenix" }));
}

/* ===============================
   BUILD WEEK (DATES)
================================ */
function buildWeek() {
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const start = azDate();
  const week = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    week.push({
      label: days[d.getDay()],
      key: d.toISOString().slice(0,10),
      text: `${days[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`
    });
  }

  document.getElementById("weekTitle").innerText =
    `Week: ${week[0].text} → ${week[6].text} (Arizona)`;

  return week;
}

const week = buildWeek();

/* ===============================
   FETCH DRIVERS
================================ */
async function loadDrivers() {
  const res = await fetch(DRIVERS_API);
  if (!res.ok) throw new Error("Failed to load drivers");
  return await res.json();
}

/* ===============================
   SAVE
================================ */
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
}

/* ===============================
   RENDER
================================ */
async function render() {
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";

  let drivers = [];
  try {
    drivers = await loadDrivers();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7">Failed to load drivers</td></tr>`;
    return;
  }

  drivers.forEach((d, i) => {
    if (!schedule[d.id]) {
      schedule[d.id] = {
        phone: "",
        address: "",
        days: {},
        edit: false,
        enabled: true
      };
    }

    const s = schedule[d.id];
    const isActiveToday = s.days[new Date().toISOString().slice(0,10)];
    const statusText = s.enabled && isActiveToday ? "ACTIVE" : "NOT ACTIVE";

    const tr = document.createElement("tr");
    if (!s.enabled) tr.style.opacity = "0.4";

    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${d.name}</td>

      <td>
        <input value="${s.phone}"
          ${!s.edit ? "disabled" : ""}
          onchange="schedule[${d.id}].phone=this.value">
      </td>

      <td>
        <input value="${s.address}"
          ${!s.edit ? "disabled" : ""}
          onchange="schedule[${d.id}].address=this.value">
      </td>

      <td>
        <div class="week-box">
          ${week.map(w => `
            <label class="day-box ${s.days[w.key] ? "on" : "off"}">
              ${w.text}
              <input type="checkbox"
                ${s.days[w.key] ? "checked" : ""}
                ${!s.edit ? "disabled" : ""}
                onchange="toggleDay(${d.id}, '${w.key}', this.checked)">
            </label>
          `).join("")}
        </div>
      </td>

      <td class="${statusText === "ACTIVE" ? "active" : "inactive"}">
        ${statusText}
      </td>

      <td>
        ${s.edit
          ? `<button onclick="saveRow(${d.id})">Save</button>`
          : `<button onclick="editRow(${d.id})">Edit</button>`
        }
        <button onclick="toggleEnable(${d.id})">
          ${s.enabled ? "Disable" : "Enable"}
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  save();
}

/* ===============================
   ACTIONS
================================ */
function editRow(id) {
  schedule[id].edit = true;
  render();
}

function saveRow(id) {
  schedule[id].edit = false;
  save();
  render();
}

function toggleDay(id, day, checked) {
  schedule[id].days[day] = checked;
}

function toggleEnable(id) {
  schedule[id].enabled = !schedule[id].enabled;
  save();
  render();
}

/* ===============================
   INIT
================================ */
render();