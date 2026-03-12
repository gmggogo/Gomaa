document.addEventListener("DOMContentLoaded", async () => {

  const container = document.getElementById("layoutHeader");
  if (!container) return;

  /* ===========================
     INJECT TICKER CSS ONCE
  ============================ */
  if (!document.getElementById("sunbeamTickerStyles")) {
    const style = document.createElement("style");
    style.id = "sunbeamTickerStyles";
    style.textContent = `
      .header{
        position:relative;
      }

      .header-ticker{
        position:absolute;
        left:50%;
        transform:translateX(-50%);
        top:30px;
        width:650px;
        overflow:hidden;
        pointer-events:none;
        text-align:center;
      }

      .header-ticker-text{
        white-space:nowrap;
        font-size:15px;
        font-weight:600;
        color:#ffffff;
        text-shadow:
          0 0 5px #ffffff,
          0 0 10px #3b82f6,
          0 0 15px #3b82f6,
          0 0 20px #1e3a8a;
        animation:sunbeamTickerMove 18s linear infinite;
      }

      @keyframes sunbeamTickerMove{
        0%{ transform:translateX(100%); }
        100%{ transform:translateX(-100%); }
      }

      @media(max-width:768px){
        .header-ticker{
          width:90%;
          top:26px;
        }

        .header-ticker-text{
          font-size:12px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ===========================
     HEADER HTML
  ============================ */
  container.innerHTML = `
    <div class="header">
      <div class="top-section">
        <div>
          <div class="logged-company" id="companyName">Loading...</div>
          <div class="greeting" id="greetingText"></div>
          <div class="clock" id="azDateTime"></div>
        </div>

        <div class="header-ticker">
          <div class="header-ticker-text">
            Sunbeam Transportation — Safe • Reliable • On-Time Transportation You Can Trust
          </div>
        </div>

        <img src="../assets/logo.png" class="logo">
      </div>

      <div class="nav">
        <a href="dashboard.html">Dashboard</a>
        <a href="add-trip.html">Add Trip</a>
        <a href="review.html">Review</a>
        <a href="summary.html">Summary</a>
        <a href="taxes.html">Taxes</a>
        <a href="#" id="logoutBtn">Logout</a>
      </div>
    </div>
  `;

  /* ===========================
     AUTH CHECK
  ============================ */
  const token = localStorage.getItem("token");
  const role  = localStorage.getItem("role");
  const name  = localStorage.getItem("name");

  if (!token || role !== "company") {
    window.location.replace("company-login.html");
    return;
  }

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
     LOAD COMPANY NAME (JWT)
  ============================ */
  try {
    const res = await fetch("/api/company/me", {
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      }
    });

    if (res.status === 401) {
      window.location.replace("company-login.html");
      return;
    }

    const data = await res.json();

    document.getElementById("companyName").innerText =
      data.name || name || "Company";

  } catch (err) {
    console.error("Company fetch error:", err);

    document.getElementById("companyName").innerText =
      name || "Company";
  }

  /* ===========================
     LOGOUT
  ============================ */
  document.getElementById("logoutBtn").addEventListener("click", function(e){
    e.preventDefault();
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("name");
    window.location.replace("company-login.html");
  });

  /* ===========================
     ARIZONA TIME
  ============================ */
  function updateTime() {
    const now = new Date();

    const formatted = now.toLocaleString("en-US", {
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

    document.getElementById("azDateTime").innerText = formatted;

    const hour = now.getHours();
    let greeting = "Good Evening";

    if (hour < 12) greeting = "Good Morning";
    else if (hour < 18) greeting = "Good Afternoon";

    document.getElementById("greetingText").innerText = greeting;
  }

  updateTime();
  setInterval(updateTime, 1000);

});