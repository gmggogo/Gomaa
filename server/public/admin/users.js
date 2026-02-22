let currentRole = "admin";
let editId = null;

document.addEventListener("DOMContentLoaded", () => {
  loadUsers();
});

/* =========================
   CHANGE ROLE
========================= */
function changeRole(role) {
  currentRole = role;
  editId = null;

  document.getElementById("title").innerText =
    role.charAt(0).toUpperCase() + role.slice(1) + "s";

  document.querySelectorAll(".sidebar button")
    .forEach(btn => btn.classList.remove("active"));

  document.getElementById(role + "Btn").classList.add("active");

  clearInputs();
  loadUsers();
}

/* =========================
   LOAD USERS
========================= */
async function loadUsers() {
  const res = await fetch(`/api/users/${currentRole}`);
  const users = await res.json();

  const table = document.getElementById("table");
  table.innerHTML = "";

  users.forEach(user => {
    table.innerHTML += `
      <tr>
        <td>${user.name}</td>
        <td>${user.username}</td>
        <td>${user.active ? "Active" : "Disabled"}</td>
        <td>
          <button class="btn edit"
            onclick="editUser('${user._id}','${user.name}','${user.username}')">
            Edit
          </button>

          <button class="btn disable"
            onclick="toggleUser('${user._id}')">
            ${user.active ? "Disable" : "Enable"}
          </button>

          <button class="btn delete"
            onclick="deleteUser('${user._id}')">
            Delete
          </button>
        </td>
      </tr>
    `;
  });
}

/* =========================
   ADD OR UPDATE USER
========================= */
async function addUser() {

  const name = document.getElementById("name").value;
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (!name || !username) {
    alert("Missing fields");
    return;
  }

  if (editId) {
    await fetch(`/api/users/${editId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, password })
    });
  } else {
    if (!password) {
      alert("Password required");
      return;
    }

    await fetch(`/api/users/${currentRole}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, password })
    });
  }

  clearInputs();
  loadUsers();
}

/* =========================
   EDIT
========================= */
function editUser(id, name, username) {
  editId = id;

  document.getElementById("name").value = name;
  document.getElementById("username").value = username;
  document.getElementById("password").value = "";
}

/* =========================
   TOGGLE ACTIVE
========================= */
async function toggleUser(id) {
  await fetch(`/api/users/${id}/toggle`, {
    method: "PATCH"
  });

  loadUsers();
}

/* =========================
   DELETE
========================= */
async function deleteUser(id) {

  if (!confirm("Are you sure?")) return;

  await fetch(`/api/users/${id}`, {
    method: "DELETE"
  });

  loadUsers();
}

/* =========================
   CLEAR INPUTS
========================= */
function clearInputs() {
  editId = null;
  document.getElementById("name").value = "";
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
}