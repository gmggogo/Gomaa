/* =========================
GH MOBILITY
GLOBAL BRANDING ENGINE
FILE:
public/core/branding.js
========================= */

console.log("BRANDING ENGINE LOADED");

window.Branding = {

  /* =========================
  STORAGE
  ========================= */

  data:{},

  /* =========================
  LOAD
  ========================= */

  async load(){

    try{

      const raw =
      localStorage.getItem(
        "ghSystemDesign"
      );

      if(raw){

        this.data =
        JSON.parse(raw);

      }else{

        this.data = {};

      }

    }catch(err){

      console.log(
        "BRANDING LOAD ERROR",
        err
      );

      this.data = {};

    }

    this.applyGlobalBranding();

    return this.data;

  },

  /* =========================
  SAVE
  ========================= */

  save(data){

    this.data = data || {};

    localStorage.setItem(
      "ghSystemDesign",
      JSON.stringify(this.data)
    );

    this.applyGlobalBranding();

  },

  /* =========================
  COMPANY NAME
  ========================= */

  getCompanyName(){

    return (

      this.data?.branding
      ?.companyName ||

      "Sunbeam Transportation"

    );

  },

  /* =========================
  MAIN LOGO
  ========================= */

  getMainLogo(){

    return (

      this.data?.branding
      ?.mainLogo ||

      "/assets/logo.png"

    );

  },

  /* =========================
  DRIVER LOGO
  ========================= */

  getDriverLogo(){

    return (

      this.data?.branding
      ?.driverLogo ||

      "/assets/logo.png"

    );

  },

  /* =========================
  HERO IMAGE
  ========================= */

  getHeroImage(){

    return (

      this.data?.homepage
      ?.heroImage ||

      "/assets/hero.jpeg"

    );

  },

  /* =========================
  SERVICES
  ========================= */

  getServices(){

    const services =
    this.data?.services;

    if(

      Array.isArray(services) &&
      services.length

    ){

      return services;

    }

    /* =========================
    DEFAULT SERVICES
    ========================= */

    return [

      {
        active:true,

        image:"assets/nemt.jpeg",

        title_en:"NEMT",
        title_es:"NEMT",

        description_en:
        "Medical appointments & clinics",

        description_es:
        "Citas médicas y clínicas"
      },

      {
        active:true,

        image:"assets/airport.jpeg",

        title_en:"Airport",
        title_es:"Aeropuerto",

        description_en:
        "Airport pickup & drop-off",

        description_es:
        "Traslados al aeropuerto"
      },

      {
        active:true,

        image:"assets/business.jpeg",

        title_en:"Business",
        title_es:"Negocios",

        description_en:
        "Corporate & private rides",

        description_es:
        "Viajes corporativos y privados"
      },

      {
        active:true,

        image:"assets/business.jpeg",

        title_en:"Taxi",
        title_es:"Taxi",

        description_en:
        "Daily city transportation",

        description_es:
        "Transporte diario en la ciudad"
      },

      {
        active:true,

        image:"assets/business.jpeg",

        title_en:"Limo",
        title_es:"Limusina",

        description_en:
        "Luxury transportation service",

        description_es:
        "Servicio de lujo"
      },

      {
        active:true,

        image:"assets/business.jpeg",

        title_en:"XL",
        title_es:"XL",

        description_en:
        "Large family transportation",

        description_es:
        "Transporte familiar"
      },

      {
        active:true,

        image:"assets/nemt.jpeg",

        title_en:"Wheelchair",
        title_es:"Silla de ruedas",

        description_en:
        "Wheelchair accessible rides",

        description_es:
        "Viajes accesibles"
      },

      {
        active:true,

        image:"assets/airport.jpeg",

        title_en:"Shared Ride",
        title_es:"Viaje compartido",

        description_en:
        "Affordable shared rides",

        description_es:
        "Viajes compartidos económicos"
      }

    ];

  },

  /* =========================
  HOMEPAGE
  ========================= */

  getHomepage(){

    return (

      this.data?.homepage ||

      {}

    );

  },

  /* =========================
  APPLY GLOBAL
  ========================= */

  applyGlobalBranding(){

    /* TITLE */

    document.title =
    this.getCompanyName();

    /* COMPANY NAME */

    document
    .querySelectorAll(
      ".company-name"
    )
    .forEach(el=>{

      el.innerText =
      this.getCompanyName();

    });

    /* MAIN LOGO */

    document
    .querySelectorAll(
      ".main-logo"
    )
    .forEach(img=>{

      img.src =
      this.getMainLogo();

    });

    /* DRIVER LOGO */

    document
    .querySelectorAll(
      ".driver-logo"
    )
    .forEach(img=>{

      img.src =
      this.getDriverLogo();

    });

    /* HERO IMAGE */

    document
    .querySelectorAll(
      ".hero-image"
    )
    .forEach(img=>{

      img.src =
      this.getHeroImage();

    });

  },

  /* =========================
  HOMEPAGE CARDS
  ========================= */

  renderHomepageCards(
    containerId,
    lang="en"
  ){

    const container =
    document.getElementById(
      containerId
    );

    if(!container){

      console.log(
        "SERVICES CONTAINER NOT FOUND"
      );

      return;

    }

    const services =
    this.getServices();

    container.innerHTML = "";

    services.forEach(service=>{

      if(!service.active) return;

      const title =

      lang === "es"

      ? service.title_es

      : service.title_en;

      const desc =

      lang === "es"

      ? service.description_es

      : service.description_en;

      const buttonText =

      lang === "es"

      ? "Obtener precio"

      : "Get Quote";

      container.innerHTML += `

      <div class="card">

        <img
        src="${service.image}"
        class="card-image">

        <div class="card-body">

          <h3>

            ${title}

          </h3>

          <p>

            ${desc}

          </p>

          <a
          href="getquote/index.html"
          class="card-btn">

            ${buttonText}

          </a>

        </div>

      </div>

      `;

    });

  }

};