/* =========================
   ADMIN FLOATING CHAT LOADER
   Loads once on every admin page
========================= */

(function loadAdminFloatingChat(){

  if(window.ADMIN_CHAT_LOADER_STARTED){
    return;
  }

  window.ADMIN_CHAT_LOADER_STARTED = true;

  function injectChatScript(){

    if(
      window.SUNBEAM_ADMIN_FLOATING_CHAT ||
      document.querySelector('script[src="/admin/admin-chat.js"]') ||
      document.querySelector('script[src="admin-chat.js"]')
    ){
      return;
    }

    const script =
      document.createElement("script");

    script.src =
      "/admin/admin-chat.js";

    script.defer = true;

    script.onerror = function(){

      console.log(
        "ADMIN CHAT LOAD ERROR"
      );

    };

    document.body.appendChild(
      script
    );

  }

  if(document.readyState === "loading"){

    document.addEventListener(
      "DOMContentLoaded",
      injectChatScript,
      {
        once:true
      }
    );

  }else{

    injectChatScript();

  }

})();


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


  /* ========================= ROLE / NAV ========================= */

  const normRole=v=>String(v||"").trim().toUpperCase().replace(/[\s-]+/g,"_");

  function roleMode(){
    const r=normRole(localStorage.getItem("role") || localStorage.getItem("userRole"));
    if(r==="DISPATCHER") return "dispatcher";
    if(r==="SUPER_ADMIN" || r==="SUPERADMIN") return "super-admin";
    return "admin";
  }

  const ADMIN_LINKS=[
    ["Dashboard","dashboard.html"],["Trips Hub","trips-hub.html"],
    ["Trips","trips.html"],["Dispatch","dispatch.html"],
    ["Dispatch Final Confirmation","dispatch-final-confirmation.html"],
    ["Dispatch Review","dispatch-review.html"],["Driver Schedule","driver-schedule.html"],
    ["Drivers Map","maps.html"],["Add User","users.html"],["Summary","summary.html"],
    ["Payments","payments.html"],["Settings","settings.html"],["Refunds","refunds.html"],
    ["Admin Billing","admin-billing.html"],["System Design","system-design.html"],
    ["Service Management","service-management.html"],
    ["Facility Pricing Override","facility-pricing-override.html"],
    ["Smart Dispatch","smart-dispatch-engine.html"]
  ];

  const DISPATCHER_NAV=[
    {label:"Dashboard",href:"dashboard.html"},
    {label:"Operations",items:[
      ["Trips Hub","trips-hub.html"],["Trips","trips.html"],["Dispatch","dispatch.html"]
    ]},
    {label:"Final Confirmation",href:"dispatch-final-confirmation.html"},
    {label:"Dispatch Review",href:"dispatch-review.html"},
    {label:"Driver Follow-up",items:[
      ["Driver Schedule","driver-schedule.html"],["Drivers Map","maps.html"]
    ]}
  ];

  function navLink(label,href){
    const a=document.createElement("a");
    a.href=href; a.className="nav-btn"; a.textContent=label;
    return a;
  }

  function dropdown(group){
    const wrap=document.createElement("div");
    wrap.className="nav-dropdown";
    const btn=document.createElement("button");
    btn.type="button"; btn.className="nav-btn nav-dropdown-btn";
    btn.innerHTML=`${group.label}<span class="nav-caret">▾</span>`;
    const menu=document.createElement("div");
    menu.className="nav-dropdown-menu";
    group.items.forEach(([l,h])=>menu.appendChild(navLink(l,h)));
    btn.onclick=e=>{
      e.preventDefault();
      document.querySelectorAll(".nav-dropdown.open").forEach(x=>{if(x!==wrap)x.classList.remove("open")});
      wrap.classList.toggle("open");
    };
    wrap.append(btn,menu);
    return wrap;
  }

  function applyRole(){
    const mode=roleMode();
    document.querySelector(".admin-header")?.setAttribute("data-role-theme",mode);
    document.documentElement.setAttribute("data-gh-role",mode);
    const label=document.getElementById("mobileRoleLabel");
    if(label) label.textContent=
      mode==="dispatcher" ? "Dispatcher Panel" :
      mode==="super-admin" ? "Super Admin Panel" : "Admin Panel";
  }

  function buildRoleNav(){
    const nav=document.getElementById("adminDesktopNav");
    if(!nav)return;
    nav.innerHTML="";
    if(roleMode()==="dispatcher"){
      DISPATCHER_NAV.forEach(x=>nav.appendChild(x.items?dropdown(x):navLink(x.label,x.href)));
    }else{
      ADMIN_LINKS.forEach(([l,h])=>nav.appendChild(navLink(l,h)));
    }
  }

  applyRole();
  buildRoleNav();

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
    const mobileNav=document.getElementById("mobileSideNav");
    if(!mobileNav)return;
    mobileNav.innerHTML="";

    if(roleMode()==="dispatcher"){
      DISPATCHER_NAV.forEach(item=>{
        if(item.items){
          const title=document.createElement("div");
          title.className="mobile-nav-group-title";
          title.textContent=item.label;
          mobileNav.appendChild(title);
          item.items.forEach(([label,href])=>{
            const a=navLink(label,href);
            a.classList.add("mobile-nav-child");
            mobileNav.appendChild(a);
          });
        }else{
          mobileNav.appendChild(navLink(item.label,item.href));
        }
      });
    }else{
      document.querySelectorAll("#adminDesktopNav a.nav-btn").forEach(link=>{
        mobileNav.appendChild(navLink(link.textContent.trim(),link.getAttribute("href")||"#"));
      });
    }
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