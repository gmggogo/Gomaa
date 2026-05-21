const express = require("express");

const router = express.Router();

const Service =
require("../models/Service");

/* =========================
   TEST
========================= */

router.get("/", (req,res)=>{

  return res.json({
    success:true,
    message:"Pricing Route Working"
  });

});

/* =========================
   GET SERVICES
========================= */

router.get(
"/services",
async (req,res)=>{

try{

const services =
await Service.find({})
.sort({createdAt:1});

return res.json(services);

}catch(err){

console.log(err);

return res.status(500).json({

  success:false,

  message:"Failed To Load Services"

});

}

});

/* =========================
   CALCULATE
========================= */

router.post(
"/calculate",
async (req,res)=>{

try{

console.log(
  "PRICE BODY:",
  req.body
);

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

    message:"Missing Service Key"

  });

}

/* =========================
   FIND SERVICE
========================= */

const service =
await Service.findOne({

  serviceKey:
  String(serviceKey)
  .trim()
  .toUpperCase()

});

if(!service){

  return res.json({

    success:false,

    message:"Service Not Found"

  });

}

if(service.enabled !== true){

  return res.json({

    success:false,

    message:"Service Disabled"

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

  let hours = 1;

  /* =========================
     QUARTER HOUR
  ========================== */

  if(

    String(
      service.hourlyBillingMode || ""
    )
    .toUpperCase()

    ===

    "QUARTER"

  ){

    hours =

      Math.max(
        1,
        Math.ceil(
          totalMinutes / 15
        ) / 4
      );

  }

  /* =========================
     FULL HOUR
  ========================== */

  else{

    hours =

      Math.max(
        1,
        Math.ceil(
          totalMinutes / 60
        )
      );

  }

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

    _id:
    service._id,

    serviceKey:
    service.serviceKey,

    title:
    service.title,

    pricingMode,

    hourlyBillingMode:
    service.hourlyBillingMode,

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
    ),

    /* =========================
       INDIVIDUAL WARNING
    ========================= */

    warningEnabled:
    service.warningEnabled === true,

    warningMinutes:
    Number(
      service.warningMinutes || 0
    ),

    cancelFee:
    Number(
      service.cancelFee || 0
    ),

    /* =========================
       COMPANY SETTINGS
    ========================= */

    companyEnabled:
    service.companyEnabled === true,

    companyShared:
    service.companyShared === true,

    companySuffix:
    service.companySuffix || "ST",

    companyWarningEnabled:
    service.companyWarningEnabled === true,

    companyWarningMinutes:
    Number(
      service.companyWarningMinutes || 0
    ),

    companyCancelFee:
    Number(
      service.companyCancelFee || 0
    )

  }

});

}catch(err){

console.log(
  "PRICING ERROR:",
  err
);

return res.status(500).json({

  success:false,

  message:"Pricing Failed"

});

}

});

/* =========================
   UPDATE SERVICE
========================= */

router.put(
"/services/:serviceKey",
async (req,res)=>{

try{

const key =

String(
  req.params.serviceKey || ""
)
.trim()
.toUpperCase();

const updated =
await Service.findOneAndUpdate(

  {
    serviceKey:key
  },

  {
    $set:req.body
  },

  {
    new:true
  }

);

if(!updated){

  return res.json({

    success:false,

    message:"Service Not Found"

  });

}

return res.json({

  success:true,

  service:updated

});

}catch(err){

console.log(err);

return res.status(500).json({

  success:false,

  message:"Update Failed"

});

}

});

module.exports = router;