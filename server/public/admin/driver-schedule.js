const API_DRIVERS = "/api/drivers"
const API_SCHEDULE = "/api/driver-schedule"

let schedule = {}
let drivers = []

const tbody = document.getElementById("tbody")

/* ================= AZ DATE ================= */
function azDate(d = new Date()){
  return new Date(
    d.toLocaleString("en-US", { timeZone: "America/Phoenix" })
  )
}

/* ================= WEEK ================= */
function buildWeek(){
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  const start = azDate()
  const week = []

  for(let i = 0; i < 7; i++){
    const d = new Date(start)
    d.setDate(start.getDate() + i)

    const key = d.toLocaleDateString("en-CA", {
      timeZone: "America/Phoenix"
    })

    week.push({
      label: days[d.getDay()],
      key,
      date: `${d.getMonth() + 1}/${d.getDate()}`
    })
  }

  const weekTitle = document.getElementById("weekTitle")
  if(weekTitle){
    weekTitle.innerText = `Week ${week[0].date} → ${week[6].date} (Arizona)`
  }

  return week
}

const WEEK = buildWeek()

/* ================= LOAD ================= */
async function loadDrivers(){
  try{
    const res = await fetch(API_DRIVERS)
    const data = await res.json()
    drivers = Array.isArray(data) ? data : (data.drivers || [])
  }catch(err){
    console.log("LOAD DRIVERS ERROR:", err)
    drivers = []
  }
}

async function loadSchedule(){
  try{
    const res = await fetch(API_SCHEDULE)
    schedule = res.ok ? await res.json() : {}
  }catch(err){
    console.log("LOAD SCHEDULE ERROR:", err)
    schedule = {}
  }
}

/* ================= SAVE ================= */
async function save(){
  const clean = {}

  for(const id in schedule){
    clean[id] = {
      phone: schedule[id].phone || "",
      address: schedule[id].address || "",
      lat: schedule[id].lat || "",
      lng: schedule[id].lng || "",
      vehicleNumber: schedule[id].vehicleNumber || "",
      enabled: schedule[id].enabled === true,
      days: schedule[id].days || {}
    }
  }

  try{
    await fetch(API_SCHEDULE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clean)
    })
  }catch(err){
    console.log("SAVE SCHEDULE ERROR:", err)
  }
}

/* ================= HELPERS ================= */
function getDriverName(d){
  return d.name || d.fullName || "-"
}

function getVehicle(id){
  return schedule[id]?.vehicleNumber || ""
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function ensureDriverSchedule(id){
  if(!schedule[id]){
    schedule[id] = {
      phone: "",
      address: "",
      lat: "",
      lng: "",
      vehicleNumber: "",
      days: {},
      enabled: true,
      edit: false
    }
  }else{
    schedule[id].phone = schedule[id].phone || ""
    schedule[id].address = schedule[id].address || ""
    schedule[id].lat = schedule[id].lat || ""
    schedule[id].lng = schedule[id].lng || ""
    schedule[id].vehicleNumber = schedule[id].vehicleNumber || ""
    schedule[id].days = schedule[id].days || {}
    schedule[id].enabled = schedule[id].enabled !== false
    schedule[id].edit = schedule[id].edit === true
  }
}

function getTodayKey(){
  return azDate().toLocaleDateString("en-CA", {
    timeZone: "America/Phoenix"
  })
}

/* ================= RENDER ================= */
function render(){
  if(!tbody) return

  tbody.innerHTML = ""

  drivers.forEach((d, i) => {
    const id = String(d._id || d.id || "")
    if(!id) return

    ensureDriverSchedule(id)

    const s = schedule[id]
    const todayKey = getTodayKey()
    const activeToday = s.enabled && !!s.days[todayKey]

    const tr = document.createElement("tr")

    if(!s.enabled){
      tr.style.opacity = "0.4"
    }

    tr.innerHTML = `
      <td>${i + 1}</td>

      <td><strong>${escapeHtml(getDriverName(d))}</strong></td>

      <td>
        <input
          value="${escapeHtml(getVehicle(id))}"
          ${!s.edit ? "disabled" : ""}
          oninput="schedule['${id}'].vehicleNumber=this.value">
      </td>

      <td>
        <input
          value="${escapeHtml(s.phone || "")}"
          ${!s.edit ? "disabled" : ""}
          oninput="schedule['${id}'].phone=this.value">
      </td>

      <td>
        <input
          placeholder="Address"
          value="${escapeHtml(s.address || "")}"
          ${!s.edit ? "disabled" : ""}
          oninput="schedule['${id}'].address=this.value">
      </td>

      <td>
        <input
          placeholder="Lat"
          value="${escapeHtml(s.lat || "")}"
          ${!s.edit ? "disabled" : ""}
          oninput="schedule['${id}'].lat=this.value">
      </td>

      <td>
        <input
          placeholder="Lng"
          value="${escapeHtml(s.lng || "")}"
          ${!s.edit ? "disabled" : ""}
          oninput="schedule['${id}'].lng=this.value">
      </td>

      <td>
        <div class="week-box">
          ${WEEK.map(w => {
            const checked = !!s.days[w.key]
            return `
              <div class="day-square ${checked ? "active" : ""}"
                   onclick="squareToggle('${id}','${w.key}',this)">
                <input type="checkbox"
                       ${checked ? "checked" : ""}
                       ${(!s.edit || !s.enabled) ? "disabled" : ""}
                       style="display:none">
                <div>${escapeHtml(w.label)}</div>
                <div>${escapeHtml(w.date)}</div>
              </div>
            `
          }).join("")}
        </div>
      </td>

      <td style="font-weight:bold;color:${activeToday ? "#16a34a" : "#dc2626"}">
        ${activeToday ? "ACTIVE" : "NOT ACTIVE"}
      </td>

      <td style="white-space:nowrap">
        ${
          s.edit
            ? `<button class="action-btn save" onclick="saveDriver('${id}')">Save</button>`
            : `<button class="action-btn edit" onclick="editDriver('${id}')">Edit</button>`
        }

        <button class="action-btn ${s.enabled ? "disable" : "enable"}"
                onclick="toggleEnable('${id}')">
          ${s.enabled ? "Disable" : "Enable"}
        </button>
      </td>
    `

    tbody.appendChild(tr)
  })
}

/* ================= ACTIONS ================= */
function editDriver(id){
  ensureDriverSchedule(id)
  schedule[id].edit = true
  render()
}

async function saveDriver(id){
  ensureDriverSchedule(id)
  schedule[id].edit = false
  await save()
  render()
}

async function toggleEnable(id){
  ensureDriverSchedule(id)
  schedule[id].enabled = !schedule[id].enabled
  await save()
  render()
}

async function squareToggle(id, key, el){
  ensureDriverSchedule(id)

  const s = schedule[id]
  if(!s.edit || !s.enabled) return

  s.days[key] = !s.days[key]
  el.classList.toggle("active", s.days[key])

  await save()
}

/* ================= GLOBAL ================= */
window.schedule = schedule
window.editDriver = editDriver
window.saveDriver = saveDriver
window.toggleEnable = toggleEnable
window.squareToggle = squareToggle

/* ================= INIT ================= */
async function init(){
  await loadDrivers()
  await loadSchedule()
  render()
}

init()