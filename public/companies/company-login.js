document.addEventListener("DOMContentLoaded",function(){

const form = document.getElementById("loginForm");
const errorBox = document.getElementById("errorMessage");

if(!form){
  console.error("loginForm not found");
  return;
}

function cleanTenantSlug(v){
  return String(v || "").trim().toLowerCase();
}

/*
  GH FACILITIES TRANSPORTATION COMPANY SWITCHER

  Run once:
  ghdelete("sunbeam")

  The selected transportation company is persisted in localStorage,
  so closing/reopening the Facilities app keeps the same tenant.
*/
window.ghdelete = function(slug){

  const tenant = cleanTenantSlug(slug);

  if(!tenant){
    console.error('Usage: ghdelete("sunbeam")');
    return;
  }

  localStorage.setItem(
    "ghFacilitiesTenantSlug",
    tenant
  );

  sessionStorage.setItem(
    "companyTenantSlug",
    tenant
  );

  localStorage.setItem(
    "companyTenantSlug",
    tenant
  );

  const url = new URL(window.location.href);

  url.searchParams.set("tenant",tenant);
  url.searchParams.delete("tenantSlug");

  window.location.replace(url.toString());
};

function resolveTenantSlug(){

  const params =
    new URLSearchParams(
      window.location.search
    );

  const fromUrl =
    cleanTenantSlug(
      params.get("tenant") ||
      params.get("tenantSlug")
    );

  const savedFacilitiesTenant =
    cleanTenantSlug(
      localStorage.getItem(
        "ghFacilitiesTenantSlug"
      )
    );

  /*
    Explicit URL wins and becomes the persistent
    transportation company for GH Mobility Facilities.
  */
  if(fromUrl){

    localStorage.setItem(
      "ghFacilitiesTenantSlug",
      fromUrl
    );

    sessionStorage.setItem(
      "companyTenantSlug",
      fromUrl
    );

    localStorage.setItem(
      "companyTenantSlug",
      fromUrl
    );

    return fromUrl;
  }

  /*
    On a later app launch the Electron start URL has no ?tenant=.
    Restore the transportation company selected previously.
  */
  if(savedFacilitiesTenant){

    sessionStorage.setItem(
      "companyTenantSlug",
      savedFacilitiesTenant
    );

    localStorage.setItem(
      "companyTenantSlug",
      savedFacilitiesTenant
    );

    return savedFacilitiesTenant;
  }

  return "";
}

const tenantSlug = resolveTenantSlug();

form.addEventListener("submit",async function(e){

  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  errorBox.innerText = "";

  if(!username || !password){
    errorBox.innerText = "Please enter username and password.";
    return;
  }

  if(!tenantSlug){
    errorBox.innerText = "Transportation company selection required.";
    return;
  }

  try{

    const response = await fetch("/api/auth/login",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        username,
        password,
        tenantSlug
      })
    });

    const data =
      await response.json().catch(()=>({}));

    if(!response.ok){
      errorBox.innerText =
        data.message ||
        "Invalid credentials.";
      return;
    }

    if(
      String(
        data?.user?.role || ""
      ).toLowerCase() !== "company"
    ){
      errorBox.innerText =
        "This account is not a company account.";
      return;
    }

    if(
      data.user.tenantSlug &&
      cleanTenantSlug(
        data.user.tenantSlug
      ) !== tenantSlug
    ){
      errorBox.innerText =
        "This account does not belong to this transportation company.";
      return;
    }

    const companySession = {
      token:data.token || "",
      role:"company",
      name:data.user.name || "",
      tenantId:data.user.tenantId || "",
      tenantSlug:
        data.user.tenantSlug ||
        tenantSlug,
      userId:data.user.id || "",
      facilityId:
        data.user.facilityId ||
        data.user.companyId ||
        data.user.id ||
        ""
    };

    sessionStorage.setItem(
      "companyToken",
      companySession.token
    );

    sessionStorage.setItem(
      "companyRole",
      companySession.role
    );

    sessionStorage.setItem(
      "companyName",
      companySession.name
    );

    sessionStorage.setItem(
      "companyTenantId",
      companySession.tenantId
    );

    sessionStorage.setItem(
      "companyTenantSlug",
      companySession.tenantSlug
    );

    sessionStorage.setItem(
      "companyUserId",
      companySession.userId
    );

    sessionStorage.setItem(
      "companyFacilityId",
      companySession.facilityId
    );

    localStorage.setItem(
      "companyToken",
      companySession.token
    );

    localStorage.setItem(
      "companyRole",
      companySession.role
    );

    localStorage.setItem(
      "companyName",
      companySession.name
    );

    localStorage.setItem(
      "companyTenantId",
      companySession.tenantId
    );

    localStorage.setItem(
      "companyTenantSlug",
      companySession.tenantSlug
    );

    localStorage.setItem(
      "companyUserId",
      companySession.userId
    );

    localStorage.setItem(
      "companyFacilityId",
      companySession.facilityId
    );

    /*
      Keep the selected transportation company persistent
      independently from the logged-in organization session.
    */
    localStorage.setItem(
      "ghFacilitiesTenantSlug",
      companySession.tenantSlug
    );

    window.location.replace(
      "/companies/dashboard.html"
    );

  }catch(err){

    console.error(
      "Login error:",
      err
    );

    errorBox.innerText =
      "Server error. Please try again.";

  }

});

});
