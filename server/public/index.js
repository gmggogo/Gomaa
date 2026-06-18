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
     SAFE HELPERS
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
     APPLY THEME ENGINE
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

    const bg =
    this.clean(d.extraBoxBg) ||
    "#ffffff";

    const border =
    this.clean(d.extraBoxBorder) ||
    "#dbeafe";

    const borderSize =
    this.safeNumber(
      d.extraBoxBorderSize,
      2
    );

    const radius =
    this.safeNumber(
      d.extraBoxRadius,
      isMobile ? 18 : 28
    );

    const padding =
    this.safeNumber(
      d.extraBoxPadding,
      isMobile ? 18 : 44
    );

    const alignRaw =
    this.clean(d.extraBoxAlign)
    .toLowerCase();

    const align =
    ["left","center","right"].includes(alignRaw)
    ? alignRaw
    : "center";

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

    const shadow =
    d.extraBoxShadow === false
    ? "none"
    : "0 10px 30px rgba(0,0,0,.08)";

    this.setVar("--page-bg", pageBg);

    this.setVar("--extra-bg", bg);
    this.setVar("--extra-border", border);
    this.setVar("--extra-border-size", `${borderSize}px`);
    this.setVar("--extra-radius", `${radius}px`);
    this.setVar("--extra-padding", `${padding}px`);
    this.setVar("--extra-align", align);
    this.setVar("--extra-title-color", titleColor);
    this.setVar("--extra-title-size", `${titleSize}px`);
    this.setVar("--extra-title-mobile-size", `${titleMobileSize}px`);
    this.setVar("--extra-text-color", textColor);
    this.setVar("--extra-text-size", `${textSize}px`);
    this.setVar("--extra-text-mobile-size", `${textMobileSize}px`);
    this.setVar("--extra-shadow", shadow);

    document.body.style.background =
    pageBg;

    document
    .querySelectorAll(".extra-box")
    .forEach(box=>{

      box.style.textAlign = align;

      box.style.direction =
      align === "right"
      ? "rtl"
      : "ltr";

    });

    document
    .querySelectorAll(
      ".extra-box h2, .extra-box h3, .extra-box p"
    )
    .forEach(el=>{

      el.style.textAlign = "inherit";
      el.style.direction = "inherit";
      el.style.unicodeBidi = "plaintext";
      el.style.wordBreak = "normal";
      el.style.overflowWrap = "break-word";
      el.style.hyphens = "none";

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