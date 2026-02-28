// Arizona Time
function updateAZTime(){
  const options = {
    timeZone: "America/Phoenix",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  };

  document.getElementById("azTime").innerText =
    new Date().toLocaleString("en-US", options);
}

setInterval(updateAZTime, 1000);
updateAZTime();


// Login
async function login(){

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("msg");

  if(!username || !password){
    msg.innerText = "Please enter username and password";
    return;
  }

  msg.innerText = "Signing in...";

  try{

    const res = await fetch("/api/auth/login",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if(!res.ok){
      msg.innerText = data.message || "Login Failed";
      return;
    }

    // Staff only
    if(data.user.role !== "admin" && data.user.role !== "dispatcher"){
      msg.innerText = "Access denied";
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.user.role);

    if(data.user.role === "admin"){
      window.location.href = "/admin/dashboard.html";
    }

    if(data.user.role === "dispatcher"){
      window.location.href = "/dispatcher/dashboard.html";
    }

  }catch(err){
    msg.innerText = "Server error";
  }
}