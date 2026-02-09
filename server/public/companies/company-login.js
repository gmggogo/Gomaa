const form = document.getElementById("loginForm");
const errorBox = document.getElementById("error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.innerText = "";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    errorBox.innerText = "Enter username and password";
    return;
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      errorBox.innerText = "Invalid login or account disabled";
      return;
    }

    if (data.user.role !== "company") {
      errorBox.innerText = "This account is not a company";
      return;
    }

    localStorage.setItem("loggedCompany", JSON.stringify(data.user));
    window.location.href = "dashboard.html";

  } catch (err) {
    console.error(err);
    errorBox.innerText = "Server error";
  }
});