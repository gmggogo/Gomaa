“use strict”;

/* DESTINATION PATH: server/services/mtm/mtmPortalConnector.js

IMPORTANT: This is the real Provider Portal connector shell. It
intentionally does NOT contain guessed MTM selectors/endpoints. Those
must be captured from an authorized real MTM session before activation.
MFA/OTP is never bypassed or stored here. */

const MtmConnector = require(“./mtmConnector”);

class MtmPortalConnector extends MtmConnector { constructor(options =
{}) { super(options); this.tenantId = options.tenantId;
this.integrationId = options.integrationId; this.session =
options.session || null; }

async connect() { return { connected: false, verificationRequired: true,
status: “REAL_PORTAL_MAPPING_REQUIRED”, message: “Portal connector is
ready for real MTM DOM/network mapping. No selectors or MTM endpoints
are guessed.” }; }

async health() { return { connected: false, verificationRequired: true,
status: “REAL_PORTAL_MAPPING_REQUIRED” }; }

async listAvailableTrips() { throw new Error( “MTM Portal mapping is not
configured yet. Capture the authorized Marketplace DOM/network flow
first.” ); }

async getTripDetails() { throw new Error(“MTM Portal trip-detail mapping
is not configured yet”); }

async claimTrip() { throw new Error(“MTM Portal claim mapping is not
configured yet”); }

async getAcceptedTrip() { throw new Error(“MTM Portal Assignments
mapping is not configured yet”); } }

module.exports = MtmPortalConnector;
