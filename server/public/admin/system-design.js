// =========================================
// FILE: public/admin/system-design.js
// UNIFIED SYSTEM DESIGN ENGINE
// =========================================

console.log("SYSTEM DESIGN LOADED");

let systemDesign = {};

/* =========================
SAVE STORAGE
========================= */

function saveStorage(){

  saveSystemDesign();

}

/* =========================
DEFAULT DATA
========================= */

const defaultSystemDesign = {

  companyName:"Sunbeam Transportation",

  timezone:"America/Phoenix",

  mainLogo:"/assets/logo.png",

  driverLogo:"/assets/logo.png",

  heroImage:"/assets/hero.jpeg",

  aboutTitle:"About Us",

  aboutText:"Professional transportation services.",

  aboutTitleEs:"Sobre Nosotros",

  aboutTextEs:"Servicios profesionales de transporte.",

  quoteTitle:"Get Quote & Book Your Ride",

  quoteText:"Select your service below",

  quoteTitleEs:"Obtenga precio y reserve su viaje",

  quoteTextEs:"Seleccione su servicio abajo",

  extra1Active:true,

  extra1Title:"Extra Information",

  extra1Text:"You can add pricing, announcements, promotions, or company information here.",

  extra1TitleEs:"Información Extra",

  extra1TextEs:"Puede agregar promociones o información aquí.",

  extra2Active:true,

  extra2Title:"Additional Services",

  extra2Text:"This section can later be managed from the admin panel.",

  extra2TitleEs:"Servicios Adicionales",

  extra2TextEs:"Esta sección puede administrarse desde el panel.",

  contactTitle:"Customer Support",

  contactTitleEs:"Atención al Cliente",

  contactPhone:"619-509-7197",

  contactEmail:"admin@sunbeamtransportationllc.com",

  footerText:"©️ Sunbeam Transportation",

  footerTextEs:"©️ Sunbeam Transportation",

  services:[

    {
      id:"standard",
      active:false,

      title:"Standard",

      titleEs:"Estándar",

      description:"Standard transportation service",

      descriptionEs:"Servicio de transporte estándar",

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

      image:"/assets/airport.jpeg",

      link:"getquote/index.html"
    }

  ]

};