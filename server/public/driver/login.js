document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("error");

  if (!form) {
    console.error("loginForm not found");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.innerText = "";

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!username || !password) {
      errorBox.innerText = "Enter username and password";
      return;
    }

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        errorBox.innerText = "Invalid username or password";
        return;
      }

      // ✅ نتأكد إن الحساب Driver
      if (data.role !== "driver") {
        errorBox.innerText = "This account is not a driver";
        return;
      }

      // ✅ نخزن Session السواق (زي الشركات)
      localStorage.setItem("loggedDriver", JSON.stringify({
        id: data.id || null,
        name: data.name,
        username: data.username,
        role: data.role,
        loginAt: Date.now()
      }));

      // دخول داشبورد السواق
      window.location.href = "dashboard.html";

    } catch (err) {
      console.error(err);
      errorBox.innerText = "Server error";
    }
  });
});