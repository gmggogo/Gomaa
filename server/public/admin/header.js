/* =========================
   DYNAMIC COMPANY
========================= */

const dynamicCompany =

document.getElementById(
"dynamicCompanyName"
);

if(dynamicCompany){

dynamicCompany.innerText =

localStorage.getItem(
"companyName"
)

|| "Company";

}


/* =========================
   DYNAMIC TIME
========================= */

function updateDynamicTime(){

const timezone =

localStorage.getItem(
"systemTimezone"
)

|| "America/Phoenix";

const now = new Date();

/* DATE */

const date = now.toLocaleDateString(
"en-US",
{
timeZone:timezone,
month:"short",
day:"numeric",
year:"numeric"
}
);

/* TIME */

const time = now.toLocaleTimeString(
"en-US",
{
timeZone:timezone,
hour:"numeric",
minute:"2-digit",
second:"2-digit",
hour12:true
}
);

/* RENDER */

const timeEl =

document.getElementById(
"dynamicTime"
);

if(timeEl){

timeEl.innerHTML =

`${date} ${time}`;

}

}

updateDynamicTime();

setInterval(
updateDynamicTime,
1000
);


/* =========================
   WELCOME MESSAGE
========================= */

function updateWelcome(){

const timezone =

localStorage.getItem(
"systemTimezone"
)

|| "America/Phoenix";

const now = new Date();

const hour = Number(

new Intl.DateTimeFormat(
"en-US",
{
hour:"numeric",
hour12:false,
timeZone:timezone
}
).format(now)

);

let text = "Good Evening";
let icon = "🌙";

if(hour >= 5 && hour < 12){

text = "Good Morning";
icon = "☀️";

}

else if(hour >= 12 && hour < 18){

text = "Good Afternoon";
icon = "🌤️";

}

const welcomeEl =
document.getElementById(
"welcomeMessage"
);

const iconEl =
document.getElementById(
"weatherIcon"
);

if(welcomeEl){

welcomeEl.innerText = text;

}

if(iconEl){

iconEl.innerText = icon;

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

const currentPage =

window.location.pathname
.split("/")
.pop();

document
.querySelectorAll(".nav-btn")
.forEach(btn=>{

const href =
btn.getAttribute("href");

if(href === currentPage){

btn.classList.add("active");

}

});


/* =========================
   LOGOUT
========================= */

function logout(){

localStorage.removeItem(
"token"
);

localStorage.removeItem(
"role"
);

localStorage.removeItem(
"name"
);

window.location.href =
"/admin/login.html";

}


/* =========================
   DEFAULT LOGO
========================= */

if(!localStorage.getItem(
"appLogo"
)){

localStorage.setItem(
"appLogo",
"/assets/logo.png"
);

}