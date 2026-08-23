const mongoose = require("mongoose");

/* =========================================================
   FILE: models/Payroll.js

   ONE MODEL FILE FOR:
   - Payroll Profiles
   - Manual Employees
   - Manual Time Entries
   - Company Pay Period Settings
   - Automatic Closed Period History

   IMPORTANT:
   - NO Paid / Unpaid workflow.
   - NO Mark Paid workflow.
   - Pay period is company-wide per tenant.
   - Current period rolls automatically by tenant timezone.
========================================================= */


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
   MANUAL EMPLOYEE
========================= */

const payrollEmployeeSchema =
new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },

    name:{
      type:String,
      required:true,
      trim:true
    },

    employeeNumber:{
      type:String,
      default:"",
      trim:true
    },

    jobTitle:{
      type:String,
      default:"",
      trim:true
    },

    phone:{
      type:String,
      default:"",
      trim:true
    },

    email:{
      type:String,
      default:"",
      trim:true
    },

    active:{
      type:Boolean,
      default:true,
      index:true
    }
  },
  {
    timestamps:true
  }
);

payrollEmployeeSchema.index({
  tenantId:1,
  active:1,
  name:1
});


/* =========================
   MANUAL TIME ENTRY
   NON-DRIVERS ONLY
========================= */

const payrollTimeEntrySchema =
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
      enum:[
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

    workDate:{
      type:String,
      required:true,
      trim:true,
      index:true
    },

    hours:{
      type:Number,
      required:true,
      min:0,
      max:24
    },

    note:{
      type:String,
      default:"",
      trim:true
    },

    enteredBy:{
      type:String,
      default:"",
      trim:true
    }
  },
  {
    timestamps:true
  }
);

payrollTimeEntrySchema.index(
  {
    tenantId:1,
    personType:1,
    personId:1,
    workDate:1
  },
  {
    unique:true,
    name:"tenant_payroll_daily_hours_unique"
  }
);


/* =========================
   COMPANY PAY PERIOD SETTINGS

   Example:
   anchorStart = 2026-08-23
   periodLengthDays = 7

   Then periods are:
   Aug 23 -> Aug 29
   Aug 30 -> Sep 05
   etc.

   Current period is derived from tenant timezone.
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
   AUTOMATIC PERIOD HISTORY

   Snapshot made automatically after a pay period ends.
   This is history only — it does NOT mean money was paid.
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
   MODELS
========================= */

const PayrollProfile =
  mongoose.models.PayrollProfile ||
  mongoose.model(
    "PayrollProfile",
    payrollProfileSchema
  );

const PayrollEmployee =
  mongoose.models.PayrollEmployee ||
  mongoose.model(
    "PayrollEmployee",
    payrollEmployeeSchema
  );

const PayrollTimeEntry =
  mongoose.models.PayrollTimeEntry ||
  mongoose.model(
    "PayrollTimeEntry",
    payrollTimeEntrySchema
  );

const PayrollPeriodSettings =
  mongoose.models.PayrollPeriodSettings ||
  mongoose.model(
    "PayrollPeriodSettings",
    payrollPeriodSettingsSchema
  );

const PayrollPeriodHistory =
  mongoose.models.PayrollPeriodHistory ||
  mongoose.model(
    "PayrollPeriodHistory",
    payrollPeriodHistorySchema
  );


/* =========================
   EXPORT
========================= */

module.exports = {
  PayrollProfile,
  PayrollEmployee,
  PayrollTimeEntry,
  PayrollPeriodSettings,
  PayrollPeriodHistory
};