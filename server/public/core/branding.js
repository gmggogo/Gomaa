// =========================
// FILE: public/core/branding.js
// GH MOBILITY BRANDING ENGINE
// FINAL MOBILE + ALIGN FIX
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
    this.data?.services || [];

    if(Array.isArray(services)){
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

  /* =========================
  THEME ENGINE
  ========================= */

  applyThemeEngine(){

    const data =
    this.data || {};

    const mobile =
    window.innerWidth <= 768;

    /* =========================
    BODY
    ========================= */

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

    /* =========================
    ABOUT TITLE
    ========================= */

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
        "width",
        "100%",
        "important"
      );

      el.style.setProperty(
        "display",
        "block",
        "important"
      );

      el.style.setProperty(
        "text-align",
        mobile
        ? "left"
        : (data.aboutTitleAlign || "center"),
        "important"
      );

    });

    /* =========================
    ABOUT TEXT
    ========================= */

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
        "width",
        "100%",
        "important"
      );

      el.style.setProperty(
        "display",
        "block",
        "important"
      );

      el.style.setProperty(
        "word-spacing",
        "normal",
        "important"
      );

      el.style.setProperty(
        "letter-spacing",
        "normal",
        "important"
      );

      el.style.setProperty(
        "word-break",
        "normal",
        "important"
      );

      el.style.setProperty(
        "overflow-wrap",
        "break-word",
        "important"
      );

      el.style.setProperty(
        "hyphens",
        "none",
        "important"
      );

      el.style.setProperty(
        "text-align",
        mobile
        ? "justify"
        : (data.aboutTextAlign || "center"),
        "important"
      );

    });

    /* =========================
    QUOTE SECTION
    ========================= */

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
        `${mobile ? 24 : (data.quotePadding || 40)}px`,
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
    QUOTE TITLE
    ========================= */

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
        "width",
        "100%",
        "important"
      );

      el.style.setProperty(
        "display",
        "block",
        "important"
      );

      el.style.setProperty(
        "text-align",
        mobile
        ? "left"
        : (data.quoteTitleAlign || "center"),
        "important"
      );

    });

    /* =========================
    QUOTE TEXT
    ========================= */

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
        "width",
        "100%",
        "important"
      );

      el.style.setProperty(
        "display",
        "block",
        "important"
      );

      el.style.setProperty(
        "word-spacing",
        "normal",
        "important"
      );

      el.style.setProperty(
        "letter-spacing",
        "normal",
        "important"
      );

      el.style.setProperty(
        "word-break",
        "normal",
        "important"
      );

      el.style.setProperty(
        "overflow-wrap",
        "break-word",
        "important"
      );

      el.style.setProperty(
        "hyphens",
        "none",
        "important"
      );

      el.style.setProperty(
        "text-align",
        mobile
        ? "justify"
        : (data.quoteTextAlign || "center"),
        "important"
      );

    });

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
        `${mobile ? 18 : (data.extraBoxRadius || 28)}px`,
        "important"
      );

      box.style.setProperty(
        "padding",
        `${mobile ? 22 : (data.extraBoxPadding || 44)}px`,
        "important"
      );

      box.style.setProperty(
        "box-shadow",
        data.extraBoxShadow
        ? "0 10px 30px rgba(0,0,0,.08)"
        : "none",
        "important"
      );

      if(mobile){

        box.style.setProperty(
          "text-align",
          "left",
          "important"
        );

        box.style.setProperty(
          "display",
          "flex",
          "important"
        );

        box.style.setProperty(
          "flex-direction",
          "column",
          "important"
        );

        box.style.setProperty(
          "align-items",
          "flex-start",
          "important"
        );

      }else{

        box.style.setProperty(
          "text-align",
          data.extraBoxAlign || "center",
          "important"
        );

      }

    });

    /* =========================
    EXTRA TITLES
    ========================= */

    document
    .querySelectorAll(".extra-box h3")
    .forEach(title=>{

      const size =
      mobile
      ? Number(data.extraBoxTitleSize || 42) * 0.62
      : Number(data.extraBoxTitleSize || 42);

      title.style.setProperty(
        "color",
        data.extraBoxTitleColor || "#145cff",
        "important"
      );

      title.style.setProperty(
        "font-size",
        `${size}px`,
        "important"
      );

      title.style.setProperty(
        "width",
        "100%",
        "important"
      );

      title.style.setProperty(
        "display",
        "block",
        "important"
      );

      title.style.setProperty(
        "line-height",
        mobile ? "1.3" : "1.2",
        "important"
      );

      title.style.setProperty(
        "margin-bottom",
        mobile ? "14px" : "22px",
        "important"
      );

      title.style.setProperty(
        "text-align",
        mobile
        ? "left"
        : (data.extraBoxAlign || "center"),
        "important"
      );

    });

    /* =========================
    EXTRA TEXT
    ========================= */

    document
    .querySelectorAll(".extra-box p")
    .forEach(text=>{

      const size =
      mobile
      ? Number(data.extraBoxTextSize || 22) * 0.80
      : Number(data.extraBoxTextSize || 22);

      text.style.setProperty(
        "color",
        data.extraBoxTextColor || "#334155",
        "important"
      );

      text.style.setProperty(
        "font-size",
        `${size}px`,
        "important"
      );

      text.style.setProperty(
        "width",
        "100%",
        "important"
      );

      text.style.setProperty(
        "display",
        "block",
        "important"
      );

      text.style.setProperty(
        "line-height",
        mobile ? "1.85" : "2",
        "important"
      );

      text.style.setProperty(
        "word-spacing",
        "normal",
        "important"
      );

      text.style.setProperty(
        "letter-spacing",
        "normal",
        "important"
      );

      text.style.setProperty(
        "word-break",
        "normal",
        "important"
      );

      text.style.setProperty(
        "overflow-wrap",
        "break-word",
        "important"
      );

      text.style.setProperty(
        "hyphens",
        "none",
        "important"
      );

      text.style.setProperty(
        "text-align",
        mobile
        ? "justify"
        : (data.extraBoxAlign || "center"),
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