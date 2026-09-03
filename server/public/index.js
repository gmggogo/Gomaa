// =========================
// FILE: public/core/branding.js
// CENTRAL BRANDING ENGINE
// WORD ALIGN SAFE VERSION
// =========================

console.log("BRANDING ENGINE LOADED");

window.Branding = {

  data:{},
  tenant:null,

  /* =========================
     HOMEPAGE TENANT
  ========================= */

  cleanTenantSlug(value){

    return String(value || "")
    .trim()
    .toLowerCase();

  },

  getTenantSlug(){

    const params =
    new URLSearchParams(
      window.location.search
    );

    const fromQuery =
    this.cleanTenantSlug(
      params.get("tenant") ||
      params.get("tenantSlug")
    );

    if(fromQuery) return fromQuery;

    const parts =
    window.location.pathname
    .split("/")
    .filter(Boolean);

    if(
      parts[0] === "t" &&
      parts[1]
    ){
      return this.cleanTenantSlug(parts[1]);
    }

    if(parts.length === 1){

      const candidate =
      this.cleanTenantSlug(parts[0]);

      const reserved =
      new Set([
        "",
        "admin",
        "dispatcher",
        "driver",
        "company",
        "companies",
        "platform-admin",
        "booking",
        "api",
        "core",
        "assets",
        "uploads",
        "getquote",
        "login",
        "login.html",
        "index.html"
      ]);

      if(
        candidate &&
        !reserved.has(candidate) &&
        /^[a-z0-9-]+$/.test(candidate)
      ){
        return candidate;
      }
    }

    return "";

  },

  /* =========================
     LOAD
  ========================= */

  async load(){

    try{

      const tenantSlug =
      this.getTenantSlug();

      const url =
      tenantSlug
      ? "/api/public/tenant/" +
        encodeURIComponent(tenantSlug)
      : "/api/public/tenant/default";

      const res =
      await fetch(
        url,
        {
          cache:"no-store"
        }
      );

      let payload = {};

      try{
        payload = await res.json();
      }catch{
        payload = {};
      }

      if(!res.ok){

        throw new Error(
          payload?.message ||
          "Failed To Load Homepage Design"
        );

      }

      if(payload && payload.design){

        this.data =
        payload.design || {};

        this.tenant =
        payload.tenant || null;

      }else{

        this.data =
        payload || {};

        this.tenant =
        payload?.tenant || null;

      }

    }catch(err){

      console.log(
        "Homepage Branding Load Error",
        err
      );

      this.data = {};
      this.tenant = null;

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

    return Array.isArray(
      this.data?.services
    )
    ? this.data.services
    : [];

  },

  /* =========================
     TEXT HELPERS
  ========================= */

  cleanText(value){

    return String(
      value === undefined ||
      value === null
      ? ""
      : value
    );

  },

  cleanWordText(value){

    return this.cleanText(value)
    .replace(/style="[^"]*"/gi,"")
    .replace(/style='[^']*'/gi,"")
    .replace(/text-align\s*:\s*(left|right|center|justify)\s*;?/gi,"")
    .replace(/<div[^>]*>/gi,"")
    .replace(/<\/div>/gi,"\n")
    .replace(/<p[^>]*>/gi,"")
    .replace(/<\/p>/gi,"\n")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim();

  },

  normalizeWordAlign(align){

    const clean =
    String(align || "")
    .toLowerCase()
    .trim();

    const allowed = [
      "left",
      "center",
      "right",
      "justify",
      "justify-left",
      "justify-center",
      "justify-right"
    ];

    return allowed.includes(clean)
    ? clean
    : "center";

  },

  detectDirection(text){

    return /[\u0600-\u06FF]/.test(
      String(text || "")
    )
    ? "rtl"
    : "ltr";

  },

  applyWordElement(el,value,align){

    if(!el) return;

    const text =
    this.cleanWordText(value);

    const finalAlign =
    this.normalizeWordAlign(align);

    const dir =
    this.detectDirection(text);

    el.classList.remove(
      "gh-align-left",
      "gh-align-center",
      "gh-align-right",
      "gh-align-justify",
      "gh-align-justify-left",
      "gh-align-justify-center",
      "gh-align-justify-right",
      "gh-dir-ltr",
      "gh-dir-rtl"
    );

    el.classList.add(
      "gh-word-text",
      "gh-align-" + finalAlign,
      dir === "rtl"
      ? "gh-dir-rtl"
      : "gh-dir-ltr"
    );

    el.innerText =
    text;

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

    const extraTitleAlign =
    isMobile
    ? (d.extraBoxTitleMobileAlign || "center")
    : (d.extraBoxAlign || "justify-center");

    const extraTextAlign =
    isMobile
    ? (d.extraBoxTextMobileAlign || "left")
    : (d.extraBoxAlign || "justify-center");

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
        `${d.extraBoxRadius || 32}px`,
        "important"
      );

      box.style.setProperty(
        "padding",
        isMobile
        ? `${d.extraBoxMobilePadding || 18}px`
        : `${d.extraBoxPadding || 70}px`,
        "important"
      );

      box.style.setProperty(
        "box-shadow",
        d.extraBoxShadow
        ? "0 8px 22px rgba(15,23,42,.06)"
        : "none",
        "important"
      );

    });

    document
    .querySelectorAll(
      ".extra-box h2, .extra-box h3"
    )
    .forEach(title=>{

      title.style.setProperty(
        "color",
        d.extraBoxTitleColor || "#1e3a6d",
        "important"
      );

      title.style.setProperty(
        "font-size",
        isMobile
        ? `${d.extraBoxTitleMobileSize || 20}px`
        : `${d.extraBoxTitleSize || 42}px`,
        "important"
      );

      this.applyWordElement(
        title,
        title.innerText,
        extraTitleAlign
      );

    });

    document
    .querySelectorAll(".extra-box p, .extra-box div")
    .forEach(text=>{

      if(
        text.classList.contains("extra-box")
      ) return;

      text.style.setProperty(
        "color",
        d.extraBoxTextColor || "#6b7280",
        "important"
      );

      text.style.setProperty(
        "font-size",
        isMobile
        ? `${d.extraBoxTextMobileSize || 14}px`
        : `${d.extraBoxTextSize || 22}px`,
        "important"
      );

      this.applyWordElement(
        text,
        text.innerText,
        extraTextAlign
      );

    });

  },

  /* =========================
     RENDER HOMEPAGE CARDS
     نفس الكروت — مع تحسين الرندر فقط
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

    const fragment =
    document.createDocumentFragment();

    services.forEach(service=>{

      if(!service || !service.active) return;

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

      const card =
      document.createElement("div");

      card.className =
      "card";

      const img =
      document.createElement("img");

      img.src =
      service.image ||
      "/assets/logo.png";

      img.className =
      "card-image";

      img.alt =
      this.cleanText(title);

      const body =
      document.createElement("div");

      body.className =
      "card-body";

      const h3 =
      document.createElement("h3");

      h3.innerText =
      this.cleanText(title);

      const p =
      document.createElement("p");

      p.innerText =
      this.cleanText(desc);

      const a =
      document.createElement("a");

      a.href =
      service.link ||
      "getquote/index.html";

      a.className =
      "card-btn";

      a.innerText =
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