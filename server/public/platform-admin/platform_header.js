/* =========================================
   PLATFORM ADMIN HEADER
   TAB-SAFE SESSION AUTH
========================================= */

(function syncPlatformAdminSession(){

  "use strict";

  const sessionRole =
    String(
      sessionStorage.getItem("staffRole") ||
      ""
    ).trim();

  if(sessionRole !== "PLATFORM_ADMIN"){
    return;
  }

  const token =
    String(
      sessionStorage.getItem("staffToken") ||
      ""
    ).trim();

  const name =
    String(
      sessionStorage.getItem("staffName") ||
      ""
    ).trim();

  if(token){
    localStorage.setItem(
      "token",
      token
    );
  }

  localStorage.setItem(
    "role",
    "PLATFORM_ADMIN"
  );

  localStorage.setItem(
    "name",
    name
  );

  localStorage.removeItem(
    "tenantId"
  );

  localStorage.removeItem(
    "tenantSlug"
  );

})();

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    "use strict";

    const token =
      String(
        sessionStorage.getItem("staffToken") ||
        localStorage.getItem("token") ||
        ""
      ).trim();

    const role =
      String(
        sessionStorage.getItem("staffRole") ||
        localStorage.getItem("role") ||
        ""
      ).trim();

    if(
      !token ||
      role !== "PLATFORM_ADMIN"
    ){
      window.location.replace(
        "/login.html"
      );
      return;
    }

    const headerContainer =
      document.getElementById(
        "platformHeader"
      ) ||
      document.getElementById(
        "headerContainer"
      ) ||
      document.getElementById(
        "header-container"
      );

    if(!headerContainer){
      return;
    }

    try{

      const res =
        await fetch(
          "/platform-admin/platform_header.html",
          {
            cache:"no-store"
          }
        );

      if(!res.ok){
        throw new Error(
          "Platform header load failed"
        );
      }

      headerContainer.innerHTML =
        await res.text();

    }catch(err){

      console.error(
        "PLATFORM HEADER LOAD ERROR:",
        err
      );

      return;
    }

    const title =
      document.getElementById(
        "platformTitle"
      );

    if(title){
      title.textContent =
        "GH Mobility Platform";
    }

    function updatePlatformTime(){

      const timezone =
        localStorage.getItem(
          "platformTimezone"
        ) ||
        localStorage.getItem(
          "systemTimezone"
        ) ||
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
        document.getElementById(
          "platformTime"
        );

      if(el){
        el.innerHTML =
          `${date}<br>${time}`;
      }
    }

    function updatePlatformWelcome(){

      const timezone =
        localStorage.getItem(
          "platformTimezone"
        ) ||
        localStorage.getItem(
          "systemTimezone"
        ) ||
        "America/Phoenix";

      const hour =
        Number(
          new Intl.DateTimeFormat(
            "en-US",
            {
              hour:"numeric",
              hour12:false,
              timeZone:timezone
            }
          ).format(
            new Date()
          )
        );

      let message =
        "Good Evening";

      if(hour < 12){
        message =
          "Good Morning";
      }else if(hour < 18){
        message =
          "Good Afternoon";
      }

      const welcomeEl =
        document.getElementById(
          "platformWelcomeMessage"
        );

      if(welcomeEl){
        welcomeEl.textContent =
          message;
      }
    }

    function setPlatformActiveNav(){

      const currentPage =
        window.location.pathname
          .split("/")
          .pop();

      document
        .querySelectorAll(
          ".platform-nav .platform-nav-btn, .platform-mobile-side-nav a"
        )
        .forEach(link=>{

          const href =
            String(
              link.getAttribute("href") ||
              ""
            )
            .split("/")
            .pop();

          link.classList.toggle(
            "active",
            href === currentPage
          );
        });
    }

    function buildPlatformMobileMenu(){

      const desktopNav =
        document.getElementById(
          "platformDesktopNav"
        );

      const mobileNav =
        document.getElementById(
          "platformMobileSideNav"
        );

      if(
        !desktopNav ||
        !mobileNav
      ){
        return;
      }

      mobileNav.innerHTML = "";

      desktopNav
        .querySelectorAll(
          "a.platform-nav-btn"
        )
        .forEach(link=>{

          const item =
            document.createElement(
              "a"
            );

          item.href =
            link.getAttribute(
              "href"
            ) || "#";

          item.textContent =
            link.textContent.trim();

          mobileNav.appendChild(
            item
          );
        });

      setPlatformActiveNav();
    }

    function closePlatformMobileMenu(){

      const mobileOverlay =
        document.getElementById(
          "platformMobileOverlay"
        );

      const mobileSideMenu =
        document.getElementById(
          "platformMobileSideMenu"
        );

      if(mobileOverlay){
        mobileOverlay.classList.remove(
          "show"
        );
      }

      if(mobileSideMenu){
        mobileSideMenu.classList.remove(
          "show"
        );
      }

      document.body.style.overflow =
        "";
    }

    function openPlatformMobileMenu(){

      const mobileOverlay =
        document.getElementById(
          "platformMobileOverlay"
        );

      const mobileSideMenu =
        document.getElementById(
          "platformMobileSideMenu"
        );

      if(mobileOverlay){
        mobileOverlay.classList.add(
          "show"
        );
      }

      if(mobileSideMenu){
        mobileSideMenu.classList.add(
          "show"
        );
      }

      document.body.style.overflow =
        "hidden";
    }

    buildPlatformMobileMenu();
    updatePlatformTime();
    updatePlatformWelcome();
    setPlatformActiveNav();

    setInterval(
      updatePlatformTime,
      1000
    );

    setInterval(
      updatePlatformWelcome,
      60000
    );

    document
      .getElementById(
        "platformMobileMenuBtn"
      )
      ?.addEventListener(
        "click",
        event=>{
          event.preventDefault();
          openPlatformMobileMenu();
        }
      );

    document
      .getElementById(
        "platformMobileCloseBtn"
      )
      ?.addEventListener(
        "click",
        event=>{
          event.preventDefault();
          closePlatformMobileMenu();
        }
      );

    document
      .getElementById(
        "platformMobileOverlay"
      )
      ?.addEventListener(
        "click",
        closePlatformMobileMenu
      );

    document.addEventListener(
      "keydown",
      event=>{
        if(event.key === "Escape"){
          closePlatformMobileMenu();
        }
      }
    );
  }
);

/* =========================================
   PLATFORM LOGOUT
========================================= */

function platformLogout(){

  sessionStorage.removeItem(
    "staffToken"
  );

  sessionStorage.removeItem(
    "staffRole"
  );

  sessionStorage.removeItem(
    "staffName"
  );

  sessionStorage.removeItem(
    "staffTenantId"
  );

  sessionStorage.removeItem(
    "staffTenantSlug"
  );

  localStorage.removeItem(
    "token"
  );

  localStorage.removeItem(
    "role"
  );

  localStorage.removeItem(
    "name"
  );

  localStorage.removeItem(
    "tenantId"
  );

  localStorage.removeItem(
    "tenantSlug"
  );

  window.location.replace(
    "/login.html"
  );
}
