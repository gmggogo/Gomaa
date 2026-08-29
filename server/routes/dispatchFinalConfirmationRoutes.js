const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const {
  settleIndividualTripPayment
} = require("../utils/trip-finalizer");

const {
  resolveTripFinancials,
  resolveTripSource
} = require("../utils/finalPricingResolver");

const {
  sendTripStatusEmail
} = require("../utils/tripEmailEngine");

const Trip = global.Trip || mongoose.models.Trip;

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
   TENANT AUTH
========================= */

function readBearerToken(req){

  const header =
    String(
      req.headers?.authorization ||
      ""
    ).trim();

  if(
    !header
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return header
    .slice(7)
    .trim();
}

function requireTenantApi(
  req,
  res,
  next
){

  const token =
    readBearerToken(req);

  if(!token){

    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const verified =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.authUser = {
      id:
        verified.id || null,

      role:
        verified.role || "",

      tenantId:
        verified.tenantId || null
    };

    if(
      req.authUser.role ===
      "PLATFORM_ADMIN"
    ){
      return next();
    }

    if(!req.authUser.tenantId){

      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

function tenantFilter(
  req,
  extra={}
){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){

    const requestedTenantId =
      String(
        req.query?.tenantId ||
        req.body?.tenantId ||
        ""
      ).trim();

    if(requestedTenantId){

      return {
        ...extra,
        tenantId:requestedTenantId
      };
    }

    return {
      ...extra
    };
  }

  return {
    ...extra,
    tenantId:
      req.authUser.tenantId
  };
}

/* =========================
   CONFIG
========================= */

const HOLD_HOURS = 12;

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v || "")
    .replace(/[_-]/g," ")
    .replace(/\s+/g," ")
    .trim()
    .toLowerCase();
}

function compact(v){
  return clean(v).replace(/\s+/g,"");
}

function normalizeFinalStatus(v){

  const s = clean(v);
  const c = compact(v);

  if(s === "completed" || s === "complete"){
    return "Completed";
  }

  if(s.includes("cancel")){
    return "Cancelled";
  }

  if(s.includes("no show") || c.includes("noshow")){
    return "No Show";
  }

  if(
    s === "not completed" ||
    c === "notcompleted" ||
    s.includes("not complete")
  ){
    return "Not Completed";
  }

  return "";
}

function settlementActionFromStatus(status){

  const normalized =
    normalizeFinalStatus(status);

  if(normalized === "Completed"){
    return "COMPLETE";
  }

  if(normalized === "Cancelled"){
    return "CANCEL";
  }

  if(normalized === "No Show"){
    return "NOSHOW";
  }

  if(normalized === "Not Completed"){
    return "NOTCOMPLETED";
  }

  return "";
}

function isFinalStatus(v){
  return !!normalizeFinalStatus(v);
}

function isCustomerCancellation(trip){

  return (
    clean(trip?.cancelSource) === "customer" ||
    clean(trip?.cancelledByRole) === "customer" ||
    clean(trip?.cancellationSource) === "customer"
  );
}

function nowDate(){
  return new Date();
}

function hoursDiff(dateValue){
  const d = new Date(dateValue);
  if(isNaN(d)) return 0;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

function olderThanHours(dateValue,hours){
  if(!dateValue) return false;
  return hoursDiff(dateValue) >= hours;
}

function isSharedTrip(trip){
  return (
    trip?.isShared === true ||
    String(trip?.tripType || "").toUpperCase() === "SHARED" ||
    String(trip?.type || "").toLowerCase() === "shared" ||
    String(trip?.tripNumber || "").toUpperCase().includes("-SH") ||
    (Array.isArray(trip?.passengers) && trip.passengers.length > 0)
  );
}

/* =========================
   FINAL CONFIRM MARKER
========================= */

function getTripFinalConfirmed(trip){
  return (
    trip?.finalStatusConfirmed === true ||
    !!trip?.dispatchFinalConfirmedAt ||
    !!trip?.finalStatusConfirmedAt
  );
}

function getTripFinalConfirmedAt(trip){
  return (
    trip?.dispatchFinalConfirmedAt ||
    trip?.finalStatusConfirmedAt ||
    null
  );
}

function getSharedFinalConfirmed(trip){
  return (
    trip?.sharedFinalConfirmed === true ||
    trip?.finalStatusConfirmed === true ||
    !!trip?.dispatchFinalConfirmedAt ||
    !!trip?.sharedFinalConfirmedAt ||
    !!trip?.finalStatusConfirmedAt
  );
}

function getSharedFinalConfirmedAt(trip){
  return (
    trip?.dispatchFinalConfirmedAt ||
    trip?.sharedFinalConfirmedAt ||
    trip?.finalStatusConfirmedAt ||
    null
  );
}

/* =========================
   PAGE ENTRY STAMP
========================= */

function getEnteredAt(trip){
  return (
    trip?.finalPageEnteredAt ||
    trip?.dispatchFinalPageEnteredAt ||
    trip?.enteredFinalConfirmationAt ||
    null
  );
}

function ensurePageEntryStamp(trip){

  if(getEnteredAt(trip)){
    return false;
  }

  const now = nowDate();

  if(!trip.finalPageEnteredAt){
    trip.finalPageEnteredAt = now;
  }

  if(!trip.dispatchFinalPageEnteredAt){
    trip.dispatchFinalPageEnteredAt =
      trip.finalPageEnteredAt || now;
  }

  if(!trip.enteredFinalConfirmationAt){
    trip.enteredFinalConfirmationAt =
      trip.finalPageEnteredAt || now;
  }

  return true;
}

function clearSingleConfirmState(trip){
  trip.finalStatusConfirmed = false;
  trip.finalStatusConfirmedAt = null;
  trip.dispatchFinalConfirmedAt = null;
  trip.finalStatusConfirmedBy = null;
}

function clearSharedConfirmState(trip){
  trip.sharedFinalConfirmed = false;
  trip.sharedFinalConfirmedAt = null;
  trip.finalStatusConfirmed = false;
  trip.finalStatusConfirmedAt = null;
  trip.dispatchFinalConfirmedAt = null;
  trip.finalStatusConfirmedBy = null;
}

/* =========================
   PAGE READY ENGINE
========================= */

function singleTripReadyForPage(trip){
  if(!trip || isSharedTrip(trip)){
    return false;
  }
  return isFinalStatus(trip.status);
}

function getReadySharedPassengers(trip){
  const passengers =
    Array.isArray(trip?.passengers)
      ? trip.passengers
      : [];

  return passengers.filter(p=>{
    const status = p?.status || trip?.status;
    return isFinalStatus(status);
  });
}

function sharedTripReadyForPage(trip){
  return getReadySharedPassengers(trip).length > 0;
}

function singleTripShouldAppear(trip){

  if(!singleTripReadyForPage(trip)){
    return false;
  }

  if(getTripFinalConfirmed(trip)){
    return !olderThanHours(
      getTripFinalConfirmedAt(trip),
      HOLD_HOURS
    );
  }

  return true;
}

function sharedTripShouldAppear(trip){

  if(!sharedTripReadyForPage(trip)){
    return false;
  }

  if(getSharedFinalConfirmed(trip)){
    return !olderThanHours(
      getSharedFinalConfirmedAt(trip),
      HOLD_HOURS
    );
  }

  return true;
}

/* =========================
   SANITIZE
========================= */

function sanitizeTripForFinalPage(trip){

  const obj =
    trip.toObject
      ? trip.toObject()
      : trip;

  if(isSharedTrip(obj)){
    return {
      ...obj,
      __pageType:"shared",
      __readyPassengers:getReadySharedPassengers(obj),
      __finalConfirmed:getSharedFinalConfirmed(obj),
      __finalConfirmedAt:getSharedFinalConfirmedAt(obj),
      __holdHours:HOLD_HOURS
    };
  }

  return {
    ...obj,
    __pageType:"single",
    __finalConfirmed:getTripFinalConfirmed(obj),
    __finalConfirmedAt:getTripFinalConfirmedAt(obj),
    __holdHours:HOLD_HOURS
  };
}

/* =========================
   GET PAGE DATA
========================= */

router.get("/", requireTenantApi, async (req,res)=>{

  try{

    if(!Trip){
      return res.status(500).json({
        success:false,
        message:"Trip model not loaded"
      });
    }

    const trips = await Trip.find(tenantFilter(req))
      .sort({
        tripDate:-1,
        tripTime:-1,
        createdAt:-1
      });

    const result = [];
    const saveOps = [];

    for(const trip of trips){

      const shouldAppear =
        isSharedTrip(trip)
          ? sharedTripShouldAppear(trip)
          : singleTripShouldAppear(trip);

      if(!shouldAppear){
        continue;
      }

      const stamped =
        ensurePageEntryStamp(trip);

      if(stamped){
        saveOps.push(trip.save());
      }

      result.push(
        sanitizeTripForFinalPage(trip)
      );
    }

    if(saveOps.length){
      await Promise.all(saveOps);
    }

    return res.json({
      success:true,
      holdHours:HOLD_HOURS,
      count:result.length,
      trips:result
    });

  }catch(err){

    console.log(
      "DISPATCH FINAL CONFIRMATION GET ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Failed to load dispatch final confirmation trips"
    });
  }
});

/* =========================
   UPDATE SINGLE STATUS
   Edit only - NO MONEY
========================= */

router.patch("/:id/status", requireTenantApi, async (req,res)=>{

  try{

    const { id } = req.params;
    const status =
      normalizeFinalStatus(
        req.body?.status
      );

    if(!mongoose.Types.ObjectId.isValid(String(id))){
      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    if(!status){
      return res.status(400).json({
        success:false,
        message:"Invalid final status"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:id}));

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(isSharedTrip(trip)){
      return res.status(400).json({
        success:false,
        message:
          "Use shared-status endpoint for shared trip"
      });
    }

    const wasConfirmed =
      getTripFinalConfirmed(trip);

    trip.status = status;

    if(
      status === "Cancelled" &&
      !String(trip.cancelSource || "").trim()
    ){

      if(isCustomerCancellation(trip)){

        trip.cancelSource = "CUSTOMER";

      }else{

        trip.cancelSource = "DISPATCH";
        trip.cancelledBy = String(
          req.body?.confirmedBy ||
          req.body?.updatedBy ||
          "dispatcher"
        );

      }
    }

    /*
      Edit changes the pending final status only.
      Stripe is NOT touched here.
    */
    if(status === "Completed"){
      trip.finalPrice =
        Number(
          trip.finalPrice ||
          trip.priceAmount ||
          0
        );
    }else if(status === "Cancelled"){
      trip.finalPrice =
        Number(
          trip.cancelFee ||
          0
        );
    }else if(status === "No Show"){
      trip.finalPrice =
        Number(
          trip.noShowFee ||
          0
        );
    }else{
      trip.finalPrice = 0;
    }

    ensurePageEntryStamp(trip);

    if(!wasConfirmed){
      clearSingleConfirmState(trip);
    }

    await trip.save();

    return res.json({
      success:true,
      message:"Trip status updated",
      trip:sanitizeTripForFinalPage(trip)
    });

  }catch(err){

    console.log(
      "DISPATCH FINAL SINGLE STATUS ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:"Failed to update trip status"
    });
  }
});

/* =========================
   CONFIRM SINGLE TRIP
   MONEY IS SETTLED HERE
========================= */

router.patch("/:id/confirm", requireTenantApi, async (req,res)=>{

  try{

    const { id } = req.params;
    const status =
      normalizeFinalStatus(
        req.body?.status || ""
      );

    const confirmedBy =
      String(
        req.body?.confirmedBy || ""
      ).trim();

    if(!mongoose.Types.ObjectId.isValid(String(id))){
      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:id}));

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(isSharedTrip(trip)){
      return res.status(400).json({
        success:false,
        message:
          "Use shared-confirm endpoint for shared trip"
      });
    }

    if(getTripFinalConfirmed(trip)){

      return res.json({
        success:true,
        alreadyConfirmed:true,
        message:"Trip already confirmed",
        finalChargeAmount:
          Number(trip.finalChargeAmount || 0),
        finalPricingSource:
          trip.finalPricingSource || "",
        trip:sanitizeTripForFinalPage(trip)
      });
    }

    if(status){
      trip.status = status;
    }

    if(!isFinalStatus(trip.status)){
      return res.status(400).json({
        success:false,
        message:"Trip status is not final"
      });
    }

    /*
      Dispatcher Confirm is the financial gate.

      Price source:
      FACILITY -> active Facility Override first, then Facility Service Management
      GET QUOTE -> Get Quote Service Management
      RESERVED -> Reserved Service Management

      Cancellation fee:
      CUSTOMER cancellation only.
      Company / Dispatch / Driver cancellation = $0 cancellation fee.
    */

    const customerCancellation =
      trip.status === "Cancelled" &&
      isCustomerCancellation(trip);

    if(
      trip.status === "Cancelled" &&
      !String(trip.cancelSource || "").trim()
    ){

      if(customerCancellation){

        trip.cancelSource = "CUSTOMER";

      }else{

        trip.cancelSource = "DISPATCH";
        trip.cancelledBy =
          confirmedBy ||
          "dispatcher";

      }
    }

    const financial =
      await resolveTripFinancials(
        trip
      );

    const charge =
      financial.finalCharge;

    trip.finalPricingSource =
      financial.pricingSource;

    trip.finalChargeType =
      charge.type;

    trip.finalChargeAmount =
      Number(
        charge.amount || 0
      );

    if(trip.status === "No Show"){
      trip.noShowFee =
        Number(
          charge.fee || 0
        );

      trip.finalPrice =
        Number(
          charge.amount || 0
        );
    }

    if(trip.status === "Cancelled"){
      trip.cancelFee =
        Number(
          charge.fee || 0
        );

      trip.finalPrice =
        Number(
          charge.amount || 0
        );
    }

    if(trip.status === "Not Completed"){
      trip.finalPrice = 0;
    }

    const action =
      settlementActionFromStatus(
        trip.status
      );

    await settleIndividualTripPayment(
      trip,
      action,
      {
        finalPrice:
          trip.status === "Completed"
            ? Number(charge.amount || 0)
            : Number(trip.finalPrice || 0),

        cancelFee:
          trip.status === "Cancelled"
            ? Number(charge.amount || 0)
            : 0,

        noShowFee:
          trip.status === "No Show"
            ? Number(charge.amount || 0)
            : 0
      }
    );

    ensurePageEntryStamp(trip);

    const now = nowDate();

    trip.finalStatusConfirmed = true;
    trip.finalStatusConfirmedAt = now;
    trip.dispatchFinalConfirmedAt = now;

    if(confirmedBy){
      trip.finalStatusConfirmedBy =
        confirmedBy;
    }

    await trip.save();

    /*
      GET QUOTE ONLY:
      send final customer email after payment/settlement and final confirmation.
      Facility and Reserved never use tripEmailEngine.
    */
    if(
      resolveTripSource(trip) === "GQ"
    ){

      let emailType = "";

      if(trip.status === "Completed"){
        emailType = "COMPLETED";
      }else if(trip.status === "No Show"){
        emailType = "NOSHOW";
      }else if(trip.status === "Cancelled"){
        emailType = "CANCELLED";
      }

      if(
        emailType &&
        !(
          emailType === "CANCELLED" &&
          customerCancellation
        )
      ){
        await sendTripStatusEmail(
          trip,
          emailType
        );
      }
    }

    return res.json({
      success:true,
      message:"Trip confirmed and payment finalized",
      finalChargeAmount:
        Number(trip.finalChargeAmount || 0),
      finalPricingSource:
        trip.finalPricingSource || "",
      trip:sanitizeTripForFinalPage(trip)
    });

  }catch(err){

    console.log(
      "DISPATCH FINAL SINGLE CONFIRM ERROR:",
      err
    );

    return res.status(
      err?.paymentFailed ? 402 : 500
    ).json({
      success:false,
      message:
        err?.message ||
        "Failed to confirm trip"
    });
  }
});

/* =========================
   UPDATE SHARED PASSENGERS
   Edit only - NO PAYMENT CHANGE
========================= */

router.patch("/:id/shared-status", requireTenantApi, async (req,res)=>{

  try{

    const { id } = req.params;

    const passengersInput =
      Array.isArray(req.body?.passengers)
        ? req.body.passengers
        : null;

    if(!mongoose.Types.ObjectId.isValid(String(id))){
      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    if(!passengersInput){
      return res.status(400).json({
        success:false,
        message:"Passengers array is required"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:id}));

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(!isSharedTrip(trip)){
      return res.status(400).json({
        success:false,
        message:"Trip is not shared"
      });
    }

    const wasConfirmed =
      getSharedFinalConfirmed(trip);

    const currentPassengers =
      Array.isArray(trip.passengers)
        ? trip.passengers
        : [];

    passengersInput.forEach(
      (inputPassenger,idx)=>{

        if(!currentPassengers[idx]){
          return;
        }

        const nextStatus =
          normalizeFinalStatus(
            inputPassenger?.status
          );

        if(nextStatus){
          currentPassengers[idx].status =
            nextStatus;
        }
      }
    );

    trip.passengers =
      currentPassengers;

    ensurePageEntryStamp(trip);

    if(!wasConfirmed){
      clearSharedConfirmState(trip);
    }

    await trip.save();

    return res.json({
      success:true,
      message:
        "Shared passenger statuses updated",
      trip:sanitizeTripForFinalPage(trip)
    });

  }catch(err){

    console.log(
      "DISPATCH FINAL SHARED STATUS ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Failed to update shared statuses"
    });
  }
});

/* =========================
   CONFIRM SHARED TRIP
   NOTE:
   Shared Stripe settlement is NOT invented here because the supplied
   shared finalizer currently has no Stripe capture logic.
========================= */

router.patch("/:id/shared-confirm", requireTenantApi, async (req,res)=>{

  try{

    const { id } = req.params;

    const passengersInput =
      Array.isArray(req.body?.passengers)
        ? req.body.passengers
        : null;

    const confirmedBy =
      String(
        req.body?.confirmedBy || ""
      ).trim();

    if(!mongoose.Types.ObjectId.isValid(String(id))){
      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:id}));

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(!isSharedTrip(trip)){
      return res.status(400).json({
        success:false,
        message:"Trip is not shared"
      });
    }

    const currentPassengers =
      Array.isArray(trip.passengers)
        ? trip.passengers
        : [];

    if(passengersInput){

      passengersInput.forEach(
        (inputPassenger,idx)=>{

          if(!currentPassengers[idx]){
            return;
          }

          const nextStatus =
            normalizeFinalStatus(
              inputPassenger?.status
            );

          if(nextStatus){
            currentPassengers[idx].status =
              nextStatus;
          }
        }
      );
    }

    trip.passengers =
      currentPassengers;

    const readyPassengers =
      getReadySharedPassengers(trip);

    if(!readyPassengers.length){
      return res.status(400).json({
        success:false,
        message:
          "No shared passengers ready for final confirmation"
      });
    }

    ensurePageEntryStamp(trip);

    const now = nowDate();

    trip.sharedFinalConfirmed = true;
    trip.sharedFinalConfirmedAt = now;

    trip.finalStatusConfirmed = true;
    trip.finalStatusConfirmedAt = now;
    trip.dispatchFinalConfirmedAt = now;

    if(confirmedBy){
      trip.finalStatusConfirmedBy =
        confirmedBy;
    }

    await trip.save();

    return res.json({
      success:true,
      message:"Shared trip confirmed",
      trip:sanitizeTripForFinalPage(trip)
    });

  }catch(err){

    console.log(
      "DISPATCH FINAL SHARED CONFIRM ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:"Failed to confirm shared trip"
    });
  }
});

/* =========================
   RETURN SINGLE TRIP TO DRIVER
========================= */

router.patch("/:id/return-to-driver", requireTenantApi, async (req,res)=>{

  try{

    const { id } = req.params;

    if(!mongoose.Types.ObjectId.isValid(String(id))){
      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:id}));

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(isSharedTrip(trip)){
      return res.status(400).json({
        success:false,
        message:
          "Return To Driver currently supports single trips only"
      });
    }

    if(!isFinalStatus(trip.status)){
      return res.status(400).json({
        success:false,
        message:
          "Only a closed trip can be returned to the driver"
      });
    }

    /*
      Safety:
      under the new flow, money is not captured until Confirm.
      A trip that is already financially settled should not be reopened
      automatically because that would require a separate refund/void policy.
    */
    const paymentStatus =
      String(
        trip.paymentStatus || ""
      )
      .trim()
      .toUpperCase();

    const hasCapturedPayment =
      paymentStatus === "PAID" ||
      Number(
        trip.capturedAmount || 0
      ) > 0 ||
      !!trip.paymentCapturedAt;

    /*
      RETURN TO DRIVER RULE:

      - PAID / actually captured money -> blocked.
      - AUTHORIZED hold only -> allowed.
      - PAYMENT_REQUIRED -> allowed.
      - CAPTURE_FAILED -> allowed.
      - PAYMENT_METHOD_SAVED -> allowed.

      A failed Completed attempt must never trap the trip in Final Confirmation.
    */
    if(hasCapturedPayment){

      return res.status(409).json({
        success:false,
        message:
          "This trip already has a captured payment and cannot be returned automatically."
      });
    }

    const previousStatus =
      normalizeFinalStatus(trip.status) ||
      String(trip.status || "");

    const returnedBy =
      String(
        req.body?.returnedBy || ""
      ).trim();

    const reason =
      String(
        req.body?.reason || ""
      ).trim();

    const now =
      nowDate();

    await Trip.collection.updateOne(
      tenantFilter(req,{
        _id:new mongoose.Types.ObjectId(
          String(id)
        )
      }),
      {
        $set:{
          status:"InProgress",

          isFinalized:false,

          returnToDriver:true,
          returnedToDriverAt:now,
          returnedToDriverBy:
            returnedBy || "dispatcher",

          returnToDriverReason:
            reason ||
            "Returned to driver from Final Confirmation",

          previousFinalStatus:
            previousStatus,

          updatedAt:now
        },

        $unset:{
          finalizedAt:"",

          finalStatusConfirmed:"",
          finalStatusConfirmedAt:"",
          dispatchFinalConfirmedAt:"",
          finalStatusConfirmedBy:"",

          finalChargeAmount:"",
          finalChargeType:"",
          finalPricingSource:"",

          sharedFinalConfirmed:"",
          sharedFinalConfirmedAt:"",

          finalPageEnteredAt:"",
          dispatchFinalPageEnteredAt:"",
          enteredFinalConfirmationAt:"",

          completedAt:"",
          completeAt:"",
          cancelledAt:"",
          canceledAt:"",
          noShowAt:"",
          noshowAt:"",
          notCompletedAt:"",

          driverReportedFinalStatus:"",
          finalStatusFromDriver:"",
          driverFinalStatusReported:"",
          reportedByDriver:""
        }
      }
    );

    const DispatchAssignment =
      mongoose.models.DispatchAssignment ||
      global.DispatchAssignment ||
      null;

    if(DispatchAssignment){

      try{

        await DispatchAssignment.updateMany(
          tenantFilter(req,{
            $or:[
              {tripId:trip._id},
              {tripId:String(trip._id)},
              {tripNumber:String(trip.tripNumber || "")}
            ]
          }),
          {
            $set:{
              dispatchStatus:"ON_TRIP",
              status:"ON_TRIP",
              updatedAt:now
            },
            $unset:{
              completedAt:"",
              cancelledAt:"",
              canceledAt:"",
              noShowAt:"",
              noshowAt:""
            }
          }
        );

      }catch(assignmentErr){

        console.log(
          "RETURN TO DRIVER ASSIGNMENT UPDATE WARNING:",
          assignmentErr
        );
      }
    }

    const reopenedTrip =
      await Trip.findOne(tenantFilter(req,{_id:id}));

    return res.json({
      success:true,
      message:"Trip returned to driver",
      previousStatus,
      status:
        reopenedTrip?.status ||
        "InProgress",
      trip:
        reopenedTrip
          ? reopenedTrip.toObject()
          : null
    });

  }catch(err){

    console.log(
      "RETURN TO DRIVER ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Failed to return trip to driver"
    });
  }
});

module.exports = router;