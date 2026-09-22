/* ==========================================================================
   GH MOBILITY - ARCHIVE WARMUP WORKER

   PURPOSE
   - Runs archive catch-up in the background after MongoDB is ready.
   - Uses the program timezone, not the host/server machine timezone.
   - Never rebuilds completed archive days during normal daily operation.
   - On restart it checks the saved cutoffDate and processes only missing days.
   - During the same program day it does no database work after a successful run.

   SCOPE
   - Admin Summary archive
   - Company Summary archive
   ========================================================================== */

const SystemDesign =
  require("../models/SystemDesign");

const CHECK_INTERVAL_MS =
  5 * 60 * 1000;

let workerStarted = false;
let workerRunning = false;
let lastCompletedDay = "";

function cleanTimeZone(value){
  const timeZone =
    String(value || "")
      .trim();

  if(!timeZone){
    return "America/Phoenix";
  }

  try{
    new Intl.DateTimeFormat(
      "en-US",
      { timeZone }
    ).format(new Date());

    return timeZone;
  }catch(err){
    return "America/Phoenix";
  }
}

async function readProgramTimeZone(
  fallback = "America/Phoenix"
){
  try{
    const settings =
      await SystemDesign
        .findOne({})
        .select("timezone")
        .lean();

    return cleanTimeZone(
      settings?.timezone ||
      fallback
    );
  }catch(err){
    console.log(
      "ARCHIVE WARMUP TIMEZONE READ ERROR:",
      err?.message || err
    );

    return cleanTimeZone(fallback);
  }
}

function dateKeyInTimeZone(
  date = new Date(),
  timeZone = "America/Phoenix"
){
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          cleanTimeZone(timeZone),
        year:"numeric",
        month:"2-digit",
        day:"2-digit"
      }
    )
    .formatToParts(date);

  const map = {};

  for(const part of parts){
    if(part.type !== "literal"){
      map[part.type] = part.value;
    }
  }

  return (
    `${map.year}-${map.month}-${map.day}`
  );
}

async function runArchiveWarmupCycle({
  fallbackTimeZone,
  warmAdminArchive,
  warmCompanyArchives
}){
  if(workerRunning){
    return;
  }

  workerRunning = true;

  try{
    const timeZone =
      await readProgramTimeZone(
        fallbackTimeZone
      );

    const todayKey =
      dateKeyInTimeZone(
        new Date(),
        timeZone
      );

    /*
      Same server process + same program day:
      no archive query, no tenant scan, no repeated work.
    */
    if(
      lastCompletedDay &&
      lastCompletedDay === todayKey
    ){
      return;
    }

    console.log(
      `🗄️ Archive Warmup started for ${todayKey} (${timeZone})`
    );

    if(
      typeof warmAdminArchive ===
      "function"
    ){
      await warmAdminArchive({
        todayKey,
        timeZone
      });
    }

    if(
      typeof warmCompanyArchives ===
      "function"
    ){
      await warmCompanyArchives({
        todayKey,
        timeZone
      });
    }

    lastCompletedDay = todayKey;

    console.log(
      `✅ Archive Warmup complete through ${todayKey}`
    );

  }catch(err){
    /*
      Do not mark the day complete after an error.
      The next interval retries from persistent cutoffDate.
    */
    console.log(
      "ARCHIVE WARMUP ERROR:",
      err?.message || err
    );
  }finally{
    workerRunning = false;
  }
}

function startArchiveWarmupWorker(options = {}){
  if(workerStarted){
    return;
  }

  workerStarted = true;

  /*
    Background start: never delay server startup or the first HTTP response.
  */
  setImmediate(()=>{
    runArchiveWarmupCycle(options)
      .catch(err=>{
        console.log(
          "ARCHIVE WARMUP START ERROR:",
          err?.message || err
        );
      });
  });

  const timer =
    setInterval(()=>{
      runArchiveWarmupCycle(options)
        .catch(err=>{
          console.log(
            "ARCHIVE WARMUP TIMER ERROR:",
            err?.message || err
          );
        });
    }, CHECK_INTERVAL_MS);

  if(
    timer &&
    typeof timer.unref === "function"
  ){
    timer.unref();
  }
}

module.exports = {
  startArchiveWarmupWorker,
  runArchiveWarmupCycle,
  dateKeyInTimeZone
};
