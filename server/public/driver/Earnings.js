(function(){

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

function token(){
  return String(
    localStorage.getItem("driverToken") ||
    localStorage.getItem("token") ||
    driver?.token ||
    ""
  ).trim();
}

function dateKey(date){
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function formatMoney(value){
  return new Intl.NumberFormat(
    "en-US",
    {
      style:"currency",
      currency:"USD"
    }
  ).format(Number(value || 0));
}

function formatHours(value){
  return Number(value || 0).toFixed(2);
}

function formatDate(value){
  const d = new Date(`${value}T12:00:00`);

  if(Number.isNaN(d.getTime())){
    return value;
  }

  return d.toLocaleDateString(
    undefined,
    {
      weekday:"short",
      month:"short",
      day:"numeric",
      year:"numeric"
    }
  );
}

let filter = "today";

function range(){
  const now = new Date();

  if(filter === "today"){
    const key = dateKey(now);

    return {
      from:key,
      to:key
    };
  }

  if(filter === "week"){
    const start = new Date(now);

    start.setDate(
      start.getDate() -
      start.getDay()
    );

    const end = new Date(start);
    end.setDate(end.getDate()+6);

    return {
      from:dateKey(start),
      to:dateKey(end)
    };
  }

  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  const end = new Date(
    now.getFullYear(),
    now.getMonth()+1,
    0
  );

  return {
    from:dateKey(start),
    to:dateKey(end)
  };
}

function setActive(){
  ["today","week","month"]
  .forEach(name=>{
    document.getElementById(`btn-${name}`)
      ?.classList.toggle(
        "active",
        filter === name
      );
  });
}

async function load(){
  const {from,to} = range();

  document.getElementById("periodLabel")
    .textContent = `${from} → ${to}`;

  document.getElementById("list")
    .innerHTML = `<div class="empty">Loading...</div>`;

  try{
    const query = new URLSearchParams({
      from,
      to
    });

    const res = await fetch(
      `/api/payroll/me?${query.toString()}`,
      {
        cache:"no-store",
        headers:{
          Authorization:`Bearer ${token()}`
        }
      }
    );

    const data = await res.json();

    if(!res.ok){
      throw new Error(
        data.message ||
        `HTTP ${res.status}`
      );
    }

    render(data.earnings || {});

  }catch(err){
    console.error(err);

    document.getElementById("list")
      .innerHTML =
        `<div class="error">${err.message}</div>`;
  }
}

function render(data){
  document.getElementById("totalDue")
    .textContent = formatMoney(data.totalDue);

  document.getElementById("totalHours")
    .textContent = formatHours(data.totalHours);

  document.getElementById("regularHours")
    .textContent = formatHours(data.regularHours);

  document.getElementById("overtimeHours")
    .textContent = formatHours(data.overtimeHours);

  document.getElementById("paymentStatus")
    .textContent = data.paymentStatus || "UNPAID";

  document.getElementById("hourlyRate")
    .textContent = formatMoney(data.hourlyRate);

  document.getElementById("overtimeRate")
    .textContent = formatMoney(data.overtimeRate);

  const daily =
    Array.isArray(data.dailyHours)
      ? data.dailyHours
      : [];

  if(!daily.length){
    document.getElementById("list")
      .innerHTML =
        `<div class="empty">No work hours for this period.</div>`;
    return;
  }

  document.getElementById("list")
    .innerHTML =
      daily
        .slice()
        .reverse()
        .map(row=>`
          <article class="day-card">

            <div>
              <div class="day-date">
                ${formatDate(row.date)}
              </div>

              ${
                row.running
                  ? `<div class="running">WORK DAY ACTIVE</div>`
                  : ""
              }
            </div>

            <div class="day-hours">
              ${formatHours(row.hours)} HRS
            </div>

          </article>
        `)
        .join("");
}

["today","week","month"]
.forEach(name=>{
  document.getElementById(`btn-${name}`)
    ?.addEventListener(
      "click",
      ()=>{
        filter = name;
        setActive();
        load();
      }
    );
});

setActive();
load();

setInterval(
  ()=>{
    if(filter === "today"){
      load();
    }
  },
  60000
);

})();