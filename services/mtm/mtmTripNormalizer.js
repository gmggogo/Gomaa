"use strict";

const first = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
};

function normalize(raw = {}) {
  const externalTripId = String(first(raw.externalTripId, raw.tripNumber, raw.assignmentNumber)).trim();
  return {
    externalTripId,
    brokerTripId: String(first(raw.tripNumber, externalTripId)).trim(),
    brokerCode: "MT",
    brokerName: "MTM",
    externalSource: "MTM_MARKETPLACE",
    clientName: String(first(raw.memberName, raw.clientName, raw.passengerName)).trim(),
    memberId: String(first(raw.memberId, raw.memberNumber)).trim(),
    tripDate: String(first(raw.appointmentDate, raw.tripDate, raw.date)).trim(),
    tripTime: String(first(raw.pickupTime, raw.tripTime)).trim(),
    appointmentTime: String(first(raw.appointmentTime, raw.pickupTime)).trim(),
    returnTime: String(first(raw.returnTime, raw.dropoffTime)).trim(),
    pickup: String(first(raw.pickupAddress, raw.pickup)).trim(),
    dropoff: String(first(raw.dropoffAddress, raw.dropoff)).trim(),
    serviceType: String(first(raw.mode, raw.levelOfService)).trim(),
    totalPassengers: Number(first(raw.numberOfRiders, raw.totalPassengers, 1)) || 1,
    notes: [raw.driverPickupNotes, raw.driverDropoffNotes, raw.specialNeeds].filter(Boolean).join(" | "),
    priceAmount: Number(first(raw.price, raw.priceAmount, 0)) || 0,
    tripMiles: Number(first(raw.tripMiles, raw.miles, raw.distance, 0)) || 0,
    assignmentNumber: String(first(raw.assignmentNumber)).trim(),
    passengerType: String(first(raw.passengerType)).trim(),
    levelOfService: String(first(raw.levelOfService)).trim(),
    legs: Array.isArray(raw.legs) ? raw.legs : [],
    mtm: { raw },
    rawPayload: raw
  };
}

module.exports = { normalize };
