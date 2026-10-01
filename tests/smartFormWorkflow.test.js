"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSmartFormTripPayload } = require("../server/services/smartFormWorkflow");

const submission = (id, overrides = {}) => ({
  _id: id,
  tripNumber: `SFSU${id}`,
  tenantId: "tenant-1",
  templateId: `template-${id}`,
  templateName: `Template ${id}`,
  formData: { "Client Name": `Client ${id}`, "Wheelchair": "Yes" },
  fieldSnapshot: [{ key: "Wheelchair", label: "Wheelchair", type: "TEXT" }],
  clientName: `Client ${id}`,
  pickupAddress: `Pickup ${id}`,
  dropoffAddress: `Dropoff ${id}`,
  stops: [],
  tripDate: "2026-10-02",
  pickupTime: "10:00 AM",
  serviceName: "Standard",
  pricing: { calculated: true, amount: 25 },
  ...overrides
});

test("individual Smart Form trip is staged for final review with its real template data", () => {
  const row = submission("1", { pickupLat: null, pickupLng: null });
  const payload = buildSmartFormTripPayload({
    tenantId: row.tenantId,
    submissions: [row],
    group: null,
    actorName: "dispatcher@example.com"
  });

  assert.equal(payload.source, "SMART_FORM");
  assert.equal(payload.tripNumber, row.tripNumber);
  assert.equal(payload.dispatchSelected, false);
  assert.equal(payload.disabled, true);
  assert.equal(payload.pickupLat, null);
  assert.equal(payload.pickupLng, null);
  assert.equal(payload.isShared, false);
  assert.deepEqual(payload.bookingData.smartFormSubmissions[0].formData, row.formData);
  assert.deepEqual(payload.bookingData.smartFormSubmissions[0].fieldSnapshot, row.fieldSnapshot);
  assert.equal(payload.bookingData.smartFormSubmissions[0].templateId, row.templateId);
});

test("shared Smart Form trip keeps each submission and passenger tied to its own template data", () => {
  const rows = [submission("1"), submission("2", { pickupTime: "10:05 AM" })];
  const payload = buildSmartFormTripPayload({
    tenantId: "tenant-1",
    submissions: rows,
    group: { groupId: "SF-GROUP-1", routeMiles: 7.5, routeMinutes: 18 },
    actorName: "dispatcher@example.com"
  });

  assert.equal(payload.isShared, true);
  assert.equal(payload.tripType, "SHARED");
  assert.equal(payload.groupId, "SF-GROUP-1");
  assert.equal(payload.totalPassengers, 2);
  assert.deepEqual(payload.passengers.map(x => x.passengerId), ["1", "2"]);
  assert.deepEqual(payload.bookingData.smartFormSubmissions.map(x => x.formData), rows.map(x => x.formData));
  assert.deepEqual(payload.bookingData.smartFormSubmissions.map(x => x.fieldSnapshot), rows.map(x => x.fieldSnapshot));
});

test("an uncalculated template price is not presented as a real zero price", () => {
  const row = submission("3", { pricing: { calculated: false, amount: 0 } });
  const payload = buildSmartFormTripPayload({
    tenantId: row.tenantId,
    submissions: [row]
  });

  assert.equal(Object.hasOwn(payload, "priceAmount"), false);
  assert.equal(Object.hasOwn(payload.passengers[0], "priceAmount"), false);
});
