// =========================
// USERS (RBAC VERSION)
// =========================

const API = "/api/users";

const table = document.getElementById("usersTable");
const title = document.getElementById("pageTitle");

const inputName = document.getElementById("inputName");
const inputUsername = document.getElementById("inputUsername");
const inputPassword = document.getElementById("inputPassword");

// تأكد إن فيه توكن
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Not authorized. Please login again.");
    window.location.href = "login.html";
    return;
  }

  loadUsers();
});

/* =========================
   Fetch helper (WITH TOKEN)
========================= */
async function fetchJson(url, options = {}) {

  const token = localStorage.getItem("token");

  options.headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token,
    ...options.headers
  };

  const res = await fetch(url, options);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || "Request failed");
  }

  return text ? JSON.parse(text) : {};
}

/* =========================
   Load Users
========================= */
async function loadUsers() {
  table.innerHTML = "";

  try {
    const users = await fetchJson(API);

    users.forEach(u => {

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td><input value="${u.name}" disabled></td>
        <td><input value="${u.username}" disabled></td>
        <td>${u.role}</td>
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
    alert("Load users failed:\n" + err.message);
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
      body: JSON.stringify({
        name: inputName.value.trim(),
        username: inputUsername.value.trim(),
        password: inputPassword.value.trim(),
        role: document.getElementById("roleSelect").value
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

  row.querySelectorAll("input").forEach(i => {
    i.disabled = false;
  });

  btn.style.display = "none";
  btn.nextElementSibling.style.display = "inline-block";
}

async function saveRow(btn, id) {

  const row = btn.closest("tr");
  const inputs = row.querySelectorAll("input");

  try {

    await fetchJson(`${API}/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: inputs[0].value.trim(),
        username: inputs[1].value.trim()
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

    await fetchJson(`${API}/${id}`, {
      method: "DELETE"
    });

    loadUsers();

  } catch (err) {
    alert("Delete failed:\n" + err.message);
  }
}