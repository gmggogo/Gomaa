const express = require("express");

const router = express.Router();

/* =========================
   TEST
========================= */

router.get("/", (req,res)=>{

  res.json({
    ok:true,
    message:"pricing route working"
  });

});

module.exports = router;