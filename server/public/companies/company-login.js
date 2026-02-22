document.addEventListener("DOMContentLoaded", function () {

  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("errorMessage");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    errorBox.innerText = "";

    if (!username || !password) {
      errorBox.innerText = "Please enter username and password.";
      return;
    }

    try {

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        errorBox.innerText = data.message || "Invalid credentials.";
        return;
      }

      // نتأكد انه شركة
      if (data.user.role !== "company") {
        errorBox.innerText = "This account is not a company account.";
        return;
      }

      // حفظ التوكن
      localStorage.setItem("token", data.token);
      localStorage.setItem("userRole", data.user.role);
      localStorage.setItem("userName", data.user.name);

      // تحويل
      window.location.href = "/companies/company.html";

    } catch (err) {
      console.error(err);
      errorBox.innerText = "Server error.";
    }

  });

});