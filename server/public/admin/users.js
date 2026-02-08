let role = "admins";

function switchRole(r) {
  role = r;
  document.getElementById("pageTitle").innerText =
    r.charAt(0).toUpperCase() + r.slice(1);
  loadUsers();
}

function goBack() {
  location.href = "../dashboard.html";
}

async function loadUsers() {
  const res = await fetch(`/api/${role}`);
  const data = await res.json();

  const body = document.getElementById("tableBody");
  body.innerHTML = "";

  data.forEach(u => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.name || ""}</td>
      <td>${u.username || ""}</td>
      <td>${u.active ? "Active" : "Disabled"}</td>
      <td>
        <button class="btn btn-del" onclick="deleteUser(${u.id})">Delete</button>
      </td>
    `;
    body.appendChild(tr);
  });
}

async function addUser() {
  const name = nameInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!name || !username || !password) {
    alert("Fill all fields");
    return;
  }

  await fetch(`/api/${role}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, username, password })
  });

  nameInput.value = "";
  usernameInput.value = "";
  passwordInput.value = "";

  loadUsers();
}

async function deleteUser(id) {
  if (!confirm("Delete user?")) return;
  await fetch(`/api/${role}/${id}`, { method: "DELETE" });
  loadUsers();
}

loadUsers();