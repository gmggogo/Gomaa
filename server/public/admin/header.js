// ================= LOAD HEADER =================

fetch("header.html")
.then(res => res.text())
.then(html => {

document.getElementById("adminHeader").innerHTML = html;

setActiveNav();

startArizonaTime();

loadAdminName();

});



// ================= GET ADMIN NAME =================

async function loadAdminName(){

let adminName = "Admin";

try{

const res = await fetch("/api/users/admin");

const users = await res.json();

if(users.length > 0){

adminName = users[0].name;

}

}catch(e){}

startWelcomeMessage(adminName);

}



// ================= ACTIVE NAV =================

function setActiveNav(){

const page = location.pathname.split("/").pop();

document.querySelectorAll(".nav-btn").forEach(btn => {

if(btn.getAttribute("href") === page){

btn.classList.add("active");

}

});

}



// ================= ARIZONA TIME =================

function startArizonaTime(){

function updateTime(){

const now = new Date().toLocaleString("en-US",{

timeZone:"America/Phoenix",

hour:"2-digit",
minute:"2-digit",
second:"2-digit",

year:"numeric",
month:"short",
day:"2-digit"

});

const el = document.getElementById("azTime");

if(el) el.innerText = now;

}

updateTime();

setInterval(updateTime,1000);

}



// ================= WELCOME MESSAGE =================

function startWelcomeMessage(admin){

const phoenixTime = new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"});
const hour = new Date(phoenixTime).getHours();

let greeting="";
let icon="";

if(hour>=5 && hour<12){

greeting="Good Morning";
icon="☀️";

}
else if(hour>=12 && hour<17){

greeting="Good Afternoon";
icon="⛅";

}
else if(hour>=17 && hour<21){

greeting="Good Evening";
icon="🌇";

}
else{

greeting="Good Night";
icon="🌙";

}

const msg = document.getElementById("welcomeMessage");
const weather = document.getElementById("weatherIcon");

if(msg) msg.innerText = greeting + ", " + admin;

if(weather) weather.innerText = icon;

}



// ================= LOGOUT =================

function logout(){

localStorage.removeItem("loggedAdmin");

location.href="../login.html";

}