function getTripsHub() {
  return JSON.parse(localStorage.getItem("tripsHub") || "[]");
}

function getCompanyTrips() {
  return JSON.parse(localStorage.getItem("companyTrips") || "[]");
}

function getAllTrips() {
  return [
    ...getTripsHub(),
    ...getCompanyTrips()
  ];
}

function getDriverSchedule() {
  return JSON.parse(localStorage.getItem("driverSchedule") || "[]");
}

function getDriversLocation() {
  return JSON.parse(localStorage.getItem("driversLocation") || "[]");
}