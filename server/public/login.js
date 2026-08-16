/* =====================
   STAFF LOGIN
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

    const data =
      await res.json()
        .catch(()=>({}));

    if(!res.ok){

      msg.innerText =
        data.message ||
        "Login failed";

      return;
    }

    /*
      Support both response shapes:

      New:
      {
        token,
        user:{
          id,name,role,tenantId
        }
      }

      Compatibility:
      {
        token,
        role,
        tenantId,
        name,
        tenant:{...}
      }
    */

    const user =
      data.user &&
      typeof data.user === "object"
        ? data.user
        : {};

    const authToken =
      String(
        data.token ||
        user.token ||
        ""
      ).trim();

    const userRole =
      String(
        user.role ||
        data.role ||
        ""
      ).trim();

    const userName =
      String(
        user.name ||
        data.name ||
        data.username ||
        username
      ).trim();

    const tenantId =
      String(
        user.tenantId ||
        data.tenantId ||
        data.tenant?.id ||
        data.tenant?._id ||
        ""
      ).trim();

    const tenantSlug =
      String(
        user.tenantSlug ||
        data.tenantSlug ||
        data.tenant?.slug ||
        ""
      )
      .trim()
      .toLowerCase();

    const timezone =
      String(
        user.timezone ||
        data.timezone ||
        data.tenant?.timezone ||
        ""
      ).trim();

    if(!authToken){

      msg.innerText =
        "Login response missing token";

      return;
    }

    if(!userRole){

      msg.innerText =
        "Login response missing role";

      return;
    }

    /* =====================
       SAVE LOGIN
    ===================== */

    localStorage.setItem(
      "token",
      authToken
    );

    localStorage.setItem(
      "role",
      userRole
    );

    localStorage.setItem(
      "name",
      userName
    );

    localStorage.setItem(
      "tenantId",
      tenantId
    );

    /*
      Clear the previous public tenant first.
      Then save only the tenant belonging
      to the authenticated account.
    */

    localStorage.removeItem(
      "tenantSlug"
    );

    if(tenantSlug){

      localStorage.setItem(
        "tenantSlug",
        tenantSlug
      );
    }

    if(timezone){

      localStorage.setItem(
        "appTimezone",
        timezone
      );
    }

    /* =====================
       REDIRECT BY ROLE
    ===================== */

    if(
      userRole ===
      "PLATFORM_ADMIN"
    ){

      /*
        Platform Admin is platform-wide,
        never tenant branded.
      */

      localStorage.removeItem(
        "tenantSlug"
      );

      localStorage.removeItem(
        "tenantId"
      );

      window.location.replace(
        "/platform-admin/dashboard.html"
      );

      return;
    }

    if(
      userRole ===
      "SUPER_ADMIN" ||
      userRole ===
      "admin"
    ){

      window.location.replace(
        "/admin/dashboard.html"
      );

      return;
    }

    if(
      userRole ===
      "dispatcher"
    ){

      window.location.replace(
        "/dispatcher/dashboard.html"
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