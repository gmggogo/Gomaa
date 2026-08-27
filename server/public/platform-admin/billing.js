"use strict";

function clean(v){ return String(v ?? "").trim(); }

const token =
  clean(localStorage.getItem("token")) ||
  clean(sessionStorage.getItem("staffToken"));

const role =
  (
    clean(localStorage.getItem("role")) ||
    clean(sessionStorage.getItem("staffRole"))
  )
  .toUpperCase()
  .replace(/[\s-]+/g,"_");

if(!token || role !== "PLATFORM_ADMIN"){
  window.location.replace("/login.html");
}

const cards = document.getElementById("tenantCards");
const searchInput = document.getElementById("searchInput");
const messageBox = document.getElementById("messageBox");
let records = [];
