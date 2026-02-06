const container = document.getElementById("tripsContainer");
const searchBox  = document.getElementById("searchBox");

if (!container) {
  console.error("Missing #tripsContainer");
}

/* =========================
   STORAGE
========================= */
function loadCompanyTrips(){
  try { return JSON.parse(localStorage.getItem("companyTrips")) || []; }
  catch { return []; }
}
function saveCompanyTrips(list){
  localStorage.setItem("companyTrips", JSON.stringify(list));
}

/* =========================
   SYNC DISPATCH (FIXED)
   - send ONLY (inDispatch==true) AND (not disabled)
========================= */
function syncDispatchTrips(){
  const trips = loadCompanyTrips();

  const dispatchTrips = trips.filter(t =>
    t.inDispatch === true &&
    t.disabled !== true
  );

  localStorage.setItem("dispatchTrips", JSON.stringify(dispatchTrips));
}

/* =========================
   BUILD VIEW
========================= */
function buildViewTrips(){
  return loadCompanyTrips();
}

let tripsView = buildViewTrips();

/* =========================
   DATE FILTER (TODAY + TOMORROW AZ)
========================= */
function isTodayOrTomorrow(tripDate){
  if(!tripDate) return false;

  const [y,m,d] = tripDate.split("-").map(Number);
  const trip = new Date(y, m-1, d);
  trip.setHours(0,0,0,0);

  const nowAZ = new Date(
    new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
  );
  nowAZ.setHours(0,0,0,0);

  const tomorrowAZ = new Date(nowAZ);
  tomorrowAZ.setDate(nowAZ.getDate()+1);

  return (
    trip.getTime() === nowAZ.getTime() ||
    trip.getTime() === tomorrowAZ.getTime()
  );
}

/* =========================
   STATUS CLASS
========================= */
function statusClass(s){
  return {
    "Booked":"status-booked",
    "Scheduled":"status-scheduled",
    "On Board":"status-onboard",
    "Arrived":"status-arrived",
    "Completed":"status-complete",
    "Cancelled":"status-cancelled",
    "No Show":"status-noshow"
  }[s] || "";
}

/* =========================
   UPDATE TRIP (FIXED)
   - keep your old logic
   - always sync dispatch after save
========================= */
function updateTrip(num, patch){
  const trips = loadCompanyTrips();
  const i = trips.findIndex(t=>t.tripNumber===num);
  if(i===-1) return;

  trips[i] = { ...trips[i], ...patch };
  saveCompanyTrips(trips);

  // ✅ مهم جدًا
  syncDispatchTrips();
}

/* =========================
   RENDER
========================= */
function render(){
  container.innerHTML = "";
  tripsView = buildViewTrips();

  const q = searchBox ? searchBox.value.trim().toLowerCase() : "";

  const filtered = tripsView.filter(t=>{
    if(!isTodayOrTomorrow(t.tripDate)) return false;
    if(!q) return true;

    return (
      (t.tripNumber||"").toLowerCase().includes(q) ||
      (t.company||"").toLowerCase().includes(q) ||
      (t.clientName||"").toLowerCase().includes(q) ||
      (t.clientPhone||"").includes(q) ||
      (t.pickup||"").toLowerCase().includes(q) ||
      (t.dropoff||"").toLowerCase().includes(q) ||
      (t.status||"").toLowerCase().includes(q)
    );
  });

  const groups = {};
  filtered.forEach(t=>{
    if(!groups[t.tripDate]) groups[t.tripDate]=[];
    groups[t.tripDate].push(t);
  });

  Object.keys(groups).sort().forEach(date=>{
    container.innerHTML += `<h3>${date}</h3>`;

    const table = document.createElement("table");
    table.innerHTML = `
      <tr>
        <th></th>
        <th>#</th>
        <th>Trip</th>
        <th>Company</th>
        <th>Client</th>
        <th>Phone</th>
        <th>Pickup</th>
        <th>Stops</th>
        <th>Dropoff</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    `;

    groups[date].forEach((t,i)=>{
      const row = document.createElement("tr");
      if(t.disabled) row.style.opacity="0.4";

      row.innerHTML = `
        <td>
          <input type="checkbox" ${t.inDispatch?"checked":""}
            ${t.disabled ? "disabled" : ""}
            onchange="toggleDispatch('${t.tripNumber}',this.checked)">
        </td>

        <td>${i+1}</td>
        <td>${t.tripNumber||""}</td>
        <td>${t.company||""}</td>

        <td><input class="edit" disabled value="${t.clientName||""}"></td>
        <td><input class="edit" disabled value="${t.clientPhone||""}"></td>
        <td><input class="edit" disabled value="${t.pickup||""}"></td>

        <td>
          <input class="edit" disabled value="${(t.stops||[]).join(" | ")}">
          <button class="btn stop" onclick="addStop('${t.tripNumber}')">+ Stop</button>
        </td>

        <td><input class="edit" disabled value="${t.dropoff||""}"></td>
        <td><input type="date" class="edit" disabled value="${t.tripDate||""}"></td>
        <td><input type="time" class="edit" disabled value="${t.tripTime||""}"></td>

        <td class="${statusClass(t.status)}">
          <select onchange="changeStatus('${t.tripNumber}',this.value)" ${t.disabled?"disabled":""}>
            ${["Booked","Scheduled","On Board","Arrived","Completed","No Show","Cancelled"]
              .map(s=>`<option ${s===t.status?"selected":""}>${s}</option>`).join("")}
          </select>
        </td>

        <td>
          <button class="btn edit" onclick="editTrip('${t.tripNumber}',this)">Edit</button>
          <button class="btn disable" onclick="toggleDisable('${t.tripNumber}')">
            ${t.disabled?"Enable":"Disable"}
          </button>
        </td>
      `;
      table.appendChild(row);
    });

    container.appendChild(table);
  });
}

/* =========================
   ACTIONS
========================= */
function toggleDispatch(num,val){
  updateTrip(num,{ inDispatch: val });
  render();
}

function toggleDisable(num){
  const t = buildViewTrips().find(x=>x.tripNumber===num);

  // ✅ لو بتعمل Disable → لازم تتشال من الديسبتش (inDispatch=false)
  // ✅ لو بتعمل Enable → ترجع عادي وممكن تختارها تاني
  updateTrip(num,{
    disabled: !t.disabled,
    inDispatch: false
  });

  render();
}

function editTrip(num,btn){
  const row = btn.closest("tr");
  const inputs = row.querySelectorAll("input.edit");

  const t = buildViewTrips().find(x=>x.tripNumber===num);
  if(t.disabled) return alert("Trip is disabled");

  if(btn.innerText==="Edit"){
    inputs.forEach(i=>i.disabled=false);
    btn.innerText="Save";
    return;
  }

  updateTrip(num,{
    clientName:inputs[0].value,
    clientPhone:inputs[1].value,
    pickup:inputs[2].value,
    stops:inputs[3].value.split("|").map(s=>s.trim()).filter(Boolean),
    dropoff:inputs[4].value,
    tripDate:inputs[5].value,
    tripTime:inputs[6].value,
    status:"Scheduled"
  });

  btn.innerText="Edit";
  render();
}

function addStop(num){
  const t = buildViewTrips().find(x=>x.tripNumber===num);
  if(t.disabled) return;

  const stops = t.stops||[];
  if(stops.length>=5) return alert("Max 5 stops");
  stops.push("New Stop");
  updateTrip(num,{stops});
  render();
}

function changeStatus(num,val){
  updateTrip(num,{status:val});
  render();
}

/* =========================
   SEARCH
========================= */
if(searchBox){
  searchBox.addEventListener("input", render);
}

/* =========================
   INIT
========================= */
syncDispatchTrips();
render();