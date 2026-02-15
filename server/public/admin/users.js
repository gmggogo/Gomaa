// =========================
// ADMIN USERS FULL VERSION
// =========================

const API = "/api/admin/users";
let currentRole = "company";

const table = document.getElementById("usersTable");
const title = document.getElementById("pageTitle");

const inputName = document.getElementById("inputName");
const inputUsername = document.getElementById("inputUsername");
const inputPassword = document.getElementById("inputPassword");

// =========================
// CHECK TOKEN
// =========================
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Please login again.");
    window.location.href = "/login.html";
    return;
  }

  switchRole("company");
});

// =========================
// FETCH WITH TOKEN
// =========================
async function fetchJson(url, options = {}) {

  const token = localStorage.getItem("token");

  options.headers = {
    "Content-Type": "application/json",
    ...(token && { "Authorization": "Bearer " + token }),
    ...options.headers
  };

  const res = await fetch(url, options);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || "Request failed");
  }

  return text ? JSON.parse(text) : {};
}

// =========================
// SWITCH ROLE
// =========================
function switchRole(role) {

  currentRole = role;
  title.innerText = role.toUpperCase() + " USERS";

  document.querySelectorAll(".sidebar button")
    .forEach(b => b.classList.remove("active"));

  document.getElementById("btn-" + role).classList.add("active");

  loadUsers();
}

// =========================
// LOAD USERS
// =========================
async function loadUsers() {

  table.innerHTML = "";

  try {

    const users = await fetchJson(API);

    users
      .filter(u => u.role === currentRole)
      .forEach(u => {

        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td><input value="${u.name}" disabled></td>
          <td><input value="${u.username}" disabled></td>
          <td>********</td>
          <td>${u.active ? "Active" : "Disabled"}</td>
          <td>
            <button class="btn edit" onclick="editRow(this)">Edit</button>
            <button class="btn save" style="display:none" onclick="saveRow(this, ${u.id})">Save</button>
            <button class="btn toggle" onclick="toggleUser(${u.id}, ${u.active})">
              ${u.active ? "Disable" : "Enable"}
            </button>
            <button class="btn delete" onclick="deleteUser(${u.id})">Delete</button>
            <button class="btn" onclick="changePassword(${u.id})">Change Password</button>
          </td>
        `;

        table.appendChild(tr);
      });

  } catch (err) {
    alert("Load failed:\n" + err.message);
  }
}

// =========================
// ADD USER
// =========================
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
        role: currentRole
      })
    });

    inputName.value = "";
    inputUsername.value = "";
    inputPassword.value = "";

    loadUsers();

  } catch (err) {
    alert("Add failed:\n" + err.message);
  }
}

// =========================
// EDIT
// =========================
function editRow(btn) {

  const row = btn.closest("tr");
  row.querySelectorAll("input").forEach(i => i.disabled = false);

  btn.style.display = "none";
  btn.nextElementSibling.style.display = "inline-block";
}

// =========================
// SAVE
// =========================
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

// =========================
// ENABLE / DISABLE
// =========================
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

// =========================
// DELETE
// =========================
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

// =========================
// CHANGE PASSWORD
// =========================
async function changePassword(id) {

  const newPass = prompt("Enter new password:");
  if (!newPass) return;

  try {

    await fetchJson(`${API}/${id}/password`, {
      method: "PUT",
      body: JSON.stringify({ password: newPass })
    });

    alert("Password updated");

  } catch (err) {
    alert("Password change failed:\n" + err.message);
  }
}