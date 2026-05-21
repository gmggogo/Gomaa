// =========================
// FILE: public/core/branding.js
// GH MOBILITY BRANDING ENGINE
// FINAL CLEAN VERSION
// =========================

console.log(
  "BRANDING ENGINE LOADED"
);

window.Branding = {

  data:{},

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

    const isHomePage =

    window.location.pathname === "/" ||

    window.location.pathname.includes("index");

    if(isHomePage){

      this.applyThemeEngine();

    }

  },

  getCompanyName(){

    return (
      this.data?.companyName ||
      "Sunbeam Transportation"
    );

  },

  getMainLogo(){

    return (
      this.data?.mainLogo ||
      "/assets/logo.png"
    );

  },

  getDriverLogo(){

    return (
      this.data?.driverLogo ||
      "/assets/logo.png"
    );

  },

  getHeroImage(){

    return (
      this.data?.heroImage ||
      "/assets/hero.jpeg"
    );

  },

  getServices(){

    const services =
    this.data?.services || [];

    if(Array.isArray(services)){
      return services;
    }

    return [];

  },

  applyGlobalBranding(){

    document.title =
    this.getCompanyName();

    document
    .querySelectorAll(".company-name")
    .forEach(el=>{

      el.innerText =
      this.getCompanyName();

    });

    document
    .querySelectorAll(".main-logo")
    .forEach(img=>{

      img.src =
      this.getMainLogo();

    });

    document
    .querySelectorAll(".app-logo")
    .forEach(img=>{

      img.src =
      this.getMainLogo();

    });

    document
    .querySelectorAll(".driver-logo")
    .forEach(img=>{

      img.src =
      this.getDriverLogo();

    });

    document
    .querySelectorAll(".hero-image")
    .forEach(img=>{

      img.src =
      this.getHeroImage();

    });

  },

  applyThemeEngine(){

    const data =
    this.data || {};

    const mobile =
    window.innerWidth <= 768;

    document.body.style.setProperty(
      "background",
      data.bodyBg || "#f1f5f9",
      "important"
    );

    document.body.style.setProperty(
      "color",
      data.bodyTextColor || "#0f172a",
      "important"
    );

  },

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

    const activeServices =
    services.filter(
      s => s.active
    );

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