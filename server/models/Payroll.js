/* =========================================================
   FILE: models/Payroll.js
   ONE FILE FOR:
   - Payroll Profiles
   - Manual Employees
   - Manual Time Entries
   - Payment History
========================================================= */

/* =========================
   PAYROLL PROFILE
========================= */

const payrollProfileSchema = new mongoose.Schema(
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

const payrollEmployeeSchema = new mongoose.Schema(
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
   FOR NON-DRIVERS
========================= */

const payrollTimeEntrySchema = new mongoose.Schema(
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
   PAYMENT HISTORY
========================= */

const payrollPaymentSchema = new mongoose.Schema(
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
      trim:true
    },

    periodEnd:{
      type:String,
      required:true,
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

    hourlyRate:{
      type:Number,
      default:0
    },

    overtimeRate:{
      type:Number,
      default:0
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

    status:{
      type:String,
      enum:["PAID"],
      default:"PAID"
    },

    paidAt:{
      type:Date,
      default:Date.now
    },

    paidBy:{
      type:String,
      default:"",
      trim:true
    }
  },
  {
    timestamps:true
  }
);

payrollPaymentSchema.index(
  {
    tenantId:1,
    personType:1,
    personId:1,
    periodStart:1,
    periodEnd:1
  },
  {
    unique:true,
    name:"tenant_payroll_payment_period_unique"
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

const PayrollPayment =
  mongoose.models.PayrollPayment ||
  mongoose.model(
    "PayrollPayment",
    payrollPaymentSchema
  );

module.exports = {
  PayrollProfile,
  PayrollEmployee,
  PayrollTimeEntry,
  PayrollPayment
};