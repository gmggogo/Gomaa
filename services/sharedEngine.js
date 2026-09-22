"use strict";

/* GH SHARED ENGINE ROUTE OPTIMIZER BUILD: 2026-09-06-R7 */

/* GH SHARED ENGINE TIMING WINDOW FIX BUILD: 2026-09-06-R2 */

/*
DESTINATION PATH:
server/services/sharedEngine.js

PURPOSE:
Main Shared Engine for COMPANY, RESERVED, and BROKER.

CORE RULES:
- Trips with stops are NEVER shared.
- Existing broker/company pickup time is treated as fixed.
- If pickup time is missing, appointment time is used to calculate pickup.
- Same pickup / same drop-off groups receive priority when time allows.
- Google road routes validate distance and travel time.
- This engine returns proposals only. It does NOT confirm, save, delete,
  or modify original trips.
*/

const routeMapEngine =
  require("../utils/routeMapEngine");

const {
  normalizeTrip,
  eligibilityReason,
  minutesToTime,
  addressKey
} =
  require("./sharedEngineRules");

const {
  pairPriorityScore,
  groupPriorityScore
} =
  require("./sharedEngineScoring");

const {
  calculateRoute,
  calculateDirect
} =
  require("./sharedEngineGoogleRoutes");

const DEFAULT_SETTINGS = {
  enabled:true,

  sources:{
    company:{
      enabled:true
    },

    reserved:{
      enabled:true
    },

    broker:{
      enabled:true
    }
  },

  maxGroupDistanceMiles:10,
  maxExtraMiles:10,
  maxExtraMinutes:30,
  appointmentBufferMinutes:10,
  pickupLateToleranceMinutes:5,
  pickupEarlyWindowMinutes:20,
  maxRidersPerGroup:4,

  samePickupPriority:true,
  sameDropoffPriority:true
};

function n(
  value,
  fallback = 0
){
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function mergeSettings(
  settings = {}
){
  return {
    ...DEFAULT_SETTINGS,
    ...settings,

    sources:{
      company:{
        ...DEFAULT_SETTINGS
          .sources
          .company,
        ...(
          settings?.sources
            ?.company ||
          {}
        )
      },

      reserved:{
        ...DEFAULT_SETTINGS
          .sources
          .reserved,
        ...(
          settings?.sources
            ?.reserved ||
          {}
        )
      },

      broker:{
        ...DEFAULT_SETTINGS
          .sources
          .broker,
        ...(
          settings?.sources
            ?.broker ||
          {}
        )
      }
    }
  };
}

function safeArray(value){
  return Array.isArray(value)
    ? value
    : [];
}

function uniqueAddresses(
  list
){
  const out = [];
  const seen =
    new Set();

  for(const value of list){
    const address =
      String(value || "")
        .trim();

    const key =
      addressKey(address);

    if(
      !address ||
      seen.has(key)
    ){
      continue;
    }

    seen.add(key);
    out.push(address);
  }

  return out;
}

function passengerFromTrip(
  trip
){
  return {
    passengerId:trip.id,
    clientName:
      trip.passengerName ||
      trip.tripNumber ||
      trip.id,

    name:
      trip.passengerName ||
      trip.tripNumber ||
      trip.id,

    pickup:trip.pickup,
    pickupLat:trip.pickupLat,
    pickupLng:trip.pickupLng,

    dropoff:trip.dropoff,
    dropoffLat:trip.dropoffLat,
    dropoffLng:trip.dropoffLng,

    pickupTime:trip.pickupTime,
    appointmentTime:
      trip.appointmentTime,
    tripDate:trip.tripDate,
    status:"Scheduled"
  };
}

function fallbackRoutePlan(
  trips
){
  const pickups =
    uniqueAddresses(
      trips.map(
        trip=>trip.pickup
      )
    );

  const dropoffs =
    uniqueAddresses(
      [...trips]
        .sort((a,b)=>{
          const aTime =
            a.appointmentMinutes === null
              ? 99999
              : a.appointmentMinutes;

          const bTime =
            b.appointmentMinutes === null
              ? 99999
              : b.appointmentMinutes;

          return aTime - bTime;
        })
        .map(
          trip=>trip.dropoff
        )
    );

  const points = [];

  for(const pickup of pickups){
    points.push({
      type:"pickup",
      address:pickup
    });
  }

  for(const dropoff of dropoffs){
    points.push({
      type:"dropoff",
      address:dropoff
    });
  }

  return {
    routeCase:
      "SHARED_ENGINE_FALLBACK",
    routePlan:
      points.map(
        (point,index)=>({
          ...point,
          order:index + 1
        })
      ),
    routePoints:
      points.map(
        point=>point.address
      )
  };
}

function buildRoutePlan(
  trips
){
  const passengers =
    trips.map(
      passengerFromTrip
    );

  if(
    routeMapEngine &&
    typeof routeMapEngine
      .buildSharedRoutePlanFromPassengers ===
      "function"
  ){
    const result =
      routeMapEngine
        .buildSharedRoutePlanFromPassengers(
          passengers
        );

    const routePlan =
      safeArray(
        result?.routePlan
      );

    const routePoints =
      uniqueAddresses(
        safeArray(
          result?.addresses
        ).length
          ? result.addresses
          : routePlan.map(
              point=>point.address
            )
      );

    if(
      routePlan.length >= 2 &&
      routePoints.length >= 2
    ){
      return {
        routeCase:
          result?.routeCase ||
          "ROUTE_MAP_ENGINE",
        routePlan,
        routePoints
      };
    }
  }

  return fallbackRoutePlan(
    trips
  );
}

function routeIndexForTrip(
  routePlan,
  trip,
  type
){
  const target =
    type === "pickup"
      ? trip.pickupKey
      : trip.dropoffKey;

  return safeArray(
    routePlan
  ).findIndex(point=>{
    return (
      String(
        point?.type ||
        ""
      )
        .toLowerCase() ===
        type &&
      addressKey(
        point?.address
      ) === target
    );
  });
}

function routeLegSums(
  routeData
){
  const legs =
    safeArray(
      routeData?.legs
    );

  const cumulativeMinutes =
    [0];

  const cumulativeMiles =
    [0];

  for(const leg of legs){
    cumulativeMinutes.push(
      cumulativeMinutes[
        cumulativeMinutes.length - 1
      ] +
      n(leg?.minutes)
    );

    cumulativeMiles.push(
      cumulativeMiles[
        cumulativeMiles.length - 1
      ] +
      n(leg?.miles)
    );
  }

  return {
    cumulativeMinutes,
    cumulativeMiles
  };
}

function between(
  list,
  startIndex,
  endIndex
){
  if(
    startIndex < 0 ||
    endIndex < 0 ||
    endIndex < startIndex
  ){
    return 0;
  }

  return (
    n(list[endIndex]) -
    n(list[startIndex])
  );
}

function calculateStartWindow(
  trips,
  routePlan,
  routeData,
  settings
){
  const {
    cumulativeMinutes
  } =
    routeLegSums(
      routeData
    );

  const lowerBounds = [];
  const upperBounds = [];

  for(const trip of trips){

    const pickupIndex =
      routeIndexForTrip(
        routePlan,
        trip,
        "pickup"
      );

    const dropoffIndex =
      routeIndexForTrip(
        routePlan,
        trip,
        "dropoff"
      );

    if(
      pickupIndex >= 0 &&
      trip.pickupMinutes !== null
    ){
      const pickupOffset =
        n(
          cumulativeMinutes[
            pickupIndex
          ]
        );

      lowerBounds.push(
        trip.pickupMinutes -
        n(
          settings
            .pickupEarlyWindowMinutes
        ) -
        pickupOffset
      );

      upperBounds.push(
        trip.pickupMinutes +
        n(
          settings
            .pickupLateToleranceMinutes
        ) -
        pickupOffset
      );
    }

    if(
      dropoffIndex >= 0 &&
      trip.appointmentMinutes !== null
    ){
      /*
        Appointment is the HARD latest arrival.
        Appointment Buffer defines the preferred arrival window before it,
        but an early route arrival can be delayed by choosing a later start
        or by waiting before drop-off.
      */
      const dropoffOffset =
        n(
          cumulativeMinutes[
            dropoffIndex
          ]
        );

      upperBounds.push(
        trip.appointmentMinutes -
        dropoffOffset
      );
    }
  }

  if(
    !lowerBounds.length &&
    !upperBounds.length
  ){
    return null;
  }

  const earliestStart =
    lowerBounds.length
      ? Math.max(...lowerBounds)
      : Math.min(...upperBounds);

  const latestStart =
    upperBounds.length
      ? Math.min(...upperBounds)
      : earliestStart;

  if(
    earliestStart >
    latestStart
  ){
    return {
      invalid:true,
      reason:"TIME_WINDOWS_DO_NOT_OVERLAP",
      earliestStart,
      latestStart
    };
  }

  return {
    invalid:false,
    earliestStart,
    latestStart
  };
}

function simulateScheduleFromStart(
  trips,
  routePlan,
  routeData,
  settings,
  startMinute
){
  const legs =
    safeArray(
      routeData?.legs
    );

  const eventTimes = [];
  let current =
    Number(startMinute);

  for(
    let index = 0;
    index < routePlan.length;
    index += 1
  ){
    if(index > 0){
      current +=
        n(
          legs[index - 1]
            ?.minutes
        );
    }

    const point =
      routePlan[index];

    const type =
      String(
        point?.type ||
        ""
      ).toLowerCase();

    const pointKey =
      addressKey(
        point?.address
      );

    const relatedTrips =
      trips.filter(trip=>{
        if(type === "pickup"){
          return (
            trip.pickupKey ===
            pointKey
          );
        }

        if(type === "dropoff"){
          return (
            trip.dropoffKey ===
            pointKey
          );
        }

        return false;
      });

    if(type === "pickup"){

      const fixedTrips =
        relatedTrips.filter(
          trip=>
            trip.pickupMinutes !==
            null
        );

      if(fixedTrips.length){

        const earliestAllowed =
          Math.max(
            ...fixedTrips.map(
              trip=>
                trip.pickupMinutes -
                n(
                  settings
                    .pickupEarlyWindowMinutes
                )
            )
          );

        const latestAllowed =
          Math.min(
            ...fixedTrips.map(
              trip=>
                trip.pickupMinutes +
                n(
                  settings
                    .pickupLateToleranceMinutes
                )
            )
          );

        if(
          earliestAllowed >
          latestAllowed
        ){
          return {
            valid:false,
            reason:
              "PICKUP_WINDOWS_DO_NOT_OVERLAP",
            earliestAllowed:
              minutesToTime(
                earliestAllowed
              ),
            latestAllowed:
              minutesToTime(
                latestAllowed
              )
          };
        }

        if(
          current <
          earliestAllowed
        ){
          current =
            earliestAllowed;
        }

        if(
          current >
          latestAllowed
        ){
          return {
            valid:false,
            reason:
              "PICKUP_WINDOW_MISSED",
            calculatedPickup:
              minutesToTime(
                current
              ),
            latestAllowed:
              minutesToTime(
                latestAllowed
              )
          };
        }
      }
    }

    if(type === "dropoff"){
      for(
        const trip of
        relatedTrips
      ){
        if(
          trip.appointmentMinutes ===
          null
        ){
          continue;
        }

        const earliestAllowedArrival =
          trip.appointmentMinutes -
          n(
            settings
              .appointmentBufferMinutes
          );

        const latestAllowedArrival =
          trip.appointmentMinutes;

        /*
          If this candidate schedule reaches the destination before the
          appointment window, waiting is allowed. The engine also searches
          later route-start times first so unnecessary waiting is minimized.
        */
        if(
          current <
          earliestAllowedArrival
        ){
          current =
            earliestAllowedArrival;
        }

        if(
          current >
          latestAllowedArrival
        ){
          return {
            valid:false,
            reason:
              "APPOINTMENT_LATE",
            tripId:trip.id,
            appointmentTime:
              trip.appointmentTime,
            calculatedArrival:
              minutesToTime(
                current
              ),
            lateByMinutes:
              Number(
                (
                  current -
                  latestAllowedArrival
                ).toFixed(2)
              )
          };
        }
      }
    }

    eventTimes.push({
      order:index + 1,
      type,
      address:
        point?.address ||
        "",
      minute:
        Number(
          current.toFixed(2)
        ),
      time:
        minutesToTime(
          current
        )
    });
  }

  return {
    valid:true,
    startMinute:
      Number(
        Number(startMinute)
          .toFixed(2)
      ),
    startTime:
      minutesToTime(
        startMinute
      ),
    endMinute:
      eventTimes.length
        ? eventTimes[
            eventTimes.length - 1
          ].minute
        : startMinute,
    endTime:
      eventTimes.length
        ? eventTimes[
            eventTimes.length - 1
          ].time
        : minutesToTime(
            startMinute
          ),
    eventTimes
  };
}

function simulateSchedule(
  trips,
  routePlan,
  routeData,
  settings
){
  const startWindow =
    calculateStartWindow(
      trips,
      routePlan,
      routeData,
      settings
    );

  if(startWindow === null){
    return {
      valid:false,
      reason:
        "NO_TIME_REFERENCE"
    };
  }

  if(
    startWindow.invalid === true
  ){
    return {
      valid:false,
      reason:
        startWindow.reason ||
        "TIME_WINDOWS_DO_NOT_OVERLAP",
      earliestStart:
        Number(
          n(
            startWindow
              .earliestStart
          ).toFixed(2)
        ),
      latestStart:
        Number(
          n(
            startWindow
              .latestStart
          ).toFixed(2)
        )
    };
  }

  const earliestStart =
    Number(
      startWindow.earliestStart
    );

  const latestStart =
    Number(
      startWindow.latestStart
    );

  /*
    Search the entire allowed route-start window instead of testing only
    one anchor time. We search from latest to earliest because it minimizes
    unnecessary waiting while still respecting every appointment deadline.
  */
  const candidateStarts = [];

  candidateStarts.push(
    latestStart
  );

  for(
    let minute =
      Math.floor(latestStart);
    minute >=
      Math.ceil(earliestStart);
    minute -= 1
  ){
    candidateStarts.push(
      minute
    );
  }

  candidateStarts.push(
    earliestStart
  );

  const uniqueStarts =
    [...new Set(
      candidateStarts
        .map(value=>
          Number(
            Number(value)
              .toFixed(2)
          )
        )
    )];

  let bestFailure = null;

  for(
    const startMinute of
    uniqueStarts
  ){
    const result =
      simulateScheduleFromStart(
        trips,
        routePlan,
        routeData,
        settings,
        startMinute
      );

    if(result.valid){
      return {
        ...result,
        startWindow:{
          earliest:
            Number(
              earliestStart.toFixed(2)
            ),
          latest:
            Number(
              latestStart.toFixed(2)
            )
        }
      };
    }

    bestFailure =
      bestFailure ||
      result;
  }

  return {
    valid:false,
    reason:
      bestFailure?.reason ||
      "NO_VALID_START_TIME",
    earliestStart:
      Number(
        earliestStart.toFixed(2)
      ),
    latestStart:
      Number(
        latestStart.toFixed(2)
      ),
    lastFailure:
      bestFailure
  };
}

async function passengerImpact(
  trip,
  routePlan,
  routeData
){
  const pickupIndex =
    routeIndexForTrip(
      routePlan,
      trip,
      "pickup"
    );

  const dropoffIndex =
    routeIndexForTrip(
      routePlan,
      trip,
      "dropoff"
    );

  if(
    pickupIndex < 0 ||
    dropoffIndex < 0 ||
    dropoffIndex <= pickupIndex
  ){
    return {
      valid:false,
      reason:
        "PASSENGER_ROUTE_ORDER_INVALID"
    };
  }

  const {
    cumulativeMinutes,
    cumulativeMiles
  } =
    routeLegSums(
      routeData
    );

  const sharedMinutes =
    between(
      cumulativeMinutes,
      pickupIndex,
      dropoffIndex
    );

  const sharedMiles =
    between(
      cumulativeMiles,
      pickupIndex,
      dropoffIndex
    );

  const direct =
    await calculateDirect(
      trip.pickup,
      trip.dropoff
    );

  return {
    valid:true,
    directMiles:
      n(direct?.miles),
    directMinutes:
      n(direct?.minutes),
    sharedMiles:
      Number(
        sharedMiles.toFixed(2)
      ),
    sharedMinutes:
      Number(
        sharedMinutes.toFixed(2)
      ),
    extraMiles:
      Number(
        Math.max(
          0,
          sharedMiles -
          n(direct?.miles)
        ).toFixed(2)
      ),
    extraMinutes:
      Number(
        Math.max(
          0,
          sharedMinutes -
          n(direct?.minutes)
        ).toFixed(2)
      )
  };
}

async function groupImpactValidation(
  trips,
  routePlan,
  routeData,
  settings
){
  const impacts = [];

  for(const trip of trips){
    const impact =
      await passengerImpact(
        trip,
        routePlan,
        routeData
      );

    if(!impact.valid){
      return {
        valid:false,
        reason:impact.reason,
        tripId:trip.id,
        impacts
      };
    }

    if(
      impact.extraMiles >
      n(
        settings.maxExtraMiles
      )
    ){
      return {
        valid:false,
        reason:
          "MAX_EXTRA_MILES_EXCEEDED",
        tripId:trip.id,
        impact,
        impacts
      };
    }

    if(
      impact.extraMinutes >
      n(
        settings.maxExtraMinutes
      )
    ){
      return {
        valid:false,
        reason:
          "MAX_EXTRA_MINUTES_EXCEEDED",
        tripId:trip.id,
        impact,
        impacts
      };
    }

    impacts.push({
      tripId:trip.id,
      ...impact
    });
  }

  return {
    valid:true,
    impacts
  };
}

async function pairMeta(
  a,
  b,
  settings
){
  const samePickup =
    a.pickupKey &&
    a.pickupKey ===
      b.pickupKey;

  const sameDropoff =
    a.dropoffKey &&
    a.dropoffKey ===
      b.dropoffKey;

  let pickupSeparationMiles =
    samePickup
      ? 0
      : Number.MAX_SAFE_INTEGER;

  let dropoffSeparationMiles =
    sameDropoff
      ? 0
      : Number.MAX_SAFE_INTEGER;

  if(!samePickup){
    const route =
      await calculateDirect(
        a.pickup,
        b.pickup
      );

    pickupSeparationMiles =
      n(
        route?.miles,
        Number.MAX_SAFE_INTEGER
      );
  }

  if(!sameDropoff){
    const route =
      await calculateDirect(
        a.dropoff,
        b.dropoff
      );

    dropoffSeparationMiles =
      n(
        route?.miles,
        Number.MAX_SAFE_INTEGER
      );
  }

  const closestSeparation =
    Math.min(
      pickupSeparationMiles,
      dropoffSeparationMiles
    );

  const withinDistance =
    (
      samePickup ||
      sameDropoff ||
      closestSeparation <=
        n(
          settings
            .maxGroupDistanceMiles
        )
    );

  return {
    ...pairPriorityScore(
      a,
      b,
      {
        pickupSeparationMiles,
        dropoffSeparationMiles,
        settings
      }
    ),
    withinDistance
  };
}

function allSamePickup(
  trips
){
  if(!Array.isArray(trips) || !trips.length){
    return false;
  }

  const key =
    trips[0].pickupKey;

  return Boolean(
    key &&
    trips.every(
      trip=>
        trip.pickupKey === key
    )
  );
}

function permutations(
  items
){
  if(items.length <= 1){
    return [items];
  }

  const out = [];

  for(
    let i = 0;
    i < items.length;
    i += 1
  ){
    const head =
      items[i];

    const rest = [
      ...items.slice(0,i),
      ...items.slice(i + 1)
    ];

    for(
      const tail of
      permutations(rest)
    ){
      out.push([
        head,
        ...tail
      ]);
    }
  }

  return out;
}

function samePickupRouteCandidates(
  trips,
  originalBuilt
){
  if(
    !allSamePickup(trips) ||
    trips.length > 4
  ){
    return [
      originalBuilt
    ];
  }

  const pickup =
    trips[0].pickup;

  const orderedDropoffs =
    [...trips]
      .sort((a,b)=>{
        const aTime =
          a.appointmentMinutes === null
            ? Number.MAX_SAFE_INTEGER
            : a.appointmentMinutes;

        const bTime =
          b.appointmentMinutes === null
            ? Number.MAX_SAFE_INTEGER
            : b.appointmentMinutes;

        return aTime - bTime;
      });

  const variants =
    permutations(
      orderedDropoffs
    );

  const seen =
    new Set();

  const candidates = [];

  function addCandidate(candidate){

    const signature =
      candidate.routePoints
        .map(addressKey)
        .join("||");

    if(
      !signature ||
      seen.has(signature)
    ){
      return;
    }

    seen.add(signature);
    candidates.push(candidate);
  }

  addCandidate(
    originalBuilt
  );

  for(
    const order of variants
  ){
    const routePlan = [
      {
        type:"pickup",
        address:pickup,
        order:1
      },
      ...order.map(
        (trip,index)=>({
          type:"dropoff",
          address:trip.dropoff,
          order:index + 2
        })
      )
    ];

    addCandidate({
      routeCase:
        "SAME_PICKUP_OPTIMIZED",
      routePlan,
      routePoints:
        routePlan.map(
          point=>point.address
        )
    });
  }

  return candidates;
}

async function validateBuiltRoute(
  trips,
  built,
  settings
){
  const routeData =
    await calculateRoute(
      built.routePoints
    );

  const schedule =
    simulateSchedule(
      trips,
      built.routePlan,
      routeData,
      settings
    );

  if(!schedule.valid){
    return {
      valid:false,
      reason:
        schedule.reason,
      schedule,
      routeCase:
        built.routeCase
    };
  }

  const impact =
    await groupImpactValidation(
      trips,
      built.routePlan,
      routeData,
      settings
    );

  if(!impact.valid){
    return {
      valid:false,
      reason:
        impact.reason,
      impact,
      routeCase:
        built.routeCase
    };
  }

  return {
    valid:true,
    routeCase:
      built.routeCase,
    routePlan:
      built.routePlan,
    routePoints:
      built.routePoints,
    routeData,
    schedule,
    impacts:
      impact.impacts
  };
}


async function validateGroup(
  trips,
  settings
){
  if(
    !Array.isArray(trips) ||
    trips.length < 2
  ){
    return {
      valid:false,
      reason:
        "GROUP_REQUIRES_TWO_TRIPS"
    };
  }

  if(
    trips.length >
    n(
      settings.maxRidersPerGroup,
      4
    )
  ){
    return {
      valid:false,
      reason:
        "MAX_RIDERS_EXCEEDED"
    };
  }

  const tripDate =
    trips[0].tripDate;

  if(
    trips.some(
      trip=>
        trip.tripDate !==
        tripDate
    )
  ){
    return {
      valid:false,
      reason:
        "DIFFERENT_TRIP_DATES"
    };
  }

  const pairDetails = [];

  for(
    let i = 0;
    i < trips.length;
    i += 1
  ){
    for(
      let j = i + 1;
      j < trips.length;
      j += 1
    ){
      const meta =
        await pairMeta(
          trips[i],
          trips[j],
          settings
        );

      pairDetails.push({
        a:trips[i].id,
        b:trips[j].id,
        ...meta
      });

      if(!meta.withinDistance){
        return {
          valid:false,
          reason:
            "GROUP_DISTANCE_EXCEEDED",
          pair:
            pairDetails[
              pairDetails.length - 1
            ]
        };
      }
    }
  }

  const originalBuilt =
    buildRoutePlan(
      trips
    );

  const routeCandidates =
    samePickupRouteCandidates(
      trips,
      originalBuilt
    );

  const failures = [];
  const validRoutes = [];

  for(
    const built of
    routeCandidates
  ){
    const tested =
      await validateBuiltRoute(
        trips,
        built,
        settings
      );

    if(!tested.valid){
      failures.push({
        routeCase:
          built.routeCase,
        routePoints:
          built.routePoints,
        reason:
          tested.reason,
        details:
          tested
      });
      continue;
    }

    validRoutes.push(
      tested
    );
  }

  if(!validRoutes.length){
    const firstFailure =
      failures[0] ||
      null;

    return {
      valid:false,
      reason:
        firstFailure?.reason ||
        "NO_VALID_SHARED_ROUTE",
      routeAlternativesTested:
        routeCandidates.length,
      failures
    };
  }

  /*
    Choose the valid route with the fewest road minutes.
    Appointment and pickup validity have already been enforced above.
  */
  validRoutes.sort(
    (a,b)=>
      n(
        a.routeData?.minutes,
        Number.MAX_SAFE_INTEGER
      ) -
      n(
        b.routeData?.minutes,
        Number.MAX_SAFE_INTEGER
      )
  );

  const best =
    validRoutes[0];

  return {
    valid:true,
    routeCase:
      best.routeCase,
    routePlan:
      best.routePlan,
    routePoints:
      best.routePoints,
    routeData:
      best.routeData,
    schedule:
      best.schedule,
    impacts:
      best.impacts,
    routeAlternativesTested:
      routeCandidates.length,
    pairDetails,
    priority:
      groupPriorityScore(
        trips,
        pairDetails
      )
  };
}

async function chooseBestCandidate(
  baseTrip,
  candidates,
  settings
){
  const ranked = [];

  for(const candidate of candidates){
    if(
      candidate.tripDate !==
      baseTrip.tripDate
    ){
      continue;
    }

    const meta =
      await pairMeta(
        baseTrip,
        candidate,
        settings
      );

    if(!meta.withinDistance){
      continue;
    }

    ranked.push({
      trip:candidate,
      meta
    });
  }

  ranked.sort(
    (a,b)=>
      n(b.meta.score) -
      n(a.meta.score)
  );

  return ranked;
}

function makeGroupId(
  index
){
  return (
    "SH-" +
    String(index + 1)
      .padStart(3,"0")
  );
}


/* =========================
   CROSS-MIDNIGHT TIME NORMALIZATION

   Example:
     Pickup      23:19
     Appointment 00:10

   The appointment belongs to the following day, so internally it becomes
   24:10 (1450 minutes) instead of 00:10 (10 minutes).

   This keeps late-night broker trips valid without changing their visible
   date/time strings.
========================= */

function normalizeCrossMidnightAppointment(trip){

  if(!trip){
    return trip;
  }

  if(
    trip.pickupMinutes === null ||
    trip.appointmentMinutes === null
  ){
    return trip;
  }

  if(
    n(trip.appointmentMinutes) <
    n(trip.pickupMinutes)
  ){
    return {
      ...trip,
      appointmentMinutes:
        n(trip.appointmentMinutes) +
        1440,
      appointmentNextDay:true
    };
  }

  return trip;
}

async function planSharedTrips({
  trips,
  source,
  settings
} = {}){
  const config =
    mergeSettings(
      settings
    );

  const normalized =
    safeArray(trips)
      .map(
        (trip,index)=>
          normalizeCrossMidnightAppointment(
            normalizeTrip(
              trip,
              index,
              source
            )
          )
      );

  const eligible = [];
  const excluded = [];

  for(const trip of normalized){
    const reason =
      eligibilityReason(
        trip,
        config
      );

    if(reason){
      excluded.push({
        tripId:trip.id,
        reason,
        trip:
          trip.raw
      });
      continue;
    }

    eligible.push(
      trip
    );
  }

  const remaining =
    [...eligible];

  const groups = [];
  const singles = [];

  while(remaining.length){
    const base =
      remaining.shift();

    const group =
      [base];

    /*
      Keep the real validation reasons instead of collapsing every failure
      into NO_VALID_SHARED_MATCH. Trip Split can then show exactly which rule
      rejected a proposed pair/group.
    */
    const rejectionDetails = [];

    while(
      remaining.length &&
      group.length <
        n(
          config.maxRidersPerGroup,
          4
        )
    ){
      const ranked =
        await chooseBestCandidate(
          group[0],
          remaining,
          config
        );

      let added = false;

      /*
        If ranking removed every candidate because of distance, validate
        each remaining pair once so the exact rejection reason is preserved.
      */
      if(!ranked.length){
        for(const candidate of remaining){
          const diagnostic =
            await validateGroup(
              [
                ...group,
                candidate
              ],
              config
            );

          if(!diagnostic.valid){
            rejectionDetails.push({
              candidateTripId:candidate.id,
              reason:
                diagnostic.reason ||
                "GROUP_VALIDATION_FAILED",
              details:diagnostic
            });
          }
        }
      }

      for(const row of ranked){
        const testGroup =
          [
            ...group,
            row.trip
          ];

        const validation =
          await validateGroup(
            testGroup,
            config
          );

        if(
          !validation.valid
        ){
          rejectionDetails.push({
            candidateTripId:row.trip.id,
            reason:
              validation.reason ||
              "GROUP_VALIDATION_FAILED",
            details:validation
          });

          continue;
        }

        group.push(
          row.trip
        );

        const index =
          remaining.findIndex(
            trip=>
              trip.id ===
              row.trip.id
          );

        if(index >= 0){
          remaining.splice(
            index,
            1
          );
        }

        added = true;
        break;
      }

      if(!added){
        break;
      }
    }

    if(group.length < 2){

      const firstRejection =
        rejectionDetails[0] ||
        null;

      singles.push({
        tripId:base.id,
        reason:
          firstRejection?.reason ||
          "NO_VALID_SHARED_MATCH",
        rejectionDetails,
        trip:base.raw
      });

      continue;
    }

    const final =
      await validateGroup(
        group,
        config
      );

    if(!final.valid){
      for(const trip of group){
        singles.push({
          tripId:trip.id,
          reason:
            final.reason ||
            "GROUP_VALIDATION_FAILED",
          trip:trip.raw
        });
      }

      continue;
    }

    groups.push({
      groupId:
        makeGroupId(
          groups.length
        ),

      source:
        group[0].source,

      tripDate:
        group[0].tripDate,

      tripIds:
        group.map(
          trip=>trip.id
        ),

      trips:
        group.map(
          trip=>trip.raw
        ),

      routeCase:
        final.routeCase,

      routePlan:
        final.routePlan,

      routePoints:
        final.routePoints,

      routeMiles:
        n(
          final.routeData?.miles
        ),

      routeMinutes:
        n(
          final.routeData?.minutes
        ),

      polyline:
        final.routeData?.polyline ||
        "",

      calculatedFirstPickupTime:
        final.schedule
          ?.startTime ||
        "",

      calculatedLastDropoffTime:
        final.schedule
          ?.endTime ||
        "",

      schedule:
        final.schedule,

      passengerImpacts:
        final.impacts,

      priority:
        final.priority,

      pairDetails:
        final.pairDetails,

      status:
        "PROPOSED"
    });
  }

  return {
    success:true,
    settings:config,
    totals:{
      received:
        normalized.length,
      eligible:
        eligible.length,
      excluded:
        excluded.length,
      sharedGroups:
        groups.length,
      sharedTrips:
        groups.reduce(
          (sum,group)=>
            sum +
            group.tripIds.length,
          0
        ),
      singles:
        singles.length
    },
    groups,
    singles,
    excluded
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  mergeSettings,
  validateGroup,
  planSharedTrips
};
