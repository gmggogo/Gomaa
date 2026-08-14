
 اول مشكله. رفيو سامري مش مظبوطه تاني حاجه حجم الايقونات كبير تالت   اسم الشركه فوق لازم في المربع اللي فوقه 

Edit


هو انتا حمار بقولك كلمه صن بيم نزلها لتحت وسيب اللوجو فوق ايه اللي انتا عامله دا وقولتلك صغر الزراير شويه 

Edit



Edit


Edit


كله تمام صح معادا رفيو جيس مش عارف لين مش مظبوطه ايه السبب قولي 

Edit


اعرض من الزراير الباقيه. انتا شايف

Edit


وليه اللوجو محظوط جوه مربع 


ممكن نصغر حجم اسم الشركه شويه عشان خاطر  لو الاسم اتنين او تلاته كلمات يجو جمب بعض

انتا مصغرتش حجم خط اسم الشركه انتا بوظت الدنيا 

صغرت اوي  كبرها شويه لان اسم السواق اكبر من اسم الشركه


Edit


هبعتلك صفحه تربس هتميل تعملي الخانات اللي فوق والرساله دي وكل بنفس الشكل بتعنا مودرن مع كلاسيك نفس الالوان 

هنعمل الاول كود الملفين دول وبعدين نعمل السيرفر ومتنساش نفس التنسيق 

AA89C475-5306-479C-A475-79DB2B6352B3.jpeg
IMG_14E630CA-0D1A-4B8E-9CC1-90C9B149A4E0.jpeg
انتا عملت ايه الشات بقي ظاهر علي طول علي الصفحات و والسواق بيبعت نش بيوصل 


Pasted text(20260814-080607).txt
Document


ببعت مفيش حاجه بتوصل وكمان الصفحه مفتوحه في الوش 

تمام فين بقي ايقونه الشات

IMG_8EC52AB8-AEF8-4C8C-B40E-90BC6965895D.jpeg
IMG_9108812A-0E49-4A17-A284-C414B9EF4103.jpeg

IMG_999DAC7C-BC05-4102-B3E3-3C476B869006.jpeg
IMG_65D818BC-5BB4-4843-9E76-53139A761C94.jpeg
انتا عملت ايه الصفحه مظهرتش وكمان كل الصفح اتحركت تحت اوي


دلوقتي في مشكلتين  الاولي الكلام نحيه اليمين المفروض يكون نحيه الشمال حجم الشات كبير مكان الكتابه تحت للارسال مستخبي تحت الهايدر المفروض يبقي في اسكرول. المسكله التانيه الكبيره مفيش اي حاجه في الادمن تستلم الرسايل 

حلو اوي انا عايز اعرف حاجه فين بقي في صفحه الادمن الاستلام مفيش 


Pasted text(20260814-091849).txt
Document
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
        ${date}<br>${time};

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


Pasted text(20260814-092155).txt
Document


 الرسايل بتتبعت بس مش بتظهر 

تمام، مش هنلمس driver-nav.js. قولي إنت عايز العداد الأخضر يظهر فين بالظبط وأنا أمشي على اللي تقوله.


D8ABB872-5F7A-4963-867C-4B759A6DAE4C.jpeg
هو في شات بس هنخليها تعد بس 

أيوه، فهمتك دلوقتي.

إحنا مش هنغير مكان الشات ولا شكله. هنسيب أيقونة Chat البنفسجي زي ما هي في الـBottom Nav، وكل اللي هنعمله إننا نضيف عليها عداد صغير أخضر فوق الأيقونة أو في الركن، يبين عدد رسائل الديسبتش الجديدة.

يعني مثلًا:

مفيش رسائل جديدة → مفيش عداد.

رسالة واحدة → 1

3 رسائل → 3

أول ما السواق يفتح الشات وتتقري الرسائل → العداد يرجع يختفي.

وده فعلًا غالبًا يتعمل في driver-nav.js لأن هو المسؤول عن الـBottom Nav الظاهر في الصورة، لكن مش هنغير تصميمه؛ هنضيف العداد فقط.


(function () {

  if(window.__SUNBEAM_DRIVER_NAV__){
    return;
  }

  window.__SUNBEAM_DRIVER_NAV__ = true;

  const ROUTES = {
    dashboard:"dashboard.html",
    trips:"trips.html",
    map:"map.html",
    chat:"chat.html",
    login:"login.html"
  };

  function currentPage(){

    const page = String(window.location.pathname || "")
      .split("/")
      .pop()
      .toLowerCase();

    if(page === "trips.html") return "trips";
    if(page === "map.html") return "map";
    if(page === "chat.html") return "chat";

    return "dashboard";
  }

  function go(key){
    const target = ROUTES[key];
    if(target) window.location.href = target;
  }

  function logout(){
    localStorage.removeItem("driverToken");
    localStorage.removeItem("loggedDriver");
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("driverName");
    localStorage.removeItem("companyName");
    localStorage.removeItem("systemTimezone");
    localStorage.removeItem("appTimezone");
    window.location.href = ROUTES.login;
  }

  function homeSvg(){
    return 
      <span class="nav-svg nav-home" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M3.5 11.2 12 4l8.5 7.2v8.8a1 1 0 0 1-1 1h-5.5v-6h-4v6H4.5a1 1 0 0 1-1-1z"></path>
        </svg>
      </span>
    ;
  }

  function tripsSvg(){
    return 
      <span class="nav-svg nav-trips" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6 8.5 8 5.8h8L18 8.5h1a2 2 0 0 1 2 2v4.7a1 1 0 0 1-1 1h-1v1.8a1 1 0 0 1-1 1h-1.2a1 1 0 0 1-1-1v-1.8H8.2v1.8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1.8H4a1 1 0 0 1-1-1v-4.7a2 2 0 0 1 2-2zm2.6 0h6.8l-1.1-1.7H9.7zM7 14.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm10 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z"></path>
        </svg>
      </span>
    ;
  }

  function mapSvg(){
    return 
      <span class="nav-svg nav-map" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 22s6-6.2 6-11a6 6 0 1 0-12 0c0 4.8 6 11 6 11zm0-8.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z"></path>
        </svg>
      </span>
    ;
  }

  function chatSvg(){
    return 
      <span class="nav-svg nav-chat" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 4c4.9 0 8.8 3.3 8.8 7.4 0 4.1-3.9 7.4-8.8 7.4-1.1 0-2.2-.2-3.2-.5L4 20l1.5-4.1c-1.5-1.3-2.3-2.8-2.3-4.5C3.2 7.3 7.1 4 12 4zm-3.3 6.4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm3.3 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm3.3 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"></path>
        </svg>
      </span>
    ;
  }

  function logoutSvg(){
    return 
      <span class="nav-svg nav-logout" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6 3h7a1 1 0 0 1 0 2H7v14h6a1 1 0 0 1 0 2H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"></path>
          <path d="M13 8.2a1 1 0 0 1 1.4 0l3.6 3.6-3.6 3.6a1 1 0 0 1-1.4-1.4l1.9-1.8H10a1 1 0 1 1 0-2h4.9L13 9.6a1 1 0 0 1 0-1.4z"></path>
        </svg>
      </span>
    ;
  }

  function renderNavigation(){

    const root = document.getElementById("driverNav");
    if(!root) return;

    const active = currentPage();

    root.innerHTML = 
      <div class="nav">

        <button id="navHome" class="${active === "dashboard" ? "active" : ""}" type="button">
          ${homeSvg()}
          Home
        </button>

        <button id="navTrips" class="${active === "trips" ? "active" : ""}" type="button">
          ${tripsSvg()}
          Trips
        </button>

        <button id="navMap" class="${active === "map" ? "active" : ""}" type="button">
          ${mapSvg()}
          Map
        </button>

        <button id="navChat" class="${active === "chat" ? "active" : ""}" type="button">
          ${chatSvg()}
          Chat
        </button>

        <button id="navLogout" type="button">
          ${logoutSvg()}
          Logout
        </button>

      </div>
    ;

    document.getElementById("navHome")?.addEventListener("click", ()=>go("dashboard"));
    document.getElementById("navTrips")?.addEventListener("click", ()=>go("trips"));
    document.getElementById("navMap")?.addEventListener("click", ()=>go("map"));
    document.getElementById("navChat")?.addEventListener("click", ()=>go("chat"));
    document.getElementById("navLogout")?.addEventListener("click", logout);
  }

  window.goHome = ()=>go("dashboard");
  window.goTrips = ()=>go("trips");
  window.goMap = ()=>go("map");
  window.goChat = ()=>go("chat");
  window.logout = logout;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", renderNavigation);
  }else{
    renderNavigation();
  }

})();

تمام، عدلت driver-nav.js نفسه من غير ما أغيّر شكل الناف.

اللي اتضاف:

Badge أخضر صغير على أيقونة Chat.

يحسب رسائل الديسبتش غير المقروءة.

يتحدث كل 5 ثواني.

لو مفيش رسائل جديدة يختفي.

أول ما السواق يفتح صفحة الشات، يتعلموا Read والرقم يختفي.


 




Library
/
برنامج صن بيم
/
driver-nav-chat-badge.txt


(function () {

  if(window.__SUNBEAM_DRIVER_NAV__){
    return;
  }

  window.__SUNBEAM_DRIVER_NAV__ = true;

  const ROUTES = {
    dashboard:"dashboard.html",
    trips:"trips.html",
    map:"map.html",
    chat:"chat.html",
    login:"login.html"
  };

  const CHAT_API = {
    messages:"/api/driver-chat/messages",
    read:"/api/driver-chat/read"
  };

  const CHAT_POLL_MS = 5000;

  let chatPollTimer = null;

  function safeParse(json,fallback = null){
    try{
      return JSON.parse(json);
    }catch{
      return fallback;
    }
  }

  function getLoggedDriver(){
    return safeParse(
      localStorage.getItem("loggedDriver"),
      {}
    );
  }

  function getDriverId(){

    const driver = getLoggedDriver();

    return String(
      driver?._id ||
      driver?.id ||
      driver?.driverId ||
      ""
    ).trim();
  }

  function getToken(){
    return (
      localStorage.getItem("driverToken") ||
      localStorage.getItem("token") ||
      ""
    );
  }

  function authHeaders(extra = {}){

    const token = getToken();

    const headers = {
      "Content-Type":"application/json",
      ...extra
    };

    if(token){
      headers.Authorization = `Bearer ${token}`;
      headers["x-access-token"] = token;
    }

    return headers;
  }

  function currentPage(){

    const page = String(window.location.pathname || "")
      .split("/")
      .pop()
      .toLowerCase();

    if(page === "trips.html") return "trips";
    if(page === "map.html") return "map";
    if(page === "chat.html") return "chat";

    return "dashboard";
  }

  function go(key){
    const target = ROUTES[key];
    if(target) window.location.href = target;
  }

  function logout(){

    stopChatPolling();

    localStorage.removeItem("driverToken");
    localStorage.removeItem("loggedDriver");
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("driverName");
    localStorage.removeItem("companyName");
    localStorage.removeItem("systemTimezone");
    localStorage.removeItem("appTimezone");

    window.location.href = ROUTES.login;
  }

  function homeSvg(){
    return `
      <span class="nav-svg nav-home" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M3.5 11.2 12 4l8.5 7.2v8.8a1 1 0 0 1-1 1h-5.5v-6h-4v6H4.5a1 1 0 0 1-1-1z"></path>
        </svg>
      </span>
    `;
  }

  function tripsSvg(){
    return `
      <span class="nav-svg nav-trips" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6 8.5 8 5.8h8L18 8.5h1a2 2 0 0 1 2 2v4.7a1 1 0 0 1-1 1h-1v1.8a1 1 0 0 1-1 1h-1.2a1 1 0 0 1-1-1v-1.8H8.2v1.8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1.8H4a1 1 0 0 1-1-1v-4.7a2 2 0 0 1 2-2zm2.6 0h6.8l-1.1-1.7H9.7zM7 14.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm10 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z"></path>
        </svg>
      </span>
    `;
  }

  function mapSvg(){
    return `
      <span class="nav-svg nav-map" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 22s6-6.2 6-11a6 6 0 1 0-12 0c0 4.8 6 11 6 11zm0-8.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z"></path>
        </svg>
      </span>
    `;
  }

  function chatSvg(){
    return `
      <span class="nav-svg nav-chat" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 4c4.9 0 8.8 3.3 8.8 7.4 0 4.1-3.9 7.4-8.8 7.4-1.1 0-2.2-.2-3.2-.5L4 20l1.5-4.1c-1.5-1.3-2.3-2.8-2.3-4.5C3.2 7.3 7.1 4 12 4zm-3.3 6.4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm3.3 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm3.3 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"></path>
        </svg>
      </span>
    `;
  }

  function logoutSvg(){
    return `
      <span class="nav-svg nav-logout" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6 3h7a1 1 0 0 1 0 2H7v14h6a1 1 0 0 1 0 2H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"></path>
          <path d="M13 8.2a1 1 0 0 1 1.4 0l3.6 3.6-3.6 3.6a1 1 0 0 1-1.4-1.4l1.9-1.8H10a1 1 0 1 1 0-2h4.9L13 9.6a1 1 0 0 1 0-1.4z"></path>
        </svg>
      </span>
    `;
  }

  function injectChatBadgeStyle(){

    if(
      document.getElementById(
        "driverChatBadgeStyle"
      )
    ){
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "driverChatBadgeStyle";

    style.textContent = `
      #navChat{
        position:relative;
      }

      #navChat .nav-chat{
        position:relative;
      }

      .driver-chat-badge{
        position:absolute;

        top:-8px;
        right:-11px;

        min-width:20px;
        height:20px;

        display:none;
        align-items:center;
        justify-content:center;

        padding:0 6px;

        border-radius:11px;

        color:#04172f;
        background:#28ef70;

        border:2px solid #ffffff;

        box-shadow:
          0 0 0 2px rgba(40,239,112,.18),
          0 3px 8px rgba(0,0,0,.25);

        font-size:10px;
        line-height:1;
        font-weight:900;

        z-index:5;
      }

      .driver-chat-badge.show{
        display:flex;
      }
    `;

    document.head.appendChild(style);
  }

  function renderNavigation(){

    const root = document.getElementById("driverNav");
    if(!root) return;

    const active = currentPage();

    injectChatBadgeStyle();

    root.innerHTML = `
      <div class="nav">

        <button id="navHome" class="${active === "dashboard" ? "active" : ""}" type="button">
          ${homeSvg()}
          Home
        </button>

        <button id="navTrips" class="${active === "trips" ? "active" : ""}" type="button">
          ${tripsSvg()}
          Trips
        </button>

        <button id="navMap" class="${active === "map" ? "active" : ""}" type="button">
          ${mapSvg()}
          Map
        </button>

        <button id="navChat" class="${active === "chat" ? "active" : ""}" type="button">
          ${chatSvg()}
          <span
            class="driver-chat-badge"
            id="driverChatBadge"
            aria-label="Unread chat messages"
          ></span>
          Chat
        </button>

        <button id="navLogout" type="button">
          ${logoutSvg()}
          Logout
        </button>

      </div>
    `;

    document.getElementById("navHome")?.addEventListener("click", ()=>go("dashboard"));
    document.getElementById("navTrips")?.addEventListener("click", ()=>go("trips"));
    document.getElementById("navMap")?.addEventListener("click", ()=>go("map"));
    document.getElementById("navChat")?.addEventListener("click", ()=>go("chat"));
    document.getElementById("navLogout")?.addEventListener("click", logout);

    initChatUnread();
  }

  function setChatBadge(count){

    const badge =
      document.getElementById(
        "driverChatBadge"
      );

    if(!badge) return;

    const n =
      Number(count || 0);

    if(n > 0){

      badge.textContent =
        n > 99
          ? "99+"
          : String(n);

      badge.classList.add("show");

    }else{

      badge.textContent = "";
      badge.classList.remove("show");

    }
  }

  async function loadUnreadCount(){

    const driverId =
      getDriverId();

    if(!driverId){
      setChatBadge(0);
      return;
    }

    try{

      const response =
        await fetch(
          `${CHAT_API.messages}?driverId=${encodeURIComponent(driverId)}`,
          {
            method:"GET",
            headers:authHeaders(),
            cache:"no-store"
          }
        );

      if(!response.ok){
        return;
      }

      const payload =
        await response.json();

      const messages =
        Array.isArray(payload)
          ? payload
          : (
              Array.isArray(payload?.messages)
                ? payload.messages
                : []
            );

      const unread =
        messages.filter(message=>{

          const sender =
            String(
              message?.senderType ||
              message?.senderRole ||
              ""
            ).toUpperCase();

          return (
            sender === "DISPATCH" &&
            message?.readByDriver !== true
          );
        }).length;

      setChatBadge(unread);

    }catch(error){

      console.log(
        "DRIVER CHAT BADGE ERROR:",
        error
      );

    }
  }

  async function markDriverChatRead(){

    const driverId =
      getDriverId();

    if(!driverId){
      return;
    }

    try{

      await fetch(
        CHAT_API.read,
        {
          method:"PATCH",
          headers:authHeaders(),
          body:JSON.stringify({
            driverId,
            reader:"DRIVER"
          })
        }
      );

      setChatBadge(0);

    }catch(error){

      console.log(
        "DRIVER CHAT READ ERROR:",
        error
      );

    }
  }

  function startChatPolling(){

    stopChatPolling();

    chatPollTimer =
      window.setInterval(
        loadUnreadCount,
        CHAT_POLL_MS
      );
  }

  function stopChatPolling(){

    if(chatPollTimer){

      window.clearInterval(
        chatPollTimer
      );

      chatPollTimer = null;

    }
  }

  async function initChatUnread(){

    if(currentPage() === "chat"){

      await markDriverChatRead();

    }else{

      await loadUnreadCount();

    }

    startChatPolling();

    document.addEventListener(
      "visibilitychange",
      function(){

        if(document.hidden){

          stopChatPolling();

        }else{

          if(currentPage() === "chat"){

            markDriverChatRead();

          }else{

            loadUnreadCount();

          }

          startChatPolling();

        }

      },
      {
        once:false
      }
    );
  }

  window.goHome = ()=>go("dashboard");
  window.goTrips = ()=>go("trips");
  window.goMap = ()=>go("map");
  window.goChat = ()=>go("chat");
  window.logout = logout;

  if(document.readyState === "loading"){

    document.addEventListener(
      "DOMContentLoaded",
      renderNavigation
    );

  }else{

    renderNavigation();

  }

})();
