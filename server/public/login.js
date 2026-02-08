document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const role = document.getElementById("role").value;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Login failed");
        return;
      }

      localStorage.setItem("loggedUser", JSON.stringify(data.user));
      localStorage.setItem("role", role);

      if (role === "admin") location.href = "/admin/users.html";
      if (role === "company") location.href = "/company/dashboard.html";
      if (role === "dispatcher") location.href = "/dispatcher/dashboard.html";
      if (role === "driver") location.href = "/driver/dashboard.html";

    } catch (err) {
      console.error(err);
      alert("Server error");
    }
  });
});