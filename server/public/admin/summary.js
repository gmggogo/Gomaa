const trips = [
  {
    date: "2026-01-23",
    time: "10:30 AM",
    name: "John Smith",
    phone: "602-555-3321",
    type: "Individual",
    miles: 18,
    stops: 1,
    delayMinutes: 20,
    status: "Completed",
    basePrice: 45
  },
  {
    date: "2026-01-23",
    time: "2:00 PM",
    name: "Banner Health",
    phone: "480-222-9911",
    type: "Company",
    miles: 6,
    stops: 0,
    delayMinutes: 0,
    status: "No Show",
    basePrice: 0
  },
  {
    date: "2026-01-24",
    time: "9:00 AM",
    name: "Mayo Clinic",
    phone: "520-111-8833",
    type: "Company",
    miles: 12,
    stops: 2,
    delayMinutes: 0,
    status: "Cancelled (2h)",
    basePrice: 0
  }
];

function stopsCost(stops) {
  return stops * 5;
}

function delayCost(minutes) {
  if (minutes <= 15) return 0;
  return minutes - 15;
}

function totalCost(trip) {
  if (trip.status === "Cancelled (2h)") return 15;
  if (trip.status === "No Show") return 30;

  return (
    trip.basePrice +
    stopsCost(trip.stops) +
    delayCost(trip.delayMinutes)
  );
}

function renderTable(data) {
  const body = document.getElementById("tableBody");
  body.innerHTML = "";

  data.forEach(trip => {
    const tr = document.createElement("tr");

    const statusClass =
      trip.status === "Completed"
        ? "status-completed"
        : trip.status === "No Show"
        ? "status-noshow"
        : "status-cancelled";

    tr.innerHTML = `
      <td>${trip.date}</td>
      <td>${trip.time}</td>
      <td>${trip.name}</td>
      <td>${trip.phone}</td>
      <td>${trip.type}</td>
      <td>${trip.miles}</td>
      <td>$${stopsCost(trip.stops)}</td>
      <td>$${delayCost(trip.delayMinutes)}</td>
      <td class="${statusClass}">${trip.status}</td>
      <td>$${totalCost(trip)}</td>
    `;

    body.appendChild(tr);
  });
}

function applySearch() {
  const date = document.getElementById("searchDate").value;
  const text = document.getElementById("searchText").value.toLowerCase();
  const type = document.getElementById("searchType").value;

  const filtered = trips.filter(t => {
    const matchDate = !date || t.date === date;
    const matchText =
      !text || t.name.toLowerCase().includes(text);
    const matchType = !type || t.type === type;

    return matchDate && matchText && matchType;
  });

  renderTable(filtered);
}

renderTable(trips);