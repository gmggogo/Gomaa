// ===============================
// CONFIG
// ===============================
const API_BASE = "http://192.168.12.209:4000/api";

// ===============================
// DOM READY
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  if (!loginBtn) {
    alert("Login button not found");
    return;
  }
  loginBtn.addEventListener("click", login);
});

// ===============================
// LOGIN
// ===============================
async function login() {
  const username = document.getElementById("username")?.value.trim();
  const password = document.getElementById("password")?.value.trim();

  if (!username || !password) {
    alert("Enter username and password");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      alert("Invalid login");
      return;
    }

    const data = await res.json();
    if (!data.success || !data.user) {
      alert("Login failed");
      return;
    }

    const user = data.user;

    // ===============================
    // DRIVER LOGIN
    // ===============================
    if (user.role === "driver") {
      if (!user.id) {
        alert("Driver ID missing");
        return;
      }

      localStorage.setItem("loggedDriver", JSON.stringify(user));
      window.location.href = "dashboard.html"; // ✅ مهم جدًا
      return;
    }

    // ===============================
    // OTHER ROLES
    // ===============================
    localStorage.setItem("loggedUser", JSON.stringify(user));

    switch (user.role) {
      case "admin":
        window.location.href = "/admin/index.html";
        break;

      case "dispatcher":
        window.location.href = "/dispatcher/dashboard.html";
        break;

      case "company":
        window.location.href = "/companies/dashboard.html";
        break;

      default:
        alert("Unknown role");
    }

  } catch (err) {
    console.error(err);
    alert("Server not reachable");
  }
}