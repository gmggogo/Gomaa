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

function resolveTenantSlug(){

  /*
    SECURITY:
    Company login must come from an explicit tenant URL.
    Never fall back to an old tenant saved in storage.
  */

  const params =
    new URLSearchParams(
      window.location.search
    );

  const fromUrl =
    cleanTenantSlug(
      params.get("tenant") ||
      params.get("tenantSlug")
    );

  if(!fromUrl){
    return "";
  }

  /*
    Replace any stale company tenant with
    the tenant explicitly selected by the current link.
  */
  sessionStorage.removeItem(
    "companyTenantSlug"
  );

  sessionStorage.setItem(
    "companyTenantSlug",
    fromUrl
  );

  /* Compatibility mirror only. */
  localStorage.setItem(
    "companyTenantSlug",
    fromUrl
  );

  return fromUrl;
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
    errorBox.innerText = "Company login link required.";
    return;
  }

  try{
    const response = await fetch("/api/auth/login",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username,password,tenantSlug})
    });

    const data = await response.json().catch(()=>({}));

    if(!response.ok){
      errorBox.innerText = data.message || "Invalid credentials.";
      return;
    }

    if(String(data?.user?.role || "").toLowerCase() !== "company"){
      errorBox.innerText = "This account is not a company account.";
      return;
    }

    if(
      data.user.tenantSlug &&
      cleanTenantSlug(data.user.tenantSlug) !== tenantSlug
    ){
      errorBox.innerText = "This account does not belong to this company.";
      return;
    }

    /*
      TAB-SAFE COMPANY SESSION
      sessionStorage is authoritative for this company tab.
    */
    const companySession = {
      token:data.token || "",
      role:"company",
      name:data.user.name || "",
      tenantId:data.user.tenantId || "",
      tenantSlug:data.user.tenantSlug || tenantSlug,
      userId:data.user.id || "",
      facilityId:data.user.facilityId || data.user.companyId || data.user.id || ""
    };

    sessionStorage.setItem("companyToken",companySession.token);
    sessionStorage.setItem("companyRole",companySession.role);
    sessionStorage.setItem("companyName",companySession.name);
    sessionStorage.setItem("companyTenantId",companySession.tenantId);
    sessionStorage.setItem("companyTenantSlug",companySession.tenantSlug);
    sessionStorage.setItem("companyUserId",companySession.userId);
    sessionStorage.setItem("companyFacilityId",companySession.facilityId);

    /*
      Compatibility mirror for existing company page scripts.
      company header will restore this tab's values on focus.
    */
    localStorage.setItem("companyToken",companySession.token);
    localStorage.setItem("companyRole",companySession.role);
    localStorage.setItem("companyName",companySession.name);
    localStorage.setItem("companyTenantId",companySession.tenantId);
    localStorage.setItem("companyTenantSlug",companySession.tenantSlug);
    localStorage.setItem("companyUserId",companySession.userId);
    localStorage.setItem("companyFacilityId",companySession.facilityId);

    window.location.replace("/companies/dashboard.html");

  }catch(err){
    console.error("Login error:",err);
    errorBox.innerText = "Server error. Please try again.";
  }

});

});