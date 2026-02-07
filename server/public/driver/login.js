// ===============================
// CONFIG
// ===============================
const API_BASE = "/api";

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
    // نجيب كل اليوزرز من نفس السيرفر
    const res = await fetch(`${API_BASE}/users`);
    if (!res.ok) {
      alert("Server error");
      return;
    }

    const users = await res.json();

    // نفلتر السواقين بس
    const user = users.find(
      u =>
        u.role === "driver" &&
        u.username === username &&
        u.password === password &&
        u.active === true
    );

    if (!user) {
      alert("Invalid driver login");
      return;
    }

    // نخزن بنفس نظام باقي المشروع
    localStorage.setItem("loggedUser", JSON.stringify(user));

    // تحويل مباشر لداشبورد السواق
    window.location.href = "dashboard.html";

  } catch (err) {
    console.error(err);
    alert("Server not reachable");
  }
}