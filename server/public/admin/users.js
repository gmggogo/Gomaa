document.addEventListener("DOMContentLoaded", function () {

  const token = localStorage.getItem("token");

  if (!token) {
    alert("Not logged in");
    return;
  }

  // 👇 عدل هنا لو الصفحة دي لغير الادمن
  const role = "admin";

  const table = document.getElementById("usersTable");

  /* =========================
     LOAD USERS
  ========================= */
  async function loadUsers() {
    try {
      const res = await fetch(`/api/users/${role}`, {
        headers: {
          "Authorization": "Bearer " + token
        }
      });

      if (!res.ok) {
        alert("Failed to load users");
        return;
      }

      const users = await res.json();
      table.innerHTML = "";

      users.forEach(user => {
        table.innerHTML += `
          <tr>
            <td>${user.name}</td>
            <td>${user.username}</td>
            <td>${user.active ? "Active" : "Disabled"}</td>
            <td>
              <button onclick="toggleUser('${user._id}')">Toggle</button>
              <button onclick="deleteUser('${user._id}')">Delete</button>
            </td>
          </tr>
        `;
      });

    } catch (err) {
      console.error(err);
    }
  }

  /* =========================
     CREATE USER
  ========================= */
  window.createUser = async function () {

    const name = document.getElementById("name").value;
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    if (!name || !username || !password) {
      alert("Fill all fields");
      return;
    }

    await fetch(`/api/users/${role}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ name, username, password })
    });

    document.getElementById("name").value = "";
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";

    loadUsers();
  };

  /* =========================
     TOGGLE USER
  ========================= */
  window.toggleUser = async function (id) {

    await fetch(`/api/users/${id}/toggle`, {
      method: "PATCH",
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    loadUsers();
  };

  /* =========================
     DELETE USER
  ========================= */
  window.deleteUser = async function (id) {

    await fetch(`/api/users/${id}`, {
      method: "DELETE",
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    loadUsers();
  };

  loadUsers();

});