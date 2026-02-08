let currentRole = "companies";

const table = document.getElementById("usersTable");
const title = document.getElementById("pageTitle");

const inputName = document.getElementById("inputName");
const inputUsername = document.getElementById("inputUsername");
const inputPassword = document.getElementById("inputPassword");

/* =========================
   ROLE → API MAP
========================= */
const API_MAP = {
  admins: "/api/admins",
  companies: "/api/companies",
  drivers: "/api/drivers",
  dispatchers: "/api/dispatchers"
};

document.addEventListener("DOMContentLoaded", () => {
  switchRole("companies");
});

/* =========================
   Fetch helper
========================= */
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();

  if (!res.ok) throw new Error(text);
  return JSON.parse(text);
}

/* =========================
   Switch Role
========================= */
function switchRole(role) {
  currentRole = role;
  title.innerText = role.toUpperCase();

  document.querySelectorAll(".sidebar button")
    .forEach(b => b.classList.remove("active"));

  document.getElementById("btn-" + role).classList.add("active");

  loadUsers();
}

/* =========================
   Load Users
========================= */
async function loadUsers() {
  table.innerHTML = "";

  try {
    const users = await fetchJson(API_MAP[currentRole]);

    users.forEach(u => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input value="${u.name}" disabled></td>
        <td><input value="${u.username}" disabled></td>
        <td><input type="password" value="${u.password}" disabled></td>
        <td>${u.active ? "Active" : "Disabled"}</td>
        <td>
          <button onclick="editRow(this)">Edit</button>
          <button style="display:none" onclick="saveRow(this, ${u.id})">Save</button>
          <button onclick="toggleUser(${u.id}, ${u.active})">
            ${u.active ? "Disable" : "Enable"}
          </button>
          <button onclick="deleteUser(${u.id})">Delete</button>
        </td>
      `;
      table.appendChild(tr);
    });

  } catch (e) {
    alert(e.message);
  }
}

/* =========================
   Add User
========================= */
async function addUser() {
  if (!inputName.value || !inputUsername.value || !inputPassword.value) {
    alert("Fill all fields");
    return;
  }

  try {
    await fetchJson(API_MAP[currentRole], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: inputName.value,
        username: inputUsername.value,
        password: inputPassword.value,
        active: true
      })
    });

    inputName.value = "";
    inputUsername.value = "";
    inputPassword.value = "";

    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

/* =========================
   Edit / Save
========================= */
function editRow(btn) {
  const row = btn.closest("tr");
  row.querySelectorAll("input").forEach(i => i.disabled = false);
  btn.style.display = "none";
  btn.nextElementSibling.style.display = "inline-block";
}

async function saveRow(btn, id) {
  const row = btn.closest("tr");
  const inputs = row.querySelectorAll("input");

  try {
    await fetchJson(`${API_MAP[currentRole]}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: inputs[0].value,
        username: inputs[1].value,
        password: inputs[2].value
      })
    });

    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

/* =========================
   Enable / Disable
========================= */
async function toggleUser(id, active) {
  try {
    await fetchJson(`${API_MAP[currentRole]}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active })
    });

    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

/* =========================
   Delete
========================= */
async function deleteUser(id) {
  if (!confirm("Delete this user?")) return;

  try {
    await fetchJson(`${API_MAP[currentRole]}/${id}`, { method: "DELETE" });
    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}