// =========================
// ADD THIS INSIDE
// defaultSystemDesign
// =========================

aboutTitleEs:"Sobre Nosotros",

aboutTextEs:"Servicios profesionales de transporte.",

quoteTitleEs:"Obtenga precio y reserve su viaje",

quoteTextEs:"Seleccione el servicio abajo",

extra1TitleEs:"Información Extra",

extra1TextEs:"Puede agregar promociones o información aquí.",

extra2TitleEs:"Servicios Adicionales",

extra2TextEs:"Esta sección puede administrarse desde el panel.",

contactTitleEs:"Atención al Cliente",

footerTextEs:"©️ Sunbeam Transportation",

services:[

  {
    id:"standard",
    active:false,

    title:"Standard",
    titleEs:"Estándar",

    description:"Standard transportation service",

    descriptionEs:"Servicio de transporte estándar",

    buttonEs:"Obtener precio",

    image:"/assets/business.jpeg",

    link:"getquote/index.html"
  },

  {
    id:"xl",
    active:false,

    title:"XL",
    titleEs:"XL",

    description:"Large vehicle transportation",

    descriptionEs:"Transporte de vehículos grandes",

    buttonEs:"Obtener precio",

    image:"/assets/business.jpeg",

    link:"getquote/index.html"
  },

  {
    id:"taxi",
    active:false,

    title:"Taxi",
    titleEs:"Taxi",

    description:"Daily city transportation",

    descriptionEs:"Transporte diario en la ciudad",

    buttonEs:"Obtener precio",

    image:"/assets/business.jpeg",

    link:"getquote/index.html"
  },

  {
    id:"limo",
    active:false,

    title:"Limo",
    titleEs:"Limusina",

    description:"Luxury transportation service",

    descriptionEs:"Servicio de transporte de lujo",

    buttonEs:"Obtener precio",

    image:"/assets/business.jpeg",

    link:"getquote/index.html"
  },

  {
    id:"wheelchair",
    active:false,

    title:"Wheelchair",
    titleEs:"Silla de ruedas",

    description:"Wheelchair accessible rides",

    descriptionEs:"Viajes accesibles para silla de ruedas",

    buttonEs:"Obtener precio",

    image:"/assets/nemt.jpeg",

    link:"getquote/index.html"
  },

  {
    id:"shared",
    active:false,

    title:"Shared Ride",
    titleEs:"Viaje Compartido",

    description:"Affordable shared rides",

    descriptionEs:"Viajes compartidos económicos",

    buttonEs:"Obtener precio",

    image:"/assets/airport.jpeg",

    link:"getquote/index.html"
  }

]

// =========================
// ADD INSIDE
// loadFormValues()
// =========================

setValue(
  "aboutTitleEsInput",
  systemDesign.aboutTitleEs
);

setValue(
  "aboutTextEsInput",
  systemDesign.aboutTextEs
);

setValue(
  "quoteTitleEsInput",
  systemDesign.quoteTitleEs
);

setValue(
  "quoteTextEsInput",
  systemDesign.quoteTextEs
);

setValue(
  "extra1TitleEs",
  systemDesign.extra1TitleEs
);

setValue(
  "extra1TextEs",
  systemDesign.extra1TextEs
);

setValue(
  "extra2TitleEs",
  systemDesign.extra2TitleEs
);

setValue(
  "extra2TextEs",
  systemDesign.extra2TextEs
);

setValue(
  "contactTitleEsInput",
  systemDesign.contactTitleEs
);

setValue(
  "footerTextEsInput",
  systemDesign.footerTextEs
);

// =========================
// ADD INSIDE
// saveAllSystemDesign()
// =========================

systemDesign.aboutTitleEs =
document.getElementById(
  "aboutTitleEsInput"
)?.value || "";

systemDesign.aboutTextEs =
document.getElementById(
  "aboutTextEsInput"
)?.value || "";

systemDesign.quoteTitleEs =
document.getElementById(
  "quoteTitleEsInput"
)?.value || "";

systemDesign.quoteTextEs =
document.getElementById(
  "quoteTextEsInput"
)?.value || "";

systemDesign.extra1TitleEs =
document.getElementById(
  "extra1TitleEs"
)?.value || "";

systemDesign.extra1TextEs =
document.getElementById(
  "extra1TextEs"
)?.value || "";

systemDesign.extra2TitleEs =
document.getElementById(
  "extra2TitleEs"
)?.value || "";

systemDesign.extra2TextEs =
document.getElementById(
  "extra2TextEs"
)?.value || "";

systemDesign.contactTitleEs =
document.getElementById(
  "contactTitleEsInput"
)?.value || "";

systemDesign.footerTextEs =
document.getElementById(
  "footerTextEsInput"
)?.value || "";

// =========================
// ADD INSIDE
// renderCardsEditor()
// AFTER SERVICE NAME
// =========================

<div class="input-group">

  <label>

    Service Name Spanish

  </label>

  <input
    type="text"
    id="titleEs-${index}"
    value="${service.titleEs || ""}"
  >

</div>

// =========================
// ADD INSIDE
// renderCardsEditor()
// AFTER DESCRIPTION
// =========================

<div class="input-group">

  <label>

    Description Spanish

  </label>

  <textarea
    id="descEs-${index}"
  >${service.descriptionEs || ""}</textarea>

</div>

// =========================
// ADD INSIDE
// saveCard()
// =========================

systemDesign.services[index].titleEs =
document.getElementById(
  `titleEs-${index}`
).value;

systemDesign.services[index].descriptionEs =
document.getElementById(
  `descEs-${index}`
).value;