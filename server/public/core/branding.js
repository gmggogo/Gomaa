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

    /* EXTRA BOXES */

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
        `${mobile ? 16 : (data.extraBoxPadding || 44)}px`,
        "important"
      );

      box.style.setProperty(
        "text-align",
        data.extraBoxAlign || "center",
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

    /* EXTRA TITLES */

    document
    .querySelectorAll(".extra-box h3")
    .forEach(title=>{

      const size =
      mobile
      ? 22
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
        "line-height",
        mobile ? "1.3" : "1.2",
        "important"
      );

      title.style.setProperty(
        "margin-bottom",
        mobile ? "10px" : "22px",
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

      const size =
      mobile
      ? 15
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
        "line-height",
        mobile ? "1.75" : "2",
        "important"
      );

      text.style.setProperty(
        "text-align",
        data.extraBoxAlign || "center",
        "important"
      );

    });

    /* SERVICE CARDS */

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
        `${mobile ? 20 : (data.extraBoxRadius || 28)}px`,
        "important"
      );

      card.style.setProperty(
        "box-shadow",
        mobile
        ? "0 4px 10px rgba(0,0,0,.06)"
        : (
          data.extraBoxShadow
          ? "0 10px 30px rgba(0,0,0,.10)"
          : "none"
        ),
        "important"
      );

      if(mobile){

        card.style.setProperty(
          "transition",
          "none",
          "important"
        );

        card.style.setProperty(
          "transform",
          "none",
          "important"
        );

      }

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

      if(mobile){

        el.style.setProperty(
          "font-size",
          "24px",
          "important"
        );

        el.style.setProperty(
          "line-height",
          "1.3",
          "important"
        );

      }

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

      if(mobile){

        el.style.setProperty(
          "font-size",
          "15px",
          "important"
        );

        el.style.setProperty(
          "line-height",
          "1.8",
          "important"
        );

        el.style.setProperty(
          "min-height",
          "auto",
          "important"
        );

      }

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

      if(mobile){

        btn.style.setProperty(
          "font-size",
          "16px",
          "important"
        );

        btn.style.setProperty(
          "height",
          "50px",
          "important"
        );

      }

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
        `${mobile ? 36 : 20}px 14px`,
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
        mobile ? "8px" : "10px",
        "important"
      );

      el.style.setProperty(
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

      el.style.setProperty(
        "color",
        data.contactTextColor || "#6b7280",
        "important"
      );

      el.style.setProperty(
        "font-size",
        mobile ? "15px" : "24px",
        "important"
      );

      el.style.setProperty(
        "line-height",
        mobile ? "1.8" : "2",
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

      const size =
      mobile
      ? 24
      : Number(data.contactTitleSize || 30);

      el.style.setProperty(
        "color",
        data.contactTitleColor || "#145cff",
        "important"
      );

      el.style.setProperty(
        "font-size",
        `${size}px`,
        "important"
      );

      el.style.setProperty(
        "line-height",
        "1.3",
        "important"
      );

      el.style.setProperty(
        "margin-bottom",
        mobile ? "10px" : "0",
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