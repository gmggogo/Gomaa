"use strict";

const jwt = require("jsonwebtoken");
const config = require("../config/env");
const Subscription = require("../models/TenantSubscription");

const clean = (v) => String(v ?? "").trim();

function runtime(subscription) {
  if (!subscription) return { locked: false };
  const now = new Date();
  if (
    subscription.status === "TRIAL" &&
    subscription.trialEndsAt &&
    new Date(subscription.trialEndsAt) > now
  ) return { locked: false };

  if (!subscription.dueDate) return { locked: false };
  const due = new Date(subscription.dueDate);
  if (now <= due) return { locked: false };

  const graceEnd = new Date(due);
  graceEnd.setUTCDate(graceEnd.getUTCDate() + Number(subscription.graceDays || 0));
  return { locked: now > graceEnd };
}

module.exports = async function tenantSubscriptionGate(req, res, next) {
  try {
    if (
      req.path.startsWith("/tenant-subscription") ||
      req.path.startsWith("/auth") ||
      req.path.startsWith("/logout")
    ) return next();

    const header = clean(req.headers.authorization);
    if (!header.toLowerCase().startsWith("bearer ")) return next();

    let decoded;
    try {
      decoded = jwt.verify(header.slice(7).trim(), config.jwtSecret);
    } catch (_err) {
      return next();
    }

    const role = clean(decoded.role).toUpperCase().replace(/[\s-]+/g, "_");
    if (role === "PLATFORM_ADMIN" || !decoded.tenantId) return next();

    const subscription = await Subscription.findOne({ tenantId: decoded.tenantId }).lean();
    if (!runtime(subscription).locked) return next();

    return res.status(402).json({
      success: false,
      code: "SUBSCRIPTION_PAYMENT_REQUIRED",
      message: "Subscription payment required",
      redirect: "/admin/payment.html"
    });
  } catch (err) {
    console.error("SUBSCRIPTION GATE:", err);
    return next();
  }
};
