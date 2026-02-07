/* ================= CONFIG ================= */
const API = "/api/users?role=driver";   // ✅ نفس السيرفر
const META_KEY = "driverScheduleMeta";

/* ================= STORAGE ================= */
let meta = JSON.parse(localStorage.getItem(META_KEY)) || {};
const tbody = document.getElementById("tbody");

/* ================= AZ DATE ================= */
function azNow(){
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
  );
}

/* ================= WEEK (AZ) ================= */
const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const start = azNow();
const week = [];

for(let i=0;i<7;i++){
  const d = new Date(start);
  d.setDate(start.getDate() + i);

  week.push({
    label: dayNames[d.getDay()],
    date: `${d.getMonth()+1}/${d.getDate()}`,
    key: d.toISOString().slice(0,10) // YYYY-MM-DD
  });
}

const weekTitle = document.getElementById("weekTitle");
if (weekTitle) {
  weekTitle.innerText = `Week: ${week[0].date} → ${week[6].date} (Arizona)`;
}

/* ================= LOAD DRIVERS ================= */
async function loadDrivers(){
  const res = await fetch(API);
  if(!res.ok) throw new Error("Drivers API error");
  return await res.json(); // [{id,name,username,role}]
}

/* ================= SAVE META ================= */
function saveMeta(){
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

/* ================= RENDER ================= */
async function render(){
  tbody.innerHTML = "";

  let drivers = [];
  try {
    drivers = await loadDrivers();
  } catch (e) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="color:red;text-align:center">
          ❌ Failed to load drivers
        </td>
      </tr>`;
    console.error(e);
    return;
  }

  if (!drivers.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center">
          No drivers found
        </td>
      </tr>`;
    return;
  }

  drivers.forEach((d, i) => {
    if(!meta[d.id]){
      meta[d.id] = {
        address: "",
        days: {},
        editing: false
      };
    }

    const m = meta[d.id];
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${i + 1}</td>

      <td>${d.name}</td>

      <td>${d.username}</td>

      <td>
        <input
          value="${m.address || ""}"
          ${!m.editing ? "disabled" : ""}
          onchange="meta[${d.id}].address = this.value"
        />
      </td>

      <td>
        <div class="week-box">
          ${week.map(w => `
            <label class="day-box">
              <span>${w.label} ${w.date}</span>
              <input
                type="checkbox"
                ${m.days[w.key] ? "checked" : ""}
                ${!m.editing ? "disabled" : ""}
                onchange="meta[${d.id}].days['${w.key}'] = this.checked"
              />
            </label>
          `).join("")}
        </div>
      </td>

      <td>
        ${
          m.editing
          ? `<button class="action-btn save" onclick="saveDriver(${d.id})">Save</button>`
          : `<button class="action-btn edit" onclick="editDriver(${d.id})">Edit</button>`
        }
      </td>
    `;

    tbody.appendChild(tr);
  });

  saveMeta();
}

/* ================= ACTIONS ================= */
function editDriver(id){
  meta[id].editing = true;
  render();
}

function saveDriver(id){
  meta[id].editing = false;
  saveMeta();
  render();
}

/* ================= INIT ================= */
render();