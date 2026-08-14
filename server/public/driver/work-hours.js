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
    .forEach(
      button=>
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
    .toUpperCase()
    .replace(/[\s_-]+/g,"");
}

function getStatus(trip){

  const s =
    normalizeStatus(
      trip?.status
    );

  return (
    s ||
    normalizeStatus(
      trip?.dispatchStatus
    )
  );
}

function isCancelled(trip){

  const s =
    getStatus(trip);

  return (
    s === "CANCELLED" ||
    s === "CANCELED"
  );
}

function isNotCompleted(trip){
  return getStatus(trip) === "NOTCOMPLETED";
}

function isNoShow(trip){
  return getStatus(trip) === "NOSHOW";
}

function isCompleted(trip){
  return getStatus(trip) === "COMPLETED";
}

function isActiveTrip(trip){

  const s =
    getStatus(trip);

  return [
    "ONTRIP",
    "INPROGRESS",
    "ARRIVED",
    "ACCEPTED",
    "SENT",
    "ASSIGNED",
    "SCHEDULED",
    "CONFIRMED"
  ].includes(s);
}

/* =========================
   TRIP TIMES
========================= */

function scheduledDate(trip){

  const d =
    clean(
      trip?.tripDate ||
      trip?.date
    );

  const t =
    clean(
      trip?.tripTime ||
      trip?.time ||
      "00:00"
    );

  if(!d){
    return null;
  }

  const date =
    new Date(
      `${d}T${t}`
    );

  if(
    Number.isNaN(
      date.getTime()
    )
  ){
    return null;
  }

  return date;
}

function finalMoment(trip){

  const candidates = [
    trip?.historyAt,
    trip?.finalizedAt,
    trip?.finalStatusConfirmedAt,
    trip?.sharedFinalConfirmedAt,
    trip?.dispatchFinalConfirmedAt,
    trip?.cancelDateTime
  ];

  for(const value of candidates){

    if(!value){
      continue;
    }

    const d =
      new Date(value);

    if(
      !Number.isNaN(
        d.getTime()
      )
    ){
      return d;
    }
  }

  return null;
}

/* =========================
   PERIODS
========================= */

function startOfToday(){

  const d =
    new Date();

  d.setHours(
    0,0,0,0
  );

  return d;
}

function endOfToday(){

  const d =
    new Date();

  d.setHours(
    23,59,59,999
  );

  return d;
}

function weekRange(){

  const now =
    new Date();

  const start =
    new Date(now);

  start.setHours(
    0,0,0,0
  );

  start.setDate(
    start.getDate() -
    start.getDay()
  );

  const end =
    new Date(start);

  end.setDate(
    end.getDate() + 6
  );

  end.setHours(
    23,59,59,999
  );

  return {
    start,
    end
  };
}

function monthRange(){

  const now =
    new Date();

  return {

    start:
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      ),

    end:
      new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,59,59,999
      )
  };
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

/* =========================
   FORMAT
========================= */

function dateKey(date){

  const y =
    date.getFullYear();

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

function isTodayKey(key){
  return key === dateKey(new Date());
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

function escapeHtml(v){

  return String(v ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* =========================
   WORK HOURS ENGINE
========================= */

/*
  RULE:
  - Start = first pickup time of the day.
  - Time between trips counts.
  - If the driver is still working, count until NOW.
  - When the work day ends, stop at the actual final time
    of the last worked trip.
  - No Completed Trips counter.
*/

function buildWorkDay(
  dayItems,
  key
){

  const now =
    new Date();

  const workable =
    dayItems.filter(
      item=>
        !isCancelled(
          item.trip
        ) &&
        !isNotCompleted(
          item.trip
        )
    );

  if(!workable.length){
    return null;
  }

  workable.sort(
    (a,b)=>
      a.scheduled -
      b.scheduled
  );

  const start =
    new Date(
      workable[0].scheduled
    );

  if(
    isTodayKey(key) &&
    now < start
  ){
    return null;
  }

  const finalTimes =
    workable
      .map(item=>{

        if(
          isCompleted(
            item.trip
          ) ||
          isNoShow(
            item.trip
          )
        ){
          return finalMoment(
            item.trip
          );
        }

        return null;
      })
      .filter(Boolean);

  const hasOpenWork =
    workable.some(
      item=>
        isActiveTrip(
          item.trip
        ) &&
        item.scheduled <= now
    );

  let end = null;
  let running = false;

  if(
    isTodayKey(key) &&
    hasOpenWork
  ){

    end = now;
    running = true;

  }else if(
    finalTimes.length
  ){

    end =
      new Date(
        Math.max(
          ...finalTimes.map(
            d=>d.getTime()
          )
        )
      );
  }

  if(
    !end ||
    end < start
  ){
    return null;
  }

  return {
    key,
    date:start,
    start,
    end,
    hours:
      (end - start) /
      3600000,
    running
  };
}

/* =========================
   LOAD
========================= */

async function load(){

  totalEl.innerHTML =
    "Loading...";

  listEl.innerHTML =
    "";

  try{

    const res =
      await fetch(
        `/api/driver/my-trips/${encodeURIComponent(driverId)}?includeFinal=true`,
        {
          cache:"no-store"
        }
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
            Array.isArray(
              data?.trips
            )
              ? data.trips
              : []
          );

    const items =
      rawTrips
        .map(
          trip=>({
            trip,
            scheduled:
              scheduledDate(trip)
          })
        )
        .filter(
          item=>
            item.scheduled &&
            inSelectedRange(
              item.scheduled
            )
        )
        .sort(
          (a,b)=>
            a.scheduled -
            b.scheduled
        );

    render(items);

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
        ${escapeHtml(
          periodLabel()
        )}
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

  items.forEach(
    item=>{

      const key =
        dateKey(
          item.scheduled
        );

      if(!groups[key]){
        groups[key] = [];
      }

      groups[key].push(
        item
      );
    }
  );

  const workDays =
    Object.keys(groups)
      .sort(
        (a,b)=>
          b.localeCompare(a)
      )
      .map(
        key=>
          buildWorkDay(
            groups[key],
            key
          )
      )
      .filter(Boolean);

  const totalHours =
    workDays.reduce(
      (sum,day)=>
        sum + day.hours,
      0
    );

  totalEl.innerHTML = `
    <div class="summary-label">
      ${
        currentFilter === "today"
          ? "TODAY"
          : currentFilter === "week"
            ? "THIS WEEK"
            : "THIS MONTH"
      }
    </div>

    <div class="summary-period">
      ${escapeHtml(
        periodLabel()
      )}
    </div>

    <div class="total-hours-box">

      <span class="total-hours-number">
        ${totalHours.toFixed(2)}
      </span>

      <span class="total-hours-label">
        Total Hours
      </span>

    </div>
  `;

  if(!workDays.length){

    listEl.innerHTML = `
      <div class="empty-state">
        No work hours for this period.
      </div>
    `;

    return;
  }

  listEl.innerHTML =
    workDays
      .map(
        day=>`

          <section class="day-section">

            <div class="day-heading">
              ${escapeHtml(
                formatDay(
                  day.date
                )
              )}
            </div>

            <article class="hours-card">

              <div class="hours-row">

                <div class="time-block">

                  <span class="time-label">
                    FROM
                  </span>

                  <span class="time-value">
                    ${escapeHtml(
                      formatTime(
                        day.start
                      )
                    )}
                  </span>

                </div>

                <div class="time-block">

                  <span class="time-label">
                    TO
                  </span>

                  <span class="time-value">
                    ${
                      day.running
                        ? "NOW"
                        : escapeHtml(
                            formatTime(
                              day.end
                            )
                          )
                    }
                  </span>

                </div>

                <div class="hours-badge">
                  ${day.hours.toFixed(2)} HRS
                </div>

              </div>

              ${
                day.running
                  ? `
                    <div class="running-note">
                      WORK DAY ACTIVE
                    </div>
                  `
                  : ""
              }

            </article>

          </section>

        `
      )
      .join("");
}

/* =========================
   START
========================= */

setActive();
load();

setInterval(
  load,
  60000
);

})();