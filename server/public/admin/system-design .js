console.log("SYSTEM DESIGN LOADED");

/* =========================
DEFAULT DATA
========================= */

const DEFAULT_SERVICES = [
  {
    key:"nemt",
    active:true,
    image:"assets/nemt.jpeg",
    title_en:"NEMT",
    title_es:"NEMT",
    description_en:"Medical appointments & clinics",
    description_es:"Citas médicas y clínicas"
  },
  {
    key:"airport",
    active:true,
    image:"assets/airport.jpeg",
    title_en:"Airport",
    title_es:"Aeropuerto",
    description_en:"Airport pickup & drop-off",
    description_es:"Traslados al aeropuerto"
  },
  {
    key:"business",
    active:true,
    image:"assets/business.jpeg",
    title_en:"Business",
    title_es:"Negocios",
    description_en:"Corporate & private rides",
    description_es:"Viajes corporativos y privados"
  },
  {
    key:"taxi",
    active:true,
    image:"assets/business.jpeg",
    title_en:"Taxi",
    title_es:"Taxi",
    description_en:"Daily city transportation",
    description_es:"Transporte diario en la ciudad"
  },
  {
    key:"limo",
    active:true,
    image:"assets/business.jpeg",
    title_en:"Limo",
    title_es:"Limusina",
    description_en:"Luxury transportation service",
    description_es:"Servicio de lujo"
  },
  {
    key:"xl",
    active:true,
    image:"assets/business.jpeg",
    title_en:"XL",
    title_es:"XL",
    description_en:"Large family transportation",
    description_es:"Transporte familiar"
  },
  {
    key:"wheelchair",
    active:true,
    image:"assets/nemt.jpeg",
    title_en:"Wheelchair",
    title_es:"Silla de ruedas",
    description_en:"Wheelchair accessible rides",
    description_es:"Viajes accesibles"
  },
  {
    key:"shared",
    active:true,
    image:"assets/airport.jpeg",
    title_en:"Shared Ride",
    title_es:"Viaje compartido",
    description_en:"Affordable shared rides",
    description_es:"Viajes compartidos económicos"
  }
];

/* =========================
HELPERS
========================= */

function getSavedDesign(){

  try{
    return JSON.parse(
      localStorage.getItem("ghSystemDesign") || "{}"
    );
  }catch{
    return {};
  }

}

function saveDesignObject(data){

  localStorage.setItem(
    "ghSystemDesign",
    JSON.stringify(data)
  );

}

function readFileAsDataURL(input, callback){

  const file = input.files[0];

  if(!file) return;

  const reader = new FileReader();

  reader.onload = e => {
    callback(e.target.result);
  };

  reader.readAsDataURL(file);

}

/* =========================
LOAD HEADER
========================= */

document.addEventListener("DOMContentLoaded", async ()=>{

  if(typeof loadHeader === "function"){
    loadHeader("System Design");
  }

  initSystemDesign();

});

/* =========================
INIT
========================= */

function initSystemDesign(){

  const saved = getSavedDesign();

  const branding = saved.branding || {};
  const homepage = saved.homepage || {};
  const cards = saved.services || DEFAULT_SERVICES;

  /* BRANDING */

  companyNameInput.value =
    branding.companyName ||
    localStorage.getItem("appCompanyName") ||
    "Sunbeam Transportation";

  timezoneInput.value =
    branding.timezone ||
    localStorage.getItem("systemTimezone") ||
    "America/Phoenix";

  mainLogoPreview.src =
    branding.mainLogo ||
    localStorage.getItem("appLogo") ||
    "/assets/logo.png";

  driverLogoPreview.src =
    branding.driverLogo ||
    localStorage.getItem("driverLogo") ||
    "/assets/logo.png";

  /* HOMEPAGE */

  heroImagePreview.src =
    homepage.heroImage ||
    "assets/hero.jpeg";

  extra1Title.value =
    homepage.extra1Title ||
    "Extra Information";

  extra1Text.value =
    homepage.extra1Text ||
    "";

  extra2Title.value =
    homepage.extra2Title ||
    "Additional Services";

  extra2Text.value =
    homepage.extra2Text ||
    "";

  extra1Active.checked =
    homepage.extra1Active !== false;

  extra2Active.checked =
    homepage.extra2Active !== false;

  /* CARDS */

  renderCardsEditor(cards);

  bindUploads();

}

/* =========================
UPLOADS
========================= */

function bindUploads(){

  mainLogoInput.addEventListener("change", ()=>{

    readFileAsDataURL(mainLogoInput, data=>{

      mainLogoPreview.src = data;

      localStorage.setItem("appLogo", data);

      autoSaveSystemDesign();

    });

  });

  driverLogoInput.addEventListener("change", ()=>{

    readFileAsDataURL(driverLogoInput, data=>{

      driverLogoPreview.src = data;

      localStorage.setItem("driverLogo", data);

      autoSaveSystemDesign();

    });

  });

  heroImageInput.addEventListener("change", ()=>{

    readFileAsDataURL(heroImageInput, data=>{

      heroImagePreview.src = data;

      autoSaveSystemDesign();

    });

  });

}

/* =========================
CARDS EDITOR
========================= */

function renderCardsEditor(cards){

  const box =
    document.getElementById("cardsEditor");

  box.innerHTML = "";

  cards.forEach((card,index)=>{

    const div =
      document.createElement("div");

    div.className =
      "service-card";

    div.innerHTML = `

      <div class="service-top">

        <div class="service-title">
          ${card.title_en || "Service"}
        </div>

        <div class="toggle-row">
          <input
            type="checkbox"
            id="cardActive-${index}"
            ${card.active ? "checked" : ""}
          >
          <label>Active</label>
        </div>

      </div>

      <div class="input-group">

        <label>Card Image</label>

        <img
          id="cardImagePreview-${index}"
          class="preview-image"
          src="${card.image || ""}"
        >

        <input
          type="file"
          id="cardImageInput-${index}"
          hidden
          accept="image/*"
        >

        <button
          class="upload-btn"
          type="button"
          onclick="document.getElementById('cardImageInput-${index}').click()"
        >
          Upload Card Image
        </button>

      </div>

      <div class="input-group">
        <label>Title EN</label>
        <input type="text" id="cardTitleEn-${index}" value="${card.title_en || ""}">
      </div>

      <div class="input-group">
        <label>Title ES</label>
        <input type="text" id="cardTitleEs-${index}" value="${card.title_es || ""}">
      </div>

      <div class="input-group">
        <label>Description EN</label>
        <textarea id="cardDescEn-${index}">${card.description_en || ""}</textarea>
      </div>

      <div class="input-group">
        <label>Description ES</label>
        <textarea id="cardDescEs-${index}">${card.description_es || ""}</textarea>
      </div>

    `;

    box.appendChild(div);

    const imgInput =
      document.getElementById(`cardImageInput-${index}`);

    imgInput.addEventListener("change",()=>{

      readFileAsDataURL(imgInput,data=>{

        document.getElementById(
          `cardImagePreview-${index}`
        ).src = data;

        autoSaveSystemDesign();

      });

    });

  });

}

/* =========================
COLLECT DATA
========================= */

function collectSystemDesign(){

  const currentSaved =
    getSavedDesign();

  const services = DEFAULT_SERVICES.map((old,index)=>{

    const preview =
      document.getElementById(
        `cardImagePreview-${index}`
      );

    return {
      key:old.key,

      active:
      document.getElementById(
        `cardActive-${index}`
      ).checked,

      image:
      preview?.src || old.image,

      title_en:
      document.getElementById(
        `cardTitleEn-${index}`
      ).value,

      title_es:
      document.getElementById(
        `cardTitleEs-${index}`
      ).value,

      description_en:
      document.getElementById(
        `cardDescEn-${index}`
      ).value,

      description_es:
      document.getElementById(
        `cardDescEs-${index}`
      ).value
    };

  });

  return {

    branding:{
      companyName:
      companyNameInput.value,

      timezone:
      timezoneInput.value,

      mainLogo:
      mainLogoPreview.src,

      driverLogo:
      driverLogoPreview.src
    },

    homepage:{
      heroImage:
      heroImagePreview.src,

      extra1Title:
      extra1Title.value,

      extra1Text:
      extra1Text.value,

      extra1Active:
      extra1Active.checked,

      extra2Title:
      extra2Title.value,

      extra2Text:
      extra2Text.value,

      extra2Active:
      extra2Active.checked
    },

    services,

    updatedAt:
    new Date().toISOString(),

    old:
    currentSaved.old || null

  };

}

/* =========================
SAVE
========================= */

function saveSystemDesign(){

  const data =
    collectSystemDesign();

  saveDesignObject(data);

  localStorage.setItem(
    "appCompanyName",
    data.branding.companyName
  );

  localStorage.setItem(
    "companyName",
    data.branding.companyName
  );

  localStorage.setItem(
    "systemTimezone",
    data.branding.timezone
  );

  localStorage.setItem(
    "appTimezone",
    data.branding.timezone
  );

  localStorage.setItem(
    "appLogo",
    data.branding.mainLogo
  );

  localStorage.setItem(
    "driverLogo",
    data.branding.driverLogo
  );

  alert("System Design Saved Successfully");

}

/* =========================
AUTO SAVE
========================= */

function autoSaveSystemDesign(){

  const data =
    collectSystemDesign();

  saveDesignObject(data);

}

/* =========================
RESET
========================= */

function resetSystemDesign(){

  const ok =
    confirm("Reset system design settings?");

  if(!ok) return;

  localStorage.removeItem("ghSystemDesign");
  localStorage.removeItem("appLogo");
  localStorage.removeItem("driverLogo");
  localStorage.removeItem("appCompanyName");
  localStorage.removeItem("companyName");
  localStorage.removeItem("systemTimezone");
  localStorage.removeItem("appTimezone");

  location.reload();

}