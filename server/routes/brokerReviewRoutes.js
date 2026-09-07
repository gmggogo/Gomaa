"use strict";

/*
DESTINATION PATH:
server/routes/brokerReviewRoutes.js

PURPOSE:
Broker Review / Broker Schedule API.

FLOW:
- Shows Trip Split confirmed broker trips for Today and Tomorrow.
- Select All / Unselect All is handled by the frontend.
- Confirm Selected releases selected trips to Dispatch.
- Trips stay visible here after release and continue showing live Trip status.
- Edit is allowed until the trip begins execution.
- Delete requires an explicit warning and is blocked after execution begins.

MOUNT:
app.use("/api/broker-review", brokerReviewRoutes);
*/

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();

const TripSplitState =
  require("../models/TripSplitState");

const ExternalTrip =
  require("../models/ExternalTrip");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function safeArray(value){
  return Array.isArray(value)
    ? value
    : [];
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
      upper(decoded.role);

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

function tenantObjectId(req){

  const value =
    clean(
      req.authUser?.tenantId
    );

  if(
    !mongoose.Types.ObjectId
      .isValid(value)
  ){
    throw new Error(
      "Invalid tenant"
    );
  }

  return new mongoose.Types.ObjectId(
    value
  );
}

function getTripModel(){

  const Trip =
    global.Trip ||
    mongoose.models.Trip ||
    null;

  if(!Trip){
    throw new Error(
      "Trip model not loaded"
    );
  }

  return Trip;
}

function phoenixDateKey(
  offsetDays = 0
){

  const now =
    new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Phoenix",
        year:"numeric",
        month:"2-digit",
        day:"2-digit"
      }
    ).formatToParts(now);

  const map = {};

  for(const part of parts){
    map[part.type] =
      part.value;
  }

  const base =
    new Date(
      Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day)
      )
    );

  base.setUTCDate(
    base.getUTCDate() +
    offsetDays
  );

  return [
    base.getUTCFullYear(),
    String(
      base.getUTCMonth() + 1
    ).padStart(2,"0"),
    String(
      base.getUTCDate()
    ).padStart(2,"0")
  ].join("-");
}

function executionLocked(
  trip
){

  const status =
    upper(
      trip?.status ||
      trip?.dispatchStatus ||
      ""
    );

  return [
    "ON_TRIP",
    "ON TRIP",
    "IN_PROGRESS",
    "IN PROGRESS",
    "COMPLETED",
    "CANCELLED",
    "CANCELED",
    "NO_SHOW",
    "NO SHOW",
    "NOT_COMPLETED",
    "NOT COMPLETED"
  ].includes(status);
}

function toId(value){
  return String(
    value?._id ||
    value?.id ||
    value ||
    ""
  );
}

function serializeExternal(
  external
){
  if(!external){
    return null;
  }

  return {
    _id:toId(external),
    externalTripId:
      external.externalTripId ||
      "",
    brokerCode:
      external.brokerCode ||
      "",
    brokerName:
      external.brokerName ||
      "",
    tripDate:
      external.tripDate ||
      "",
    tripTime:
      external.tripTime ||
      "",
    appointmentTime:
      external.appointmentTime ||
      "",
    clientName:
      external.clientName ||
      "",
    clientPhone:
      external.clientPhone ||
      "",
    clientEmail:
      external.clientEmail ||
      "",
    memberId:
      external.memberId ||
      "",
    pickup:
      external.pickup ||
      "",
    stops:
      safeArray(
        external.stops
      ),
    dropoff:
      external.dropoff ||
      "",
    serviceKey:
      external.serviceKey ||
      "",
    serviceName:
      external.serviceName ||
      "",
    notes:
      external.notes ||
      ""
  };
}

function serializeTrip(
  trip
){
  if(!trip){
    return null;
  }

  return {
    _id:toId(trip),
    tripNumber:
      trip.tripNumber ||
      "",
    tripDate:
      trip.tripDate ||
      "",
    tripTime:
      trip.tripTime ||
      "",
    appointmentTime:
      trip.appointmentTime ||
      "",
    pickup:
      trip.pickup ||
      "",
    dropoff:
      trip.dropoff ||
      "",
    stops:
      safeArray(
        trip.stops
      ),
    clientName:
      trip.clientName ||
      "",
    clientPhone:
      trip.clientPhone ||
      "",
    notes:
      trip.notes ||
      "",
    brokerName:
      trip.brokerName ||
      "",
    brokerCode:
      trip.brokerCode ||
      "",
    brokerTripId:
      trip.brokerTripId ||
      "",
    serviceKey:
      trip.serviceKey ||
      "",
    serviceType:
      trip.serviceType ||
      "",
    isShared:
      trip.isShared === true,
    groupId:
      trip.groupId ||
      "",
    passengers:
      safeArray(
        trip.passengers
      ),
    driverId:
      trip.driverId ||
      "",
    driverName:
      trip.driverName ||
      "",
    vehicleNumber:
      trip.vehicleNumber ||
      trip.vehicle ||
      "",
    dispatchStatus:
      trip.dispatchStatus ||
      "",
    status:
      trip.status ||
      "",
    dispatchSelected:
      trip.dispatchSelected === true,
    disabled:
      trip.disabled === true
  };
}

async function buildItems(
  tenantId,
  dateKeys
){

  const Trip =
    getTripModel();

  const externalTrips =
    await ExternalTrip.find({
      tenantId,
      tripDate:{
        $in:dateKeys
      }
    })
      .sort({
        tripDate:1,
        tripTime:1
      })
      .lean();

  if(!externalTrips.length){
    return [];
  }

  const externalIds =
    externalTrips.map(
      trip=>trip._id
    );

  const states =
    await TripSplitState.find({
      tenantId,
      externalTripObjectId:{
        $in:externalIds
      },
      confirmed:true
    })
      .sort({
        confirmedAt:1
      })
      .lean();

  if(!states.length){
    return [];
  }

  const tripIds =
    [...new Set(
      states
        .map(
          row=>
            clean(
              row.dispatchTripId
            )
        )
        .filter(Boolean)
    )];

  const dispatchTrips =
    tripIds.length
      ? await Trip.find({
          _id:{
            $in:tripIds
          },
          tenantId
        }).lean()
      : [];

  const tripMap =
    new Map(
      dispatchTrips.map(
        trip=>[
          toId(trip),
          trip
        ]
      )
    );

  const externalMap =
    new Map(
      externalTrips.map(
        trip=>[
          toId(trip),
          trip
        ]
      )
    );

  /*
    Shared groups have multiple TripSplitState rows pointing to one
    dispatchTripId. Aggregate them into one review card/row.
  */
  const itemMap =
    new Map();

  for(const state of states){

    const dispatchId =
      clean(
        state.dispatchTripId
      );

    if(!dispatchId){
      continue;
    }

    let item =
      itemMap.get(
        dispatchId
      );

    if(!item){
      const trip =
        tripMap.get(
          dispatchId
        ) ||
        null;

      item = {
        id:dispatchId,
        dispatchTripId:
          dispatchId,
        processingMode:
          state.processingMode ||
          "NORMAL",
        sharedGroupId:
          state.sharedGroupId ||
          trip?.groupId ||
          "",
        reviewConfirmed:
          state.reviewConfirmed === true,
        reviewConfirmedAt:
          state.reviewConfirmedAt ||
          null,
        confirmedAt:
          state.confirmedAt ||
          null,
        trip:
          serializeTrip(
            trip
          ),
        externalTrips:[]
      };

      itemMap.set(
        dispatchId,
        item
      );
    }

    const external =
      externalMap.get(
        toId(
          state.externalTripObjectId
        )
      );

    if(external){
      item.externalTrips.push(
        serializeExternal(
          external
        )
      );
    }

    /*
      All rows in one shared group should be confirmed together.
      If any row is still waiting, the item remains Waiting Review.
    */
    if(
      state.reviewConfirmed !== true
    ){
      item.reviewConfirmed =
        false;
    }
  }

  const items =
    [...itemMap.values()];

  items.sort((a,b)=>{
    const ad =
      a.trip?.tripDate ||
      a.externalTrips[0]
        ?.tripDate ||
      "";

    const bd =
      b.trip?.tripDate ||
      b.externalTrips[0]
        ?.tripDate ||
      "";

    if(ad !== bd){
      return ad.localeCompare(bd);
    }

    const at =
      a.trip?.tripTime ||
      a.externalTrips[0]
        ?.tripTime ||
      "";

    const bt =
      b.trip?.tripTime ||
      b.externalTrips[0]
        ?.tripTime ||
      "";

    return at.localeCompare(bt);
  });

  return items;
}

/* =========================
   BOOTSTRAP
========================= */

router.get(
  "/bootstrap",
  async (req,res)=>{

    try{

      const tenantId =
        tenantObjectId(req);

      const today =
        phoenixDateKey(0);

      const tomorrow =
        phoenixDateKey(1);

      const items =
        await buildItems(
          tenantId,
          [
            today,
            tomorrow
          ]
        );

      return res.json({
        success:true,
        today,
        tomorrow,
        items
      });

    }catch(err){

      console.log(
        "BROKER REVIEW BOOTSTRAP ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to load Broker Review"
      });
    }
  }
);

/* =========================
   CONFIRM SELECTED TO DISPATCH
========================= */

router.post(
  "/confirm-selected",
  async (req,res)=>{

    const session =
      await mongoose.startSession();

    try{

      const tenantId =
        tenantObjectId(req);

      const Trip =
        getTripModel();

      const ids =
        [...new Set(
          safeArray(
            req.body?.dispatchTripIds
          )
            .map(clean)
            .filter(
              id=>
                mongoose.Types.ObjectId
                  .isValid(id)
            )
        )];

      if(!ids.length){
        return res.status(400).json({
          success:false,
          message:"Select at least one trip"
        });
      }

      let confirmedCount = 0;

      await session.withTransaction(
        async()=>{

          const trips =
            await Trip.find({
              _id:{
                $in:ids
              },
              tenantId
            })
              .session(session);

          if(
            trips.length !==
            ids.length
          ){
            throw new Error(
              "One or more broker review trips were not found"
            );
          }

          for(const trip of trips){

            if(
              executionLocked(
                trip
              )
            ){
              continue;
            }

            trip.dispatchSelected =
              true;

            trip.disabled =
              false;

            if(
              !clean(
                trip.status
              )
            ){
              trip.status =
                "Scheduled";
            }

            await trip.save({
              session
            });

            await TripSplitState.updateMany(
              {
                tenantId,
                dispatchTripId:
                  trip._id,
                confirmed:true
              },
              {
                $set:{
                  reviewConfirmed:true,
                  reviewConfirmedAt:
                    new Date(),
                  reviewConfirmedBy:
                    clean(
                      req.authUser?.email ||
                      req.authUser?.id ||
                      ""
                    )
                }
              },
              {
                session
              }
            );

            confirmedCount += 1;
          }
        }
      );

      return res.json({
        success:true,
        confirmedCount,
        message:
          `${confirmedCount} trip(s) released to Dispatch.`
      });

    }catch(err){

      console.log(
        "BROKER REVIEW CONFIRM ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to confirm selected trips"
      });

    }finally{

      await session.endSession();
    }
  }
);

/* =========================
   EDIT REVIEW TRIP
========================= */

router.patch(
  "/trips/:id",
  async (req,res)=>{

    try{

      const tenantId =
        tenantObjectId(req);

      if(
        !mongoose.Types.ObjectId
          .isValid(req.params.id)
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid trip"
        });
      }

      const Trip =
        getTripModel();

      const trip =
        await Trip.findOne({
          _id:req.params.id,
          tenantId
        });

      if(!trip){
        return res.status(404).json({
          success:false,
          message:"Broker review trip not found"
        });
      }

      if(
        executionLocked(
          trip
        )
      ){
        return res.status(409).json({
          success:false,
          message:
            "A trip that has started or closed cannot be edited here"
        });
      }

      const isShared =
        trip.isShared === true;

      if(
        req.body.tripDate !== undefined
      ){
        trip.tripDate =
          clean(
            req.body.tripDate
          );
      }

      if(
        req.body.tripTime !== undefined
      ){
        trip.tripTime =
          clean(
            req.body.tripTime
          );
      }

      if(
        req.body.notes !== undefined
      ){
        trip.notes =
          clean(
            req.body.notes
          );
      }

      /*
        Shared route addresses are locked because changing one group-level
        address would invalidate the passenger route plan. Individual broker
        trips can still edit pickup/drop-off here.
      */
      if(!isShared){

        if(
          req.body.pickup !== undefined
        ){
          trip.pickup =
            clean(
              req.body.pickup
            );
        }

        if(
          req.body.dropoff !== undefined
        ){
          trip.dropoff =
            clean(
              req.body.dropoff
            );
        }
      }

      await trip.save();

      const states =
        await TripSplitState.find({
          tenantId,
          dispatchTripId:
            trip._id,
          confirmed:true
        });

      if(
        !isShared &&
        states.length === 1
      ){
        const state =
          states[0];

        const external =
          await ExternalTrip.findOne({
            _id:
              state.externalTripObjectId,
            tenantId
          });

        if(external){

          external.tripDate =
            trip.tripDate ||
            external.tripDate;

          external.tripTime =
            trip.tripTime ||
            external.tripTime;

          external.pickup =
            trip.pickup ||
            external.pickup;

          external.dropoff =
            trip.dropoff ||
            external.dropoff;

          external.notes =
            trip.notes ||
            external.notes;

          await external.save();
        }
      }

      return res.json({
        success:true,
        trip:
          serializeTrip(
            trip
          )
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to edit broker review trip"
      });
    }
  }
);

/* =========================
   DELETE REVIEW TRIP
========================= */

router.delete(
  "/trips/:id",
  async (req,res)=>{

    const session =
      await mongoose.startSession();

    try{

      const tenantId =
        tenantObjectId(req);

      if(
        !mongoose.Types.ObjectId
          .isValid(req.params.id)
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid trip"
        });
      }

      const Trip =
        getTripModel();

      await session.withTransaction(
        async()=>{

          const trip =
            await Trip.findOne({
              _id:req.params.id,
              tenantId
            })
              .session(session);

          if(!trip){
            throw new Error(
              "Broker review trip not found"
            );
          }

          if(
            executionLocked(
              trip
            )
          ){
            const err =
              new Error(
                "A trip that has started or closed cannot be deleted"
              );

            err.statusCode =
              409;

            throw err;
          }

          const states =
            await TripSplitState.find({
              tenantId,
              dispatchTripId:
                trip._id,
              confirmed:true
            })
              .session(session);

          const externalIds =
            states
              .map(
                row=>
                  row.externalTripObjectId
              )
              .filter(Boolean);

          await Trip.deleteOne(
            {
              _id:trip._id,
              tenantId
            },
            {
              session
            }
          );

          await TripSplitState.deleteMany(
            {
              tenantId,
              dispatchTripId:
                trip._id
            },
            {
              session
            }
          );

          if(externalIds.length){
            await ExternalTrip.deleteMany(
              {
                _id:{
                  $in:externalIds
                },
                tenantId
              },
              {
                session
              }
            );
          }
        }
      );

      return res.json({
        success:true
      });

    }catch(err){

      return res.status(
        err.statusCode ||
        500
      ).json({
        success:false,
        message:
          err.message ||
          "Failed to delete broker review trip"
      });

    }finally{

      await session.endSession();
    }
  }
);

module.exports =
  router;
