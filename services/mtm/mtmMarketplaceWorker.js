"use strict";

const longEngine = require("./mtmLongTripEngine");
const shortEngine = require("./mtmShortTripEngine");
const lockService = require("./mtmTripLockService");
const fullExtractor = require("./mtmFullTripExtractor");
const normalizer = require("./mtmTripNormalizer");
const Activity = require("../../models/MtmMarketplaceActivity");
const BrokerIntegration = require("../../models/BrokerIntegration");
const { receiveTrip } = require("../brokerIntegrationService");

const num = v => Number(v || 0);
const text = v => String(v ?? "").trim();

class MtmMarketplaceWorker {
  constructor(options = {}) {
    this.tenantId = options.tenantId;
    this.tenantSlug = options.tenantSlug || "";
    this.integrationId = options.integrationId || null;
    this.connector = options.connector;
    this.settings = options.settings || {};
    this.integration = options.integration || null;
    // Safe portal-discovery validation mode:
    // engines evaluate real discovered trips, but Claim/Accept is never executed.
    this.readOnlyEvaluation = options.readOnlyEvaluation === true;
  }

  async log(action, data = {}) {
    return Activity.create({
      tenantId: this.tenantId,
      integrationId: this.integration?._id || this.integrationId || null,
      engine: data.engine || "SYSTEM",
      action,
      externalTripId: text(data.trip?.externalTripId || data.trip?.tripNumber || data.externalTripId),
      assignmentNumber: text(data.assignmentNumber),
      message: text(data.message),
      reason: text(data.reason),
      miles: data.trip ? num(data.trip.tripMiles ?? data.trip.miles ?? data.trip.distance) : null,
      tripDate: text(data.trip?.appointmentDate || data.trip?.tripDate || data.trip?.date),
      pickupTime: text(data.trip?.pickupTime),
      mode: text(data.trip?.mode),
      meta: data.meta || {}
    });
  }

  dayStart() {
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
  }

  async claimedToday(engineName) {
    const q = { tenantId: this.tenantId, action: "CLAIMED", occurredAt: { $gte: this.dayStart() } };
    if (engineName) q.engine = engineName;
    return Activity.countDocuments(q);
  }

  async remainingLimit(engineName, engineSettings) {
    const engineLimit = Math.max(0, num(engineSettings.dailyTripLimit));
    const totalLimit = Math.max(0, num(this.settings.totalDailyTripLimit));
    const [engineUsed, totalUsed] = await Promise.all([
      this.claimedToday(engineName),
      this.claimedToday(null)
    ]);
    const engineRemaining = engineLimit > 0 ? Math.max(0, engineLimit - engineUsed) : Infinity;
    const totalRemaining = totalLimit > 0 ? Math.max(0, totalLimit - totalUsed) : Infinity;
    return Math.min(engineRemaining, totalRemaining);
  }

  async resolveIntegration() {
    if (this.integration && this.integration.enabled === true) {
      return this.integration;
    }

    const id =
      this.integration?._id ||
      this.integrationId ||
      this.settings?.integrationId ||
      null;

    if (!id) {
      throw new Error("MTM BrokerIntegration id is missing");
    }

    const integration = await BrokerIntegration.findOne({
      _id: id,
      tenantId: this.tenantId,
      enabled: true
    });

    if (!integration) {
      throw new Error("Enabled MTM BrokerIntegration was not found");
    }

    this.integration = integration;
    this.integrationId = integration._id;
    return integration;
  }

  async processCandidate(trip, engineName, engineSettings) {
    const id = text(trip.externalTripId || trip.tripNumber);
    return lockService.withLock(this.tenantId, id, async () => {
      await this.log("MATCHED", { engine: engineName, trip, message: `${engineName} engine matched trip ${id}` });

      if (this.readOnlyEvaluation) {
        await this.log("SKIPPED", {
          engine: engineName,
          trip,
          reason: "READ_ONLY_EVALUATION",
          message: `${engineName} matched trip ${id}; Claim/Accept blocked during portal validation`
        });
        return {
          engine: engineName,
          externalTripId: id,
          matched: true,
          claimed: false,
          reason: "READ_ONLY_EVALUATION"
        };
      }

      if (!engineSettings.autoAccept) {
        await this.log("SKIPPED", { engine: engineName, trip, reason: "AUTO_ACCEPT_OFF", message: "Matched trip left available because Auto Accept is OFF" });
        return { engine: engineName, externalTripId: id, matched: true, claimed: false, reason: "AUTO_ACCEPT_OFF" };
      }

      await this.log("CLAIM_ATTEMPT", { engine: engineName, trip, message: `Accepting ${id}` });
      const claim = await this.connector.claimTrip(id);
      if (!claim || claim.claimed !== true) {
        const reason = claim?.reason || "CLAIM_FAILED";
        await this.log("CLAIM_FAILED", { engine: engineName, trip, reason, message: `Accept failed: ${reason}` });
        return { engine: engineName, externalTripId: id, claimed: false, reason };
      }

      await this.log("CLAIMED", { engine: engineName, trip, assignmentNumber: claim.assignmentNumber, message: `Trip ${id} accepted successfully` });

      try {
        const full = await fullExtractor.extract({
          connector: this.connector,
          externalTripId: id,
          claimResult: claim
        });

        const payload = normalizer.normalize(full);
        const integration = await this.resolveIntegration();

        const imported = await receiveTrip({
          integration,
          payload,
          eventType: "CREATE"
        });

        const importedTrip =
          imported?.trip ||
          imported?.externalTrip ||
          imported;

        await this.log("IMPORTED", {
          engine: engineName,
          trip: full,
          assignmentNumber: full.assignmentNumber || claim.assignmentNumber,
          message: `Trip ${id} imported to Broker Hub`,
          meta: {
            importedId:
              importedTrip?._id ||
              importedTrip?.id ||
              null,
            duplicate: imported?.duplicate === true
          }
        });

        return {
          engine: engineName,
          externalTripId: id,
          claimed: true,
          payload,
          imported
        };
      } catch (err) {
        await this.log("IMPORT_FAILED", {
          engine: engineName,
          trip,
          assignmentNumber: claim.assignmentNumber,
          reason: "POST_CLAIM_IMPORT_FAILED",
          message: `Trip ${id} was claimed but Broker Hub import failed: ${err?.message || err}`
        });

        return {
          engine: engineName,
          externalTripId: id,
          claimed: true,
          imported: false,
          error: err?.message || String(err)
        };
      }
    });
  }

  async runEngine(name, candidates, settings) {
    const remaining = await this.remainingLimit(name, settings);
    if (remaining <= 0) {
      await this.log("SKIPPED", { engine: name, reason: "DAILY_LIMIT_REACHED", message: `${name} daily limit reached` });
      return [];
    }
    const selected = Number.isFinite(remaining) ? candidates.slice(0, remaining) : candidates;
    return Promise.all(selected.map(t => this.processCandidate(t, name, settings)));
  }

  async runOnce() {
    if (!this.connector) throw new Error("MTM connector is required");
    await this.log("SCAN", { message: `Marketplace scan started for next ${Number(this.settings.dateWindowDays || 7)} day(s)` });

    const trips = Array.isArray(this.settings.portalDiscoveredTrips)
      ? this.settings.portalDiscoveredTrips
      : await this.connector.listAvailableTrips({ dateWindowDays: Number(this.settings.dateWindowDays || 7) });
    await Promise.all(trips.map(trip => this.log("SEEN", { trip, message: `Marketplace trip seen: ${trip.externalTripId || trip.tripNumber}` })));

    const longTrips = longEngine.select(trips, this.settings.longEngine || {});
    const shortTrips = shortEngine.select(trips, this.settings.shortEngine || {});

    const [longResults, shortResults] = await Promise.all([
      this.runEngine("LONG", longTrips, this.settings.longEngine || {}),
      this.runEngine("SHORT", shortTrips, this.settings.shortEngine || {})
    ]);

    return { scanned: trips.length, longMatched: longTrips.length, shortMatched: shortTrips.length, longResults, shortResults };
  }
}

module.exports = MtmMarketplaceWorker;
