"use strict";

const text = v => String(v == null ? "" : v).trim();
const number = v => Number(v || 0);
const zipMatch = (zip, list) => !Array.isArray(list) || !list.length || list.includes(text(zip));
const timeMatch = (value, from, to) => {
  const v = text(value);
  if (!v) return true;
  return v >= (text(from) || "00:00") && v <= (text(to) || "23:59");
};

function matches(trip, settings = {}) {
  const miles = number(trip.tripMiles ?? trip.miles ?? trip.distance);
  if (miles < number(settings.milesMin)) return false;
  if (settings.milesMax && miles > number(settings.milesMax)) return false;
  if (!timeMatch(trip.pickupTime, settings.pickupTimeFrom, settings.pickupTimeTo)) return false;
  if (!timeMatch(trip.dropoffTime || trip.appointmentTime, settings.dropoffTimeFrom, settings.dropoffTimeTo)) return false;

  const pickup = zipMatch(trip.pickupZip, settings.pickupZipCodes);
  const dropoff = zipMatch(trip.dropoffZip, settings.dropoffZipCodes);
  const zone = text(settings.zoneMatch).toUpperCase() || "ANY";
  if (zone === "PICKUP" && !pickup) return false;
  if (zone === "DROPOFF" && !dropoff) return false;
  if (zone === "EITHER" && !(pickup || dropoff)) return false;
  if (zone === "BOTH" && !(pickup && dropoff)) return false;

  const modes = Array.isArray(settings.modes) ? settings.modes.map(x => text(x).toLowerCase()) : [];
  if (modes.length && !modes.includes(text(trip.mode).toLowerCase())) return false;
  return true;
}

function select(trips = [], settings = {}) {
  if (!settings.enabled) return [];
  return trips.filter(t => matches(t, settings)).sort((a,b) => number(b.tripMiles) - number(a.tripMiles));
}

module.exports = { matches, select };
