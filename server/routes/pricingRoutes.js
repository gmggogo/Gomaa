const express = require("express");

const router = express.Router();

/* =========================
   CALCULATE PRICE
========================= */

router.post("/calculate", async (req, res) => {

  try {

    const {
      baseFare,
      includedMiles,
      perMile,
      stopFee,
      miles,
      stops
    } = req.body;

    const extraMiles =
      Math.max(
        0,
        Number(miles || 0) -
        Number(includedMiles || 0)
      );

    const total =
      Number(baseFare || 0) +
      (extraMiles * Number(perMile || 0)) +
      (Number(stops || 0) * Number(stopFee || 0));

    res.json({
      ok: true,
      total: Number(total.toFixed(2))
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      ok: false,
      message: "Pricing error"
    });

  }

});

module.exports = router;