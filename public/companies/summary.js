/* ===============================
   HEADER
================================ */
const company = JSON.parse(localStorage.getItem("loggedCompany")) || { name: "Company" };
document.getElementById("companyName").innerText = company.name;

function updateClock() {
  const now = new Date();
  document.getElementById("clock").innerText = now.toLocaleString();
  document.getElementById("greeting").innerText =
    now.getHours() < 12 ? "Good Morning" :
    now.getHours() < 18 ? "Good Afternoon" :
    "Good Evening";
}
setInterval(updateClock, 1000);
updateClock();

/* ===============================
   DATA
================================ */
let allTrips = JSON.parse(localStorage.getItem("companyTrips")) || [];
let filteredTrips = [...allTrips];
const tbody = document.getElementById("summaryBody");

/* ===============================
   CALCULATION
================================ */
function calculateTotal(trip) {
  const miles = Number(trip.miles || 0);
  const stops = (trip.stops || []).length;
  const delayMinutes = Number(trip.delayMinutes || 0);

  if (trip.status === "No Show") return 15;
  if (trip.status === "Cancelled") return 15;

  let total = miles <= 10 ? 30 : 30 + (miles - 10) * 2;
  total += stops * 5;

  if (delayMinutes > 15) {
    total += delayMinutes - 15;
  }

  return total;
}

/* ===============================
   RENDER
================================ */
function renderSummary(trips) {
  tbody.innerHTML = "";

  trips.forEach(trip => {
    const total = calculateTotal(trip);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <strong>${trip.tripNumber}</strong>
        <small>${trip.date || ""} ${trip.time || ""}</small>
      </td>
      <td>${trip.miles || 0}</td>
      <td>${(trip.stops || []).length}</td>
      <td>${trip.delayMinutes || 0}</td>
      <td>${trip.status === "No Show" ? "✔" : "-"}</td>
      <td>${trip.status === "Cancelled" ? "✔" : "-"}</td>
      <td>$${total}</td>
    `;
    tbody.appendChild(tr);
  });
}

renderSummary(filteredTrips);

/* ===============================
   SEARCH (FULL TRIP NUMBER)
================================ */
document.getElementById("searchBtn").onclick = () => {
  const tripVal = document.getElementById("searchTrip").value.trim();
  const dateVal = document.getElementById("searchDate").value;

  filteredTrips = allTrips.filter(t => {
    const fullTrip = String(t.tripNumber).trim();
    const searchTrip = String(tripVal).trim();

    return (
      (!searchTrip || fullTrip === searchTrip) &&
      (!dateVal || t.date === dateVal)
    );
  });

  renderSummary(filteredTrips);
};

document.getElementById("resetBtn").onclick = () => {
  document.getElementById("searchTrip").value = "";
  document.getElementById("searchDate").value = "";
  filteredTrips = [...allTrips];
  renderSummary(filteredTrips);
};

/* ===============================
   EMAIL
================================ */
function sendEmail() {
  alert("Email summary will be implemented next step.");
}