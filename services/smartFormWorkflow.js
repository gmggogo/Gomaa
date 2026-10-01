/* DESTINATION: server/services/smartFormWorkflow.js */
"use strict";

function clean(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function smartFormSplitDateWindow(now = new Date(), timeZone = "America/Phoenix") {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: clean(timeZone) || "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const [year, month, day] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return { today, tomorrow };
}

function submissionPrice(submission) {
  if (submission?.pricing?.calculated === true) {
    return finite(submission.pricing.amount, null);
  }
  const value = submission?.finalPrice ?? submission?.priceAmount ?? submission?.total;
  return value === null || value === undefined || value === ""
    ? null
    : finite(value, null);
}

function templateSnapshot(submission) {
  return {
    submissionId: String(submission?._id || submission?.id || ""),
    templateId: String(submission?.templateId || ""),
    templateName: clean(submission?.templateName),
    fieldSnapshot: Array.isArray(submission?.fieldSnapshot)
      ? submission.fieldSnapshot
      : [],
    formData:
      submission?.formData && typeof submission.formData === "object"
        ? submission.formData
        : {},
    importSource:
      submission?.importSource && typeof submission.importSource === "object"
        ? submission.importSource
        : {}
  };
}

function passengerFromSubmission(submission, index) {
  const id = String(submission?._id || submission?.id || "");
  const price = submissionPrice(submission);
  const passenger = {
    passengerId: id,
    name: clean(submission?.clientName),
    clientName: clean(submission?.clientName),
    clientPhone: clean(submission?.clientPhone || submission?.phone),
    tripDate: clean(submission?.tripDate),
    tripTime: clean(submission?.pickupTime),
    pickupTime: clean(submission?.pickupTime),
    pickup: clean(submission?.pickupAddress),
    dropoff: clean(submission?.dropoffAddress),
    pickupLat: finite(submission?.pickupLat, null),
    pickupLng: finite(submission?.pickupLng, null),
    dropoffLat: finite(submission?.dropoffLat, null),
    dropoffLng: finite(submission?.dropoffLng, null),
    status: "Scheduled",
    source: "SMART_FORM",
    bookingSource: "SMART_FORM",
    pickupOrder: index + 1
  };
  if (price !== null) {
    passenger.priceAmount = price;
    passenger.finalPrice = price;
  }
  return passenger;
}

function buildSmartFormTripPayload({
  tenantId,
  submissions,
  group = null,
  actorName = ""
}) {
  const rows = Array.isArray(submissions) ? submissions : [];
  if (!rows.length) throw new Error("At least one Smart Form submission is required");

  const first = rows[0];
  const isShared = rows.length > 1 && Boolean(group);
  const prices = rows.map(submissionPrice);
  const totalPrice = prices.every(value => value !== null)
    ? prices.reduce((sum, value) => sum + value, 0)
    : null;
  const firstPickup = clean(first?.pickupAddress);
  const last = rows[rows.length - 1];
  const lastDropoff = clean(last?.dropoffAddress);
  const allStops = rows.flatMap(row =>
    Array.isArray(row?.stops) ? row.stops.map(clean).filter(Boolean) : []
  );

  return {
    tenantId,
    type: "company",
    tripNumber: clean(group?.tripNumber || first?.tripNumber),
    company: clean(first?.organizationName || first?.templateName || "Smart Form"),
    entryName: clean(actorName),
    entryPhone: "",
    clientName: clean(first?.clientName),
    clientPhone: clean(first?.clientPhone || first?.phone),
    serviceType: clean(first?.serviceName),
    serviceKey: clean(first?.serviceName),
    serviceCode: clean(first?.serviceName),
    pickup: isShared ? firstPickup : clean(first?.pickupAddress),
    pickupLat: finite(first?.pickupLat, null),
    pickupLng: finite(first?.pickupLng, null),
    dropoff: isShared ? lastDropoff : clean(first?.dropoffAddress),
    dropoffLat: finite(last?.dropoffLat, null),
    dropoffLng: finite(last?.dropoffLng, null),
    stops: allStops,
    stopCoords: Array.isArray(first?.stopCoords) ? first.stopCoords : [],
    tripDate: clean(group?.tripDate || first?.tripDate),
    tripTime: clean(group?.calculatedFirstPickupTime || first?.pickupTime),
    isShared,
    groupId: isShared ? clean(group?.groupId) : "",
    tripType: isShared ? "SHARED" : "INDIVIDUAL",
    totalPassengers: rows.length,
    passengers: rows.map(passengerFromSubmission),
    miles: finite(group?.routeMiles ?? first?.distanceMiles),
    distanceMiles: finite(group?.routeMiles ?? first?.distanceMiles),
    estimatedMinutes: finite(group?.routeMinutes ?? first?.durationMinutes),
    durationMinutes: finite(group?.routeMinutes ?? first?.durationMinutes),
    ...(totalPrice === null ? {} : { priceAmount: totalPrice, finalPrice: totalPrice }),
    bookingData: {
      smartFormSubmissions: rows.map(templateSnapshot)
    },
    source: "SMART_FORM",
    bookingSource: "SMART_FORM",
    status: "Scheduled",
    dispatchSelected: false,
    disabled: true,
    bookedAt: new Date(),
    createdAt: new Date()
  };
}

module.exports = {
  buildSmartFormTripPayload,
  templateSnapshot,
  passengerFromSubmission,
  smartFormSplitDateWindow
};
