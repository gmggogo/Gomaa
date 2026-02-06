const form = document.getElementById("loginForm");
const errorBox = document.getElementById("error");

/*
  المستخدمين بيتسجلوا من الأدمن
  ومتخزنين في localStorage باسم:
  companyUsers
*/

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

  // نحفظ الشركة اللي دخلت
  localStorage.setItem("loggedCompany", JSON.stringify({
    name: company.name,
    username: company.username
  }));

  // دخول مباشر على الداشبورد
  window.location.href = "dashboard.html";
});