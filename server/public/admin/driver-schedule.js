/* ================= CONFIG ================= */
const API = "/api/admin/users?role=driver";
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

  const todayKey = azDate().toISOString().slice(0,10);

  drivers.forEach((d, i) => {
    if (!schedule[d.id]) {
      schedule[d.id] = {
        address: "",
        days: {}
      };
    }

    const s = schedule[d.id];
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${d.name}</td>
      <td>${d.username}</td>

      <td>
        <input value="${s.address}" disabled>
      </td>

      <td>
        <div class="week-box">
          ${week.map(w => {
            const isOn = s.days[w.key];
            let cls = isOn ? "day-on" : "day-off";
            if (w.key === todayKey) cls += " day-today";

            return `
              <label class="day-box ${cls}">
                <span class="day-label">${w.label} ${w.date}</span>
                <input
                  type="checkbox"
                  ${isOn ? "checked" : ""}
                  onchange="
                    schedule[${d.id}].days['${w.key}']=this.checked;
                    save();
                    render();
                  "
                >
              </label>
            `;
          }).join("")}
        </div>
      </td>

      <td>
        <button disabled>Auto</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  save();
}

/* ================= INIT ================= */
render();