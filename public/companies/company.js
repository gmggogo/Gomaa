function getCompanyToken(){
  const own = String(localStorage.getItem("companyToken") || "").trim();
  if(own) return own;
  if(String(localStorage.getItem("role") || "").toLowerCase() === "company"){
    return String(localStorage.getItem("token") || "").trim();
  }
  return "";
}
function getCompanyRole(){
  const own = String(localStorage.getItem("companyRole") || "").trim();
  if(own) return own;
  const legacy = String(localStorage.getItem("role") || "").trim();
  return legacy.toLowerCase() === "company" ? legacy : "";
}
function getCompanyName(){
  const own = String(localStorage.getItem("companyName") || "").trim();
  if(own) return own;
  if(String(localStorage.getItem("role") || "").toLowerCase() === "company"){
    return String(localStorage.getItem("name") || "").trim();
  }
  return "";
}
function getCompanyTenantSlug(){
  return String(
    localStorage.getItem("companyTenantSlug") ||
    sessionStorage.getItem("companyTenantSlug") ||
    ""
  ).trim().toLowerCase();
}
function companyLoginUrl(){
  const slug = getCompanyTenantSlug();
  return slug
    ? `/companies/company-login.html?tenant=${encodeURIComponent(slug)}`
    : "/companies/company-login.html";
}
function companyStorageKey(baseKey){
  const scope =
    getCompanyTenantSlug() ||
    String(localStorage.getItem("companyTenantId") || "").trim() ||
    "company";
  return `${baseKey}:${scope}`;
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("Company JS Loaded");

  // ===== Greeting + Clock (لو مش موجودين في layout.js) =====
  const greetingEl = document.getElementById("greeting");
  const clockEl = document.getElementById("clock");

  if (greetingEl && clockEl) {
    updateDateTime();
    setInterval(updateDateTime, 1000);
  }

  function updateDateTime() {
    const now = new Date();
    const h = now.getHours();

    let greeting = "Welcome";
    if (h < 12) greeting = "Good Morning";
    else if (h < 18) greeting = "Good Afternoon";
    else greeting = "Good Evening";

    greetingEl.innerText = `${greeting} from ${getCompanyName() || "GH Mobility"}`;
    clockEl.innerText = now.toLocaleDateString() + " | " + now.toLocaleTimeString();
  }

  // ===== Add Trip Logic (يشتغل بس لو الصفحة فيها فورم) =====
  const entryName = document.getElementById("entryName");
  const facilityPhone = document.getElementById("facilityPhone");
  const saveBtn = document.getElementById("saveEntry");
  const editBtn = document.getElementById("editEntry");

  if (entryName && facilityPhone && saveBtn && editBtn) {
    const saved = JSON.parse(localStorage.getItem(companyStorageKey("entryData")));
    if (saved) {
      entryName.value = saved.name;
      facilityPhone.value = saved.phone;
      lockEntry();
    }

    saveBtn.onclick = () => {
      if (!entryName.value || !facilityPhone.value) {
        alert("Enter name and phone");
        return;
      }

      localStorage.setItem(companyStorageKey("entryData"), JSON.stringify({
        name: entryName.value,
        phone: facilityPhone.value
      }));

      lockEntry();
    };

    editBtn.onclick = unlockEntry;

    function lockEntry() {
      entryName.disabled = true;
      facilityPhone.disabled = true;
      saveBtn.style.display = "none";
      editBtn.style.display = "inline-block";
    }

    function unlockEntry() {
      entryName.disabled = false;
      facilityPhone.disabled = false;
      saveBtn.style.display = "inline-block";
      editBtn.style.display = "none";
    }
  }

});