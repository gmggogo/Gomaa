console.log("SYSTEM DESIGN LOADED");

/* =========================
DEFAULT SERVICES
========================= */

const DEFAULT_SERVICES = [

  {
    key:"nemt",
    active:true,
    image:"/assets/nemt.jpeg",
    title_en:"NEMT",
    title_es:"NEMT",
    description_en:"Medical appointments & clinics",
    description_es:"Citas médicas y clínicas"
  },

  {
    key:"airport",
    active:true,
    image:"/assets/airport.jpeg",
    title_en:"Airport",
    title_es:"Aeropuerto",
    description_en:"Airport pickup & drop-off",
    description_es:"Traslados al aeropuerto"
  },

  {
    key:"business",
    active:true,
    image:"/assets/business.jpeg",
    title_en:"Business",
    title_es:"Negocios",
    description_en:"Corporate rides",
    description_es:"Viajes corporativos"
  },

  {
    key:"taxi",
    active:true,
    image:"/assets/business.jpeg",
    title_en:"Taxi",
    title_es:"Taxi",
    description_en:"City transportation",
    description_es:"Transporte urbano"
  },

  {
    key:"limo",
    active:true,
    image:"/assets/business.jpeg",
    title_en:"Limo",
    title_es:"Limusina",
    description_en:"Luxury transportation",
    description_es:"Servicio de lujo"
  },

  {
    key:"xl",
    active:true,
    image:"/assets/business.jpeg",
    title_en:"XL",
    title_es:"XL",
    description_en:"Large family rides",
    description_es:"Viajes familiares"
  },

  {
    key:"wheelchair",
    active:true,
    image:"/assets/nemt.jpeg",
    title_en:"Wheelchair",
    title_es:"Silla de ruedas",
    description_en:"Wheelchair accessible",
    description_es:"Accesible"
  },

  {
    key:"shared",
    active:true,
    image:"/assets/airport.jpeg",
    title_en:"Shared Ride",
    title_es:"Viaje compartido",
    description_en:"Affordable shared rides",
    description_es:"Viajes compartidos"
  }

];

/* =========================
ELEMENTS
========================= */

const companyNameInput =
document.getElementById("companyNameInput");

const timezoneInput =
document.getElementById("timezoneInput");

const mainLogoInput =
document.getElementById("mainLogoInput");

const driverLogoInput =
document.getElementById("driverLogoInput");

const heroImageInput =
document.getElementById("heroImageInput");

const mainLogoPreview =
document.getElementById("mainLogoPreview");

const driverLogoPreview =
document.getElementById("driverLogoPreview");

const heroImagePreview =
document.getElementById("heroImagePreview");

const extra1Title =
document.getElementById("extra1Title");

const extra1Text =
document.getElementById("extra1Text");

const extra2Title =
document.getElementById("extra2Title");

const extra2Text =
document.getElementById("extra2Text");

const extra1Active =
document.getElementById("extra1Active");

const extra2Active =
document.getElementById("extra2Active");

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
START
========================= */

document.addEventListener(
"DOMContentLoaded",
()=>{

  initSystemDesign();

}
);

/* =========================
INIT
========================= */

function initSystemDesign(){

  const saved =
  getSavedDesign();

  const branding =
  saved.branding || {};

  const homepage =
  saved.homepage || {};

  const services =
  saved.services || DEFAULT_SERVICES;

  /* BRANDING */

  if(companyNameInput){

    companyNameInput.value =
    branding.companyName ||
    "Sunbeam Transportation";

  }

  if(timezoneInput){

    timezoneInput.value =
    branding.timezone ||
    "America/Phoenix";

  }

  if(mainLogoPreview){

    mainLogoPreview.src =
    branding.mainLogo ||
    "/assets/logo.png";

  }

  if(driverLogoPreview){

    driverLogoPreview.src =
    branding.driverLogo ||
    "/assets/logo.png";

  }

  /* HOMEPAGE */

  if(heroImagePreview){

    heroImagePreview.src =
    homepage.heroImage ||
    "/assets/hero.jpeg";

  }

  if(extra1Title){

    extra1Title.value =
    homepage.extra1Title || "";

  }

  if(extra1Text){

    extra1Text.value =
    homepage.extra1Text || "";

  }

  if(extra2Title){

    extra2Title.value =
    homepage.extra2Title || "";

  }

  if(extra2Text){

    extra2Text.value =
    homepage.extra2Text || "";

  }

  if(extra1Active){

    extra1Active.checked =
    homepage.extra1Active !== false;

  }

  if(extra2Active){

    extra2Active.checked =
    homepage.extra2Active !== false;

  }

  renderCardsEditor(services);

  bindUploads();

}

/* =========================
UPLOADS
========================= */

function bindUploads(){

  if(mainLogoInput){

    mainLogoInput.addEventListener(
    "change",
    ()=>{

      readFileAsDataURL(
      mainLogoInput,
      data=>{

        mainLogoPreview.src = data;

        autoSaveSystemDesign();

      });

    });

  }

  if(driverLogoInput){

    driverLogoInput.addEventListener(
    "change",
    ()=>{

      readFileAsDataURL(
      driverLogoInput,
      data=>{

        driverLogoPreview.src = data;

        autoSaveSystemDesign();

      });

    });

  }

  if(heroImageInput){

    heroImageInput.addEventListener(
    "change",
    ()=>{

      readFileAsDataURL(
      heroImageInput,
      data=>{

        heroImagePreview.src = data;

        autoSaveSystemDesign();

      });

    });

  }

}

/* =========================
RENDER CARDS
========================= */

function renderCardsEditor(cards){

  const box =
  document.getElementById("cardsEditor");

  if(!box) return;

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

          <label>
            Active
          </label>

        </div>

      </div>

      <div class="input-group">

        <label>
          Card Image
        </label>

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
          onclick="
            document
            .getElementById(
              'cardImageInput-${index}'
            )
            .click()
          "
        >
          Upload Card Image
        </button>

      </div>

      <div class="input-group">

        <label>
          Title EN
        </label>

        <input
          type="text"
          id="cardTitleEn-${index}"
          value="${card.title_en || ""}"
        >

      </div>

      <div class="input-group">

        <label>
          Title ES
        </label>

        <input
          type="text"
          id="cardTitleEs-${index}"
          value="${card.title_es || ""}"
        >

      </div>

      <div class="input-group">

        <label>
          Description EN
        </label>

        <textarea
          id="cardDescEn-${index}"
        >${card.description_en || ""}</textarea>

      </div>

      <div class="input-group">

        <label>
          Description ES
        </label>

        <textarea
          id="cardDescEs-${index}"
        >${card.description_es || ""}</textarea>

      </div>

    `;

    box.appendChild(div);

    const imageInput =
    document.getElementById(
      `cardImageInput-${index}`
    );

    imageInput.addEventListener(
    "change",
    ()=>{

      readFileAsDataURL(
      imageInput,
      data=>{

        document.getElementById(
          `cardImagePreview-${index}`
        ).src = data;

        autoSaveSystemDesign();

      });

    });

  });

}

/* =========================
COLLECT
========================= */

function collectSystemDesign(){

  const services =
  DEFAULT_SERVICES.map((old,index)=>{

    return {

      key:old.key,

      active:
      document.getElementById(
        `cardActive-${index}`
      )?.checked || false,

      image:
      document.getElementById(
        `cardImagePreview-${index}`
      )?.src || "",

      title_en:
      document.getElementById(
        `cardTitleEn-${index}`
      )?.value || "",

      title_es:
      document.getElementById(
        `cardTitleEs-${index}`
      )?.value || "",

      description_en:
      document.getElementById(
        `cardDescEn-${index}`
      )?.value || "",

      description_es:
      document.getElementById(
        `cardDescEs-${index}`
      )?.value || ""

    };

  });

  return {

    branding:{

      companyName:
      companyNameInput?.value || "",

      timezone:
      timezoneInput?.value || "",

      mainLogo:
      mainLogoPreview?.src || "",

      driverLogo:
      driverLogoPreview?.src || ""

    },

    homepage:{

      heroImage:
      heroImagePreview?.src || "",

      extra1Title:
      extra1Title?.value || "",

      extra1Text:
      extra1Text?.value || "",

      extra1Active:
      extra1Active?.checked || false,

      extra2Title:
      extra2Title?.value || "",

      extra2Text:
      extra2Text?.value || "",

      extra2Active:
      extra2Active?.checked || false

    },

    services,

    updatedAt:
    new Date().toISOString()

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
    "appLogo",
    data.branding.mainLogo
  );

  localStorage.setItem(
    "driverLogo",
    data.branding.driverLogo
  );

  localStorage.setItem(
    "companyName",
    data.branding.companyName
  );

  localStorage.setItem(
    "appCompanyName",
    data.branding.companyName
  );

  alert(
    "System Design Saved Successfully"
  );

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
  confirm(
    "Reset System Design Settings?"
  );

  if(!ok) return;

  localStorage.removeItem(
    "ghSystemDesign"
  );

  localStorage.removeItem(
    "appLogo"
  );

  localStorage.removeItem(
    "driverLogo"
  );

  localStorage.removeItem(
    "companyName"
  );

  localStorage.removeItem(
    "appCompanyName"
  );

  location.reload();

}