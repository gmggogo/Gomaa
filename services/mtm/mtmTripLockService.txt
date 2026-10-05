“use strict”;

/* DESTINATION PATH: server/services/mtm/mtmTripLockService.js

Shared in-process lock for Long + Short engines. Prevents both engines
from attempting the same MTM trip at the same moment.

NOTE: For multi-instance Render scaling, replace/augment this with a
distributed Mongo/Redis lock before enabling real automatic claims
across multiple servers. */

const locks = new Map();

function key(tenantId, externalTripId) { return
${String(tenantId)}::${String(externalTripId)}; }

function acquireTripLock({ tenantId, externalTripId, ttlMs = 30000 }) {
const k = key(tenantId, externalTripId); const now = Date.now(); const
existing = locks.get(k);

if (existing && existing > now) return false;

locks.set(k, now + ttlMs); return true; }

function releaseTripLock({ tenantId, externalTripId }) {
locks.delete(key(tenantId, externalTripId)); }

function cleanupExpiredLocks() { const now = Date.now(); for (const [k,
expiresAt] of locks.entries()) { if (expiresAt <= now) locks.delete(k);
} }

module.exports = { acquireTripLock, releaseTripLock, cleanupExpiredLocks
};
