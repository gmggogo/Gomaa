// ===============================
// DRIVER AUTH CHECK (SAFE)
// ===============================
const raw = localStorage.getItem("loggedDriver");

if (!raw) {
  window.location.replace("../login.html");
  throw new Error("Driver not logged in");
}

let driver;
try {
  driver = JSON.parse(raw);
} catch (e) {
  localStorage.removeItem("loggedDriver");
  window.location.replace("../login.html");
  throw new Error("Invalid driver data");
}

// ===============================
// PAGE READY
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.getElementById("welcomeText");
  if (welcome) {
    welcome.innerText = `Welcome ${driver.name || "Driver"}`;
  }
});