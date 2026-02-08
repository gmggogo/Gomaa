const API = "/api/admins";
const table = document.getElementById("table");

async function loadUsers() {
  const res = await fetch(API);
  const users = await res.json();
  table.innerHTML = "";

  users.forEach((u, i) => {
    table.innerHTML += `
      <tr>
        <td><input value="${u.name}" disabled></td>
        <td><input value="${u.username}" disabled></td>
        <td><input placeholder="New password" disabled></td>
        <td>
          <button class="btn edit" onclick="editRow(this)">Edit</button>
          <button class="btn save" onclick="saveRow(${i}, this)" style="display:none">Save</button>
          <button class="btn delete" onclick="deleteUser(${i})">Delete</button>
        </td>
      </tr>
    `;
  });
}

function editRow(btn) {
  const row = btn.closest("tr");
  row.querySelectorAll("input").forEach(i => i.disabled = false);
  btn.style.display = "none";
  row.querySelector(".save").style.display = "inline-block";
}

async function saveRow(index, btn) {
  const row = btn.closest("tr");
  const inputs = row.querySelectorAll("input");

  await fetch(API + "/" + index, {
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

async function deleteUser(index) {
  if (!confirm("Delete user?")) return;
  await fetch(API + "/" + index, { method: "DELETE" });
  loadUsers();
}

async function addUser() {
  await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name.value,
      username: username.value,
      password: password.value
    })
  });

  name.value = username.value = password.value = "";
  loadUsers();
}

loadUsers();