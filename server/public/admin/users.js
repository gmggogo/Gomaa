let currentRole = "admins";

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
        <td>
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

async function deleteUser(id){
  await fetch("/api/users/"+currentRole+"/"+id,{
    method:"DELETE"
  });
  loadUsers();
}

switchRole("admins");