const token = localStorage.getItem("token");

async function loadUsers(role) {
  try {
    const res = await fetch(`/api/users/${role}`, {
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    if (!res.ok) {
      console.log("API Error");
      return;
    }

    const data = await res.json();

    if (!Array.isArray(data)) return;

    const table = document.getElementById("usersTable");
    table.innerHTML = "";

    data.forEach(user => {
      const row = `
        <tr>
          <td>${user.name}</td>
          <td>${user.username}</td>
          <td>${user.active ? "Active" : "Disabled"}</td>
        </tr>
      `;
      table.innerHTML += row;
    });

  } catch (err) {
    console.log(err);
  }
}

// 👇 مهم جدًا: استخدم المفرد مش الجمع
document.getElementById("adminsTab").onclick = () => loadUsers("admin");
document.getElementById("companiesTab").onclick = () => loadUsers("company");
document.getElementById("dispatchersTab").onclick = () => loadUsers("dispatcher");
document.getElementById("driversTab").onclick = () => loadUsers("driver");

// تحميل الافتراضي
loadUsers("admin");