/* ===============================
   DRIVER SCHEDULE – FINAL STABLE
   Sunbeam Transportation
=============================== */

/* ===============================
   AUTH (Admin name)
=============================== */
const adminRaw = localStorage.getItem("loggedUser");
const admin = adminRaw ? JSON.parse(adminRaw) : null;
if (!admin) location.href = "login.html";

const adminNameEl = document.getElementById("adminName");
if (adminNameEl) adminNameEl.innerText = admin.name;

/* ===============================
   API
=============================== */
const API_DRIVERS = "/api/admin/users?role=driver";

/* ===============================
   STORAGE
=============================== */
const STORAGE_KEY = "driverSchedule";
let schedule = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

/* ===============================
   DOM
=============================== */
const tbody = document.getElementById("tbody");

/* ===============================
   DATE (Arizona)
=============================== */
function azDate(d = new Date()) {
  return new Date(d.toLocaleString("en-US", { timeZone: "America/Phoenix" }));
}

/* ===============================
   BUILD WEEK
=============================== */
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

const WEEK = buildWeek();

/* ===============================
   LOAD DRIVERS
=============================== */
async function loadDrivers() {
  const res = await fetch(API_DRIVERS);
  if (!res.ok) throw new Error("Failed to load drivers");
  return await res.json();
}

/* ===============================
   SAVE
=============================== */
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
  syncWithMap();
}

/* ===============================
   MAP SYNC (IMPORTANT)
=============================== */
function syncWithMap() {
  localStorage.setItem("driverScheduleForMap", JSON.stringify(schedule));
}

/* ===============================
   RENDER
=============================== */
async function render() {
  tbody.innerHTML = "";

  let drivers = [];
  try {
    drivers = await loadDrivers();
  } catch {
    tbody.innerHTML =
      `<tr><td colspan="7">Failed to load drivers</td></tr>`;
    return;
  }

  drivers.forEach((d, i) => {
    if (!schedule[d.id]) {
      schedule[d.id] = {
        phone: "",
        address: "",
        days: {},
        enabled: true,
        edit: false
      };
    }

    const s = schedule[d.id];
    const todayKey = azDate().toISOString().slice(0,10);
    const activeToday = s.enabled && s.days[todayKey];

    const tr = document.createElement("tr");
    if (!s.enabled) tr.style.opacity = "0.4";

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><strong>${d.name}</strong></td>

      <td>
        <input value="${s.phone}" ${!s.edit ? "disabled" : ""}
          onchange="schedule[${d.id}].phone=this.value">
      </td>

      <td>
        <input value="${s.address}" ${!s.edit ? "disabled" : ""}
          onchange="schedule[${d.id}].address=this.value">
      </td>

      <td>
        <div class="week-box">
          ${WEEK.map(w => {
            const checked = !!s.days[w.key];
            return `
              <label class="day-box ${checked ? "on" : "off"}">
                ${w.text}
                <input type="checkbox"
                  ${checked ? "checked" : ""}
                  ${!s.edit || !s.enabled ? "disabled" : ""}
                  onchange="toggleDay(${d.id}, '${w.key}', this.checked)">
              </label>
            `;
          }).join("")}
        </div>
      </td>

      <td class="${activeToday ? "active" : "inactive"}">
        ${activeToday ? "ACTIVE" : "NOT ACTIVE"}
      </td>

      <td>
        ${
          s.edit
            ? `<button class="btn save" onclick="saveDriver(${d.id})">Save</button>`
            : `<button class="btn edit" onclick="editDriver(${d.id})">Edit</button>`
        }
        <button class="btn ${s.enabled ? "disable" : "enable"}"
          onclick="toggleEnable(${d.id})">
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
=============================== */
function editDriver(id) {
  schedule[id].edit = true;
  render();
}

function saveDriver(id) {
  schedule[id].edit = false;
  save();
  render();
}

function toggleDay(id, key, val) {
  schedule[id].days[key] = val;
  save();
  render();
}

function toggleEnable(id) {
  schedule[id].enabled = !schedule[id].enabled;
  save();
  render();
}

/* ===============================
   INIT
=============================== */
render();