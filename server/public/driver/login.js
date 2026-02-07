async function login() {
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

    const data = await res.json();

    if (!data.success || !data.user) {
      alert("Invalid login");
      return;
    }

    const user = data.user;

    // 🔴 شرط السواق
    if (user.role !== "driver") {
      alert("Not a driver account");
      return;
    }

    // ✅ التخزين الصح
    localStorage.setItem("loggedDriver", JSON.stringify(user));

    // ✅ التحويل الصح
    window.location.href = "dashboard.html";

  } catch (err) {
    console.error(err);
    alert("Server error");
  }
}