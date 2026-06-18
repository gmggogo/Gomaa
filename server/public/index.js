// =========================
// FILE: public/core/branding.js
// CENTRAL BRANDING ENGINE - LIGHT VERSION
// =========================

console.log("BRANDING ENGINE LOADED");

window.Branding = {

  data:{},

  async load(){

    try{

      const res = await fetch("/api/system-design",{ cache:"no-store" });

      if(!res.ok){
        throw new Error("Failed To Load Branding");
      }

      this.data = await res.json();

    }catch(err){

      console.log("Branding Load Error",err);

      try{

        this.data = JSON.parse(
          localStorage.getItem("ghSystemDesign") || "{}"
        );

      }catch(e){

        this.data = {};

      }

    }

    this.applyGlobalBranding();

    return this.data;

  },

  save(data){

    this.data = data || {};

    localStorage.setItem(
      "ghSystemDesign",
      JSON.stringify(this.data)
    );

    this.applyGlobalBranding();

  },

  getCompanyName(){

    return this.data.companyName || "Sunbeam Transportation";

  },

  getMainLogo(){

    return this.data.mainLogo || "/assets/logo.png";

  },

  getDriverLogo(){

    return this.data.driverLogo || "/assets/logo.png";

  },

  getHeroImage(){

    return this.data.heroImage || "/assets/hero.jpeg";

  },

  getTimezone(){

    return this.data.timezone || "America/Phoenix";

  },

  getServices(){

    return Array.isArray(this.data.services)
    ? this.data.services
    : [];

  },

  cleanText(value){

    return String(
      value === undefined || value === null
      ? ""
      : value
    );

  },

  cleanAlign(value,fallback="center"){

    const v = String(value || "").toLowerCase().trim();

    return ["left","center","right"].includes(v)
    ? v
    : fallback;

  },

  applyGlobalBranding(){

    document.title = this.getCompanyName();

    document.querySelectorAll(".company-name").forEach(el=>{
      el.innerText = this.getCompanyName();
    });

    document.querySelectorAll(".main-logo").forEach(el=>{
      el.src = this.getMainLogo();
      el.onerror = function(){
        this.onerror = null;
        this.src = "/assets/logo.png";
      };
    });

    document.querySelectorAll(".driver-logo").forEach(el=>{
      el.src = this.getDriverLogo();
      el.onerror = function(){
        this.onerror = null;
        this.src = "/assets/logo.png";
      };
    });

    document.querySelectorAll(".hero-image").forEach(el=>{
      el.src = this.getHeroImage();
      el.onerror = function(){
        this.onerror = null;
        this.src = "/assets/logo.png";
      };
    });

  },

  renderHomepageCards(containerId,lang="en"){

    const container = document.getElementById(containerId);

    if(!container) return;

    const services = this.getServices();

    container.innerHTML = "";

    const fragment = document.createDocumentFragment();

    const globalAlign = this.cleanAlign(
      this.data.cardTextAlign ||
      this.data.cardAlign ||
      "center",
      "center"
    );

    services.forEach(service=>{

      if(!service || service.active === false) return;

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

      const image = service.image || "/assets/logo.png";

      const link = service.link || "getquote/index.html";

      const align = this.cleanAlign(
        service.textAlign ||
        service.align ||
        globalAlign,
        globalAlign
      );

      const card = document.createElement("div");
      card.className = "card";

      const img = document.createElement("img");
      img.className = "card-image";
      img.src = image;
      img.alt = this.cleanText(title);
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = function(){
        this.onerror = null;
        this.src = "/assets/logo.png";
      };

      const body = document.createElement("div");
      body.className = "card-body";
      body.style.textAlign = align;

      const h3 = document.createElement("h3");
      h3.innerText = this.cleanText(title);
      h3.style.textAlign = align;

      const p = document.createElement("p");
      p.innerText = this.cleanText(desc);
      p.style.textAlign = align;

      const btn = document.createElement("a");
      btn.className = "card-btn";
      btn.href = link;
      btn.innerText = lang === "es" ? "Obtener precio" : "Get Quote";

      body.appendChild(h3);
      body.appendChild(p);
      body.appendChild(btn);

      card.appendChild(img);
      card.appendChild(body);

      fragment.appendChild(card);

    });

    container.appendChild(fragment);

  }

};