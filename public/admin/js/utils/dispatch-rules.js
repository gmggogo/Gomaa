function isDispatchableTrip(t) {
  if (!t) return false;
  if (["Cancelled", "Completed"].includes(t.status)) return false;
  if (!isTodayAZ(t.tripDate)) return false;
  return true;
}

function getTodayTrips() {
  return getAllTrips().filter(isDispatchableTrip);
}

function getWorkingDrivers() {
  const today = azNow().getDay(); // 0-6
  const schedule = getDriverSchedule();

  return schedule.filter(d => d.days && d.days[today]);
}