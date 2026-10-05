"use strict";

const longEngine = require("./mtmLongTripEngine");
const shortEngine = require("./mtmShortTripEngine");
const lockService = require("./mtmTripLockService");
const fullExtractor = require("./mtmFullTripExtractor");
const normalizer = require("./mtmTripNormalizer");

let receiveTrip = null;
try {
  const brokerService = require("../brokerIntegrationService");
  receiveTrip = brokerService.receiveTrip || null;
} catch (_err) {}

class MtmMarketplaceWorker {
  constructor(options = {}) {
    this.tenantId = options.tenantId;
    this.tenantSlug = options.tenantSlug || "";
    this.integrationId = options.integrationId || null;
    this.connector = options.connector;
    this.settings = options.settings || {};
    this.integration = options.integration || null;
  }

  async processCandidate(trip, engineName, engineSettings) {
    const id = trip.externalTripId || trip.tripNumber;
    return lockService.withLock(this.tenantId, id, async () => {
      if (!engineSettings.autoAccept) return { engine: engineName, externalTripId: id, matched: true, claimed: false, reason: "AUTO_ACCEPT_OFF" };

      const claim = await this.connector.claimTrip(id);
      if (!claim || claim.claimed !== true) return { engine: engineName, externalTripId: id, claimed: false, reason: claim?.reason || "CLAIM_FAILED" };

      const full = await fullExtractor.extract({ connector: this.connector, externalTripId: id, claimResult: claim });
      const payload = normalizer.normalize(full);

      let imported = null;
      if (receiveTrip && this.integration) {
        imported = await receiveTrip({ integration: this.integration, payload, eventType: "CREATE" });
      }

      return { engine: engineName, externalTripId: id, claimed: true, payload, imported };
    });
  }

  async runEngine(name, candidates, settings) {
    const limit = Math.max(0, Number(settings.dailyTripLimit || 0));
    const selected = limit > 0 ? candidates.slice(0, limit) : candidates;
    return Promise.all(selected.map(t => this.processCandidate(t, name, settings)));
  }

  async runOnce() {
    if (!this.connector) throw new Error("MTM connector is required");
    const trips = await this.connector.listAvailableTrips({
      dateWindowDays: Number(this.settings.dateWindowDays || 7)
    });

    const longTrips = longEngine.select(trips, this.settings.longEngine || {});
    const shortTrips = shortEngine.select(trips, this.settings.shortEngine || {});

    const [longResults, shortResults] = await Promise.all([
      this.runEngine("LONG", longTrips, this.settings.longEngine || {}),
      this.runEngine("SHORT", shortTrips, this.settings.shortEngine || {})
    ]);

    return { scanned: trips.length, longResults, shortResults };
  }
}

module.exports = MtmMarketplaceWorker;
