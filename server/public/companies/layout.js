document.addEventListener("DOMContentLoaded", ()=>{

  const loggedCompany = JSON.parse(localStorage.getItem("loggedCompany"));
  if(!loggedCompany){
    location.href="company-login.html";
    return;
  }

  /* ===============================
     CREATE HEADER
  ================================ */
  const header = document.createElement("div");
  header.className="company-header";

  header.innerHTML = `
    <div class="header-left">
      <img src="/assets/logo.png" alt="Sunbeam Logo">
      <div class="company-info">
        <div class="company-name">${loggedCompany.name}</div>
        <div class="company-time" id="azTime"></div>
      </div>
    </div>

    <div class="nav-links">
      <a href="dashboard.html">Dashboard</a>
      <a href="add-trip.html">Add Trip</a>
      <a href="review.html">Review</a>
      <a href="summary.html">Summary</a>
      <a href="payment.html">Payment</a>
      <a href="taxes.html">Taxes</a>
      <div class="logout-btn" onclick="logout()">Logout</div>
    </div>
  `;

  document.body.prepend(header);

  /* ===============================
     ACTIVE PAGE HIGHLIGHT
  ================================ */
  const links = document.querySelectorAll(".nav-links a");
  const currentPage = window.location.pathname.split("/").pop();

  links.forEach(link=>{
    if(link.getAttribute("href")===currentPage){
      link.classList.add("active");
    }
  });

  /* ===============================
     ARIZONA TIME
  ================================ */
  function updateAZTime(){
    const now = new Date();

    const options = {
      timeZone: "America/Phoenix",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    };

    const formatted = new Intl.DateTimeFormat("en-US", options).format(now);
    document.getElementById("azTime").innerText = formatted + " (AZ)";
  }

  updateAZTime();
  setInterval(updateAZTime,1000);

});

/* ===============================
   LOGOUT
================================ */
function logout(){
  localStorage.removeItem("loggedCompany");
  location.href="company-login.html";
}