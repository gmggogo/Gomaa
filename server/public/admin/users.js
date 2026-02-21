let currentRole = "admins";
let editingId = null;

const tableBody = document.getElementById("tableBody");
const title = document.getElementById("title");

function setActive(role){
  document.querySelectorAll(".sidebar button")
    .forEach(btn=>btn.classList.remove("active"));
  document.getElementById(role+"Btn").classList.add("active");
}

function switchRole(role){
  currentRole = role;
  title.innerText = role.toUpperCase();
  setActive(role);
  loadUsers();
}

async function loadUsers(){
  const res = await fetch("/api/users/"+currentRole);
  const data = await res.json();

  tableBody.innerHTML = "";

  data.forEach(user=>{
    tableBody.innerHTML += `
      <tr>
        <td>${user.name}</td>
        <td>${user.username}</td>
        <td>${user.active ? "Active" : "Disabled"}</td>
        <td>
          <button class="action-btn edit"
            onclick="editUser('${user._id}','${user.name}','${user.username}')">
            Edit
          </button>
          <button class="action-btn toggle"
            onclick="toggleUser('${user._id}')">
            ${user.active ? "Disable" : "Enable"}
          </button>
          <button class="action-btn delete"
            onclick="deleteUser('${user._id}')">
            Delete
          </button>
        </td>
      </tr>
    `;
  });
}

async function addUser(){
  const name = document.getElementById("name").value;
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if(!name || !username || !password){
    alert("Fill all fields");
    return;
  }

  const res = await fetch("/api/users/"+currentRole,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({name,username,password})
  });

  const data = await res.json();

  if(!res.ok){
    alert(data.message || "Error");
    return;
  }

  document.getElementById("name").value="";
  document.getElementById("username").value="";
  document.getElementById("password").value="";

  loadUsers();
}

function editUser(id,name,username){
  editingId = id;
  document.getElementById("name").value = name;
  document.getElementById("username").value = username;
  document.getElementById("password").value = "";
}

async function saveEdit(){
  if(!editingId){
    alert("Select user first");
    return;
  }

  const name = document.getElementById("name").value;
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  await fetch("/api/users/"+editingId,{
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({name,username,password})
  });

  editingId = null;

  document.getElementById("name").value="";
  document.getElementById("username").value="";
  document.getElementById("password").value="";

  loadUsers();
}

async function toggleUser(id){
  await fetch("/api/users/"+id+"/toggle",{ method:"PATCH" });
  loadUsers();
}

async function deleteUser(id){
  if(!confirm("Are you sure?")) return;
  await fetch("/api/users/"+id,{ method:"DELETE" });
  loadUsers();
}

switchRole("admins");