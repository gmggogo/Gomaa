window.addEventListener("DOMContentLoaded", () => {

const container = document.getElementById("tripsContainer");

// ✅ هات الرحلات
let trips = JSON.parse(localStorage.getItem("trips")) || [];

// ✅ لو عندك شركة مسجلة، فلتر الرحلات بتاعتها بس
let loggedCompany = null;
try { loggedCompany = JSON.parse(localStorage.getItem("loggedCompany")); } catch {}

if(loggedCompany && loggedCompany.name){
  trips = trips.filter(t => (t.type === "Company" || t.company) && (t.company === loggedCompany.name));
}

// ================= CLOCK =================
function updateClock(){
  const el = document.getElementById("azDateTime");
  if(!el) return;

  el.innerText =
    new Intl.DateTimeFormat("en-US",{
      timeZone:"America/Phoenix",
      year:"numeric",month:"short",day:"2-digit",
      hour:"2-digit",minute:"2-digit",second:"2-digit"
    }).format(new Date());
}
setInterval(updateClock,1000);
updateClock();

// ================= GREETING =================
const g = document.getElementById("greetingText");
if(g){
  const h = new Date().getHours();
  g.innerText = h<12?"Good Morning ☀️":h<18?"Good Afternoon 🌤":"Good Evening 🌙";
}

// ================= TIME HELPERS =================
function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"}));
}
function getTripDT(t){
  if(!t.tripDate || !t.tripTime) return null;
  return new Date(t.tripDate + "T" + t.tripTime);
}
function minutesToTrip(t){
  const dt = getTripDT(t);
  if(!dt) return null;
  return (dt - getAZNow()) / 60000;
}
function isWithin120(t){
  const mins = minutesToTrip(t);
  return mins !== null && mins > 0 && mins <= 120;
}
function tripPassed(t){
  const mins = minutesToTrip(t);
  return mins !== null && mins <= 0;
}

// ================= KEEP 30 DAYS =================
function keep30Days(){
  const now = new Date();
  trips = trips.filter(t=>{
    if(!t.createdAt) return true;
    return (now - new Date(t.createdAt)) / (1000*60*60*24) <= 30;
  });
}

// ================= GROUP BY CREATED DATE =================
function groupByCreated(){
  const groups = {};
  trips.forEach((t, realIndex)=>{
    const d = new Date(t.createdAt || Date.now()).toLocaleDateString();
    if(!groups[d]) groups[d] = [];
    groups[d].push({ trip: t, idx: realIndex });
  });
  return groups;
}

// ================= SAVE =================
function saveAll(){
  // ✅ مهم: احفظ كل trips (مش اللي فلترتها بس) لو انت فلترت
  // علشان ما تمسحش رحلات شركات تانية
  const all = JSON.parse(localStorage.getItem("trips") || "[]");

  // لو مفيش loggedCompany هنسيف مباشر
  if(!loggedCompany || !loggedCompany.name){
    localStorage.setItem("trips", JSON.stringify(trips));
    return;
  }

  // لو في شركة: هنحدّث رحلات الشركة دي فقط داخل all
  const updated = all.map(x=>{
    if(x.company === loggedCompany.name){
      // هنستبدلها بالنسخة من trips لو نفس tripNumber
      const found = trips.find(t=>t.tripNumber === x.tripNumber);
      return found ? found : x;
    }
    return x;
  });

  // ولو في trips جديدة مش موجودة في all
  trips.forEach(t=>{
    const exists = updated.some(x=>x.tripNumber === t.tripNumber);
    if(!exists) updated.push(t);
  });

  localStorage.setItem("trips", JSON.stringify(updated));
}

// ================= RENDER =================
function render(){
  container.innerHTML = "";
  keep30Days();

  const groups = groupByCreated();

  Object.keys(groups)
    .sort((a,b)=> new Date(b) - new Date(a))
    .forEach(date=>{

      const title = document.createElement("div");
      title.className = "date-title";
      title.innerText = date;
      container.appendChild(title);

      const table = document.createElement("table");

      table.innerHTML = `
      <tr>
        <th>#</th>
        <th>Trip#</th>
        <th>Entered By</th>
        <th>Entered Phone</th>
        <th>Client</th>
        <th>Phone</th>
        <th>Pickup</th>
        <th>Drop</th>
        <th>Stops</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>`;

      groups[date].forEach((rowObj, rowIndex)=>{

        const t = rowObj.trip;
        const realIndex = rowObj.idx;

        const tr = document.createElement("tr");
        tr.dataset.idx = String(realIndex);

        const mins = minutesToTrip(t);
        if(mins>0 && mins<=120) tr.classList.add("yellow");
        if(mins!==null && mins<=0) tr.classList.add("red");

        const editing = t.editing === true;

        function cell(val, cls, type="text"){
          if(!editing) return (val || "");
          return `<input type="${type}" class="edit-input ${cls}" value="${val || ""}">`;
        }

        const enteredByVal = t.enteredBy || t.entryName || "";
        const enteredPhoneVal = t.enteredPhone || t.entryPhone || "";

        let actions = "";

        // ✅ قوانينك
        // لو داخل 120 دقيقة: ممنوع Edit/Delete/Confirm (ويبقى Cancel بس) — سواء Scheduled أو Confirmed
        if(isWithin120(t)){
          actions = `<button class="btn cancel" data-action="cancel">Cancel</button>`;
        }else{
          // خارج 120
          if(t.status === "Confirmed"){
            actions = `<button class="btn cancel" data-action="cancel">Cancel</button>`;
          }else{
            actions = `
              <button class="btn edit" data-action="edit">${editing ? "Save" : "Edit"}</button>
              <button class="btn delete" data-action="delete">Delete</button>
              <button class="btn confirm" data-action="confirm">Confirm</button>
            `;
          }
        }

        tr.innerHTML = `
          <td>${rowIndex + 1}</td>
          <td>${t.tripNumber || ""}</td>
          <td>${cell(enteredByVal, "enteredBy")}</td>
          <td>${cell(enteredPhoneVal, "enteredPhone")}</td>
          <td>${cell(t.clientName, "clientName")}</td>
          <td>${cell(t.clientPhone, "clientPhone")}</td>
          <td>${cell(t.pickup, "pickup")}</td>
          <td>${cell(t.dropoff, "dropoff")}</td>
          <td>${Array.isArray(t.stops) ? t.stops.join(" | ") : ""}</td>
          <td>${cell(t.tripDate, "tripDate", "date")}</td>
          <td>${cell(t.tripTime, "tripTime", "time")}</td>
          <td>${t.status || "Scheduled"}</td>
          <td>${actions}</td>
        `;

        table.appendChild(tr);
      });

      container.appendChild(table);
    });
}

// ================= EVENT DELEGATION (NO BUGS) =================
container.addEventListener("click", (e)=>{
  const btn = e.target.closest("button");
  if(!btn) return;

  const tr = e.target.closest("tr");
  if(!tr) return;

  const idx = parseInt(tr.dataset.idx || "-1", 10);
  if(idx < 0 || !trips[idx]) return;

  const action = btn.dataset.action;
  const t = trips[idx];

  // ===== CONFIRM =====
  if(action === "confirm"){
    t.status = "Confirmed";
    t.editing = false;
    saveAll();
    render();
    return;
  }

  // ===== CANCEL =====
  if(action === "cancel"){
    if(confirm("Are you sure you want to cancel this trip?")){
      t.status = "Cancelled";
      t.editing = false;
      saveAll();
      render();
    }
    return;
  }

  // ===== DELETE =====
  if(action === "delete"){
    if(confirm("Delete this trip?")){
      trips.splice(idx, 1);
      saveAll();
      render();
    }
    return;
  }

  // ===== EDIT / SAVE =====
  if(action === "edit"){

    // أول ضغط = يدخل وضع edit
    if(!t.editing){
      t.editing = true;
      render();
      return;
    }

    // وهو بيعمل Save: لازم نجيب القيم من نفس الصف
    const row = tr;

    const newDate = row.querySelector(".tripDate")?.value || t.tripDate;
    const newTime = row.querySelector(".tripTime")?.value || t.tripTime;

    const temp = { ...t, tripDate: newDate, tripTime: newTime };

    // ✅ تحذير 120 دقيقة عند الحفظ لو التعديل دخّلها 120
    if(isWithin120(temp)){
      const ok = confirm("WARNING:\nThis trip is within 120 minutes.\nAre you sure you want to modify it?");
      if(!ok) return;
    }

    t.enteredBy    = row.querySelector(".enteredBy")?.value || t.enteredBy || t.entryName || "";
    t.enteredPhone = row.querySelector(".enteredPhone")?.value || t.enteredPhone || t.entryPhone || "";
    t.clientName   = row.querySelector(".clientName")?.value || t.clientName;
    t.clientPhone  = row.querySelector(".clientPhone")?.value || t.clientPhone;
    t.pickup       = row.querySelector(".pickup")?.value || t.pickup;
    t.dropoff      = row.querySelector(".dropoff")?.value || t.dropoff;
    t.tripDate     = newDate;
    t.tripTime     = newTime;

    t.status = "Scheduled"; // ✅ زي قانونك: بعد التعديل يرجع Scheduled
    t.editing = false;

    saveAll();
    render();
    return;
  }
});

render();

});