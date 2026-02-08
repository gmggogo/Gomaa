let currentRole = "admin";

const roleMap = {
  company: "companies",
  admin: "admins",
  dispatcher: "dispatchers",
  driver: "drivers"
};

function switchRole(role){
  currentRole = role;
  document.getElementById("pageTitle").innerText =
    role.charAt(0).toUpperCase() + role.slice(1);

  document.querySelectorAll(".sidebar button").forEach(b=>{
    b.classList.remove("active");
  });
  document.getElementById("btn-" + role).classList.add("active");

  loadUsers();
}

async function loadUsers(){
  const tbody = document.getElementById("usersTable");
  tbody.innerHTML = "";

  try{
    const res = await fetch(`/api/${roleMap[currentRole]}`);
    const data = await res.json();

    data.forEach(u=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.name}</td>
        <td>${u.username}</td>
        <td>${u.password || "••••"}</td>
        <td>${u.active ? "Active" : "Disabled"}</td>
        <td>
          <button class="btn delete" onclick="deleteUser('${u._id}')">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

  }catch(err){
    alert("Error loading users");
    console.error(err);
  }
}

async function addUser(){
  const name = inputName.value.trim();
  const username = inputUsername.value.trim();
  const password = inputPassword.value.trim();

  if(!name || !username || !password){
    alert("Fill all fields");
    return;
  }

  try{
    const res = await fetch(`/api/${roleMap[currentRole]}`,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ name, username, password })
    });

    if(!res.ok) throw new Error("Failed");

    inputName.value="";
    inputUsername.value="";
    inputPassword.value="";

    loadUsers();

  }catch(err){
    alert("Error adding user");
    console.error(err);
  }
}

async function deleteUser(id){
  if(!confirm("Delete user?")) return;

  try{
    await fetch(`/api/${roleMap[currentRole]}/${id}`,{
      method:"DELETE"
    });
    loadUsers();
  }catch(err){
    alert("Error deleting user");
  }
}

/* INIT */
switchRole("admin");