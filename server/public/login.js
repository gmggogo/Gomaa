async function login(){

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("msg");

  if(!email || !password){
    msg.innerText = "Please enter email and password";
    return;
  }

  msg.innerText = "Signing in...";

  try{

    const res = await fetch("/api/auth/login",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({ email, password })
    });

    const data = await res.json();

    if(!res.ok){
      msg.innerText = data.message || "Login failed";
      return;
    }

    // 🚫 Staff only
    if(data.role !== "admin" && data.role !== "dispatcher"){
      msg.innerText = "Access denied";
      return;
    }

    // Redirect
    if(data.role === "admin"){
      window.location.href = "/admin/dashboard.html";
    }

    if(data.role === "dispatcher"){
      window.location.href = "/dispatcher/dashboard.html";
    }

  }catch(err){
    msg.innerText = "Server error";
  }
}