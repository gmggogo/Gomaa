/* =========================================================
   FILE: server/public/admin/users.js
   ROLE PERMISSIONS:
   SUPER_ADMIN -> superadmin / admin / dispatcher / driver / company
   ADMIN       -> dispatcher / driver / company
   DISPATCHER  -> no access to Add User
========================================================= */

let editId = null;

/* =========================
   SECURITY / ROLE
========================= */

const token =
  localStorage.getItem("token") || "";

const loginRole =
  String(
    localStorage.getItem("role") || ""
  )
  .trim()
  .toUpperCase()
  .replace(/[\s-]+/g,"_");

const isSuperAdmin =
  loginRole === "SUPER_ADMIN" ||
  loginRole === "SUPERADMIN";

const isAdmin =
  loginRole === "ADMIN";

if(
  !token ||
  (!isSuperAdmin && !isAdmin)
){
  window.location.href =
    "/login.html";
}

/* =========================
   ALLOWED USER TYPES
========================= */

const SUPER_ADMIN_ROLES = [
  "superadmin",
  "admin",
  "dispatcher",
  "driver",
  "company"
];

const ADMIN_ROLES = [
  "dispatcher",
  "driver",
  "company"
];

const allowedRoles =
  isSuperAdmin
    ? SUPER_ADMIN_ROLES
    : ADMIN_ROLES;

/*
  Super Admin keeps current behavior starting on Super Admin.
  Normal Admin starts on Dispatcher because Admin/Super Admin
  are not available to that role.
*/
let currentRole =
  isSuperAdmin
    ? "superadmin"
    : "dispatcher";

/* =========================
   HELPERS
========================= */

function roleAllowed(targetRole){

  return allowedRoles.includes(
    String(targetRole || "")
      .trim()
      .toLowerCase()
  );
}

function roleTitle(targetRole){

  const labels = {
    superadmin:"Super Admins",
    admin:"Admins",
    dispatcher:"Dispatchers",
    driver:"Drivers",
    company:"Companies"
  };

  return (
    labels[targetRole] ||
    targetRole
  );
}

async function safeJson(res){

  try{
    return await res.json();
  }catch(err){
    return {};
  }
}

function hideForbiddenRoleButtons(){

  const allRoles = [
    "superadmin",
    "admin",
    "dispatcher",
    "driver",
    "company"
  ];

  allRoles.forEach(targetRole=>{

    const btn =
      document.getElementById(
        targetRole + "Btn"
      );

    if(!btn){
      return;
    }

    btn.style.display =
      roleAllowed(targetRole)
        ? ""
        : "none";
  });
}

/* =========================
   INIT
========================= */

document.addEventListener(
  "DOMContentLoaded",
  ()=>{

    hideForbiddenRoleButtons();

    changeRole(
      currentRole,
      true
    );
  }
);

/* =========================
   CHANGE ROLE
========================= */

function changeRole(
  targetRole,
  initial = false
){

  targetRole =
    String(targetRole || "")
      .trim()
      .toLowerCase();

  if(!roleAllowed(targetRole)){

    alert(
      "You do not have permission to manage this user type."
    );

    return;
  }

  currentRole =
    targetRole;

  editId =
    null;

  const title =
    document.getElementById(
      "title"
    );

  if(title){
    title.innerText =
      roleTitle(targetRole);
  }

  document
    .querySelectorAll(
      ".sidebar button"
    )
    .forEach(btn=>
      btn.classList.remove(
        "active"
      )
    );

  const activeBtn =
    document.getElementById(
      targetRole + "Btn"
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

  if(!roleAllowed(currentRole)){
    return;
  }

  try{

    const res =
      await fetch(
        `/api/users/${currentRole}`,
        {
          headers:{
            Authorization:
              "Bearer " + token
          }
        }
      );

    const data =
      await safeJson(res);

    if(!res.ok){

      throw new Error(
        data.message ||
        "Error loading users"
      );
    }

    const users =
      Array.isArray(data)
        ? data
        : [];

    const table =
      document.getElementById(
        "table"
      );

    if(!table){
      return;
    }

    table.innerHTML = "";

    if(!users.length){

      table.innerHTML = `
        <tr>
          <td colspan="6">
            No users found
          </td>
        </tr>
      `;

      return;
    }

    users.forEach(user=>{

      table.innerHTML += `
        <tr>

          <td>
            ${user.name || "--"}
          </td>

          <td>
            ${user.username || "--"}
          </td>

          <td>
            ${user.email || "--"}
          </td>

          <td>
            ${user.phone || "--"}
          </td>

          <td>
            ${
              user.active !== false &&
              user.enabled !== false
                ? "Active"
                : "Disabled"
            }
          </td>

          <td>
            <div class="actions">

              <button
                class="btn edit"
                onclick="editUser(
                  '${user._id}',
                  ${JSON.stringify(user.name || "")},
                  ${JSON.stringify(user.username || "")},
                  ${JSON.stringify(user.email || "")},
                  ${JSON.stringify(user.phone || "")}
                )">
                Edit
              </button>

              <button
                class="btn disable"
                onclick="toggleUser(
                  '${user._id}'
                )">
                ${
                  user.active !== false &&
                  user.enabled !== false
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
      err.message ||
      "Error loading users"
    );
  }
}

/* =========================
   ADD OR UPDATE USER
========================= */

async function addUser(){

  if(!roleAllowed(currentRole)){

    alert(
      "You do not have permission for this user type."
    );

    return;
  }

  const name =
    document.getElementById(
      "name"
    )?.value.trim() || "";

  const username =
    document.getElementById(
      "username"
    )?.value.trim() || "";

  const email =
    document.getElementById(
      "email"
    )?.value.trim() || "";

  const phone =
    document.getElementById(
      "phone"
    )?.value.trim() || "";

  const password =
    document.getElementById(
      "password"
    )?.value.trim() || "";

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

    let res = null;

    /* UPDATE USER */

    if(editId){

      res =
        await fetch(
          `/api/users/${editId}`,
          {
            method:"PUT",

            headers:{
              "Content-Type":
                "application/json",

              Authorization:
                "Bearer " + token
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

    /* CREATE USER */

    else{

      if(!password){

        alert(
          "Password required"
        );

        return;
      }

      res =
        await fetch(
          `/api/users/${currentRole}`,
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json",

              Authorization:
                "Bearer " + token
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

    const data =
      await safeJson(res);

    if(!res.ok){

      throw new Error(
        data.message ||
        "Save failed"
      );
    }

    clearInputs();

    await loadUsers();

  }catch(err){

    console.log(err);

    alert(
      err.message ||
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

    const res =
      await fetch(
        `/api/users/${id}/toggle`,
        {
          method:"PATCH",

          headers:{
            Authorization:
              "Bearer " + token
          }
        }
      );

    const data =
      await safeJson(res);

    if(!res.ok){

      throw new Error(
        data.message ||
        "Update failed"
      );
    }

    await loadUsers();

  }catch(err){

    console.log(err);

    alert(
      err.message ||
      "Update failed"
    );
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

  if(!ok){
    return;
  }

  try{

    const res =
      await fetch(
        `/api/users/${id}`,
        {
          method:"DELETE",

          headers:{
            Authorization:
              "Bearer " + token
          }
        }
      );

    const data =
      await safeJson(res);

    if(!res.ok){

      throw new Error(
        data.message ||
        "Delete failed"
      );
    }

    await loadUsers();

  }catch(err){

    console.log(err);

    alert(
      err.message ||
      "Delete failed"
    );
  }
}

/* =========================
   CLEAR INPUTS
========================= */

function clearInputs(){

  editId = null;

  [
    "name",
    "username",
    "email",
    "phone",
    "password"
  ].forEach(id=>{

    const el =
      document.getElementById(id);

    if(el){
      el.value = "";
    }
  });
}