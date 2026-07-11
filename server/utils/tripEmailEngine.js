/* =========================================
FILE: tripEmailEngine.js

GET QUOTE CUSTOMER EMAIL

- Confirmation email
- Reminder email
- Route Updated email
- Cancel Trip button
- Add Stop button based on current Admin Service
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

const FacilityPricingOverride =
  require("../models/FacilityPricingOverride");

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
   HELPERS
========================= */

function clean(value){

  return String(
    value ?? ""
  ).trim();

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

  const num =
    Number(value);

  return Number.isFinite(num)
    ? num
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

function escapeRegex(value){

  return clean(value)
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
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

function cleanStatus(value){

  return lower(value)
    .replace(/\s+/g,"")
    .replace(/-/g,"")
    .replace(/_/g,"");

}

/* =========================
   SERVICE CODE
========================= */

function normalizeCode(value){

  const code =
    upper(value);

  if(code === "STANDARD"){
    return "ST";
  }

  if(code === "WHEELCHAIR"){
    return "WH";
  }

  if(code === "SHARED"){
    return "SH";
  }

  if(
    code === "LIMO" ||
    code === "LIMOUSINE"
  ){
    return "LM";
  }

  if(code === "TAXI"){
    return "TX";
  }

  if(code === "XL"){
    return "XL";
  }

  return code;

}

function getTripServiceKey(trip){

  return normalizeCode(
    trip?.serviceKey ||
    trip?.serviceCode ||
    trip?.serviceType ||
    trip?.vehicleTypeFromQuote ||
    trip?.vehicle ||
    ""
  );

}

function buildServiceSearchFilter(
  idOrKey
){

  const raw =
    clean(idOrKey);

  if(
    mongoose.Types.ObjectId.isValid(
      raw
    )
  ){

    return {
      _id:raw
    };

  }

  const key =
    normalizeCode(raw);

  const rawUpper =
    upper(raw);

  const rx =
    new RegExp(
      "^" +
      escapeRegex(raw) +
      "$",
      "i"
    );

  return {

    $or:[

      { serviceKey:key },
      { serviceKey:rawUpper },

      { serviceCode:key },
      { serviceCode:rawUpper },

      { serviceType:key },
      { serviceType:rawUpper },

      { suffix:key },
      { suffix:rawUpper },

      { companySuffix:key },
      { companySuffix:rawUpper },

      { reservedSuffix:key },
      { reservedSuffix:rawUpper },

      { title:rx },
      { name:rx },
      { serviceName:rx }

    ]

  };

}

function getOverrideServiceCode(service){

  return normalizeCode(
    service?.serviceKey ||
    service?.serviceCode ||
    service?.serviceType ||
    service?.serviceSuffix ||
    service?.suffix ||
    service?.companySuffix ||
    service?.reservedSuffix ||
    service?.key ||
    service?.code ||
    service?.title ||
    service?.name ||
    service?.serviceName ||
    ""
  );

}

function isOverrideServiceEnabled(service){

  if(!service){
    return false;
  }

  if(service.active !== undefined){
    return bool(service.active);
  }

  if(service.enabled !== undefined){
    return bool(service.enabled);
  }

  if(service.companyEnabled !== undefined){
    return bool(service.companyEnabled);
  }

  return true;

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

  let value =
    new Date(
      `${date}T${time}`
    );

  if(
    Number.isNaN(
      value.getTime()
    )
  ){

    value =
      new Date(
        `${date} ${time}`
      );

  }

  if(
    Number.isNaN(
      value.getTime()
    )
  ){

    return null;

  }

  return value;

}

function formatTripDateTime(
  trip,
  timezone
){

  const date =
    clean(
      trip?.tripDate
    );

  const time =
    clean(
      trip?.tripTime
    );

  const value =
    getTripDateTime(trip);

  if(!value){

    return {
      date,
      time
    };

  }

  try{

    return {

      date:
        value.toLocaleDateString(
          "en-US",
          {
            timeZone:
              timezone ||
              "America/Phoenix",

            year:"numeric",
            month:"long",
            day:"numeric"
          }
        ),

      time:
        value.toLocaleTimeString(
          "en-US",
          {
            timeZone:
              timezone ||
              "America/Phoenix",

            hour:"numeric",
            minute:"2-digit"
          }
        )

    };

  }catch(err){

    return {
      date,
      time
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

  const serviceKey =
    getTripServiceKey(trip);

  return (
    trip.isShared === true ||
    tripType === "SHARED" ||
    serviceKey === "SH" ||
    serviceKey === "SHARED" ||
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

function tripIsInProgress(trip){

  const status =
    cleanStatus(
      trip?.status
    );

  return [
    "ontrip",
    "started",
    "inprogress",
    "pickedup",
    "pickupcompleted",
    "passengerpickedup",
    "enroute",
    "active"
  ].includes(status);

}

/* =========================
   ADD STOP POLICY
========================= */

async function findFacilityOverride(trip){

  const facilityId =
    clean(
      trip?.facilityId ||
      trip?.companyId ||
      ""
    );

  const company =
    clean(
      trip?.company
    );

  const or = [];

  if(
    facilityId &&
    mongoose.Types.ObjectId.isValid(
      facilityId
    )
  ){

    or.push({
      facilityId
    });

  }

  if(company){

    const rx =
      new RegExp(
        "^" +
        escapeRegex(company) +
        "$",
        "i"
      );

    or.push({
      facilityName:rx
    });

  }

  if(!or.length){

    return null;

  }

  return FacilityPricingOverride
    .findOne({
      active:true,
      $or:or
    })
    .sort({
      updatedAt:-1,
      createdAt:-1
    })
    .lean();

}

async function resolveAddStopPolicy(trip){

  const serviceKey =
    getTripServiceKey(trip);

  if(!serviceKey){

    return {
      addStopEnabled:false
    };

  }

  const override =
    await findFacilityOverride(
      trip
    );

  if(override){

    const services =
      Array.isArray(
        override.services
      )
        ? override.services
        : [];

    const overrideService =
      services.find(
        service =>
          getOverrideServiceCode(
            service
          ) === serviceKey
      );

    if(
      overrideService &&
      isOverrideServiceEnabled(
        overrideService
      )
    ){

      return {

        source:
          "FACILITY_OVERRIDE",

        addStopEnabled:
          bool(
            overrideService
              .addStopEnabled ??
            overrideService
              .companyAddStopEnabled ??
            false
          ),

        addStopCustomTimeEnabled:
          bool(
            overrideService
              .addStopCustomTimeEnabled ??
            overrideService
              .companyAddStopCustomTimeEnabled ??
            false
          ),

        addStopCutoffMinutes:
          Math.max(
            0,
            n(
              overrideService
                .addStopCutoffMinutes ??
              overrideService
                .companyAddStopCutoffMinutes ??
              0
            )
          )

      };

    }

  }

  const service =
    await Service
      .findOne(
        buildServiceSearchFilter(
          serviceKey
        )
      )
      .lean();

  if(!service){

    return {
      addStopEnabled:false
    };

  }

  if(
    service.companyEnabled === false ||
    service.enabled === false ||
    service.active === false
  ){

    return {
      addStopEnabled:false
    };

  }

  return {

    source:
      "SERVICE_MANAGEMENT",

    addStopEnabled:
      bool(
        service.companyAddStopEnabled ??
        service.addStopEnabled ??
        false
      ),

    addStopCustomTimeEnabled:
      bool(
        service
          .companyAddStopCustomTimeEnabled ??
        service
          .addStopCustomTimeEnabled ??
        false
      ),

    addStopCutoffMinutes:
      Math.max(
        0,
        n(
          service
            .companyAddStopCutoffMinutes ??
          service
            .addStopCutoffMinutes ??
          0
        )
      )

  };

}

function isAddStopPolicyAllowed(
  trip,
  policy
){

  if(
    !policy ||
    policy.addStopEnabled !== true
  ){

    return false;

  }

  if(
    policy
      .addStopCustomTimeEnabled !== true
  ){

    return tripIsInProgress(trip);

  }

  const tripDateTime =
    getTripDateTime(trip);

  if(!tripDateTime){

    return false;

  }

  const cutoffMinutes =
    Math.max(
      0,
      n(
        policy
          .addStopCutoffMinutes,
        0
      )
    );

  const cutoffTime =
    new Date(
      tripDateTime.getTime() -
      cutoffMinutes * 60000
    );

  return (
    Date.now() <=
    cutoffTime.getTime()
  );

}

/* =========================
   LINKS
========================= */

function buildCancelLink(trip){

  const token =
    clean(
      trip?.cancelToken
    );

  if(!token){

    return "";

  }

  return (
    `${PUBLIC_BASE_URL}` +
    `/booking/cancel.html?token=` +
    encodeURIComponent(token)
  );

}

function createCustomerAddStopToken(trip){

  if(!trip?._id){

    return "";

  }

  return jwt.sign(
    {
      tripId:
        String(trip._id),

      purpose:
        "CUSTOMER_ADD_STOP"
    },
    CUSTOMER_LINK_SECRET,
    {
      expiresIn:"30d"
    }
  );

}

async function buildAddStopLink(trip){

  if(
    !trip ||
    !trip._id ||
    isCompanyTrip(trip) ||
    isSharedTrip(trip) ||
    isClosedTrip(trip)
  ){

    return "";

  }

  const policy =
    await resolveAddStopPolicy(
      trip
    );

  if(
    !isAddStopPolicyAllowed(
      trip,
      policy
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
   EMAIL BUTTON
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
        background:${background};
        color:#ffffff;
        text-decoration:none;
        border-radius:9px;
        font-weight:bold;
        font-family:Arial,sans-serif;
        margin-top:8px;
        ${marginRight ? "margin-right:10px;" : ""}
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
            font-weight:bold;
            width:110px;
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

    const timezone =
      settings?.timezone ||
      "America/Phoenix";

    const formatted =
      formatTripDateTime(
        trip,
        timezone
      );

    const cancelLink =
      buildCancelLink(
        trip
      );

    const addStopLink =
      await buildAddStopLink(
        trip
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
          margin:0 0 14px;
          color:#111827;
          font-size:15px;
        ">
          <b>Total Paid:</b>
          $${Number(
            trip.priceAmount || 0
          ).toFixed(2)}
        </p>

      `;

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
          margin:0 0 14px;
          color:#111827;
          font-size:15px;
        ">
          <b>New Total:</b>
          $${Number(
            trip.priceAmount || 0
          ).toFixed(2)}
        </p>

      `;

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

    }else{

      return null;

    }

    const actionButtons =

      addStopButton ||
      cancelButton

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
            background:#f8fafc;
            padding:24px 12px;
            font-family:Arial,sans-serif;
          ">

            <div style="
              max-width:650px;
              margin:0 auto;
              background:#ffffff;
              border:1px solid #e5e7eb;
              border-radius:14px;
              overflow:hidden;
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
                      font-weight:bold;
                      width:110px;
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

    console.log(
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

  resolveAddStopPolicy,

  isAddStopPolicyAllowed

};