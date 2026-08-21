document.addEventListener("DOMContentLoaded",async()=>{
const host=document.getElementById("adminHeader")||document.getElementById("headerContainer")||document.getElementById("header-container"); if(!host)return;
const res=await fetch("/admin/header.html"); host.innerHTML=await res.text();

const norm=v=>String(v||"").trim().toUpperCase().replace(/[\s-]+/g,"_");
const raw=norm(localStorage.getItem("role")||"");
const role=(raw==="SUPER_ADMIN"||raw==="SUPERADMIN")?"SUPER_ADMIN":raw==="DISPATCHER"?"DISPATCHER":"ADMIN";
document.getElementById("ghAdminHeader")?.setAttribute("data-role",role);

const roleLabel=role==="SUPER_ADMIN"?"Super Admin":role==="DISPATCHER"?"Dispatcher":"Admin";
document.getElementById("desktopRoleLabel").textContent=roleLabel;
document.getElementById("mobileRoleLabel").textContent=roleLabel+" Panel";

const company=localStorage.getItem("companyName")||localStorage.getItem("tenantName")||"Company";
const staff=localStorage.getItem("name")||localStorage.getItem("fullName")||"User";
document.getElementById("dynamicCompanyName").textContent=company;
document.getElementById("mobileCompanyName").textContent=company;
document.getElementById("staffDisplayName").textContent=staff;

const logo=localStorage.getItem("appLogo")||"/assets/logo.png";
document.querySelectorAll(".app-logo").forEach(x=>x.src=logo);

const I=(s)=>`<span class="ico">${s}</span>`;
const core=[
{l:"Dashboard",h:"dashboard.html",i:"⌂"},
{g:"Operations",i:"▣",items:[["Trips Hub","trips-hub.html","⇩"],["Trips","trips.html","☷"],["Dispatch","dispatch.html","▣"]]},
{l:"Final Confirmation",h:"dispatch-final-confirmation.html",i:"✓"},
{l:"Dispatch Review",h:"dispatch-review.html",i:"▤"},
{g:"Driver Follow-up",i:"♙",items:[["Driver Schedule","driver-schedule.html","▦"],["Drivers Map","maps.html","⌖"]]}
];
const admin=[
{l:"Add User",h:"users.html",i:"♙+"},{l:"Summary",h:"summary.html",i:"▥"},{l:"Refunds",h:"refunds.html",i:"↶"},
{l:"System Design",h:"system-design.html",i:"⚙"},{l:"Service Management",h:"service-management.html",i:"▱"},
{l:"Facility Pricing Override",h:"facility-pricing-override.html",i:"▦"},{l:"Smart Dispatch",h:"smart-dispatch-engine.html",i:"ϟ"}];
const superExtra=[{l:"Admin Billing",h:"admin-billing.html",i:"▤"},{l:"Payments",h:"payments.html",i:"$"}];

let nav=[...core]; if(role!=="DISPATCHER")nav.push(...admin); if(role==="SUPER_ADMIN")nav.push(...superExtra);

const desktop=document.getElementById("adminDesktopNav");
nav.forEach(x=>{
if(x.g){
 const w=document.createElement("div");w.className="nav-group";
 const b=document.createElement("button");b.className="nav-tile nav-group-btn";b.innerHTML=I(x.i)+`<span>${x.g}</span><b class="caret">▾</b>`;
 const m=document.createElement("div");m.className="nav-group-menu";
 x.items.forEach(([l,h,i])=>{const a=document.createElement("a");a.href=h;a.dataset.href=h;a.innerHTML=I(i)+`<span>${l}</span>`;m.appendChild(a)});
 b.onclick=e=>{e.preventDefault();document.querySelectorAll(".nav-group.open").forEach(y=>{if(y!==w)y.classList.remove("open")});w.classList.toggle("open")};
 w.append(b,m);desktop.appendChild(w);
}else{const a=document.createElement("a");a.href=x.h;a.dataset.href=x.h;a.className="nav-tile";a.innerHTML=I(x.i)+`<span>${x.l}</span>`;desktop.appendChild(a)}
});

const mobile=document.getElementById("mobileSideNav");
nav.forEach(x=>{if(x.g){const t=document.createElement("div");t.className="mobile-nav-group-title";t.textContent=x.g;mobile.appendChild(t);x.items.forEach(([l,h,i])=>{const a=document.createElement("a");a.href=h;a.dataset.href=h;a.innerHTML=I(i)+l;mobile.appendChild(a)})}else{const a=document.createElement("a");a.href=x.h;a.dataset.href=x.h;a.innerHTML=I(x.i)+x.l;mobile.appendChild(a)}});

const page=location.pathname.split("/").pop();
document.querySelectorAll("[data-href]").forEach(a=>a.classList.toggle("active",a.dataset.href===page));
document.querySelectorAll(".nav-group").forEach(g=>g.classList.toggle("has-active",!!g.querySelector("a.active")));

const tz=()=>localStorage.getItem("systemTimezone")||localStorage.getItem("appTimezone")||"America/Phoenix";
function tick(){const n=new Date();document.getElementById("headerDate").textContent=n.toLocaleDateString("en-US",{timeZone:tz(),weekday:"short",month:"short",day:"numeric",year:"numeric"});document.getElementById("headerTime").textContent=n.toLocaleTimeString("en-US",{timeZone:tz(),hour:"numeric",minute:"2-digit",second:"2-digit",hour12:true});const h=Number(new Intl.DateTimeFormat("en-US",{hour:"numeric",hour12:false,timeZone:tz()}).format(n));document.getElementById("welcomeMessage").textContent=h<12?"Good Morning":h<18?"Good Afternoon":"Good Evening";document.getElementById("weatherIcon").textContent=h<12?"☀️":h<18?"🌤️":"🌙"}tick();setInterval(tick,1000);

const side=document.getElementById("mobileSideMenu"),ov=document.getElementById("mobileMenuOverlay");
const open=()=>{side.classList.add("show");ov.classList.add("show")},close=()=>{side.classList.remove("show");ov.classList.remove("show")};
document.getElementById("mobileMenuBtn").onclick=open;document.getElementById("mobileCloseBtn").onclick=close;ov.onclick=close;
});
function logout(){["token","role","name","companyName"].forEach(k=>localStorage.removeItem(k));location.href="/login.html"}