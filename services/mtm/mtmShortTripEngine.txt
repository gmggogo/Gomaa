“use strict”;

/ DESTINATION PATH: server/services/mtm/mtmShortTripEngine.js /

const { matchesLongTrip } = require(“./mtmLongTripEngine”);

function matchesShortTrip(trip, cfg = {}) { // Reuse the exact same
filter logic, but with the Short Engine’s own range. return
matchesLongTrip(trip, { …cfg, minMiles: Number(cfg.minMiles ?? 0),
maxMiles: Number(cfg.maxMiles ?? 99.99) }); }

function selectShortTrips(trips = [], cfg = {}) { return trips
.filter((trip) => matchesShortTrip(trip, cfg)) .sort((a, b) =>
Number(b.tripMiles || 0) - Number(a.tripMiles || 0)); }

module.exports = { matchesShortTrip, selectShortTrips };
