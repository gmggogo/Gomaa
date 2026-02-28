/* =====================
   LOGIN
===================== */
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

    // save auth
    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.user.role);
    localStorage.setItem("name", data.user.name);

    // redirect by role
    if(data.user.role === "admin"){
      window.location.replace("/admin/dashboard.html");
    }

    if(data.user.role === "dispatcher"){
      window.location.replace("/dispatcher/dashboard.html");
    }

    if(data.user.role === "driver"){
      window.location.replace("/driver/dashboard.html");
    }

    if(data.user.role === "company"){
      window.location.replace("/companies/dashboard.html");
    }

  }catch(err){
    msg.innerText = "Server error";
  }
}