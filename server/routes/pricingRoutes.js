const express = require("express");

const router = express.Router();

/* =========================
   PRICING TEST
========================= */

router.get("/", (req,res)=>{

  res.json({
    ok:true,
    message:"pricing route working"
  });

});

/* =========================
   CALCULATE PRICE
========================= */

router.post("/calculate", async (req,res)=>{

  try{

    const {
      miles = 0,
      stops = 0,
      vehicle = "X",
      isShared = false
    } = req.body;

    let total = 0;

    // =========================
    // INDIVIDUAL
    // =========================

    if(!isShared){

      if(vehicle === "XL"){

        total =
          30 + (Number(miles) * 2.5);

      }else{

        total =
          20 + (Number(miles) * 2);

      }

      total += Number(stops) * 5;

    }

    // =========================
    // SHARED
    // =========================

    else{

      total =
        15 + (Number(miles) * 1.5);

      total += Number(stops) * 5;

    }

    res.json({

      success:true,

      total:Number(
        total.toFixed(2)
      )

    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      success:false
    });

  }

});

module.exports = router;