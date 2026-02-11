/* ===============================
   LOAD PENDING BOOKING
================================ */
let booking = null;

try {
  booking = JSON.parse(localStorage.getItem("pendingBooking"));
} catch {}

if (!booking) {
  alert("No booking data found.");
  window.location.href = "./index.html";
}

/* ===============================
   SHOW SUMMARY
================================ */
const summaryEl = document.getElementById("summary");
if (summaryEl) {
  summaryEl.innerHTML = `
    <div class="row"><b>Passenger:</b> ${booking.passenger?.name || "-"}</div>
    <div class="row"><b>Phone:</b> ${booking.passenger?.phone || "-"}</div>
    <div class="row"><b>Pickup:</b> ${booking.pickup || "-"}</div>
    <div class="row"><b>Dropoff:</b> ${booking.dropoff || "-"}</div>
    <div class="row"><b>Date:</b> ${booking.date || "-"}</div>
    <div class="row"><b>Time:</b> ${booking.time || "-"}</div>
  `;
}

const totalAmountEl = document.getElementById("totalAmount");
if (totalAmountEl) {
  totalAmountEl.innerText = `Total Amount: $${booking.price ?? "-"}`;
}

/* ===============================
   TRIP NUMBER (INDIVIDUAL)
   JA-101, FE-102, ...
================================ */
function generateTripNumber(tripDate) {
  const d = new Date(tripDate);

  // أول حرفين من اسم الشهر بالإنجليزي
  const monthPrefix = d
    .toLocaleString("en-US", { month: "short" })
    .substring(0, 2)
    .toUpperCase(); // JA, FE, MA...

  // عدّاد منفصل لكل شهر
  const key = "lastIndividualTrip_" + monthPrefix;

  let last = parseInt(localStorage.getItem(key) || "99", 10);
  last++;
  localStorage.setItem(key, last);

  return monthPrefix + "-" + last;
}

/* ===============================
   PAY NOW (DUMMY)
================================ */
let paymentLocked = false;

function payNow() {
  if (paymentLocked) return;
  paymentLocked = true;

  // ✅ هنا بس التعديل: بنبعت تاريخ الرحلة للدالة
  const tripNumber = generateTripNumber(booking.date);

  const finalTrip = {
    tripNumber: tripNumber,
    id: tripNumber,

    type: "Individual",            // مهم للألوان
    source: "Booking",
    status: "Booked",              // في Trips Hub دايمًا Booked
    paymentStatus: "Paid",

    company: "-",                  // فردي
    bookerName: booking.passenger?.name || "",
    bookerPhone: booking.passenger?.phone || "",

    clientName: booking.passenger?.name || "",

    pickup: booking.pickup || "",
    dropoff: booking.dropoff || "",
    stops: booking.stops || [],

    // ✅ مهمين عشان الحسابات في الادمن
    miles: booking.miles ?? "",
    price: booking.price ?? "",

    tripDate: booking.date || "",
    tripTime: booking.time || "",

    bookedAt: new Date().toISOString()
  };

  /* ===============================
     SAVE TO TRIPS HUB
  ================================ */
  let tripsHub = [];
  try {
    tripsHub = JSON.parse(localStorage.getItem("tripsHub")) || [];
  } catch {
    tripsHub = [];
  }

  tripsHub.push(finalTrip);
  localStorage.setItem("tripsHub", JSON.stringify(tripsHub));

  /* ===============================
     CLEAN TEMP DATA
  ================================ */
  localStorage.removeItem("pendingBooking");
  localStorage.removeItem("tripData");

  /* ===============================
     SUCCESS MESSAGE
  ================================ */
  const box = document.getElementById("successMsg");

  if (box) {
    box.innerText = `
Payment successful.

You will receive a receipt on your mobile number.

Trip Details:
Passenger: ${finalTrip.clientName}
Trip Date: ${finalTrip.tripDate} at ${finalTrip.tripTime}
Amount Paid: $${booking.price}
Trip Number: ${tripNumber}
`;
    box.style.display = "block";
  }

  /* ===============================
     REDIRECT TO TRIPS HUB
  ================================ */
  setTimeout(() => {
    window.location.href = "../admin/trips-hub.html";
  }, 2000);
}

/* ===============================
   EXPOSE (SO HTML onclick works)
================================ */
window.payNow = payNow;