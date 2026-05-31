/* =========================================
FILE: public/core/pricing-engine-company.js
SUNBEAM COMPANY PRICING ENGINE
========================================= */

window.CompanyPricing = {

  /* =========================
     SETTINGS
  ========================= */

  getSettings(service){

    return {

      pricingMode:
        String(
          service?.companyPricingMode ||
          service?.pricingMode ||
          "MILE"
        ).toUpperCase(),

      baseFare:
        Number(
          service?.companyBaseFare ??
          service?.baseFare ??
          0
        ),

      sharedPrice:
        Number(
          service?.companySharedPrice ??
          service?.sharedPrice ??
          0
        ),

      includedMiles:
        Number(
          service?.companyIncludedMiles ??
          service?.includedMiles ??
          0
        ),

      perMile:
        Number(
          service?.companyPerMile ??
          service?.perMile ??
          0
        ),

      stopFee:
        Number(
          service?.companyStopFee ??
          service?.stopFee ??
          0
        ),

      noShowFee:
        Number(
          service?.companyNoShowFee ??
          service?.noShowFee ??
          0
        ),

      cancelFee:
        Number(
          service?.companyCancelFee ??
          service?.cancelFee ??
          0
        ),

      warningMinutes:
        Number(
          service?.companyWarningMinutes ??
          service?.warningMinutes ??
          120
        ),

      hourlyRate:
        Number(
          service?.companyHourlyRate ??
          service?.hourlyRate ??
          0
        ),

      hourlyBillingMode:
        String(
          service?.companyHourlyBillingMode ??
          service?.hourlyBillingMode ??
          "FULL"
        ).toUpperCase()

    };

  },

  /* =========================
     MASTER CALCULATOR
  ========================= */

  calculate(service,data = {}){

    const cfg =
      this.getSettings(service);

    switch(cfg.pricingMode){

      case "SHARED":
        return this.calculateShared(
          service,
          data
        );

      case "HOURLY":
        return this.calculateHourly(
          service,
          data
        );

      default:
        return this.calculateMile(
          service,
          data
        );

    }

  },

  /* =========================
     MILE
  ========================= */

  calculateMile(
    service,
    {
      miles = 0,
      stopsCount = 0
    } = {}
  ){

    const cfg =
      this.getSettings(service);

    const totalMiles =
      Number(miles || 0);

    const extraMiles =
      Math.max(
        0,
        totalMiles -
        cfg.includedMiles
      );

    const total =

      cfg.baseFare +

      (
        extraMiles *
        cfg.perMile
      ) +

      (
        Number(stopsCount || 0) *
        cfg.stopFee
      );

    return {

      pricingMode:"MILE",

      total:
        Number(
          total.toFixed(2)
        ),

      miles:
        totalMiles,

      extraMiles

    };

  },

  /* =========================
     HOURLY
  ========================= */

  calculateHourly(
    service,
    {
      minutes = 0
    } = {}
  ){

    const cfg =
      this.getSettings(service);

    const totalMinutes =
      Number(minutes || 0);

    let hours = 1;

    if(
      cfg.hourlyBillingMode ===
      "QUARTER"
    ){

      hours =
        Math.max(
          1,
          Math.ceil(
            totalMinutes / 15
          ) / 4
        );

    }else{

      hours =
        Math.max(
          1,
          Math.ceil(
            totalMinutes / 60
          )
        );

    }

    const total =
      hours *
      cfg.hourlyRate;

    return {

      pricingMode:"HOURLY",

      total:
        Number(
          total.toFixed(2)
        ),

      hours

    };

  },

  /* =========================
     SHARED
  ========================= */

  calculateShared(
    service,
    {
      passengers = [],
      miles = 0,
      stopsCount = 0
    } = {}
  ){

    const cfg =
      this.getSettings(service);

    const activePassengers =
      passengers.filter(p=>{

        const s =
          String(
            p?.status || ""
          ).toLowerCase();

        return (
          !s.includes("no") &&
          !s.includes("cancel")
        );

      });

    const noShowPassengers =
      passengers.filter(p=>{

        const s =
          String(
            p?.status || ""
          ).toLowerCase();

        return (
          s.includes("no")
        );

      });

    const activeCount =
      activePassengers.length;

    if(activeCount === 0){

      const total =
        noShowPassengers.length *
        cfg.noShowFee;

      return {

        pricingMode:"SHARED",

        total:
          Number(
            total.toFixed(2)
          ),

        pricePerPassenger:0,

        activeCount:0

      };

    }

    const totalMiles =
      Number(miles || 0);

    const freeMiles =
      activeCount *
      cfg.includedMiles;

    const extraMiles =
      Math.max(
        0,
        totalMiles -
        freeMiles
      );

  const activeTotal =

(
  activeCount *
  (
    cfg.sharedPrice > 0
      ? cfg.sharedPrice
      : cfg.baseFare
  )
) +

(
  extraMiles *
  cfg.perMile
) +

(
  Number(stopsCount || 0) *
  cfg.stopFee
);

    const noShowTotal =

      noShowPassengers.length *
      cfg.noShowFee;

    const grandTotal =
      activeTotal +
      noShowTotal;

    return {

      pricingMode:"SHARED",

      total:
        Number(
          grandTotal.toFixed(2)
        ),

      activeTotal:
        Number(
          activeTotal.toFixed(2)
        ),

      noShowTotal:
        Number(
          noShowTotal.toFixed(2)
        ),

      pricePerPassenger:
        Number(
          (
            activeTotal /
            activeCount
          ).toFixed(2)
        ),

      activeCount,

      freeMiles,

      extraMiles

    };

  },

  /* =========================
     CANCEL
  ========================= */

  calculateCancelFee(
    service,
    minutesToTrip
  ){

    const cfg =
      this.getSettings(service);

    if(
      minutesToTrip > 0 &&
      minutesToTrip <=
      cfg.warningMinutes
    ){

      return Number(
        cfg.cancelFee
      );

    }

    return 0;

  },

  /* =========================
     SNAPSHOT
  ========================= */

  buildPricingSnapshot(
    service,
    miles,
    finalPrice
  ){

    const cfg =
      this.getSettings(service);

    return {

      serviceId:
        service?._id || "",

      serviceName:
        service?.title ||
        service?.name ||
        "",

      serviceCode:
        service?.serviceKey ||
        service?.companySuffix ||
        "",

      pricingMode:
        cfg.pricingMode,

      miles:
        Number(
          miles || 0
        ),

      finalPrice:
        Number(
          finalPrice || 0
        ),

      settings:cfg,

      createdAt:
        new Date()
        .toISOString()

    };

  }

};