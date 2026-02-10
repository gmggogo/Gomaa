// ===============================
// DRIVER AUTH CHECK (FINAL & SAFE)
// ===============================
const rawDriver = localStorage.getItem("loggedDriver");

if (!rawDriver) {
  window.location.href = "/driver/login.html";
  throw new Error("Driver not logged in");
}

let driver;

try {
  driver = JSON.parse(rawDriver);
} catch (err) {
  localStorage.removeItem("loggedDriver");
  window.location.href = "/driver/login.html";
  throw new Error("Invalid driver data");
}

// ===============================
// PAGE READY
// ===============================
document.addEventListener("DOMContentLoaded", () => {

  // Header name
  const headerName = document.getElementById("driverName");
  if (headerName) {
    headerName.innerText = driver.name || driver.username || "Driver";
  }

  // Profile data
  const profileName = document.getElementById("profileName");
  if (profileName) {
    profileName.innerText = driver.name || "—";
  }

  const profileUser = document.getElementById("profileUser");
  if (profileUser) {
    profileUser.innerText = driver.username || "—";
  }

  console.log("✅ Logged Driver:", driver);
});

// ===============================
// NAVIGATION (APP STYLE)
// ===============================
function showSection(id, btn) {
  document.querySelectorAll(".section")
    .forEach(s => s.classList.remove("active"));

  document.querySelectorAll("nav button")
    .forEach(b => b.classList.remove("active"));

  const section = document.getElementById(id);
  if (section) section.classList.add("active");

  if (btn) btn.classList.add("active");
}

// ===============================
// LOGOUT
// ===============================
function logout() {
  localStorage.removeItem("loggedDriver");
  window.location.href = "/driver/login.html";
}