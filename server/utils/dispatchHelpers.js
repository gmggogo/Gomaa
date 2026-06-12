const liveDrivers = new Map();
const geoCache = new Map();

function getArizonaTime(){...}
function normalizeTripType(){...}
function normalizeText(){...}
function normalizeNumber(){...}
function parseStops(){...}
function parseStopCoords(){...}
function getFreshLiveDriversArray(){...}
function toRad(){...}
function calcDistanceKm(){...}

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