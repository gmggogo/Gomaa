document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");

  if (!form || !usernameInput || !passwordInput) {
    console.error("Login elements not found");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

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

      if (!data.success) {
        alert(data.message || "Login failed");
        return;
      }

      localStorage.setItem("loggedUser", JSON.stringify(data.user));

      if (data.user.role === "driver") {
        window.location.href = "/driver/dashboard.html";
      } else if (data.user.role === "admin") {
        window.location.href = "/admin/dashboard.html";
      } else {
        alert("Unknown role");
      }

    } catch (err) {
      console.error(err);
      alert("Server error");
    }
  });
});