/* ================= CONFIG ================= */
const API = "/api/users?role=driver";
const STORAGE_KEY = "driverSchedule";

/* ================= STATE ================= */
let schedule = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
const tbody = document.getElementById("tbody");

/* ================= AZ DATE ================= */
function azDate(d = new Date()) {
  return new Date(d.toLocaleString("en-US", { timeZone: "America/Phoenix" }));
}

/* ================= BUILD WEEK ================= */
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
      date: `${d.getMonth()+1}/${d.getDate()}`
    });
  }

  document.getElementById("weekTitle").innerText =
    `Week: ${week[0].date} → ${week[6].date} (Arizona)`;

  return week;
}

const week = buildWeek();

/* ================= LOAD DRIVERS ================= */
async function loadDrivers() {
  const res = await fetch(API);
  if (!res.ok) throw new Error("API failed");
  return await res.json();
}

/* ================= SAVE ================= */
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
}

/* ================= RENDER ================= */
async function render() {
  tbody.innerHTML = "";

  let drivers = [];
  try {
    drivers = await loadDrivers();
  } catch {
    tbody.innerHTML =
      `<tr><td colspan="6">Failed to load drivers</td></tr>`;
    return;
  }

  if (!drivers.length) {
    tbody.innerHTML =
      `<tr><td colspan="6">No drivers found</td></tr>`;
    return;
  }

  drivers.forEach((d, i) => {
    if (!schedule[d.id]) {
      schedule[d.id] = {
        address: "",
        days: {},
        edit: false
      };
    }

    const s = schedule[d.id];

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${d.name}</td>
      <td>${d.username}</td>

      <td>
        <input
          value="${s.address}"
          ${!s.edit ? "disabled" : ""}
          onchange="schedule[${d.id}].address=this.value"
        >
      </td>

      <td>
        <div class="week-box">
          ${week.map(w => `
            <label class="day-box">
              <span>${w.label} ${w.date}</span>
              <input
                type="checkbox"
                ${s.days[w.key] ? "checked" : ""}
                ${!s.edit ? "disabled" : ""}
                onchange="schedule[${d.id}].days['${w.key}']=this.checked"
              >
            </label>
          `).join("")}
        </div>
      </td>

      <td>
        ${
          s.edit
            ? `<button onclick="saveDriver(${d.id})">Save</button>`
            : `<button onclick="editDriver(${d.id})">Edit</button>`
        }
      </td>
    `;

    tbody.appendChild(tr);
  });

  save();
}

/* ================= ACTIONS ================= */
function editDriver(id) {
  schedule[id].edit = true;
  render();
}

function saveDriver(id) {
  schedule[id].edit = false;
  save();
  render();
}

/* ================= INIT ================= */
render();