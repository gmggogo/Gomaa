"use strict";

class MtmConnector {
  constructor(options = {}) {
    this.options = options;
    this.connected = false;
  }
  async connect() { throw new Error("connect() must be implemented by the MTM connector"); }
  async disconnect() { this.connected = false; return { success: true }; }
  async health() { return { connected: this.connected }; }
  async listAvailableTrips() { throw new Error("listAvailableTrips() must be implemented"); }
  async getTripDetails() { throw new Error("getTripDetails() must be implemented"); }
  async claimTrip() { throw new Error("claimTrip() must be implemented"); }
  async getAcceptedTrip() { throw new Error("getAcceptedTrip() must be implemented"); }
}
module.exports = MtmConnector;
