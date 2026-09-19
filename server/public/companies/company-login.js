document.addEventListener("DOMContentLoaded",function(){

  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("errorMessage");
  const companyNameEl = document.getElementById("transportCompanyName");
  const tenantHint = document.getElementById("tenantHint");

  if(!form){
    console.error("loginForm not found");
    return;
  }

  function cleanTenantSlug(v){
    return String(v || "").trim().toLowerCase();
  }

  function clearFacilitySession(){
    [
      "companyToken",
      "companyRole",
      "companyName",
      "companyTenantId",
      "companyTenantSlug",
      "companyUserId",
      "companyFacilityId",
      "facilityTenantSlug"
    ].forEach(key=>{
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    });
  }

  /*
    SAME TEST METHOD:
    ghdelete("sunbeam")
    ghdelete("ram")
    ghdelete("sony")

    The slug always represents the PARENT TRANSPORTATION COMPANY.
    It does NOT represent the clinic/hotel/hospital/facility itself.
  */
  window.ghdelete = function(slug){

    const tenantSlug = cleanTenantSlug(slug);

    if(!tenantSlug){
      clearFacilitySession();

      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("tenant");
      cleanUrl.searchParams.delete("tenantSlug");

      window.location.replace(
        cleanUrl.pathname + cleanUrl.search
      );

      return;
    }

    clearFacilitySession();

    sessionStorage.setItem("facilityTenantSlug",tenantSlug);
    localStorage.setItem("facilityTenantSlug",tenantSlug);

    sessionStorage.setItem("companyTenantSlug",tenantSlug);
    localStorage.setItem("companyTenantSlug",tenantSlug);

    const url = new URL(window.location.href);

    url.searchParams.set("tenant",tenantSlug);
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

    if(!fromUrl){
      const savedTenant = cleanTenantSlug(
        sessionStorage.getItem("companyTenantSlug") ||
        localStorage.getItem("companyTenantSlug") ||
        sessionStorage.getItem("facilityTenantSlug") ||
        localStorage.getItem("facilityTenantSlug")
      );

      return savedTenant;
    }

    sessionStorage.setItem(
      "facilityTenantSlug",
      fromUrl
    );

    localStorage.setItem(
      "facilityTenantSlug",
      fromUrl
    );

    /*
      Compatibility with existing company pages.
      The tenant is still the transportation company tenant.
    */
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

  const tenantSlug = resolveTenantSlug();

  function prettyCompanyName(slug){
    if(!slug) return "Select Company";

    return slug
      .split(/[-_]+/)
      .filter(Boolean)
      .map(part=>part.charAt(0).toUpperCase()+part.slice(1))
      .join(" ");
  }

  async function loadParentCompanyBranding(){

    if(!tenantSlug){
      companyNameEl.textContent = "Select Company";
      tenantHint.textContent =
        'Testing: ghdelete("sunbeam")';
      return;
    }

    companyNameEl.textContent =
      prettyCompanyName(tenantSlug);

    tenantHint.textContent =
      "Facilities under " +
      prettyCompanyName(tenantSlug);

    /*
      If the existing Branding service supports the tenant
      from the URL, let it load the transportation company name.
      We do not depend on this to allow login.
    */
    try{
      if(window.Branding?.load){

        await window.Branding.load();

        const brandName =
          window.Branding?.data?.companyName ||
          window.Branding?.data?.name ||
          window.Branding?.data?.businessName ||
          "";

        if(brandName){
          companyNameEl.textContent =
            String(brandName);
        }
      }
    }catch(err){
      console.log("Facility branding:",err);
    }
  }

  function updateClock(){

    const el =
      document.getElementById("datetime");

    if(!el) return;

    const timezone =
      window.Branding?.data?.timezone ||
      "America/Phoenix";

    const now = new Date();

    const date =
      now.toLocaleDateString(
        "en-US",
        {
          timeZone:timezone,
          weekday:"short",
          month:"short",
          day:"numeric",
          year:"numeric"
        }
      );

    const time =
      now.toLocaleTimeString(
        "en-US",
        {
          timeZone:timezone,
          hour:"numeric",
          minute:"2-digit",
          second:"2-digit",
          hour12:true
        }
      );

    el.innerHTML =
      `<div>${date}</div>
       <div style="font-size:16px;color:#1286d1;">${time}</div>`;
  }

  loadParentCompanyBranding()
    .finally(()=>{
      updateClock();
      setInterval(updateClock,1000);
    });

  form.addEventListener("submit",async function(e){

    e.preventDefault();

    const username =
      document
        .getElementById("username")
        .value
        .trim();

    const password =
      document
        .getElementById("password")
        .value
        .trim();

    errorBox.innerText = "";

    if(!username || !password){
      errorBox.innerText =
        "Please enter username and password.";
      return;
    }

    if(!tenantSlug){
      errorBox.innerText =
        'Transportation company required. Use ghdelete("company-slug") for testing.';
      return;
    }

    const button =
      form.querySelector('button[type="submit"]');

    if(button){
      button.disabled = true;
      button.textContent = "Signing in...";
    }

    try{

      const response =
        await fetch(
          "/api/auth/login",
          {
            method:"POST",
            headers:{
              "Content-Type":"application/json"
            },
            body:JSON.stringify({
              username,
              password,
              tenantSlug
            })
          }
        );

      const data =
        await response
          .json()
          .catch(()=>({}));

      if(!response.ok){
        errorBox.innerText =
          data.message ||
          "Invalid credentials.";
        return;
      }

      /*
        Existing facility/customer accounts in the current system
        use the COMPANY role. We keep this behavior so existing
        company pages continue to work unchanged.
      */
      if(
        String(
          data?.user?.role || ""
        ).toLowerCase() !== "company"
      ){
        errorBox.innerText =
          "This account is not a facility account.";
        return;
      }

      if(
        data.user.tenantSlug &&
        cleanTenantSlug(
          data.user.tenantSlug
        ) !== tenantSlug
      ){
        errorBox.innerText =
          "This facility does not belong to this transportation company.";
        return;
      }

      const facilitySession = {
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

      /*
        Keep existing company storage keys because the existing
        dashboard/add-trip/review/payment/summary pages already
        depend on them.
      */
      sessionStorage.setItem(
        "companyToken",
        facilitySession.token
      );

      sessionStorage.setItem(
        "companyRole",
        facilitySession.role
      );

      sessionStorage.setItem(
        "companyName",
        facilitySession.name
      );

      sessionStorage.setItem(
        "companyTenantId",
        facilitySession.tenantId
      );

      sessionStorage.setItem(
        "companyTenantSlug",
        facilitySession.tenantSlug
      );

      sessionStorage.setItem(
        "companyUserId",
        facilitySession.userId
      );

      sessionStorage.setItem(
        "companyFacilityId",
        facilitySession.facilityId
      );

      sessionStorage.setItem(
        "facilityTenantSlug",
        facilitySession.tenantSlug
      );

      localStorage.setItem(
        "companyToken",
        facilitySession.token
      );

      localStorage.setItem(
        "companyRole",
        facilitySession.role
      );

      localStorage.setItem(
        "companyName",
        facilitySession.name
      );

      localStorage.setItem(
        "companyTenantId",
        facilitySession.tenantId
      );

      localStorage.setItem(
        "companyTenantSlug",
        facilitySession.tenantSlug
      );

      localStorage.setItem(
        "companyUserId",
        facilitySession.userId
      );

      localStorage.setItem(
        "companyFacilityId",
        facilitySession.facilityId
      );

      localStorage.setItem(
        "facilityTenantSlug",
        facilitySession.tenantSlug
      );

      window.location.replace(
        "/companies/dashboard.html"
      );

    }catch(err){

      console.error(
        "Facility login error:",
        err
      );

      errorBox.innerText =
        "Server error. Please try again.";

    }finally{

      if(button){
        button.disabled = false;
        button.textContent = "Login";
      }
    }

  });

});
