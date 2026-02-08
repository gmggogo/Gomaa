let currentRole = "admins";

const inputName = document.getElementById("inputName");
const inputUsername = document.getElementById("inputUsername");
const inputPassword = document.getElementById("inputPassword");

function switchRole(role) {
  currentRole = role;
  document.getElementById("pageTitle").innerText = role.toUpperCase();
  loadUsers();
}

function loadUsers() {
  fetch(`/api/${currentRole}`)
    .then(r => r.json())
    .then(list => {
      const table = document.getElementById("usersTable");
      table.innerHTML = "";
      list.forEach(u => {
        table.innerHTML += `
          <tr>
            <td>${u.name}</td>
            <td>${u.username}</td>
            <td>${u.active ? "Active" : "Disabled"}</td>
          </tr>
        `;
      });
    });
}

function addUser() {
  fetch(`/api/${currentRole}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: inputName.value,
      username: inputUsername.value,
      password: inputPassword.value
    })
  })
  .then(r => r.json())
  .then(() => {
    inputName.value = "";
    inputUsername.value = "";
    inputPassword.value = "";
    loadUsers();
    alert("User Added");
  })
  .catch(() => alert("Error"));
}

loadUsers();