// ===============================
// AUTH CHECK
// ===============================
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) {
  location.href = "/driver/login.html";
}

let driver = JSON.parse(rawDriver);

// ===============================
// DRIVER NAME
// ===============================
document.getElementById("driverName").innerText =
  driver.name || driver.username || "";

// ===============================
// DATETIME (AZ)
// ===============================
function updateTime(){
  const now = new Date();
  document.getElementById("datetime").innerText =
    now.toLocaleString("en-US",{ timeZone:"America/Phoenix" });
}
setInterval(updateTime,1000);
updateTime();

// ===============================
// NAVIGATION
// ===============================
function go(page){
  location.href = `/driver/${page}.html`;
}

// ===============================
// LOGOUT
// ===============================
function logout(){
  localStorage.removeItem("loggedDriver");
  location.href = "/driver/login.html";
}