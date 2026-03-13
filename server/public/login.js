/* =====================
   STAFF LOGIN
===================== */

async function login(){

const username = document.getElementById("username").value.trim();
const password = document.getElementById("password").value.trim();
const msg = document.getElementById("msg");

msg.innerText="";

if(!username || !password){
msg.innerText="Please enter username and password";
return;
}

msg.innerText="Signing in...";

try{

const res = await fetch("/api/auth/login",{
method:"POST",
headers:{ "Content-Type":"application/json" },
body:JSON.stringify({username,password})
});

const data = await res.json();

if(!res.ok){
msg.innerText=data.message || "Login failed";
return;
}

/* save login */

localStorage.setItem("token",data.token);
localStorage.setItem("role",data.user.role);
localStorage.setItem("name",data.user.name);

/* redirect */

if(data.user.role==="admin"){
window.location.replace("/admin/dashboard.html");
}

else if(data.user.role==="dispatcher"){
window.location.replace("/dispatcher/dashboard.html");
}

else{
msg.innerText="This account cannot login here";
}

}
catch(err){
msg.innerText="Server error";
}

}