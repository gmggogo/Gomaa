(function(){

/* =========================
   SESSION
========================= */

const driver = JSON.parse(localStorage.getItem("loggedDriver"));

if (!driver){
  window.location.href = "login.html";
  return;
}

const driverId = driver.id || driver._id;

/* =========================
   FILTER
========================= */

let currentFilter = "today";

const btnToday = document.getElementById("btn-today");
const btnWeek = document.getElementById("btn-week");
const btnMonth = document.getElementById("btn-month");

btnToday.onclick = () => setFilter("today");
btnWeek.onclick = () => setFilter("week");
btnMonth.onclick = () => setFilter("month");

function setActive(){
  [btnToday, btnWeek, btnMonth].forEach(b=>b.classList.remove("active"));

  if(currentFilter==="today") btnToday.classList.add("active");
  if(currentFilter==="week") btnWeek.classList.add("active");
  if(currentFilter==="month") btnMonth.classList.add("active");
}

function setFilter(type){
  currentFilter = type;
  setActive();
  load();
}

/* =========================
   DATE FILTERS
========================= */

function isToday(date){
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function isWeek(date){
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return date >= start && date <= end;
}

function isMonth(date){
  const now = new Date();
  return date.getMonth() === now.getMonth() &&
         date.getFullYear() === now.getFullYear();
}

/* =========================
   LOAD DATA
========================= */

async function load(){

  try{

    const res = await fetch(`/api/driver/my-trips/${driverId}`);
    let trips = await res.json();

    if(!Array.isArray(trips)){
      document.getElementById("total").innerHTML = "Error loading data";
      return;
    }

    // completed only
    trips = trips.filter(t => t.status === "Completed");

    // filter by time
    trips = trips.filter(t => {

      const date = new Date(t.tripDate + " " + t.tripTime);

      if(currentFilter==="today") return isToday(date);
      if(currentFilter==="week") return isWeek(date);
      if(currentFilter==="month") return isMonth(date);

      return true;
    });

    if(trips.length === 0){
      document.getElementById("total").innerHTML = "No data";
      document.getElementById("list").innerHTML = "";
      return;
    }

    /* =========================
       GROUP BY DAY
    ========================= */

    const days = {};

    trips.forEach(t=>{
      const d = t.tripDate;
      if(!days[d]) days[d] = [];
      days[d].push(t);
    });

    let totalHours = 0;

    const list = document.getElementById("list");
    list.innerHTML = "";

    for(const date in days){

      const dayTrips = days[date];

      dayTrips.sort((a,b)=>{
        return new Date(a.tripDate+" "+a.tripTime) -
               new Date(b.tripDate+" "+b.tripTime);
      });

      const start = new Date(dayTrips[0].tripDate+" "+dayTrips[0].tripTime);
      const end = new Date(dayTrips[dayTrips.length-1].tripDate+" "+dayTrips[dayTrips.length-1].tripTime);

      // +30 min
      end.setMinutes(end.getMinutes()+30);

      const hours = (end - start) / 3600000;
      totalHours += hours;

      const div = document.createElement("div");
      div.className = "trip-card";

      div.innerHTML = `
        <b>${date}</b><br>
        🚗 Trips: ${dayTrips.length}<br>
        ⏱ Hours: ${hours.toFixed(2)}<br>
        🟢 From: ${start.toLocaleTimeString()}<br>
        🔴 To: ${end.toLocaleTimeString()}
      `;

      list.appendChild(div);
    }

    document.getElementById("total").innerHTML = `
      ⏱ Total Hours: ${totalHours.toFixed(2)} <br>
      🚗 Trips: ${trips.length}
    `;

  }catch(err){

    console.log(err);
    document.getElementById("total").innerHTML = "Server error";

  }

}

/* =========================
   INIT
========================= */

setActive();
load();

})();