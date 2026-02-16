// ===== Clock =====
function updateClock(){
  const now = new Date();
  document.getElementById("clock").innerText =
    now.toLocaleDateString() + " • " + now.toLocaleTimeString();
}
setInterval(updateClock,1000);
updateClock();


// ===== Login =====
document.getElementById("loginForm").addEventListener("submit", async function(e){
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const error = document.getElementById("error");

  error.innerText = "";

  if(!username || !password){
    error.innerText = "Enter username and password";
    return;
  }

  try{
    const res = await fetch("/api/login",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username,password})
    });

    const data = await res.json();

    if(!res.ok){
      error.innerText = data.error || "Login failed";
      return;
    }

    localStorage.setItem("role", data.role);
    localStorage.setItem("name", data.name);

    if(data.role === "admin"){
      window.location.href = "/admin/dashboard.html";
    }
    else if(data.role === "company"){
      window.location.href = "/company/dashboard.html";
    }
    else if(data.role === "dispatcher"){
      window.location.href = "/dispatcher/dashboard.html";
    }
    else if(data.role === "driver"){
      window.location.href = "/driver/dashboard.html";
    }

  }catch{
    error.innerText = "Server error";
  }
});