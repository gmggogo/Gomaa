"use strict";

const MtmConnector = require("./mtmConnector");

class MtmApiConnector extends MtmConnector {
  async connect() {
    this.connected = false;
    return {
      connected: false,
      status: "NOT_CONFIGURED",
      message: "Official MTM API Marketplace mapping is not configured yet."
    };
  }
  async health() { return { connected: false, status: "NOT_CONFIGURED" }; }
  async listAvailableTrips() { throw new Error("Official MTM API Marketplace mapping is not configured yet"); }
  async getTripDetails() { throw new Error("Official MTM API Marketplace mapping is not configured yet"); }
  async claimTrip() { throw new Error("Official MTM API Marketplace mapping is not configured yet"); }
  async getAcceptedTrip() { throw new Error("Official MTM API Marketplace mapping is not configured yet"); }
}
module.exports = MtmApiConnector;
