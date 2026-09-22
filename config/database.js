"use strict";

const mongoose = require("mongoose");

async function connectDatabase(mongoUri) {
  if (!mongoUri) {
    throw new Error("MongoDB connection URI is missing");
  }

  await mongoose.connect(mongoUri);
  return mongoose.connection;
}

module.exports = { connectDatabase };
