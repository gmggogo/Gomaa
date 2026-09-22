"use strict";

/*
DESTINATION PATH:
server/services/sharedEngineScoring.js

PURPOSE:
Shared Engine grouping priority.
Same pickup + same drop-off is strongest.
Then same pickup.
Then same drop-off.
Then route proximity.
*/

function n(value,fallback = 0){
  const num = Number(value);
  return Number.isFinite(num)
    ? num
    : fallback;
}

function pairPriorityScore(
  a,
  b,
  {
    pickupSeparationMiles = 0,
    dropoffSeparationMiles = 0,
    settings = {}
  } = {}
){
  let score = 0;

  const samePickup =
    Boolean(
      a?.pickupKey &&
      b?.pickupKey &&
      a.pickupKey === b.pickupKey
    );

  const sameDropoff =
    Boolean(
      a?.dropoffKey &&
      b?.dropoffKey &&
      a.dropoffKey === b.dropoffKey
    );

  if(
    samePickup &&
    sameDropoff
  ){
    score += 10000;
  }else{
    if(
      samePickup &&
      settings.samePickupPriority !== false
    ){
      score += 5000;
    }

    if(
      sameDropoff &&
      settings.sameDropoffPriority !== false
    ){
      score += 4000;
    }
  }

  const proximityMiles =
    Math.min(
      n(
        pickupSeparationMiles,
        Number.MAX_SAFE_INTEGER
      ),
      n(
        dropoffSeparationMiles,
        Number.MAX_SAFE_INTEGER
      )
    );

  if(
    Number.isFinite(proximityMiles) &&
    proximityMiles <
      Number.MAX_SAFE_INTEGER
  ){
    score +=
      Math.max(
        0,
        1000 -
        Math.round(proximityMiles * 50)
      );
  }

  if(
    a?.appointmentMinutes !== null &&
    b?.appointmentMinutes !== null
  ){
    const difference =
      Math.abs(
        n(a.appointmentMinutes) -
        n(b.appointmentMinutes)
      );

    score +=
      Math.max(
        0,
        500 - difference
      );
  }

  if(
    a?.pickupMinutes !== null &&
    b?.pickupMinutes !== null
  ){
    const difference =
      Math.abs(
        n(a.pickupMinutes) -
        n(b.pickupMinutes)
      );

    score +=
      Math.max(
        0,
        500 - difference
      );
  }

  return {
    score,
    samePickup,
    sameDropoff,
    pickupSeparationMiles:n(
      pickupSeparationMiles,
      0
    ),
    dropoffSeparationMiles:n(
      dropoffSeparationMiles,
      0
    )
  };
}

function groupPriorityScore(
  trips,
  pairMeta = []
){
  const list =
    Array.isArray(pairMeta)
      ? pairMeta
      : [];

  const total =
    list.reduce(
      (sum,row)=>
        sum +
        n(row?.score),
      0
    );

  const samePickupPairs =
    list.filter(
      row=>row?.samePickup
    ).length;

  const sameDropoffPairs =
    list.filter(
      row=>row?.sameDropoff
    ).length;

  return {
    total,
    samePickupPairs,
    sameDropoffPairs,
    tripCount:
      Array.isArray(trips)
        ? trips.length
        : 0
  };
}

module.exports = {
  pairPriorityScore,
  groupPriorityScore
};
