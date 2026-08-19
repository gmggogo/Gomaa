/* =====================================================
   DRIVER LOGIN - TENANT SAFE
===================================================== */

document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("error");

  if(!form){
    console.error("loginForm not found");
    return;
  }

  /* =====================================================
     TENANT FROM COMPANY LOGIN LINK
     Example:
     /driver/login.html?tenant=sony
     /driver/login.html?tenant=cover-all
  ===================================================== */

  const params = new URLSearchParams(window.location.search);

  const tenant = String(
    params.get("tenant") || ""
  ).trim();

  if(!tenant){

    errorBox.innerText =
      "Company login link required";

    form.querySelector('button[type="submit"]').disabled = true;

    return;
  }

  /* Keep tenant available to the rest of Driver App */
  localStorage.setItem("tenant", tenant);
  localStorage.setItem("tenantSlug", tenant);

  /* =====================================================
     SUBMIT
  ===================================================== */

  form.addEventListener("submit", async (e) => {

    e.preventDefault();

    errorBox.innerText = "";

    const username =
      document.getElementById("username").value.trim();

    const password =
      document.getElementById("password").value.trim();

    if(!username || !password){

      errorBox.innerText =
        "Enter username and password";

      return;
    }

    try{

      /* =================================================
         LOGIN REQUEST
         IMPORTANT:
         tenant is sent to server with username/password.
         The server must validate the driver INSIDE this tenant.
      ================================================= */

      const res = await fetch(
        "/api/auth/login",
        {
          method:"POST",

          headers:{
            "Content-Type":"application/json"
          },

          body:JSON.stringify({
            username,
            password,
            tenant,
            tenantSlug:tenant
          })
        }
      );

      let data = {};

      try{
        data = await res.json();
      }
      catch(_){}

      if(!res.ok){

        errorBox.innerText =
          data.message ||
          "Invalid credentials for this company";

        return;
      }

      if(!data.user){

        errorBox.innerText =
          "User data missing";

        return;
      }

      if(data.user.role !== "driver"){

        errorBox.innerText =
          "This account is not a driver";

        return;
      }

      /* =================================================
         TENANT SAFETY CHECK
         If server returns tenant/company slug, it MUST
         match the company link used by the driver.
      ================================================= */

      const returnedTenant = String(
        data.user.tenantSlug ||
        data.user.tenant ||
        data.user.companySlug ||
        ""
      ).trim();

      if(
        returnedTenant &&
        returnedTenant.toLowerCase() !== tenant.toLowerCase()
      ){

        errorBox.innerText =
          "Invalid credentials for this company";

        return;
      }

      /* =================================================
         SAVE DRIVER SESSION
      ================================================= */

      localStorage.setItem(
        "loggedDriver",
        JSON.stringify({
          token:data.token,
          id:data.user.id,
          name:data.user.name,
          username:data.user.username,
          role:data.user.role,
          company:data.user.company || "",
          tenant:returnedTenant || tenant,
          tenantSlug:returnedTenant || tenant,
          driverId:data.user.driverId || "",
          loginAt:Date.now()
        })
      );

      localStorage.setItem("token", data.token);
      localStorage.setItem("role", "driver");
      localStorage.setItem("driverName", data.user.name || "");
      localStorage.setItem("name", data.user.name || "");
      localStorage.setItem("companyName", data.user.company || "");

      localStorage.setItem(
        "tenant",
        returnedTenant || tenant
      );

      localStorage.setItem(
        "tenantSlug",
        returnedTenant || tenant
      );

      if(data.user.driverId){
        localStorage.setItem(
          "driverId",
          data.user.driverId
        );
      }

      if(data.user.company){
        localStorage.setItem(
          "company",
          data.user.company
        );
      }

      /* Timezone comes from tenant branding */
      localStorage.removeItem("systemTimezone");
      localStorage.removeItem("appTimezone");

      /* Preserve tenant in the first redirect too */
      window.location.href =
        "/driver/dashboard.html?tenant=" +
        encodeURIComponent(returnedTenant || tenant);

    }
    catch(err){

      console.error(err);

      errorBox.innerText =
        "Server error";
    }

  });

});