document.addEventListener("DOMContentLoaded", function () {

  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("errorMessage");

  if (!form) {
    console.error("Login form not found");
    return;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    errorBox.innerText = "";

    if (username === "" || password === "") {
      errorBox.innerText = "Please enter username and password.";
      return;
    }

    try {

      const response = await fetch("/api/login/company", {
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
        errorBox.innerText = data.error || "Invalid login credentials.";
        return;
      }

      // حفظ بيانات الدخول
      localStorage.setItem("token", data.token);
      localStorage.setItem("userRole", data.role);
      localStorage.setItem("userName", data.name);

      // تحويل لصفحة الشركة
      window.location.href = "/companies/company.html";

    } catch (error) {
      console.error(error);
      errorBox.innerText = "Server error. Please try again.";
    }

  });

});