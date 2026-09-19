/* =====================
   GH MOBILITY STAFF LOGIN
   GENERAL / MULTI-TENANT
===================== */

async function login(){

  const username =
    document.getElementById(
      "username"
    ).value.trim();

  const password =
    document.getElementById(
      "password"
    ).value.trim();

  const msg =
    document.getElementById(
      "msg"
    );

  msg.innerText = "";

  if(!username || !password){

    msg.innerText =
      "Please enter username and password";

    return;
  }

  msg.innerText =
    "Signing in...";

  try{

    /*
      IMPORTANT:
      This is the general GH Mobility login.

      No tenantSlug is selected by the page.
      The backend authenticates the account first,
      then returns the user's tenantId / tenantSlug.
    */
    const res =
      await fetch(
        "/api/auth/login",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:JSON.stringify({
            username,
            password
          })
        }
      );

    let data = {};

    try{
      data = await res.json();
    }catch(parseError){
      data = {};
    }

    if(!res.ok){

      msg.innerText =
        data.message ||
        "Login failed";

      return;
    }

    if(
      !data.user ||
      !data.user.role
    ){

      msg.innerText =
        "Invalid login response";

      return;
    }

    const staffSession = {
      token:data.token || "",
      role:data.user.role || "",
      name:data.user.name || "",
      tenantId:data.user.tenantId || "",
      tenantSlug:data.user.tenantSlug || ""
    };

    /*
      Keep staff authentication tab-safe.
      Each Electron/web tab stores its own staff session.
    */
    sessionStorage.setItem(
      "staffToken",
      staffSession.token
    );

    sessionStorage.setItem(
      "staffRole",
      staffSession.role
    );

    sessionStorage.setItem(
      "staffName",
      staffSession.name
    );

    sessionStorage.setItem(
      "staffTenantId",
      staffSession.tenantId
    );

    sessionStorage.setItem(
      "staffTenantSlug",
      staffSession.tenantSlug
    );

    /*
      Keep tenant identity available to the existing
      branding/system pages AFTER successful login only.
    */
    if(staffSession.tenantSlug){

      sessionStorage.setItem(
        "loginTenantSlug",
        staffSession.tenantSlug
      );

      localStorage.setItem(
        "tenantSlug",
        staffSession.tenantSlug
      );
    }

    if(
      data.user.role ===
      "PLATFORM_ADMIN"
    ){

      window.location.replace(
        "/platform-admin/dashboard.html"
      );

      return;
    }

    if(
      data.user.role ===
      "SUPER_ADMIN" ||
      data.user.role ===
      "admin"
    ){

      window.location.replace(
        "/admin/dashboard.html"
      );

      return;
    }

    if(
      data.user.role ===
      "dispatcher"
    ){

      window.location.replace(
        "/admin/dashboard.html"
      );

      return;
    }

    msg.innerText =
      "This account cannot login here";

  }catch(err){

    console.error(
      "STAFF LOGIN ERROR:",
      err
    );

    msg.innerText =
      "Server error";
  }
}

/* Allow Enter to submit the form. */
window.addEventListener(
  "DOMContentLoaded",
  () => {

    const username =
      document.getElementById(
        "username"
      );

    const password =
      document.getElementById(
        "password"
      );

    [username,password]
      .filter(Boolean)
      .forEach((input) => {

        input.addEventListener(
          "keydown",
          (event) => {

            if(event.key === "Enter"){
              login();
            }
          }
        );
      });
  }
);
