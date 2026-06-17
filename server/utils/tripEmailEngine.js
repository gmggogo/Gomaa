const nodemailer = require("nodemailer");
const SystemDesign = require("../models/SystemDesign");

/* =========================
   CREATE TRANSPORTER
========================= */
function createEmailTransporter(settings){

  return nodemailer.createTransport({
    host: settings?.smtpHost || "smtp.zoho.com",
    port: Number(settings?.smtpPort || 465),
    secure:true,
    auth:{
      user: settings?.smtpUser || process.env.EMAIL_USER,
      pass: settings?.smtpPass || process.env.EMAIL_PASS
    }
  });

}

/* =========================
   TIME FORMAT
========================= */
function formatTripDateTime(trip, timezone){

  const d = String(trip.tripDate || "").trim();
  const t = String(trip.tripTime || "").trim();

  if(!d || !t){
    return { date:d, time:t };
  }

  const dateObj = new Date(`${d} ${t}`);

  return {
    date: dateObj.toLocaleDateString("en-US",{
      timeZone: timezone || "America/Phoenix",
      year:"numeric",
      month:"long",
      day:"numeric"
    }),
    time: dateObj.toLocaleTimeString("en-US",{
      timeZone: timezone || "America/Phoenix",
      hour:"numeric",
      minute:"2-digit"
    })
  };
}

/* =========================
   COMPANY CHECK
========================= */
function isCompanyTrip(trip){

  const type =
    String(trip?.type || "")
      .toLowerCase();

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

  if(!trip?.cancelToken) return "";

  return `https://sunbeam-933q.onrender.com/booking/cancel.html?token=${trip.cancelToken}`;
}

/* =========================
   ADD STOP LINK  🔥🔥🔥
========================= */
function buildAddStopLink(trip){

  if(!trip?.publicActionToken) return "";

  return `https://sunbeam-933q.onrender.com/booking/add-stop.html?tripId=${trip._id}&token=${trip.publicActionToken}`;
}

/* =========================
   SEND EMAIL
========================= */
async function sendTripStatusEmail(trip, type){

  try{

    if(!trip) return;

    if(!trip.clientEmail || isCompanyTrip(trip)){
      return;
    }

    if(type === "CONFIRMED" && trip.confirmationEmailSent){
      return;
    }

    const settings =
      await SystemDesign.findOne({});

    const transporter =
      createEmailTransporter(settings);

    const timezone =
      settings?.timezone || "America/Phoenix";

    const formatted =
      formatTripDateTime(trip, timezone);

    const cancelLink =
      buildCancelLink(trip);

    const addStopLink =
      buildAddStopLink(trip);

    let subject = "";
    let statusBlock = "";

/* =========================
   CONFIRMED
========================= */

if(type === "CONFIRMED"){

  subject = "Trip Confirmation";

  statusBlock = `

    <p>Your booking has been confirmed.</p>

    <p><b>Total Paid:</b> $${Number(trip.priceAmount || 0).toFixed(2)}</p>

    <hr/>

    ${addStopLink ? `
    <a href="${addStopLink}" style="
      display:inline-block;
      padding:12px 18px;
      background:#2563eb;
      color:#fff;
      text-decoration:none;
      border-radius:8px;
      font-weight:bold;
      margin-right:10px;
    ">
      Add Stop
    </a>
    ` : ""}

    ${cancelLink ? `
    <a href="${cancelLink}" style="
      display:inline-block;
      padding:12px 18px;
      background:#dc2626;
      color:#fff;
      text-decoration:none;
      border-radius:8px;
      font-weight:bold;
    ">
      Cancel Trip
    </a>
    ` : ""}

  `;
}

/* =========================
   REMINDER
========================= */

else if(type === "REMINDER"){

  subject = "Trip Reminder";

  statusBlock = `
    <p>Your trip is in less than 2 hours.</p>
  `;
}

else{
  return;
}

/* =========================
   SEND
========================= */

await transporter.sendMail({

  from:`"${settings?.companyName || "Sunbeam"}" <${settings?.smtpUser || process.env.EMAIL_USER}>`,
  to:trip.clientEmail,
  subject,

  html:`

  <div style="font-family:Arial;max-width:650px;margin:auto;padding:20px;border:1px solid #e5e7eb;border-radius:12px;">

    <h2>${subject}</h2>

    <hr/>

    <p><b>Trip #:</b> ${trip.tripNumber || ""}</p>
    <p><b>Pickup:</b> ${trip.pickup || ""}</p>
    <p><b>Dropoff:</b> ${trip.dropoff || ""}</p>

    <p><b>Date:</b> ${formatted.date}</p>
    <p><b>Time:</b> ${formatted.time}</p>

    <hr/>

    ${statusBlock}

  </div>

  `

});

  }catch(err){
    console.log("EMAIL ERROR:",err);
  }

}

module.exports = {
  sendTripStatusEmail
};