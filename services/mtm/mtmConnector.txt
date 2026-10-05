“use strict”;

/* DESTINATION PATH: server/services/mtm/mtmConnector.js

Base contract shared by MOCK, PORTAL and future official API connectors.
*/

class MtmConnector { constructor(options = {}) { this.options = options;
}

async connect() { throw new Error(“connect() must be implemented by the
MTM connector”); }

async disconnect() { return true; }

async health() { return { connected: false, verificationRequired: false
}; }

async listAvailableTrips(_query = {}) { throw new
Error(“listAvailableTrips() must be implemented”); }

async getTripDetails(_externalTripId) { throw new
Error(“getTripDetails() must be implemented”); }

async claimTrip(_externalTripId, _options = {}) { throw new
Error(“claimTrip() must be implemented”); }

async getAcceptedTrip(_externalTripId, _claimResult = {}) { throw new
Error(“getAcceptedTrip() must be implemented”); } }

module.exports = MtmConnector;
