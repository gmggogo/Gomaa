// ===== AUTH CHECK =====
const rawDriver = localStorage.getItem("loggedDriver");

if (!rawDriver) {
  location.href = "/driver/login.html";
  throw new Error("Not logged in");
}

let driver;
try {
  driver = JSON.parse(rawDriver);
} catch {
  localStorage.removeItem("loggedDriver");
  location.href = "/driver/login.html";
}

// ===== DATE & TIME (AZ) =====
function updateTime(){
  const now = new Date().toLocaleString("en-US",{
    timeZone:"America/Phoenix",
    hour:"2-digit",
    minute:"2-digit",
    second:"2-digit",
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  });
  document.getElementById("datetime").innerText = now + " (AZ)";
}
setInterval(updateTime,1000);
updateTime();

// ===== NAVIGATION =====
function go(page){
  switch(page){
    case "trips": location.href="/driver/trips.html"; break;
    case "map": location.href="/driver/map.html"; break;
    case "hours": location.href="/driver/hours.html"; break;
    case "earnings": location.href="/driver/earnings.html"; break;
    case "summary": location.href="/driver/summary.html"; break;
    case "chat": location.href="/driver/chat.html"; break;
  }
}

// ===== LOGOUT =====
function logout(){
  localStorage.removeItem("loggedDriver");
  location.href="/driver/login.html";
}