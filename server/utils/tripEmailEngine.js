/* =========================================
FILE: tripEmailEngine.js

GET QUOTE CUSTOMER EMAIL

- Confirmation email
- Reminder email
- Secure Cancel Trip button
- Secure Add Stop button
- Add Stop for individual trips only
========================================= */

const nodemailer =
  require("nodemailer");

const jwt =
  require("jsonwebtoken");

const SystemDesign =
  require("../models/SystemDesign");

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
  ).trim();

}

function upper(value){

  return clean(value)
    .toUpperCase();

}

function escapeHtml(value){

  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");

}

/* =========================
   CREATE TRANSPORTER
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
   TIME FORMAT
========================= */

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

  if(!date || !time){

    return {
      date,
      time
    };

  }

  let dateObj =
    new Date(
      `${date}T${time}`
    );

  if(
    Number.isNaN(
      dateObj.getTime()
    )
  ){

    dateObj =
      new Date(
        `${date} ${time}`
      );

  }

  if(
    Number.isNaN(
      dateObj.getTime()
    )
  ){

    return {
      date,
      time
    };

  }

  try{

    return {

      date:
        dateObj.toLocaleDateString(
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
        dateObj.toLocaleTimeString(
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
   COMPANY CHECK
========================= */

function isCompanyTrip(trip){

  const type =
    clean(
      trip?.type
    ).toLowerCase();

  return (
    !!clean(trip?.company) ||
    type.includes("company") ||
    type.includes("facility")
  );

}

/* =========================
   SHARED CHECK
========================= */

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
    upper(
      trip.serviceKey ||
      trip.serviceCode ||
      trip.serviceType ||
      trip.sharedSuffix ||
      trip.vehicle ||
      ""
    );

  return (
    trip.isShared === true ||
    tripType === "SHARED" ||
    serviceKey === "SH" ||
    serviceKey === "SHARED" ||
    tripNumber.includes("-SH")
  );

}

/* =========================
   CLOSED TRIP CHECK
========================= */

function isClosedTrip(trip){

  const status =
    clean(
      trip?.status
    )
      .toLowerCase()
      .replace(/\s+/g,"")
      .replace(/-/g,"")
      .replace(/_/g,"");

  return (
    status.includes("complete") ||
    status.includes("cancel") ||
    status.includes("noshow") ||
    status.includes("notcompleted")
  );

}

/* =========================
   CANCEL LINK
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
    encodeURIComponent(cancelToken)
  );

}

/* =========================
   ADD STOP TOKEN
========================= */

function createCustomerAddStopToken(
  trip
){

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

/* =========================
   ADD STOP LINK
========================= */

function buildAddStopLink(trip){

  if(
    !trip ||
    !trip._id ||
    isCompanyTrip(trip) ||
    isSharedTrip(trip) ||
    isClosedTrip(trip)
  ){

    return "";

  }

  const addStopToken =
    createCustomerAddStopToken(
      trip
    );

  if(!addStopToken){

    return "";

  }

  return (
    `${PUBLIC_BASE_URL}` +
    `/getquote/customer-add-stop.html?token=` +
    encodeURIComponent(addStopToken)
  );

}

/* =========================
   BUTTON
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
   SEND EMAIL
========================= */

async function sendTripStatusEmail(
  trip,
  type
){

  try{

    if(!trip){

      return;

    }

    const clientEmail =
      clean(
        trip.clientEmail
      );

    if(
      !clientEmail ||
      isCompanyTrip(trip)
    ){

      return;

    }

    if(
      type === "CONFIRMED" &&
      trip.confirmationEmailSent === true
    ){

      return;

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
      buildAddStopLink(
        trip
      );

    let subject = "";
    let statusBlock = "";

    /* =========================
       CONFIRMED
    ========================= */

    if(type === "CONFIRMED"){

      subject =
        "Trip Confirmation";

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

        ${
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
            : ""
        }

      `;

    }

    /* =========================
       REMINDER
    ========================= */

    else if(type === "REMINDER"){

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

    }

    else{

      return;

    }

    /* =========================
       SAFE EMAIL VALUES
    ========================= */

    const companyDisplayName =
      clean(
        settings?.companyName
      ) ||
      "Sunbeam Transportation";

    const tripNumber =
      escapeHtml(
        trip.tripNumber || ""
      );

    const pickup =
      escapeHtml(
        trip.pickup || ""
      );

    const dropoff =
      escapeHtml(
        trip.dropoff || ""
      );

    const tripDate =
      escapeHtml(
        formatted.date || ""
      );

    const tripTime =
      escapeHtml(
        formatted.time || ""
      );

    /* =========================
       SEND
    ========================= */

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
                background:linear-gradient(135deg,#0f172a,#1d4ed8);
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
                      ${tripNumber}
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
                      ${pickup}
                    </td>
                  </tr>

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
                      ${dropoff}
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
                      ${tripDate}
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
                      ${tripTime}
                    </td>
                  </tr>

                </table>

                <div style="
                  margin-top:18px;
                  padding-top:18px;
                  border-top:1px solid #e5e7eb;
                ">
                  ${statusBlock}
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
  createCustomerAddStopToken
};