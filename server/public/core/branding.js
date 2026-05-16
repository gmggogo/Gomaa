// =========================
// FILE: public/core/branding.js
// GH MOBILITY BRANDING ENGINE
// SERVER VERSION
// =========================

console.log(
  "BRANDING ENGINE LOADED"
);

window.Branding = {

  /* =========================
  STORAGE
  ========================= */

  data:{},

  /* =========================
  LOAD FROM SERVER
  ========================= */

  async load(){

    try{

      const res =
      await fetch(
        "/api/system-design"
      );

      const data =
      await res.json();

      this.data =
      data || {};

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
  COMPANY NAME
  ========================= */

  getCompanyName(){

    return (

      this.data?.companyName ||

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

      this.data?.mainLogo ||

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

      this.data?.driverLogo ||

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

      this.data?.heroImage ||

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

    this.data?.services ||

    this.data?.homepage
    ?.services ||

    [];

    if(
      Array.isArray(services)
    ){
      return services;
    }

    return [];

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

    /* =========================
    PAGE TITLE
    ========================= */

    document.title =
    this.getCompanyName();

    /* =========================
    COMPANY NAME
    ========================= */

    document
    .querySelectorAll(
      ".company-name"
    )
    .forEach(el=>{

      el.innerText =
      this.getCompanyName();

    });

    /* =========================
    MAIN LOGO
    ========================= */

    document
    .querySelectorAll(
      ".main-logo"
    )
    .forEach(img=>{

      img.src =
      this.getMainLogo();

    });

    /* =========================
    DRIVER LOGO
    ========================= */

    document
    .querySelectorAll(
      ".driver-logo"
    )
    .forEach(img=>{

      img.src =
      this.getDriverLogo();

    });

    /* =========================
    HERO IMAGE
    ========================= */

    document
    .querySelectorAll(
      ".hero-image"
    )
    .forEach(img=>{

      img.src =
      this.getHeroImage();

    });

    /* =========================
    TEXT CONTENT
    ========================= */

    const setText = (
      id,
      value
    )=>{

      const el =
      document.getElementById(id);

      if(el){

        el.innerText =
        value || "";

      }

    };

    setText(
      "aboutTitle",
      this.data?.aboutTitle
    );

    setText(
      "aboutText",
      this.data?.aboutText
    );

    setText(
      "quoteTitle",
      this.data?.quoteTitle
    );

    setText(
      "quoteText",
      this.data?.quoteText
    );

    setText(
      "extra1Title",
      this.data?.extra1Title
    );

    setText(
      "extra1Text",
      this.data?.extra1Text
    );

    setText(
      "extra2Title",
      this.data?.extra2Title
    );

    setText(
      "extra2Text",
      this.data?.extra2Text
    );

    setText(
      "contactTitle",
      this.data?.contactTitle
    );

    setText(
      "footerText",
      this.data?.footerText
    );

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

    /* =========================
    ACTIVE SERVICES
    ========================= */

    const activeServices =
    services.filter(
      s => s.active
    );

    /* =========================
    NO SERVICES
    ========================= */

    if(!activeServices.length){

      container.innerHTML = `

      <div style="
      width:100%;
      text-align:center;
      padding:50px 20px;
      font-size:24px;
      color:#64748b;
      ">

        No Active Services

      </div>

      `;

      return;

    }

    /* =========================
    RENDER
    ========================= */

    activeServices.forEach(service=>{

      const title =

      service.title || "";

      const desc =

      service.description || "";

      const image =

      service.image ||
      "/assets/logo.png";

      const buttonText =

      lang === "es"

      ? "Obtener precio"

      : "Get Quote";

      container.innerHTML += `

      <div class="card">

        <img
        src="${image}"
        class="card-image">

        <div class="card-body">

          <h3>

            ${title}

          </h3>

          <p>

            ${desc}

          </p>

          <a
          href="${
            service.link ||
            "getquote/index.html"
          }"
          class="card-btn">

            ${buttonText}

          </a>

        </div>

      </div>

      `;

    });

  }

};