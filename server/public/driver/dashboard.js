/* TIME */

function updateTime(){
  const now = new Date();
  document.getElementById("datetime").innerText =
  now.toLocaleDateString()+" "+now.toLocaleTimeString();
}

setInterval(updateTime,1000);
updateTime();

/* DRIVER */

const driver = JSON.parse(localStorage.getItem("loggedDriver") || "{}");

if(driver.name){
  document.getElementById("driverName").innerText = driver.name;
}

/* NAVIGATION */

function goTrips(){
  window.location.href="trips.html";
}

function goMap(){
  window.location.href="map.html";
}

function goHours(){
  window.location.href="work-hours.html"; // 🔥 المهم
}

function goEarnings(){
  window.location.href="earnings.html";
}

function goSummary(){
  window.location.href="summary.html";
}

function goChat(){
  window.location.href="chat.html";
}

/* LOGOUT */

function logout(){
  localStorage.removeItem("driverToken");
  localStorage.removeItem("loggedDriver");
  window.location.href="login.html";
} /* TIME */

function updateTime(){
  const now = new Date();
  document.getElementById("datetime").innerText =
  now.toLocaleDateString()+" "+now.toLocaleTimeString();
}

setInterval(updateTime,1000);
updateTime();

/* DRIVER */

const driver = JSON.parse(localStorage.getItem("loggedDriver") || "{}");

if(driver.name){
  document.getElementById("driverName").innerText = driver.name;
}

/* NAVIGATION */

function goTrips(){
  window.location.href="trips.html";
}

function goMap(){
  window.location.href="map.html";
}

function goHours(){
  window.location.href="work-hours.html"; // 🔥 المهم
}

function goEarnings(){
  window.location.href="earnings.html";
}

function goSummary(){
  window.location.href="summary.html";
}

function goChat(){
  window.location.href="chat.html";
}

/* LOGOUT */

function logout(){
  localStorage.removeItem("driverToken");
  localStorage.removeItem("loggedDriver");
  window.location.href="login.html";
}