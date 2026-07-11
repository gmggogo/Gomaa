
"use strict";

/* =========================================
FILE: utils/tripEmailEngine.js

GET QUOTE EMAIL ONLY

- CONFIRMED
- REMINDER
- ROUTE_UPDATED
- CANCELLED
- NOSHOW
- Cancel Trip button
- Add Stop button controlled only by:
  getQuoteAddStopEnabled
  getQuoteAddStopCustomTimeEnabled
  getQuoteAddStopCutoffMinutes
========================================= */

const nodemailer =
  require("nodemailer");

const mongoose =
  require("mongoose");

const jwt =
  require("jsonwebtoken");

const SystemDesign =
  require("../models/SystemDesign");

const Service =
  require("../models/Service");

/* =========================
   CONFIG
========================= */

const PUBLIC_BASE_URL =
  String(
    process.env.PUBLIC_BASE_URL ||
    "https://sunbeam-933q.onrender.com"
  )
    .trim()
    .replace(/\/+$/,"");

const CUSTOMER_LINK_SECRET =
  process.env.CUSTOMER_LINK_SECRET ||
  process.env.JWT_SECRET ||
  process.env.SECRET_KEY ||
  "dev_customer_add_stop_secret";

/* =========================
   BASIC HELPERS
========================= */

function clean(value){

  return String(
    value ?? ""
  )
    .replace(/\s+/g," ")
    .trim();

}

function upper(value){

  return clean(value)
    .toUpperCase();

}

function lower(value){

  return clean(value)
    .toLowerCase();

}

function n(value,fallback = 0){

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;

}

function bool(value){

  return (
    value === true ||
    lower(value) === "true" ||
    lower(value) === "yes" ||
    lower(value) === "1"
  );

}

function escapeHtml(value){

  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");

}

function escapeRegex(value){

  return clean(value)
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

}

function cleanStatus(value){

  return lower(value)
    .replace(/\s+/g,"")
    .replace(/-/g,"")
    .replace(/_/g,"");

}

/* =========================
   SERVICE HELPERS
========================= */

function normalizeServiceCode(value){

  const code =
    upper(value)
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(
    code === "STANDARD" ||
    code === "ST"
  ){
    return "ST";
  }

  if(
    code === "WHEELCHAIR" ||
    code === "WHEEL CHAIR" ||
    code === "WC" ||
    code === "WH"
  ){
    return "WH";
  }

  if(
    code === "SHARED" ||
    code === "SH"
  ){
    return "SH";
  }

  if(
    code === "LIMO" ||
    code === "LIMOUSINE" ||
    code === "LM"
  ){
    return "LM";
  }

  if(
    code === "TAXI" ||
    code === "TX"
  ){
    return "TX";
  }

  if(code === "XL"){
    return "XL";
  }

  return code;

}

function getTripServiceValue(trip){

  return clean(
    trip?.serviceKey ||
    trip?.serviceCode ||
    trip?.serviceType ||
    trip?.vehicleTypeFromQuote ||
    trip?.vehicle ||
    ""
  );

}

function getServiceCandidates(trip){

  const raw =
    upper(
      getTripServiceValue(trip)
    );

  const normalized =
    normalizeServiceCode(raw);

  const values = [];

  function add(value){

    const v =
      upper(value);

    if(
      v &&
      !values.includes(v)
    ){

      values.push(v);

    }

  }

  add(raw);
  add(normalized);

  if(normalized === "ST"){
    add("STANDARD");
  }

  if(normalized === "WH"){
    add("WHEELCHAIR");
    add("WC");
  }

  if(normalized === "TX"){
    add("TAXI");
  }

  if(normalized === "LM"){
    add("LIMO");
    add("LIMOUSINE");
  }

  if(normalized === "SH"){
    add("SHARED");
  }

  return values;

}

async function findGetQuoteService(trip){

  const candidates =
    getServiceCandidates(trip);

  if(!candidates.length){

    return null;

  }

  const regexes =
    candidates.map(value=>
      new RegExp(
        "^" +
        escapeRegex(value) +
        "$",
        "i"
      )
    );

  return Service.findOne({

    $or:[

      {
        serviceKey:{
          $in:candidates
        }
      },

      {
        serviceCode:{
          $in:candidates
        }
      },

      {
        serviceType:{
          $in:candidates
        }
      },

      {
        suffix:{
          $in:candidates
        }
      },

      {
        title:{
          $in:regexes
        }
      },

      {
        name:{
          $in:regexes
        }
      },

      {
        serviceName:{
          $in:regexes
        }
      }

    ]

  }).lean();

}

/* =========================
   TRANSPORTER
========================= */

function createEmailTransporter(settings){

  const smtpPort =
    Number(
      settings?.smtpPort ||
      465
    );

  return nodemailer.createTransport({

    host:
      settings?.smtpHost ||
      "smtp.zoho.com",

    port:
      smtpPort,

    secure:
      smtpPort === 465,

    auth:{

      user:
        settings?.smtpUser ||
        process.env.EMAIL_USER,

      pass:
        settings?.smtpPass ||
        process.env.EMAIL_PASS

    }

  });

}

/* =========================
   DATE / TIME
========================= */

function getSystemTimezone(settings){

  return (
    settings?.timezone ||
    process.env.SYSTEM_TIMEZONE ||
    "America/Phoenix"
  );

}

function getSystemNow(settings){

  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone:
          getSystemTimezone(settings)
      }
    )
  );

}

function getTripDateTime(trip){

  const date =
    clean(
      trip?.tripDate
    );

  const time =
    clean(
      trip?.tripTime
    );

  if(!date || !time){

    return null;

  }

  const safeTime =
    time.length === 5
      ? `${time}:00`
      : time;

  const result =
    new Date(
      `${date}T${safeTime}`
    );

  if(
    Number.isNaN(
      result.getTime()
    )
  ){

    return null;

  }

  return result;

}

function formatTripDateTime(
  trip,
  settings
){

  const rawDate =
    clean(
      trip?.tripDate
    );

  const rawTime =
    clean(
      trip?.tripTime
    );

  const dateObj =
    getTripDateTime(trip);

  if(!dateObj){

    return {
      date:rawDate,
      time:rawTime
    };

  }

  const timezone =
    getSystemTimezone(
      settings
    );

  try{

    return {

      date:
        dateObj.toLocaleDateString(
          "en-US",
          {
            timeZone:timezone,
            year:"numeric",
            month:"long",
            day:"numeric"
          }
        ),

      time:
        dateObj.toLocaleTimeString(
          "en-US",
          {
            timeZone:timezone,
            hour:"numeric",
            minute:"2-digit"
          }
        )

    };

  }catch(err){

    return {
      date:rawDate,
      time:rawTime
    };

  }

}

/* =========================
   TRIP CHECKS
========================= */

function isCompanyTrip(trip){

  const type =
    lower(
      trip?.type
    );

  return (
    !!clean(trip?.company) ||
    type.includes("company") ||
    type.includes("facility")
  );

}

function isSharedTrip(trip){

  if(!trip){

    return false;

  }

  const tripType =
    upper(
      trip.tripType ||
      trip.type
    );

  const tripNumber =
    upper(
      trip.tripNumber
    );

  const serviceCode =
    normalizeServiceCode(
      getTripServiceValue(trip)
    );

  return (
    trip.isShared === true ||
    tripType === "SHARED" ||
    serviceCode === "SH" ||
    tripNumber.includes("-SH")
  );

}

function isClosedTrip(trip){

  const status =
    cleanStatus(
      trip?.status
    );

  return (
    status.includes("complete") ||
    status.includes("cancel") ||
    status.includes("noshow") ||
    status.includes("notcompleted")
  );

}

/* =========================
   GET QUOTE ADD STOP POLICY
========================= */

function getGetQuotePolicy(service){

  if(!service){

    return {

      normalAddStopEnabled:false,

      customTimeEnabled:false,

      cutoffMinutes:0

    };

  }

  if(
    service.enabled === false ||
    service.active === false
  ){

    return {

      normalAddStopEnabled:false,

      customTimeEnabled:false,

      cutoffMinutes:0

    };

  }

  return {

    normalAddStopEnabled:
      bool(
        service
          .getQuoteAddStopEnabled ??
        false
      ),

    customTimeEnabled:
      bool(
        service
          .getQuoteAddStopCustomTimeEnabled ??
        false
      ),

    cutoffMinutes:
      Math.max(
        0,
        n(
          service
            .getQuoteAddStopCutoffMinutes,
          0
        )
      )

  };

}

/* =========================
   INDEPENDENT POLICY LOGIC
========================= */

function isAddStopAllowed(
  trip,
  policy,
  settings
){

  if(
    !trip ||
    isClosedTrip(trip)
  ){

    return false;

  }

  const normalEnabled =
    policy
      ?.normalAddStopEnabled === true;

  const customEnabled =
    policy
      ?.customTimeEnabled === true;

  /*
    Both disabled.
  */

  if(
    !normalEnabled &&
    !customEnabled
  ){

    return false;

  }

  /*
    Normal Add Stop works by itself.
    It stays available until Dropoff.
  */

  if(normalEnabled){

    return true;

  }

  /*
    Only Custom Time is active.
  */

  const tripDateTime =
    getTripDateTime(trip);

  if(!tripDateTime){

    return false;

  }

  const now =
    getSystemNow(settings);

  const cutoffMinutes =
    Math.max(
      0,
      n(
        policy?.cutoffMinutes,
        0
      )
    );

  const cutoffTime =
    new Date(
      tripDateTime.getTime() -
      cutoffMinutes * 60000
    );

  return (
    now.getTime() <
    cutoffTime.getTime()
  );

}

/* =========================
   LINKS
========================= */

function buildCancelLink(trip){

  const cancelToken =
    clean(
      trip?.cancelToken
    );

  if(!cancelToken){

    return "";

  }

  return (
    `${PUBLIC_BASE_URL}` +
    `/booking/cancel.html?token=` +
    encodeURIComponent(
      cancelToken
    )
  );

}

function createCustomerAddStopToken(trip){

  if(!trip?._id){

    return "";

  }

  return jwt.sign(
    {

      tripId:
        String(
          trip._id
        ),

      purpose:
        "CUSTOMER_ADD_STOP"

    },
    CUSTOMER_LINK_SECRET,
    {
      expiresIn:"30d"
    }
  );

}

async function buildAddStopLink(
  trip,
  settings = null
){

  if(
    !trip ||
    !trip._id ||
    isCompanyTrip(trip) ||
    isSharedTrip(trip) ||
    isClosedTrip(trip)
  ){

    return "";

  }

  const service =
    await findGetQuoteService(
      trip
    );

  if(!service){

    return "";

  }

  const policy =
    getGetQuotePolicy(
      service
    );

  if(
    !isAddStopAllowed(
      trip,
      policy,
      settings
    )
  ){

    return "";

  }

  const token =
    createCustomerAddStopToken(
      trip
    );

  if(!token){

    return "";

  }

  return (
    `${PUBLIC_BASE_URL}` +
    `/getquote/customer-add-stop.html?token=` +
    encodeURIComponent(token)
  );

}

/* =========================
   BUTTON HTML
========================= */

function buildEmailButton({
  href,
  label,
  background,
  marginRight = false
}){

  if(!href){

    return "";

  }

  return `

    <a
      href="${escapeHtml(href)}"
      target="_blank"
      rel="noopener noreferrer"
      style="
        display:inline-block;
        padding:13px 20px;
        margin-top:8px;
        ${marginRight ? "margin-right:10px;" : ""}
        background:${background};
        color:#ffffff;
        text-decoration:none;
        border-radius:9px;
        font-family:Arial,sans-serif;
        font-weight:bold;
      "
    >
      ${escapeHtml(label)}
    </a>

  `;

}

/* =========================
   STOPS HTML
========================= */

function buildStopsHtml(stops){

  const list =
    Array.isArray(stops)
      ? stops
          .map(stop=>clean(stop))
          .filter(Boolean)
      : [];

  if(!list.length){

    return "";

  }

  return list
    .map(
      (stop,index)=>`

        <tr>

          <td style="
            padding:8px 0;
            width:110px;
            font-weight:bold;
            vertical-align:top;
          ">
            Stop ${index + 1}:
          </td>

          <td style="
            padding:8px 0;
            vertical-align:top;
          ">
            ${escapeHtml(stop)}
          </td>

        </tr>

      `
    )
    .join("");

}

/* =========================
   SEND EMAIL
========================= */

async function sendTripStatusEmail(
  trip,
  type
){

  try{

    if(!trip){

      return null;

    }

    const clientEmail =
      clean(
        trip.clientEmail
      );

    if(
      !clientEmail ||
      isCompanyTrip(trip)
    ){

      return null;

    }

    if(
      type === "CONFIRMED" &&
      trip.confirmationEmailSent === true
    ){

      return null;

    }

    const settings =
      await SystemDesign.findOne({});

    const smtpUser =
      settings?.smtpUser ||
      process.env.EMAIL_USER;

    const smtpPass =
      settings?.smtpPass ||
      process.env.EMAIL_PASS;

    if(
      !clean(smtpUser) ||
      !clean(smtpPass)
    ){

      throw new Error(
        "Email SMTP credentials are missing"
      );

    }

    const transporter =
      createEmailTransporter(
        settings
      );

    const formatted =
      formatTripDateTime(
        trip,
        settings
      );

    const cancelLink =
      buildCancelLink(
        trip
      );

    const addStopLink =
      await buildAddStopLink(
        trip,
        settings
      );

    const addStopButton =
      buildEmailButton({

        href:addStopLink,

        label:"Add Stop",

        background:"#2563eb",

        marginRight:true

      });

    const cancelButton =
      buildEmailButton({

        href:cancelLink,

        label:"Cancel Trip",

        background:"#dc2626"

      });

    let subject = "";
    let statusBlock = "";
    let showActions = false;

    if(type === "CONFIRMED"){

      subject =
        "Trip Confirmation";

      statusBlock = `

        <p style="
          margin:0 0 12px;
          color:#111827;
          font-size:15px;
          line-height:1.5;
        ">
          Your booking has been confirmed.
        </p>

        <p style="
          margin:0;
          color:#111827;
          font-size:15px;
        ">
          <b>Total:</b>
          $${Number(
            trip.priceAmount || 0
          ).toFixed(2)}
        </p>

      `;

      showActions = true;

    }else if(type === "ROUTE_UPDATED"){

      subject =
        "Trip Route Updated";

      statusBlock = `

        <p style="
          margin:0 0 12px;
          color:#111827;
          font-size:15px;
          line-height:1.5;
        ">
          Your trip route has been updated successfully.
        </p>

        <p style="
          margin:0;
          color:#111827;
          font-size:15px;
        ">
          <b>Updated Total:</b>
          $${Number(
            trip.priceAmount || 0
          ).toFixed(2)}
        </p>

      `;

      showActions = true;

    }else if(type === "PAYMENT_REQUIRED"){

      subject =
        "Action Required: Update Trip Payment";

      const paymentLink =
        PUBLIC_BASE_URL +
        "/booking/payment.html?tripId=" +
        encodeURIComponent(String(trip._id || ""));

      statusBlock = `

        <p style="margin:0 0 12px;color:#991b1b;font-size:15px;line-height:1.5;">
          We could not authorize the current trip price of
          <b>$${Number(trip.priceAmount || 0).toFixed(2)}</b>.
        </p>

        <p style="margin:0 0 14px;color:#111827;font-size:15px;line-height:1.5;">
          Please update your payment method before pickup. Your trip cannot
          begin until the exact trip price is approved by your bank.
        </p>

        ${buildEmailButton({
          href:paymentLink,
          label:"Update Payment Method",
          background:"#dc2626"
        })}

      `;

      showActions = false;

    }else if(type === "REMINDER"){

      subject =
        "Trip Reminder";

      statusBlock = `

        <p style="
          margin:0;
          color:#111827;
          font-size:15px;
          line-height:1.5;
        ">
          Your trip is in less than 2 hours.
        </p>

      `;

      showActions = true;

    }else if(type === "CANCELLED"){

      subject =
        "Trip Cancelled";

      statusBlock = `

        <p style="
          margin:0;
          color:#991b1b;
          font-size:15px;
          line-height:1.5;
        ">
          Your trip has been cancelled.
        </p>

      `;

    }else if(type === "NOSHOW"){

      subject =
        "Trip No Show";

      statusBlock = `

        <p style="
          margin:0;
          color:#991b1b;
          font-size:15px;
          line-height:1.5;
        ">
          This trip was marked as No Show.
        </p>

      `;

    }else{

      return null;

    }

    const actionButtons =

      showActions &&
      (
        addStopButton ||
        cancelButton
      )

        ? `

          <div style="
            margin-top:18px;
            padding-top:16px;
            border-top:1px solid #e5e7eb;
          ">
            ${addStopButton}
            ${cancelButton}
          </div>

        `

        : "";

    const companyDisplayName =
      clean(
        settings?.companyName
      ) ||
      "Sunbeam Transportation";

    const stopsHtml =
      buildStopsHtml(
        trip.stops
      );

    const result =
      await transporter.sendMail({

        from:
          `"${companyDisplayName}" <${smtpUser}>`,

        to:
          clientEmail,

        subject,

        html:`

          <div style="
            padding:24px 12px;
            background:#f8fafc;
            font-family:Arial,sans-serif;
          ">

            <div style="
              max-width:650px;
              margin:0 auto;
              overflow:hidden;
              background:#ffffff;
              border:1px solid #e5e7eb;
              border-radius:14px;
            ">

              <div style="
                padding:20px;
                background:#1d4ed8;
                color:#ffffff;
              ">

                <h2 style="
                  margin:0;
                  font-size:23px;
                ">
                  ${escapeHtml(subject)}
                </h2>

              </div>

              <div style="
                padding:22px;
              ">

                <table
                  role="presentation"
                  style="
                    width:100%;
                    border-collapse:collapse;
                    color:#111827;
                    font-size:14px;
                  "
                >

                  <tr>

                    <td style="
                      padding:8px 0;
                      width:110px;
                      font-weight:bold;
                      vertical-align:top;
                    ">
                      Trip #:
                    </td>

                    <td style="
                      padding:8px 0;
                      vertical-align:top;
                    ">
                      ${escapeHtml(
                        trip.tripNumber || ""
                      )}
                    </td>

                  </tr>

                  <tr>

                    <td style="
                      padding:8px 0;
                      font-weight:bold;
                      vertical-align:top;
                    ">
                      Pickup:
                    </td>

                    <td style="
                      padding:8px 0;
                      vertical-align:top;
                    ">
                      ${escapeHtml(
                        trip.pickup || ""
                      )}
                    </td>

                  </tr>

                  ${stopsHtml}

                  <tr>

                    <td style="
                      padding:8px 0;
                      font-weight:bold;
                      vertical-align:top;
                    ">
                      Dropoff:
                    </td>

                    <td style="
                      padding:8px 0;
                      vertical-align:top;
                    ">
                      ${escapeHtml(
                        trip.dropoff || ""
                      )}
                    </td>

                  </tr>

                  <tr>

                    <td style="
                      padding:8px 0;
                      font-weight:bold;
                      vertical-align:top;
                    ">
                      Date:
                    </td>

                    <td style="
                      padding:8px 0;
                      vertical-align:top;
                    ">
                      ${escapeHtml(
                        formatted.date || ""
                      )}
                    </td>

                  </tr>

                  <tr>

                    <td style="
                      padding:8px 0;
                      font-weight:bold;
                      vertical-align:top;
                    ">
                      Time:
                    </td>

                    <td style="
                      padding:8px 0;
                      vertical-align:top;
                    ">
                      ${escapeHtml(
                        formatted.time || ""
                      )}
                    </td>

                  </tr>

                </table>

                <div style="
                  margin-top:18px;
                  padding-top:18px;
                  border-top:1px solid #e5e7eb;
                ">

                  ${statusBlock}

                  ${actionButtons}

                </div>

              </div>

            </div>

          </div>

        `

      });

    console.log(
      `✅ ${type} email sent:`,
      trip.tripNumber,
      result?.messageId || ""
    );

    return result;

  }catch(err){

    console.error(
      "TRIP EMAIL ERROR:",
      err
    );

    return null;

  }

}

/* =========================
   EXPORT
========================= */

module.exports = {

  sendTripStatusEmail,

  buildCancelLink,

  buildAddStopLink,

  createCustomerAddStopToken,

  findGetQuoteService,

  getGetQuotePolicy,

  isAddStopAllowed

};
Library
/
tripEmailEngine.txt


"use strict";

/* =========================================
FILE: utils/tripEmailEngine.js

GET QUOTE EMAIL ONLY

- CONFIRMED
- REMINDER
- ROUTE_UPDATED
- CANCELLED
- NOSHOW
- Cancel Trip button
- Add Stop button controlled only by:
  getQuoteAddStopEnabled
  getQuoteAddStopCustomTimeEnabled
  getQuoteAddStopCutoffMinutes
========================================= */

const nodemailer =
  require("nodemailer");

const mongoose =
  require("mongoose");

const jwt =
  require("jsonwebtoken");

const SystemDesign =
  require("../models/SystemDesign");

const Service =
  require("../models/Service");

/* =========================
   CONFIG
========================= */

const PUBLIC_BASE_URL =
  String(
    process.env.PUBLIC_BASE_URL ||
    "https://sunbeam-933q.onrender.com"
  )
    .trim()
    .replace(/\/+$/,"");

const CUSTOMER_LINK_SECRET =
  process.env.CUSTOMER_LINK_SECRET ||
  process.env.JWT_SECRET ||
  process.env.SECRET_KEY ||
  "dev_customer_add_stop_secret";

/* =========================
   BASIC HELPERS
========================= */

function clean(value){

  return String(
    value ?? ""
  )
    .replace(/\s+/g," ")
    .trim();

}

function upper(value){

  return clean(value)
    .toUpperCase();

}

function lower(value){

  return clean(value)
    .toLowerCase();

}

function n(value,fallback = 0){

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;

}

function bool(value){

  return (
    value === true ||
    lower(value) === "true" ||
    lower(value) === "yes" ||
    lower(value) === "1"
  );

}

function escapeHtml(value){

  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");

}

function escapeRegex(value){

  return clean(value)
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

}

function cleanStatus(value){

  return lower(value)
    .replace(/\s+/g,"")
    .replace(/-/g,"")
    .replace(/_/g,"");

}

/* =========================
   SERVICE HELPERS
========================= */

function normalizeServiceCode(value){

  const code =
    upper(value)
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(
    code === "STANDARD" ||
    code === "ST"
  ){
    return "ST";
  }

  if(
    code === "WHEELCHAIR" ||
    code === "WHEEL CHAIR" ||
    code === "WC" ||
    code === "WH"
  ){
    return "WH";
  }

  if(
    code === "SHARED" ||
    code === "SH"
  ){
    return "SH";
  }

  if(
    code === "LIMO" ||
    code === "LIMOUSINE" ||
    code === "LM"
  ){
    return "LM";
  }

  if(
    code === "TAXI" ||
    code === "TX"
  ){
    return "TX";
  }

  if(code === "XL"){
    return "XL";
  }

  return code;

}

function getTripServiceValue(trip){

  return clean(
    trip?.serviceKey ||
    trip?.serviceCode ||
    trip?.serviceType ||
    trip?.vehicleTypeFromQuote ||
    trip?.vehicle ||
    ""
  );

}

function getServiceCandidates(trip){

  const raw =
    upper(
      getTripServiceValue(trip)
    );

  const normalized =
    normalizeServiceCode(raw);

  const values = [];

  function add(value){

    const v =
      upper(value);

    if(
      v &&
      !values.includes(v)
    ){

      values.push(v);

    }

  }

  add(raw);
  add(normalized);

  if(normalized === "ST"){
    add("STANDARD");
  }

  if(normalized === "WH"){
    add("WHEELCHAIR");
    add("WC");
  }

  if(normalized === "TX"){
    add("TAXI");
  }

  if(normalized === "LM"){
    add("LIMO");
    add("LIMOUSINE");
  }

  if(normalized === "SH"){
    add("SHARED");
  }

  return values;

}

async function findGetQuoteService(trip){

  const candidates =
    getServiceCandidates(trip);

  if(!candidates.length){

    return null;

  }

  const regexes =
    candidates.map(value=>
      new RegExp(
        "^" +
        escapeRegex(value) +
        "$",
        "i"
      )
    );

  return Service.findOne({

    $or:[

      {
        serviceKey:{
          $in:candidates
        }
      },

      {
        serviceCode:{
          $in:candidates
        }
      },

      {
        serviceType:{
          $in:candidates
        }
      },

      {
        suffix:{
          $in:candidates
        }
      },

      {
        title:{
          $in:regexes
        }
      },

      {
        name:{
          $in:regexes
        }
      },

      {
        serviceName:{
          $in:regexes
        }
      }

    ]

  }).lean();

}

/* =========================
   TRANSPORTER
========================= */

function createEmailTransporter(settings){

  const smtpPort =
    Number(
      settings?.smtpPort ||
      465
    );

  return nodemailer.createTransport({

    host:
      settings?.smtpHost ||
      "smtp.zoho.com",

    port:
      smtpPort,

    secure:
      smtpPort === 465,

    auth:{

      user:
        settings?.smtpUser ||
        process.env.EMAIL_USER,

      pass:
        settings?.smtpPass ||
        process.env.EMAIL_PASS

    }

  });

}

/* =========================
   DATE / TIME
========================= */

function getSystemTimezone(settings){

  return (
    settings?.timezone ||
    process.env.SYSTEM_TIMEZONE ||
    "America/Phoenix"
  );

}

function getSystemNow(settings){

  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone:
          getSystemTimezone(settings)
      }
    )
  );

}

function getTripDateTime(trip){

  const date =
    clean(
      trip?.tripDate
    );

  const time =
    clean(
      trip?.tripTime
    );

  if(!date || !time){

    return null;

  }

  const safeTime =
    time.length === 5
      ? `${time}:00`
      : time;

  const result =
    new Date(
      `${date}T${safeTime}`
    );

  if(
    Number.isNaN(
      result.getTime()
    )
  ){

    return null;

  }

  return result;

}

function formatTripDateTime(
  trip,
  settings
){

  const rawDate =
    clean(
      trip?.tripDate
    );

  const rawTime =
    clean(
      trip?.tripTime
    );

  const dateObj =
    getTripDateTime(trip);

  if(!dateObj){

    return {
      date:rawDate,
      time:rawTime
    };

  }

  const timezone =
    getSystemTimezone(
      settings
    );

  try{

    return {

      date:
        dateObj.toLocaleDateString(
          "en-US",
          {
            timeZone:timezone,
            year:"numeric",
            month:"long",
            day:"numeric"
          }
        ),

      time:
        dateObj.toLocaleTimeString(
          "en-US",
          {
            timeZone:timezone,
            hour:"numeric",
            minute:"2-digit"
          }
        )

    };

  }catch(err){

    return {
      date:rawDate,
      time:rawTime
    };

  }

}

/* =========================
   TRIP CHECKS
========================= */

function isCompanyTrip(trip){

  const type =
    lower(
      trip?.type
    );

  return (
    !!clean(trip?.company) ||
    type.includes("company") ||
    type.includes("facility")
  );

}

function isSharedTrip(trip){

  if(!trip){

    return false;

  }

  const tripType =
    upper(
      trip.tripType ||
      trip.type
    );

  const tripNumber =
    upper(
      trip.tripNumber
    );

  const serviceCode =
    normalizeServiceCode(
      getTripServiceValue(trip)
    );

  return (
    trip.isShared === true ||
    tripType === "SHARED" ||
    serviceCode === "SH" ||
    tripNumber.includes("-SH")
  );

}

function isClosedTrip(trip){

  const status =
    cleanStatus(
      trip?.status
    );

  return (
    status.includes("complete") ||
    status.includes("cancel") ||
    status.includes("noshow") ||
    status.includes("notcompleted")
  );

}

/* =========================
   GET QUOTE ADD STOP POLICY
========================= */

function getGetQuotePolicy(service){

  if(!service){

    return {

      normalAddStopEnabled:false,

      customTimeEnabled:false,

      cutoffMinutes:0

    };

  }

  if(
    service.enabled === false ||
    service.active === false
  ){

    return {

      normalAddStopEnabled:false,

      customTimeEnabled:false,

      cutoffMinutes:0

    };

  }

  return {

    normalAddStopEnabled:
      bool(
        service
          .getQuoteAddStopEnabled ??
        false
      ),

    customTimeEnabled:
      bool(
        service
          .getQuoteAddStopCustomTimeEnabled ??
        false
      ),

    cutoffMinutes:
      Math.max(
        0,
        n(
          service
            .getQuoteAddStopCutoffMinutes,
          0
        )
      )

  };

}

/* =========================
   INDEPENDENT POLICY LOGIC
========================= */

function isAddStopAllowed(
  trip,
  policy,
  settings
){

  if(
    !trip ||
    isClosedTrip(trip)
  ){

    return false;

  }

  const normalEnabled =
    policy
      ?.normalAddStopEnabled === true;

  const customEnabled =
    policy
      ?.customTimeEnabled === true;

  /*
    Both disabled.
  */

  if(
    !normalEnabled &&
    !customEnabled
  ){

    return false;

  }

  /*
    Normal Add Stop works by itself.
    It stays available until Dropoff.
  */

  if(normalEnabled){

    return true;

  }

  /*
    Only Custom Time is active.
  */

  const tripDateTime =
    getTripDateTime(trip);

  if(!tripDateTime){

    return false;

  }

  const now =
    getSystemNow(settings);

  const cutoffMinutes =
    Math.max(
      0,
      n(
        policy?.cutoffMinutes,
        0
      )
    );

  const cutoffTime =
    new Date(
      tripDateTime.getTime() -
      cutoffMinutes * 60000
    );

  return (
    now.getTime() <
    cutoffTime.getTime()
  );

}

/* =========================
   LINKS
========================= */

function buildCancelLink(trip){

  const cancelToken =
    clean(
      trip?.cancelToken
    );

  if(!cancelToken){

    return "";

  }

  return (
    `${PUBLIC_BASE_URL}` +
    `/booking/cancel.html?token=` +
    encodeURIComponent(
      cancelToken
    )
  );

}

function createCustomerAddStopToken(trip){

  if(!trip?._id){

    return "";

  }

  return jwt.sign(
    {

      tripId:
        String(
          trip._id
        ),

      purpose:
        "CUSTOMER_ADD_STOP"

    },
    CUSTOMER_LINK_SECRET,
    {
      expiresIn:"30d"
    }
  );

}

async function buildAddStopLink(
  trip,
  settings = null
){

  if(
    !trip ||
    !trip._id ||
    isCompanyTrip(trip) ||
    isSharedTrip(trip) ||
    isClosedTrip(trip)
  ){

    return "";

  }

  const service =
    await findGetQuoteService(
      trip
    );

  if(!service){

    return "";

  }

  const policy =
    getGetQuotePolicy(
      service
    );

  if(
    !isAddStopAllowed(
      trip,
      policy,
      settings
    )
  ){

    return "";

  }

  const token =
    createCustomerAddStopToken(
      trip
    );

  if(!token){

    return "";

  }

  return (
    `${PUBLIC_BASE_URL}` +
    `/getquote/customer-add-stop.html?token=` +
    encodeURIComponent(token)
  );

}

/* =========================
   BUTTON HTML
========================= */

function buildEmailButton({
  href,
  label,
  background,
  marginRight = false
}){

  if(!href){

    return "";

  }

  return `

    <a
      href="${escapeHtml(href)}"
      target="_blank"
      rel="noopener noreferrer"
      style="
        display:inline-block;
        padding:13px 20px;
        margin-top:8px;
        ${marginRight ? "margin-right:10px;" : ""}
        background:${background};
        color:#ffffff;
        text-decoration:none;
        border-radius:9px;
        font-family:Arial,sans-serif;
        font-weight:bold;
      "
    >
      ${escapeHtml(label)}
    </a>

  `;

}

/* =========================
   STOPS HTML
========================= */

function buildStopsHtml(stops){

  const list =
    Array.isArray(stops)
      ? stops
          .map(stop=>clean(stop))
          .filter(Boolean)
      : [];

  if(!list.length){

    return "";

  }

  return list
    .map(
      (stop,index)=>`

        <tr>

          <td style="
            padding:8px 0;
            width:110px;
            font-weight:bold;
            vertical-align:top;
          ">
            Stop ${index + 1}:
          </td>

          <td style="
            padding:8px 0;
            vertical-align:top;
          ">
            ${escapeHtml(stop)}
          </td>

        </tr>

      `
    )
    .join("");

}

/* =========================
   SEND EMAIL
========================= */

async function sendTripStatusEmail(
  trip,
  type
){

  try{

    if(!trip){

      return null;

    }

    const clientEmail =
      clean(
        trip.clientEmail
      );

    if(
      !clientEmail ||
      isCompanyTrip(trip)
    ){

      return null;

    }

    if(
      type === "CONFIRMED" &&
      trip.confirmationEmailSent === true
    ){

      return null;

    }

    const settings =
      await SystemDesign.findOne({});

    const smtpUser =
      settings?.smtpUser ||
      process.env.EMAIL_USER;

    const smtpPass =
      settings?.smtpPass ||
      process.env.EMAIL_PASS;

    if(
      !clean(smtpUser) ||
      !clean(smtpPass)
    ){

      throw new Error(
        "Email SMTP credentials are missing"
      );

    }

    const transporter =
      createEmailTransporter(
        settings
      );

    const formatted =
      formatTripDateTime(
        trip,
        settings
      );

    const cancelLink =
      buildCancelLink(
        trip
      );

    const addStopLink =
      await buildAddStopLink(
        trip,
        settings
      );

    const addStopButton =
      buildEmailButton({

        href:addStopLink,

        label:"Add Stop",

        background:"#2563eb",

        marginRight:true

      });

    const cancelButton =
      buildEmailButton({

        href:cancelLink,

        label:"Cancel Trip",

        background:"#dc2626"

      });

    let subject = "";
    let statusBlock = "";
    let showActions = false;

    if(type === "CONFIRMED"){

      subject =
        "Trip Confirmation";

      statusBlock = `

        <p style="
          margin:0 0 12px;
          color:#111827;
          font-size:15px;
          line-height:1.5;
        ">
          Your booking has been confirmed.
        </p>

        <p style="
          margin:0;
          color:#111827;
          font-size:15px;
        ">
          <b>Total:</b>
          $${Number(
            trip.priceAmount || 0
          ).toFixed(2)}
        </p>

      `;

      showActions = true;

    }else if(type === "ROUTE_UPDATED"){

      subject =
        "Trip Route Updated";

      statusBlock = `

        <p style="
          margin:0 0 12px;
          color:#111827;
          font-size:15px;
          line-height:1.5;
        ">
          Your trip route has been updated successfully.
        </p>

        <p style="
          margin:0;
          color:#111827;
          font-size:15px;
        ">
          <b>Updated Total:</b>
          $${Number(
            trip.priceAmount || 0
          ).toFixed(2)}
        </p>

      `;

      showActions = true;

    }else if(type === "PAYMENT_REQUIRED"){

      subject =
        "Action Required: Update Trip Payment";

      const paymentLink =
        PUBLIC_BASE_URL +
        "/booking/payment.html?tripId=" +
        encodeURIComponent(String(trip._id || ""));

      statusBlock = `

        <p style="margin:0 0 12px;color:#991b1b;font-size:15px;line-height:1.5;">
          We could not authorize the current trip price of
          <b>$${Number(trip.priceAmount || 0).toFixed(2)}</b>.
        </p>

        <p style="margin:0 0 14px;color:#111827;font-size:15px;line-height:1.5;">
          Please update your payment method before pickup. Your trip cannot
          begin until the exact trip price is approved by your bank.
        </p>

        ${buildEmailButton({
          href:paymentLink,
          label:"Update Payment Method",
          background:"#dc2626"
        })}

      `;

      showActions = false;

    }else if(type === "REMINDER"){

      subject =
        "Trip Reminder";

      statusBlock = `

        <p style="
          margin:0;
          color:#111827;
          font-size:15px;
          line-height:1.5;
        ">
          Your trip is in less than 2 hours.
        </p>

      `;

      showActions = true;

    }else if(type === "CANCELLED"){

      subject =
        "Trip Cancelled";

      statusBlock = `

        <p style="
          margin:0;
          color:#991b1b;
          font-size:15px;
          line-height:1.5;
        ">
          Your trip has been cancelled.
        </p>

      `;

    }else if(type === "NOSHOW"){

      subject =
        "Trip No Show";

      statusBlock = `

        <p style="
          margin:0;
          color:#991b1b;
          font-size:15px;
          line-height:1.5;
        ">
          This trip was marked as No Show.
        </p>

      `;

    }else{

      return null;

    }

    const actionButtons =

      showActions &&
      (
        addStopButton ||
        cancelButton
      )

        ? `

          <div style="
            margin-top:18px;
            padding-top:16px;
            border-top:1px solid #e5e7eb;
          ">
            ${addStopButton}
            ${cancelButton}
          </div>

        `

        : "";

    const companyDisplayName =
      clean(
        settings?.companyName
      ) ||
      "Sunbeam Transportation";

    const stopsHtml =
      buildStopsHtml(
        trip.stops
      );

    const result =
      await transporter.sendMail({

        from:
          `"${companyDisplayName}" <${smtpUser}>`,

        to:
          clientEmail,

        subject,

        html:`

          <div style="
            padding:24px 12px;
            background:#f8fafc;
            font-family:Arial,sans-serif;
          ">

            <div style="
              max-width:650px;
              margin:0 auto;
              overflow:hidden;
              background:#ffffff;
              border:1px solid #e5e7eb;
              border-radius:14px;
            ">

              <div style="
                padding:20px;
                background:#1d4ed8;
                color:#ffffff;
              ">

                <h2 style="
                  margin:0;
                  font-size:23px;
                ">
                  ${escapeHtml(subject)}
                </h2>

              </div>

              <div style="
                padding:22px;
              ">

                <table
                  role="presentation"
                  style="
                    width:100%;
                    border-collapse:collapse;
                    color:#111827;
                    font-size:14px;
                  "
                >

                  <tr>

                    <td style="
                      padding:8px 0;
                      width:110px;
                      font-weight:bold;
                      vertical-align:top;
                    ">
                      Trip #:
                    </td>

                    <td style="
                      padding:8px 0;
                      vertical-align:top;
                    ">
                      ${escapeHtml(
                        trip.tripNumber || ""
                      )}
                    </td>

                  </tr>

                  <tr>

                    <td style="
                      padding:8px 0;
                      font-weight:bold;
                      vertical-align:top;
                    ">
                      Pickup:
                    </td>

                    <td style="
                      padding:8px 0;
                      vertical-align:top;
                    ">
                      ${escapeHtml(
                        trip.pickup || ""
                      )}
                    </td>

                  </tr>

                  ${stopsHtml}

                  <tr>

                    <td style="
                      padding:8px 0;
                      font-weight:bold;
                      vertical-align:top;
                    ">
                      Dropoff:
                    </td>

                    <td style="
                      padding:8px 0;
                      vertical-align:top;
                    ">
                      ${escapeHtml(
                        trip.dropoff || ""
                      )}
                    </td>

                  </tr>

                  <tr>

                    <td style="
                      padding:8px 0;
                      font-weight:bold;
                      vertical-align:top;
                    ">
                      Date:
                    </td>

                    <td style="
                      padding:8px 0;
                      vertical-align:top;
                    ">
                      ${escapeHtml(
                        formatted.date || ""
                      )}
                    </td>

                  </tr>

                  <tr>

                    <td style="
                      padding:8px 0;
                      font-weight:bold;
                      vertical-align:top;
                    ">
                      Time:
                    </td>

                    <td style="
                      padding:8px 0;
                      vertical-align:top;
                    ">
                      ${escapeHtml(
                        formatted.time || ""
                      )}
                    </td>

                  </tr>

                </table>

                <div style="
                  margin-top:18px;
                  padding-top:18px;
                  border-top:1px solid #e5e7eb;
                ">

                  ${statusBlock}

                  ${actionButtons}

                </div>

              </div>

            </div>

          </div>

        `

      });

    console.log(
      `✅ ${type} email sent:`,
      trip.tripNumber,
      result?.messageId || ""
    );

    return result;

  }catch(err){

    console.error(
      "TRIP EMAIL ERROR:",
      err
    );

    return null;

  }

}

/* =========================
   EXPORT
========================= */

module.exports = {

  sendTripStatusEmail,

  buildCancelLink,

  buildAddStopLink,

  createCustomerAddStopToken,

  findGetQuoteService,

  getGetQuotePolicy,

  isAddStopAllowed

};