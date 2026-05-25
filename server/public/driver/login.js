/* =====================================================
   DRIVER LOGIN
===================================================== */

document.addEventListener(
"DOMContentLoaded",
()=>{

const form =
document.getElementById(
"loginForm"
);

const errorBox =
document.getElementById(
"error"
);

if(!form){

console.error(
"loginForm not found"
);

return;

}

/* =====================================================
   SUBMIT
===================================================== */

form.addEventListener(
"submit",
async (e)=>{

e.preventDefault();

errorBox.innerText = "";

/* =========================
GET VALUES
========================= */

const username =
document.getElementById(
"username"
).value.trim();

const password =
document.getElementById(
"password"
).value.trim();

/* =========================
VALIDATION
========================= */

if(
!username ||
!password
){

errorBox.innerText =
"Enter username and password";

return;

}

try{

/* =========================
LOGIN REQUEST
========================= */

const res =
await fetch(
"/api/auth/login",
{

method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({

username,
password

})

});

const data =
await res.json();

/* =========================
ERROR
========================= */

if(!res.ok){

errorBox.innerText =

data.message ||

"Login failed";

return;

}

/* =========================
USER CHECK
========================= */

if(!data.user){

errorBox.innerText =
"User data missing";

return;

}

/* =========================
ROLE CHECK
========================= */

if(
data.user.role !== "driver"
){

errorBox.innerText =
"This account is not a driver";

return;

}

/* =========================
SAVE DRIVER SESSION
========================= */

localStorage.setItem(

"loggedDriver",

JSON.stringify({

token:data.token,

id:data.user.id,

name:data.user.name,

username:data.user.username,

role:data.user.role,

company:
data.user.company || "",

driverId:
data.user.driverId || "",

loginAt:Date.now()

})

);

/* =========================
GLOBAL SESSION
========================= */

localStorage.setItem(
"token",
data.token
);

localStorage.setItem(
"role",
"driver"
);

localStorage.setItem(
"driverName",
data.user.name || ""
);

localStorage.setItem(
"name",
data.user.name || ""
);

localStorage.setItem(
"companyName",
data.user.company || ""
);

/* =========================
OPTIONAL DRIVER DATA
========================= */

if(data.user.driverId){

  localStorage.setItem(
    "driverId",
    data.user.driverId
  );

}

if(data.user.company){

  localStorage.setItem(
    "company",
    data.user.company
  );

}

/* =========================
🔥 IMPORTANT
NO LOCAL TIMEZONE SAVE
TIMEZONE COMES FROM BRANDING
ON RENDER SERVER
========================= */

localStorage.removeItem(
  "systemTimezone"
);

localStorage.removeItem(
  "appTimezone"
);

/* =========================
REDIRECT
========================= */

window.location.href =
"/driver/dashboard.html";

}

/* =========================
SERVER ERROR
========================= */

catch(err){

console.error(err);

errorBox.innerText =
"Server error";

}

});

});