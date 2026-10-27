"use strict";

/*
  DESTINATION:
  server/services/mtm/mtmLongTripEngine.js

  Generic Long/Short Marketplace matching helpers.
  - ZIP can come from pickupZip/dropoffZip OR be extracted from address text.
  - Service matching accepts families such as:
      Ambulatory -> Ambulatory Curb / Ambulatory Door-to-Door
      Wheelchair -> Wheelchair / Paralift
  - Time matching understands HH:mm and 12-hour portal text such as "5:50 am CT".
*/

const text = v =>
  String(
    v == null
      ? ""
      : v
  ).trim();

const number = v =>
  Number(
    v || 0
  );

function normalizeZip(value){
  const raw =
    text(value);

  if(!raw){
    return "";
  }

  /*
    Prefer the last US ZIP in an address because street numbers can appear
    earlier in the string:
      "2651 MANCHESTER DR APT 2 BAKER, LA 70714" -> "70714"
  */
  const matches =
    raw.match(
      /\b\d{5}(?:-\d{4})?\b/g
    );

  if(matches?.length){
    return matches[
      matches.length - 1
    ]
    .slice(0,5);
  }

  return raw
    .replace(/\D/g,"")
    .slice(0,5);
}

function tripZip(
  trip,
  side
){
  const isPickup =
    side === "pickup";

  const explicit =
    isPickup
      ? (
          trip?.pickupZip ??
          trip?.pickupZipCode ??
          trip?.pickupPostalCode
        )
      : (
          trip?.dropoffZip ??
          trip?.dropoffZipCode ??
          trip?.dropoffPostalCode
        );

  const explicitZip =
    normalizeZip(
      explicit
    );

  if(explicitZip){
    return explicitZip;
  }

  const address =
    isPickup
      ? (
          trip?.pickupAddress ??
          trip?.pickup ??
          trip?.origin ??
          ""
        )
      : (
          trip?.dropoffAddress ??
          trip?.dropoff ??
          trip?.destination ??
          ""
        );

  return normalizeZip(
    address
  );
}

function normalizedZipList(list){
  if(!Array.isArray(list)){
    return [];
  }

  return list
    .map(
      normalizeZip
    )
    .filter(Boolean);
}

function zipMatch(
  zip,
  list
){
  const wanted =
    normalizedZipList(
      list
    );

  if(!wanted.length){
    return true;
  }

  const actual =
    normalizeZip(
      zip
    );

  if(!actual){
    return false;
  }

  return wanted.includes(
    actual
  );
}

function timeMinutes(value){
  const raw =
    text(value)
      .toLowerCase();

  if(!raw){
    return null;
  }

  /*
    Accept:
      05:50
      5:50 am
      5:50 am CT
      2026-10-06T05:50:00...
  */
  const match =
    raw.match(
      /(?:t|\b)(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(am|pm)?\b/i
    ) ||
    raw.match(
      /^(\d{1,2}):(\d{2})\s*(am|pm)?/i
    );

  if(!match){
    return null;
  }

  let hour =
    Number(
      match[1]
    );

  const minute =
    Number(
      match[2]
    );

  const meridiem =
    text(
      match[3]
    )
    .toLowerCase();

  if(
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    minute<0 ||
    minute>59
  ){
    return null;
  }

  if(meridiem){
    if(hour<1 || hour>12){
      return null;
    }

    if(
      meridiem==="am" &&
      hour===12
    ){
      hour=0;
    }

    if(
      meridiem==="pm" &&
      hour!==12
    ){
      hour+=12;
    }

  }else if(
    hour<0 ||
    hour>23
  ){
    return null;
  }

  return (
    hour*60 +
    minute
  );
}

function timeMatch(
  value,
  from,
  to
){
  const actual =
    timeMinutes(
      value
    );

  /*
    Preserve previous permissive behavior when the portal does not provide
    a usable time.
  */
  if(actual===null){
    return true;
  }

  const min =
    timeMinutes(
      text(from) ||
      "00:00"
    );

  const max =
    timeMinutes(
      text(to) ||
      "23:59"
    );

  if(
    min===null ||
    max===null
  ){
    return true;
  }

  if(min<=max){
    return (
      actual>=min &&
      actual<=max
    );
  }

  /*
    Supports an overnight window such as 22:00 -> 05:00.
  */
  return (
    actual>=min ||
    actual<=max
  );
}

function normalizeMode(value){
  return text(value)
    .toLowerCase()
    .replace(/[_/\\-]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function modeFamily(value){
  const mode =
    normalizeMode(
      value
    );

  if(!mode){
    return "";
  }

  if(
    mode.includes("ambulatory")
  ){
    return "ambulatory";
  }

  if(
    mode.includes("wheelchair") ||
    mode.includes("paralift") ||
    /\bwc\b/.test(mode)
  ){
    return "wheelchair";
  }

  if(
    mode.includes("taxi") ||
    mode.includes("cab")
  ){
    return "taxi";
  }

  return mode;
}

function modeMatch(
  tripMode,
  settingsModes
){
  if(
    !Array.isArray(settingsModes) ||
    !settingsModes.length
  ){
    return true;
  }

  const actual =
    normalizeMode(
      tripMode
    );

  const actualFamily =
    modeFamily(
      actual
    );

  if(!actual){
    return false;
  }

  return settingsModes.some(
    configured=>{
      const wanted =
        normalizeMode(
          configured
        );

      if(!wanted){
        return false;
      }

      const wantedFamily =
        modeFamily(
          wanted
        );

      /*
        Family match:
          "Ambulatory" matches "Ambulatory Curb" and
          "Ambulatory Door-to-Door".
      */
      if(
        wantedFamily &&
        wantedFamily===actualFamily
      ){
        return true;
      }

      /*
        Generic fallback for broker-specific labels.
      */
      return (
        actual===wanted ||
        actual.startsWith(
          `${wanted} `
        ) ||
        wanted.startsWith(
          `${actual} `
        )
      );
    }
  );
}

function matches(
  trip,
  settings={}
){
  const miles =
    number(
      trip?.tripMiles ??
      trip?.miles ??
      trip?.distance
    );

  if(
    miles <
    number(
      settings.milesMin
    )
  ){
    return false;
  }

  if(
    settings.milesMax &&
    miles >
    number(
      settings.milesMax
    )
  ){
    return false;
  }

  if(
    !timeMatch(
      trip?.pickupTime,
      settings.pickupTimeFrom,
      settings.pickupTimeTo
    )
  ){
    return false;
  }

  if(
    !timeMatch(
      trip?.dropoffTime ||
      trip?.appointmentTime,
      settings.dropoffTimeFrom,
      settings.dropoffTimeTo
    )
  ){
    return false;
  }

  const pickupZip =
    tripZip(
      trip,
      "pickup"
    );

  const dropoffZip =
    tripZip(
      trip,
      "dropoff"
    );

  const radius=Number(settings.zoneRadiusMiles);
  const measured=trip?.zoneDistances || {};
  const sideMatch=(distance,zip,configured)=>{
    // A measured distance takes precedence over ZIP equality. Matching ZIPs
    // remain a safe fallback when geocoding is unavailable.
    if(distance!==null && distance!==undefined && distance!=="" &&
       Number.isFinite(Number(distance)) && Number.isFinite(radius)){
      return Number(distance)<=radius;
    }
    return Array.isArray(configured) && configured.length>0 &&
      zipMatch(zip,configured);
  };
  const pickup=sideMatch(measured.pickupDistanceMiles,pickupZip,settings.pickupZipCodes);
  const dropoff=sideMatch(measured.dropoffDistanceMiles,dropoffZip,settings.dropoffZipCodes);

  const zone =
    text(
      settings.zoneMatch
    )
    .toUpperCase() ||
    "ANY";

  if(
    zone==="PICKUP" &&
    !pickup
  ){
    return false;
  }

  if(
    zone==="DROPOFF" &&
    !dropoff
  ){
    return false;
  }

  if(
    zone==="EITHER" &&
    !(pickup || dropoff)
  ){
    return false;
  }

  if(
    zone==="BOTH" &&
    !(pickup && dropoff)
  ){
    return false;
  }

  if(
    !modeMatch(
      trip?.mode,
      settings.modes
    )
  ){
    return false;
  }

  return true;
}

function select(
  trips=[],
  settings={}
){
  if(!settings.enabled){
    return [];
  }

  return trips
    .filter(
      trip=>
        matches(
          trip,
          settings
        )
    )
    .sort(
      (a,b)=>
        number(
          b.tripMiles ??
          b.miles ??
          b.distance
        ) -
        number(
          a.tripMiles ??
          a.miles ??
          a.distance
        )
    );
}

module.exports={
  matches,
  select,

  /*
    Exported for diagnostics/tests without changing existing callers.
  */
  normalizeZip,
  tripZip,
  modeMatch,
  timeMatch
};
