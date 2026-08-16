const jwt = require("jsonwebtoken");

/* =========================================
   VERIFY TOKEN
========================================= */

function verifyToken(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      message: "Access Denied"
    });
  }

  try {
    const verified = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = {
      id: verified.id,
      role: verified.role,
      tenantId: verified.tenantId || null
    };

    next();

  } catch (err) {
    return res.status(400).json({
      message: "Invalid Token"
    });
  }
}

/* =========================================
   REQUIRE SINGLE ROLE
========================================= */

function requireRole(role) {
  return (req, res, next) => {

    if (!req.user) {
      return res.status(401).json({
        message: "Access Denied"
      });
    }

    if (req.user.role !== role) {
      return res.status(403).json({
        message: "Forbidden"
      });
    }

    next();
  };
}

/* =========================================
   REQUIRE ANY ROLE
========================================= */

function requireAnyRole(...roles) {
  return (req, res, next) => {

    if (!req.user) {
      return res.status(401).json({
        message: "Access Denied"
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Forbidden"
      });
    }

    next();
  };
}

/* =========================================
   REQUIRE TENANT
========================================= */

function requireTenant(req, res, next) {

  if (!req.user) {
    return res.status(401).json({
      message: "Access Denied"
    });
  }

  /*
    PLATFORM_ADMIN is above all tenants
  */
  if (req.user.role === "PLATFORM_ADMIN") {
    return next();
  }

  /*
    TEMPORARY MIGRATION SUPPORT

    Old users may still have:
    tenantId = null

    We allow them temporarily so the
    current application does not break.
  */
  if (!req.user.tenantId) {
    req.tenantId = null;
    return next();
  }

  req.tenantId = req.user.tenantId;

  next();
}

/* =========================================
   STRICT TENANT MODE
   USE LATER AFTER MIGRATION
========================================= */

function requireTenantStrict(req, res, next) {

  if (!req.user) {
    return res.status(401).json({
      message: "Access Denied"
    });
  }

  if (req.user.role === "PLATFORM_ADMIN") {
    return next();
  }

  if (!req.user.tenantId) {
    return res.status(403).json({
      message: "Tenant Required"
    });
  }

  req.tenantId = req.user.tenantId;

  next();
}

module.exports = {
  verifyToken,
  requireRole,
  requireAnyRole,
  requireTenant,
  requireTenantStrict
};