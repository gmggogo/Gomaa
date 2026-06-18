// =========================
// FILE: public/core/branding.js
// CENTRAL BRANDING ENGINE
// =========================

console.log("BRANDING ENGINE LOADED");

window.Branding = {

  data: {},

  async load(){

    try{
      const res = await fetch("/api/system-design");
      this.data = await res.json();
    }catch(err){
      console.log("Branding Load Error", err);
      this.data = {};
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
    return this.data?.companyName || "Sunbeam Transportation";
  },

  getTimezone(){
    return this.data?.timezone || "America/Phoenix";
  },

  getMainLogo(){
    return this.data?.mainLogo || "/assets/logo.png";
  },

  getDriverLogo(){
    return this.data?.driverLogo || "/assets/logo.png";
  },

  getHeroImage(){
    return this.data?.heroImage || "/assets/hero.jpeg";
  },

  getServices(){
    return this.data?.services || [];
  },

  applyGlobalBranding(){

    document.title = this.getCompanyName();

    document.querySelectorAll(".company-name")
    .forEach(el=>{
      el.innerText = this.getCompanyName();
    });

    document.querySelectorAll(".main-logo")
    .forEach(el=>{
      el.src = this.getMainLogo();
    });

    document.querySelectorAll(".driver-logo")
    .forEach(el=>{
      el.src = this.getDriverLogo();
    });

    document.querySelectorAll(".hero-image")
    .forEach(el=>{
      el.src = this.getHeroImage();
    });

    this.applyThemeEngine();

  },

  applyThemeEngine(){

    const d = this.data || {};

    document.querySelectorAll(".extra-box")
    .forEach(box=>{

      box.style.setProperty("background", d.extraBoxBg || "#ffffff","important");
      box.style.setProperty("border", `${d.extraBoxBorderSize || 2}px solid ${d.extraBoxBorder || "#dbeafe"}`,"important");
      box.style.setProperty("border-radius", `${d.extraBoxRadius || 28}px`,"important");
      box.style.setProperty("padding", `${d.extraBoxPadding || 40}px`,"important");
      box.style.setProperty("text-align", d.extraBoxAlign || "center","important");
      box.style.setProperty("box-shadow",
        d.extraBoxShadow ? "0 12px 35px rgba(0,0,0,.10)" : "none",
        "important"
      );

    });

    document.querySelectorAll(".extra-box h2, .extra-box h3")
    .forEach(title=>{
      title.style.setProperty("color", d.extraBoxTitleColor || "#145cff","important");
      title.style.setProperty("font-size", `${d.extraBoxTitleSize || 32}px`,"important");
    });

    document.querySelectorAll(".extra-box p")
    .forEach(text=>{
      text.style.setProperty("color", d.extraBoxTextColor || "#334155","important");
      text.style.setProperty("font-size", `${d.extraBoxTextSize || 18}px`,"important");
    });

  },

  /* =========================
     FIXED FAST RENDER
  ========================= */

  renderHomepageCards(containerId, lang = "en"){

    const container = document.getElementById(containerId);
    if(!container) return;

    const services = this.getServices();

    let html = "";

    for(let i=0;i<services.length;i++){

      const service = services[i];
      if(!service.active) continue;

      const title =
      lang === "es"
      ? (service.title_es || service.title || "")
      : (service.title_en || service.title || "");

      const desc =
      lang === "es"
      ? (service.description_es || service.description || "")
      : (service.description_en || service.description || "");

      html += `
      <div class="card">

        <img
          src="${service.image || "/assets/logo.png"}"
          class="card-image"
          loading="lazy"
          decoding="async"
        >

        <div class="card-body">
          <h3>${title}</h3>
          <p>${desc}</p>

          <a
            href="${service.link || "getquote/index.html"}"
            class="card-btn"
          >
            ${lang === "es" ? "Obtener precio" : "Get Quote"}
          </a>
        </div>

      </div>
      `;
    }

    container.innerHTML = html;

  }

};