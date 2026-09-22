/* ==========================================================================
   GH Mobility - Shared Tenant Console Helper
   File:
   D:\Sunbeamllc\server\public\shared\gh-console.js

   Usage from browser DevTools console:
     ghdelete("sunbeam")

   Purpose:
   - Clears previously saved tenant/company tenant values.
   - Saves the requested tenant slug.
   - Preserves authentication/security rules; this does NOT bypass login.
   - Reloads the current page using the selected tenant.
   ========================================================================== */

(function () {
  "use strict";

  const TENANT_KEYS = [
    "tenantSlug",
    "companyTenantSlug",
    "tenant",
    "selectedTenantSlug",
    "currentTenantSlug",
    "ghTenantSlug"
  ];

  function cleanSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function clearTenantStorage() {
    for (const key of TENANT_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch (_) {}

      try {
        sessionStorage.removeItem(key);
      } catch (_) {}
    }
  }

  function saveTenantSlug(slug) {
    /*
      Save both keys used by GH Mobility flows so Admin/Company login pages
      resolve the same tenant after reload.
    */
    try {
      localStorage.setItem("tenantSlug", slug);
      localStorage.setItem("companyTenantSlug", slug);
    } catch (_) {}

    try {
      sessionStorage.setItem("tenantSlug", slug);
      sessionStorage.setItem("companyTenantSlug", slug);
    } catch (_) {}
  }

  function reloadWithTenant(slug) {
    const url = new URL(window.location.href);

    /*
      If this page already uses a tenant query parameter, keep it synchronized.
      Otherwise storage alone is enough and the current URL stays clean.
    */
    if (url.searchParams.has("tenant")) {
      url.searchParams.set("tenant", slug);
      window.location.replace(url.toString());
      return;
    }

    window.location.reload();
  }

  Object.defineProperty(window, "ghdelete", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function ghdelete(companyName) {
      const slug = cleanSlug(companyName);

      if (!slug) {
        console.warn(
          'GH Mobility: enter a company tenant, for example ghdelete("sunbeam")'
        );
        return false;
      }

      clearTenantStorage();
      saveTenantSlug(slug);

      console.log("GH Mobility tenant selected:", slug);

      reloadWithTenant(slug);
      return true;
    }
  });
})();
