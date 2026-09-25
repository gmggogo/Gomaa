"use strict";

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function parseAllowedOrigins() {
  const raw = String(
    process.env.CORS_ALLOWED_ORIGINS ||
    process.env.APP_ORIGIN ||
    ""
  ).trim();

  const configured = raw
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

  const allowed = new Set(configured);

  // Always allow this server's local development origin.
  // This keeps localhost testing working even when NODE_ENV=production,
  // while all other origins still require explicit configuration.
  allowed.add("http://localhost:10000");
  allowed.add("http://127.0.0.1:10000");

  // GH Mobility production origin on Render.
  // Keep this explicit so same-origin API calls such as /api/auth/login
  // are accepted in production without opening CORS to every domain.
  allowed.add("https://sunbeam-933q.onrender.com");
  allowed.add("https://ghmobility.com");
  allowed.add("https://www.ghmobility.com");

  // Also allow Render's external URL automatically if provided by the platform.
  if (process.env.RENDER_EXTERNAL_URL) {
    allowed.add(normalizeOrigin(process.env.RENDER_EXTERNAL_URL));
  }

  if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://localhost:5000");
    allowed.add("http://localhost:8080");
    allowed.add("http://127.0.0.1:3000");
    allowed.add("http://127.0.0.1:5000");
    allowed.add("http://127.0.0.1:8080");
  }

  return allowed;
}

const allowedOrigins = parseAllowedOrigins();

function originAllowed(origin) {
  if (!origin) return true;
  return allowedOrigins.has(normalizeOrigin(origin));
}

const corsOptions = {
  origin(origin, callback) {
    if (originAllowed(origin)) return callback(null, true);
    return callback(new Error("CORS origin not allowed"));
  },
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 204
};

const socketCorsOptions = {
  origin(origin, callback) {
    if (originAllowed(origin)) return callback(null, true);
    return callback(new Error("Socket origin not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST"]
};

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  next();
}

module.exports = {
  corsOptions,
  socketCorsOptions,
  securityHeaders,
  originAllowed
};
