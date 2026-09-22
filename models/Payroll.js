const mongoose = require("mongoose");

/* =========================================================
   FILE: models/Payroll.js

   ONE PAYROLL MODEL FILE

   ACTIVE SYSTEM:
   - Driver payroll profiles
   - Staff payroll profiles
   - Company pay-period settings
   - Staff work schedules
   - Staff daily Sign In attendance
   - Closed payroll period history

   STAFF TYPES:
   - dispatcher
   - admin
   - super_admin

   IMPORTANT:
   - No manual employee payroll.
   - No Paid / Unpaid.
   - No Mark Paid.
   - Staff Sign In is attendance confirmation only.
   - One successful Sign In credits the scheduled hours
     for that day; no Sign Out is required.
========================================================= */


/* =========================
   COMMONS
========================= */

const PERSON_TYPES = [
  "driver",
  "dispatcher",
  "admin",
  "super_admin"
];

const STAFF_TYPES = [
  "dispatcher",
  "admin",
  "super_admin"
];


/* =========================
   PAYROLL PROFILE
========================= */

const payrollProfileSchema =
new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },

    personType:{
      type:String,
      enum:PERSON_TYPES,
      required:true,
      index:true
    },

    personId:{
      type:String,
      required:true,
      trim:true,
      index:true
    },

    hourlyRate:{
      type:Number,
      default:0,
      min:0
    },

    overtimeRate:{
      type:Number,
      default:0,
      min:0
    },

    /*
      Weekly regular-hour limit.
      Hours above this amount become overtime.
    */
    overtimeAfterHours:{
      type:Number,
      default:40,
      min:0
    },

    enabled:{
      type:Boolean,
      default:true
    }
  },
  {
    timestamps:true
  }
);

payrollProfileSchema.index(
  {
    tenantId:1,
    personType:1,
    personId:1
  },
  {
    unique:true,
    name:"tenant_payroll_profile_unique"
  }
);


/* =========================
   COMPANY PAY PERIOD
========================= */

const payrollPeriodSettingsSchema =
new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      unique:true,
      index:true
    },

    /*
      Example:
      anchorStart = 2026-08-23
      periodLengthDays = 7

      Periods repeat automatically:
      Aug 23 -> Aug 29
      Aug 30 -> Sep 05
    */
    anchorStart:{
      type:String,
      required:true,
      trim:true
    },

    periodLengthDays:{
      type:Number,
      required:true,
      min:1,
      max:366,
      default:7
    },

    archiveCursorStart:{
      type:String,
      default:"",
      trim:true
    },

    updatedBy:{
      type:String,
      default:"",
      trim:true
    }
  },
  {
    timestamps:true
  }
);


/* =========================
   STAFF WORK SCHEDULE
========================= */

const staffDaySchema =
new mongoose.Schema(
  {
    enabled:{
      type:Boolean,
      default:false
    },

    /*
      Hours credited after successful Sign In
      on this scheduled day.
    */
    hours:{
      type:Number,
      default:0,
      min:0,
      max:24
    }
  },
  {
    _id:false
  }
);

function defaultDay(){
  return {
    enabled:false,
    hours:0
  };
}

const payrollStaffScheduleSchema =
new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },

    personType:{
      type:String,
      enum:STAFF_TYPES,
      required:true,
      index:true
    },

    personId:{
      type:String,
      required:true,
      trim:true,
      index:true
    },

    /*
      Master switch requested by the user.
      Disabled = Sign In never appears and no
      schedule-based payroll is credited.
    */
    payrollEnabled:{
      type:Boolean,
      default:false,
      index:true
    },

    days:{
      sun:{
        type:staffDaySchema,
        default:defaultDay
      },

      mon:{
        type:staffDaySchema,
        default:defaultDay
      },

      tue:{
        type:staffDaySchema,
        default:defaultDay
      },

      wed:{
        type:staffDaySchema,
        default:defaultDay
      },

      thu:{
        type:staffDaySchema,
        default:defaultDay
      },

      fri:{
        type:staffDaySchema,
        default:defaultDay
      },

      sat:{
        type:staffDaySchema,
        default:defaultDay
      }
    },

    updatedBy:{
      type:String,
      default:"",
      trim:true
    }
  },
  {
    timestamps:true
  }
);

payrollStaffScheduleSchema.index(
  {
    tenantId:1,
    personType:1,
    personId:1
  },
  {
    unique:true,
    name:"tenant_staff_payroll_schedule_unique"
  }
);


/* =========================
   STAFF DAILY ATTENDANCE
========================= */

const payrollAttendanceSchema =
new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },

    personType:{
      type:String,
      enum:STAFF_TYPES,
      required:true,
      index:true
    },

    personId:{
      type:String,
      required:true,
      trim:true,
      index:true
    },

    /*
      Tenant-local calendar date.
      Example: 2026-08-24
    */
    workDate:{
      type:String,
      required:true,
      trim:true,
      index:true
    },

    dayKey:{
      type:String,
      enum:[
        "sun",
        "mon",
        "tue",
        "wed",
        "thu",
        "fri",
        "sat"
      ],
      required:true
    },

    /*
      Snapshot of scheduled hours at Sign In.
      Later schedule edits do not change the
      already signed day.
    */
    creditedHours:{
      type:Number,
      required:true,
      min:0,
      max:24
    },

    signedAt:{
      type:Date,
      default:Date.now,
      required:true
    },

    timezone:{
      type:String,
      default:"",
      trim:true
    }
  },
  {
    timestamps:true
  }
);

payrollAttendanceSchema.index(
  {
    tenantId:1,
    personType:1,
    personId:1,
    workDate:1
  },
  {
    unique:true,
    name:"tenant_staff_daily_signin_unique"
  }
);


/* =========================
   CLOSED PERIOD HISTORY
========================= */

const payrollPeriodHistorySchema =
new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },

    personType:{
      type:String,
      /*
        "employee" remains accepted only so old
        snapshots already stored in MongoDB do
        not create migration problems.
        New payroll routes never create it.
      */
      enum:[
        "driver",
        "dispatcher",
        "admin",
        "super_admin",
        "employee"
      ],
      required:true,
      index:true
    },

    personId:{
      type:String,
      required:true,
      trim:true,
      index:true
    },

    personName:{
      type:String,
      default:"",
      trim:true
    },

    periodStart:{
      type:String,
      required:true,
      trim:true,
      index:true
    },

    periodEnd:{
      type:String,
      required:true,
      trim:true,
      index:true
    },

    timezone:{
      type:String,
      default:"America/Phoenix",
      trim:true
    },

    regularHours:{
      type:Number,
      default:0
    },

    overtimeHours:{
      type:Number,
      default:0
    },

    totalHours:{
      type:Number,
      default:0
    },

    tripCount:{
      type:Number,
      default:0,
      min:0
    },

    hourlyRate:{
      type:Number,
      default:0
    },

    overtimeRate:{
      type:Number,
      default:0
    },

    overtimeAfterHours:{
      type:Number,
      default:40
    },

    regularPay:{
      type:Number,
      default:0
    },

    overtimePay:{
      type:Number,
      default:0
    },

    totalDue:{
      type:Number,
      default:0
    },

    dailyHours:{
      type:Array,
      default:[]
    },

    closedAt:{
      type:Date,
      default:Date.now
    }
  },
  {
    timestamps:true
  }
);

payrollPeriodHistorySchema.index(
  {
    tenantId:1,
    personType:1,
    personId:1,
    periodStart:1,
    periodEnd:1
  },
  {
    unique:true,
    name:"tenant_payroll_period_history_unique"
  }
);


/* =========================
   LEGACY MODELS
   Kept only so old collections/imports do not
   crash a previous deployment. New routes do
   not expose Employees or manual time entry.
========================= */

const legacyPayrollEmployeeSchema =
new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      index:true
    },

    name:{
      type:String,
      default:""
    },

    active:{
      type:Boolean,
      default:false
    }
  },
  {
    timestamps:true
  }
);

const legacyPayrollTimeEntrySchema =
new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      index:true
    },

    personType:{
      type:String,
      default:""
    },

    personId:{
      type:String,
      default:""
    },

    workDate:{
      type:String,
      default:""
    },

    hours:{
      type:Number,
      default:0
    }
  },
  {
    timestamps:true
  }
);


/* =========================
   MODELS
========================= */

const PayrollProfile =
  mongoose.models.PayrollProfile ||
  mongoose.model(
    "PayrollProfile",
    payrollProfileSchema
  );

const PayrollPeriodSettings =
  mongoose.models.PayrollPeriodSettings ||
  mongoose.model(
    "PayrollPeriodSettings",
    payrollPeriodSettingsSchema
  );

const PayrollStaffSchedule =
  mongoose.models.PayrollStaffSchedule ||
  mongoose.model(
    "PayrollStaffSchedule",
    payrollStaffScheduleSchema
  );

const PayrollAttendance =
  mongoose.models.PayrollAttendance ||
  mongoose.model(
    "PayrollAttendance",
    payrollAttendanceSchema
  );

const PayrollPeriodHistory =
  mongoose.models.PayrollPeriodHistory ||
  mongoose.model(
    "PayrollPeriodHistory",
    payrollPeriodHistorySchema
  );

const PayrollEmployee =
  mongoose.models.PayrollEmployee ||
  mongoose.model(
    "PayrollEmployee",
    legacyPayrollEmployeeSchema
  );

const PayrollTimeEntry =
  mongoose.models.PayrollTimeEntry ||
  mongoose.model(
    "PayrollTimeEntry",
    legacyPayrollTimeEntrySchema
  );


/* =========================
   EXPORT
========================= */

module.exports = {
  PayrollProfile,
  PayrollPeriodSettings,
  PayrollStaffSchedule,
  PayrollAttendance,
  PayrollPeriodHistory,

  /* legacy compatibility only */
  PayrollEmployee,
  PayrollTimeEntry
};