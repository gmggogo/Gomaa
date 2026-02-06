function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    alert("Enter username and password");
    return;
  }

  // كل المستخدمين محفوظين من admin/users.html
  const users = JSON.parse(localStorage.getItem("users")) || [];

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

  localStorage.setItem("loggedUser", JSON.stringify(user));

  // توجيه حسب الدور
  switch (user.role) {
    case "company":
      location.href = "companies/dashboard.html";
      break;

    case "admin":
      location.href = "admin/dashboard.html";
      break;

    case "dispatcher":
      location.href = "dispatcher/dashboard.html";
      break;

    case "driver":
      location.href = "driver/dashboard.html";
      break;

    default:
      alert("Unknown role");
  }
}