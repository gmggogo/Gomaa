// =========================
// FILE: public/core/branding.js
// GH MOBILITY BRANDING ENGINE
// FINAL CLEAN VERSION
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

    this.data?.services ||

    [];

    if(
      Array.isArray(services)
    ){
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

    /* COMPANY NAME */

    document
    .querySelectorAll(
      ".company-name"
    )
    .forEach(el=>{

      el.innerText =
      this.getCompanyName();

    });

    /* MAIN LOGO */

    document
    .querySelectorAll(
      ".main-logo"
    )
    .forEach(img=>{

      img.src =
      this.getMainLogo();

    });

    /* APP LOGO */

    document
    .querySelectorAll(
      ".app-logo"
    )
    .forEach(img=>{

      img.src =
      this.getMainLogo();

    });

    /* DRIVER LOGO */

    document
    .querySelectorAll(
      ".driver-logo"
    )
    .forEach(img=>{

      img.src =
      this.getDriverLogo();

    });

    /* HERO IMAGE */

    document
    .querySelectorAll(
      ".hero-image"
    )
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


    /* ABOUT TITLE */

    document
    .querySelectorAll(".about h2")
    .forEach(el=>{

      el.style.setProperty(
        "color",
        data.aboutTitleColor || "#145cff",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${data.aboutTitleSize || 34}px`,
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

      el.style.setProperty(
        "color",
        data.aboutTextColor || "#334155",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${data.aboutTextSize || 18}px`,
        "important"
      );

      el.style.setProperty(
        "text-align",
        data.aboutTextAlign || "center",
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
        `${data.quotePadding || 40}px`,
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

    /* QUOTE TITLE */

    document
    .querySelectorAll(".quote-header h2")
    .forEach(el=>{

      el.style.setProperty(
        "color",
        data.quoteTitleColor || "#145cff",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${data.quoteTitleSize || 34}px`,
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

      el.style.setProperty(
        "color",
        data.quoteTextColor || "#334155",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${data.quoteTextSize || 18}px`,
        "important"
      );

      el.style.setProperty(
        "text-align",
        data.quoteTextAlign || "center",
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
        `${data.extraBoxRadius || 28}px`,
        "important"
      );

      box.style.setProperty(
        "padding",
        `${data.extraBoxPadding || 44}px`,
        "important"
      );

      box.style.setProperty(
        "text-align",
        data.extraBoxAlign || "center",
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

    /* EXTRA TITLES */

    document
    .querySelectorAll(".extra-box h3")
    .forEach(title=>{

      title.style.setProperty(
        "color",
        data.extraBoxTitleColor || "#145cff",
        "important"
      );

      title.style.setProperty(
        "font-size",
        `${data.extraBoxTitleSize || 42}px`,
        "important"
      );

      title.style.setProperty(
        "text-align",
        data.extraBoxAlign || "center",
        "important"
      );

    });

    /* EXTRA TEXT */

    document
    .querySelectorAll(".extra-box p")
    .forEach(text=>{

      text.style.setProperty(
        "color",
        data.extraBoxTextColor || "#334155",
        "important"
      );

      text.style.setProperty(
        "font-size",
        `${data.extraBoxTextSize || 22}px`,
        "important"
      );

      text.style.setProperty(
        "text-align",
        data.extraBoxAlign || "center",
        "important"
      );

    });

    /* =========================
    SERVICE CARDS
    ========================= */

    document
    .querySelectorAll(".card")
    .forEach(card=>{

      card.style.setProperty(
        "background",
        data.extraBoxBg || "#ffffff",
        "important"
      );

      card.style.setProperty(
        "border",
        `${data.extraBoxBorderSize || 2}px solid ${
          data.extraBoxBorder || "#dbeafe"
        }`,
        "important"
      );

      card.style.setProperty(
        "border-radius",
        `${data.extraBoxRadius || 28}px`,
        "important"
      );

      card.style.setProperty(
        "box-shadow",
        data.extraBoxShadow
        ? "0 10px 30px rgba(0,0,0,.10)"
        : "none",
        "important"
      );

    });

    /* CARD TITLES */

    document
    .querySelectorAll(".card h3")
    .forEach(el=>{

      el.style.setProperty(
        "color",
        data.extraBoxTitleColor || "#1e3a6d",
        "important"
      );

      el.style.setProperty(
        "text-align",
        data.extraBoxAlign || "center",
        "important"
      );

    });

    /* CARD TEXT */

    document
    .querySelectorAll(".card p")
    .forEach(el=>{

      el.style.setProperty(
        "color",
        data.extraBoxTextColor || "#6b7280",
        "important"
      );

      el.style.setProperty(
        "text-align",
        data.extraBoxAlign || "center",
        "important"
      );

    });

    /* CARD BUTTONS */

    document
    .querySelectorAll(".card-btn")
    .forEach(btn=>{

      btn.style.setProperty(
        "background",
        data.buttonColor || "#2563eb",
        "important"
      );

      btn.style.setProperty(
        "color",
        data.buttonTextColor || "#ffffff",
        "important"
      );

    });

// =========================
// FILE: public/core/branding.js
// GH MOBILITY BRANDING ENGINE
// FINAL CLEAN VERSION
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

    this.data?.services ||

    [];

    if(
      Array.isArray(services)
    ){
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

    /* COMPANY NAME */

    document
    .querySelectorAll(
      ".company-name"
    )
    .forEach(el=>{

      el.innerText =
      this.getCompanyName();

    });

    /* MAIN LOGO */

    document
    .querySelectorAll(
      ".main-logo"
    )
    .forEach(img=>{

      img.src =
      this.getMainLogo();

    });

    /* APP LOGO */

    document
    .querySelectorAll(
      ".app-logo"
    )
    .forEach(img=>{

      img.src =
      this.getMainLogo();

    });

    /* DRIVER LOGO */

    document
    .querySelectorAll(
      ".driver-logo"
    )
    .forEach(img=>{

      img.src =
      this.getDriverLogo();

    });

    /* HERO IMAGE */

    document
    .querySelectorAll(
      ".hero-image"
    )
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


    /* ABOUT TITLE */

    document
    .querySelectorAll(".about h2")
    .forEach(el=>{

      el.style.setProperty(
        "color",
        data.aboutTitleColor || "#145cff",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${data.aboutTitleSize || 34}px`,
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

      el.style.setProperty(
        "color",
        data.aboutTextColor || "#334155",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${data.aboutTextSize || 18}px`,
        "important"
      );

      el.style.setProperty(
        "text-align",
        data.aboutTextAlign || "center",
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
        `${data.quotePadding || 40}px`,
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

    /* QUOTE TITLE */

    document
    .querySelectorAll(".quote-header h2")
    .forEach(el=>{

      el.style.setProperty(
        "color",
        data.quoteTitleColor || "#145cff",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${data.quoteTitleSize || 34}px`,
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

      el.style.setProperty(
        "color",
        data.quoteTextColor || "#334155",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${data.quoteTextSize || 18}px`,
        "important"
      );

      el.style.setProperty(
        "text-align",
        data.quoteTextAlign || "center",
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
        `${data.extraBoxRadius || 28}px`,
        "important"
      );

      box.style.setProperty(
        "padding",
        `${data.extraBoxPadding || 44}px`,
        "important"
      );

      box.style.setProperty(
        "text-align",
        data.extraBoxAlign || "center",
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

    /* EXTRA TITLES */

    document
    .querySelectorAll(".extra-box h3")
    .forEach(title=>{

      title.style.setProperty(
        "color",
        data.extraBoxTitleColor || "#145cff",
        "important"
      );

      title.style.setProperty(
        "font-size",
        `${data.extraBoxTitleSize || 42}px`,
        "important"
      );

      title.style.setProperty(
        "text-align",
        data.extraBoxAlign || "center",
        "important"
      );

    });

    /* EXTRA TEXT */

    document
    .querySelectorAll(".extra-box p")
    .forEach(text=>{

      text.style.setProperty(
        "color",
        data.extraBoxTextColor || "#334155",
        "important"
      );

      text.style.setProperty(
        "font-size",
        `${data.extraBoxTextSize || 22}px`,
        "important"
      );

      text.style.setProperty(
        "text-align",
        data.extraBoxAlign || "center",
        "important"
      );

    });

    /* =========================
    SERVICE CARDS
    ========================= */

    document
    .querySelectorAll(".card")
    .forEach(card=>{

      card.style.setProperty(
        "background",
        data.extraBoxBg || "#ffffff",
        "important"
      );

      card.style.setProperty(
        "border",
        `${data.extraBoxBorderSize || 2}px solid ${
          data.extraBoxBorder || "#dbeafe"
        }`,
        "important"
      );

      card.style.setProperty(
        "border-radius",
        `${data.extraBoxRadius || 28}px`,
        "important"
      );

      card.style.setProperty(
        "box-shadow",
        data.extraBoxShadow
        ? "0 10px 30px rgba(0,0,0,.10)"
        : "none",
        "important"
      );

    });

    /* CARD TITLES */

    document
    .querySelectorAll(".card h3")
    .forEach(el=>{

      el.style.setProperty(
        "color",
        data.extraBoxTitleColor || "#1e3a6d",
        "important"
      );

      el.style.setProperty(
        "text-align",
        data.extraBoxAlign || "center",
        "important"
      );

    });

    /* CARD TEXT */

    document
    .querySelectorAll(".card p")
    .forEach(el=>{

      el.style.setProperty(
        "color",
        data.extraBoxTextColor || "#6b7280",
        "important"
      );

      el.style.setProperty(
        "text-align",
        data.extraBoxAlign || "center",
        "important"
      );

    });

    /* CARD BUTTONS */

    document
    .querySelectorAll(".card-btn")
    .forEach(btn=>{

      btn.style.setProperty(
        "background",
        data.buttonColor || "#2563eb",
        "important"
      );

      btn.style.setProperty(
        "color",
        data.buttonTextColor || "#ffffff",
        "important"
      );

    });

/* CONTACT */

document
.querySelectorAll(
  ".contact-section, #contactSection, .contact-box"
)
.forEach(el=>{

  el.style.setProperty(
    "background",
    data.contactBg || "#ffffff",
    "important"
  );

  el.style.setProperty(
    "border",
    `${data.contactBorderSize || 2}px solid ${
      data.contactBorder || "#dbeafe"
    }`,
    "important"
  );

  el.style.setProperty(
    "border-radius",
    `${data.contactRadius || 28}px`,
    "important"
  );

  el.style.setProperty(
    "padding",
    "20px",
    "important"
  );

  el.style.setProperty(
    "display",
    "flex",
    "important"
  );

  el.style.setProperty(
    "flex-direction",
    "column",
    "important"
  );

  el.style.setProperty(
    "align-items",
    data.contactAlign || "center",
    "important"
  );

  el.style.setProperty(
    "justify-content",
    "flex-start",
    "important"
  );

  el.style.setProperty(
    "gap",
    "10px",
    "important"
  );

  el.style.setProperty(
    "box-shadow",
    data.extraBoxShadow
    ? "0 10px 30px rgba(0,0,0,.08)"
    : "none",
    "important"
  );

  el.style.setProperty(
    "color",
    data.contactTextColor || "#6b7280",
    "important"
  );

  el.style.setProperty(
    "text-align",
    data.contactAlign || "center",
    "important"
  );

  el.querySelectorAll("*").forEach(child=>{

    child.style.setProperty(
      "margin",
      "0",
      "important"
    );

  });

});

/* CONTACT TITLE */

document
.querySelectorAll(
  ".contact-section h2, .contact-section h3, .contact-title, #contactTitleView"
)
.forEach(el=>{

  el.style.setProperty(
    "color",
    data.contactTitleColor || "#145cff",
    "important"
  );

  el.style.setProperty(
    "font-size",
    `${data.contactTitleSize || 30}px`,
    "important"
  );

});  

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