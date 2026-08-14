const mongoose = require("mongoose");

const driverChatSchema = new mongoose.Schema(
  {
    driverId: {
      type: String,
      required: true,
      index: true
    },

    senderType: {
      type: String,
      enum: ["DRIVER", "DISPATCH"],
      required: true
    },

    senderName: {
      type: String,
      default: ""
    },

    text: {
      type: String,
      required: true,
      maxlength: 2000
    },

    readByDriver: {
      type: Boolean,
      default: false
    },

    readByDispatch: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

driverChatSchema.index({
  driverId: 1,
  createdAt: 1
});

driverChatSchema.index({
  driverId: 1,
  senderType: 1,
  readByDispatch: 1
});

driverChatSchema.index({
  driverId: 1,
  senderType: 1,
  readByDriver: 1
});

module.exports =
  mongoose.models.DriverChat ||
  mongoose.model(
    "DriverChat",
    driverChatSchema
  );