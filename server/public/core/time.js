/* =========================
   GH GLOBAL TIME ENGINE
========================= */

/* =========================
   GET TIMEZONE
========================= */

function getAppTimezone(){

  return (
    localStorage.getItem("appTimezone")
    || "America/Phoenix"
  );

}

/* =========================
   FORMAT TIME
========================= */

function formatAppTime(){

  const now = new Date();

  return now.toLocaleString("en-US",{

    timeZone:getAppTimezone(),

    weekday:"long",

    month:"long",

    day:"numeric",

    year:"numeric",

    hour:"2-digit",

    minute:"2-digit",

    second:"2-digit"

  });

}

/* =========================
   START CLOCK
========================= */

function startClock(id){

  const el = document.getElementById(id);

  if(!el) return;

  function update(){

    el.innerText = formatAppTime();

  }

  update();

  setInterval(update,1000);

}

/* =========================
   CHANGE TIMEZONE
========================= */

function setAppTimezone(timezone){

  localStorage.setItem(
    "appTimezone",
    timezone
  );

}