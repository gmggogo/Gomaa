// =========================
// FILE: public/index.js
// =========================

let currentLang = "en";

/* =========================
SETTINGS
========================= */

const settingsRaw =
localStorage.getItem(
    "ghSystemDesign"
);

let settings = {};

if(settingsRaw){

    try{

        settings =
        JSON.parse(settingsRaw);

    }catch(err){

        settings = {};

    }

}

/* =========================
SERVICES
========================= */

const services = [

{
    active:true,

    image:"assets/nemt.jpeg",

    title_en:"NEMT",
    title_es:"NEMT",

    description_en:
    "Medical appointments & clinics",

    description_es:
    "Citas médicas y clínicas",

    link:"getquote/index.html"
},

{
    active:true,

    image:"assets/airport.jpeg",

    title_en:"Airport",
    title_es:"Aeropuerto",

    description_en:
    "Airport pickup & drop-off",

    description_es:
    "Traslados al aeropuerto",

    link:"getquote/index.html"
},

{
    active:true,

    image:"assets/business.jpeg",

    title_en:"Business",
    title_es:"Negocios",

    description_en:
    "Corporate & private rides",

    description_es:
    "Viajes corporativos y privados",

    link:"getquote/index.html"
},

{
    active:true,

    image:"assets/business.jpeg",

    title_en:"Taxi",
    title_es:"Taxi",

    description_en:
    "Daily city transportation",

    description_es:
    "Transporte diario en la ciudad",

    link:"getquote/index.html"
},

{
    active:true,

    image:"assets/business.jpeg",

    title_en:"Limo",
    title_es:"Limusina",

    description_en:
    "Luxury transportation service",

    description_es:
    "Servicio de lujo",

    link:"getquote/index.html"
},

{
    active:true,

    image:"assets/business.jpeg",

    title_en:"XL",
    title_es:"XL",

    description_en:
    "Large family transportation",

    description_es:
    "Transporte familiar",

    link:"getquote/index.html"
},

{
    active:true,

    image:"assets/nemt.jpeg",

    title_en:"Wheelchair",
    title_es:"Silla de ruedas",

    description_en:
    "Wheelchair accessible rides",

    description_es:
    "Viajes accesibles",

    link:"getquote/index.html"
},

{
    active:true,

    image:"assets/airport.jpeg",

    title_en:"Shared Ride",
    title_es:"Viaje compartido",

    description_en:
    "Affordable shared rides",

    description_es:
    "Viajes compartidos económicos",

    link:"getquote/index.html"
}

];

/* =========================
HELPER
========================= */

function getText(en,es){

    if(currentLang === "es"){
        return es || en || "";
    }

    return en || es || "";

}

/* =========================
TRANSLATE STATIC
========================= */

function translateStatic(){

    document
    .querySelectorAll("[data-en]")
    .forEach(el=>{

        const en =
        el.getAttribute("data-en");

        const es =
        el.getAttribute("data-es");

        el.innerText =
        getText(en,es);

    });

}

/* =========================
SERVICES RENDER
========================= */

function renderServices(){

    const container =
    document.getElementById(
        "servicesContainer"
    );

    if(!container) return;

    container.innerHTML = "";

    services.forEach(service=>{

        if(!service.active) return;

        const title =
        getText(
            service.title_en,
            service.title_es
        );

        const description =
        getText(
            service.description_en,
            service.description_es
        );

        const buttonText =
        currentLang === "es"
        ? "Obtener precio"
        : "Get Quote";

        container.innerHTML += `

        <div class="card">

            <img src="${service.image}">

            <div class="card-content">

                <h3>
                    ${title}
                </h3>

                <p>
                    ${description}
                </p>

                <a href="${service.link}"
                class="btn">

                    ${buttonText}

                </a>

            </div>

        </div>

        `;

    });

}

/* =========================
LANGUAGE
========================= */

window.setLang = function(lang){

    currentLang = lang;

    translateStatic();

    renderServices();

};

/* =========================
INIT
========================= */

translateStatic();

renderServices();