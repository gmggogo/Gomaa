// =========================
// FILE: public/index.js
// HOMEPAGE BOOTSTRAP
// =========================

console.log("HOMEPAGE INDEX LOADED");

/*
  IMPORTANT:
  The current homepage logic is already handled by:
  - public/index.html
  - public/core/branding.js

  This file must not:
  - render service cards
  - read old ghSystemDesign structures
  - overwrite homepage branding
  - overwrite mobile layout
  - register duplicate language handlers
  - register duplicate DOMContentLoaded handlers

  Keeping this file intentionally small prevents the old homepage engine
  from overwriting the current tenant-aware homepage.
*/

(function () {
  "use strict";

  window.GHHomepage = window.GHHomepage || {};

  window.GHHomepage.refresh = function () {
    if (typeof window.renderPage === "function") {
      window.renderPage();
    }
  };
})();
