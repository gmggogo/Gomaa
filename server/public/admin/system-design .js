// =========================
// FILE: system-design.js
// PLACE:
// public/admin/system-design.js
// =========================

/* =========================
LOAD SIDEBAR
========================= */

fetch("sidebar.html")
.then(res => res.text())
.then(data => {

    document.getElementById(
        "sidebar-container"
    ).innerHTML = data;

});

/* =========================
LOAD HEADER
========================= */

fetch("header.html")
.then(res => res.text())
.then(data => {

    document.getElementById(
        "header-container"
    ).innerHTML = data;

});

/* =========================
IMAGE PREVIEW
========================= */

const heroInput =
    document.getElementById("heroInput");

const heroPreview =
    document.getElementById("heroPreview");

if(heroInput){

    heroInput.addEventListener(
        "change",
        e => {

            const file =
                e.target.files[0];

            if(!file) return;

            const reader =
                new FileReader();

            reader.onload = function(event){

                heroPreview.src =
                    event.target.result;

            };

            reader.readAsDataURL(file);

        }
    );

}

/* =========================
SAVE BUTTONS
========================= */

document
.querySelectorAll(".save-btn")
.forEach(btn => {

    btn.addEventListener("click", ()=>{

        alert(
            "Settings Saved Successfully"
        );

    });

});

/* =========================
TEMP LOCAL STORAGE
========================= */

function saveTempSettings(){

    const settings = {

        hero:{
            active:
                document.getElementById("heroActive").checked,

            titleEn:
                document.getElementById("heroTitleEn").value,

            titleEs:
                document.getElementById("heroTitleEs").value,

            subEn:
                document.getElementById("heroSubEn").value,

            subEs:
                document.getElementById("heroSubEs").value
        },

        about:{
            active:
                document.getElementById("aboutActive").checked,

            titleEn:
                document.getElementById("aboutTitleEn").value,

            titleEs:
                document.getElementById("aboutTitleEs").value,

            descEn:
                document.getElementById("aboutDescEn").value,

            descEs:
                document.getElementById("aboutDescEs").value
        }

    };

    localStorage.setItem(
        "ghSystemDesign",
        JSON.stringify(settings)
    );

}

/* =========================
AUTO SAVE
========================= */

document
.querySelectorAll("input, textarea")
.forEach(el => {

    el.addEventListener(
        "input",
        saveTempSettings
    );

});

/* =========================
LOAD SAVED
========================= */

function loadSavedSettings(){

    const raw =
        localStorage.getItem(
            "ghSystemDesign"
        );

    if(!raw) return;

    const settings =
        JSON.parse(raw);

    if(settings.hero){

        document.getElementById(
            "heroTitleEn"
        ).value =
            settings.hero.titleEn || "";

        document.getElementById(
            "heroTitleEs"
        ).value =
            settings.hero.titleEs || "";

        document.getElementById(
            "heroSubEn"
        ).value =
            settings.hero.subEn || "";

        document.getElementById(
            "heroSubEs"
        ).value =
            settings.hero.subEs || "";

        document.getElementById(
            "heroActive"
        ).checked =
            settings.hero.active;

    }

    if(settings.about){

        document.getElementById(
            "aboutTitleEn"
        ).value =
            settings.about.titleEn || "";

        document.getElementById(
            "aboutTitleEs"
        ).value =
            settings.about.titleEs || "";

        document.getElementById(
            "aboutDescEn"
        ).value =
            settings.about.descEn || "";

        document.getElementById(
            "aboutDescEs"
        ).value =
            settings.about.descEs || "";

        document.getElementById(
            "aboutActive"
        ).checked =
            settings.about.active;

    }

}

loadSavedSettings();