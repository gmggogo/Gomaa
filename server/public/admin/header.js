document.addEventListener("DOMContentLoaded", async () => {

  const headerContainer =
    document.getElementById("adminHeader") ||
    document.getElementById("headerContainer") ||
    document.getElementById("header-container");

  if(!headerContainer) return;

  /* =========================
     LOAD HEADER HTML
  ========================= */

  try{

    const res =
      await fetch("header.html");

    const html =
      await res.text();

    headerContainer.innerHTML =
      html;

  }catch(err){

    console.log("HEADER LOAD ERROR:",err);
    return;

  }

  /* =========================
     DEFAULT LOGO
  ========================= */

  if(!localStorage.getItem("appLogo")){

    localStorage.setItem(
      "appLogo",
      "/assets/logo.png"
    );

  }

  /* =========================
     LOAD BRANDING
  ========================= */

  if(!document.querySelector('script[src="/core/branding.js"]')){

    const brandingScript =
      document.createElement("script");

    brandingScript.src =
      "/core/branding.js";

    document.body.appendChild(
      brandingScript
    );

  }

  /* =========================
     LOAD LOGO / BRANDING
  ========================= */

  setTimeout(async ()=>{

    if(window.Branding){

      try{

        await Branding.load();

        syncMobileLogo();

      }catch(err){

        console.log("BRANDING LOAD ERROR:",err);

      }

    }else{

      syncMobileLogo();

    }

  },200);

  /* =========================
     DYNAMIC COMPANY NAME
  ========================= */

  function getCompanyName(){

    return (
      localStorage.getItem("companyName") ||
      localStorage.getItem("name") ||
      "Company"
    );

  }

  const companyEl =
    document.getElementById("dynamicCompanyName");

  if(companyEl){

    companyEl.innerText =
      getCompanyName();

  }

  const mobileCompanyEl =
    document.getElementById("mobileCompanyName");

  if(mobileCompanyEl){

    mobileCompanyEl.innerText =
      getCompanyName();

  }

  /* =========================
     SYNC MOBILE LOGO
  ========================= */

  function syncMobileLogo(){

    const mainLogo =
      document.querySelector(".main-logo");

    const mobileLogo =
      document.querySelector(".mobile-side-logo");

    const savedLogo =
      localStorage.getItem("appLogo") ||
      "/assets/logo.png";

    if(mainLogo && !mainLogo.getAttribute("src")){

      mainLogo.src =
        savedLogo;

    }

    if(mobileLogo){

      mobileLogo.src =
        mainLogo?.getAttribute("src") ||
        savedLogo;

    }

  }

  syncMobileLogo();

  /* =========================
     DYNAMIC TIME
  ========================= */

  function updateAdminTime(){

    const timezone =
      window.Branding?.data?.timezone ||
      localStorage.getItem("systemTimezone") ||
      localStorage.getItem("appTimezone") ||
      "America/Phoenix";

    const now =
      new Date();

    const date =
      now.toLocaleDateString(
        "en-US",
        {
          timeZone:timezone,
          weekday:"short",
          month:"short",
          day:"numeric",
          year:"numeric"
        }
      );

    const time =
      now.toLocaleTimeString(
        "en-US",
        {
          timeZone:timezone,
          hour:"numeric",
          minute:"2-digit",
          second:"2-digit",
          hour12:true
        }
      );

    const el =
      document.getElementById("azTime");

    if(el){

      el.innerHTML =
        `${date}<br>${time}`;

    }

  }

  updateAdminTime();

  setInterval(
    updateAdminTime,
    1000
  );

  /* =========================
     WELCOME MESSAGE
  ========================= */

  function updateWelcome(){

    const timezone =
      window.Branding?.data?.timezone ||
      localStorage.getItem("systemTimezone") ||
      localStorage.getItem("appTimezone") ||
      "America/Phoenix";

    const now =
      new Date();

    const hour =
      Number(
        new Intl.DateTimeFormat(
          "en-US",
          {
            hour:"numeric",
            hour12:false,
            timeZone:timezone
          }
        ).format(now)
      );

    let message =
      "Good Evening";

    let icon =
      "🌙";

    if(hour < 12){

      message =
        "Good Morning";

      icon =
        "☀️";

    }else if(hour < 18){

      message =
        "Good Afternoon";

      icon =
        "🌤️";

    }

    const welcomeEl =
      document.getElementById("welcomeMessage");

    const iconEl =
      document.getElementById("weatherIcon");

    if(welcomeEl){

      welcomeEl.innerText =
        message;

    }

    if(iconEl){

      iconEl.innerText =
        icon;

    }

  }

  updateWelcome();

  setInterval(
    updateWelcome,
    60000
  );

  /* =========================
     ACTIVE NAV
  ========================= */

  function setActiveNav(){

    const currentPage =
      window.location.pathname
      .split("/")
      .pop();

    document
      .querySelectorAll(".admin-nav .nav-btn, .mobile-side-nav a")
      .forEach(link=>{

        const href =
          link.getAttribute("href") || "";

        if(href === currentPage){

          link.classList.add("active");

        }else{

          link.classList.remove("active");

        }

      });

  }

  /* =========================
     BUILD MOBILE MENU
  ========================= */

  function buildMobileMenu(){

    const desktopNav =
      document.getElementById("adminDesktopNav") ||
      document.querySelector(".admin-nav");

    const mobileNav =
      document.getElementById("mobileSideNav");

    if(!desktopNav || !mobileNav) return;

    mobileNav.innerHTML = "";

    const links =
      desktopNav.querySelectorAll("a.nav-btn");

    links.forEach(link=>{

      const a =
        document.createElement("a");

      a.href =
        link.getAttribute("href") || "#";

      a.innerText =
        link.innerText.trim();

      if(link.classList.contains("active")){

        a.classList.add("active");

      }

      mobileNav.appendChild(a);

    });

    setActiveNav();

  }

  buildMobileMenu();

  /* =========================
     MOBILE MENU OPEN / CLOSE
  ========================= */

  const mobileMenuBtn =
    document.getElementById("mobileMenuBtn");

  const mobileCloseBtn =
    document.getElementById("mobileCloseBtn");

  const mobileOverlay =
    document.getElementById("mobileMenuOverlay");

  const mobileSideMenu =
    document.getElementById("mobileSideMenu");

  function openMobileMenu(){

    if(mobileOverlay){

      mobileOverlay.classList.add("show");

    }

    if(mobileSideMenu){

      mobileSideMenu.classList.add("show");

    }

    document.body.style.overflow =
      "hidden";

  }

  function closeMobileMenu(){

    if(mobileOverlay){

      mobileOverlay.classList.remove("show");

    }

    if(mobileSideMenu){

      mobileSideMenu.classList.remove("show");

    }

    document.body.style.overflow =
      "";

  }

  if(mobileMenuBtn){

    mobileMenuBtn.addEventListener("click",e=>{

      e.preventDefault();
      openMobileMenu();

    });

  }

  if(mobileCloseBtn){

    mobileCloseBtn.addEventListener("click",e=>{

      e.preventDefault();
      closeMobileMenu();

    });

  }

  if(mobileOverlay){

    mobileOverlay.addEventListener("click",()=>{

      closeMobileMenu();

    });

  }

  document.addEventListener("keydown",e=>{

    if(e.key === "Escape"){

      closeMobileMenu();

    }

  });

  const mobileNav =
    document.getElementById("mobileSideNav");

  if(mobileNav){

    mobileNav.addEventListener("click",e=>{

      const link =
        e.target.closest("a");

      if(link){

        closeMobileMenu();

      }

    });

  }

  /* =========================
     FINAL ACTIVE SYNC
  ========================= */

  setActiveNav();

});

/* =========================
   GLOBAL LOGOUT
========================= */

function logout(){

  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("name");
  localStorage.removeItem("companyName");

  window.location.href =
    "/login.html";

}