“use strict”;

/ DESTINATION PATH: server/services/mtm/mtmLongTripEngine.js /

function toMinutes(value) { const m = /^():()$/.exec(String(value ||
““)); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }

function inWindow(value, from, to) { if (!from && !to) return true;
const v = toMinutes(value); if (v === null) return true; const a =
toMinutes(from); const b = toMinutes(to); if (a !== null && v < a)
return false; if (b !== null && v > b) return false; return true; }

function zipMatch(trip, cfg) { const pickup = String(trip.pickupZip ||
““); const dropoff = String(trip.dropoffZip ||”“); const pickupZips =
Array.isArray(cfg.pickupZips) ? cfg.pickupZips.map(String) : []; const
dropoffZips = Array.isArray(cfg.dropoffZips) ?
cfg.dropoffZips.map(String) : [];

const p = !pickupZips.length || pickupZips.includes(pickup); const d =
!dropoffZips.length || dropoffZips.includes(dropoff);

switch (String(cfg.zoneLogic || “BOTH”).toUpperCase()) { case “PICKUP”:
return p; case “DROPOFF”: return d; case “EITHER”: return p || d;
default: return p && d; } }

function matchesLongTrip(trip, cfg = {}) { const miles =
Number(trip.tripMiles || 0); const min = Number(cfg.minMiles ?? 100);
const max = Number(cfg.maxMiles ?? 1000); if (miles < min || miles >
max) return false;

if (!inWindow(trip.pickupTime, cfg.pickupTimeFrom, cfg.pickupTimeTo))
return false; if (!inWindow(trip.estimatedDropoffTime ||
trip.dropoffTime, cfg.dropoffTimeFrom, cfg.dropoffTimeTo)) return false;

const modes = Array.isArray(cfg.modes) ? cfg.modes.map(String) : []; if
(modes.length && !modes.includes(String(trip.mode || ““))) return false;

return zipMatch(trip, cfg); }

function selectLongTrips(trips = [], cfg = {}) { return trips
.filter((trip) => matchesLongTrip(trip, cfg)) .sort((a, b) =>
Number(b.tripMiles || 0) - Number(a.tripMiles || 0)); }

module.exports = { matchesLongTrip, selectLongTrips };
