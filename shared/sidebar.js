const loggedUser = JSON.parse(localStorage.getItem("loggedUser"));

if (!loggedUser) {
  location.href = "../login.html";
}

// إخفاء الأقسام حسب Role
document.querySelectorAll(".sidebar a").forEach(link => {
  const role = link.getAttribute("data-role");
  if (role !== loggedUser.role) {
    link.style.display = "none";
  }
});

function logout() {
  localStorage.removeItem("loggedUser");
  location.href = "../login.html";
}