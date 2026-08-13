(function(){

  if(window.SUNBEAM_TRIP_HISTORY){
    return;
  }

  window.SUNBEAM_TRIP_HISTORY = true;

  /* =========================
     HELPERS
  ========================= */

  function clean(v){
    return String(v ?? "").trim();
  }

  function safeParse(v,fallback=null){
    try{
      return JSON.parse(v);
    }catch{
      return fallback;
    }
  }

  function normalizeStatus(v){
    return clean(v)
      .toLowerCase()
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function escapeHtml(v){
    return clean(v)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function startOfDay(d){
    const x = new Date(d);
    x.setHours(0,0,0,0);
    return x;
  }

  function endOfDay(d){
    const x = new Date(d);
    x.setHours(23,59,59,999);
    return x;
  }

  function startOfWeekSunday(d){
    const x = startOfDay(d);
    x.setDate(x.getDate() - x.getDay());
    return x;
  }

  function endOfWeekSaturday(d){
    const x = startOfWeekSunday(d);
    x.setDate(x.getDate() + 6);
    return endOfDay(x);
  }

  function startOfMonth(d){
    return new Date(
      d.getFullYear(),
      d.getMonth(),
      1,
      0,0,0,0
    );
  }

  function endOfMonth(d){
    return new Date(
      d.getFullYear(),
      d.getMonth()+1,
      0,
      23,59,59,999
    );
  }

  function threeMonthCutoff(now){
    const d = startOfDay(now);
    d.setMonth(d.getMonth() - 3);
    return d;
  }

  function formatShortDate(d){
    return new Intl.DateTimeFormat(
      "en-US",
      {
        month:"short",
        day:"numeric",
        year:"numeric"
      }
    ).format(d);
  }

  function formatDayHeading(d){
    return new Intl.DateTimeFormat(
      "en-US",
      {
        weekday:"long",
        month:"short",
        day:"numeric",
        year:"numeric"
      }
    ).format(d);
  }

  function formatTimeFromTrip(trip,tripDate){

    const raw = clean(
      trip?.tripTime ||
      trip?.time ||
      trip?.pickupTime
    );

    if(raw){

      const m =
        raw.match(/^(\d{1,2}):(\d{2})/);

      if(m){

        let h = Number(m[1]);
        const min = m[2];
        const suffix = h >= 12 ? "PM" : "AM";

        h = h % 12;
        if(h === 0) h = 12;

        return `${h}:${min} ${suffix}`;
      }

      return raw;
    }

    if(tripDate){
      return new Intl.DateTimeFormat(
        "en-US",
        {
          hour:"numeric",
          minute:"2-digit",
          hour12:true
        }
      ).format(tripDate);
    }

    return "--";
  }

  /* =========================
     DRIVER
  ========================= */

  const driver =
    safeParse(
      localStorage.getItem("loggedDriver"),
      {}
    ) || {};

  const DRIVER_ID =
    clean(
      driver?._id ||
      driver?.id
    );

  if(!DRIVER_ID){
    window.location.href = "login.html";
    return;
  }

  /* =========================
     STATUS
  ========================= */

  function finalStatus(trip){

    const raw =
      normalizeStatus(
        trip?.dispatchStatus ||
        trip?.status ||
        trip?.passengerStatus
      );

    if([
      "completed",
      "complete",
      "done"
    ].includes(raw)){
      return "COMPLETED";
    }

    if([
      "no show",
      "noshow"
    ].includes(raw)){
      return "NO SHOW";
    }

    if([
      "cancelled",
      "canceled",
      "cancel"
    ].includes(raw)){
      return "CANCELLED";
    }

    if([
      "not completed",
      "notcompleted"
    ].includes(raw)){
      return "NOT COMPLETED";
    }

    /*
      Shared trip fallback:
      if all passengers are terminal, derive a final trip state.
    */
    const passengers =
      Array.isArray(trip?.passengers)
        ? trip.passengers
        : [];

    if(passengers.length){

      const statuses =
        passengers.map(p=>
          normalizeStatus(p?.status)
        );

      const allTerminal =
        statuses.every(s=>
          [
            "completed",
            "cancelled",
            "canceled",
            "no show",
            "noshow"
          ].includes(s)
        );

      if(allTerminal){

        if(statuses.some(s=>s === "completed")){
          return "COMPLETED";
        }

        if(
          statuses.every(
            s=>["no show","noshow"].includes(s)
          )
        ){
          return "NO SHOW";
        }

        return "CANCELLED";
      }
    }

    return "";
  }

  function statusClass(status){

    if(status === "COMPLETED"){
      return "completed";
    }

    if(status === "NO SHOW"){
      return "no-show";
    }

    if(status === "CANCELLED"){
      return "cancelled";
    }

    return "not-completed";
  }

  /* =========================
     TRIP DATE
  ========================= */

  function parseTripDate(trip){

    const directCandidates = [
      trip?.tripDateTime,
      trip?.scheduledAt,
      trip?.pickupDateTime,
      trip?.finalStatusAt,
      trip?.completedAt,
      trip?.updatedAt
    ];

    for(const value of directCandidates){

      if(!value){
        continue;
      }

      const d = new Date(value);

      if(!Number.isNaN(d.getTime())){
        return d;
      }
    }

    const tripDate =
      clean(
        trip?.tripDate ||
        trip?.date
      );

    const tripTime =
      clean(
        trip?.tripTime ||
        trip?.time ||
        "12:00"
      );

    if(tripDate){

      const d =
        new Date(
          `${tripDate}T${tripTime}`
        );

      if(!Number.isNaN(d.getTime())){
        return d;
      }
    }

    return null;
  }

  function dayKey(date){
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,"0");
    const d = String(date.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }

  /* =========================
     CLIENT NAME
  ========================= */

  function tripClientName(trip){

    const direct =
      clean(
        trip?.clientName ||
        trip?.passengerName ||
        trip?.memberName ||
        trip?.patientName
      );

    if(direct){
      return direct;
    }

    const passengers =
      Array.isArray(trip?.passengers)
        ? trip.passengers
        : [];

    if(passengers.length === 1){
      return clean(
        passengers[0]?.clientName ||
        passengers[0]?.passengerName ||
        passengers[0]?.memberName ||
        passengers[0]?.patientName ||
        passengers[0]?.name ||
        "Passenger"
      );
    }

    if(passengers.length > 1){
      return `Shared Trip • ${passengers.length} Passengers`;
    }

    return "Passenger";
  }

  /* =========================
     API
  ========================= */

  async function fetchJson(url){

    const res =
      await fetch(
        url,
        { cache:"no-store" }
      );

    if(!res.ok){
      throw new Error(
        `HTTP ${res.status}`
      );
    }

    return await res.json();
  }

  function extractTrips(data){

    if(Array.isArray(data)){
      return data;
    }

    const candidates = [
      data?.trips,
      data?.items,
      data?.data,
      data?.results
    ];

    for(const value of candidates){
      if(Array.isArray(value)){
        return value;
      }
    }

    return [];
  }

  async function loadTrips(){

    /*
      First choice: existing driver trip feed.
      Second choice: general trips endpoint filtered by driver.
      No data is copied or moved; this page only reads saved trips.
    */
    const urls = [
      `/api/driver/my-trips/${encodeURIComponent(DRIVER_ID)}?includeFinal=true`,
      `/api/trips?driverId=${encodeURIComponent(DRIVER_ID)}`
    ];

    let lastError = null;

    for(const url of urls){

      try{

        const data =
          await fetchJson(url);

        const trips =
          extractTrips(data);

        if(trips.length){
          return trips;
        }

      }catch(err){
        lastError = err;
      }
    }

    if(lastError){
      throw lastError;
    }

    return [];
  }

  /* =========================
     FILTER
  ========================= */

  function prepareHistory(rawTrips){

    const now = new Date();
    const cutoff = threeMonthCutoff(now);

    return rawTrips
      .map(trip=>{

        const status =
          finalStatus(trip);

        const date =
          parseTripDate(trip);

        return {
          trip,
          status,
          date
        };
      })
      .filter(item=>
        item.status &&
        item.date &&
        item.date >= cutoff &&
        item.date <= now
      )
      .sort((a,b)=>
        b.date - a.date
      );
  }

  /* =========================
     SUMMARY
  ========================= */

  function setText(id,value){
    const el =
      document.getElementById(id);

    if(el){
      el.textContent = value;
    }
  }

  function between(date,start,end){
    return date >= start && date <= end;
  }

  function renderSummary(items){

    const now = new Date();

    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const weekStart = startOfWeekSunday(now);
    const weekEnd = endOfWeekSaturday(now);

    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const todayCount =
      items.filter(x=>
        between(
          x.date,
          todayStart,
          todayEnd
        )
      ).length;

    const weekCount =
      items.filter(x=>
        between(
          x.date,
          weekStart,
          weekEnd
        )
      ).length;

    const monthCount =
      items.filter(x=>
        between(
          x.date,
          monthStart,
          monthEnd
        )
      ).length;

    setText("todayCount",todayCount);
    setText("weekCount",weekCount);
    setText("monthCount",monthCount);

    setText(
      "todayRange",
      formatShortDate(now)
    );

    setText(
      "weekRange",
      `${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}`
    );

    setText(
      "monthRange",
      `${formatShortDate(monthStart)} – ${formatShortDate(monthEnd)}`
    );
  }

  /* =========================
     GROUPS
  ========================= */

  function renderGroups(items){

    const state =
      document.getElementById("historyState");

    const root =
      document.getElementById("historyGroups");

    if(!root){
      return;
    }

    if(!items.length){

      if(state){
        state.className = "history-empty";
        state.textContent =
          "No final trips found in the last 3 months.";
      }

      root.innerHTML = "";
      return;
    }

    if(state){
      state.style.display = "none";
    }

    const groups =
      new Map();

    for(const item of items){

      const key =
        dayKey(item.date);

      if(!groups.has(key)){
        groups.set(
          key,
          {
            date:item.date,
            items:[]
          }
        );
      }

      groups.get(key)
        .items
        .push(item);
    }

    root.innerHTML =
      Array.from(groups.values())
      .map(group=>{

        const cards =
          group.items
          .map(({trip,status,date})=>{

            const tripNumber =
              clean(
                trip?.tripNumber ||
                trip?.tripNo ||
                trip?._id ||
                "Trip"
              );

            const client =
              tripClientName(trip);

            const time =
              formatTimeFromTrip(
                trip,
                date
              );

            return `
              <article class="history-trip-card">

                <div class="history-trip-top">

                  <div class="history-trip-number">
                    TRIP # ${escapeHtml(tripNumber)}
                  </div>

                  <div class="history-status ${statusClass(status)}">
                    ${escapeHtml(status)}
                  </div>

                </div>

                <div class="history-trip-name">
                  ${escapeHtml(client)}
                </div>

                <div class="history-trip-meta">

                  <span class="history-trip-date">
                    ${escapeHtml(formatShortDate(date))}
                  </span>

                  <span class="history-trip-time">
                    ${escapeHtml(time)}
                  </span>

                </div>

              </article>
            `;
          })
          .join("");

        return `
          <section class="history-day">

            <h2 class="history-day-title">
              ${escapeHtml(formatDayHeading(group.date))}
            </h2>

            <div class="history-day-list">
              ${cards}
            </div>

          </section>
        `;
      })
      .join("");
  }

  /* =========================
     INIT
  ========================= */

  async function init(){

    const state =
      document.getElementById("historyState");

    try{

      const rawTrips =
        await loadTrips();

      const items =
        prepareHistory(rawTrips);

      renderSummary(items);
      renderGroups(items);

    }catch(err){

      console.log(
        "TRIP HISTORY ERROR:",
        err
      );

      if(state){
        state.className =
          "history-error";

        state.textContent =
          "Unable to load trip history.";
      }
    }
  }

  if(
    document.readyState === "loading"
  ){
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  }else{
    init();
  }

})();