document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

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

    if (!res.ok) {
      alert("Invalid login");
      return;
    }

    const data = await res.json();

    // 🔒 تأكيد إنه Driver
    if (!data.user || data.user.role !== "driver") {
      alert("Not a driver account");
      return;
    }

    // ✅ التخزين الصح
    localStorage.setItem("loggedDriver", JSON.stringify(data.user));

    // ✅ تحويل مباشر
    window.location.href = "/driver/dashboard.html";

  } catch (err) {
    console.error(err);
    alert("Server error");
  }
});