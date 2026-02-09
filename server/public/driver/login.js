document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("loginBtn");
  const userEl = document.getElementById("username");
  const passEl = document.getElementById("password");

  if (!btn || !userEl || !passEl) {
    console.error("Driver login elements missing");
    return;
  }

  btn.addEventListener("click", async () => {
    const username = userEl.value.trim();
    const password = passEl.value.trim();

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

      if (!res.ok || !data.success) {
        alert("Wrong username or password");
        return;
      }

      if (data.role !== "driver") {
        alert("This account is not a driver");
        return;
      }

      // ✅ نحفظ السواق
      localStorage.setItem("loggedDriver", JSON.stringify(data));

      // دخول على داشبورد السواق
      window.location.href = "/driver/dashboard.html";

    } catch (e) {
      console.error(e);
      alert("Server error");
    }
  });
});