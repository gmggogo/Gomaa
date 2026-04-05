const user = JSON.parse(localStorage.getItem("user"));

if (!user || user.role !== "driver") {
  window.location.href = "/driver/login.html";
}

let currentFilter = "today";

function setActiveButton(){
  document.querySelectorAll(".filters button").forEach(b => b.classList.remove("active"));
  document.getElementById("btn-" + currentFilter).classList.add("active");
}

function setFilter(type){
  currentFilter = type;
  setActiveButton();
  loadWorkHours();
}

function isSameDay(d1, d2){
  return d1.toDateString() === d2.toDateString();
}

function isSameWeek(date){
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return date >= start && date <= end;
}

function isSameMonth(date){
  const now = new Date();
  return date.getMonth() === now.getMonth() &&
         date.getFullYear() === now.getFullYear();
}

async function loadWorkHours(){

  const res = await fetch(`/api/driver/my-trips/${user.id}`);
  let trips = await res.json();

  if (!Array.isArray(trips)){
    document.getElementById("total").innerHTML = "Error loading data";
    return;
  }

  trips = trips.filter(t => t.status === "Completed");

  // 🔥 فلترة
  trips = trips.filter(t => {

    const date = new Date(t.tripDate + " " + t.tripTime);

    if (currentFilter === "today") return isSameDay(date, new Date());
    if (currentFilter === "week") return isSameWeek(date);
    if (currentFilter === "month") return isSameMonth(date);

    return true;
  });

  if (trips.length === 0){
    document.getElementById("total").innerHTML = "No data";
    document.getElementById("list").innerHTML = "";
    return;
  }

  const days = {};

  trips.forEach(t=>{
    const date = t.tripDate;
    if (!days[date]) days[date] = [];
    days[date].push(t);
  });

  let totalHours = 0;

  const list = document.getElementById("list");
  list.innerHTML = "";

  for (const date in days){

    const dayTrips = days[date];

    dayTrips.sort((a,b)=>{
      return new Date(a.tripDate + " " + a.tripTime) - new Date(b.tripDate + " " + b.tripTime);
    });

    const start = new Date(dayTrips[0].tripDate + " " + dayTrips[0].tripTime);
    const end = new Date(dayTrips[dayTrips.length - 1].tripDate + " " + dayTrips[dayTrips.length - 1].tripTime);

    end.setMinutes(end.getMinutes() + 30);

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
}

// أول تحميل
setActiveButton();
loadWorkHours();