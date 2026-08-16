const express = require("express");
const bcrypt = require("bcryptjs");

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

      adminName,
      adminUsername,
      adminPassword
    } = req.body || {};

    if (
      !name ||
      !slug ||
      !adminName ||
      !adminUsername ||
      !adminPassword
    ) {
      return res.status(400).json({
        message:
          "name, slug, adminName, adminUsername and adminPassword are required"
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

    const cleanAdminUsername =
      String(adminUsername).trim();

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

    const existingUser =
      await User.findOne({
        username: cleanAdminUsername
      });

    if (existingUser) {
      return res.status(409).json({
        message: "Username already exists"
      });
    }

    let tenant = null;

    try {

      tenant =
        await Tenant.create({
          name: cleanName,
          slug: cleanSlug,

          enabled: true,

          subscriptionStatus:
            "ACTIVE",

          timezone:
            timezone
              ? String(timezone).trim()
              : "America/Phoenix",

          branding: {
            companyName: cleanName
          }
        });

      const hashedPassword =
        await bcrypt.hash(
          String(adminPassword),
          10
        );

      const superAdmin =
        await User.create({
          name:
            String(adminName).trim(),

          username:
            cleanAdminUsername,

          password:
            hashedPassword,

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
          "Tenant and Super Admin created",

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
            tenant.timezone
        },

        superAdmin: {
          id:
            superAdmin._id,

          name:
            superAdmin.name,

          username:
            superAdmin.username,

          role:
            superAdmin.role,

          tenantId:
            superAdmin.tenantId
        }
      });

    } catch (createErr) {

      /*
        If tenant creation succeeded but
        Super Admin creation failed, remove
        the new tenant so we do not leave
        an orphan tenant.
      */

      if (tenant?._id) {
        await Tenant.deleteOne({
          _id: tenant._id
        }).catch(() => {});
      }

      throw createErr;
    }

  } catch (err) {

    console.error(
      "CREATE TENANT ERROR:",
      err
    );

    if (err?.code === 11000) {
      return res.status(409).json({
        message: "Duplicate tenant or username"
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

      const admin =
        await User.findOne({
          _id:
            req.params.userId,

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


module.exports = router;