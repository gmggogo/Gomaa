/* =========================================
BUILD STATS
FINAL CORRECT VERSION
========================================= */

function buildStats(){

  const wrap =
    document.getElementById(
      "dynamicStats"
    );

  if(!wrap) return;

  wrap.innerHTML = "";

  const allData =
    getFilteredTrips();

  /* =========================================
  SERVICE CARD
  ========================================= */

  function createCard(
    title,
    trips,
    isBlue = false
  ){

    const totalTrips =
      trips.length;

    let totalMiles = 0;

    let totalRevenue = 0;

    trips.forEach(t=>{

      /* =========================
      MILES
      ========================= */

      if(
        t.status !== "Cancelled" &&
        t.status !== "NoShow"
      ){

        totalMiles += Number(
          t.miles || 0
        );

      }

      /* =========================
      SHARED
      ========================= */

      if(isSharedTrip(t)){

        (t.passengers || [])
          .forEach(p=>{

          totalRevenue += Number(
            p.price || 0
          );

        });

      }

      /* =========================
      INDIVIDUAL
      ========================= */

      else{

        totalRevenue += Number(
          t.finalPrice ||
          t.priceAmount ||
          0
        );

      }

    });

    wrap.innerHTML += `

      <div class="
        stat
        ${
          isBlue
          ? "total-card"
          : ""
        }
      ">

        <div class="stat-title">
          ${title}
        </div>

        <div class="mini-grid">

          <div class="mini-box">

            <span>
              Trips
            </span>

            <strong>
              ${totalTrips}
            </strong>

          </div>

          <div class="mini-box">

            <span>
              Miles
            </span>

            <strong>
              ${totalMiles.toFixed(1)}
            </strong>

          </div>

        </div>

        <div class="revenue-box">

          <span>
            Revenue
          </span>

          <strong>
            $${totalRevenue.toFixed(2)}
          </strong>

        </div>

      </div>

    `;

  }

  /* =========================================
  SERVICES
  ========================================= */

  COMPANY_SERVICES.forEach(service=>{

    const suffix =
      cleanCode(
        service.companySuffix ||
        service.serviceSuffix ||
        service.serviceCode ||
        service.code ||
        ""
      );

    if(!suffix) return;

    /* =========================
    SHARED CARD
    ========================= */

    if(suffix === "SH"){

      const sharedTrips =
        allData.filter(t =>
          isSharedTrip(t)
        );

      createCard(
        "Shared",
        sharedTrips
      );

      return;

    }

    /* =========================
    NORMAL SERVICES
    ========================= */

    const serviceTrips =
      allData.filter(t => {

        if(isSharedTrip(t)){
          return false;
        }

        const tripSuffix =
          cleanCode(
            t.serviceSuffix ||
            t.serviceCode ||
            t.serviceType ||
            getTripSuffix(t)
          );

        return (
          tripSuffix === suffix
        );

      });

    createCard(
      service.title ||
      service.name ||
      suffix,
      serviceTrips
    );

  });

  /* =========================================
  TOTAL
  ========================================= */

  createCard(
    "Total Trips",
    allData,
    true
  );

  /* =========================================
  COMPLETED
  ========================================= */

  const completedTrips =
    allData.filter(t => {

      if(isSharedTrip(t)){

        return (
          t.passengers || []
        ).some(
          p =>
            p.status ===
            "Completed"
        );

      }

      return (
        t.status ===
        "Completed"
      );

    });

  createCard(
    "Completed",
    completedTrips
  );

  /* =========================================
  CANCELLED
  ========================================= */

  const cancelledTrips =
    allData.filter(t => {

      if(isSharedTrip(t)){

        return (
          t.passengers || []
        ).some(
          p =>
            p.status ===
            "Cancelled"
        );

      }

      return (
        t.status ===
        "Cancelled"
      );

    });

  createCard(
    "Cancelled",
    cancelledTrips
  );

  /* =========================================
  NO SHOW
  ========================================= */

  const noShowTrips =
    allData.filter(t => {

      if(isSharedTrip(t)){

        return (
          t.passengers || []
        ).some(
          p =>
            p.status ===
            "NoShow"
        );

      }

      return (
        t.status ===
        "NoShow"
      );

    });

  createCard(
    "No Show",
    noShowTrips
  );

}