// ======================================
// LOGIN SYSTEM – CLEAN VERSION
// ======================================

async function login() {

  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    alert("Please enter username and password");
    return;
  }

  try {

    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: username,
        password: password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      alert("Wrong username or password");
      return;
    }

    // ✅ نحفظ بيانات الدخول
    localStorage.setItem("username", username);
    localStorage.setItem("role", data.role);
    localStorage.setItem("name", data.name);

    // ======================================
    // REDIRECT BY ROLE
    // ======================================

    if (data.role === "admin") {
      window.location.href = "/admin/dashboard.html";
    }
    else if (data.role === "dispatcher") {
      window.location.href = "/dispatcher/dashboard.html";
    }
    else if (data.role === "company") {
      window.location.href = "/companies/dashboard.html";
    }
    else if (data.role === "driver") {
      window.location.href = "/driver/dashboard.html";
    }
    else {
      alert("Unknown role");
    }

  } catch (error) {
    console.error("Login error:", error);
    alert("Server error. Try again.");
  }
}