const mongoose = require("mongoose");

const liveDriverSchema = new mongoose.Schema({

  driverId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  name: {
    type: String,
    default: ""
  },

  phone: {
    type: String,
    default: ""
  },

  vehicleNumber: {
    type: String,
    default: ""
  },

  tripId: {
    type: String,
    default: ""
  },

  routeMode: {
    type: String,
    default: ""
  },

  lat: {
    type: Number,
    required: true
  },

  lng: {
    type: Number,
    required: true
  },

  online: {
    type: Boolean,
    default: true
  },

  lastSeen: {
    type: Date,
    default: Date.now,
    index: true
  }

}, {
  timestamps: true
});

/* ينضف اللوكيشن القديم بعد ساعة من Mongo */
liveDriverSchema.index(
  { lastSeen: 1 },
  { expireAfterSeconds: 3600 }
);

module.exports =
  mongoose.models.LiveDriver ||
  mongoose.model("LiveDriver", liveDriverSchema);