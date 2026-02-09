const form = document.getElementById("loginForm");
const errorBox = document.getElementById("error");

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  const users = JSON.parse(localStorage.getItem("companyUsers")) || [];

  const company = users.find(u =>
    u.username === username &&
    u.password === password &&
    u.active === true
  );

  if (!company) {
    errorBox.innerText = "Invalid login or account disabled";
    return;
  }

  // نخزن الشركة اللي دخلت
  localStorage.setItem("loggedCompany", JSON.stringify({
    name: company.name,
    username: company.username
  }));

  // دخول على داشبورد الشركات
  window.location.href = "dashboard.html";
});