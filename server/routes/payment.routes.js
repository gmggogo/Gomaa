const express = require("express");
const crypto = require("crypto");

const router = express.Router();

module.exports = ({
  Trip,
  stripe,
  sendTripStatusEmail
}) => {

  router.post(
    "/payment-success",
    async (req, res) => {

      try {

        const {
          tripId,
          paymentIntentId
        } = req.body;

        if (!tripId) {

          return res.status(400).json({
            message: "Missing tripId"
          });

        }

        const trip =
          await Trip.findById(tripId);

        if (!trip) {

          return res.status(404).json({
            message: "Trip not found"
          });

        }

        if (paymentIntentId) {

          trip.paymentIntentId =
            paymentIntentId;

        }

        trip.dispatchSelected =
          true;

        if (!trip.cancelToken) {

          trip.cancelToken =
            crypto
              .randomBytes(32)
              .toString("hex");

        }

        await trip.save();

        sendTripStatusEmail(
          trip,
          "CONFIRMED"
        ).catch(err => {

          console.log(
            "EMAIL ERROR:",
            err
          );

        });

        console.log(
          "✅ PAYMENT SUCCESS:",
          trip.tripNumber
        );

        return res.json({
          success: true
        });

      } catch (err) {

        console.log(
          "PAYMENT SUCCESS ERROR:",
          err
        );

        return res.status(500).json({
          message: "Server error"
        });

      }

    }
  );

  return router;

};