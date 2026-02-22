document.addEventListener("DOMContentLoaded", loadUsers);

const role = "admin";

async function loadUsers() {

  const res = await fetch(`/api/users/${role}`);
  const users = await res.json();

  const table = document.getElementById("usersTable");
  table.innerHTML = "";

  users.forEach(user => {

    table.innerHTML += `
      <tr>
        <td>${user.name}</td>
        <td>${user.username}</td>
        <td>${user.active ? "Active" : "Disabled"}</td>
        <td>
          <button onclick="editUser('${user._id}','${user.name}','${user.username}')">Edit</button>
          <button onclick="toggleUser('${user._id}')">
            ${user.active ? "Disable" : "Enable"}
          </button>
          <button onclick="deleteUser('${user._id}')">Delete</button>
        </td>
      </tr>
    `;
  });
}

function editUser(id, name, username) {
  document.getElementById("editId").value = id;
  document.getElementById("name").value = name;
  document.getElementById("username").value = username;
}

async function saveUser() {

  const id = document.getElementById("editId").value;
  const name = document.getElementById("name").value;
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (!name || !username) return alert("Missing fields");

  if (id) {
    await fetch(`/api/users/${id}`, {
      method:"PUT",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ name, username, password })
    });
  } else {
    if (!password) return alert("Password required");

    await fetch(`/api/users/${role}`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ name, username, password })
    });
  }

  document.getElementById("editId").value = "";
  document.getElementById("name").value = "";
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";

  loadUsers();
}

async function toggleUser(id) {
  await fetch(`/api/users/${id}/toggle`, { method:"PATCH" });
  loadUsers();
}

async function deleteUser(id) {

  if (!confirm("Are you sure?")) return;

  await fetch(`/api/users/${id}`, { method:"DELETE" });
  loadUsers();
}