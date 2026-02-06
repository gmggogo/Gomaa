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

    greetingEl.innerText = `${greeting} from Sunbeam Transportation`;
    clockEl.innerText = now.toLocaleDateString() + " | " + now.toLocaleTimeString();
  }

  // ===== Add Trip Logic (يشتغل بس لو الصفحة فيها فورم) =====
  const entryName = document.getElementById("entryName");
  const facilityPhone = document.getElementById("facilityPhone");
  const saveBtn = document.getElementById("saveEntry");
  const editBtn = document.getElementById("editEntry");

  if (entryName && facilityPhone && saveBtn && editBtn) {
    const saved = JSON.parse(localStorage.getItem("entryData"));
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

      localStorage.setItem("entryData", JSON.stringify({
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