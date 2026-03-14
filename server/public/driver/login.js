/* =====================================================
   SUNBEAM DRIVER LOGIN
===================================================== */

document.addEventListener("DOMContentLoaded", () => {

const form = document.getElementById("loginForm");
const errorBox = document.getElementById("error");

if (!form) {
console.error("loginForm not found");
return;
}

form.addEventListener("submit", async (e) => {

e.preventDefault();
errorBox.innerText = "";

const username = document.getElementById("username").value.trim();
const password = document.getElementById("password").value.trim();

if (!username || !password) {
errorBox.innerText = "Enter username and password";
return;
}

try{

const res = await fetch("/api/auth/login",{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({
username,
password
})

});

const data = await res.json();

if(!res.ok){
errorBox.innerText = data.message || "Login failed";
return;
}

if(!data.user){
errorBox.innerText = "User data missing";
return;
}

/* نتأكد أنه Driver */

if(data.user.role !== "driver"){
errorBox.innerText = "This account is not a driver";
return;
}

/* حفظ session */

localStorage.setItem("loggedDriver", JSON.stringify({

token:data.token,
id:data.user.id,
name:data.user.name,
username:data.user.username,
role:data.user.role,
loginAt:Date.now()

}));

/* فتح الداشبورد */

window.location.href="/driver/dashboard.html";

}catch(err){

console.error(err);
errorBox.innerText="Server error";

}

});

});