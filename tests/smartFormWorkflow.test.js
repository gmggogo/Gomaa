DESTINATION: tests/smartFormWorkflow.test.js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSmartFormTripPayload, smartFormSplitDateWindow, smartFormSplitDateKey } = require("../server/services/smartFormWorkflow");

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
  const rows = [
    submission("1", { stops: ["Stop 1-A", "Stop 1-B"] }),
    submission("2", { pickupTime: "10:05 AM", stops: ["Stop 2-A"] })
  ];
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
  assert.deepEqual(payload.passengers.map(x => x.stops), [
    ["Stop 1-A", "Stop 1-B"],
    ["Stop 2-A"]
  ]);
  assert.deepEqual(payload.bookingData.smartFormSubmissions.map(x => x.formData), rows.map(x => x.formData));
  assert.deepEqual(payload.bookingData.smartFormSubmissions.map(x => x.fieldSnapshot), rows.map(x => x.fieldSnapshot));
});

test("Smart Form Review aligns each rider with that rider's route and omits driver columns", () => {
  const html = fs.readFileSync(path.join(__dirname, "../server/public/admin/smart-form-review.html"), "utf8");
  const script = fs.readFileSync(path.join(__dirname, "../server/public/admin/js/smart-form-review.js"), "utf8");

  assert.doesNotMatch(html, />\s*Driver\s*</i);
  assert.doesNotMatch(html, />\s*Vehicle\s*</i);
  assert.match(script, /function\s+reviewMemberRows\s*\(/);
  assert.match(script, /member\.stops/);
  assert.match(script, /rows\.map\(member=>member\.pickupTime/);
  assert.match(script, /rows\.map\(member=>member\.pickup/);
  assert.match(script, /rows\.map\(member=>member\.dropoff/);
});

test("Smart Form Review mirrors Broker Review controls and gold stat cards", () => {
  const html = fs.readFileSync(path.join(__dirname, "../server/public/admin/smart-form-review.html"), "utf8");
  const script = fs.readFileSync(path.join(__dirname, "../server/public/admin/js/smart-form-review.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../server/routes/smartFormRoutes.js"), "utf8");

  for (const id of [
    "selectAllBtn", "confirmSelectedBtn", "deleteSelectedBtn",
    "statSharedGroups", "statSharedTrips", "statSharedPassengers",
    "statIndividualTrips", "statNewTrips", "statActiveTemplates"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);

  for (const label of [
    "Shared Groups", "Shared Trips", "Shared Passengers",
    "Individual Trips", "New Trips", "Active Templates"
  ]) assert.match(html, new RegExp(label), `missing ${label} card`);

  assert.doesNotMatch(html, /Back to Split|Refresh|Send Selected to Dispatch|Ready for Dispatch|Staged Trips/i);
  assert.match(script, /data-confirm/);
  assert.match(script, /data-edit/);
  assert.match(script, /deleteSelectedBtn/);
  assert.match(script, /workflow\/review\/delete/);
  assert.match(script, /workflow\/review\/edit/);
  assert.match(script, /confirmTrip\(/);
  assert.doesNotMatch(script, /sendDispatchBtn|refreshTopBtn|selectNoneBtn/);
  assert.match(routes, /router\.patch\("\/workflow\/review\/edit\/:tripId"/);
  assert.match(routes, /router\.post\("\/workflow\/review\/delete"/);
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

test("Smart Form Split mirrors the Broker Split tabs, actions, and gold dashboard", () => {
  const html = fs.readFileSync(path.join(__dirname, "../server/public/admin/smart-form-split.html"), "utf8");

  for (const id of [
    "templateFilter", "dayFilter", "tripSearch", "selectAllBtn", "shareBtn",
    "restoreBtn", "confirmAllBtn", "originalTabBtn", "individualTabBtn",
    "sharedTabBtn", "originalTripRows", "individualTripRows", "sharedGroups"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);

  for (const label of [
    "Total Trips", "New Trips", "Individual Trips", "Shared Group Trips",
    "Selected", "Confirmed", "Active Templates", "With Stops"
  ]) assert.match(html, new RegExp(label), `missing ${label} card`);

  assert.match(html, /class=["'][^"']*stat-gold/);
  assert.doesNotMatch(html, /Broker Trip ID|Active Brokers/);
});

test("Smart Form submissions track their Broker-style Split lane", () => {
  const model = fs.readFileSync(path.join(__dirname, "../server/models/SmartFormSubmission.js"), "utf8");
  assert.match(model, /splitDisposition\s*:\s*\{[^}]*enum\s*:\s*\["ORIGINAL","INDIVIDUAL","SHARED"\][^}]*default\s*:\s*"ORIGINAL"/s);
});

test("Smart Form Split only asks the server for today and tomorrow", () => {
  assert.equal(typeof smartFormSplitDateWindow, "function");
  assert.deepEqual(
    smartFormSplitDateWindow(new Date("2026-10-01T08:30:00.000Z"), "America/Phoenix"),
    { today: "2026-10-01", tomorrow: "2026-10-02" }
  );
});

test("Smart Form Split tab order is Original, Share, then Individual", () => {
  const html = fs.readFileSync(path.join(__dirname, "../server/public/admin/smart-form-split.html"), "utf8");
  const original = html.indexOf('id="originalTabBtn"');
  const shared = html.indexOf('id="sharedTabBtn"');
  const individual = html.indexOf('id="individualTabBtn"');

  assert.ok(original >= 0 && shared > original && individual > shared);
});

test("Smart Form Split matches common saved date formats to the same day", () => {
  assert.equal(smartFormSplitDateKey("2026-10-01", "America/Phoenix"), "2026-10-01");
  assert.equal(smartFormSplitDateKey("2026-10-1", "America/Phoenix"), "2026-10-01");
  assert.equal(smartFormSplitDateKey("10/1/2026", "America/Phoenix"), "2026-10-01");
  assert.equal(smartFormSplitDateKey("10/01/2026", "America/Phoenix"), "2026-10-01");
  assert.equal(smartFormSplitDateKey("2026-10-01T15:00:00.000Z", "America/Phoenix"), "2026-10-01");
});

test("Smart Form Split uses the same current-session token priority as the Hub", () => {
  const script = fs.readFileSync(path.join(__dirname, "../server/public/admin/js/smart-form-split.js"), "utf8");
  const sessionToken = script.indexOf('sessionStorage.getItem("token")');
  const localToken = script.indexOf('localStorage.getItem("token")');

  assert.ok(sessionToken >= 0 && localToken > sessionToken);
});

test("restoring a Smart Form share group sends its trips to Original", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../server/routes/smartFormRoutes.js"), "utf8");
  const restoreStart = routes.indexOf('router.post("/workflow/split/restore"');
  const restoreEnd = routes.indexOf('router.post("/workflow/split/restore-individuals"', restoreStart);
  const restoreRoute = routes.slice(restoreStart, restoreEnd);

  assert.match(restoreRoute, /splitDisposition:"ORIGINAL"/);
  assert.doesNotMatch(restoreRoute, /splitDisposition:"INDIVIDUAL"/);
});

test("Restore Original opens the Original tab after either restore action", () => {
  const script = fs.readFileSync(path.join(__dirname, "../server/public/admin/js/smart-form-split.js"), "utf8");
  const restoreHandler = script.slice(script.indexOf('$("restoreBtn").onclick'), script.indexOf('$("confirmAllBtn").onclick'));
  assert.match(restoreHandler, /state\.activeTab="ORIGINAL"/);
});

test("Smart Form Split hides every Share control when the SHARED service is disabled", () => {
  const script = fs.readFileSync(path.join(__dirname, "../server/public/admin/js/smart-form-split.js"), "utf8");
  assert.match(script, /\/api\/shared-engine\/settings/);
  assert.match(script, /sharedServiceEnabled/);
  assert.match(script, /sharedServiceFound/);
  assert.match(script, /sharedTabBtn[\s\S]*classList\.toggle\("hidden",!sharedAllowed\)/);
  assert.match(script, /shareBtn[\s\S]*classList\.toggle\("hidden",!sharedAllowed\)/);
  assert.match(script, /splitTabs[\s\S]*classList\.toggle\("two-tabs",!sharedAllowed\)/);
});
