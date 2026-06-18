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
        "/api/system-design",
        {
          cache:"no-store"
        }
      );

      if(!res.ok){

        throw new Error(
          "Failed To Load System Design"
        );

      }

      this.data =
      await res.json();

      localStorage.setItem(
        "ghSystemDesign",
        JSON.stringify(this.data || {})
      );

    }catch(err){

      console.log(
        "Branding Load Error",
        err
      );

      try{

        this.data =
        JSON.parse(
          localStorage.getItem("ghSystemDesign") || "{}"
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
     HELPERS
  ========================= */

  clean(value){

    return String(value ?? "").trim();

  },

  safeNumber(value, fallback){

    const n =
    Number(value);

    if(!Number.isFinite(n)){
      return fallback;
    }

    return n;

  },

  setVar(name, value){

    document
    .documentElement
    .style
    .setProperty(name, value);

  },

  safeAlign(value){

    const align =
    this.clean(value)
    .toLowerCase();

    return (
      ["left","center","right"].includes(align)
      ? align
      : "center"
    );

  },

  /* =========================
     GETTERS
  ========================= */

  getCompanyName(){

    return (
      this.clean(this.data?.companyName) ||
      "Sunbeam Transportation"
    );

  },

  getTimezone(){

    return (
      this.clean(this.data?.timezone) ||
      "America/Phoenix"
    );

  },

  getMainLogo(){

    return (
      this.clean(this.data?.mainLogo) ||
      "/assets/logo.png"
    );

  },

  getDriverLogo(){

    return (
      this.clean(this.data?.driverLogo) ||
      "/assets/logo.png"
    );

  },

  getHeroImage(){

    return (
      this.clean(this.data?.heroImage) ||
      "/assets/hero.jpeg"
    );

  },

  getServices(){

    if(!Array.isArray(this.data?.services)){
      return [];
    }

    return this.data.services;

  },

  /* =========================
     APPLY GLOBAL BRANDING
  ========================= */

  applyGlobalBranding(){

    document.title =
    this.getCompanyName();

    document
    .querySelectorAll(".company-name")
    .forEach(el=>{

      el.textContent =
      this.getCompanyName();

    });

    document
    .querySelectorAll(".main-logo")
    .forEach(el=>{

      el.src =
      this.getMainLogo();

      el.alt =
      this.getCompanyName();

    });

    document
    .querySelectorAll(".driver-logo")
    .forEach(el=>{

      el.src =
      this.getDriverLogo();

      el.alt =
      this.getCompanyName();

    });

    document
    .querySelectorAll(".hero-image")
    .forEach(el=>{

      el.src =
      this.getHeroImage();

      el.alt =
      this.getCompanyName();

    });

    this.applyThemeEngine();

  },

  /* =========================
     THEME ENGINE
     Uses OLD CORRECT FIELD NAMES
  ========================= */

  applyThemeEngine(){

    const d =
    this.data || {};

    const isMobile =
    window.innerWidth <= 768;

    const pageBg =
    this.clean(d.homepageBg) ||
    this.clean(d.pageBg) ||
    "#f3f4f6";

    const boxBg =
    this.clean(d.extraBoxBg) ||
    "#ffffff";

    const boxBorder =
    this.clean(d.extraBoxBorder) ||
    "#dbeafe";

    const boxBorderSize =
    this.safeNumber(
      d.extraBoxBorderSize,
      2
    );

    const boxRadius =
    this.safeNumber(
      d.extraBoxRadius,
      isMobile ? 18 : 28
    );

    const boxPadding =
    this.safeNumber(
      d.extraBoxPadding,
      isMobile ? 18 : 44
    );

    const boxShadow =
    d.extraBoxShadow === false
    ? "none"
    : "0 10px 30px rgba(0,0,0,.08)";

    const titleColor =
    this.clean(d.extraBoxTitleColor) ||
    "#1e3a6d";

    const titleSize =
    this.safeNumber(
      d.extraBoxTitleSize,
      42
    );

    const titleMobileSize =
    this.safeNumber(
      d.extraBoxTitleMobileSize,
      28
    );

    const textColor =
    this.clean(d.extraBoxTextColor) ||
    "#6b7280";

    const textSize =
    this.safeNumber(
      d.extraBoxTextSize,
      22
    );

    const textMobileSize =
    this.safeNumber(
      d.extraBoxTextMobileSize,
      16
    );

    this.setVar("--page-bg", pageBg);

    this.setVar("--box-bg", boxBg);
    this.setVar("--box-border", boxBorder);
    this.setVar("--box-border-size", `${boxBorderSize}px`);
    this.setVar("--box-radius", `${boxRadius}px`);
    this.setVar("--box-padding", `${boxPadding}px`);
    this.setVar("--box-shadow", boxShadow);

    this.setVar("--box-title-color", titleColor);
    this.setVar("--box-title-size", `${titleSize}px`);
    this.setVar("--box-title-mobile-size", `${titleMobileSize}px`);

    this.setVar("--box-text-color", textColor);
    this.setVar("--box-text-size", `${textSize}px`);
    this.setVar("--box-text-mobile-size", `${textMobileSize}px`);

    document.body.style.background =
    pageBg;

    document
    .querySelectorAll(".edit-box h2, .edit-box h3, .edit-box p")
    .forEach(el=>{

      el.style.wordBreak = "normal";
      el.style.overflowWrap = "normal";
      el.style.hyphens = "none";
      el.style.unicodeBidi = "plaintext";

    });

  },

  /* =========================
     SERVICE ACTIVE CHECK
  ========================= */

  isServiceActive(service){

    if(!service) return false;

    if(service.active === false){
      return false;
    }

    return true;

  },

  /* =========================
     SERVICE TEXT PICKER
  ========================= */

  pickServiceText(service, lang, field){

    if(!service) return "";

    if(lang === "es"){

      return (
        this.clean(service[field + "_es"]) ||
        this.clean(service[field + "Es"]) ||
        this.clean(service[field]) ||
        this.clean(service[field + "_en"]) ||
        this.clean(service[field + "En"]) ||
        ""
      );

    }

    return (
      this.clean(service[field + "_en"]) ||
      this.clean(service[field + "En"]) ||
      this.clean(service[field]) ||
      ""
    );

  },

  /* =========================
     RENDER HOMEPAGE CARDS
  ========================= */

  renderHomepageCards(
    containerId,
    lang = "en"
  ){

    const container =
    document.getElementById(containerId);

    if(!container) return;

    const services =
    this.getServices()
    .filter(service=>this.isServiceActive(service));

    container.innerHTML = "";

    const fragment =
    document.createDocumentFragment();

    services.forEach(service=>{

      const title =
      this.pickServiceText(
        service,
        lang,
        "title"
      );

      const desc =
      this.pickServiceText(
        service,
        lang,
        "description"
      );

      const image =
      this.clean(service.image) ||
      "/assets/logo.png";

      const link =
      this.clean(service.link) ||
      "getquote/index.html";

      const card =
      document.createElement("div");

      card.className = "card";

      const img =
      document.createElement("img");

      img.className = "card-image";
      img.src = image;
      img.alt = title || this.getCompanyName();
      img.loading = "lazy";
      img.decoding = "async";

      img.onerror = function(){

        if(this.dataset.fallbackDone === "true"){

          this.style.display = "none";

          const parentCard =
          this.closest(".card");

          if(parentCard){
            parentCard.classList.add("no-image");
          }

          return;

        }

        this.dataset.fallbackDone = "true";
        this.src = "/assets/logo.png";

      };

      const body =
      document.createElement("div");

      body.className = "card-body";

      const h3 =
      document.createElement("h3");

      h3.textContent =
      title || "Transportation Service";

      const p =
      document.createElement("p");

      p.textContent =
      desc || "";

      const a =
      document.createElement("a");

      a.className = "card-btn";
      a.href = link;

      a.textContent =
      lang === "es"
      ? "Obtener precio"
      : "Get Quote";

      body.appendChild(h3);
      body.appendChild(p);
      body.appendChild(a);

      card.appendChild(img);
      card.appendChild(body);

      fragment.appendChild(card);

    });

    container.appendChild(fragment);

  }

};