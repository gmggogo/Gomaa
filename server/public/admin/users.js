let currentRole = "superadmin";
let editId = null;

document.addEventListener(
  "DOMContentLoaded",
  () => {

    loadUsers();

  }
);

/* =========================
   CHANGE ROLE
========================= */

function changeRole(role){

  currentRole = role;

  editId = null;

  document.getElementById("title")
    .innerText =
      role.charAt(0).toUpperCase() +
      role.slice(1) +
      "s";

  document
    .querySelectorAll(".sidebar button")
    .forEach(btn =>
      btn.classList.remove("active")
    );

  const activeBtn =
    document.getElementById(
      role + "Btn"
    );

  if(activeBtn){

    activeBtn.classList.add(
      "active"
    );

  }

  clearInputs();

  loadUsers();

}

/* =========================
   LOAD USERS
========================= */

async function loadUsers(){

  try{

    const res =
      await fetch(
        `/api/users/${currentRole}`
      );

    const users =
      await res.json();

    const table =
      document.getElementById(
        "table"
      );

    table.innerHTML = "";

    if(
      !Array.isArray(users) ||
      !users.length
    ){

      table.innerHTML = `

        <tr>

          <td colspan="6">

            No users found

          </td>

        </tr>

      `;

      return;

    }

    users.forEach(user => {

      table.innerHTML += `

        <tr>

          <!-- NAME -->
          <td>

            ${user.name || "--"}

          </td>

          <!-- USERNAME -->
          <td>

            ${user.username || "--"}

          </td>

          <!-- EMAIL -->
          <td>

            ${user.email || "--"}

          </td>

          <!-- PHONE -->
          <td>

            ${user.phone || "--"}

          </td>

          <!-- STATUS -->
          <td>

            ${
              user.active
                ? "Active"
                : "Disabled"
            }

          </td>

          <!-- ACTIONS -->
          <td>

            <div class="actions">

              <button
                class="btn edit"

                onclick="editUser(
                  '${user._id}',
                  \`${user.name || ""}\`,
                  \`${user.username || ""}\`,
                  \`${user.email || ""}\`,
                  \`${user.phone || ""}\`
                )">

                Edit

              </button>

              <button
                class="btn disable"

                onclick="toggleUser(
                  '${user._id}'
                )">

                ${
                  user.active
                    ? "Disable"
                    : "Enable"
                }

              </button>

              <button
                class="btn delete"

                onclick="deleteUser(
                  '${user._id}'
                )">

                Delete

              </button>

            </div>

          </td>

        </tr>

      `;

    });

  }catch(err){

    console.log(err);

    alert(
      "Error loading users"
    );

  }

}

/* =========================
   ADD OR UPDATE USER
========================= */

async function addUser(){

  const name =
    document.getElementById(
      "name"
    ).value.trim();

  const username =
    document.getElementById(
      "username"
    ).value.trim();

  const email =
    document.getElementById(
      "email"
    ).value.trim();

  const phone =
    document.getElementById(
      "phone"
    ).value.trim();

  const password =
    document.getElementById(
      "password"
    ).value.trim();

  if(
    !name ||
    !username ||
    !email ||
    !phone
  ){

    alert(
      "Please complete all fields"
    );

    return;

  }

  try{

    /* =========================
       UPDATE USER
    ========================= */

    if(editId){

      await fetch(
        `/api/users/${editId}`,
        {
          method:"PUT",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:JSON.stringify({

            name,
            username,
            email,
            phone,
            password

          })
        }
      );

    }

    /* =========================
       CREATE USER
    ========================= */

    else{

      if(!password){

        alert(
          "Password required"
        );

        return;

      }

      await fetch(
        `/api/users/${currentRole}`,
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:JSON.stringify({

            name,
            username,
            email,
            phone,
            password

          })
        }
      );

    }

    clearInputs();

    loadUsers();

  }catch(err){

    console.log(err);

    alert(
      "Save failed"
    );

  }

}

/* =========================
   EDIT USER
========================= */

function editUser(
  id,
  name,
  username,
  email,
  phone
){

  editId = id;

  document.getElementById(
    "name"
  ).value = name || "";

  document.getElementById(
    "username"
  ).value = username || "";

  document.getElementById(
    "email"
  ).value = email || "";

  document.getElementById(
    "phone"
  ).value = phone || "";

  document.getElementById(
    "password"
  ).value = "";

}

/* =========================
   TOGGLE ACTIVE
========================= */

async function toggleUser(id){

  try{

    await fetch(
      `/api/users/${id}/toggle`,
      {
        method:"PATCH"
      }
    );

    loadUsers();

  }catch(err){

    console.log(err);

  }

}

/* =========================
   DELETE USER
========================= */

async function deleteUser(id){

  const ok =
    confirm(
      "Are you sure?"
    );

  if(!ok) return;

  try{

    await fetch(
      `/api/users/${id}`,
      {
        method:"DELETE"
      }
    );

    loadUsers();

  }catch(err){

    console.log(err);

  }

}

/* =========================
   CLEAR INPUTS
========================= */

function clearInputs(){

  editId = null;

  document.getElementById(
    "name"
  ).value = "";

  document.getElementById(
    "username"
  ).value = "";

  document.getElementById(
    "email"
  ).value = "";

  document.getElementById(
    "phone"
  ).value = "";

  document.getElementById(
    "password"
  ).value = "";

}