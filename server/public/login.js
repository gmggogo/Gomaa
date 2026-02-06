async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    alert("Enter username and password");
    return;
  }

  try {
    // جلب كل المستخدمين من السيرفر الحقيقي (Fly.io)
    const res = await fetch("https://server-bold-snow-4676.fly.dev/api/users");

    if (!res.ok) {
      throw new Error("Failed to fetch users");
    }

    const users = await res.json();
    console.log("LOGIN USERS:", users);

    // البحث عن المستخدم
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

    // حفظ المستخدم الحالي
    localStorage.setItem("loggedUser", JSON.stringify(user));

    // التوجيه حسب الدور
    switch (user.role) {
      case "company":
        window.location.href = "companies/dashboard.html";
        break;

      case "admin":
        window.location.href = "admin/dashboard.html";
        break;

      case "dispatcher":
        window.location.href = "dispatcher/dashboard.html";
        break;

      case "driver":
        window.location.href = "driver/dashboard.html";
        break;

      default:
        alert("Unknown role");
    }

  } catch (err) {
    console.error(err);
    alert("Server error – check console");
  }
}