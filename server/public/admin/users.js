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
        <td class="${user.active ? 'status-active':'status-disabled'}">
          ${user.active ? "Active":"Disabled"}
        </td>
        <td>
          <button onclick="openEdit('${user._id}','${user.name}','${user.username}')">Edit</button>
          <button onclick="toggleUser('${user._id}')">
            ${user.active ? "Disable":"Enable"}
          </button>
          <button onclick="deleteUser('${user._id}')">Delete</button>
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

  await fetch("/api/users/"+currentRole,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({name,username,password})
  });

  document.getElementById("name").value="";
  document.getElementById("username").value="";
  document.getElementById("password").value="";

  loadUsers();
}

function openEdit(id,name,username){
  editingId = id;
  document.getElementById("editName").value = name;
  document.getElementById("editUsername").value = username;
  document.getElementById("editPassword").value = "";
  document.getElementById("editModal").style.display="flex";
}

function closeModal(){
  document.getElementById("editModal").style.display="none";
}

async function saveEdit(){
  const name = document.getElementById("editName").value;
  const username = document.getElementById("editUsername").value;
  const password = document.getElementById("editPassword").value;

  await fetch("/api/users/"+editingId,{
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({name,username,password})
  });

  closeModal();
  loadUsers();
}

async function toggleUser(id){
  await fetch("/api/users/"+id+"/toggle",{ method:"PATCH" });
  loadUsers();
}

async function deleteUser(id){
  if(!confirm("Delete user?")) return;
  await fetch("/api/users/"+id,{ method:"DELETE" });
  loadUsers();
}

switchRole("admins");