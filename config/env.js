"use strict";

const path = require("path");

// Load the same server-root .env file used by the legacy server.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function requireProductionSecret(name, value) {
  if (process.env.NODE_ENV === "production" && !String(value || "").trim()) {
    throw new Error(`${name} is required in production`);
  }
}

const config = Object.freeze({
  port: Number(process.env.PORT || 10000),
  mongoUri: String(process.env.MONGO_URI || "").trim(),
  jwtSecret: String(process.env.JWT_SECRET || "dev_secret").trim(),
  nodeEnv: String(process.env.NODE_ENV || "development").trim(),
  stripeSecretKey: String(process.env.STRIPE_SECRET_KEY || "").trim(),
  stripePublishableKey: String(process.env.STRIPE_PUBLISHABLE_KEY || "").trim(),
  googleKey: String(process.env.GOOGLE_KEY || "").trim()
});

if (!config.mongoUri) {
  throw new Error("MONGO_URI is required");
}

requireProductionSecret("JWT_SECRET", process.env.JWT_SECRET);

module.exports = config;
