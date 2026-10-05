"use strict";

const MtmConnector = require("./mtmConnector");

class MtmPortalConnector extends MtmConnector {
  constructor(options = {}) {
    super(options);
    this.verificationRequired = false;
  }
  async connect({ username, password } = {}) {
    if (!username || !password) throw new Error("MTM username and password are required");
    this.connected = false;
    return {
      connected: false,
      verificationRequired: false,
      status: "REAL_PORTAL_MAPPING_REQUIRED",
      message: "MTM Provider Portal connector is ready for authorized real portal mapping. No selectors or endpoints are guessed."
    };
  }
  async verifyMfa() {
    return {
      connected: false,
      verificationRequired: true,
      status: "REAL_PORTAL_MAPPING_REQUIRED",
      message: "Authorized MTM MFA mapping is not configured yet."
    };
  }
  async disconnect() {
    this.connected = false;
    this.verificationRequired = false;
    return { success: true, connected: false };
  }
  async health() {
    return {
      connected: this.connected,
      verificationRequired: this.verificationRequired,
      status: this.connected ? "CONNECTED" : "REAL_PORTAL_MAPPING_REQUIRED"
    };
  }
  async listAvailableTrips() { throw new Error("Authorized MTM Provider Portal mapping is required before scanning"); }
  async getTripDetails() { throw new Error("Authorized MTM Provider Portal mapping is required"); }
  async claimTrip() { throw new Error("Authorized MTM Provider Portal mapping is required before claiming"); }
  async getAcceptedTrip() { throw new Error("Authorized MTM Provider Portal mapping is required"); }
}
module.exports = MtmPortalConnector;
