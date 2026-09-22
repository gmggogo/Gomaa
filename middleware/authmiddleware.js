"use strict";

const jwt = require("jsonwebtoken");
const config = require("../config/env");

function getToken(req) {
  const authHeader = String(req.headers?.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return req.cookies?.token || null;
}

function verifyToken(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ message: "Access Denied" });

  try {
    const verified = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: verified.id,
      role: verified.role,
      name: verified.name || "",
      tenantId: verified.tenantId || null
    };
    return next();
  } catch (_err) {
    return res.status(401).json({ message: "Invalid Token" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Access Denied" });
    if (req.user.role !== role) return res.status(403).json({ message: "Forbidden" });
    return next();
  };
}

function requireAnyRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Access Denied" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
    return next();
  };
}

// Compatibility mode for legacy routes. New/secured routes should use
// requireTenantStrict. This remains until Stage 9 verifies every consumer.
function requireTenant(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Access Denied" });
  if (req.user.role === "PLATFORM_ADMIN") return next();
  if (!req.user.tenantId) {
    req.tenantId = null;
    return next();
  }
  req.tenantId = req.user.tenantId;
  return next();
}

function requireTenantStrict(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Access Denied" });
  if (req.user.role === "PLATFORM_ADMIN") return next();
  if (!req.user.tenantId) return res.status(403).json({ message: "Tenant Required" });
  req.tenantId = req.user.tenantId;
  return next();
}

module.exports = {
  getToken,
  verifyToken,
  requireRole,
  requireAnyRole,
  requireTenant,
  requireTenantStrict
};
