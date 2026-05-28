
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
   MAIN EMAIL ENGINE
========================= */
async function sendTripStatusEmail(
  trip,
  type
){
  try{
    if(!trip?.clientEmail){
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
      `;
    }
    /* =========================
       CANCELLED
    ========================= */
    if(type === "CANCELLED"){
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
      `;
    }
    /* =========================
       NOSHOW
    ========================= */
    if(type === "NOSHOW"){
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
    if(type === "COMPLETED"){
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
      <h2>
        ${subject}
      </h2>
      <hr/>
      <p>
        <b>Trip #:</b>
        ${trip.tripNumber}
      </p>
      <p>
        <b>Pickup:</b>
        ${trip.pickup}
      </p>
      <p>
        <b>Dropoff:</b>
        ${trip.dropoff}
      </p>
      <p>
        <b>Date:</b>
        ${trip.tripDate}
      </p>
      <p>
        <b>Time:</b>
        ${trip.tripTime}
      </p>
      <hr/>
      ${statusBlock}
      `
    });
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