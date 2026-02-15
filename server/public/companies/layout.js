document.addEventListener("DOMContentLoaded", () => {

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

  /* ===============================
     ACTIVE NAV LINK
  =============================== */
  const currentPage = window.location.pathname.split("/").pop();
  document.querySelectorAll(".nav a").forEach(link => {
    if (link.getAttribute("href") === currentPage) {
      link.classList.add("active");
    }
  });

  /* ===============================
     LOAD COMPANY NAME FROM SERVER
  =============================== */
  async function loadCompany() {
    try {

      const res = await fetch("/api/company/me", {
        credentials: "include"
      });

      if (!res.ok) throw new Error("Not logged in");

      const data = await res.json();

      document.getElementById("companyName").innerText = data.name;

    } catch (err) {

      console.error("Company fetch error:", err);

      // لو مش لوجين يرجعه للوجين
      window.location.href = "login.html";
    }
  }

  /* ===============================
     ARIZONA TIME + GREETING
  =============================== */
  function updateTime() {

    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "America/Phoenix"
    };

    const now = new Date().toLocaleString("en-US", {
      timeZone: "America/Phoenix"
    });

    const dateObj = new Date(now);
    const hour = dateObj.getHours();

    let greeting;
    if (hour < 12) greeting = "Good Morning";
    else if (hour < 18) greeting = "Good Afternoon";
    else greeting = "Good Evening";

    document.getElementById("greetingText").innerText = greeting;
    document.getElementById("azDateTime").innerText =
      dateObj.toLocaleString("en-US", options);
  }

  loadCompany();
  updateTime();
  setInterval(updateTime, 1000);

});