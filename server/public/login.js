document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await login();
  });
});

async function login(){

  const username = document.getElementById("email").value.trim();
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
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({ username, password })
    });

    const data = await res.json();

    if(!res.ok){
      msg.innerText = data.message || "Login failed";
      return;
    }

    const role = data.user.role;

    // Save token + role
    localStorage.setItem("token", data.token);
    localStorage.setItem("role", role);

    // Redirect based on role
    if(role === "admin"){
      window.location.href = "/admin/dashboard.html";
    }
    else if(role === "company"){
      window.location.href = "/companies/dashboard.html";
    }
    else if(role === "dispatcher"){
      window.location.href = "/dispatcher/dashboard.html";
    }
    else if(role === "driver"){
      window.location.href = "/driver/dashboard.html";
    }
    else{
      msg.innerText = "Access denied";
    }

  }catch(err){
    msg.innerText = "Server error";
  }
}