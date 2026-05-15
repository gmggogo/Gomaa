// =========================
// FILE: public/index.js
// =========================

const settingsRaw = localStorage.getItem("ghSystemDesign");

let settings = {};

if (settingsRaw) {
    try {
        settings = JSON.parse(settingsRaw);
    } catch (err) {
        settings = {};
    }
}

let currentLang = "en";

/* =========================
HELPERS
========================= */

function getText(en, es) {
    return currentLang === "es" ? (es || en || "") : (en || es || "");
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value || "";
}

function setImage(id, value) {
    const el = document.getElementById(id);
    if (el && value) el.src = value;
}

function toggleSection(id, active) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = active === false ? "none" : "";
}

/* =========================
DEFAULT SERVICES
========================= */

const defaultServices = [
    {
        key: "nemt",
        active: true,
        title_en: "NEMT",
        title_es: "NEMT",
        description_en: "Medical appointments & clinics",
        description_es: "Citas médicas y clínicas",
        image: "assets/nemt.jpeg",
        link: "getquote/index.html"
    },
    {
        key: "airport",
        active: true,
        title_en: "Airport",
        title_es: "Aeropuerto",
        description_en: "Airport pickup & drop-off",
        description_es: "Traslados al aeropuerto",
        image: "assets/airport.jpeg",
        link: "getquote/index.html"
    },
    {
        key: "business",
        active: true,
        title_en: "Business",
        title_es: "Negocios",
        description_en: "Corporate & private rides",
        description_es: "Viajes corporativos y privados",
        image: "assets/business.jpeg",
        link: "getquote/index.html"
    },
    {
        key: "taxi",
        active: true,
        title_en: "Taxi",
        title_es: "Taxi",
        description_en: "Daily city transportation",
        description_es: "Transporte diario en la ciudad",
        image: "assets/business.jpeg",
        link: "getquote/index.html"
    },
    {
        key: "limo",
        active: true,
        title_en: "Limo",
        title_es: "Limusina",
        description_en: "Luxury transportation service",
        description_es: "Servicio de transporte de lujo",
        image: "assets/business.jpeg",
        link: "getquote/index.html"
    },
    {
        key: "xl",
        active: true,
        title_en: "XL",
        title_es: "XL",
        description_en: "Extra space for groups and luggage",
        description_es: "Más espacio para grupos y equipaje",
        image: "assets/business.jpeg",
        link: "getquote/index.html"
    },
    {
        key: "wheelchair",
        active: true,
        title_en: "Wheelchair",
        title_es: "Silla de ruedas",
        description_en: "Wheelchair accessible transportation",
        description_es: "Transporte accesible para silla de ruedas",
        image: "assets/nemt.jpeg",
        link: "getquote/index.html"
    },
    {
        key: "shared",
        active: true,
        title_en: "Shared Ride",
        title_es: "Viaje compartido",
        description_en: "Affordable shared transportation",
        description_es: "Transporte compartido económico",
        image: "assets/airport.jpeg",
        link: "getquote/index.html"
    }
];

/* =========================
RENDER PAGE
========================= */

function renderPage() {

    /* HERO */
    if (settings.hero) {
        toggleSection("heroSection", settings.hero.active);

        setText(
            "heroTitle",
            getText(settings.hero.titleEn, settings.hero.titleEs) || "GH Mobility"
        );

        setText(
            "heroSubtitle",
            getText(settings.hero.subEn, settings.hero.subEs) || "Professional Transportation Solutions"
        );

        if (settings.hero.image) {
            setImage("heroImage", settings.hero.image);
        }
    }

    /* ABOUT */
    if (settings.about) {
        toggleSection("aboutSection", settings.about.active);

        setText(
            "aboutTitle",
            getText(settings.about.titleEn, settings.about.titleEs) || "About Us"
        );

        setText(
            "aboutDescription",
            getText(settings.about.descEn, settings.about.descEs) || "Professional transportation services."
        );
    }

    /* SERVICES */
    renderServices();

}

/* =========================
SERVICES
========================= */

function renderServices() {

    const container = document.getElementById("servicesContainer");
    if (!container) return;

    container.innerHTML = "";

    const services =
        Array.isArray(settings.services) && settings.services.length
            ? settings.services
            : defaultServices;

    services.forEach(service => {

        if (service.active === false) return;

        const title = getText(
            service.title_en || service.titleEn || service.title,
            service.title_es || service.titleEs || service.title
        );

        const description = getText(
            service.description_en || service.descriptionEn || service.description,
            service.description_es || service.descriptionEs || service.description
        );

        const image = service.image || "assets/business.jpeg";
        const link = service.link || "getquote/index.html";

        const card = document.createElement("div");
        card.className = "card";

        card.innerHTML = `
            <img src="${image}" alt="${title}">

            <div class="card-content">
                <h3>${title}</h3>

                <p>${description}</p>

                <a href="${link}" class="btn">
                    ${currentLang === "es" ? "Obtener precio" : "Get Quote"}
                </a>
            </div>
        `;

        container.appendChild(card);

    });

}

/* =========================
LANGUAGE
========================= */

window.setLang = function(lang) {
    currentLang = lang;
    renderPage();
};

/* =========================
INIT
========================= */

renderPage();