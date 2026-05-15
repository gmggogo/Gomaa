/* =========================
GH MOBILITY
GLOBAL BRANDING ENGINE
========================= */

console.log("BRANDING ENGINE LOADED");

window.Branding = {

  data:null,

  async load(){

    try{

      const res =
        await fetch("/api/system-design");

      const json =
        await res.json();

      this.data = json;

      return json;

    }catch(err){

      console.log(
        "BRANDING LOAD ERROR",
        err
      );

      return null;

    }

  },

  getCompanyName(){

    return (
      this.data?.branding?.companyName ||
      "Sunbeam Transportation"
    );

  },

  getMainLogo(){

    return (
      this.data?.branding?.mainLogo ||
      "/assets/logo.png"
    );

  },

  getDriverLogo(){

    return (
      this.data?.branding?.driverLogo ||
      "/assets/logo.png"
    );

  },

  getServices(){

    return (
      this.data?.services || []
    );

  },

  getHomepage(){

    return (
      this.data?.homepage || {}
    );

  }

};