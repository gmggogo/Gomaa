(function(){

/* =========================
   SESSION
========================= */

let driver = {};

try{
  driver =
    JSON.parse(
      localStorage.getItem("loggedDriver") || "{}"
    );
}catch{
  driver = {};
}

if(
  !driver ||
  Object.keys(driver).length === 0
){
  window.location.href = "login.html";
  return;
}

const driverId =
  driver.id ||
  driver._id;

if(!driverId){
  window.location.href = "login.html";
  return;
}

/* =========================
   ELEMENTS
========================= */

const btnToday =
  document.getElementById("btn-today");

const btnWeek =
  document.getElementById("btn-week");

const btnMonth =
  document.getElementById("btn-month");

const totalEl =
  document.getElementById("total");

const listEl =
  document.getElementById("list");

/* =========================
   FILTER
========================= */

let currentFilter = "today";

btnToday?.addEventListener(
  "click",
  ()=>setFilter("today")
);

btnWeek?.addEventListener(
  "click",
  ()=>setFilter("week")
);

btnMonth?.addEventListener(
  "click",
  ()=>setFilter("month")
);

function setActive(){

  [btnToday,btnWeek,btnMonth]
    .filter(Boolean)
    .forEach(button=>
      button.classList.remove("active")
    );

  if(currentFilter === "today"){
    btnToday?.classList.add("active");
  }

  if(currentFilter === "week"){
    btnWeek?.classList.add("active");
  }

  if(currentFilter === "month"){
    btnMonth?.classList.add("active");
  }
}

function setFilter(type){
  currentFilter = type;
  setActive();
  load();
}

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function normalizeStatus(v){
  return clean(v)
    .toLowerCase()
    .replace(/[_-]+/g," ")
    .replace(/\s+/g," ");
}

function isCompleted(trip){

  const status =
    normalizeStatus(trip?.status);

  if([
    "completed",
    "complete",
    "done"
  ].includes(status)){
    return true;
  }

  const dispatch =
    normalizeStatus(
      trip?.dispatchStatus
    );

  return [
    "completed",
    "complete"
  ].includes(dispatch);
}

function scheduledDate(trip){

  const tripDate =
    clean(
      trip?.tripDate ||
      trip?.date
    );

  const tripTime =
    clean(
      trip?.tripTime ||
      trip?.time ||
      "00:00"
    );

  if(!tripDate){
    return null;
  }

  const d =
    new Date(
      `${tripDate}T${tripTime}`
    );

  if(Number.isNaN(d.getTime())){
    return null;
  }

  return d;
}

function startOfToday(){

  const d = new Date();
  d.setHours(0,0,0,0);

  return d;
}

function endOfToday(){

  const d = new Date();
  d.setHours(23,59,59,999);

  return d;
}

function weekRange(){

  const now = new Date();

  const start = new Date(now);
  start.setHours(0,0,0,0);

  /*
    Same calendar logic as Trip History:
    Sunday -> Saturday.
  */
  start.setDate(
    start.getDate() -
    start.getDay()
  );

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23,59,59,999);

  return {start,end};
}

function monthRange(){

  const now = new Date();

  const start =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

  const end =
    new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,59,59,999
    );

  return {start,end};
}

function selectedRange(){

  if(currentFilter === "today"){
    return {
      start:startOfToday(),
      end:endOfToday()
    };
  }

  if(currentFilter === "week"){
    return weekRange();
  }

  return monthRange();
}

function inSelectedRange(date){

  if(!date){
    return false;
  }

  const {start,end} =
    selectedRange();

  return (
    date >= start &&
    date <= end
  );
}

function dateKey(date){

  const y = date.getFullYear();

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

function formatDay(date){

  return date.toLocaleDateString(
    undefined,
    {
      weekday:"long",
      month:"short",
      day:"numeric",
      year:"numeric"
    }
  );
}

function formatShortDate(date){

  return date.toLocaleDateString(
    undefined,
    {
      month:"short",
      day:"numeric",
      year:"numeric"
    }
  );
}

function formatTime(date){

  return date.toLocaleTimeString(
    undefined,
    {
      hour:"numeric",
      minute:"2-digit"
    }
  );
}

function periodLabel(){

  const {start,end} =
    selectedRange();

  if(currentFilter === "today"){
    return formatShortDate(start);
  }

  return (
    `${formatShortDate(start)} – ` +
    `${formatShortDate(end)}`
  );
}

function escapeHtml(value){

  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* =========================
   LOAD
========================= */

async function load(){

  totalEl.innerHTML = "Loading...";
  listEl.innerHTML = "";

  try{

    /*
      Work Hours now reads the same final-trip capable
      driver endpoint used by Trip History.

      We still count COMPLETED only because cancelled /
      no-show trips are history records, not completed
      working trips for this screen.
    */
    const res =
      await fetch(
        `/api/driver/my-trips/${encodeURIComponent(driverId)}?includeFinal=true`
      );

    if(!res.ok){
      throw new Error(
        `HTTP ${res.status}`
      );
    }

    const data =
      await res.json();

    const rawTrips =
      Array.isArray(data)
        ? data
        : (
            Array.isArray(data?.trips)
              ? data.trips
              : []
          );

    const trips =
      rawTrips
      .filter(isCompleted)
      .map(trip=>({
        trip,
        date:scheduledDate(trip)
      }))
      .filter(item=>
        item.date &&
        inSelectedRange(item.date)
      )
      .sort(
        (a,b)=>
          a.date.getTime() -
          b.date.getTime()
      );

    render(trips);

  }catch(err){

    console.error(
      "WORK HOURS LOAD ERROR:",
      err
    );

    totalEl.innerHTML = `
      <div class="summary-label">
        WORK HOURS
      </div>
      <div class="summary-period">
        ${escapeHtml(periodLabel())}
      </div>
    `;

    listEl.innerHTML = `
      <div class="error-state">
        Unable to load work hours.
      </div>
    `;
  }
}

/* =========================
   RENDER
========================= */

function render(items){

  const groups = {};

  items.forEach(item=>{

    const key =
      dateKey(item.date);

    if(!groups[key]){
      groups[key] = [];
    }

    groups[key].push(item);
  });

  let totalHours = 0;

  const renderedDays = [];

  Object.keys(groups)
    .sort((a,b)=>
      b.localeCompare(a)
    )
    .forEach(key=>{

      const dayItems =
        groups[key]
        .slice()
        .sort(
          (a,b)=>
            a.date.getTime() -
            b.date.getTime()
        );

      const start =
        new Date(
          dayItems[0].date
        );

      /*
        Preserve the existing Work Hours rule:
        the working day ends 30 minutes after
        the final completed trip's scheduled time.
      */
      const end =
        new Date(
          dayItems[
            dayItems.length - 1
          ].date
        );

      end.setMinutes(
        end.getMinutes() + 30
      );

      const hours =
        Math.max(
          0,
          (end - start) / 3600000
        );

      totalHours += hours;

      renderedDays.push({
        key,
        date:start,
        trips:dayItems.length,
        start,
        end,
        hours
      });
    });

  totalEl.innerHTML = `
    <div class="summary-label">
      ${currentFilter === "today"
        ? "TODAY"
        : currentFilter === "week"
          ? "THIS WEEK"
          : "THIS MONTH"}
    </div>

    <div class="summary-period">
      ${escapeHtml(periodLabel())}
    </div>

    <div class="summary-grid">

      <div class="summary-stat">
        <span class="summary-number">
          ${totalHours.toFixed(2)}
        </span>
        <span class="summary-name">
          Total Hours
        </span>
      </div>

      <div class="summary-stat">
        <span class="summary-number">
          ${items.length}
        </span>
        <span class="summary-name">
          Completed Trips
        </span>
      </div>

    </div>
  `;

  if(!renderedDays.length){

    listEl.innerHTML = `
      <div class="empty-state">
        No completed trips for this period.
      </div>
    `;

    return;
  }

  listEl.innerHTML =
    renderedDays
    .map(day=>`
      <section class="day-section">

        <div class="day-heading">
          ${escapeHtml(
            formatDay(day.date)
          )}
        </div>

        <article class="hours-card">

          <div class="hours-card-top">

            <div class="trip-count">
              ${day.trips}
              ${day.trips === 1
                ? "Completed Trip"
                : "Completed Trips"}
            </div>

            <div class="hours-badge">
              ${day.hours.toFixed(2)} HRS
            </div>

          </div>

          <div class="time-row">
            <span class="time-label">
              FROM
            </span>
            <span class="time-value">
              ${escapeHtml(
                formatTime(day.start)
              )}
            </span>
          </div>

          <div class="time-row">
            <span class="time-label">
              TO
            </span>
            <span class="time-value">
              ${escapeHtml(
                formatTime(day.end)
              )}
            </span>
          </div>

        </article>

      </section>
    `)
    .join("");
}

/* =========================
   INIT
========================= */

setActive();
load();

})();