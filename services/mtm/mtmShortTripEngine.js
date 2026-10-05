"use strict";

const longEngine = require("./mtmLongTripEngine");

function select(trips = [], settings = {}) {
  if (!settings.enabled) return [];
  return trips.filter(t => longEngine.matches(t, settings));
}

module.exports = { matches: longEngine.matches, select };
