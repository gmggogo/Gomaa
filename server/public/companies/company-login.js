const form = document.getElementById("loginForm");
const errorBox = document.getElementById("error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.innerText = "";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    errorBox.innerText = "اكتب اليوزر والباسورد";
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
      errorBox.innerText = "اليوزر او الباسورد غلط";
      return;
    }

    // ✅ تأكيد إن الحساب Company
    if (data.role !== "company") {
      errorBox.innerText = "الحساب ده مش شركة";
      return;
    }

    // ✅ تخزين الشركة
    localStorage.setItem("loggedCompany", JSON.stringify({
      username: data.username,
      name: data.name,
      role: data.role,
      loginAt: Date.now()
    }));

    // (اختياري) تنظيف أي جلسة تانية
    localStorage.removeItem("loggedDriver");
    localStorage.removeItem("loggedUser");

    window.location.href = "dashboard.html";

  } catch (err) {
    console.error(err);
    errorBox.innerText = "مشكلة في الاتصال بالسيرفر";
  }
});