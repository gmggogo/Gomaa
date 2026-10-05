“use strict”;

/* DESTINATION PATH: server/services/mtm/mtmTripNormalizer.js

Maps the complete accepted MTM record into the existing
Broker/ExternalTrip payload while preserving every original field under
raw MTM data. */

function clean(value) { return String(value ?? ““).trim(); }

function first(…values) { for (const value of values) { if (value !==
undefined && value !== null && clean(value) !== ““) return value; }
return”“; }

function normalizeMtmAcceptedTrip(raw = {}) { const externalTripId =
clean( first(raw.assignmentNumber, raw.tripNumber, raw.externalTripId)
);

if (!externalTripId) { throw new Error(“MTM accepted trip is missing
Trip/Assignment identifier”); }

const serviceName = clean(first(raw.mode, raw.modeOfTransport,
raw.service)); const tripDate = clean(first(raw.appointmentDate,
raw.tripDate, raw.date)); const tripTime = clean(first(raw.pickupTime,
raw.appointmentTime, raw.time));

return { externalTripId, brokerTripId: clean(first(raw.tripNumber,
raw.externalTripId)), assignmentNumber: clean(raw.assignmentNumber),

    clientName: clean(first(raw.memberName, raw.clientName, raw.member)),
    memberId: clean(first(raw.memberId, raw.memberNumber)),

    tripDate,
    tripTime,
    appointmentTime: clean(raw.appointmentTime),
    returnTime: clean(first(raw.returnTime, raw.estimatedReturnTime)),

    pickup: clean(first(raw.pickupAddress, raw.pickup)),
    dropoff: clean(first(raw.dropoffAddress, raw.dropoff)),

    serviceName,
    service: serviceName,

    tripMiles: Number(first(raw.tripMiles, raw.distance, 0)) || 0,
    distance: Number(first(raw.tripMiles, raw.distance, 0)) || 0,
    price: Number(first(raw.price, raw.amount, 0)) || 0,

    passengerType: clean(raw.passengerType),
    levelOfService: clean(raw.levelOfService),
    totalPassengers: Number(first(raw.numberOfRiders, raw.totalPassengers, 1)) || 1,
    specialNeeds: raw.specialNeeds ?? "",
    brokerNotes: clean(
      [raw.pickupNotes, raw.dropoffNotes, raw.driverPickupNotes, raw.driverDropoffNotes]
        .filter(Boolean)
        .join(" | ")
    ),

    externalSource: "MTM_MARKETPLACE",
    brokerName: "MTM",
    brokerCode: "MT",

    mtm: {
      tripNumber: raw.tripNumber ?? "",
      assignmentNumber: raw.assignmentNumber ?? "",
      willCall: raw.willCall ?? false,
      pickupZip: raw.pickupZip ?? "",
      dropoffZip: raw.dropoffZip ?? "",
      legs: Array.isArray(raw.legs) ? raw.legs : [],
      raw: raw
    },

    // Existing dynamic broker field discovery can inspect this complete payload.
    rawPayload: raw

}; }

module.exports = { normalizeMtmAcceptedTrip };
