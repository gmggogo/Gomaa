
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const planner = require("../server/services/mtm/marketplaceTripPlanner");

test("classifies mileage using company-configured thresholds", () => {
  const bands = { longMinMiles: 120, mediumMinMiles: 60 };
  assert.equal(planner.classifyTrip({ tripMiles: 121 }, bands), "LONG");
  assert.equal(planner.classifyTrip({ tripMiles: 60 }, bands), "MEDIUM");
  assert.equal(planner.classifyTrip({ tripMiles: 59 }, bands), "SHORT");
});

test("keeps long and medium candidates available together and defers short claims", () => {
  const result = planner.buildCandidateTiers([
    { externalTripId: "S1", tripMiles: 20 },
    { externalTripId: "M1", tripMiles: 80 },
    { externalTripId: "L1", tripMiles: 180 },
    { externalTripId: "M2", tripMiles: 100 }
  ], { longMinMiles: 120, mediumMinMiles: 60 });

  assert.deepEqual(result.long.map(x => x.externalTripId), ["L1"]);
  assert.deepEqual(result.medium.map(x => x.externalTripId), ["M2", "M1"]);
  assert.deepEqual(result.short.map(x => x.externalTripId), ["S1"]);
  assert.deepEqual(
    planner.claimOrder(result).map(x => x.externalTripId),
    ["L1", "M2", "M1", "S1"]
  );
});

test("excludes already accepted trip ids before matching or claim", () => {
  const result = planner.removePreviouslyAccepted(
    [
      { externalTripId: "A" },
      { externalTripId: "B" },
      { externalTripId: "" }
    ],
    new Set(["A"])
  );
  assert.deepEqual(result.map(x => x.externalTripId), ["B"]);
});

test("permanently blocks confirmed, returned, pending, and uncertain claims but allows a verified no-click failure", () => {
  for (const status of ["CLAIM_PENDING", "CLAIMED", "CLAIM_UNKNOWN", "RETURNED"]) {
    assert.equal(planner.shouldBlockClaimRecord({ status }), true);
  }
  assert.equal(planner.shouldBlockClaimRecord({ status: "FAILED_NOT_CLICKED" }), false);
});

test("fingerprints the same ride consistently even when address capitalization differs", () => {
  const a = { tripDate: "2026-10-28", pickupTime: "08:00", memberName: "Pat Lee", pickup: "1 Main St", dropoff: "2 Oak Rd", mode: "Wheelchair" };
  const b = { tripDate: "2026-10-28", pickupTime: "08:00", memberName: "Pat Lee", pickup: "1 MAIN ST", dropoff: "2 OAK RD", mode: "Wheelchair" };
  assert.equal(planner.tripFingerprint(a), planner.tripFingerprint(b));
  assert.notEqual(planner.tripFingerprint(a), planner.tripFingerprint({ ...b, tripDate: "2026-10-29" }));
});

test("accepts early arrival and applies separate configurable lateness windows", () => {
  assert.equal(planner.withinArrivalWindow("08:00", "07:30", 15), true);
  assert.equal(planner.withinArrivalWindow("08:00", "08:15", 15), true);
  assert.equal(planner.withinArrivalWindow("08:00", "08:16", 15), false);
});

test("vehicle must be enabled and support both the trip category and service", () => {
  const vehicle = {
    enabled: true,
    tripCategories: { long: true, medium: false, short: true },
    services: ["WH"]
  };
  assert.equal(planner.vehicleSupportsTrip(vehicle, "LONG", "Wheelchair"), true);
  assert.equal(planner.vehicleSupportsTrip(vehicle, "MEDIUM", "Wheelchair"), false);
  assert.equal(planner.vehicleSupportsTrip(vehicle, "LONG", "Ambulatory"), false);
  assert.equal(planner.vehicleSupportsTrip({ ...vehicle, enabled: false }, "LONG", "WH"), false);
});
