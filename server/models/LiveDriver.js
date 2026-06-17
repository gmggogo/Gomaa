const mongoose = require("mongoose");

const liveDriverSchema = new mongoose.Schema({

  tripId: String,

  lat: Number,
  lng: Number,

  updatedAt: {
    type: Date,
    default: Date.now
  }

});

module.exports =
  mongoose.models.LiveDriver ||
  mongoose.model("LiveDriver", liveDriverSchema);