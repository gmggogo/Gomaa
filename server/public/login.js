// ===============================
// SUNBEAM UNIVERSAL LOGIN SCRIPT
// ===============================

const form = document.getElementById("loginForm");
const errorBox = document.getElementById("error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  errorBox.innerText = "";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  // 👇 تحديد الدور من الصفحة تلقائي
  const role = detectRoleFromPage();

  if (!username || !password) {
    errorBox.innerText = "Enter username and password";
    return;
  }

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password,
        role
      })
    });

    const data = await response.json();

    if (!response.ok) {
      errorBox.innerText = data.error || "Login failed";
      return;
    }

    // حفظ بيانات المستخدم
    localStorage.setItem("sunbeam_user", JSON.stringify(data));

    // توجيه حسب الدور
    redirectByRole(data.role);

  } catch (err) {
    console.error(err);
    errorBox.innerText = "Server connection failed";
  }
});


// ===============================
// Detect Role Automatically
// ===============================

function detectRoleFromPage() {

  const path = window.location.pathname.toLowerCase();

  if (path.includes("admin")) return "admin";
  if (path.includes("company")) return "company";
  if (path.includes("dispatcher")) return "dispatcher";
  if (path.includes("driver")) return "driver";

  // fallback
  return "admin";
}


// ===============================
// Redirect by Role
// ===============================

function redirectByRole(role) {

  switch(role) {
    case "admin":
      window.location.href = "/admin/dashboard.html";
      break;

    case "company":
      window.location.href = "/company/dashboard.html";
      break;

    case "dispatcher":
      window.location.href = "/dispatcher/dashboard.html";
      break;

    case "driver":
      window.location.href = "/driver/dashboard.html";
      break;

    default:
      window.location.href = "/dashboard.html";
  }
}