// ======================================================
// USERS.JS – FINAL PROFESSIONAL VERSION (RBAC READY)
// ======================================================

const API = "/api/users";
let currentRole = "company";

const table = document.getElementById("usersTable");
const title = document.getElementById("pageTitle");

const inputName = document.getElementById("inputName");
const inputUsername = document.getElementById("inputUsername");
const inputPassword = document.getElementById("inputPassword");


// ======================================================
// CHECK TOKEN ON LOAD
// ======================================================
document.addEventListener("DOMContentLoaded", () => {

  const token = localStorage.getItem("token");

  if (!token) {
    alert("Session expired. Please login again.");
    window.location.href = "/login.html";
    return;
  }

  switchRole("company");
});


// ======================================================
// FETCH WITH JWT
// ======================================================
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


// ======================================================
// SWITCH ROLE
// ======================================================
function switchRole(role) {

  currentRole = role;
  title.innerText = role.toUpperCase() + " USERS";

  document.querySelectorAll(".sidebar button")
    .forEach(b => b.classList.remove("active"));

  const btn = document.getElementById("btn-" + role);
  if (btn) btn.classList.add("active");

  loadUsers();
}


// ======================================================
// LOAD USERS (FILTER BY ROLE)
// ======================================================
async function loadUsers() {

  table.innerHTML = "";

  try {

    const users = await fetchJson(`${API}?role=${currentRole}`);

    users.forEach(u => {

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td><input value="${u.name}" disabled></td>
        <td><input value="${u.username}" disabled></td>
        <td>
          <input type="text" placeholder="New password" disabled>
        </td>
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
    alert("Load failed:\n" + err.message);
  }
}


// ======================================================
// ADD USER
// ======================================================
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


// ======================================================
// EDIT MODE
// ======================================================
function editRow(btn) {

  const row = btn.closest("tr");

  row.querySelectorAll("input").forEach(i => {
    i.disabled = false;
  });

  btn.style.display = "none";
  btn.nextElementSibling.style.display = "inline-block";
}


// ======================================================
// SAVE USER (UPDATE NAME + USERNAME + PASSWORD)
// ======================================================
async function saveRow(btn, id) {

  const row = btn.closest("tr");
  const inputs = row.querySelectorAll("input");

  const newName = inputs[0].value.trim();
  const newUsername = inputs[1].value.trim();
  const newPassword = inputs[2].value.trim();

  try {

    // 1️⃣ Update name + username
    await fetchJson(`${API}/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: newName,
        username: newUsername
      })
    });

    // 2️⃣ Update password if entered
    if (newPassword) {
      await fetchJson(`${API}/${id}/password`, {
        method: "PUT",
        body: JSON.stringify({
          password: newPassword
        })
      });
    }

    loadUsers();

  } catch (err) {
    alert("Save failed:\n" + err.message);
  }
}


// ======================================================
// ENABLE / DISABLE
// ======================================================
async function toggleUser(id, active) {

  try {

    await fetchJson(`${API}/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        active: !active
      })
    });

    loadUsers();

  } catch (err) {
    alert("Toggle failed:\n" + err.message);
  }
}


// ======================================================
// DELETE USER
// ======================================================
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