"use strict";

const express =
  require("express");

const mongoose =
  require("mongoose");

const jwt =
  require("jsonwebtoken");

const router =
  express.Router();

const BillingHistory =
  mongoose.models.BillingHistory ||
  require("../models/BillingHistory");

const Tenant =
  mongoose.models.Tenant ||
  require("../models/Tenant");

const User =
  global.User ||
  mongoose.models.User ||
  require("../models/User");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
   HELPERS
========================= */

function clean(value){
  return String(value ?? "").trim();
}

function n(value){
  const num = Number(value);
  return Number.isFinite(num)
    ? num
    : 0;
}

function readToken(req){
  const header =
    clean(
      req.headers?.authorization
    );

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

function requireSuperAdmin(
  req,
  res,
  next
){

  const token =
    readToken(req);

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

    const role =
      clean(
        verified.role
      )
      .toUpperCase()
      .replace(/[\s-]+/g,"_");

    if(
      role !== "SUPER_ADMIN" &&
      role !== "SUPERADMIN"
    ){
      return res.status(403).json({
        success:false,
        message:"Super Admin access required"
      });
    }

    if(!verified.tenantId){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    req.authUser = {
      id:
        verified.id || null,
      tenantId:
        String(verified.tenantId),
      role
    };

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

function parseDateStart(value){

  const text =
    clean(value);

  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)){
    return null;
  }

  const date =
    new Date(
      text + "T00:00:00.000Z"
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

function parseDateEnd(value){

  const text =
    clean(value);

  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)){
    return null;
  }

  const date =
    new Date(
      text + "T23:59:59.999Z"
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

function dateKey(date){
  return date
    .toISOString()
    .slice(0,10);
}

function isCompanyUser(user){

  const role =
    clean(
      user?.role ||
      user?.type
    ).toLowerCase();

  return (
    role === "company" ||
    role === "facility" ||
    role.includes("company") ||
    role.includes("facility")
  );
}

function tripDateObject(trip){

  const values = [
    trip?.paymentCapturedAt,
    trip?.completedAt,
    trip?.finalStatusConfirmedAt,
    trip?.tripDate,
    trip?.createdAt
  ];

  for(const value of values){

    if(!value){
      continue;
    }

    let date = null;

    if(
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value)
    ){
      date =
        new Date(
          value + "T12:00:00.000Z"
        );
    }else{
      date =
        new Date(value);
    }

    if(
      !Number.isNaN(
        date.getTime()
      )
    ){
      return date;
    }
  }

  return null;
}

function tripInPeriod(
  trip,
  from,
  to
){
  const date =
    tripDateObject(trip);

  return (
    date &&
    date >= from &&
    date <= to
  );
}

function paymentIsPaid(trip){

  const status =
    clean(
      trip?.paymentStatus
    ).toUpperCase();

  return (
    status === "PAID" ||
    n(trip?.capturedAmount) > 0 ||
    Boolean(
      trip?.paymentCapturedAt
    )
  );
}

function paidAmount(trip){

  const captured =
    n(
      trip?.capturedAmount
    );

  if(captured > 0){
    return captured;
  }

  return n(
    trip?.finalPrice ||
    trip?.priceAmount ||
    trip?.price
  );
}

function tripMiles(trip){

  const status =
    clean(
      trip?.status
    )
    .replace(/\s+/g,"")
    .toLowerCase();

  if(
    !status.includes("complete")
  ){
    return 0;
  }

  return n(
    trip?.miles ||
    trip?.sharedRouteMiles
  );
}

function sourceKey(trip){

  const type =
    clean(
      trip?.type
    ).toUpperCase();

  const source =
    clean(
      trip?.source
    ).toUpperCase();

  const booking =
    clean(
      trip?.bookingSource
    ).toUpperCase();

  const createdFrom =
    clean(
      trip?.createdFrom
    ).toUpperCase();

  const tripNumber =
    clean(
      trip?.tripNumber
    ).toUpperCase();

  const reserved =
    type === "RESERVED" ||
    source === "RV" ||
    booking === "RV" ||
    tripNumber.startsWith("RV-") ||
    createdFrom === "DISPATCH-ADD-TRIP";

  if(reserved){
    return "RESERVED";
  }

  const getQuote =
    source === "GQ" ||
    booking === "GQ" ||
    source.includes("GET_QUOTE") ||
    source.includes("GETQUOTE") ||
    booking.includes("GET_QUOTE") ||
    booking.includes("GETQUOTE") ||
    createdFrom.includes("GET_QUOTE") ||
    createdFrom.includes("GETQUOTE") ||
    type === "GET_QUOTE";

  if(getQuote){
    return "GET_QUOTE";
  }

  return "OTHER";
}

/* =========================
   REPORT
========================= */

router.get(
  "/",
  requireSuperAdmin,
  async (req,res)=>{

    try{

      const now =
        new Date();

      const defaultFrom =
        new Date(
          Date.UTC(
            now.getUTCFullYear(),
            0,
            1,
            0,
            0,
            0,
            0
          )
        );

      const from =
        parseDateStart(
          req.query.from
        ) ||
        defaultFrom;

      const to =
        parseDateEnd(
          req.query.to
        ) ||
        now;

      if(from > to){

        return res.status(400).json({
          success:false,
          message:"Invalid date range"
        });
      }

      const tenantId =
        req.authUser.tenantId;

      const Trip =
        global.Trip ||
        mongoose.models.Trip;

      if(!Trip){

        return res.status(500).json({
          success:false,
          message:"Trip model not loaded"
        });
      }

      const [
        tenant,
        users,
        billingHistory,
        trips
      ] =
        await Promise.all([

          Tenant
            .findById(
              tenantId
            )
            .lean(),

          User
            .find({
              tenantId
            })
            .lean(),

          BillingHistory
            .find({
              tenantId,
              paidDate:{
                $gte:from,
                $lte:to
              }
            })
            .sort({
              paidDate:1
            })
            .lean(),

          Trip
            .find({
              tenantId
            })
            .lean()
        ]);

      if(!tenant){

        return res.status(404).json({
          success:false,
          message:"Tenant not found"
        });
      }

      const companies =
        users.filter(
          isCompanyUser
        );

      const companyMap =
        new Map();

      for(
        const company
        of companies
      ){

        companyMap.set(
          String(company._id),
          {
            companyId:
              String(company._id),

            companyName:
              clean(
                company.name ||
                company.companyName ||
                company.facilityName ||
                company.organizationName ||
                company.username
              ) ||
              "Company",

            paymentCount:0,
            paidAmount:0,
            tripCount:0
          }
        );
      }

      let companyPayments = 0;
      let companyPaymentCount = 0;
      let companyTrips = 0;

      for(
        const payment
        of billingHistory
      ){

        const amount =
          n(
            payment.invoiceAmount ||
            payment.revenue
          );

        const paymentTrips =
          n(
            payment.totalTrips
          );

        companyPayments +=
          amount;

        companyPaymentCount +=
          1;

        companyTrips +=
          paymentTrips;

        const key =
          String(
            payment.companyId ||
            ""
          );

        if(
          !companyMap.has(key)
        ){

          companyMap.set(
            key ||
            clean(
              payment.companyName
            ),
            {
              companyId:key,
              companyName:
                clean(
                  payment.companyName
                ) ||
                "Company",
              paymentCount:0,
              paidAmount:0,
              tripCount:0
            }
          );
        }

        const row =
          companyMap.get(
            key
          ) ||
          companyMap.get(
            clean(
              payment.companyName
            )
          );

        if(row){
          row.paymentCount += 1;
          row.paidAmount += amount;
          row.tripCount += paymentTrips;
        }
      }

      const periodTrips =
        trips.filter(
          trip =>
            tripInPeriod(
              trip,
              from,
              to
            )
        );

      const getQuote = {
        paidTrips:0,
        amount:0,
        miles:0
      };

      const reserved = {
        paidTrips:0,
        amount:0,
        miles:0
      };

      let totalMiles = 0;

      for(
        const trip
        of periodTrips
      ){

        totalMiles +=
          tripMiles(trip);

        if(
          !paymentIsPaid(trip)
        ){
          continue;
        }

        const key =
          sourceKey(trip);

        if(
          key === "GET_QUOTE"
        ){

          getQuote.paidTrips += 1;
          getQuote.amount +=
            paidAmount(trip);
          getQuote.miles +=
            tripMiles(trip);

        }else if(
          key === "RESERVED"
        ){

          reserved.paidTrips += 1;
          reserved.amount +=
            paidAmount(trip);
          reserved.miles +=
            tripMiles(trip);
        }
      }

      const companyRows =
        [...companyMap.values()]
          .sort(
            (a,b)=>
              a.companyName.localeCompare(
                b.companyName
              )
          )
          .map(row=>({
            ...row,
            paidAmount:
              Number(
                row.paidAmount
                  .toFixed(2)
              )
          }));

      const getQuoteAmount =
        Number(
          getQuote.amount
            .toFixed(2)
        );

      const reservedAmount =
        Number(
          reserved.amount
            .toFixed(2)
        );

      const totalAmount =
        Number(
          (
            companyPayments +
            getQuoteAmount +
            reservedAmount
          ).toFixed(2)
        );

      return res.json({

        success:true,

        companyName:
          clean(
            tenant.companyName ||
            tenant.name
          ) ||
          "Company",

        period:{
          from:
            dateKey(from),
          to:
            dateKey(to)
        },

        generatedAt:
          new Date(),

        summary:{
          companiesCount:
            companies.length,

          companyPayments:
            Number(
              companyPayments
                .toFixed(2)
            ),

          companyPaymentCount,

          companyTrips,

          getQuotePayments:
            getQuoteAmount,

          reservedPayments:
            reservedAmount,

          totalAmount,

          totalMiles:
            Number(
              totalMiles
                .toFixed(1)
            )
        },

        companies:
          companyRows,

        getQuote:{
          paidTrips:
            getQuote.paidTrips,
          amount:
            getQuoteAmount,
          miles:
            Number(
              getQuote.miles
                .toFixed(1)
            )
        },

        reserved:{
          paidTrips:
            reserved.paidTrips,
          amount:
            reservedAmount,
          miles:
            Number(
              reserved.miles
                .toFixed(1)
            )
        }
      });

    }catch(err){

      console.error(
        "TAX REPORT ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Failed to build tax report"
      });
    }
  }
);

module.exports = router;