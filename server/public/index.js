console.log("BRANDING ENGINE LOADED");

window.Branding = {

  data:{},

  async load(){
    try{
      const res = await fetch("/api/system-design");
      this.data = await res.json();
    }catch{
      this.data = {};
    }
    return this.data;
  },

  getServices(){
    return this.data?.services || [];
  },

  renderHomepageCards(containerId, lang="en"){

    const container = document.getElementById(containerId);
    if(!container) return;

    const services = this.getServices();

    let html = "";

    for(let i=0;i<services.length;i++){

      const s = services[i];
      if(!s.active) continue;

      const title =
        lang === "es"
        ? (s.title_es || s.title || "")
        : (s.title_en || s.title || "");

      const desc =
        lang === "es"
        ? (s.description_es || s.description || "")
        : (s.description_en || s.description || "");

      const align = s.align || "center";

      html += `
      <div class="card">

        <img
          src="${s.image || "/assets/logo.png"}"
          loading="lazy"
          decoding="async"
        >

        <div class="card-body">

          <h3 class="align-${align}">
            ${title}
          </h3>

          <p class="align-${align}">
            ${desc}
          </p>

          <a href="${s.link || "getquote/index.html"}"
             class="card-btn">
            ${lang === "es" ? "Obtener precio" : "Get Quote"}
          </a>

        </div>

      </div>
      `;
    }

    container.innerHTML = html;
  }

};