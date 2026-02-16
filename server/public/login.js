document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const role = document.getElementById("role").value;
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    errorBox.innerText = "";

    if (!role) {
      errorBox.innerText = "Please select role.";
      return;
    }

    if (!username || !password) {
      errorBox.innerText = "Please enter username and password.";
      return;
    }

    try {

      const response = await fetch(`/api/login/${role}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        errorBox.innerText = data.error || "Invalid credentials.";
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("userRole", data.role);
      localStorage.setItem("userName", data.name);

      if (role === "admin") {
        window.location.href = "/admin/dashboard.html";
      } else {
        window.location.href = "/dispatcher/dashboard.html";
      }

    } catch (error) {
      errorBox.innerText = "Server error.";
    }

  });

});