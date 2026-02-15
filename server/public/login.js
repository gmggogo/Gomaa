async function login() {

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    alert("Enter username and password");
    return;
  }

  try {

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Login failed");
      return;
    }

    localStorage.clear();

    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.role);
    localStorage.setItem("name", data.name);

    if (data.role === "admin") {
      location.href = "/admin/dashboard.html";
    }
    else if (data.role === "dispatcher") {
      location.href = "/dispatcher/dashboard.html";
    }
    else if (data.role === "company") {
      location.href = "/companies/dashboard.html";
    }
    else if (data.role === "driver") {
      location.href = "/driver/dashboard.html";
    }

  } catch (err) {
    alert("Server error");
  }
}