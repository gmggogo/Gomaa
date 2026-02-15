document.addEventListener("DOMContentLoaded", async () => {

  const container = document.getElementById("layoutHeader");
  if (!container) return;

  container.innerHTML = `
    <div class="header">
      <div class="top-section">
        <div>
          <div class="logged-company" id="companyName">Loading...</div>
          <div class="greeting" id="greetingText"></div>
          <div class="clock" id="azDateTime"></div>
        </div>
        <img src="../assets/logo.png" class="logo">
      </div>

      <div class="nav">
        <a href="dashboard.html">Dashboard</a>
        <a href="add-trip.html">Add Trip</a>
        <a href="review.html">Review</a>
        <a href="summary.html">Summary</a>
        <a href="taxes.html">Taxes</a>
      </div>
    </div>
  `;

  /* ===========================
     ACTIVE LINK
  ============================ */
  const currentPage = window.location.pathname.split("/").pop();
  document.querySelectorAll(".nav a").forEach(link => {
    if (link.getAttribute("href") === currentPage) {
      link.classList.add("active");
    }
  });

  /* ===========================
     LOAD COMPANY NAME
  ============================ */

  try {

    const res = await fetch("/api/company/me", {
      credentials: "include"
    });

    if (res.status === 401) {
      window.location.href = "company-login.html";
      return;
    }

    const data = await res.json();
    document.getElementById("companyName").innerText = data.name;

  } catch (err) {
    console.error("Company fetch error:", err);
  }

  /* ===========================
     ARIZONA TIME
  ============================ */

  function updateTime() {

    const now = new Date().toLocaleString("en-US", {
      timeZone: "America/Phoenix",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });

    document.getElementById("azDateTime").innerText = now;

    const hour = new Date().getHours();
    let greeting = "Good Evening";
    if (hour < 12) greeting = "Good Morning";
    else if (hour < 18) greeting = "Good Afternoon";

    document.getElementById("greetingText").innerText = greeting;
  }

  updateTime();
  setInterval(updateTime, 1000);

});