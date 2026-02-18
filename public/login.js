document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("loginForm");
  const errorMsg = document.getElementById("errorMsg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    errorMsg.innerText = "";

    if (!username || !password) {
      errorMsg.innerText = "Please enter username and password";
      return;
    }

    try {
      const response = await fetch("/api/auth/login", {
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
        errorMsg.innerText = data.message || "Login failed";
        return;
      }

      // حفظ المستخدم
      localStorage.setItem("loggedUser", JSON.stringify(data.user));

      // توجيه حسب الرول
      switch (data.user.role) {
        case "admin":
          window.location.href = "/admin/dashboard.html";
          break;

        case "company":
          window.location.href = "/companies/dashboard.html";
          break;

        case "dispatcher":
          window.location.href = "/dispatchers/dashboard.html";
          break;

        case "driver":
          window.location.href = "/drivers/dashboard.html";
          break;

        default:
          errorMsg.innerText = "Invalid role";
      }

    } catch (error) {
      errorMsg.innerText = "Server error";
      console.error(error);
    }
  });

});