const API = `${location.protocol}//${location.hostname}:4000/api/users`;

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
   LocalStorage mirror for Company Login
   - we only mirror "company" role
========================= */
function saveCompanyUsersToLocalStorage(serverUsers) {
  if (!Array.isArray(serverUsers)) return;

  // Company login expects: [{name, username, password, active}]
  const companyUsers = serverUsers
    .filter(u => u && (u.role === "company" || currentRole === "company"))
    .map(u => ({
      name: u.name || "",
      username: u.username || "",
      password: u.password || "",
      active: !!u.active
    }));

  localStorage.setItem("companyUsers", JSON.stringify(companyUsers));
}

/* =========================
   Safe JSON fetch helper
========================= */
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);

  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!res.ok) {
    // show server message if any
    throw new Error(text || `Request failed: ${res.status}`);
  }

  // If server returned HTML, this will prevent "Unexpected token <"
  if (!contentType.includes("application/json")) {
    throw new Error("Server returned non-JSON response (HTML). Check API route / server.");
  }

  return JSON.parse(text);
}

/* =========================
   Switch Role
========================= */
function switchRole(role) {
  currentRole = role;
  title.innerText = role.toUpperCase() + " USERS";

  document.querySelectorAll(".sidebar button").forEach(b => b.classList.remove("active"));
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

    // Mirror company users to localStorage for company-login
    if (currentRole === "company") {
      saveCompanyUsersToLocalStorage(users);
    }

    users.forEach(u => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td><input value="${u.name ?? ""}" disabled></td>
        <td><input value="${u.username ?? ""}" disabled></td>
        <td><input type="password" value="${u.password ?? ""}" disabled></td>
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

  } catch (e) {
    alert("Server not reachable / API error:\n" + e.message);
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
        name: inputName.value,
        username: inputUsername.value,
        password: inputPassword.value,
        role: currentRole
      })
    });

    inputName.value = "";
    inputUsername.value = "";
    inputPassword.value = "";

    loadUsers();
  } catch (e) {
    alert("Add user failed:\n" + e.message);
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
  } catch (e) {
    alert("Save failed:\n" + e.message);
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
  } catch (e) {
    alert("Toggle failed:\n" + e.message);
  }
}

/* =========================
   Delete
========================= */
async function deleteUser(id) {
  if (!confirm("Delete this user?")) return;

  try {
    await fetchJson(`${API}/${id}`, { method: "DELETE" });
    loadUsers();
  } catch (e) {
    alert("Delete failed:\n" + e.message);
  }
}