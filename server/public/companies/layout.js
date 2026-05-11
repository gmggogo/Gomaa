document.addEventListener("DOMContentLoaded", async () => {

const container = document.getElementById("layoutHeader");

if(!container) return;

container.innerHTML = `

<div class="header">

  <div class="header-inner">

    <div class="top-section">

      <div class="company-block">

        <img src="../assets/logo.png" class="logo">

        <div class="company-text">

          <div class="logged-company" id="companyName">
            Loading...
          </div>

          <div class="greeting" id="greetingText">
          </div>

        </div>

      </div>

      <div class="time-block">

        <div class="clock" id="azDateTime">
        </div>

      </div>

    </div>

    <div class="nav">

      <a href="dashboard.html">Dashboard</a>

      <a href="add-trip.html">Add Trip</a>

      <a href="review.html">Review</a>

      <a href="summary.html">Summary</a>

      <a href="payment.html">Payment</a>

      <a href="taxes.html">Taxes</a>

      <a href="#" id="logoutBtn">Logout</a>

    </div>

  </div>

</div>

`;

/* ================= AUTH ================= */

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const name  = localStorage.getItem("name");

if(!token || role !== "company"){

  window.location.replace("company-login.html");

  return;

}

/* ================= ACTIVE LINK ================= */

const currentPage =
window.location.pathname.split("/").pop();

document.querySelectorAll(".nav a").forEach(link=>{

  if(link.getAttribute("href") === currentPage){

    link.classList.add("active");

  }

});

/* ================= COMPANY NAME ================= */

try{

  const res = await fetch("/api/company/me",{

    headers:{
      Authorization:"Bearer " + token
    }

  });

  const data = await res.json();

  document.getElementById("companyName").innerText =
    data.name || name || "Company";

}catch{

  document.getElementById("companyName").innerText =
    name || "Company";

}

/* ================= LOGOUT ================= */

document.getElementById("logoutBtn")
.addEventListener("click",e=>{

  e.preventDefault();

  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("name");

  window.location.replace("company-login.html");

});

/* ================= TIME ================= */

function updateTime(){

  const now = new Date();

  const formatted =
  now.toLocaleString("en-US",{

    timeZone:"America/Phoenix",

    weekday:"short",

    month:"short",

    day:"numeric",

    year:"numeric",

    hour:"numeric",

    minute:"2-digit",

    second:"2-digit",

    hour12:true

  });

  document.getElementById("azDateTime")
  .innerText = formatted;

  const phoenixHour = Number(
    new Intl.DateTimeFormat("en-US",{
      hour:"numeric",
      hour12:false,
      timeZone:"America/Phoenix"
    }).format(now)
  );

  let greeting = "Good Evening";

  if(phoenixHour < 12){
    greeting = "Good Morning";
  }
  else if(phoenixHour < 18){
    greeting = "Good Afternoon";
  }

  document.getElementById("greetingText")
  .innerText = greeting;

}

updateTime();

setInterval(updateTime,1000);

});