"use strict";

class MtmTripLockService {
  constructor() { this.locks = new Map(); }
  key(tenantId, externalTripId) { return String(tenantId) + "::" + String(externalTripId); }
  acquire(tenantId, externalTripId) {
    const key = this.key(tenantId, externalTripId);
    if (this.locks.has(key)) return false;
    this.locks.set(key, Date.now());
    return true;
  }
  release(tenantId, externalTripId) { this.locks.delete(this.key(tenantId, externalTripId)); }
  async withLock(tenantId, externalTripId, fn) {
    if (!this.acquire(tenantId, externalTripId)) return { skipped: true, reason: "LOCKED" };
    try { return await fn(); } finally { this.release(tenantId, externalTripId); }
  }
}
module.exports = new MtmTripLockService();
