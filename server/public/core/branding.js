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

    /* ABOUT TITLE */

    document
    .querySelectorAll(".about h2")
    .forEach(el=>{

      const size =
      mobile
      ? 34
      : Number(data.aboutTitleSize || 60);

      el.style.setProperty(
        "color",
        data.aboutTitleColor || "#145cff",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${size}px`,
        "important"
      );

      el.style.setProperty(
        "line-height",
        mobile ? "1.25" : "1.2",
        "important"
      );

      el.style.setProperty(
        "text-align",
        data.aboutTitleAlign || "center",
        "important"
      );

    });

    /* ABOUT TEXT */

    document
    .querySelectorAll(".about p")
    .forEach(el=>{

      const size =
      mobile
      ? 17
      : Number(data.aboutTextSize || 25);

      el.style.setProperty(
        "color",
        data.aboutTextColor || "#334155",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${size}px`,
        "important"
      );

      el.style.setProperty(
        "line-height",
        mobile ? "1.9" : "1.9",
        "important"
      );

      el.style.setProperty(
        "text-align",
        data.aboutTextAlign || "center",
        "important"
      );

    });

    /* QUOTE SECTION */

    document
    .querySelectorAll(".quote-header")
    .forEach(box=>{

      box.style.setProperty(
        "background",
        data.quoteBg || "#ffffff",
        "important"
      );

      box.style.setProperty(
        "border",
        `2px solid ${
          data.quoteBorder || "#dbeafe"
        }`,
        "important"
      );

      box.style.setProperty(
        "border-radius",
        `${data.quoteRadius || 28}px`,
        "important"
      );

      box.style.setProperty(
        "padding",
        `${mobile ? 30 : (data.quotePadding || 40)}px 16px`,
        "important"
      );

      box.style.setProperty(
        "box-shadow",
        mobile
        ? "0 4px 10px rgba(0,0,0,.06)"
        : (
          data.extraBoxShadow
          ? "0 10px 30px rgba(0,0,0,.08)"
          : "none"
        ),
        "important"
      );

    });

    /* QUOTE TITLE */

    document
    .querySelectorAll(".quote-header h2")
    .forEach(el=>{

      const size =
      mobile
      ? 40
      : Number(data.quoteTitleSize || 70);

      el.style.setProperty(
        "color",
        data.quoteTitleColor || "#145cff",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${size}px`,
        "important"
      );

      el.style.setProperty(
        "line-height",
        mobile ? "1.15" : "1.1",
        "important"
      );

      el.style.setProperty(
        "text-align",
        data.quoteTitleAlign || "center",
        "important"
      );

    });

    /* QUOTE TEXT */

    document
    .querySelectorAll(".quote-header p")
    .forEach(el=>{

      const size =
      mobile
      ? 17
      : Number(data.quoteTextSize || 24);

      el.style.setProperty(
        "color",
        data.quoteTextColor || "#334155",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${size}px`,
        "important"
      );

      el.style.setProperty(
        "line-height",
        mobile ? "1.8" : "1.8",
        "important"
      );

      el.style.setProperty(
        "text-align",
        data.quoteTextAlign || "center",
        "important"
      );

    });

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