const form = document.getElementById("loginForm");
const errorBox = document.getElementById("error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.innerText = "";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    errorBox.innerText = "Please enter username and password";
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
      errorBox.innerText = "Wrong username or password";
      return;
    }

    // ✅ Make sure this is a company account
    if (data.role !== "company") {
      errorBox.innerText = "This account is not a company";
      return;
    }

    // ✅ Save logged company
    localStorage.setItem("loggedCompany", JSON.stringify({
      username: data.username,
      name: data.name,
      role: data.role,
      loginAt: Date.now()
    }));

    // (Optional) clear other sessions
    localStorage.removeItem("loggedDriver");
    localStorage.removeItem("loggedUser");

    window.location.href = "dashboard.html";

  } catch (err) {
    console.error(err);
    errorBox.innerText = "Server connection error";
  }
});