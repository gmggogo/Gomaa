/* =========================
LOAD HEADER
========================= */

document.addEventListener("DOMContentLoaded", function(){

  fetch("/admin/header.html")
  .then(res => res.text())
  .then(html => {

    const headerContainer = document.getElementById("adminHeader");

    if(headerContainer){
      headerContainer.innerHTML = html;

      setActiveNav();
      startArizonaTime();
      showWelcomeMessage();
      adjustPageOffset();
    }

  });

});


/* =========================
ACTIVE NAV
========================= */

function setActiveNav(){

  const page = location.pathname.split("/").pop();

  document.querySelectorAll(".nav-btn").forEach(btn => {

    if(btn.getAttribute("href") === page){
      btn.classList.add("active");
    }

  });

}


/* =========================
ARIZONA TIME
========================= */

function startArizonaTime(){

  function updateTime(){

    const now = new Date().toLocaleString("en-US",{
      timeZone:"America/Phoenix",
      year:"numeric",
      month:"short",
      day:"2-digit",
      hour:"2-digit",
      minute:"2-digit",
      second:"2-digit"
    });

    const el = document.getElementById("azTime");

    if(el){
      el.innerText = now;
    }

  }

  updateTime();
  setInterval(updateTime,1000);

}


/* =========================
WELCOME MESSAGE
========================= */

function showWelcomeMessage(){

  const name = localStorage.getItem("name");

  if(!name) return;

  const now = new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"});
  const hour = new Date(now).getHours();

  let greeting = "";
  let icon = "";

  if(hour >= 5 && hour < 12){
    greeting = "Good Morning";
    icon = "☀️";
  }
  else if(hour >= 12 && hour < 17){
    greeting = "Good Afternoon";
    icon = "⛅";
  }
  else if(hour >= 17 && hour < 21){
    greeting = "Good Evening";
    icon = "🌇";
  }
  else{
    greeting = "Good Night";
    icon = "🌙";
  }

  const msg = document.getElementById("welcomeMessage");
  const iconEl = document.getElementById("weatherIcon");

  if(msg){
    msg.innerText = greeting + ", " + name;
  }

  if(iconEl){
    iconEl.innerText = icon;
  }

}


/* =========================
HEADER HEIGHT FIX
========================= */

function adjustPageOffset(){

  const header = document.querySelector(".admin-header");
  const content = document.querySelector(".page-content");

  if(header && content){

    const headerHeight = header.offsetHeight;

    content.style.marginTop = headerHeight + "px";

  }

}

window.addEventListener("load", adjustPageOffset);
window.addEventListener("resize", adjustPageOffset);


/* =========================
LOGOUT
========================= */

function logout(){

  localStorage.removeItem("token");
  localStorage.removeItem("name");
  localStorage.removeItem("role");

  window.location.href="/login.html";

}