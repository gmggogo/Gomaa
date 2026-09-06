"use strict";

/*
DESTINATION PATH:
server/routes/externalSummaryRoutes.js

PURPOSE:
Independent broker summary.
Does not change the main GH Summary.
*/

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router =
  express.Router();

const ExternalTrip =
  require("../models/ExternalTrip");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function clean(value){
  return String(value ?? "").trim();
}

function bearerToken(req){

  const auth =
    clean(
      req.headers.authorization
    );

  if(
    !auth
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return auth
    .slice(7)
    .trim();
}

function requireStaff(req,res,next){

  const token =
    bearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    const role =
      String(
        decoded.role ||
        ""
      ).toUpperCase();

    if(
      ![
        "SUPER_ADMIN",
        "ADMIN",
        "DISPATCHER"
      ].includes(role)
    ){
      return res.status(403).json({
        success:false,
        message:"Not allowed"
      });
    }

    if(!decoded.tenantId){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    req.authUser =
      decoded;

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

router.use(
  requireStaff
);

router.get(
  "/",
  async (req,res) => {

    try{

      const match = {
        tenantId:
          new mongoose.Types.ObjectId(
            req.authUser.tenantId
          )
      };

      if(req.query.brokerCode){
        match.brokerCode =
          String(
            req.query.brokerCode
          ).toUpperCase();
      }

      if(
        req.query.from ||
        req.query.to
      ){

        match.tripDate = {};

        if(req.query.from){
          match.tripDate.$gte =
            clean(
              req.query.from
            );
        }

        if(req.query.to){
          match.tripDate.$lte =
            clean(
              req.query.to
            );
        }
      }

      const byBroker =
        await ExternalTrip.aggregate([
          { $match:match },

          {
            $group:{
              _id:{
                brokerCode:"$brokerCode",
                brokerName:"$brokerName"
              },

              total:{
                $sum:1
              },

              received:{
                $sum:{
                  $cond:[
                    {
                      $in:[
                        "$status",
                        [
                          "RECEIVED",
                          "READY",
                          "UPDATED"
                        ]
                      ]
                    },
                    1,
                    0
                  ]
                }
              },

              transferred:{
                $sum:{
                  $cond:[
                    {
                      $eq:[
                        "$transferredToTripsHub",
                        true
                      ]
                    },
                    1,
                    0
                  ]
                }
              },

              cancelled:{
                $sum:{
                  $cond:[
                    {
                      $eq:[
                        "$status",
                        "CANCELLED"
                      ]
                    },
                    1,
                    0
                  ]
                }
              },

              rejected:{
                $sum:{
                  $cond:[
                    {
                      $eq:[
                        "$status",
                        "REJECTED"
                      ]
                    },
                    1,
                    0
                  ]
                }
              },

              errors:{
                $sum:{
                  $cond:[
                    {
                      $eq:[
                        "$status",
                        "ERROR"
                      ]
                    },
                    1,
                    0
                  ]
                }
              },

              shared:{
                $sum:{
                  $cond:[
                    {
                      $eq:[
                        "$tripType",
                        "SHARED"
                      ]
                    },
                    1,
                    0
                  ]
                }
              },

              manual:{
                $sum:{
                  $cond:[
                    {
                      $eq:[
                        "$source",
                        "MANUAL"
                      ]
                    },
                    1,
                    0
                  ]
                }
              },

              automatic:{
                $sum:{
                  $cond:[
                    {
                      $eq:[
                        "$source",
                        "BROKER"
                      ]
                    },
                    1,
                    0
                  ]
                }
              }
            }
          },

          {
            $sort:{
              "_id.brokerName":1
            }
          }
        ]);

      const totals =
        byBroker.reduce(
          (acc,item) => {

            acc.total +=
              item.total || 0;

            acc.received +=
              item.received || 0;

            acc.transferred +=
              item.transferred || 0;

            acc.cancelled +=
              item.cancelled || 0;

            acc.rejected +=
              item.rejected || 0;

            acc.errors +=
              item.errors || 0;

            acc.shared +=
              item.shared || 0;

            acc.manual +=
              item.manual || 0;

            acc.automatic +=
              item.automatic || 0;

            return acc;
          },
          {
            total:0,
            received:0,
            transferred:0,
            cancelled:0,
            rejected:0,
            errors:0,
            shared:0,
            manual:0,
            automatic:0
          }
        );

      return res.json({
        success:true,
        totals,
        byBroker
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to load external summary"
      });
    }
  }
);

module.exports =
  router;
