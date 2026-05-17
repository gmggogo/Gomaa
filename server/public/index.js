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

      const res =
      await fetch(
        "/api/system-design"
      );

      this.data =
      await res.json();

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

    this.data =
    data || {};

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
      this.data?.companyName ||
      "Sunbeam Transportation"
    );

  },

  getTimezone(){

    return (
      this.data?.timezone ||
      "America/Phoenix"
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

    return (
      this.data?.services ||
      []
    );

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
    .forEach(el=>{

      el.src =
      this.getMainLogo();

    });

    document
    .querySelectorAll(".driver-logo")
    .forEach(el=>{

      el.src =
      this.getDriverLogo();

    });

    document
    .querySelectorAll(".hero-image")
    .forEach(el=>{

      el.src =
      this.getHeroImage();

    });

    this.applyThemeEngine();

  },

  /* =========================
  APPLY THEME ENGINE
  ========================= */

  applyThemeEngine(){

    const d =
    this.data || {};

    document
    .querySelectorAll(".extra-box")
    .forEach(box=>{

      box.style.background =
      d.extraBoxBg || "#ffffff";

      box.style.border =
      `${d.extraBoxBorderSize || 2}px solid ${
        d.extraBoxBorder || "#dbeafe"
      }`;

      box.style.borderRadius =
      `${d.extraBoxRadius || 28}px`;

      box.style.padding =
      `${d.extraBoxPadding || 40}px`;

      box.style.textAlign =
      d.extraBoxAlign || "center";

      box.style.boxShadow =
      d.extraBoxShadow
      ? "0 12px 35px rgba(0,0,0,.10)"
      : "none";

    });

    document
    .querySelectorAll(
      ".extra-box h2, .extra-box h3"
    )
    .forEach(title=>{

      title.style.color =
      d.extraBoxTitleColor || "#145cff";

      title.style.fontSize =
      `${d.extraBoxTitleSize || 32}px`;

    });

    document
    .querySelectorAll(".extra-box p")
    .forEach(text=>{

      text.style.color =
      d.extraBoxTextColor || "#334155";

      text.style.fontSize =
      `${d.extraBoxTextSize || 18}px`;

    });

  },

  /* =========================
  RENDER HOMEPAGE CARDS
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
      ? (
          service.title_es ||
          service.titleEs ||
          service.title ||
          service.title_en ||
          ""
        )
      : (
          service.title_en ||
          service.title ||
          ""
        );

      const desc =
      lang === "es"
      ? (
          service.description_es ||
          service.descriptionEs ||
          service.description ||
          service.description_en ||
          ""
        )
      : (
          service.description_en ||
          service.description ||
          ""
        );

      container.innerHTML += `

      <div class="card">

        <img
          src="${service.image || "/assets/logo.png"}"
          class="card-image"
        >

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