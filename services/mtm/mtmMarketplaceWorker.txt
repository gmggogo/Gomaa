“use strict”;

/* DESTINATION PATH: server/services/mtm/mtmMarketplaceWorker.js

Orchestrates BOTH independent engines against one connector session.
Long and Short scans are evaluated independently and can run
concurrently. No real MTM portal selectors/endpoints live in this file.
*/

const { selectLongTrips } = require(“./mtmLongTripEngine”); const {
selectShortTrips } = require(“./mtmShortTripEngine”); const {
acquireTripLock, releaseTripLock } = require(“./mtmTripLockService”);
const { extractFullAcceptedTrip } = require(“./mtmFullTripExtractor”);
const { normalizeMtmAcceptedTrip } = require(“./mtmTripNormalizer”);

async function processCandidate({ tenantId, integration, connector,
trip, autoAccept, receiveTrip }) { const externalTripId =
trip.externalTripId || trip.tripNumber; if (!externalTripId) return {
status: “SKIPPED”, reason: “NO_EXTERNAL_ID” };

if (!autoAccept) { return { status: “MATCHED”, externalTripId, trip }; }

if (!acquireTripLock({ tenantId, externalTripId })) { return { status:
“SKIPPED”, reason: “LOCKED”, externalTripId }; }

try { const claimResult = await connector.claimTrip(externalTripId, {
legs: trip.legs || [] });

    if (!claimResult?.success) {
      return {
        status: "CLAIM_FAILED",
        externalTripId,
        reason: claimResult?.reason || "UNKNOWN"
      };
    }

    const rawAccepted = await extractFullAcceptedTrip({
      connector,
      externalTripId,
      claimResult
    });

    const payload = normalizeMtmAcceptedTrip(rawAccepted);

    let imported = null;
    if (typeof receiveTrip === "function" && integration) {
      imported = await receiveTrip({
        integration,
        payload,
        eventType: "CREATE"
      });
    }

    return {
      status: "CLAIMED",
      externalTripId,
      assignmentNumber: claimResult.assignmentNumber || "",
      payload,
      imported
    };

} finally { releaseTripLock({ tenantId, externalTripId }); } }

async function runEngine({ engine, tenantId, integration, connector,
settings, query, receiveTrip }) { const trips = await
connector.listAvailableTrips(query);

const selected = engine === “LONG” ? selectLongTrips(trips, settings) :
selectShortTrips(trips, settings);

const limit = Math.max(0, Number(settings.tripLimit ??
selected.length)); const candidates = limit ? selected.slice(0, limit) :
[];

const results = []; for (const trip of candidates) { results.push( await
processCandidate({ tenantId, integration, connector, trip, autoAccept:
settings.autoAccept === true, receiveTrip }) ); }

return { engine, seen: trips.length, matched: selected.length, results
}; }

async function runMarketplaceCycle({ tenantId, integration, connector,
longSettings = {}, shortSettings = {}, query = {}, receiveTrip }) { if
(!connector) throw new Error(“MTM connector is required”);

const health = await connector.health(); if (!health?.connected) {
return { status: “CONNECTION_REQUIRED”, health }; }

const [longResult, shortResult] = await Promise.all([ runEngine({
engine: “LONG”, tenantId, integration, connector, settings:
longSettings, query, receiveTrip }), runEngine({ engine: “SHORT”,
tenantId, integration, connector, settings: shortSettings, query,
receiveTrip }) ]);

return { status: “OK”, scannedAt: new Date().toISOString(), long:
longResult, short: shortResult }; }

module.exports = { runMarketplaceCycle, runEngine, processCandidate };
