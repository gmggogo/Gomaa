(function(){
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
const role=()=>{const r=norm(localStorage.getItem("role"));return (r==="SUPER_ADMIN"||r==="SUPERADMIN")?"SUPER_ADMIN":r==="DISPATCHER"?"DISPATCHER":"ADMIN"};
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
{l:"Refunds",h:"refunds.html",i:"refund"},
{g:"Pricing",i:"tag",items:[["Service Management","service-management.html","doc"],["Facility Pricing Override","facility-pricing-override.html","building"]]}
];
const extra=[{l:"Admin Billing",h:"admin-billing.html",i:"doc"},{l:"Payments",h:"payments.html",i:"money"}];
const settings={g:"Settings",i:"gear",items:[["System Design","system-design.html","doc"],["Smart Dispatch","smart-dispatch-engine.html","bolt"]]};

document.addEventListener("DOMContentLoaded",async()=>{
 const host=document.getElementById("adminHeader")||document.getElementById("headerContainer")||document.getElementById("header-container"); if(!host)return;
 const r=await fetch("/admin/header.html"); host.innerHTML=await r.text();

 const currentRole=role(); document.getElementById("ghAdminHeader")?.setAttribute("data-role",currentRole);
 const roleLabel=currentRole==="SUPER_ADMIN"?"Super Admin":currentRole==="DISPATCHER"?"Dispatcher":"Admin";
 document.getElementById("desktopRoleLabel").textContent=roleLabel;
 document.getElementById("mobileRoleLabel").textContent=roleLabel+" Panel";
 document.getElementById("roleTitle").textContent=currentRole==="DISPATCHER"?"Dispatcher":currentRole==="SUPER_ADMIN"?"Super Admin — Administrator":"Admin — Administrator";

 const company=localStorage.getItem("companyName")||localStorage.getItem("tenantName")||"";
 const staff=localStorage.getItem("name")||localStorage.getItem("fullName")||"";
 document.getElementById("dynamicCompanyName").textContent=company;
 document.getElementById("mobileCompanyName").textContent=company;
 document.getElementById("staffDisplayName").textContent=staff;
 const logo=localStorage.getItem("appLogo")||"/assets/logo.png"; document.querySelectorAll(".app-logo").forEach(x=>x.src=logo);

 let nav=[...core]; if(currentRole!=="DISPATCHER")nav.push(...admin); if(currentRole==="SUPER_ADMIN")nav.push(...extra); if(currentRole!=="DISPATCHER")nav.push(settings);

 const desktop=document.getElementById("adminDesktopNav");
 const mobile=document.getElementById("mobileSideNav");

 function link(item){
   const a=document.createElement("a"); a.href=item.h;a.dataset.href=item.h;a.className="gh-nav-tile";a.innerHTML=I(item.i)+`<span>${item.l}</span>`;return a;
 }
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

 const page=location.pathname.split("/").pop();
 document.querySelectorAll("[data-href]").forEach(a=>a.classList.toggle("active",a.dataset.href===page));
 document.querySelectorAll(".gh-nav-group").forEach(g=>g.classList.toggle("has-active",!!g.querySelector("a.active")));

 const tz=()=>localStorage.getItem("systemTimezone")||localStorage.getItem("appTimezone")||"America/Phoenix";
 function tick(){const n=new Date();document.getElementById("headerDate").textContent=n.toLocaleDateString("en-US",{timeZone:tz(),weekday:"short",month:"short",day:"numeric",year:"numeric"});document.getElementById("headerTime").textContent=n.toLocaleTimeString("en-US",{timeZone:tz(),hour:"numeric",minute:"2-digit",second:"2-digit",hour12:true});const h=Number(new Intl.DateTimeFormat("en-US",{hour:"numeric",hour12:false,timeZone:tz()}).format(n));document.getElementById("welcomeMessage").textContent=h<12?"Good Morning":h<18?"Good Afternoon":"Good Evening";document.getElementById("weatherIcon").textContent=h<12?"☀️":h<18?"🌤️":"🌙"} tick();setInterval(tick,1000);

 const drawer=document.getElementById("mobileSideMenu"),ov=document.getElementById("mobileMenuOverlay");
 const open=()=>{drawer.classList.add("show");ov.classList.add("show")},close=()=>{drawer.classList.remove("show");ov.classList.remove("show")};
 document.getElementById("mobileMenuBtn").onclick=open;document.getElementById("mobileCloseBtn").onclick=close;ov.onclick=close;
});
})();
function logout(){["token","role","name","companyName"].forEach(k=>localStorage.removeItem(k));location.href="/login.html"}