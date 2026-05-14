const express = require("express");

const router = express.Router();

/* =========================
   SERVICES MEMORY
========================= */

const services = [

  {
    serviceKey:"STANDARD",
    title:"Standard",
    enabled:true,
    pricingMode:"MILE",
    baseFare:20,
    includedMiles:5,
    perMile:2,
    hourlyRate:35,
    stopFee:5,
    noShowFee:15,
    sharedPrice:0
  },

  {
    serviceKey:"XL",
    title:"XL",
    enabled:true,
    pricingMode:"MILE",
    baseFare:30,
    includedMiles:5,
    perMile:2.5,
    hourlyRate:45,
    stopFee:5,
    noShowFee:15,
    sharedPrice:0
  },

  {
    serviceKey:"WHEELCHAIR",
    title:"Wheelchair",
    enabled:true,
    pricingMode:"MILE",
    baseFare:45,
    includedMiles:5,
    perMile:3,
    hourlyRate:60,
    stopFee:10,
    noShowFee:25,
    sharedPrice:0
  },

  {
    serviceKey:"TAXI",
    title:"Taxi",
    enabled:true,
    pricingMode:"MILE",
    baseFare:15,
    includedMiles:3,
    perMile:2,
    hourlyRate:25,
    stopFee:5,
    noShowFee:15,
    sharedPrice:0
  },

  {
    serviceKey:"LIMO",
    title:"Limousine",
    enabled:true,
    pricingMode:"HOURLY",
    baseFare:0,
    includedMiles:0,
    perMile:0,
    hourlyRate:80,
    stopFee:0,
    noShowFee:25,
    sharedPrice:0
  },

  {
    serviceKey:"SHARED",
    title:"Shared",
    enabled:true,
    pricingMode:"SHARED",
    baseFare:0,
    includedMiles:0,
    perMile:0,
    hourlyRate:0,
    stopFee:5,
    noShowFee:15,
    sharedPrice:12
  }

];

/* =========================
   TEST
========================= */

router.get("/", (req,res)=>{

  res.json({
    ok:true,
    message:"pricing route working"
  });

});

/* =========================
   GET SERVICES
========================= */

router.get("/services",(req,res)=>{

  return res.json(services);

});

/* =========================
   CALCULATE
========================= */

router.post(
"/calculate",
(req,res)=>{

try{

const {
  serviceKey,
  miles,
  stops,
  minutes
} = req.body;

/* =========================
   FIND SERVICE
========================= */

const service =
services.find(s=>

  String(s.serviceKey)
  .toUpperCase()

  ===

  String(serviceKey)
  .toUpperCase()

);

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

let total = 0;

const pricingMode =
String(
  service.pricingMode || ""
).toUpperCase();

console.log(
  "MODE:",
  pricingMode,
  "RATE:",
  service.hourlyRate,
  "MINUTES:",
  minutes
);

/* =========================
   HOURLY
========================= */

if(pricingMode === "HOURLY"){

  const hours =

  Math.max(
    1,
    Math.ceil(
      Number(minutes || 0) / 60
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

  hourlyRate:
  Number(
    service.hourlyRate || 0
  ),

  total:
  Number(
    total.toFixed(2)
  )

});

}catch(err){

console.log(err);

return res.status(500).json({

  success:false,

  message:"Pricing failed"

});

}

});

/* =========================
   UPDATE SERVICE
========================= */

router.put(
"/services/:serviceKey",
(req,res)=>{

try{

const key =
String(
  req.params.serviceKey || ""
).toUpperCase();

const service =
services.find(
s=>
String(s.serviceKey)
.toUpperCase()
=== key
);

if(!service){

  return res.json({
    success:false
  });

}

Object.assign(
  service,
  req.body || {}
);

return res.json({

  success:true,

  service

});

}catch(err){

console.log(err);

return res.json({
  success:false
});

}

});

module.exports = router;