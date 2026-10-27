"use strict";

/*
  DESTINATION:
  server/services/mtm/mtmShortTripEngine.js

  Short-trip selection intentionally reuses the exact same ZIP, time,
  service-family, and zone logic as the Long Trip Engine. The Short settings
  provide the different mileage range.
*/

const longEngine =
  require(
    "./mtmLongTripEngine"
  );

function select(
  trips=[],
  settings={}
){
  if(!settings.enabled){
    return [];
  }

  return trips.filter(
    trip=>
      longEngine.matches(
        trip,
        settings
      )
  );
}

module.exports={
  matches:
    longEngine.matches,

  select
};
