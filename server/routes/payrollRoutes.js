const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const User = require("../models/User");
const SystemDesign = require("../models/SystemDesign");
const DispatchAssignment = require("../models/DispatchAssignment");
const {
  PayrollProfile,
  PayrollEmployee,
  PayrollTimeEntry,
  PayrollPayment
} = require("../models/Payroll");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

/* =========================
AUTH
========================= */

function readBearerToken(req){
  const header = String(req.headers?.authorization || "").trim();
  if(!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function requirePayrollAuth(req,res,next){
  const token = readBearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{
    const verified = jwt.verify(token,JWT_SECRET);

    req.authUser = {
      id:String(verified.id || ""),
      role:String(verified.role || ""),
      tenantId:String(verified.tenantId || "")
    };

    if(!req.authUser.tenantId){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    next();

  }catch(err){
    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

function normalizedRole(value){
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g,"_");
}

function requirePayrollViewer(req,res,next){
  const role =
    normalizedRole(
      req.authUser?.role
    );

  if(role !== "SUPER_ADMIN"){
    return res.status(403).json({
      success:false,
      message:"Super Admin only"
    });
  }

  next();
}

function requireSuperAdmin(req,res,next){
  if(normalizedRole(req.authUser?.role) !== "SUPER_ADMIN"){
    return res.status(403).json({
      success:false,
      message:"Super Admin only"
    });
  }

  next();
}

/* =========================
HELPERS
========================= */

function clean(value){
  return String(value ?? "").trim();
}

function money(value){
  return Number(Number(value || 0).toFixed(2));
}

function hours(value){
  return Number(Number(value || 0).toFixed(4));
}

function validDateKey(value){
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function parseDateKey(value){
  const key = clean(value);
  if(!validDateKey(key)) return null;

  const d = new Date(`${key}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function weekStartKey(dateKey){
  const d = parseDateKey(dateKey);
  if(!d) return "";

  d.setDate(d.getDate() - d.getDay());

  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");

  return `${y}-${m}-${day}`;
}

function normalizeStatus(value){
  return clean(value)
    .toUpperCase()
    .replace(/[\s_-]+/g,"");
}

function tripStatus(trip){
  return normalizeStatus(trip?.status) ||
         normalizeStatus(trip?.dispatchStatus);
}

function isCancelled(trip){
  const s = tripStatus(trip);
  return s === "CANCELLED" || s === "CANCELED";
}

function isNotCompleted(trip){
  return tripStatus(trip) === "NOTCOMPLETED";
}

function isCompleted(trip){
  return tripStatus(trip) === "COMPLETED";
}

function isNoShow(trip){
  return tripStatus(trip) === "NOSHOW";
}

function isActiveTrip(trip){
  return [
    "ONTRIP",
    "INPROGRESS",
    "ARRIVED",
    "ACCEPTED",
    "SENT",
    "ASSIGNED",
    "SCHEDULED",
    "CONFIRMED",
    "AUTOASSIGNED"
  ].includes(tripStatus(trip));
}

function scheduledDate(trip){
  const d = clean(trip?.tripDate || trip?.date);
  const t = clean(trip?.tripTime || trip?.time || "00:00");

  if(!d) return null;

  const date = new Date(`${d}T${t}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function finalMoment(trip){
  const candidates = [
    trip?.historyAt,
    trip?.finalizedAt,
    trip?.finalStatusConfirmedAt,
    trip?.sharedFinalConfirmedAt,
    trip?.dispatchFinalConfirmedAt,
    trip?.cancelDateTime
  ];

  for(const value of candidates){
    if(!value) continue;

    const d = new Date(value);

    if(!Number.isNaN(d.getTime())){
      return d;
    }
  }

  return null;
}

async function tenantTimezone(tenantId){
  const design = await SystemDesign.findOne({tenantId})
    .select("timezone")
    .lean();

  return design?.timezone || "America/Phoenix";
}

function tenantTodayKey(timezone){
  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:timezone,
      year:"numeric",
      month:"2-digit",
      day:"2-digit"
    }
  ).formatToParts(new Date());

  const map = {};

  parts.forEach(part=>{
    map[part.type] = part.value;
  });

  return `${map.year}-${map.month}-${map.day}`;
}

/* =========================
DRIVER HOURS ENGINE
Same rule as current Driver Work Hours:
first pickup -> last final time.
Time between trips counts.
========================= */

function buildDriverDay(dayTrips,dayKey,todayKey){
  const now = new Date();

  const workable = dayTrips
    .map(trip=>({
      trip,
      scheduled:scheduledDate(trip)
    }))
    .filter(item=>
      item.scheduled &&
      !isCancelled(item.trip) &&
      !isNotCompleted(item.trip)
    )
    .sort((a,b)=>a.scheduled-b.scheduled);

  if(!workable.length) return null;

  const start = new Date(workable[0].scheduled);

  if(dayKey === todayKey && now < start){
    return null;
  }

  const finalTimes = workable
    .map(item=>{
      if(isCompleted(item.trip) || isNoShow(item.trip)){
        return finalMoment(item.trip);
      }

      return null;
    })
    .filter(Boolean);

  const hasOpenWork = workable.some(item=>
    isActiveTrip(item.trip) &&
    item.scheduled <= now
  );

  let end = null;
  let running = false;

  if(dayKey === todayKey && hasOpenWork){
    end = now;
    running = true;
  }else if(finalTimes.length){
    end = new Date(
      Math.max(...finalTimes.map(d=>d.getTime()))
    );
  }

  if(!end || end < start) return null;

  return {
    date:dayKey,
    start,
    end,
    hours:hours((end-start)/3600000),
    running
  };
}

async function driverDailyHours(tenantId,driverId,from,to){
  const Trip = global.Trip;

  if(!Trip){
    throw new Error("Trip model is not ready");
  }

  const assignments = await DispatchAssignment.find({
    driverId:String(driverId)
  })
  .select("tripId")
  .lean();

  const tripIds = assignments
    .map(row=>row.tripId)
    .filter(Boolean);

  if(!tripIds.length) return [];

  const trips = await Trip.find({
    _id:{$in:tripIds},
    tenantId,
    tripDate:{$gte:from,$lte:to},
    disabled:{$ne:true}
  })
  .select(
    "tripDate tripTime status historyAt finalizedAt finalStatusConfirmedAt sharedFinalConfirmedAt dispatchFinalConfirmedAt cancelDateTime"
  )
  .lean();

  const groups = {};

  trips.forEach(trip=>{
    const key = clean(trip.tripDate);
    if(!key) return;

    if(!groups[key]) groups[key] = [];
    groups[key].push(trip);
  });

  const timezone = await tenantTimezone(tenantId);
  const todayKey = tenantTodayKey(timezone);

  return Object.keys(groups)
    .sort()
    .map(key=>buildDriverDay(groups[key],key,todayKey))
    .filter(Boolean);
}

async function manualDailyHours(tenantId,personType,personId,from,to){
  const rows = await PayrollTimeEntry.find({
    tenantId,
    personType,
    personId:String(personId),
    workDate:{$gte:from,$lte:to}
  })
  .sort({workDate:1})
  .lean();

  return rows.map(row=>({
    date:row.workDate,
    hours:hours(row.hours),
    running:false,
    note:row.note || ""
  }));
}

/* =========================
PAY CALCULATION
Overtime resets every Sunday.
========================= */

function splitRegularAndOvertime(dailyRows,overtimeAfterHours){
  const threshold = Math.max(
    0,
    Number(overtimeAfterHours ?? 40)
  );

  const weeks = new Map();

  dailyRows.forEach(row=>{
    const week = weekStartKey(row.date);

    if(!weeks.has(week)){
      weeks.set(week,[]);
    }

    weeks.get(week).push(row);
  });

  let regularHours = 0;
  let overtimeHours = 0;

  for(const rows of weeks.values()){
    const weekHours = rows.reduce(
      (sum,row)=>sum+Number(row.hours || 0),
      0
    );

    regularHours += Math.min(weekHours,threshold);
    overtimeHours += Math.max(0,weekHours-threshold);
  }

  return {
    regularHours:hours(regularHours),
    overtimeHours:hours(overtimeHours),
    totalHours:hours(regularHours+overtimeHours)
  };
}

async function getProfile(tenantId,personType,personId){
  let profile = await PayrollProfile.findOne({
    tenantId,
    personType,
    personId:String(personId)
  });

  if(!profile){
    profile = await PayrollProfile.create({
      tenantId,
      personType,
      personId:String(personId),
      hourlyRate:0,
      overtimeRate:0,
      overtimeAfterHours:40
    });
  }

  return profile;
}

async function getPayment(tenantId,personType,personId,from,to){
  return await PayrollPayment.findOne({
    tenantId,
    personType,
    personId:String(personId),
    periodStart:from,
    periodEnd:to
  }).lean();
}

async function calculatePerson(tenantId,personType,person,from,to){
  const personId = String(person._id);

  const profile = await getProfile(
    tenantId,
    personType,
    personId
  );

  const dailyHours = personType === "driver"
    ? await driverDailyHours(
        tenantId,
        personId,
        from,
        to
      )
    : await manualDailyHours(
        tenantId,
        personType,
        personId,
        from,
        to
      );

  const split = splitRegularAndOvertime(
    dailyHours,
    profile.overtimeAfterHours
  );

  const hourlyRate = money(profile.hourlyRate);
  const overtimeRate = money(profile.overtimeRate);

  const regularPay = money(
    split.regularHours * hourlyRate
  );

  const overtimePay = money(
    split.overtimeHours * overtimeRate
  );

  const totalDue = money(
    regularPay + overtimePay
  );

  const payment = await getPayment(
    tenantId,
    personType,
    personId,
    from,
    to
  );

  return {
    _id:personId,
    name:person.name || "",
    username:person.username || "",
    email:person.email || "",
    phone:person.phone || "",
    jobTitle:person.jobTitle || "",
    employeeNumber:person.employeeNumber || "",
    active:
      person.active !== false &&
      person.enabled !== false,
    personType,
    hourlyRate,
    overtimeRate,
    overtimeAfterHours:Number(
      profile.overtimeAfterHours ?? 40
    ),
    regularHours:split.regularHours,
    overtimeHours:split.overtimeHours,
    totalHours:split.totalHours,
    regularPay,
    overtimePay,
    totalDue,
    paymentStatus:payment ? "PAID" : "UNPAID",
    paidAt:payment?.paidAt || null,
    dailyHours
  };
}

/* =========================
PEOPLE SOURCES
========================= */

async function loadPeople(tenantId,personType){
  if(personType === "employee"){
    return await PayrollEmployee.find({tenantId})
      .sort({active:-1,name:1})
      .lean();
  }

  const roleMap = {
    driver:["driver"],
    dispatcher:["dispatcher"],
    admin:["admin"],
    super_admin:["SUPER_ADMIN"]
  };

  const roles = roleMap[personType];
  if(!roles) return [];

  return await User.find({
    tenantId,
    role:{$in:roles}
  })
  .select(
    "_id name username email phone role active enabled"
  )
  .sort({name:1})
  .lean();
}

/* =========================
LIST
========================= */

router.get(
  "/people",
  requirePayrollAuth,
  requirePayrollViewer,
  async(req,res)=>{

    try{
      const personType = clean(req.query.type);
      const from = clean(req.query.from);
      const to = clean(req.query.to);

      if(![
        "driver",
        "dispatcher",
        "admin",
        "super_admin",
        "employee"
      ].includes(personType)){
        return res.status(400).json({
          message:"Invalid payroll type"
        });
      }

      if(
        !validDateKey(from) ||
        !validDateKey(to) ||
        from > to
      ){
        return res.status(400).json({
          message:"Invalid date range"
        });
      }

      const tenantId = req.authUser.tenantId;
      const people = await loadPeople(
        tenantId,
        personType
      );

      const result = [];

      for(const person of people){
        result.push(
          await calculatePerson(
            tenantId,
            personType,
            person,
            from,
            to
          )
        );
      }

      return res.json({
        success:true,
        type:personType,
        from,
        to,
        canEdit:
          normalizedRole(req.authUser.role) === "SUPER_ADMIN",
        people:result
      });

    }catch(err){
      console.log("PAYROLL LIST ERROR:",err);

      return res.status(500).json({
        message:"Payroll load failed"
      });
    }
  }
);

/* =========================
SAVE PAY SETTINGS
SUPER ADMIN ONLY
========================= */

router.put(
  "/profile/:type/:id",
  requirePayrollAuth,
  requireSuperAdmin,
  async(req,res)=>{

    try{
      const personType = clean(req.params.type);

      if(![
        "driver",
        "dispatcher",
        "admin",
        "super_admin",
        "employee"
      ].includes(personType)){
        return res.status(400).json({
          message:"Invalid payroll type"
        });
      }

      const hourlyRate = Math.max(
        0,
        Number(req.body?.hourlyRate || 0)
      );

      const overtimeRate = Math.max(
        0,
        Number(req.body?.overtimeRate || 0)
      );

      const overtimeAfterHours = Math.max(
        0,
        Number(req.body?.overtimeAfterHours ?? 40)
      );

      const profile = await PayrollProfile.findOneAndUpdate(
        {
          tenantId:req.authUser.tenantId,
          personType,
          personId:String(req.params.id)
        },
        {
          $set:{
            hourlyRate,
            overtimeRate,
            overtimeAfterHours
          }
        },
        {
          new:true,
          upsert:true,
          setDefaultsOnInsert:true
        }
      );

      return res.json({
        success:true,
        profile
      });

    }catch(err){
      console.log("PAYROLL PROFILE ERROR:",err);

      return res.status(500).json({
        message:"Settings save failed"
      });
    }
  }
);

/* =========================
DAILY HOURS
Non-drivers only
========================= */

router.put(
  "/hours/:type/:id",
  requirePayrollAuth,
  requireSuperAdmin,
  async(req,res)=>{

    try{
      const personType = clean(req.params.type);

      if(![
        "dispatcher",
        "admin",
        "super_admin",
        "employee"
      ].includes(personType)){
        return res.status(400).json({
          message:"Driver hours are automatic"
        });
      }

      const workDate = clean(req.body?.workDate);
      const workHours = Number(req.body?.hours);

      if(
        !validDateKey(workDate) ||
        !Number.isFinite(workHours) ||
        workHours < 0 ||
        workHours > 24
      ){
        return res.status(400).json({
          message:"Invalid hours"
        });
      }

      const row = await PayrollTimeEntry.findOneAndUpdate(
        {
          tenantId:req.authUser.tenantId,
          personType,
          personId:String(req.params.id),
          workDate
        },
        {
          $set:{
            hours:workHours,
            note:clean(req.body?.note),
            enteredBy:req.authUser.id
          }
        },
        {
          new:true,
          upsert:true,
          setDefaultsOnInsert:true
        }
      );

      return res.json({
        success:true,
        row
      });

    }catch(err){
      console.log("PAYROLL HOURS ERROR:",err);

      return res.status(500).json({
        message:"Hours save failed"
      });
    }
  }
);

/* =========================
EMPLOYEE
========================= */

router.post(
  "/employees",
  requirePayrollAuth,
  requireSuperAdmin,
  async(req,res)=>{

    try{
      const name = clean(req.body?.name);

      if(!name){
        return res.status(400).json({
          message:"Employee name required"
        });
      }

      const employee = await PayrollEmployee.create({
        tenantId:req.authUser.tenantId,
        name,
        employeeNumber:clean(req.body?.employeeNumber),
        jobTitle:clean(req.body?.jobTitle),
        phone:clean(req.body?.phone),
        email:clean(req.body?.email),
        active:true
      });

      return res.json({
        success:true,
        employee
      });

    }catch(err){
      console.log("PAYROLL EMPLOYEE CREATE ERROR:",err);

      return res.status(500).json({
        message:"Employee create failed"
      });
    }
  }
);

router.put(
  "/employees/:id",
  requirePayrollAuth,
  requireSuperAdmin,
  async(req,res)=>{

    try{
      const employee = await PayrollEmployee.findOneAndUpdate(
        {
          _id:req.params.id,
          tenantId:req.authUser.tenantId
        },
        {
          $set:{
            name:clean(req.body?.name),
            employeeNumber:clean(req.body?.employeeNumber),
            jobTitle:clean(req.body?.jobTitle),
            phone:clean(req.body?.phone),
            email:clean(req.body?.email),
            active:req.body?.active !== false
          }
        },
        {new:true}
      );

      if(!employee){
        return res.status(404).json({
          message:"Employee not found"
        });
      }

      return res.json({
        success:true,
        employee
      });

    }catch(err){
      console.log("PAYROLL EMPLOYEE UPDATE ERROR:",err);

      return res.status(500).json({
        message:"Employee update failed"
      });
    }
  }
);

/* =========================
MARK PAID
No bank transfer.
Only records PAID status.
========================= */

router.post(
  "/mark-paid/:type/:id",
  requirePayrollAuth,
  requireSuperAdmin,
  async(req,res)=>{

    try{
      const personType = clean(req.params.type);
      const from = clean(req.body?.from);
      const to = clean(req.body?.to);

      if(
        !validDateKey(from) ||
        !validDateKey(to) ||
        from > to
      ){
        return res.status(400).json({
          message:"Invalid date range"
        });
      }

      const people = await loadPeople(
        req.authUser.tenantId,
        personType
      );

      const person = people.find(row=>
        String(row._id) === String(req.params.id)
      );

      if(!person){
        return res.status(404).json({
          message:"Person not found"
        });
      }

      const calc = await calculatePerson(
        req.authUser.tenantId,
        personType,
        person,
        from,
        to
      );

      const payment = await PayrollPayment.findOneAndUpdate(
        {
          tenantId:req.authUser.tenantId,
          personType,
          personId:String(req.params.id),
          periodStart:from,
          periodEnd:to
        },
        {
          $setOnInsert:{
            personName:calc.name,
            regularHours:calc.regularHours,
            overtimeHours:calc.overtimeHours,
            totalHours:calc.totalHours,
            hourlyRate:calc.hourlyRate,
            overtimeRate:calc.overtimeRate,
            regularPay:calc.regularPay,
            overtimePay:calc.overtimePay,
            totalDue:calc.totalDue,
            status:"PAID",
            paidAt:new Date(),
            paidBy:req.authUser.id
          }
        },
        {
          new:true,
          upsert:true,
          setDefaultsOnInsert:true
        }
      );

      return res.json({
        success:true,
        payment
      });

    }catch(err){
      console.log("PAYROLL MARK PAID ERROR:",err);

      return res.status(500).json({
        message:"Mark paid failed"
      });
    }
  }
);

/* =========================
DRIVER EARNINGS
========================= */

router.get(
  "/me",
  requirePayrollAuth,
  async(req,res)=>{

    try{
      if(normalizedRole(req.authUser.role) !== "DRIVER"){
        return res.status(403).json({
          message:"Driver only"
        });
      }

      const from = clean(req.query.from);
      const to = clean(req.query.to);

      if(
        !validDateKey(from) ||
        !validDateKey(to) ||
        from > to
      ){
        return res.status(400).json({
          message:"Invalid date range"
        });
      }

      const driver = await User.findOne({
        _id:req.authUser.id,
        tenantId:req.authUser.tenantId,
        role:"driver"
      })
      .select(
        "_id name username email phone role active enabled"
      )
      .lean();

      if(!driver){
        return res.status(404).json({
          message:"Driver not found"
        });
      }

      const result = await calculatePerson(
        req.authUser.tenantId,
        "driver",
        driver,
        from,
        to
      );

      return res.json({
        success:true,
        from,
        to,
        earnings:result
      });

    }catch(err){
      console.log("DRIVER EARNINGS ERROR:",err);

      return res.status(500).json({
        message:"Earnings load failed"
      });
    }
  }
);

module.exports = router;