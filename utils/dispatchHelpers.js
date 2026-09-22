"use strict";

const liveDrivers = new Map();
const geoCache = new Map();

function getArizonaTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" }));
}

function normalizeTripType(rawType) {
  const t = String(rawType || "").trim().toLowerCase();
  if (["reserved", "individual", "company", "shared", "quote"].includes(t)) return t;
  return "company";
}

function normalizeText(v) {
  return String(v || "").trim();
}

function normalizeNumber(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseStops(stops) {
  if (!Array.isArray(stops)) return [];
  return stops.map((s) => normalizeText(s)).filter(Boolean);
}

function parseStopCoords(stopCoords) {
  if (!Array.isArray(stopCoords)) return [];
  return stopCoords.map((sc) => ({
    address: normalizeText(sc?.address),
    lat: normalizeNumber(sc?.lat),
    lng: normalizeNumber(sc?.lng)
  }));
}

function getFreshLiveDriversArray() {
  const now = Date.now();
  const maxAge = 1000 * 60 * 5;
  return Array.from(liveDrivers.values()).filter((driver) => now - driver.time <= maxAge);
}

function toRad(v) {
  return v * Math.PI / 180;
}

function calcDistanceKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined)) {
    return Number.MAX_SAFE_INTEGER;
  }
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = {
  liveDrivers,
  geoCache,
  getArizonaTime,
  normalizeTripType,
  normalizeText,
  normalizeNumber,
  parseStops,
  parseStopCoords,
  getFreshLiveDriversArray,
  toRad,
  calcDistanceKm
};
