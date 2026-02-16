let currentRole = "admins";

const table = document.getElementById("table");
const title = document.getElementById("title");

const API_MAP = {
  admins: "/api/admins",
  companies: "/api/admins",      // مؤقت لحد ما تعمل API منفصلة
  dispatchers: "/api/admins",
  drivers: "/api/admins"
};

function setRole(role){
  currentRole = role;

  document.querySelectorAll(".sidebar button")
    .forEach(b => b.classList.remove("active"));

  document.getElementById("btn-" + role)
    .classList.add("active");

  title.innerText = role.toUpperCase() + " USERS";

  loadUsers();
}

async function loadUsers(){
  const res = await fetch(API_MAP[currentRole]);
  const users = await res.json();

  table.innerHTML = "";

  users.forEach(user=>{
    table.innerHTML += `
      <tr>
        <td><input value="${user.name}" disabled></td>
        <td><input value="${user.username}" disabled></td>
        <td><input value="${user.password}" disabled></td>
        <td>
          <button class="btn edit" onclick="editUser(${user.id}, this)">Edit</button>
          <button class="btn delete" onclick="deleteUser(${user.id})">Delete</button>
        </td>
      </tr>
    `;
  });
}

function editUser(id, btn){
  const row = btn.closest("tr");
  const inputs = row.querySelectorAll("input");

  inputs.forEach(i => i.disabled = false);

  btn.innerText = "Save";
  btn.classList.remove("edit");
  btn.classList.add("save");

  btn.onclick = ()=> saveUser(id, row);
}

async function saveUser(id, row){
  const inputs = row.querySelectorAll("input");

  await fetch(API_MAP[currentRole] + "/" + id,{
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      name: inputs[0].value,
      username: inputs[1].value,
      password: inputs[2].value
    })
  });

  loadUsers();
}

async function deleteUser(id){
  if(!confirm("Delete user?")) return;

  await fetch(API_MAP[currentRole] + "/" + id,{
    method:"DELETE"
  });

  loadUsers();
}

async function addUser(){
  await fetch(API_MAP[currentRole],{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      name: document.getElementById("name").value,
      username: document.getElementById("username").value,
      password: document.getElementById("password").value
    })
  });

  document.getElementById("name").value="";
  document.getElementById("username").value="";
  document.getElementById("password").value="";

  loadUsers();
}

loadUsers();