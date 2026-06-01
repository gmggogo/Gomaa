/* =========================================
FILE: public/core/pricing-engine-company.js
SUNBEAM COMPANY PRICING ENGINE
FINAL FIXED VERSION
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
          service?.companyBaseFare ??
          service?.baseFare ??
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

    if(cfg.pricingMode === "SHARED"){
      return this.calculateShared(service,data);
    }

    if(cfg.pricingMode === "HOURLY"){
      return this.calculateHourly(service,data);
    }

    return this.calculateMile(service,data);

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
        totalMiles - cfg.includedMiles
      );

    const baseTotal =
      cfg.baseFare;

    const mileageTotal =
      extraMiles * cfg.perMile;

    const stopsTotal =
      Number(stopsCount || 0) * cfg.stopFee;

    const total =
      baseTotal + mileageTotal + stopsTotal;

    return {

      pricingMode:"MILE",

      total:Number(total.toFixed(2)),

      baseTotal:Number(baseTotal.toFixed(2)),

      mileageTotal:Number(mileageTotal.toFixed(2)),

      stopsTotal:Number(stopsTotal.toFixed(2)),

      miles:totalMiles,

      includedMiles:cfg.includedMiles,

      extraMiles:Number(extraMiles.toFixed(2))

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

    if(cfg.hourlyBillingMode === "QUARTER"){

      hours =
        Math.max(
          1,
          Math.ceil(totalMinutes / 15) / 4
        );

    }else{

      hours =
        Math.max(
          1,
          Math.ceil(totalMinutes / 60)
        );

    }

    const total =
      hours * cfg.hourlyRate;

    return {

      pricingMode:"HOURLY",

      total:Number(total.toFixed(2)),

      hours,

      hourlyRate:cfg.hourlyRate

    };

  },

  /* =========================
     SHARED
     RULES:
     - Active passenger = base/shared fare per passenger
     - Active included miles = active passengers × includedMiles
     - Extra miles charged once on total route
     - Stops charged once per shared route
     - No Show charged per no-show passenger
     - Cancel charged per cancelled passenger
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

    const allPassengers =
      Array.isArray(passengers)
        ? passengers
        : [];

    const activePassengers =
      allPassengers.filter(p=>{

        const s =
          String(p?.status || "")
          .toLowerCase();

        return (
          !s.includes("no") &&
          !s.includes("cancel")
        );

      });

    const noShowPassengers =
      allPassengers.filter(p=>{

        const s =
          String(p?.status || "")
          .toLowerCase();

        return s.includes("no");

      });

    const cancelledPassengers =
      allPassengers.filter(p=>{

        const s =
          String(p?.status || "")
          .toLowerCase();

        return s.includes("cancel");

      });

    const activeCount =
      activePassengers.length;

    const noShowCount =
      noShowPassengers.length;

    const cancelledCount =
      cancelledPassengers.length;

    const totalPassengers =
      allPassengers.length;

    const passengerFare =
      Number(
        cfg.sharedPrice ||
        cfg.baseFare ||
        0
      );

    const totalMiles =
      Number(miles || 0);

    const includedMilesTotal =
      activeCount * cfg.includedMiles;

    const extraMiles =
      Math.max(
        0,
        totalMiles - includedMilesTotal
      );

    const activeBaseTotal =
      activeCount * passengerFare;

    const mileageTotal =
      extraMiles * cfg.perMile;

    const stopsTotal =
      Number(stopsCount || 0) * cfg.stopFee;

    const noShowTotal =
      noShowCount * cfg.noShowFee;

    const cancelTotal =
      cancelledCount * cfg.cancelFee;

    const activeTotal =
      activeBaseTotal +
      mileageTotal +
      stopsTotal;

    const grandTotal =
      activeTotal +
      noShowTotal +
      cancelTotal;

    return {

      pricingMode:"SHARED",

      total:Number(grandTotal.toFixed(2)),

      activeTotal:Number(activeTotal.toFixed(2)),

      activeBaseTotal:Number(activeBaseTotal.toFixed(2)),

      mileageTotal:Number(mileageTotal.toFixed(2)),

      stopsTotal:Number(stopsTotal.toFixed(2)),

      noShowTotal:Number(noShowTotal.toFixed(2)),

      cancelTotal:Number(cancelTotal.toFixed(2)),

      pricePerPassenger:
        activeCount > 0
          ? Number((activeTotal / activeCount).toFixed(2))
          : 0,

      passengerFare:Number(passengerFare.toFixed(2)),

      activeCount,

      noShowCount,

      cancelledCount,

      totalPassengers,

      totalMiles:Number(totalMiles.toFixed(2)),

      includedMilesPerPassenger:cfg.includedMiles,

      includedMilesTotal:Number(includedMilesTotal.toFixed(2)),

      extraMiles:Number(extraMiles.toFixed(2)),

      stopsCount:Number(stopsCount || 0)

    };

  },

  /* =========================
     CANCEL SINGLE TRIP
  ========================= */

  calculateCancelFee(
    service,
    minutesToTrip
  ){

    const cfg =
      this.getSettings(service);

    const mins =
      Number(minutesToTrip);

    if(
      Number.isFinite(mins) &&
      mins > 0 &&
      mins <= cfg.warningMinutes
    ){

      return Number(
        cfg.cancelFee || 0
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
    finalPrice,
    extra = {}
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
        service?.code ||
        service?.serviceCode ||
        "",

      pricingMode:
        cfg.pricingMode,

      miles:
        Number(miles || 0),

      finalPrice:
        Number(finalPrice || 0),

      settings:cfg,

      details:extra || {},

      createdAt:
        new Date().toISOString()

    };

  }

};