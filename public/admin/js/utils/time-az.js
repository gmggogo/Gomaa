function azNow() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Phoenix"
    })
  );
}

function azTodayISO() {
  const d = azNow();
  return d.toISOString().split("T")[0];
}

function isTodayAZ(dateStr) {
  if (!dateStr) return false;
  return dateStr === azTodayISO();
}