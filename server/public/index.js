// =========================
// FILE: public/core/branding.js
// CENTRAL BRANDING ENGINE
// =========================

console.log("BRANDING ENGINE LOADED");

window.Branding = {

  data: {},

  /* =========================
  LOAD
  ========================= */

  async load(){

    try{

      const local =
      localStorage.getItem(
        "ghSystemDesign"
      );

      if(local){

        this.data =
        JSON.parse(local);

      }else{

        this.data = {};

      }

    }catch(err){

      console.log(
        "Branding Load Error",
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
  GETTERS
  ========================= */

  getCompanyName(){

    return (
      this.data?.branding
      ?.companyName ||

      "Sunbeam Transportation"
    );

  },

  getTimezone(){

    return (
      this.data?.branding
      ?.timezone ||

      "America/Phoenix"
    );

  },

  getMainLogo(){

    return (
      this.data?.branding
      ?.mainLogo ||

      "/assets/logo.png"
    );

  },

  getDriverLogo(){

    return (
      this.data?.branding
      ?.driverLogo ||

      "/assets/logo.png"
    );

  },

  getHeroImage(){

    return (
      this.data?.homepage
      ?.heroImage ||

      "/assets/hero.jpeg"
    );

  },

  getServices(){

    return (
      this.data?.services ||

      []
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
    .forEach(el=>{

      el.src =
      this.getMainLogo();

    });

    /* DRIVER LOGO */

    document
    .querySelectorAll(
      ".driver-logo"
    )
    .forEach(el=>{

      el.src =
      this.getDriverLogo();

    });

    /* HERO IMAGE */

    document
    .querySelectorAll(
      ".hero-image"
    )
    .forEach(el=>{

      el.src =
      this.getHeroImage();

    });

  },

  /* =========================
  RENDER SERVICES
  ========================= */

  renderHomepageCards(
    containerId,
    lang = "en"
  ){

    const container =
    document.getElementById(
      containerId
    );

    if(!container) return;

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

      container.innerHTML += `

      <div class="card">

        <img
          src="${service.image}"
          class="card-image"
        >

        <div class="card-body">

          <h3>
            ${title || ""}
          </h3>

          <p>
            ${desc || ""}
          </p>

          <a
            href="getquote/index.html"
            class="card-btn"
          >
            ${
              lang === "es"
              ? "Obtener precio"
              : "Get Quote"
            }
          </a>

        </div>

      </div>

      `;

    });

  }

};