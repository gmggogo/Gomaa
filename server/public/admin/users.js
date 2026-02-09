// =========================
// ONLINE API (Render-safe)
// =========================
const API = "/api/admin/users";

let currentRole = "company";

const table = document.getElementById("usersTable");
const title = document.getElementById("pageTitle");

const inputName = document.getElementById("inputName");
const inputUsername = document.getElementById("inputUsername");
const inputPassword = document.getElementById("inputPassword");

document.addEventListener("DOMContentLoaded", () => {
  switchRole("company");
});

/* =========================
   Fetch helper (JSON safe)
========================= */
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || `Request failed ${res.status}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON response from server");
  }
}

/* =========================
   Switch Role
========================= */
function switchRole(role) {
  currentRole = role;
  title.innerText = role.toUpperCase() + " USERS";

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
    const users = await fetchJson(`${API}?role=${currentRole}`);

    users.forEach(u => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td><input value="${u.name || ""}" disabled></td>
        <td><input value="${u.username || ""}" disabled></td>
        <td><input type="password" value="${u.password || ""}" disabled></td>
        <td>${u.active ? "Active" : "Disabled"}</td>
        <td>
          <button class="btn edit" onclick="editRow(this)">Edit</button>
          <button class="btn save" style="display:none" onclick="saveRow(this, ${u.id})">Save</button>
          <button class="btn toggle" onclick="toggleUser(${u.id}, ${u.active})">
            ${u.active ? "Disable" : "Enable"}
          </button>
          <button class="btn delete" onclick="deleteUser(${u.id})">Delete</button>
        </td>
      `;

      table.appendChild(tr);
    });

  } catch (err) {
    alert("Failed to load users:\n" + err.message);
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
    await fetchJson(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: inputName.value.trim(),
        username: inputUsername.value.trim(),
        password: inputPassword.value.trim(),
        role: currentRole,
        active: true
      })
    });

    inputName.value = "";
    inputUsername.value = "";
    inputPassword.value = "";

    loadUsers();
  } catch (err) {
    alert("Add user failed:\n" + err.message);
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
    await fetchJson(`${API}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: inputs[0].value,
        username: inputs[1].value,
        password: inputs[2].value
      })
    });

    loadUsers();
  } catch (err) {
    alert("Save failed:\n" + err.message);
  }
}

/* =========================
   Enable / Disable
========================= */
async function toggleUser(id, active) {
  try {
    await fetchJson(`${API}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active })
    });

    loadUsers();
  } catch (err) {
    alert("Toggle failed:\n" + err.message);
  }
}

/* =========================
   Delete User
========================= */
async function deleteUser(id) {
  if (!confirm("Delete this user?")) return;

  try {
    await fetchJson(`${API}/${id}`, { method: "DELETE" });
    loadUsers();
  } catch (err) {
    alert("Delete failed:\n" + err.message);
  }
}