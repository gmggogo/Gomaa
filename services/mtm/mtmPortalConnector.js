"use strict";

/* DESTINATION PATH: server/services/mtm/mtmPortalConnector.js

   MTM Provider Portal - Discovery-safe connector.

   IMPORTANT:
   - This file does NOT guess MTM URLs, selectors, login fields, or claim endpoints.
   - It can consume structured JSON captured from an authorized portal session.
   - Claiming remains disabled until the real MTM claim request is mapped and verified.
   - The parser intentionally understands the AvailableTask-style structure observed
     during discovery, while keeping the complete raw object for later mapping.
*/

const MtmConnector = require("./mtmConnector");

const clean = value => String(value ?? "").trim();
const num = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function objectId(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return clean(value);
  return clean(value.id || value._id || value.value || "");
}

function addressOf(location) {
  if (!location) return "";
  if (typeof location === "string") return clean(location);
  return clean(
    location.address ||
    location.address1 ||
    location.formattedAddress ||
    location.fullAddress ||
    location.name ||
    ""
  );
}

function zipOf(location) {
  if (!location || typeof location !== "object") return "";
  return clean(location.zip || location.zipCode || location.postalCode || "");
}

function memberName(member) {
  if (!member) return "";
  if (typeof member === "string") return clean(member);
  const direct = clean(member.name || member.fullName || member.displayName || "");
  if (direct) return direct;
  return [member.firstName, member.middleName, member.lastName]
    .map(clean)
    .filter(Boolean)
    .join(" ");
}

function losName(value) {
  if (!value) return "";
  if (typeof value === "string") return clean(value);
  return clean(value.name || value.description || value.code || value.id || "");
}

function looksLikeAvailableTask(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const typename = clean(obj.__typename).toLowerCase();
  if (typename === "availabletask") return true;
  return Boolean(
    obj.availableTaskId &&
    (obj.pickupLocation || obj.dropoffLocation || obj.pickupDatetimeLocal || obj.tripMiles || obj.distanceMeters)
  );
}

function collectAvailableTasks(root) {
  const found = [];
  const seenObjects = new WeakSet();
  const seenIds = new Set();

  function walk(value) {
    if (!value || typeof value !== "object") return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);

    if (looksLikeAvailableTask(value)) {
      const id = clean(value.availableTaskId || value.id || "");
      const dedupeKey = id || JSON.stringify(value).slice(0, 500);
      if (!seenIds.has(dedupeKey)) {
        seenIds.add(dedupeKey);
        found.push(value);
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }

    for (const child of Object.values(value)) walk(child);
  }

  walk(root);
  return found;
}

function normalizeAvailableTask(task) {
  const reservation = task?.reservation && typeof task.reservation === "object" ? task.reservation : {};
  const member = task?.member && typeof task.member === "object" ? task.member : {};
  const pickup = task?.pickupLocation;
  const dropoff = task?.dropoffLocation;
  const los = task?.levelOfService;

  const meters = num(task?.distanceMeters);
  const milesFromMeters = meters > 0 ? meters / 1609.344 : 0;
  const tripMiles = num(task?.tripMiles || task?.miles || task?.distanceMiles) || milesFromMeters;

  const externalTripId = clean(
    task?.availableTaskId ||
    reservation?.tripNumber ||
    reservation?.id ||
    task?.id
  );

  return {
    externalTripId,
    availableTaskId: clean(task?.availableTaskId || ""),
    tripNumber: clean(reservation?.tripNumber || reservation?.reservationNumber || reservation?.id || externalTripId),
    assignmentNumber: clean(task?.assignmentNumber || reservation?.assignmentNumber || ""),

    memberName: memberName(member),
    memberId: objectId(member?.memberId || member?.id || ""),
    passengerType: clean(task?.passengerType?.name || task?.passengerType || member?.passengerType || ""),
    numberOfRiders: num(task?.numberOfRiders || task?.numberOfCompanions || 1) || 1,

    appointmentDate: clean(task?.appointmentDate || task?.appointmentDateLocal || reservation?.appointmentDate || ""),
    appointmentTime: clean(task?.appointmentTime || task?.appointmentTimeLocal || ""),
    pickupTime: clean(task?.pickupDatetimeLocal || task?.pickupDateTimeLocal || task?.pickupTime || ""),
    dropoffTime: clean(task?.dropoffDatetimeLocal || task?.dropoffDateTimeLocal || task?.dropoffTime || ""),

    pickupAddress: addressOf(pickup),
    pickupZip: zipOf(pickup),
    dropoffAddress: addressOf(dropoff),
    dropoffZip: zipOf(dropoff),

    levelOfService: losName(los),
    mode: clean(task?.mode?.name || task?.mode || losName(los)),
    tripMiles: Number(tripMiles.toFixed(2)),
    distanceMeters: meters,
    durationSeconds: num(task?.durationSeconds),

    price: num(
      task?.price ||
      task?.earningsAmount ||
      task?.carePartnerEarningsEstimate?.amount ||
      task?.taskEarningsEstimate?.amount ||
      task?.vendorEarningsEstimate?.amount ||
      0
    ),

    driverPickupNotes: clean(task?.driverPickupNotes || reservation?.driverPickupNotes || ""),
    driverDropoffNotes: clean(task?.driverDropoffNotes || reservation?.driverDropoffNotes || ""),
    specialNeeds: clean(task?.specialNeeds || member?.specialNeeds || ""),
    status: clean(task?.status || reservation?.status || ""),

    providerId: objectId(task?.providerId || task?.provider || ""),
    raw: task
  };
}

class MtmPortalConnector extends MtmConnector {
  constructor(options = {}) {
    super(options);
    this.verificationRequired = false;
    this.discoveryMode = true;
    this.discoveryPayloads = [];
    this.discoveryTrips = new Map();
    this.lastDiscoveryAt = null;
  }

  /*
    Real browser/session login is intentionally not faked here.
    The future browser/desktop agent should call ingestDiscoveryPayload() with
    authorized response JSON while discoveryMode is enabled.
  */
  async connect({ username, password } = {}) {
    if (!username || !password) {
      return {
        connected: false,
        verificationRequired: false,
        discoveryMode: true,
        status: "INTERACTIVE_AGENT_REQUIRED",
        message: "Use the authorized MTM browser/desktop agent for interactive login. Credentials are not stored by this connector."
      };
    }

    this.connected = false;
    return {
      connected: false,
      verificationRequired: false,
      discoveryMode: true,
      status: "REAL_LOGIN_MAPPING_REQUIRED",
      message: "Credentials were supplied, but real MTM login is not mapped yet. No login URL or selector was guessed."
    };
  }

  async verifyMfa() {
    return {
      connected: false,
      verificationRequired: true,
      discoveryMode: true,
      status: "INTERACTIVE_VERIFICATION_REQUIRED",
      message: "Complete any MTM verification in the authorized browser session. No MFA bypass is implemented."
    };
  }

  async disconnect() {
    this.connected = false;
    this.verificationRequired = false;
    this.discoveryPayloads = [];
    this.discoveryTrips.clear();
    return { success: true, connected: false };
  }

  async health() {
    return {
      connected: this.connected,
      verificationRequired: this.verificationRequired,
      discoveryMode: this.discoveryMode,
      discoveredTrips: this.discoveryTrips.size,
      lastDiscoveryAt: this.lastDiscoveryAt,
      status: this.connected ? "CONNECTED" : "DISCOVERY_READY"
    };
  }

  ingestDiscoveryPayload(payload, meta = {}) {
    if (!payload || typeof payload !== "object") {
      return { accepted: false, discovered: 0, reason: "JSON_OBJECT_REQUIRED" };
    }

    const tasks = collectAvailableTasks(payload);
    const added = [];

    for (const task of tasks) {
      const normalized = normalizeAvailableTask(task);
      if (!normalized.externalTripId) continue;

      const previous = this.discoveryTrips.get(normalized.externalTripId) || {};
      const merged = {
        ...previous,
        ...normalized,
        discovery: {
          ...(previous.discovery || {}),
          capturedAt: new Date().toISOString(),
          sourceUrl: clean(meta.url || meta.sourceUrl || ""),
          operationName: clean(meta.operationName || ""),
          readOnly: true
        }
      };

      this.discoveryTrips.set(normalized.externalTripId, merged);
      added.push(merged);
    }

    this.lastDiscoveryAt = new Date();
    this.discoveryPayloads.push({
      capturedAt: this.lastDiscoveryAt,
      meta: { ...meta },
      taskCount: added.length
    });
    if (this.discoveryPayloads.length > 100) this.discoveryPayloads.shift();

    return {
      accepted: true,
      discovered: added.length,
      totalDiscovered: this.discoveryTrips.size,
      trips: added
    };
  }

  async listAvailableTrips() {
    return Array.from(this.discoveryTrips.values());
  }

  async getTripDetails(externalTripId) {
    return this.discoveryTrips.get(clean(externalTripId)) || null;
  }

  async claimTrip() {
    return {
      claimed: false,
      reason: "DISCOVERY_READ_ONLY",
      message: "Claim/Accept is disabled until the real MTM claim request is captured, mapped, and verified."
    };
  }

  async getAcceptedTrip(externalTripId) {
    const trip = this.discoveryTrips.get(clean(externalTripId));
    if (!trip) return null;
    return { ...trip, discoveryReadOnly: true };
  }

  getDiscoverySummary() {
    return {
      discoveryMode: true,
      totalPayloads: this.discoveryPayloads.length,
      totalTrips: this.discoveryTrips.size,
      lastDiscoveryAt: this.lastDiscoveryAt,
      trips: Array.from(this.discoveryTrips.values())
    };
  }
}

MtmPortalConnector.collectAvailableTasks = collectAvailableTasks;
MtmPortalConnector.normalizeAvailableTask = normalizeAvailableTask;

module.exports = MtmPortalConnector;
