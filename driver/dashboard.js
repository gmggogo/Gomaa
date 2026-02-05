// ===============================
// DRIVER AUTH CHECK
// ===============================
const driver = JSON.parse(localStorage.getItem("loggedDriver"));

if (!driver) {
  window.location.href = "login.html";
}

// ===============================
// BASIC DRIVER INFO
// ===============================
document.getElementById("welcomeText").innerText =
  `Welcome ${driver.name || "Driver"}`;