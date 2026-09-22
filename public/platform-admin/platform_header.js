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

    const platformRoleTitle =
      document.getElementById(
        "platformRoleTitle"
      );

    if(platformRoleTitle){
      platformRoleTitle.textContent =
        "Platform Admin";
    }

    function cleanPlatformName(value){
      const name =
        String(value || "")
          .trim();

      if(
        !name ||
        name.toUpperCase() === "PLATFORM ADMIN" ||
        name.toUpperCase() === "PLATFORM_ADMIN"
      ){
        return "";
      }

      return name;
    }

    function nameFromToken(){
      try{
        const parts =
          String(token || "")
            .split(".");

        if(parts.length < 2){
          return "";
        }

        let payload =
          parts[1]
            .replace(/-/g,"+")
            .replace(/_/g,"/");

        while(payload.length % 4){
          payload += "=";
        }

        const data =
          JSON.parse(
            decodeURIComponent(
              atob(payload)
                .split("")
                .map(
                  c=>
                    "%" +
                    c.charCodeAt(0)
                      .toString(16)
                      .padStart(2,"0")
                )
                .join("")
            )
          );

        return cleanPlatformName(
          data?.name ||
          data?.fullName ||
          data?.username ||
          ""
        );

      }catch(err){
        return "";
      }
    }

    function nameFromPage(){
      const text =
        String(
          document.body?.innerText ||
          ""
        );

      const match =
        text.match(
          /Signed\s+in\s+as\s+(.+?)\s*[—–-]\s*Platform\s+Admin/i
        );

      return cleanPlatformName(
        match?.[1] || ""
      );
    }

    function resolvePlatformAdminName(){
      return (
        cleanPlatformName(
          sessionStorage.getItem("staffName")
        ) ||
        cleanPlatformName(
          sessionStorage.getItem("fullName")
        ) ||
        cleanPlatformName(
          localStorage.getItem("name")
        ) ||
        cleanPlatformName(
          localStorage.getItem("fullName")
        ) ||
        cleanPlatformName(
          localStorage.getItem("userName")
        ) ||
        nameFromToken() ||
        nameFromPage() ||
        "Platform Admin"
      );
    }

    let platformAdminName =
      resolvePlatformAdminName();

    function applyPlatformAdminName(){

      platformAdminName =
        resolvePlatformAdminName();

      const platformAdminNameEl =
        document.getElementById(
          "platformAdminName"
        );

      if(platformAdminNameEl){
        platformAdminNameEl.textContent =
          platformAdminName;
      }

      const platformAdminAvatarEl =
        document.getElementById(
          "platformAdminAvatar"
        );

      if(platformAdminAvatarEl){

        const initials =
          platformAdminName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0,2)
            .map(part=>part[0])
            .join("")
            .toUpperCase() ||
          "PA";

        platformAdminAvatarEl.textContent =
          initials;
      }

      const platformMobileAdminNameEl =
        document.getElementById(
          "platformMobileAdminName"
        );

      if(platformMobileAdminNameEl){
        platformMobileAdminNameEl.textContent =
          platformAdminName;
      }
    }

    applyPlatformAdminName();

    setTimeout(
      applyPlatformAdminName,
      250
    );

    setTimeout(
      applyPlatformAdminName,
      1000
    );

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

    async function applyPrimaryPlatformAdminAccess(){

      const nav =
        document.getElementById(
          "platformAdminsNavBtn"
        );

      if(!nav){
        return false;
      }

      nav.style.display =
        "none";

      try{

        const response =
          await fetch(
            "/api/platform-admin-management/me",
            {
              cache:"no-store",
              headers:{
                Authorization:
                  `Bearer ${token}`
              }
            }
          );

        const data =
          await response
            .json()
            .catch(
              ()=>({})
            );

        const allowed =
          response.ok &&
          data?.isPrimaryPlatformAdmin === true;

        nav.style.display =
          allowed
            ? ""
            : "none";

        return allowed;

      }catch(err){

        console.error(
          "PLATFORM PRIMARY ACCESS ERROR:",
          err
        );

        nav.style.display =
          "none";

        return false;
      }
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

          if(
            link.dataset.primaryOnly === "true" &&
            link.style.display === "none"
          ){
            return;
          }

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

    await applyPrimaryPlatformAdminAccess();
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
