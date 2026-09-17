const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const AutopilotSettings =
  require("../models/AutopilotSettings");

const DispatchAssignment =
  require("../models/DispatchAssignment");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

const DEFAULT_INTERVAL_MS = 15000;
const MAX_BATCH = 20;

let workerTimer = null;
let workerRunning = false;

function clean(v){
  return String(v ?? "").trim();
}

function upper(v){
  return clean(v).toUpperCase();
}

function TripModel(){
  const Trip =
    global.Trip ||
    mongoose.models.Trip;

  if(!Trip){
    throw new Error(
      "Trip model not loaded"
    );
  }

  return Trip;
}

function isSharedTrip(trip){
  if(!trip) return false;

  const service =
    upper(
      trip.serviceKey ||
      trip.serviceCode ||
      trip.serviceType ||
      trip.tripType ||
      trip.service ||
      ""
    );

  return (
    trip.isShared === true ||
    trip.shared === true ||
    trip.sharedTrip === true ||
    service === "SH" ||
    service === "SHARED" ||
    upper(trip.type) === "SHARED" ||
    clean(trip.groupId) !== "" ||
    upper(trip.tripNumber)
      .includes("-SH") ||
    (
      Array.isArray(trip.passengers) &&
      trip.passengers.length > 0
    )
  );
}

function isBrokerTrip(trip){
  if(!trip) return false;

  return (
    upper(trip.externalSource) ===
      "BROKER" ||
    upper(trip.sourceType) ===
      "BROKER" ||
    upper(trip.sharedSource) ===
      "BROKER" ||
    Boolean(
      clean(
        trip.brokerCode ||
        trip.brokerName ||
        trip.brokerTripId ||
        trip.externalTripId
      )
    )
  );
}

function autopilotEnabledForTrip(
  settings,
  trip
){
  if(isBrokerTrip(trip)){
    if(isSharedTrip(trip)){
      return (
        settings
          .brokerSharedAutopilot === true
      );
    }

    return (
      settings
        .brokerAutopilot === true
    );
  }

  return (
    settings
      .companyAutopilot === true
  );
}

function finalStatus(status){
  const value =
    upper(status)
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(
    value === "COMPLETED" ||
    value === "COMPLETE"
  ){
    return "Completed";
  }

  if(value.includes("CANCEL")){
    return "Cancelled";
  }

  if(
    value.includes("NO SHOW") ||
    value.includes("NOSHOW")
  ){
    return "No Show";
  }

  if(
    value === "NOT COMPLETED" ||
    value === "NOTCOMPLETED" ||
    value.includes("NOT COMPLETE")
  ){
    return "Not Completed";
  }

  return "";
}

function tripIsFinalConfirmed(trip){
  return (
    trip?.finalStatusConfirmed === true ||
    Boolean(
      trip?.finalStatusConfirmedAt
    ) ||
    Boolean(
      trip?.dispatchFinalConfirmedAt
    )
  );
}

function sharedIsFinalConfirmed(trip){
  return (
    trip?.sharedFinalConfirmed === true ||
    Boolean(
      trip?.sharedFinalConfirmedAt
    ) ||
    tripIsFinalConfirmed(trip)
  );
}

function sharedHasFinalPassenger(trip){
  const passengers =
    Array.isArray(trip?.passengers)
      ? trip.passengers
      : [];

  return passengers.some(
    passenger=>
      Boolean(
        finalStatus(
          passenger?.status ||
          trip?.status
        )
      )
  );
}

function getPhoenixDate(offsetDays=0){
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Phoenix",
        year:"numeric",
        month:"2-digit",
        day:"2-digit"
      }
    ).formatToParts(
      new Date()
    );

  const y =
    Number(
      parts.find(
        part=>
          part.type === "year"
      )?.value
    );

  const m =
    Number(
      parts.find(
        part=>
          part.type === "month"
      )?.value
    );

  const d =
    Number(
      parts.find(
        part=>
          part.type === "day"
      )?.value
    );

  const date =
    new Date(
      Date.UTC(
        y,
        m - 1,
        d + offsetDays
      )
    );

  return [
    date.getUTCFullYear(),
    String(
      date.getUTCMonth() + 1
    ).padStart(2,"0"),
    String(
      date.getUTCDate()
    ).padStart(2,"0")
  ].join("-");
}

function tenantValue(tenantId){
  if(
    mongoose.isValidObjectId(
      String(tenantId)
    )
  ){
    return new mongoose.Types.ObjectId(
      String(tenantId)
    );
  }

  return tenantId;
}

function tenantToken(tenantId){
  return jwt.sign(
    {
      id:"SYSTEM_AUTOPILOT",
      role:"ADMIN",
      tenantId:String(tenantId)
    },
    JWT_SECRET,
    {
      expiresIn:"5m"
    }
  );
}

async function apiRequest(
  baseUrl,
  token,
  path,
  method="GET",
  body=null
){
  const response =
    await fetch(
      `${baseUrl}${path}`,
      {
        method,
        headers:{
          "Content-Type":
            "application/json",
          Authorization:
            `Bearer ${token}`
        },
        body:
          body === null
            ? undefined
            : JSON.stringify(body)
      }
    );

  const data =
    await response
      .json()
      .catch(()=>({}));

  if(
    !response.ok ||
    data?.success === false
  ){
    const error =
      new Error(
        data?.message ||
        `${method} ${path} failed`
      );

    error.status =
      response.status;

    error.data =
      data;

    throw error;
  }

  return data;
}

function chunk(items,size=MAX_BATCH){
  const out = [];

  for(
    let i=0;
    i<items.length;
    i+=size
  ){
    out.push(
      items.slice(
        i,
        i + size
      )
    );
  }

  return out;
}

function hasStops(trip){
  return (
    Array.isArray(trip?.stops) &&
    trip.stops.length > 0
  );
}

function isReturnTrip(trip){
  const number =
    upper(
      trip?.ghExternalTripNumber ||
      trip?.externalTripNumber ||
      trip?.tripNumber ||
      ""
    );

  const brokerTripId =
    upper(
      trip?.externalTripId ||
      trip?.brokerTripId ||
      ""
    );

  const brokerStatus =
    upper(
      trip?.brokerStatus ||
      ""
    );

  return (
    number.endsWith("-R") ||
    brokerTripId.endsWith("-R") ||
    brokerStatus === "RETURN" ||
    trip?.isReturnTrip === true ||
    upper(trip?.tripLeg) === "RETURN"
  );
}

function isOnCallReturnTrip(trip){
  const time =
    upper(
      trip?.tripTime ||
      trip?.pickupTime ||
      ""
    )
      .replace(/\s+/g," ");

  return (
    isReturnTrip(trip) &&
    [
      "ON CALL",
      "ON-CALL",
      "WILL CALL",
      "WILL-CALL"
    ].includes(time)
  );
}

function shareEligibleBrokerTrip(trip){
  return (
    !hasStops(trip) &&
    !isOnCallReturnTrip(trip) &&
    trip?.tripSplitConfirmed !== true
  );
}

async function loadTripSplit(
  baseUrl,
  token
){
  return await apiRequest(
    baseUrl,
    token,
    "/api/trip-split/bootstrap",
    "GET"
  );
}

async function loadBrokerReview(
  baseUrl,
  token
){
  return await apiRequest(
    baseUrl,
    token,
    "/api/broker-review/bootstrap",
    "GET"
  );
}

async function processBrokerTripSplit(
  settings,
  baseUrl,
  token
){
  const brokerAuto =
    settings.brokerAutopilot === true;

  const brokerSharedAuto =
    settings.brokerSharedAutopilot === true;

  if(
    !brokerAuto &&
    !brokerSharedAuto
  ){
    return {
      sharedBuilt:0,
      splitConfirmed:0
    };
  }

  let data =
    await loadTripSplit(
      baseUrl,
      token
    );

  if(
    data?.capabilities
      ?.brokerContractEnabled !== true
  ){
    return {
      sharedBuilt:0,
      splitConfirmed:0
    };
  }

  let sharedBuilt = 0;
  let splitConfirmed = 0;
  let shareAttemptFailed = false;

  /*
    BROKER SHARED AUTOPILOT

    Same human sequence as Trip Split:
      select eligible Original trips -> Share

    The existing Shared Engine decides which selected trips actually form
    shared groups. Trips not matched by the engine become persistent
    Individual trips.
  */
  if(
    brokerSharedAuto &&
    data?.capabilities
      ?.sharedServiceEnabled === true
  ){
    const eligibleOriginals =
      Array.isArray(
        data.originalTrips
      )
        ? data.originalTrips
            .filter(
              shareEligibleBrokerTrip
            )
        : [];

    const shareIds =
      eligibleOriginals
        .map(
          trip=>
            clean(
              trip?._id ||
              trip?.id
            )
        )
        .filter(Boolean);

    if(shareIds.length >= 2){
      try{
        const result =
          await apiRequest(
            baseUrl,
            token,
            "/api/trip-split/share",
            "POST",
            {
              tripIds:shareIds
            }
          );

        sharedBuilt =
          Array.isArray(
            result?.groups
          )
            ? result.groups.length
            : 0;

        /*
          Reload after Share because the Shared Engine moves records between
          Original / Individual / Shared buckets.
        */
        data =
          await loadTripSplit(
            baseUrl,
            token
          );

      }catch(err){
        shareAttemptFailed = true;

        console.log(
          "AUTOPILOT BROKER SHARE ERROR:",
          String(
            settings.tenantId
          ),
          err?.message || err
        );
      }
    }
  }

  /*
    SHARED GROUP CONFIRM

    Same human command as Trip Split -> Shared tab -> Confirm.
    Only Broker Shared Autopilot can move shared groups to Broker Review.
  */
  if(brokerSharedAuto){
    const groups =
      Array.isArray(data?.groups)
        ? data.groups
        : [];

    const groupPayload =
      groups
        .map(group=>({
          groupId:
            clean(
              group?.groupId
            )
        }))
        .filter(
          group=>
            Boolean(
              group.groupId
            )
        );

    if(groupPayload.length){
      try{
        const result =
          await apiRequest(
            baseUrl,
            token,
            "/api/trip-split/confirm",
            "POST",
            {
              groups:
                groupPayload
            }
          );

        splitConfirmed +=
          Number(
            result?.confirmedCount ||
            groupPayload.length
          );

        data =
          await loadTripSplit(
            baseUrl,
            token
          );

      }catch(err){
        console.log(
          "AUTOPILOT BROKER SHARED SPLIT CONFIRM ERROR:",
          String(
            settings.tenantId
          ),
          err?.message || err
        );
      }
    }
  }

  /*
    NORMAL BROKER AUTOPILOT

    Same human command as Trip Split -> Original / Individual -> Confirm.

    When Shared Autopilot is also Active:
    - Shared is attempted FIRST.
    - matched trips have already moved into Shared groups.
    - unmatched trips are now in Individual.
    - trips with Stops / ON CALL cannot be shared and may continue normally.

    If the Share request itself failed, share-eligible Original trips are NOT
    forced through as Individual in this cycle. They remain for the next
    Shared retry instead of silently bypassing Shared Autopilot.
  */
  if(brokerAuto){
    const originalTrips =
      Array.isArray(
        data?.originalTrips
      )
        ? data.originalTrips
        : [];

    const individualTrips =
      Array.isArray(
        data?.individualTrips
      )
        ? data.individualTrips
        : [];

    const normalOriginals =
      originalTrips.filter(
        trip=>
          !(
            brokerSharedAuto &&
            shareAttemptFailed &&
            shareEligibleBrokerTrip(
              trip
            )
          )
      );

    const tripIds =
      [
        ...normalOriginals,
        ...individualTrips
      ]
        .map(
          trip=>
            clean(
              trip?._id ||
              trip?.id
            )
        )
        .filter(Boolean);

    if(tripIds.length){
      try{
        const result =
          await apiRequest(
            baseUrl,
            token,
            "/api/trip-split/confirm",
            "POST",
            {
              tripIds
            }
          );

        splitConfirmed +=
          Number(
            result?.confirmedCount ||
            tripIds.length
          );

      }catch(err){
        console.log(
          "AUTOPILOT BROKER NORMAL SPLIT CONFIRM ERROR:",
          String(
            settings.tenantId
          ),
          err?.message || err
        );
      }
    }
  }

  return {
    sharedBuilt,
    splitConfirmed
  };
}

async function processBrokerReview(
  settings,
  baseUrl,
  token
){
  const brokerAuto =
    settings.brokerAutopilot === true;

  const brokerSharedAuto =
    settings.brokerSharedAutopilot === true;

  if(
    !brokerAuto &&
    !brokerSharedAuto
  ){
    return {
      reviewReleased:0
    };
  }

  const data =
    await loadBrokerReview(
      baseUrl,
      token
    );

  const items =
    Array.isArray(data?.items)
      ? data.items
      : [];

  const ids =
    items
      .filter(item=>{
        if(
          item?.reviewConfirmed === true
        ){
          return false;
        }

        const shared =
          upper(
            item?.processingMode
          ) === "SHARED";

        return shared
          ? brokerSharedAuto
          : brokerAuto;
      })
      .map(
        item=>
          clean(
            item?.dispatchTripId ||
            item?.id
          )
      )
      .filter(Boolean);

  if(!ids.length){
    return {
      reviewReleased:0
    };
  }

  let reviewReleased = 0;

  for(
    const batch of chunk(ids)
  ){
    try{
      const result =
        await apiRequest(
          baseUrl,
          token,
          "/api/broker-review/confirm-selected",
          "POST",
          {
            dispatchTripIds:
              batch
          }
        );

      reviewReleased +=
        Number(
          result
            ?.dispatchReleasedCount ||
          result
            ?.confirmedCount ||
          batch.length
        );

    }catch(err){
      console.log(
        "AUTOPILOT BROKER REVIEW CONFIRM ERROR:",
        String(
          settings.tenantId
        ),
        err?.message || err
      );
    }
  }

  return {
    reviewReleased
  };
}

async function processBrokerPipeline(
  settings,
  baseUrl,
  token
){
  const split =
    await processBrokerTripSplit(
      settings,
      baseUrl,
      token
    );

  /*
    Broker Review must be loaded AFTER Trip Split confirmation because
    Trip Split creates the Dispatch Trip and Review state.
  */
  const review =
    await processBrokerReview(
      settings,
      baseUrl,
      token
    );

  return {
    ...split,
    ...review
  };
}

async function dispatchTenant(
  settings,
  baseUrl,
  token
){
  const Trip =
    TripModel();

  const tenantId =
    tenantValue(
      settings.tenantId
    );

  const dates = [
    getPhoenixDate(0),
    getPhoenixDate(1)
  ];

  const trips =
    await Trip.find({
      tenantId,
      dispatchSelected:true,
      disabled:{
        $ne:true
      },
      tripDate:{
        $in:dates
      }
    })
    .sort({
      tripDate:1,
      tripTime:1,
      createdAt:1
    })
    .lean();

  const controlledTrips =
    trips.filter(
      trip=>
        autopilotEnabledForTrip(
          settings,
          trip
        )
    );

  if(!controlledTrips.length){
    return {
      assigned:0,
      sent:0
    };
  }

  const controlledIds =
    controlledTrips.map(
      trip=>trip._id
    );

  let assignments =
    await DispatchAssignment.find({
      tenantId,
      tripId:{
        $in:controlledIds
      }
    }).lean();

  let assignmentByTrip =
    new Map(
      assignments.map(
        row=>[
          String(row.tripId),
          row
        ]
      )
    );

  /*
    Autopilot replaces the human Auto Assign click.
    Only trips without a driver are sent to auto-assign.
    The existing Smart Dispatch endpoint still chooses the driver.
  */
  const unassignedIds =
    controlledTrips
      .filter(trip=>{
        const assignment =
          assignmentByTrip.get(
            String(trip._id)
          );

        return !clean(
          assignment?.driverId
        );
      })
      .map(
        trip=>String(trip._id)
      );

  let assignedCount = 0;

  for(
    const ids of chunk(
      unassignedIds
    )
  ){
    if(!ids.length){
      continue;
    }

    try{
      const result =
        await apiRequest(
          baseUrl,
          token,
          "/api/dispatch/auto-assign",
          "POST",
          {
            ids
          }
        );

      assignedCount +=
        Number(
          result?.assignedCount ||
          0
        );

    }catch(err){
      console.log(
        "AUTOPILOT AUTO ASSIGN ERROR:",
        String(settings.tenantId),
        err?.message || err
      );
    }
  }

  /*
    Reload assignments after Smart Dispatch.
  */
  assignments =
    await DispatchAssignment.find({
      tenantId,
      tripId:{
        $in:controlledIds
      }
    }).lean();

  assignmentByTrip =
    new Map(
      assignments.map(
        row=>[
          String(row.tripId),
          row
        ]
      )
    );

  /*
    Autopilot replaces:
      Select -> Send Selected

    It intentionally ignores browser selectedIds.
    Manual page selection remains a UI-only manual control.
  */
  const sendIds =
    controlledTrips
      .filter(trip=>{
        const assignment =
          assignmentByTrip.get(
            String(trip._id)
          );

        if(
          !clean(
            assignment?.driverId
          )
        ){
          return false;
        }

        const status =
          upper(
            assignment
              ?.dispatchStatus ||
            ""
          );

        return ![
          "SENT",
          "ACCEPTED",
          "ON_TRIP",
          "COMPLETED"
        ].includes(status);
      })
      .map(
        trip=>String(trip._id)
      );

  let sentCount = 0;

  for(
    const ids of chunk(
      sendIds
    )
  ){
    if(!ids.length){
      continue;
    }

    try{
      const result =
        await apiRequest(
          baseUrl,
          token,
          "/api/dispatch/send",
          "PATCH",
          {
            selected:true,
            ids
          }
        );

      sentCount +=
        Number(
          result?.sentCount ||
          ids.length
        );

    }catch(err){
      console.log(
        "AUTOPILOT SEND ERROR:",
        String(settings.tenantId),
        err?.message || err
      );
    }
  }

  return {
    assigned:
      assignedCount,
    sent:
      sentCount
  };
}

async function finalConfirmTenant(
  settings,
  baseUrl,
  token
){
  const Trip =
    TripModel();

  const tenantId =
    tenantValue(
      settings.tenantId
    );

  /*
    Final Confirmation is intentionally not date-limited.
    When a driver closes an older active trip, Autopilot should still
    process that final status.
  */
  const trips =
    await Trip.find({
      tenantId,
      disabled:{
        $ne:true
      }
    })
    .sort({
      updatedAt:1
    })
    .lean();

  let confirmedCount = 0;

  for(const trip of trips){
    if(
      !autopilotEnabledForTrip(
        settings,
        trip
      )
    ){
      continue;
    }

    const id =
      String(
        trip._id ||
        ""
      );

    if(!id){
      continue;
    }

    if(isSharedTrip(trip)){
      if(
        sharedIsFinalConfirmed(
          trip
        ) ||
        !sharedHasFinalPassenger(
          trip
        )
      ){
        continue;
      }

      try{
        await apiRequest(
          baseUrl,
          token,
          `/api/dispatch-final-confirmation/${encodeURIComponent(id)}/shared-confirm`,
          "PATCH",
          {
            confirmedBy:
              "GH Autopilot"
          }
        );

        confirmedCount++;

      }catch(err){
        console.log(
          "AUTOPILOT SHARED FINAL CONFIRM ERROR:",
          String(settings.tenantId),
          id,
          err?.message || err
        );
      }

      continue;
    }

    if(
      tripIsFinalConfirmed(
        trip
      )
    ){
      continue;
    }

    const status =
      finalStatus(
        trip.status
      );

    if(!status){
      continue;
    }

    try{
      await apiRequest(
        baseUrl,
        token,
        `/api/dispatch-final-confirmation/${encodeURIComponent(id)}/confirm`,
        "PATCH",
        {
          status,
          confirmedBy:
            "GH Autopilot"
        }
      );

      confirmedCount++;

    }catch(err){
      console.log(
        "AUTOPILOT FINAL CONFIRM ERROR:",
        String(settings.tenantId),
        id,
        err?.message || err
      );
    }
  }

  return {
    confirmed:
      confirmedCount
  };
}

async function runCycle(
  options={}
){
  if(workerRunning){
    return;
  }

  workerRunning = true;

  try{
    const port =
      Number(
        options.port ||
        process.env.PORT ||
        10000
      );

    const baseUrl =
      options.baseUrl ||
      `http://127.0.0.1:${port}`;

    const settingsRows =
      await AutopilotSettings.find({
        $or:[
          {
            companyAutopilot:true
          },
          {
            brokerAutopilot:true
          },
          {
            brokerSharedAutopilot:true
          }
        ]
      }).lean();

    for(
      const settings of
      settingsRows
    ){
      if(
        !settings?.tenantId
      ){
        continue;
      }

      const token =
        tenantToken(
          settings.tenantId
        );

      /*
        Broker Autopilot runs the same human Broker Operations sequence first:
          Trip Split -> Broker Review -> Dispatch
      */
      const broker =
        await processBrokerPipeline(
          settings,
          baseUrl,
          token
        );

      const dispatch =
        await dispatchTenant(
          settings,
          baseUrl,
          token
        );

      const final =
        await finalConfirmTenant(
          settings,
          baseUrl,
          token
        );

      if(
        broker.sharedBuilt ||
        broker.splitConfirmed ||
        broker.reviewReleased ||
        dispatch.assigned ||
        dispatch.sent ||
        final.confirmed
      ){
        console.log(
          "GH AUTOPILOT:",
          String(
            settings.tenantId
          ),
          {
            brokerSharedBuilt:
              broker.sharedBuilt,
            brokerSplitConfirmed:
              broker.splitConfirmed,
            brokerReviewReleased:
              broker.reviewReleased,
            assigned:
              dispatch.assigned,
            sent:
              dispatch.sent,
            confirmed:
              final.confirmed
          }
        );
      }
    }

  }catch(err){
    console.log(
      "GH AUTOPILOT WORKER ERROR:",
      err?.message || err
    );

  }finally{
    workerRunning = false;
  }
}

function startAutopilotWorker(
  options={}
){
  if(workerTimer){
    return;
  }

  const intervalMs =
    Math.max(
      5000,
      Number(
        options.intervalMs ||
        process.env
          .AUTOPILOT_INTERVAL_MS ||
        DEFAULT_INTERVAL_MS
      )
    );

  /*
    Run once shortly after the HTTP server starts,
    then continue in the background.
  */
  setTimeout(
    ()=>runCycle(options),
    3000
  );

  workerTimer =
    setInterval(
      ()=>runCycle(options),
      intervalMs
    );

  if(
    typeof workerTimer.unref ===
    "function"
  ){
    workerTimer.unref();
  }

  console.log(
    `✅ GH Autopilot worker started (${intervalMs}ms)`
  );
}

function stopAutopilotWorker(){
  if(workerTimer){
    clearInterval(
      workerTimer
    );

    workerTimer = null;
  }
}

module.exports = {
  startAutopilotWorker,
  stopAutopilotWorker,
  runCycle
};
