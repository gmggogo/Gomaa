// =========================
// FILE: public/core/branding.js
// GH MOBILITY BRANDING ENGINE
// FINAL SERVER VERSION
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

    /* 🔥 APPLY THEME ENGINE */
    this.applyThemeEngine();

    return this.data;

  },

  /* =========================
  COMPANY NAME
  ========================= */

  getCompanyName(){

    return (

      this.data?.companyName ||

      "Sunbeam Transportation"

    );

  },

  /* =========================
  MAIN LOGO
  ========================= */

  getMainLogo(){

    return (

      this.data?.mainLogo ||

      "/assets/logo.png"

    );

  },

  /* =========================
  DRIVER LOGO
  ========================= */

  getDriverLogo(){

    return (

      this.data?.driverLogo ||

      "/assets/logo.png"

    );

  },

  /* =========================
  HERO IMAGE
  ========================= */

  getHeroImage(){

    return (

      this.data?.heroImage ||

      "/assets/hero.jpeg"

    );

  },

  /* =========================
  SERVICES
  ========================= */

  getServices(){

    const services =

    this.data?.services ||

    [];

    if(
      Array.isArray(services)
    ){
      return services;
    }

    return [];

  },

  /* =========================
  APPLY GLOBAL
  ========================= */

  applyGlobalBranding(){

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
    APP LOGO
    ========================= */

    document
    .querySelectorAll(
      ".app-logo"
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

  },

  /* =========================
  THEME ENGINE
  ========================= */

  applyThemeEngine(){

    const data =
    this.data || {};

    /* =========================
    EXTRA BOXES
    ========================= */

    document
    .querySelectorAll(".extra-box")
    .forEach(box=>{

        box.style.setProperty(
          "background",
          data.extraBoxBg || "#ffffff",
          "important"
        );

        box.style.setProperty(
          "border",
          `${data.extraBoxBorderSize || 2}px solid ${
            data.extraBoxBorder || "#dbeafe"
          }`,
          "important"
        );

        box.style.setProperty(
          "border-radius",
          `${data.extraBoxRadius || 28}px`,
          "important"
        );

        box.style.setProperty(
          "padding",
          `${data.extraBoxPadding || 44}px`,
          "important"
        );

        box.style.setProperty(
          "text-align",
          data.extraBoxAlign || "center",
          "important"
        );

        box.style.setProperty(
          "box-shadow",
          data.extraBoxShadow
          ? "0 10px 30px rgba(0,0,0,.08)"
          : "none",
          "important"
        );

    });

    /* =========================
    EXTRA TITLES
    ========================= */

    document
    .querySelectorAll(".extra-box h3")
    .forEach(title=>{

        title.style.setProperty(
          "color",
          data.extraBoxTitleColor || "#1e3a6d",
          "important"
        );

        title.style.setProperty(
          "font-size",
          `${data.extraBoxTitleSize || 42}px`,
          "important"
        );

    });

    /* =========================
    EXTRA TEXT
    ========================= */

    document
    .querySelectorAll(".extra-box p")
    .forEach(text=>{

        text.style.setProperty(
          "color",
          data.extraBoxTextColor || "#6b7280",
          "important"
        );

        text.style.setProperty(
          "font-size",
          `${data.extraBoxTextSize || 22}px`,
          "important"
        );

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

        ${
          lang === "es"
          ? "No hay servicios activos"
          : "No Active Services"
        }

      </div>

      `;

      return;

    }

    /* =========================
    RENDER SERVICES
    ========================= */

    activeServices.forEach(service=>{

      const title =

      lang === "es"

      ? (
          service.titleEs ||
          service.title ||
          ""
        )

      : (
          service.title ||
          ""
        );

      const desc =

      lang === "es"

      ? (
          service.descriptionEs ||
          service.description ||
          ""
        )

      : (
          service.description ||
          ""
        );

      const image =

      service.image ||
      "/assets/logo.png";

      const buttonText =

      lang === "es"

      ? (
          service.buttonEs ||
          "Obtener precio"
        )

      : (
          service.button ||
          "Get Quote"
        );

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