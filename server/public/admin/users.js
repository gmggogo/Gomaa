const roleSelect = document.getElementById("role");
const table = document.getElementById("usersTable");

async function loadUsers() {
  table.innerHTML = "";
  const role = roleSelect.value;

  const res = await fetch(`/api/${role}`);
  const users = await res.json();

  users.forEach(u => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.name}</td>
      <td>${u.username}</td>
      <td>${u.password}</td>
      <td>${u.active !== false}</td>
    `;
    table.appendChild(tr);
  });
}

async function addUser() {
  const role = roleSelect.value;

  const name = document.getElementById("name").value;
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  await fetch(`/api/${role}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, username, password })
  });

  loadUsers();
}

roleSelect.addEventListener("change", loadUsers);

loadUsers();