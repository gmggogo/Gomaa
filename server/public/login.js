/* =====================
   STAFF LOGIN
===================== */

async function login(){

const username =
document.getElementById(
"username"
).value.trim();

const password =
document.getElementById(
"password"
).value.trim();

const msg =
document.getElementById(
"msg"
);

msg.innerText="";

if(!username || !password){

msg.innerText=
"Please enter username and password";

return;

}

msg.innerText=
"Signing in...";

try{

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
}
);

const data =
await res.json();

if(!