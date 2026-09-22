"use strict";

const jwt = require("jsonwebtoken");
const config = require("../config/env");

function readBearerToken(req) {
  const header = String(req.headers?.authorization || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function requireTenantApi(req, res, next) {
  const token = readBearerToken(req);

  if (!token) {
    return res.status(401).json({ message: "Access Denied" });
  }

  try {
    const verified = jwt.verify(token, config.jwtSecret);

    req.authUser = {
      id: verified.id || null,
      role: verified.role || "",
      tenantId: verified.tenantId || null
    };

    if (req.authUser.role === "PLATFORM_ADMIN") return next();

    if (!req.authUser.tenantId) {
      return res.status(403).json({ message: "Tenant Required" });
    }

    return next();
  } catch (_err) {
    return res.status(401).json({ message: "Invalid Token" });
  }
}

module.exports = {
  readBearerToken,
  requireTenantApi
};
