document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const usernameEl = document.getElementById("username");
  const passwordEl = document.getElementById("password");
  const errorBox = document.getElementById("error");

  if (!form || !usernameEl || !passwordEl || !errorBox) {
    console.error("Driver login elements missing");
    return;
  }

  // لو السواق عامل لوجن قبل كده
  try {
    const saved = JSON.parse(localStorage.getItem("loggedDriver"));
    if (saved && saved.role === "driver") {
      window.location.href = "/driver/dashboard.html";
      return;
    }
  } catch {}

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.innerText = "";

    const username = usernameEl.value.trim();
    const password = passwordEl.value.trim();

    if (!username || !password) {
      errorBox.innerText = "Enter username and password";
      return;
    }

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        errorBox.innerText = "Wrong username or password";
        return;
      }

      if (data.role !== "driver") {
        errorBox.innerText = "This account is not a driver";
        return;
      }

      // ✅ تخزين جلسة السواق فقط
      localStorage.setItem("loggedDriver", JSON.stringify({
        id: data.id,
        username: data.username,
        name: data.name,
        role: "driver",
        loginAt: Date.now()
      }));

      window.location.href = "/driver/dashboard.html";

    } catch (err) {
      console.error(err);
      errorBox.innerText = "Server error";
    }
  });
});