const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const router = express.Router();

const User = require("../models/User");
const Tenant = require("../models/Tenant");

const {
  verifyToken,
  requireRole
} = require("../middleware/authmiddleware");

/* =========================================
   PLATFORM ADMIN SECURITY
========================================= */

router.use(
  verifyToken,
  requireRole("PLATFORM_ADMIN")
);


/* =========================================
   TENANT SERVICE CATALOG
========================================= */

const SERVICE_CATALOG = [
  { serviceKey:"ST", title:"Standard" },
  { serviceKey:"WH", title:"Wheelchair" },
  { serviceKey:"SH", title:"Shared" },
  { serviceKey:"LM", title:"Limousine" },
  { serviceKey:"TX", title:"Taxi" },
  { serviceKey:"XL", title:"XL" }
];

function clean(value){
  return String(value ?? "").trim();
}

function normalizeServiceKey(value){

  const key =
    clean(value)
      .toUpperCase()
      .replace(/\s+/g,"");

  if(key === "STANDARD") return "ST";
  if(key === "WHEELCHAIR" || key === "WC") return "WH";
  if(key === "SHARED") return "SH";
  if(key === "LIMO" || key === "LIMOUSINE") return "LM";
  if(key === "TAXI") return "TX";

  return key;
}

function normalizeAllowedServices(values){

  if(!Array.isArray(values)){
    return [];
  }

  return [
    ...new Set(
      values
        .map(normalizeServiceKey)
        .filter(Boolean)
        .filter(key =>
          /^[A-Z0-9_-]{1,30}$/.test(key)
        )
    )
  ];
}

/* =========================================
   GET PLATFORM SERVICE CATALOG
========================================= */

router.get(
  "/service-catalog",
  async (req,res)=>{

    return res.json({
      success:true,
      services:SERVICE_CATALOG
    });

  }
);

/* =========================================
   GET ALL TENANTS
========================================= */

router.get("/tenants", async (req, res) => {
  try {

    const tenants =
      await Tenant.find({})
        .sort({ createdAt: -1 })
        .lean();

    return res.json(tenants);

  } catch (err) {

    console.error(
      "PLATFORM TENANTS ERROR:",
      err
    );

    return res.status(500).json({
      message: "Server error"
    });

  }
});

/* =========================================
   CREATE TENANT + FIRST SUPER ADMIN
========================================= */

router.post("/tenants", async (req, res) => {
  try {

    const {
      name,
      slug,
      timezone,
      subscriptionStatus,
      allowedServices
    } = req.body || {};

    if (
      !name ||
      !slug
    ) {
      return res.status(400).json({
        message:
          "name and slug are required"
      });
    }

    const cleanName =
      String(name).trim();

    const cleanSlug =
      String(slug)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    if (!cleanSlug) {
      return res.status(400).json({
        message: "Invalid tenant slug"
      });
    }

    const existingTenant =
      await Tenant.findOne({
        slug: cleanSlug
      });

    if (existingTenant) {
      return res.status(409).json({
        message: "Tenant slug already exists"
      });
    }

    const allowedStatus = [
      "ACTIVE",
      "TRIAL",
      "SUSPENDED",
      "CANCELED"
    ];

    const finalStatus =
      allowedStatus.includes(
        String(
          subscriptionStatus ||
          "ACTIVE"
        ).toUpperCase()
      )
        ? String(
            subscriptionStatus ||
            "ACTIVE"
          ).toUpperCase()
        : "ACTIVE";

    const tenant =
      await Tenant.create({
        name:
          cleanName,

        slug:
          cleanSlug,

        enabled:
          true,

        subscriptionStatus:
          finalStatus,

        timezone:
          timezone
            ? String(timezone).trim()
            : "America/Phoenix",

        allowedServices:
          normalizeAllowedServices(
            allowedServices
          ),

        branding: {
          companyName:
            cleanName
        }
      });

    return res.status(201).json({
      message:
        "Company created successfully",

      tenant: {
        id:
          tenant._id,

        name:
          tenant.name,

        slug:
          tenant.slug,

        enabled:
          tenant.enabled,

        subscriptionStatus:
          tenant.subscriptionStatus,

        timezone:
          tenant.timezone,

        allowedServices:
          tenant.allowedServices || []
      }
    });

  } catch (err) {

    console.error(
      "CREATE TENANT ERROR:",
      err
    );

    if (err?.code === 11000) {
      return res.status(409).json({
        message:
          "Tenant slug already exists"
      });
    }

    return res.status(500).json({
      message: "Server error"
    });

  }
});

/* =========================================
   UPDATE TENANT STATUS
========================================= */

router.patch(
  "/tenants/:tenantId/status",
  async (req, res) => {
    try {

      const {
        enabled,
        subscriptionStatus
      } = req.body || {};

      const update = {};

      if (typeof enabled === "boolean") {
        update.enabled = enabled;
      }

      if (
        subscriptionStatus !== undefined
      ) {

        const allowed = [
          "ACTIVE",
          "TRIAL",
          "SUSPENDED",
          "CANCELED"
        ];

        if (
          !allowed.includes(
            subscriptionStatus
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid subscriptionStatus"
          });
        }

        update.subscriptionStatus =
          subscriptionStatus;
      }

      if (
        Object.keys(update).length === 0
      ) {
        return res.status(400).json({
          message: "Nothing to update"
        });
      }

      const tenant =
        await Tenant.findByIdAndUpdate(
          req.params.tenantId,
          update,
          {
            new: true,
            runValidators: true
          }
        );

      if (!tenant) {
        return res.status(404).json({
          message: "Tenant not found"
        });
      }

      return res.json({
        message: "Tenant updated",
        tenant
      });

    } catch (err) {

      console.error(
        "UPDATE TENANT ERROR:",
        err
      );

      return res.status(500).json({
        message: "Server error"
      });

    }
  }
);


/* =========================================
   GET TENANT ALLOWED SERVICES
========================================= */

router.get(
  "/tenants/:tenantId/services",
  async (req,res)=>{

    try{

      const tenant =
        await Tenant.findById(
          req.params.tenantId
        )
        .lean();

      if(!tenant){

        return res.status(404).json({
          message:"Tenant not found"
        });

      }

      return res.json({
        success:true,

        tenant:{
          id:tenant._id,
          name:tenant.name,
          slug:tenant.slug
        },

        serviceCatalog:
          SERVICE_CATALOG,

        allowedServices:
          Array.isArray(
            tenant.allowedServices
          )
            ? tenant.allowedServices
            : []
      });

    }catch(err){

      console.error(
        "GET TENANT SERVICES ERROR:",
        err
      );

      return res.status(500).json({
        message:"Server error"
      });

    }

  }
);

/* =========================================
   SAVE TENANT ALLOWED SERVICES
========================================= */

router.patch(
  "/tenants/:tenantId/services",
  async (req,res)=>{

    try{

      if(
        !Array.isArray(
          req.body?.allowedServices
        )
      ){

        return res.status(400).json({
          message:
            "allowedServices array is required"
        });

      }

      const allowedServices =
        normalizeAllowedServices(
          req.body.allowedServices
        );

      const tenant =
        await Tenant.findByIdAndUpdate(
          req.params.tenantId,
          {
            $set:{
              allowedServices
            }
          },
          {
            new:true,
            runValidators:true
          }
        );

      if(!tenant){

        return res.status(404).json({
          message:"Tenant not found"
        });

      }

      return res.json({
        success:true,

        message:
          "Tenant services updated",

        tenant:{
          id:tenant._id,
          name:tenant.name,
          slug:tenant.slug,
          allowedServices:
            tenant.allowedServices || []
        }
      });

    }catch(err){

      console.error(
        "UPDATE TENANT SERVICES ERROR:",
        err
      );

      return res.status(500).json({
        message:"Server error"
      });

    }

  }
);

/* =========================================
   GET SUPER ADMINS FOR ONE TENANT
========================================= */

router.get(
  "/tenants/:tenantId/super-admins",
  async (req, res) => {

    try {

      const tenant =
        await Tenant.findById(
          req.params.tenantId
        );

      if (!tenant) {
        return res.status(404).json({
          message: "Tenant not found"
        });
      }

      const admins =
        await User.find({
          tenantId:
            tenant._id,

          role:
            "SUPER_ADMIN"
        })
        .select(
          "-password"
        )
        .sort({
          createdAt: -1,
          name: 1
        })
        .lean();

      return res.json({
        tenant: {
          id:
            tenant._id,

          name:
            tenant.name,

          slug:
            tenant.slug
        },

        admins
      });

    } catch (err) {

      console.error(
        "GET SUPER ADMINS ERROR:",
        err
      );

      return res.status(500).json({
        message: "Server error"
      });

    }

  }
);

/* =========================================
   CREATE SUPER ADMIN FOR ONE TENANT
========================================= */

router.post(
  "/tenants/:tenantId/super-admins",
  async (req, res) => {

    try {

      const tenant =
        await Tenant.findById(
          req.params.tenantId
        );

      if (!tenant) {
        return res.status(404).json({
          message: "Tenant not found"
        });
      }

      const {
        name,
        username,
        password,
        email,
        phone
      } = req.body || {};

      if (
        !name ||
        !username ||
        !password
      ) {
        return res.status(400).json({
          message:
            "name, username and password are required"
        });
      }

      if (
        String(password).length < 8
      ) {
        return res.status(400).json({
          message:
            "Password must be at least 8 characters"
        });
      }

      const cleanUsername =
        String(username).trim();

      const exists =
        await User.findOne({
          tenantId:
            tenant._id,

          username:
            cleanUsername
        });

      if (exists) {
        return res.status(409).json({
          message: "Username already exists"
        });
      }

      const hashed =
        await bcrypt.hash(
          String(password),
          10
        );

      const admin =
        await User.create({
          name:
            String(name).trim(),

          username:
            cleanUsername,

          password:
            hashed,

          email:
            String(email || "").trim(),

          phone:
            String(phone || "").trim(),

          role:
            "SUPER_ADMIN",

          tenantId:
            tenant._id,

          active:
            true,

          enabled:
            true
        });

      return res.status(201).json({
        message:
          "Super Admin created",

        admin: {
          id:
            admin._id,

          name:
            admin.name,

          username:
            admin.username,

          role:
            admin.role,

          tenantId:
            admin.tenantId,

          enabled:
            admin.enabled
        }
      });

    } catch (err) {

      console.error(
        "CREATE SUPER ADMIN ERROR:",
        err
      );

      if (err?.code === 11000) {
        return res.status(409).json({
          message:
            "Username already exists"
        });
      }

      return res.status(500).json({
        message: "Server error"
      });

    }

  }
);

/* =========================================
   ENABLE / DISABLE SUPER ADMIN
========================================= */

router.patch(
  "/super-admins/:userId/toggle",
  async (req, res) => {

    try {

      const tenantId =
        String(
          req.body?.tenantId ||
          req.query?.tenantId ||
          ""
        ).trim();

      if (!tenantId) {
        return res.status(400).json({
          message:
            "tenantId is required"
        });
      }

      const tenant =
        await Tenant.findById(
          tenantId
        );

      if (!tenant) {
        return res.status(404).json({
          message:
            "Tenant not found"
        });
      }

      const admin =
        await User.findOne({
          _id:
            req.params.userId,

          tenantId:
            tenant._id,

          role:
            "SUPER_ADMIN"
        });

      if (!admin) {
        return res.status(404).json({
          message:
            "Super Admin not found"
        });
      }

      admin.enabled =
        !(admin.enabled !== false);

      admin.active =
        admin.enabled;

      await admin.save();

      return res.json({
        message:
          admin.enabled
            ? "Super Admin enabled"
            : "Super Admin disabled",

        user: {
          id:
            admin._id,

          name:
            admin.name,

          username:
            admin.username,

          tenantId:
            admin.tenantId,

          enabled:
            admin.enabled
        }
      });

    } catch (err) {

      console.error(
        "TOGGLE SUPER ADMIN ERROR:",
        err
      );

      return res.status(500).json({
        message: "Server error"
      });

    }

  }
);


/* =========================================
   PERMANENT DELETE TENANT
   PLATFORM_ADMIN ONLY

   IMPORTANT:
   - Deletes ONLY documents whose tenantId matches
     the selected tenant.
   - Then deletes the Tenant record itself.
   - PLATFORM_ADMIN protection is already applied
     globally by router.use() above.
========================================= */

router.delete(
  "/tenants/:tenantId",
  async (req,res)=>{

    try{

      const tenantId =
        clean(
          req.params.tenantId
        );

      const confirmSlug =
        clean(
          req.body?.confirmSlug
        )
        .toLowerCase();

      if(
        !mongoose.Types.ObjectId
          .isValid(tenantId)
      ){
        return res.status(400).json({
          message:"Invalid tenantId"
        });
      }

      const tenant =
        await Tenant.findById(
          tenantId
        )
        .lean();

      if(!tenant){
        return res.status(404).json({
          message:"Tenant not found"
        });
      }

      const tenantSlug =
        clean(
          tenant.slug
        )
        .toLowerCase();

      if(
        !confirmSlug ||
        confirmSlug !== tenantSlug
      ){
        return res.status(400).json({
          message:
            "Confirmation slug does not match the tenant"
        });
      }

      const objectId =
        new mongoose.Types.ObjectId(
          tenantId
        );

      /*
        Delete tenant-scoped records from every MongoDB
        collection except the tenants collection itself.

        This protects other tenants because the filter is
        ALWAYS tenantId = selected tenant only.

        We match both ObjectId and string tenantId because
        older records may have stored tenantId differently.
      */

      const db =
        mongoose.connection.db;

      if(!db){
        return res.status(500).json({
          message:"Database connection is not ready"
        });
      }

      const collections =
        await db
          .listCollections(
            {},
            {nameOnly:true}
          )
          .toArray();

      const deleted = {};

      for(
        const item of collections
      ){

        const collectionName =
          clean(
            item?.name
          );

        if(
          !collectionName ||
          collectionName === "tenants"
        ){
          continue;
        }

        const collection =
          db.collection(
            collectionName
          );

        const result =
          await collection.deleteMany({
            $or:[
              {
                tenantId:
                  objectId
              },
              {
                tenantId:
                  tenantId
              }
            ]
          });

        if(
          Number(
            result?.deletedCount || 0
          ) > 0
        ){
          deleted[collectionName] =
            Number(
              result.deletedCount
            );
        }
      }

      const tenantDelete =
        await Tenant.deleteOne({
          _id:objectId
        });

      if(
        Number(
          tenantDelete?.deletedCount || 0
        ) !== 1
      ){
        return res.status(500).json({
          message:
            "Tenant data was removed but the tenant record could not be deleted"
        });
      }

      console.log(
        "TENANT PERMANENTLY DELETED:",
        {
          tenantId,
          tenantSlug,
          deleted
        }
      );

      return res.json({
        success:true,

        message:
          `Tenant "${tenant.name}" permanently deleted`,

        tenant:{
          id:tenantId,
          name:tenant.name,
          slug:tenant.slug
        },

        deleted
      });

    }catch(err){

      console.error(
        "DELETE TENANT ERROR:",
        err
      );

      return res.status(500).json({
        message:
          err?.message ||
          "Server error"
      });

    }

  }
);



/* =========================================
   PERMANENT DELETE TENANT - POST ENDPOINT
   Use POST for better browser/proxy compatibility
========================================= */

router.post(
  "/tenants/:tenantId/delete",
  async (req,res)=>{

    try{

      const tenantId =
        clean(
          req.params.tenantId
        );

      const confirmSlug =
        clean(
          req.body?.confirmSlug
        )
        .toLowerCase();

      if(
        !mongoose.Types.ObjectId
          .isValid(tenantId)
      ){
        return res.status(400).json({
          message:"Invalid tenantId"
        });
      }

      const tenant =
        await Tenant.findById(
          tenantId
        )
        .lean();

      if(!tenant){
        return res.status(404).json({
          message:"Tenant not found"
        });
      }

      const tenantSlug =
        clean(
          tenant.slug
        )
        .toLowerCase();

      if(
        !confirmSlug ||
        confirmSlug !== tenantSlug
      ){
        return res.status(400).json({
          message:
            "Confirmation slug does not match the tenant"
        });
      }

      const objectId =
        new mongoose.Types.ObjectId(
          tenantId
        );

      const db =
        mongoose.connection.db;

      if(!db){
        return res.status(500).json({
          message:"Database connection is not ready"
        });
      }

      const collections =
        await db
          .listCollections(
            {},
            {nameOnly:true}
          )
          .toArray();

      const deleted = {};

      for(const item of collections){

        const collectionName =
          clean(item?.name);

        if(
          !collectionName ||
          collectionName === "tenants"
        ){
          continue;
        }

        const result =
          await db
            .collection(collectionName)
            .deleteMany({
              $or:[
                {tenantId:objectId},
                {tenantId:tenantId}
              ]
            });

        if(
          Number(result?.deletedCount || 0) > 0
        ){
          deleted[collectionName] =
            Number(result.deletedCount);
        }
      }

      await Tenant.deleteOne({
        _id:objectId
      });

      console.log(
        "TENANT PERMANENTLY DELETED:",
        {
          tenantId,
          tenantSlug,
          deleted
        }
      );

      return res.json({
        success:true,
        message:
          `Tenant "${tenant.name}" permanently deleted`,
        deleted
      });

    }catch(err){

      console.error(
        "DELETE TENANT POST ERROR:",
        err
      );

      return res.status(500).json({
        message:
          err?.message ||
          "Server error"
      });

    }

  }
);


module.exports = router;