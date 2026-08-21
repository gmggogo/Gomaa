/* =====================
   STAFF LOGIN
   TENANT AWARE
===================== */

function cleanTenantSlug(value){

  return String(value || "")
    .trim()
    .toLowerCase();

}

function tenantSlugFromPage(){

  /* 1) Explicit query: /admin/login.html?tenant=sony */
  const params =
    new URLSearchParams(
      window.location.search
    );

  const querySlug =
    cleanTenantSlug(
      params.get("tenant") ||
      params.get("tenantSlug")
    );

  if(querySlug){
    sessionStorage.setItem(
      "loginTenantSlug",
      querySlug
    );
    return querySlug;
  }

  /* 2) Referrer: user clicked Staff Login from /sony or /cover-all */
  try{

    if(document.referrer){

      const ref =
        new URL(
          document.referrer
        );

      if(
        ref.origin ===
        window.location.origin
      ){

        const firstPart =
          cleanTenantSlug(
            ref.pathname
              .split("/")
              .filter(Boolean)[0]
          );

        const reserved =
          new Set([
            "admin",
            "dispatcher",
            "driver",
            "company",
            "platform-admin",
            "booking",
            "api",
            "core",
            "assets",
            "uploads"
          ]);

        if(
          firstPart &&
          !reserved.has(firstPart) &&
          !firstPart.includes(".")
        ){
          sessionStorage.setItem(
            "loginTenantSlug",
            firstPart
          );
          return firstPart;
        }
      }
    }

  }catch(err){
    console.log(
      "TENANT REFERRER ERROR:",
      err
    );
  }

  /* 3) Same-tab fallback */
  return cleanTenantSlug(
    sessionStorage.getItem(
      "loginTenantSlug"
    )
  );

}

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

  const tenantSlug =
    tenantSlugFromPage();

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
            password,
            tenantSlug
          })
        }
      );

    const data =
      await res.json();

    if(!res.ok){

      msg.innerText =
        data.message ||
        "Login failed";

      return;
    }

    localStorage.setItem(
      "token",
      data.token
    );

    localStorage.setItem(
      "role",
      data.user.role
    );

    localStorage.setItem(
      "name",
      data.user.name
    );

    localStorage.setItem(
      "tenantId",
      data.user.tenantId || ""
    );

    localStorage.setItem(
      "tenantSlug",
      data.user.tenantSlug || ""
    );

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