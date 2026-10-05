“use strict”;

/* DESTINATION PATH: server/services/mtm/mtmMockConnector.js

Safe development connector. No MTM credentials are needed. It simulates
Marketplace discovery -> claim -> full accepted trip extraction. */

const MtmConnector = require(“./mtmConnector”);

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function minutes(value) { const m = /^():()$/.exec(String(value || ““));
if (!m) return null; return Number(m[1]) * 60 + Number(m[2]); }

class MtmMockConnector extends MtmConnector { constructor(options = {})
{ super(options); this.claimed = new Set(); this.sequence = 1;

    this.trips = options.trips || [
      {
        externalTripId: "MTM-MOCK-LONG-001",
        tripNumber: "MTM-MOCK-LONG-001",
        appointmentDate: "2026-10-12",
        appointmentTime: "09:00",
        pickupTime: "07:15",
        estimatedDropoffTime: "10:30",
        pickupAddress: "200 E Knox Rd, Chandler, AZ 85225",
        pickupZip: "85225",
        dropoffAddress: "Tucson, AZ 85701",
        dropoffZip: "85701",
        tripMiles: 118.4,
        mode: "Cab",
        passengerType: "Ambulatory",
        levelOfService: "Curb to Curb",
        numberOfRiders: 1,
        specialNeeds: "",
        willCall: false,
        pickupNotes: "Mock long-trip pickup note",
        dropoffNotes: "Mock long-trip dropoff note",
        price: 0,
        legs: [
          { leg: "A", pickupTime: "07:15", tripMiles: 118.4 },
          { leg: "B", pickupTime: "14:00", tripMiles: 118.4 }
        ]
      },
      {
        externalTripId: "MTM-MOCK-SHORT-001",
        tripNumber: "MTM-MOCK-SHORT-001",
        appointmentDate: "2026-10-12",
        appointmentTime: "11:00",
        pickupTime: "10:15",
        estimatedDropoffTime: "10:50",
        pickupAddress: "Chandler, AZ 85224",
        pickupZip: "85224",
        dropoffAddress: "Mesa, AZ 85202",
        dropoffZip: "85202",
        tripMiles: 12.8,
        mode: "Cab",
        passengerType: "Ambulatory",
        levelOfService: "Curb to Curb",
        numberOfRiders: 1,
        specialNeeds: "",
        willCall: false,
        pickupNotes: "",
        dropoffNotes: "",
        price: 0,
        legs: [{ leg: "A", pickupTime: "10:15", tripMiles: 12.8 }]
      }
    ];

}

async connect() { return { connected: true, verificationRequired: false,
status: “CONNECTED” }; }

async health() { return { connected: true, verificationRequired: false,
status: “CONNECTED” }; }

async listAvailableTrips(query = {}) { const from =
minutes(query.timeFrom); const to = minutes(query.timeTo); const modes =
Array.isArray(query.modes) ? query.modes.map(String) : [];

    return clone(
      this.trips.filter((trip) => {
        if (this.claimed.has(trip.externalTripId)) return false;
        if (query.dateFrom && trip.appointmentDate < query.dateFrom) return false;
        if (query.dateTo && trip.appointmentDate > query.dateTo) return false;

        const t = minutes(trip.pickupTime);
        if (from !== null && t !== null && t < from) return false;
        if (to !== null && t !== null && t > to) return false;

        if (modes.length && !modes.includes(String(trip.mode))) return false;
        return true;
      })
    );

}

async getTripDetails(externalTripId) { const trip = this.trips.find((x)
=> x.externalTripId === externalTripId); if (!trip) throw new
Error(“Mock MTM trip not found”); return clone(trip); }

async claimTrip(externalTripId) { const trip = this.trips.find((x) =>
x.externalTripId === externalTripId); if (!trip) { return { success:
false, reason: “NOT_FOUND” }; }

    if (this.claimed.has(externalTripId)) {
      return { success: false, reason: "ALREADY_CLAIMED" };
    }

    this.claimed.add(externalTripId);

    return {
      success: true,
      externalTripId,
      tripNumber: trip.tripNumber,
      assignmentNumber: `MOCK-ASG-${String(this.sequence++).padStart(5, "0")}`,
      claimedAt: new Date().toISOString()
    };

}

async getAcceptedTrip(externalTripId, claimResult = {}) { const trip =
await this.getTripDetails(externalTripId);

    return {
      ...trip,
      assignmentNumber: claimResult.assignmentNumber || "",
      claimStatus: "ACCEPTED",
      rawSource: "MTM_MOCK",
      rawCapturedAt: new Date().toISOString()
    };

} }

module.exports = MtmMockConnector;
