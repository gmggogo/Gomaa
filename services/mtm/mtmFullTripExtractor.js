“use strict”;

/* DESTINATION PATH: server/services/mtm/mtmFullTripExtractor.js

Runs only AFTER a successful claim. The connector returns the complete
accepted/assignment record; nothing is intentionally discarded here. */

async function extractFullAcceptedTrip({ connector, externalTripId,
claimResult }) { if (!connector) throw new Error(“MTM connector is
required”); if (!externalTripId) throw new Error(“externalTripId is
required”);

const raw = await connector.getAcceptedTrip(externalTripId,
claimResult);

if (!raw || typeof raw !== “object”) { throw new Error(“MTM connector
returned an invalid accepted trip”); }

return { …raw, _mtmCapture: { capturedAt: new Date().toISOString(),
externalTripId, assignmentNumber: claimResult?.assignmentNumber ||
raw.assignmentNumber || “” } }; }

module.exports = { extractFullAcceptedTrip };
