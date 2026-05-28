const nodemailer = require("nodemailer");

const SystemDesign =
require("../models/SystemDesign");

/* =========================
   CREATE TRANSPORTER
========================= */
function createEmailTransporter(settings){

  return nodemailer.createTransport({

    host:
      settings?.smtpHost ||
      "smtp.zoho.com",

    port:
      Number(
        settings?.smtpPort || 465
      ),

    secure:true,

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
   COMPANY CHECK
========================= */
function isCompanyTrip(trip){

  const type =
    String(trip?.type || "")
      .toLowerCase()
      .trim();

  return (

    !!trip?.company ||

    type.includes("company") ||

    type.includes("facility")

  );

}

/* =========================
   CANCEL LINK
========================= */
function buildCancelLink(trip){

  if(!trip?.cancelToken){
    return "";
  }

  return `
    https://sunbeam-933q.onrender.com/booking/cancel.html?token=${trip.cancelToken}
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

    /* =========================
       NO EMAIL
    ========================= */

    if(
      !trip.clientEmail ||
      isCompanyTrip(trip)
    ){
      return;
    }

    /* =========================
       DUPLICATE PROTECTION
    ========================= */

    if(
      type === "CONFIRMED" &&
      trip.confirmationEmailSent === true
    ){
      return;
    }

    const settings =
      await SystemDesign.findOne({});

    const transporter =
      createEmailTransporter(settings);

    const companyName =

      settings?.companyName ||

      "Sunbeam Transportation";

    const companyEmail =

      settings?.smtpUser ||

      process.env.EMAIL_USER;

    const cancelLink =
      buildCancelLink(trip);

    let subject = "";

    let statusBlock = "";

    /* =========================
       CONFIRMED
    ========================= */

    if(type === "CONFIRMED"){

      subject =
        "Trip Confirmation";

      statusBlock = `

        <p>
          Your booking has been confirmed.
        </p>

        <p>
          <b>Total Paid:</b>
          $${trip.priceAmount || 0}
        </p>

        ${
          cancelLink
          ? `
          <hr/>

          <a
            href="${cancelLink}"
            style="
              display:inline-block;
              padding:12px 18px;
              background:#dc2626;
              color:#fff;
              text-decoration:none;
              border-radius:8px;
              font-weight:bold;
            "
          >
            Cancel Trip
          </a>
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

        <p>
          Your trip is in less than 2 hours.
        </p>

        ${
          cancelLink
          ? `
          <hr/>

          <a
            href="${cancelLink}"
            style="
              display:inline-block;
              padding:12px 18px;
              background:#dc2626;
              color:#fff;
              text-decoration:none;
              border-radius:8px;
              font-weight:bold;
            "
          >
            Cancel Trip
          </a>
          `
          : ""
        }

      `;

    }

    /* =========================
       CANCELLED
    ========================= */

    else if(type === "CANCELLED"){

      subject =
        "Trip Cancelled";

      statusBlock = `

        <p>
          Your trip has been cancelled.
        </p>

        <p>
          <b>Refund:</b>
          $${trip.refundAmount || 0}
        </p>

        <p>
          <b>Cancel Fee:</b>
          $${trip.cancelFee || 0}
        </p>

        <p>
          <b>Refund Status:</b>
          ${trip.refundStatus || "none"}
        </p>

      `;

    }

    /* =========================
       NO SHOW
    ========================= */

    else if(type === "NOSHOW"){

      subject =
        "No Show Charge";

      statusBlock = `

        <p>
          Trip marked as No Show.
        </p>

        <p>
          <b>No Show Fee:</b>
          $${trip.noShowFee || 0}
        </p>

      `;

    }

    /* =========================
       COMPLETED
    ========================= */

    else if(type === "COMPLETED"){

      subject =
        "Trip Completed";

      statusBlock = `

        <p>
          Thank you for riding with us.
        </p>

        <p>
          <b>Total:</b>
          $${trip.finalPrice || 0}
        </p>

      `;

    }

    else{

      return;

    }

    /* =========================
       SEND EMAIL
    ========================= */

    await transporter.sendMail({

      from:
      `"${companyName}" <${companyEmail}>`,

      to:
      trip.clientEmail,

      subject,

      html:`

      <div
        style="
          font-family:Arial;
          max-width:650px;
          margin:auto;
          padding:20px;
          border:1px solid #e5e7eb;
          border-radius:12px;
        "
      >

        <h2
          style="
            color:#0f172a;
          "
        >
          ${subject}
        </h2>

        <hr/>

        <p>
          <b>Trip #:</b>
          ${trip.tripNumber || ""}
        </p>

        <p>
          <b>Pickup:</b>
          ${trip.pickup || ""}
        </p>

        <p>
          <b>Dropoff:</b>
          ${trip.dropoff || ""}
        </p>

        <p>
          <b>Date:</b>
          ${trip.tripDate || ""}
        </p>

        <p>
          <b>Time:</b>
          ${trip.tripTime || ""}
        </p>

        <hr/>

        ${statusBlock}

      </div>

      `

    });

    /* =========================
       SAVE CONFIRM FLAG
    ========================= */

    if(type === "CONFIRMED"){

      const Trip =
        require("../index").Trip ||
        require("../models/Trip");

      try{

        await Trip.findByIdAndUpdate(
          trip._id,
          {
            confirmationEmailSent:true
          }
        );

      }catch(saveErr){

        console.log(
          "CONFIRM FLAG ERROR:",
          saveErr
        );

      }

    }

    console.log(
      "EMAIL SENT:",
      type,
      trip.tripNumber
    );

  }catch(err){

    console.log(
      "EMAIL ENGINE ERROR:",
      err
    );

  }

}

/* =========================
   EXPORT
========================= */

module.exports = {

  sendTripStatusEmail

};