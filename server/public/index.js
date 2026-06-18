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

      if(!res.ok){

        throw new Error(
          "Failed To Load System Design"
        );

      }

      this.data =
      await res.json();

    }catch(err){

      console.log(
        "Branding Load Error",
        err
      );

      try{

        this.data =
        JSON.parse(
          localStorage.getItem(
            "ghSystemDesign"
          ) || "{}"
        );

      }catch(e){

        this.data = {};

      }

    }

    this.applyGlobalBranding();

    return this.data;

  },

  /* =========================
     SAVE LOCAL
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

    const services =
    this.data?.services;

    return Array.isArray(services)
    ? services
    : [];

  },

  /* =========================
     SAFE HELPERS
  ========================= */

  text(value, fallback = ""){

    return String(
      value === undefined ||
      value === null
      ? fallback
      : value
    );

  },

  cleanAlign(value, fallback = "center"){

    const align =
    String(value || "")
    .toLowerCase()
    .trim();

    return [
      "left",
      "center",
      "right"
    ].includes(align)
    ? align
    : fallback;

  },

  setTextAlign(el, align){

    if(!el) return;

    const clean =
    this.cleanAlign(
      align,
      "center"
    );

    el.style.setProperty(
      "text-align",
      clean,
      "important"
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

    const isMobile =
    window.innerWidth <= 768;

    const extraAlign =
    this.cleanAlign(
      d.extraBoxAlign,
      "center"
    );

    document
    .querySelectorAll(".extra-box")
    .forEach(box=>{

      box.style.setProperty(
        "background",
        d.extraBoxBg || "#ffffff",
        "important"
      );

      box.style.setProperty(
        "border",
        `${d.extraBoxBorderSize || 2}px solid ${
          d.extraBoxBorder || "#dbeafe"
        }`,
        "important"
      );

      box.style.setProperty(
        "border-radius",
        `${d.extraBoxRadius || 28}px`,
        "important"
      );

      box.style.setProperty(
        "padding",
        isMobile
        ? `${d.extraBoxMobilePadding || 18}px`
        : `${d.extraBoxPadding || 44}px`,
        "important"
      );

      box.style.setProperty(
        "text-align",
        extraAlign,
        "important"
      );

      box.style.setProperty(
        "box-shadow",
        d.extraBoxShadow === false
        ? "none"
        : "0 10px 30px rgba(0,0,0,.08)",
        "important"
      );

    });

    document
    .querySelectorAll(
      ".extra-box h2, .extra-box h3"
    )
    .forEach(title=>{

      title.style.setProperty(
        "width",
        "100%",
        "important"
      );

      title.style.setProperty(
        "color",
        d.extraBoxTitleColor || "#1e3a6d",
        "important"
      );

      title.style.setProperty(
        "font-size",
        isMobile
        ? `${d.extraBoxTitleMobileSize || 22}px`
        : `${d.extraBoxTitleSize || 42}px`,
        "important"
      );

      this.setTextAlign(
        title,
        extraAlign
      );

    });

    document
    .querySelectorAll(".extra-box p")
    .forEach(text=>{

      text.style.setProperty(
        "width",
        "100%",
        "important"
      );

      text.style.setProperty(
        "color",
        d.extraBoxTextColor || "#6b7280",
        "important"
      );

      text.style.setProperty(
        "font-size",
        isMobile
        ? `${d.extraBoxTextMobileSize || 15}px`
        : `${d.extraBoxTextSize || 22}px`,
        "important"
      );

      this.setTextAlign(
        text,
        extraAlign
      );

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

    const d =
    this.data || {};

    const cardAlign =
    this.cleanAlign(
      d.cardTextAlign ||
      d.cardAlign ||
      "center",
      "center"
    );

    const activeServices =
    services.filter(service=>{

      return service &&
      service.active !== false;

    });

    activeServices.forEach(service=>{

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

      const link =
      service.link ||
      "getquote/index.html";

      const image =
      service.image ||
      "/assets/logo.png";

      const serviceAlign =
      this.cleanAlign(
        service.align ||
        service.textAlign ||
        cardAlign,
        cardAlign
      );

      const card =
      document.createElement("div");

      card.className =
      "card";

      const img =
      document.createElement("img");

      img.className =
      "card-image";

      img.src =
      image;

      img.alt =
      title || "Service";

      const body =
      document.createElement("div");

      body.className =
      "card-body";

      body.style.setProperty(
        "text-align",
        serviceAlign,
        "important"
      );

      const h3 =
      document.createElement("h3");

      h3.innerText =
      this.text(title);

      h3.style.setProperty(
        "text-align",
        serviceAlign,
        "important"
      );

      h3.style.setProperty(
        "width",
        "100%",
        "important"
      );

      const p =
      document.createElement("p");

      p.innerText =
      this.text(desc);

      p.style.setProperty(
        "text-align",
        serviceAlign,
        "important"
      );

      p.style.setProperty(
        "width",
        "100%",
        "important"
      );

      const btn =
      document.createElement("a");

      btn.href =
      link;

      btn.className =
      "card-btn";

      btn.innerText =
      lang === "es"
      ? "Obtener precio"
      : "Get Quote";

      body.appendChild(h3);
      body.appendChild(p);
      body.appendChild(btn);

      card.appendChild(img);
      card.appendChild(body);

      container.appendChild(card);

    });

  }

};