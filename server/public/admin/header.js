(function(){

/* =========================================================
   STAFF TAB SESSION ISOLATION
   ---------------------------------------------------------
   Existing admin pages still call localStorage.getItem("token"),
   localStorage.getItem("role"), etc.

   localStorage is shared by every tab, which caused Admin and
   Dispatcher to overwrite each other.

   This compatibility bridge makes those STAFF keys behave like
   per-tab values while leaving the rest of localStorage untouched.
   It must run immediately when header.js is loaded.
========================================================= */
(function installStaffTabStorageBridge(){

  if(window.__GH_STAFF_TAB_STORAGE_BRIDGE__){
    return;
  }

  window.__GH_STAFF_TAB_STORAGE_BRIDGE__ = true;

  const STAFF_KEYS = new Set([
    "token",
    "role",
    "name",
    "fullName",
    "tenantId",
    "tenantSlug",
    "tenant",
    "tenantName",
    "companyName",
    "appLogo",
    "systemTimezone",
    "appTimezone"
  ]);

  const originalGetItem =
    Storage.prototype.getItem;

  const originalSetItem =
    Storage.prototype.setItem;

  const originalRemoveItem =
    Storage.prototype.removeItem;

  Storage.prototype.getItem =
    function(key){

      const k =
        String(key || "");

      if(
        this === window.localStorage &&
        STAFF_KEYS.has(k)
      ){

        const sessionKey =
          k === "token"
            ? "staffToken"
            : k === "role"
              ? "staffRole"
              : k === "name"
                ? "staffName"
                : k === "tenantId"
                  ? "staffTenantId"
                  : k === "tenantSlug"
                    ? "staffTenantSlug"
                    : "staffCompat:" + k;

        const value =
          originalGetItem.call(
            window.sessionStorage,
            sessionKey
          );

        if(value !== null){
          return value;
        }
      }

      return originalGetItem.call(
        this,
        k
      );
    };

  Storage.prototype.setItem =
    function(key,value){

      const k =
        String(key || "");

      if(
        this === window.localStorage &&
        STAFF_KEYS.has(k)
      ){

        const sessionKey =
          k === "token"
            ? "staffToken"
            : k === "role"
              ? "staffRole"
              : k === "name"
                ? "staffName"
                : k === "tenantId"
                  ? "staffTenantId"
                  : k === "tenantSlug"
                    ? "staffTenantSlug"
                    : "staffCompat:" + k;

        originalSetItem.call(
          window.sessionStorage,
          sessionKey,
          String(value ?? "")
        );

        return;
      }

      return originalSetItem.call(
        this,
        k,
        String(value ?? "")
      );
    };

  Storage.prototype.removeItem =
    function(key){

      const k =
        String(key || "");

      if(
        this === window.localStorage &&
        STAFF_KEYS.has(k)
      ){

        const sessionKey =
          k === "token"
            ? "staffToken"
            : k === "role"
              ? "staffRole"
              : k === "name"
                ? "staffName"
                : k === "tenantId"
                  ? "staffTenantId"
                  : k === "tenantSlug"
                    ? "staffTenantSlug"
                    : "staffCompat:" + k;

        originalRemoveItem.call(
          window.sessionStorage,
          sessionKey
        );

        return;
      }

      return originalRemoveItem.call(
        this,
        k
      );
    };

})();

const svg={
home:'<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
car:'<svg viewBox="0 0 24 24"><path d="M4 15h16l-1.5-5H5.5L4 15Z"/><path d="M8 10l1-3h6l1 3"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/></svg>',
check:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 8.5"/></svg>',
doc:'<svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h5"/><path d="M10 12h6M10 16h6"/></svg>',
user:'<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/></svg>',
plus:'<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="3"/><path d="M3.5 21v-2a5.5 5.5 0 0 1 11 0v2"/><path d="M18 8v6M15 11h6"/></svg>',
chart:'<svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7"/><path d="M3 20h18"/></svg>',
refund:'<svg viewBox="0 0 24 24"><path d="M7 7h8a5 5 0 0 1 0 10H8"/><path d="m7 7 3-3M7 7l3 3"/></svg>',
tag:'<svg viewBox="0 0 24 24"><path d="M4 12 12 4h7v7l-8 8-7-7Z"/><circle cx="16" cy="8" r="1.2"/></svg>',
gear:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>',
money:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>',
logout:'<svg viewBox="0 0 24 24"><path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/></svg>',
list:'<svg viewBox="0 0 24 24"><path d="M7 5h13M7 12h13M7 19h13"/><circle cx="3.5" cy="5" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="19" r="1"/></svg>',
calendar:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
map:'<svg viewBox="0 0 24 24"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></svg>',
bolt:'<svg viewBox="0 0 24 24"><path d="m13 2-7 12h6l-1 8 7-12h-6z"/></svg>',
building:'<svg viewBox="0 0 24 24"><path d="M4 21V5h16v16"/><path d="M8 9h2M14 9h2M8 13h2M14 13h2M10 21v-4h4v4"/></svg>'
};
const I=n=>`<span class="gh-icon">${svg[n]||svg.home}</span>`;
const norm=v=>String(v||"").trim().toUpperCase().replace(/[\s-]+/g,"_");
function staffSessionValue(sessionKey,legacyKey){
  return String(
    sessionStorage.getItem(sessionKey) ||
    localStorage.getItem(legacyKey) ||
    ""
  ).trim();
}

function syncStaffLegacyStorage(){
  /*
    No global localStorage mirroring anymore.
    The storage bridge above makes old admin scripts read this tab's
    sessionStorage transparently.
  */
  const pairs = [
    ["staffToken","token"],
    ["staffRole","role"],
    ["staffName","name"],
    ["staffTenantId","tenantId"],
    ["staffTenantSlug","tenantSlug"]
  ];

  pairs.forEach(([sessionKey,legacyKey])=>{

    if(sessionStorage.getItem(sessionKey)){
      return;
    }

    const legacy =
      localStorage.getItem(legacyKey);

    if(legacy){
      sessionStorage.setItem(
        sessionKey,
        legacy
      );
    }
  });
}

const role=()=>{
  const r=norm(
    staffSessionValue("staffRole","role")
  );
  return (r==="SUPER_ADMIN"||r==="SUPERADMIN")
    ?"SUPER_ADMIN"
    :r==="DISPATCHER"
      ?"DISPATCHER"
      :"ADMIN";
};
const core=[
{l:"Dashboard",h:"dashboard.html",i:"home"},
{g:"Operations",i:"car",items:[["Trips Hub","trips-hub.html","list"],["Trips","trips.html","list"],["Dispatch","dispatch.html","car"]]},
{l:"Final Confirmation",h:"dispatch-final-confirmation.html",i:"check"},
{l:"Dispatch Review",h:"dispatch-review.html",i:"doc"},
{g:"Driver Follow-up",i:"user",items:[["Driver Schedule","driver-schedule.html","calendar"],["Drivers Map","maps.html","map"]]}
];
const admin=[
{l:"Add User",h:"users.html",i:"plus"},
{l:"Summary",h:"summary.html",i:"chart"},
{l:"Refunds",h:"refunds.html",i:"refund"}
];
const extra=[
{l:"Admin Billing",h:"admin-billing.html",i:"doc"},
{l:"Payments",h:"payments.html",i:"money"},
{l:"Payroll",h:"payroll.html",i:"money"},
{l:"Taxes",h:"tax-report.html",i:"chart"},
{g:"Pricing",i:"tag",items:[["Service Management","service-management.html","doc"],["Facility Pricing Override","facility-pricing-override.html","building"]]}
];
const settings={g:"Settings",i:"gear",items:[["System Design","system-design.html","doc"],["Smart Dispatch","smart-dispatch-engine.html","bolt"]]};

document.addEventListener("DOMContentLoaded",async()=>{

 /* Restore this tab's staff identity before header/auth logic runs. */
 syncStaffLegacyStorage();

 /*
   Auth is now isolated per tab by the storage bridge above.
 */
 const host=document.getElementById("adminHeader")||document.getElementById("headerContainer")||document.getElementById("header-container"); if(!host)return;
 const r=await fetch("/admin/header.html"); host.innerHTML=await r.text();

 const currentRole=role(); document.getElementById("ghAdminHeader")?.setAttribute("data-role",currentRole);
 const roleLabel=currentRole==="SUPER_ADMIN"?"Super Admin":currentRole==="DISPATCHER"?"Dispatcher":"Admin";
 const tenantNameForHeader=localStorage.getItem("tenantName")||localStorage.getItem("companyName")||"";
 const saasEl=document.getElementById("saasCompanyName"); if(saasEl) saasEl.textContent=tenantNameForHeader;
 document.getElementById("mobileRoleLabel").textContent=roleLabel+" Panel";
 document.getElementById("roleTitle").textContent=currentRole==="DISPATCHER"?"Dispatcher":currentRole==="SUPER_ADMIN"?"Super Admin — Administrator":"Admin — Administrator";

 const fallbackCompany=localStorage.getItem("companyName")||localStorage.getItem("tenantName")||"";
 const fallbackStaff=staffSessionValue("staffName","name")||localStorage.getItem("fullName")||"";

 async function ensureBrandingLoaded(){
   if(!window.Branding){
     await new Promise(resolve=>{
       const existing=document.querySelector('script[src="/core/branding.js"]');
       if(existing){
         if(window.Branding){resolve();return;}
         existing.addEventListener("load",resolve,{once:true});
         setTimeout(resolve,700);return;
       }
       const script=document.createElement("script");
       script.src="/core/branding.js";script.onload=resolve;script.onerror=resolve;document.body.appendChild(script);
     });
   }
   if(window.Branding&&typeof window.Branding.load==="function"){
     try{await window.Branding.load();}catch(err){console.log("HEADER BRANDING LOAD ERROR:",err);}
   }
 }

 await ensureBrandingLoaded();
 const brandingData=window.Branding?.data||{};
 const tenantCompany=brandingData.companyName||fallbackCompany||"";
 const tenantMainLogo=brandingData.mainLogo||(typeof window.Branding?.getMainLogo==="function"?window.Branding.getMainLogo():"")||"/assets/logo.png";
 const companyEl=document.getElementById("dynamicCompanyName");
 const mobileCompanyEl=document.getElementById("mobileCompanyName");
 const staffEl=document.getElementById("staffDisplayName");
 if(companyEl)companyEl.textContent=tenantCompany;
 if(mobileCompanyEl)mobileCompanyEl.textContent=tenantCompany;
 if(staffEl)staffEl.textContent=fallbackStaff;
 document.querySelectorAll(".app-logo").forEach(img=>{img.src=tenantMainLogo;});
 if(tenantCompany)localStorage.setItem("companyName",tenantCompany);
 if(tenantMainLogo)localStorage.setItem("appLogo",tenantMainLogo);

 let nav=[...core]; if(currentRole!=="DISPATCHER")nav.push(...admin); if(currentRole==="SUPER_ADMIN")nav.push(...extra); if(currentRole!=="DISPATCHER")nav.push(settings);
 const desktop=document.getElementById("adminDesktopNav");
 const mobile=document.getElementById("mobileSideNav");

 function link(item){const a=document.createElement("a");a.href=item.h;a.dataset.href=item.h;a.className="gh-nav-tile";a.innerHTML=I(item.i)+`<span>${item.l}</span>`;return a;}
 function group(item){
   const w=document.createElement("div");w.className="gh-nav-group";
   const b=document.createElement("button");b.type="button";b.className="gh-nav-tile gh-nav-group-btn";b.innerHTML=I(item.i)+`<span>${item.g}</span><b class="gh-caret">▾</b>`;
   const m=document.createElement("div");m.className="gh-nav-menu";
   item.items.forEach(([l,h,i])=>{const a=document.createElement("a");a.href=h;a.dataset.href=h;a.innerHTML=I(i)+`<span>${l}</span>`;m.appendChild(a)});
   b.onclick=e=>{e.preventDefault();document.querySelectorAll(".gh-nav-group.open").forEach(x=>{if(x!==w)x.classList.remove("open")});w.classList.toggle("open")};
   w.append(b,m);return w;
 }
 nav.forEach(x=>desktop.appendChild(x.g?group(x):link(x)));
 const lo=document.createElement("button");lo.type="button";lo.className="gh-nav-tile gh-logout-tile";lo.innerHTML=I("logout")+"<span>Log Out</span>";lo.onclick=logout;desktop.appendChild(lo);

 nav.forEach(x=>{
   if(x.g){
     const t=document.createElement("div");t.className="gh-mobile-group-title";t.textContent=x.g;mobile.appendChild(t);
     x.items.forEach(([l,h,i])=>{const a=document.createElement("a");a.href=h;a.dataset.href=h;a.innerHTML=I(i)+`<span>${l}</span>`;mobile.appendChild(a)});
   }else{const a=link(x);a.className="";mobile.appendChild(a)}
 });

 setTimeout(()=>{
   const data=window.Branding?.data||{};
   const latestCompany=data.companyName||localStorage.getItem("companyName")||"";
   const latestLogo=data.mainLogo||(typeof window.Branding?.getMainLogo==="function"?window.Branding.getMainLogo():"")||localStorage.getItem("appLogo")||"/assets/logo.png";
   const a=document.getElementById("dynamicCompanyName"),c=document.getElementById("mobileCompanyName");
   if(a)a.textContent=latestCompany;if(c)c.textContent=latestCompany;
   document.querySelectorAll(".app-logo").forEach(img=>{img.src=latestLogo;});
 },350);

 const page=location.pathname.split("/").pop();
 document.querySelectorAll("[data-href]").forEach(a=>a.classList.toggle("active",a.dataset.href===page));
 document.querySelectorAll(".gh-nav-group").forEach(g=>g.classList.toggle("has-active",!!g.querySelector("a.active")));

 /* ALERT BADGES — VISUAL ONLY; EXISTING HEADER SIZE/COLORS ARE UNCHANGED */
 const alertStyle=document.createElement("style");
 alertStyle.textContent=`
 .gh-alert-hot{position:relative!important;box-shadow:0 0 0 2px rgba(255,186,35,.75),0 0 15px rgba(255,176,19,.38)!important}
 .gh-alert-badge{position:absolute;right:4px;top:3px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#ffb11b;color:#172033;font-size:8px;font-weight:900;line-height:1;z-index:5}
 `;
 document.head.appendChild(alertStyle);

 function applyHeaderAlerts(detail){
   const pending=Number(detail?.pendingConfirmation??localStorage.getItem("dashboardPendingConfirmationCount")??0);
   const fresh=Number(detail?.newTrips??localStorage.getItem("dashboardNewTripsCount")??0);

   const finalLink=document.querySelector('[data-href="dispatch-final-confirmation.html"]');
   if(finalLink){
     finalLink.classList.toggle("gh-alert-hot",pending>0);
     finalLink.querySelector(".gh-alert-badge")?.remove();
     if(pending>0){
       const b=document.createElement("span");b.className="gh-alert-badge";b.textContent=pending;finalLink.appendChild(b);
     }
   }

   const opsGroup=[...document.querySelectorAll(".gh-nav-group")].find(g=>g.querySelector('[data-href="trips-hub.html"]'));
   const opsButton=opsGroup?.querySelector(".gh-nav-group-btn");
   if(opsButton){
     opsButton.classList.toggle("gh-alert-hot",fresh>0);
     opsButton.querySelector(".gh-alert-badge")?.remove();
     if(fresh>0){
       const b=document.createElement("span");b.className="gh-alert-badge";b.textContent=fresh;opsButton.appendChild(b);
     }
   }
 }
 window.addEventListener("gh-dashboard-alerts",e=>applyHeaderAlerts(e.detail||{}));
 applyHeaderAlerts({});

 /* PAYROLL SIGN IN — shown only when today's staff schedule is eligible. */
 async function setupPayrollSignIn(){
   const token=staffSessionValue("staffToken","token");
   if(!token)return;

   const signInSlot=document.getElementById("payrollSignInSlot");
   if(!signInSlot)return;

   const style=document.createElement("style");
   style.textContent=`
   .gh-payroll-signin-slot{display:flex;min-height:0;align-items:center;justify-content:center;margin-top:7px}
   .gh-payroll-signin{min-width:118px;padding:9px 16px;border:2px solid #eaffdf;border-radius:11px;background:linear-gradient(180deg,#62d443,#269c1b 60%,#167d10);color:#fff;font-size:13px;font-weight:1000;letter-spacing:.45px;cursor:pointer;box-shadow:0 0 0 0 rgba(89,239,72,.75),0 4px 0 rgba(12,91,7,.35),inset 0 1px 0 rgba(255,255,255,.4);white-space:nowrap;position:relative;z-index:2;animation:ghPayrollSignInPulse 1.05s ease-in-out infinite}
   .gh-payroll-signin:hover{filter:brightness(1.12);animation-play-state:paused}
   .gh-payroll-signin:disabled{cursor:wait;opacity:.72}
   .gh-payroll-signin-note{padding:6px 10px;border-radius:9px;background:rgba(255,255,255,.16);color:#fff;font-size:11px;font-weight:900;white-space:nowrap;position:relative;z-index:2}
   @keyframes ghPayrollSignInPulse{0%,100%{filter:brightness(.92);transform:scale(1);box-shadow:0 0 0 0 rgba(89,239,72,.72),0 4px 0 rgba(12,91,7,.35)}50%{filter:brightness(1.28);transform:scale(1.055);box-shadow:0 0 0 9px rgba(89,239,72,0),0 5px 0 rgba(12,91,7,.35),0 0 20px rgba(104,255,84,.9)}}
   @media(max-width:900px){.gh-payroll-signin{min-width:auto;padding:8px 10px;font-size:11px}.gh-payroll-signin-note{display:none}}
   `;
   document.head.appendChild(style);

   async function payrollRequest(url,options={}){
     const response=await fetch(url,{
       cache:"no-store",
       ...options,
       headers:{
         ...(options.body?{"Content-Type":"application/json"}:{}),
         ...(options.headers||{}),
         Authorization:`Bearer ${token}`
       }
     });
     const data=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(data.message||`HTTP ${response.status}`);
     return data;
   }

   try{
     const status=await payrollRequest("/api/payroll/staff-signin/status");
     if(status.showSignIn!==true)return;

     const button=document.createElement("button");
     button.type="button";
     button.className="gh-payroll-signin";
     button.textContent="SIGN IN";
     button.title=`Sign in and credit ${Number(status.creditedHours||0)} scheduled hours`;

     button.addEventListener("click",async()=>{
       if(button.disabled)return;
       button.disabled=true;
       button.textContent="SIGNING IN...";

       try{
         const result=await payrollRequest("/api/payroll/staff-signin",{method:"POST"});
         button.remove();

         const note=document.createElement("div");
         note.className="gh-payroll-signin-note";
         note.textContent=`SIGNED IN · ${Number(result.creditedHours||status.creditedHours||0)} HRS`;
         signInSlot.appendChild(note);
         setTimeout(()=>note.remove(),5000);
       }catch(err){
         button.disabled=false;
         button.textContent="SIGN IN";
         window.alert(err.message||"Sign In failed");
       }
     });

     signInSlot.appendChild(button);
   }catch(err){
     console.log("PAYROLL SIGN IN STATUS ERROR:",err);
   }
 }

 await setupPayrollSignIn();

 const tz=()=>localStorage.getItem("systemTimezone")||localStorage.getItem("appTimezone")||"America/Phoenix";
 function tick(){const n=new Date();document.getElementById("headerDate").textContent=n.toLocaleDateString("en-US",{timeZone:tz(),weekday:"short",month:"short",day:"numeric",year:"numeric"});document.getElementById("headerTime").textContent=n.toLocaleTimeString("en-US",{timeZone:tz(),hour:"numeric",minute:"2-digit",second:"2-digit",hour12:true});const h=Number(new Intl.DateTimeFormat("en-US",{hour:"numeric",hour12:false,timeZone:tz()}).format(n));document.getElementById("welcomeMessage").textContent=h<12?"Good Morning":h<18?"Good Afternoon":"Good Evening";document.getElementById("weatherIcon").textContent=h<12?"☀️":h<18?"🌤️":"🌙"} tick();setInterval(tick,1000);

 const drawer=document.getElementById("mobileSideMenu"),ov=document.getElementById("mobileMenuOverlay");
 const open=()=>{drawer.classList.add("show");ov.classList.add("show")},close=()=>{drawer.classList.remove("show");ov.classList.remove("show")};
 document.getElementById("mobileMenuBtn").onclick=open;document.getElementById("mobileCloseBtn").onclick=close;ov.onclick=close;
});
})();
function logout(){

  const tenantSlug =
    String(
      sessionStorage.getItem("staffTenantSlug") ||
      sessionStorage.getItem("loginTenantSlug") ||
      ""
    )
    .trim()
    .toLowerCase();

  [
    "staffToken",
    "staffRole",
    "staffName",
    "staffTenantId",
    "staffTenantSlug",
    "staffCompat:fullName",
    "staffCompat:tenant",
    "staffCompat:tenantName",
    "staffCompat:companyName",
    "staffCompat:appLogo",
    "staffCompat:systemTimezone",
    "staffCompat:appTimezone"
  ].forEach(
    k=>sessionStorage.removeItem(k)
  );

  sessionStorage.removeItem(
    "loginTenantSlug"
  );

  if(tenantSlug){

    sessionStorage.setItem(
      "loginTenantSlug",
      tenantSlug
    );

    location.href=
      "/login.html?tenant="+
      encodeURIComponent(tenantSlug);

    return;
  }

  location.href="/login.html";
}