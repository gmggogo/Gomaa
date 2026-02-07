// ===============================
// CONFIG (Same Origin - works on Render + Local)
// ===============================
const API_BASE = `${location.origin}/api`;

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

    // اقرأ الرد كنص الأول عشان لو السيرفر رجّع HTML نفهم
    const text = await res.text();

    if (!res.ok) {
      // لو السيرفر بيرجع رسالة
      alert(text || "Invalid login");
      return;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      alert("Server returned non-JSON (routing/server issue)");
      return;
    }

    if (!data.success || !data.user) {
      alert("Login failed");
      return;
    }

    const user = data.user;

    if (user.role !== "driver") {
      alert("This login is for drivers only");
      return;
    }

    // IMPORTANT: نفس المفتاح اللي الداشبورد بيقرأه
    localStorage.setItem("loggedDriver", JSON.stringify(user));

    // مهم: مسار صحيح داخل فولدر driver
    window.location.href = "dashboard.html";

  } catch (err) {
    console.error(err);
    alert("Server not reachable");
  }
}