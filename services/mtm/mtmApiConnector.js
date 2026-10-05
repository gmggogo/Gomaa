“use strict”;

/* DESTINATION PATH: server/services/mtm/mtmApiConnector.js

Future official MTM API connector. Kept behind the same connector
contract so the Marketplace engines do not change when/if MTM approves
GH Mobility for the required API capabilities. */

const MtmConnector = require(“./mtmConnector”);

class MtmApiConnector extends MtmConnector { async connect() { return {
connected: false, status: “NOT_CONFIGURED”, message: “Official MTM
Marketplace API is not configured.” }; }

async health() { return { connected: false, status: “NOT_CONFIGURED” };
}

async listAvailableTrips() { throw new Error(“Official MTM Marketplace
API is not configured”); }

async getTripDetails() { throw new Error(“Official MTM Marketplace API
is not configured”); }

async claimTrip() { throw new Error(“Official MTM Marketplace API is not
configured”); }

async getAcceptedTrip() { throw new Error(“Official MTM Marketplace API
is not configured”); } }

module.exports = MtmApiConnector;
