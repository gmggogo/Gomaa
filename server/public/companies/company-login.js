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
  const params = new URLSearchParams(window.location.search);
  const fromUrl = cleanTenantSlug(
    params.get("tenant") || params.get("tenantSlug")
  );

  if(fromUrl){
    sessionStorage.setItem("companyTenantSlug",fromUrl);
    localStorage.setItem("companyTenantSlug",fromUrl);
    return fromUrl;
  }

  return cleanTenantSlug(
    sessionStorage.getItem("companyTenantSlug") ||
    localStorage.getItem("companyTenantSlug")
  );
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

    localStorage.setItem("companyToken",data.token);
    localStorage.setItem("companyRole","company");
    localStorage.setItem("companyName",data.user.name || "");
    localStorage.setItem("companyTenantId",data.user.tenantId || "");
    localStorage.setItem("companyTenantSlug",data.user.tenantSlug || tenantSlug);
    localStorage.setItem("companyUserId",data.user.id || "");
    localStorage.setItem(
      "companyFacilityId",
      data.user.facilityId || data.user.companyId || data.user.id || ""
    );

    window.location.replace("/companies/dashboard.html");

  }catch(err){
    console.error("Login error:",err);
    errorBox.innerText = "Server error. Please try again.";
  }

});

});