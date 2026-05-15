// =========================
// FILE: public/index.js
// =========================

/* =========================
LOAD SETTINGS
========================= */

const settingsRaw =
    localStorage.getItem("ghSystemDesign");

let settings = {};

if(settingsRaw){

    settings =
        JSON.parse(settingsRaw);

}

/* =========================
HELPER
========================= */

function setText(id, value){

    const el =
        document.getElementById(id);

    if(el){
        el.innerText = value || "";
    }

}

function setImage(id, value){

    const el =
        document.getElementById(id);

    if(el && value){
        el.src = value;
    }

}

function toggleSection(id, active){

    const el =
        document.getElementById(id);

    if(!el) return;

    el.style.display =
        active ? "" : "none";

}

/* =========================
HERO
========================= */

if(settings.hero){

    toggleSection(
        "heroSection",
        settings.hero.active
    );

    setText(
        "heroTitle",
        settings.hero.titleEn
    );

    setText(
        "heroSubtitle",
        settings.hero.subEn
    );

}

/* =========================
ABOUT
========================= */

if(settings.about){

    toggleSection(
        "aboutSection",
        settings.about.active
    );

    setText(
        "aboutTitle",
        settings.about.titleEn
    );

    setText(
        "aboutDescription",
        settings.about.descEn
    );

}

/* =========================
LANGUAGE
========================= */

window.currentLang = "en";

window.setLang = function(lang){

    currentLang = lang;

    /* HERO */

    if(settings.hero){

        setText(
            "heroTitle",
            lang === "es"
                ? settings.hero.titleEs
                : settings.hero.titleEn
        );

        setText(
            "heroSubtitle",
            lang === "es"
                ? settings.hero.subEs
                : settings.hero.subEn
        );

    }

    /* ABOUT */

    if(settings.about){

        setText(
            "aboutTitle",
            lang === "es"
                ? settings.about.titleEs
                : settings.about.titleEn
        );

        setText(
            "aboutDescription",
            lang === "es"
                ? settings.about.descEs
                : settings.about.descEn
        );

    }

};

/* =========================
INIT
========================= */

setLang("en");