document.addEventListener("DOMContentLoaded", function () {

  const token = localStorage.getItem("token");

  if (!token) {
    alert("Not authorized");
    window.location.href = "/login.html";
    return;
  }

  const path = window.location.pathname;

  let role = "";

  if (path.includes("admins")) role = "admin";
  else if (path.includes("dispatchers")) role = "dispatcher";
  else if (path.includes("drivers")) role = "driver";
  else if (path.includes("companies")) role = "company";
  else {
    alert("Invalid page");
    return;
  }

  const table = document.getElementById("usersTable");

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

  window.toggleUser = async function(id) {
    await fetch(`/api/users/${id}/toggle`, {
      method: "PATCH",
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    loadUsers();
  };

  window.deleteUser = async function(id) {
    await fetch(`/api/users/${id}`, {
      method: "DELETE",
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    loadUsers();
  };

  window.createUser = async function() {
    const name = document.getElementById("name").value;
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    await fetch(`/api/users/${role}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ name, username, password })
    });

    loadUsers();
  };

  loadUsers();

});