document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const role = document.getElementById("role").value;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password, role })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }

    localStorage.setItem("loggedUser", JSON.stringify(data.user));
    localStorage.setItem("role", role);

    if (role === "admin") window.location.href = "/admin/dashboard.html";
    if (role === "company") window.location.href = "/company/dashboard.html";
    if (role === "dispatcher") window.location.href = "/dispatcher/dashboard.html";
    if (role === "driver") window.location.href = "/driver/dashboard.html";

  } catch (err) {
    console.error(err);
    alert("Login error – check console");
  }
});