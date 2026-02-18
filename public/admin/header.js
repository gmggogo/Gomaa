// LOAD HEADER
fetch("header.html")
  .then(res => res.text())
  .then(html => {
    document.getElementById("adminHeader").innerHTML = html;
    setActiveNav();
    startArizonaTime();
  });

// ACTIVE BUTTON
function setActiveNav() {
  const page = location.pathname.split("/").pop();
  document.querySelectorAll(".nav-btn").forEach(btn => {
    if (btn.getAttribute("href") === page) {
      btn.classList.add("active");
    }
  });
}

// ARIZONA TIME
function startArizonaTime() {
  function updateTime() {
    const now = new Date().toLocaleString("en-US", {
      timeZone: "America/Phoenix",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      year: "numeric",
      month: "short",
      day: "2-digit"
    });
    const el = document.getElementById("azTime");
    if (el) el.innerText = now;
  }
  updateTime();
  setInterval(updateTime, 1000);
}

// LOGOUT
function logout() {
  localStorage.removeItem("loggedAdmin");
  location.href = "../login.html";
}