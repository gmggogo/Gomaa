document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("loginForm");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");

  if (!form || !usernameInput || !passwordInput) {
    console.error("Login form elements missing");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault(); // ❗ يمنع الريفريش

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
        location.href = "/driver/dashboard.html";
      } else {
        alert("Not a driver account");
      }

    } catch (err) {
      console.error(err);
      alert("Server error");
    }
  });

});