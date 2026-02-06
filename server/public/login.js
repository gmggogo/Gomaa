async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    alert("Enter username and password");
    return;
  }

  try {
    // نجيب كل اليوزرز من نفس السيرفر
    const res = await fetch("/api/users");

    if (!res.ok) {
      throw new Error("Failed to fetch users");
    }

    const users = await res.json();

    const user = users.find(
      u =>
        u.username === username &&
        u.password === password &&
        u.active === true
    );

    if (!user) {
      alert("Wrong username or password");
      return;
    }

    // نخزن المستخدم الحالي فقط
    localStorage.setItem("loggedUser", JSON.stringify(user));

    // توجيه حسب الدور الحقيقي
    if (user.role === "company") {
      location.href = "companies/dashboard.html";
    } else if (user.role === "admin") {
      location.href = "admin/dashboard.html";
    } else if (user.role === "dispatcher") {
      location.href = "dispatcher/dashboard.html";
    } else if (user.role === "driver") {
      location.href = "driver/dashboard.html";
    } else {
      alert("Unknown role");
    }

  } catch (err) {
    console.error(err);
    alert("Login error – check console");
  }
}