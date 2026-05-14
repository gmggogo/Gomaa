const express = require("express");

const router = express.Router();

const Service =
require("../models/Service");

/* =========================
   TEST
========================= */

router.get("/", (req,res)=>{

  res.json({
    ok:true,
    message:"Pricing Route Working"
  });

});

/* =========================
   CALCULATE PRICE
========================= */

router.post(
"/calculate",
async (req,res)=>{

try{

const {
  serviceKey,
  miles,
  stops,
  minutes
} = req.body;

/* =========================
   VALIDATE
========================= */

if(!serviceKey){

  return res.json({

    success:false,

    message:"Missing service key"

  });

}

/* =========================
   FIND SERVICE
========================= */

const service =
await Service.findOne({

  serviceKey:
  String(serviceKey)
  .toUpperCase()

});

if(!service){

  return res.json({

    success:false,

    message:"Service not found"

  });

}

if(service.enabled !== true){

  return res.json({

    success:false,

    message:"Service disabled"

  });

}

/* =========================
   MODE
========================= */

const pricingMode =

String(
  service.pricingMode || ""
)
.trim()
.toUpperCase();

let total = 0;

/* =========================
   HOURLY
========================= */

if(pricingMode === "HOURLY"){

  const totalMinutes =

    Number(minutes || 0);

  const hours =

    Math.max(
      1,
      Math.ceil(
        totalMinutes / 60
      )
    );

  total =

    hours *

    Number(
      service.hourlyRate || 0
    );

}

/* =========================
   SHARED
========================= */

else if(
  pricingMode === "SHARED"
){

  total =

    Number(
      service.sharedPrice || 0
    )

    +

    (
      Number(stops || 0)

      *

      Number(
        service.stopFee || 0
      )
    );

}

/* =========================
   PER MILE
========================= */

else{

  const extraMiles =

    Math.max(

      0,

      Number(miles || 0)

      -

      Number(
        service.includedMiles || 0
      )

    );

  total =

    Number(
      service.baseFare || 0
    )

    +

    (
      extraMiles

      *

      Number(
        service.perMile || 0
      )
    )

    +

    (
      Number(stops || 0)

      *

      Number(
        service.stopFee || 0
      )
    );

}

/* =========================
   RESPONSE
========================= */

return res.json({

  success:true,

  pricingMode,

  total:
  Number(
    total.toFixed(2)
  ),

  service:{
    title:
    service.title,

    pricingMode,

    baseFare:
    Number(
      service.baseFare || 0
    ),

    includedMiles:
    Number(
      service.includedMiles || 0
    ),

    perMile:
    Number(
      service.perMile || 0
    ),

    hourlyRate:
    Number(
      service.hourlyRate || 0
    ),

    stopFee:
    Number(
      service.stopFee || 0
    ),

    noShowFee:
    Number(
      service.noShowFee || 0
    ),

    sharedPrice:
    Number(
      service.sharedPrice || 0
    )

  }

});

}catch(err){

console.log(err);

return res.status(500).json({

  success:false,

  message:"Pricing Failed"

});

}

});

module.exports = router;