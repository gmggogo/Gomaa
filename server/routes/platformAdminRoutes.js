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

module.exports = router;