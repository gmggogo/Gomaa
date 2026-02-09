const driver = JSON.parse(localStorage.getItem("loggedDriver"));

if (!driver || driver.role !== "driver") {
  window.location.href = "/driver/login.html";
}