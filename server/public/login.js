/* =====================
   GH MOBILITY STAFF LOGIN
   GENERAL / MULTI-TENANT
===================== */

const GH_DEFAULT_LOGO = "/assets/gh-mobility.png";
const GH_DEFAULT_COMPANY_NAME = "GH Mobility";

const GH_TENANT_SLUG_KEY = "tenantSlug";
const GH_COMPANY_NAME_KEY = "loginCompanyName";
const GH_COMPANY_LOGO_KEY = "loginCompanyLogo";

function cleanText(value){
  return String(value ?? "").trim();
}

function getSavedTenantSlug(){
  return cleanText(
    localStorage.getItem(
      GH_TENANT_SLUG_KEY
    )
  );
}

function normalizeLogoUrl(value){

  const logo = cleanText(value);

  if(!logo){
    return GH_DEFAULT_LOGO;
  }

  /*
    System Design may return either:
    - an absolute URL
    - a root-relative path such as /uploads/...
    - a relative path such as uploads/...
  */
  if(
    /^https?:\/\//i.test(logo) ||
    logo.startsWith("data:") ||
    logo.startsWith("blob:") ||
    logo.startsWith("/")
  ){
    return logo;
  }

  return `/${logo.replace(/^\/+/, "")}`;
}

function applyLoginBranding({
  companyName = "",
  logoUrl = ""
} = {}){

  const logo =
    document.getElementById(
      "ghMobilityLogo"
    );

  const company =
    document.getElementById(
      "companyName"
    );

  const safeName =
    cleanText(companyName) ||
    GH_DEFAULT_COMPANY_NAME;

  const safeLogo =
    normalizeLogoUrl(logoUrl);

  if(company){
    company.textContent = safeName;
  }

  if(logo){

    logo.onerror = () => {
      logo.onerror = null;
      logo.src = GH_DEFAULT_LOGO;
    };

    logo.src = safeLogo;
    logo.alt = `${safeName} Logo`;
  }
}

function applyCachedTenantBranding(){

  const tenantSlug =
    getSavedTenantSlug();

  if(!tenantSlug){
    applyLoginBranding();
    return;
  }

  applyLoginBranding({
    companyName:
      localStorage.getItem(
        GH_COMPANY_NAME_KEY
      ) || "",
    logoUrl:
      localStorage.getItem(
        GH_COMPANY_LOGO_KEY
      ) || ""
  });
}

function saveTenantBranding({
  tenantSlug = "",
  companyName = "",
  logoUrl = ""
} = {}){

  const cleanSlug =
    cleanText(tenantSlug)
      .toLowerCase();

  const cleanCompanyName =
    cleanText(companyName);

  const cleanLogoUrl =
    cleanText(logoUrl);

  if(cleanSlug){
    localStorage.setItem(
      GH_TENANT_SLUG_KEY,
      cleanSlug
    );
  }

  if(cleanCompanyName){
    localStorage.setItem(
      GH_COMPANY_NAME_KEY,
      cleanCompanyName
    );
  }

  if(cleanLogoUrl){
    localStorage.setItem(
      GH_COMPANY_LOGO_KEY,
      cleanLogoUrl
    );
  }
}

async function loadTenantBranding(
  tenantSlug,
  {
    apply = true
  } = {}
){

  const slug =
    cleanText(tenantSlug)
      .toLowerCase();

  if(!slug){
    return null;
  }

  try{

    const res =
      await fetch(
        `/api/public/tenant/${encodeURIComponent(slug)}`,
        {
          method:"GET",
          headers:{
            "Accept":"application/json"
          },
          cache:"no-store"
        }
      );

    let data = {};

    try{
      data = await res.json();
    }catch(parseError){
      data = {};
    }

    if(
      !res.ok ||
      data.success === false
    ){
      throw new Error(
        data.message ||
        "Failed to load company branding"
      );
    }

    const companyName =
      cleanText(
        data?.design?.companyName
      ) ||
      cleanText(
        data?.tenant?.name
      ) ||
      GH_DEFAULT_COMPANY_NAME;

    const logoUrl =
      cleanText(
        data?.design?.mainLogo
      );

    saveTenantBranding({
      tenantSlug:slug,
      companyName,
      logoUrl
    });

    if(apply){
      applyLoginBranding({
        companyName,
        logoUrl
      });
    }

    return {
      tenantSlug:slug,
      companyName,
      logoUrl
    };

  }catch(err){

    console.error(
      "TENANT BRANDING ERROR:",
      err
    );

    /*
      Keep the last cached branding on screen.
      Login can still continue and the branding
      will refresh after a successful login.
    */
    return null;
  }
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

  msg.innerText =
    "Signing in...";

  try{

    /*
      First login:
      no tenantSlug is stored, so the backend
      authenticates the account normally and
      returns the user's tenant.

      Later logins:
      the remembered tenantSlug is sent so the
      desktop/browser login remains bound to the
      same company.
    */
    const rememberedTenantSlug =
      getSavedTenantSlug();

    const loginPayload = {
      username,
      password
    };

    if(rememberedTenantSlug){
      loginPayload.tenantSlug =
        rememberedTenantSlug;
    }

    const res =
      await fetch(
        "/api/auth/login",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:JSON.stringify(
            loginPayload
          )
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

    /*
      Current auth response returns tenant slug as:
      data.tenant.slug

      Keep fallbacks for older/newer response shapes.
    */
    const resolvedTenantId =
      cleanText(
        data.user.tenantId ||
        data.tenantId ||
        data?.tenant?.id ||
        ""
      );

    const resolvedTenantSlug =
      cleanText(
        data.user.tenantSlug ||
        data?.tenant?.slug ||
        data.tenantSlug ||
        ""
      ).toLowerCase();

    const staffSession = {
      token:data.token || "",
      role:data.user.role || "",
      name:data.user.name || "",
      tenantId:resolvedTenantId,
      tenantSlug:resolvedTenantSlug
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
      PLATFORM_ADMIN is global and is not bound
      to a company login identity.
    */
    if(
      data.user.role ===
      "PLATFORM_ADMIN"
    ){

      window.location.replace(
        "/platform-admin/dashboard.html"
      );

      return;
    }

    /*
      Persist the company identity only after a
      successful tenant staff login. This is what
      makes the SECOND app launch show that company's
      logo/name automatically.
    */
    if(staffSession.tenantSlug){

      sessionStorage.setItem(
        "loginTenantSlug",
        staffSession.tenantSlug
      );

      localStorage.setItem(
        GH_TENANT_SLUG_KEY,
        staffSession.tenantSlug
      );

      /*
        Save the tenant name immediately so there is
        already a useful cached label, then refresh
        the official System Design logo/name.
      */
      const loginCompanyName =
        cleanText(
          data?.tenant?.name
        );

      if(loginCompanyName){
        localStorage.setItem(
          GH_COMPANY_NAME_KEY,
          loginCompanyName
        );
      }

      await loadTenantBranding(
        staffSession.tenantSlug,
        {
          apply:false
        }
      );
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

    /*
      Show cached branding immediately, then refresh
      it from the server when a tenant is remembered.
    */
    applyCachedTenantBranding();

    const savedTenantSlug =
      getSavedTenantSlug();

    if(savedTenantSlug){
      loadTenantBranding(
        savedTenantSlug
      );
    }

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
