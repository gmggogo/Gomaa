"use strict";

const MtmConnector = require("./mtmConnector");

class MtmMockConnector extends MtmConnector {
  constructor(options = {}) {
    super(options);
    this.claimed = new Set();
    this.trips = [
      {
        externalTripId: "MTM-MOCK-LONG-001",
        tripNumber: "MTM-MOCK-LONG-001",
        appointmentDate: "2026-10-12",
        pickupTime: "09:00",
        appointmentTime: "10:00",
        pickupAddress: "200 E Knox Rd, Chandler, AZ 85225",
        dropoffAddress: "Phoenix, AZ 85001",
        pickupZip: "85225",
        dropoffZip: "85001",
        tripMiles: 118.4,
        mode: "Cab",
        passengerType: "Ambulatory",
        levelOfService: "Standard",
        numberOfRiders: 1,
        specialNeeds: "",
        driverPickupNotes: "Mock pickup note",
        driverDropoffNotes: "Mock dropoff note",
        price: 175,
        legs: [{ leg: "A", pickupTime: "09:00" }, { leg: "B", pickupTime: "14:00" }]
      },
      {
        externalTripId: "MTM-MOCK-SHORT-001",
        tripNumber: "MTM-MOCK-SHORT-001",
        appointmentDate: "2026-10-12",
        pickupTime: "11:30",
        appointmentTime: "12:00",
        pickupAddress: "Chandler, AZ 85224",
        dropoffAddress: "Chandler, AZ 85225",
        pickupZip: "85224",
        dropoffZip: "85225",
        tripMiles: 12.8,
        mode: "Cab",
        passengerType: "Ambulatory",
        levelOfService: "Standard",
        numberOfRiders: 1,
        specialNeeds: "",
        price: 34,
        legs: [{ leg: "A", pickupTime: "11:30" }]
      }
    ];
  }
  async connect() { this.connected = true; return { connected: true, status: "CONNECTED", mock: true }; }
  async listAvailableTrips() { return this.trips.filter(t => !this.claimed.has(t.externalTripId)); }
  async getTripDetails(externalTripId) {
    return this.trips.find(x => x.externalTripId === externalTripId) || null;
  }
  async claimTrip(externalTripId) {
    const trip = await this.getTripDetails(externalTripId);
    if (!trip || this.claimed.has(externalTripId)) return { success: false, claimed: false, reason: "NOT_AVAILABLE" };
    this.claimed.add(externalTripId);
    return { success: true, claimed: true, externalTripId, assignmentNumber: "ASN-" + externalTripId };
  }
  async getAcceptedTrip(externalTripId) {
    if (!this.claimed.has(externalTripId)) return null;
    const trip = await this.getTripDetails(externalTripId);
    return trip ? { ...trip, assignmentNumber: "ASN-" + externalTripId, accepted: true } : null;
  }
}
module.exports = MtmMockConnector;
