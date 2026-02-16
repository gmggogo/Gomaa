let currentRole = "admins";

const tableBody = document.getElementById("tableBody");
const title = document.getElementById("title");

function switchRole(role){
  currentRole = role;
  title.innerText = role.toUpperCase();
  loadUsers();
}

async function loadUsers(){
  const res = await fetch("/api/"+currentRole);
  const data = await res.json();

  tableBody.innerHTML = "";

  data.forEach(user=>{
    tableBody.innerHTML += `
      <tr>
        <td>${user.name}</td>
        <td>${user.username}</td>
        <td>${user.password}</td>
        <td><button onclick="deleteUser(${user.id})">Delete</button></td>
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

  await fetch("/api/"+currentRole,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({name,username,password})
  });

  document.getElementById("name").value="";
  document.getElementById("username").value="";
  document.getElementById("password").value="";

  loadUsers();
}

async function deleteUser(id){
  await fetch("/api/"+currentRole+"/"+id,{
    method:"DELETE"
  });
  loadUsers();
}

switchRole("admins");