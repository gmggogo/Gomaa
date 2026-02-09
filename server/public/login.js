async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    alert("Enter username and password");
    return;
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      alert("Wrong username or password");
      return;
    }

    const data = await res.json();

    // ✅ نخزن المستخدم باسمه الحقيقي
    localStorage.setItem(
      "loggedUser",
      JSON.stringify({
        name: data.name,        // الاسم من السيرفر
        username: data.username,
        role: data.role
      })
    );

    // توجيه حسب الدور
    if (data.role === "admin") {
      location.href = "/admin/dashboard.html";
    } 
    else if (data.role === "dispatcher") {
      location.href = "/dispatcher/dashboard.html";
    } 
    else if (data.role === "company") {
      location.href = "/companies/dashboard.html";
    } 
    else if (data.role === "driver") {
      location.href = "/driver/dashboard.html";
    } 
    else {
      alert("Unknown role");
    }

  } catch (err) {
    console.error(err);
    alert("Login error");
  }
}