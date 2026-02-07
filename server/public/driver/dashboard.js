// ===============================
// DRIVER AUTH CHECK (FINAL)
// ===============================
const rawDriver = localStorage.getItem("loggedDriver");

if (!rawDriver) {
  // السواق مش عامل تسجيل دخول
  window.location.href = "../login.html";
  throw new Error("Driver not logged in");
}

let driver;

try {
  driver = JSON.parse(rawDriver);
} catch (err) {
  // بيانات بايظة
  localStorage.removeItem("loggedDriver");
  window.location.href = "../login.html";
  throw new Error("Invalid driver data");
}

// ===============================
// PAGE READY
// ===============================
document.addEventListener("DOMContentLoaded", () => {

  // رسالة ترحيب
  const welcome = document.getElementById("welcomeText");
  if (welcome) {
    welcome.innerText = `Welcome ${driver.name || "Driver"}`;
  }

  // عرض بيانات أساسية لو محتاج
  const driverIdEl = document.getElementById("driverId");
  if (driverIdEl && driver.id) {
    driverIdEl.innerText = driver.id;
  }

  console.log("✅ Logged Driver:", driver);
});