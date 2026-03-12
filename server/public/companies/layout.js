document.addEventListener("DOMContentLoaded", async () => {

const container = document.getElementById("layoutHeader");
if(!container) return;

/* ================= CSS ================= */

if(!document.getElementById("sunbeamLayoutCSS")){

const style = document.createElement("style");
style.id="sunbeamLayoutCSS";

style.textContent=`

.header{
background:linear-gradient(90deg,#0f172a,#1e3a8a);
color:white;
padding:18px 30px;
position:sticky;
top:0;
z-index:1000;
}

.top-section{
display:flex;
justify-content:space-between;
align-items:center;
flex-wrap:wrap;
gap:10px;
}

.logo{
height:60px;
}

.logged-company{
font-size:22px;
font-weight:700;
color:#facc15;
}

.greeting{
font-size:14px;
}

.clock{
font-size:13px;
opacity:.9;
}

/* ===== ticker ===== */

.header-ticker{
width:100%;
text-align:center;
overflow:hidden;
margin-top:5px;
}

.header-ticker-text{
white-space:nowrap;
font-size:14px;
font-weight:600;
animation:tickerMove 18s linear infinite;
}

@keyframes tickerMove{
0%{transform:translateX(100%)}
100%{transform:translateX(-100%)}
}

/* ===== NAV ===== */

.nav{
display:flex;
justify-content:center;
gap:25px;
background:#000;
padding:12px 10px;
margin-top:10px;
flex-wrap:wrap;
border-radius:10px;
}

.nav a{
color:white;
text-decoration:none;
font-size:14px;
padding:6px 16px;
border-radius:8px;
}

.nav a.active{
background:#facc15;
color:black;
font-weight:700;
}

/* ===== MOBILE ===== */

@media(max-width:768px){

.top-section{
flex-direction:column;
text-align:center;
}

.logo{
height:50px;
margin-top:5px;
}

.nav{
gap:10px;
}

.nav a{
font-size:12px;
padding:6px 10px;
}

.header-ticker-text{
font-size:12px;
}

}

`;

document.head.appendChild(style);

}

/* ================= HEADER ================= */

container.innerHTML = `

<div class="header">

<div class="top-section">

<div>
<div class="logged-company" id="companyName">Sunbeam</div>
<div class="greeting" id="greetingText"></div>
<div class="clock" id="azDateTime"></div>
</div>

<img src="../assets/logo.png" class="logo">

</div>

<div class="header-ticker">
<div class="header-ticker-text">
Sunbeam Transportation — Safe • Reliable • On-Time Transportation You Can Trust
</div>
</div>

<div class="nav">

<a href="dashboard.html">Dashboard</a>
<a href="add-trip.html">Add Trip</a>
<a href="review.html">Review</a>
<a href="summary.html">Summary</a>
<a href="taxes.html">Taxes</a>
<a href="#" id="logoutBtn">Logout</a>

</div>

</div>

`;

/* ================= AUTH ================= */

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const name  = localStorage.getItem("name");

if(!token || role!=="company"){
window.location.replace("company-login.html");
return;
}

/* ================= ACTIVE LINK ================= */

const currentPage = window.location.pathname.split("/").pop();

document.querySelectorAll(".nav a").forEach(link=>{
if(link.getAttribute("href")===currentPage){
link.classList.add("active");
}
});

/* ================= COMPANY NAME ================= */

try{

const res = await fetch("/api/company/me",{
headers:{
Authorization:"Bearer "+token
}
});

if(res.ok){

const data = await res.json();

document.getElementById("companyName").innerText =
data.name || name || "Company";

}else{

document.getElementById("companyName").innerText =
name || "Company";

}

}catch{

document.getElementById("companyName").innerText =
name || "Company";

}

/* ================= LOGOUT ================= */

document.getElementById("logoutBtn").addEventListener("click",e=>{
e.preventDefault();
localStorage.removeItem("token");
localStorage.removeItem("role");
localStorage.removeItem("name");
window.location.replace("company-login.html");
});

/* ================= TIME ================= */

function updateTime(){

const now = new Date();

const formatted = now.toLocaleString("en-US",{
timeZone:"America/Phoenix",
weekday:"long",
year:"numeric",
month:"long",
day:"numeric",
hour:"numeric",
minute:"2-digit",
second:"2-digit",
hour12:true
});

document.getElementById("azDateTime").innerText = formatted;

const hour = now.getHours();

let greeting="Good Evening";

if(hour<12) greeting="Good Morning";
else if(hour<18) greeting="Good Afternoon";

document.getElementById("greetingText").innerText = greeting;

}

updateTime();
setInterval(updateTime,1000);

});