"use strict";

async function extract({ connector, externalTripId, claimResult }) {
  if (!connector) throw new Error("MTM connector is required");
  if (!externalTripId) throw new Error("MTM externalTripId is required");
  const accepted = await connector.getAcceptedTrip(externalTripId);
  if (!accepted) throw new Error("Accepted MTM trip could not be loaded");
  return {
    ...accepted,
    claimResult: claimResult || null,
    mtmCapturedAt: new Date().toISOString()
  };
}

module.exports = { extract };
