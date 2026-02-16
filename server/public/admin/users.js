let currentRole = "admin";

const table = document.getElementById("usersTable");
const title = document.getElementById("pageTitle");

const inputName = document.getElementById("inputName");
const inputUsername = document.getElementById("inputUsername");
const inputPassword = document.getElementById("inputPassword");

/* =========================
   API MAP
========================= */
const API_MAP = {
  admin: "/api/admins",
  company: "/api/companies",
  dispatcher: "/api/dispatchers",
  driver: "/api/drivers"
};

/* =========================
   Switch Role
========================= */
function switchRole(role) {
  currentRole = role;
  title.innerText = role.toUpperCase() + " USERS";

  document.querySelectorAll(".sidebar button").forEach(btn =>
    btn.classList.remove("active")
  );
  document.getElementById("btn-" + role).classList.add("active");

  loadUsers();
}

/* =========================
   Load Users
========================= */
async function loadUsers() {
  const res = await fetch(API_MAP[currentRole]);
  const users = await res.json();

  table.innerHTML = "";

  users.forEach(u => {
    table.innerHTML += `
      <tr>
        <td><input value="${u.name}" disabled></td>
        <td><input value="${u.username}" disabled></td>
        <td><input placeholder="New password" disabled></td>
        <td>${u.active !== false ? "Active" : "Inactive"}</td>
        <td>
          <button class="btn edit" onclick="editRow(this)">Edit</button>
          <button class="btn save" onclick="saveRow(${u.id}, this)" style="display:none">Save</button>
          <button class="btn delete" onclick="deleteUser(${u.id})">Delete</button>
        </td>
      </tr>
    `;
  });
}

/* =========================
   Edit
========================= */
function editRow(btn) {
  const row = btn.closest("tr");
  row.querySelectorAll("input").forEach(i => i.disabled = false);
  btn.style.display = "none";
  row.querySelector(".save").style.display = "inline-block";
}

/* =========================
   Save
========================= */
async function saveRow(id, btn) {
  const row = btn.closest("tr");
  const inputs = row.querySelectorAll("input");

  await fetch(API_MAP[currentRole] + "/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: inputs[0].value,
      username: inputs[1].value,
      password: inputs[2].value
    })
  });

  loadUsers();
}

/* =========================
   Delete
========================= */
async function deleteUser(id) {
  if (!confirm("Delete user?")) return;

  await fetch(API_MAP[currentRole] + "/" + id, {
    method: "DELETE"
  });

  loadUsers();
}

/* =========================
   Add
========================= */
async function addUser() {
  if (!inputName.value || !inputUsername.value || !inputPassword.value) {
    alert("Fill all fields");
    return;
  }

  await fetch(API_MAP[currentRole], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: inputName.value,
      username: inputUsername.value,
      password: inputPassword.value
    })
  });

  inputName.value = "";
  inputUsername.value = "";
  inputPassword.value = "";

  loadUsers();
}

/* ========================= */

switchRole("admin");