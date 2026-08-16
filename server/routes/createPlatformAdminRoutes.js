const express = require("express");
const bcrypt = require("bcryptjs");

const router = express.Router();

const User = require("../models/User");

/* =========================================
   TEMPORARY PLATFORM ADMIN SETUP

   SECURITY:
   - Requires PLATFORM_SETUP_KEY from .env
   - Works only if no PLATFORM_ADMIN exists
   - Remove this route after first account is created
========================================= */

router.post(
  "/platform-admin",
  async (req, res) => {

    try {

      const setupKey =
        String(
          req.headers["x-setup-key"] || ""
        ).trim();

      const expectedKey =
        String(
          process.env.PLATFORM_SETUP_KEY || ""
        ).trim();

      if (!expectedKey) {
        return res.status(503).json({
          message:
            "PLATFORM_SETUP_KEY is not configured"
        });
      }

      if (
        !setupKey ||
        setupKey !== expectedKey
      ) {
        return res.status(403).json({
          message: "Invalid setup key"
        });
      }

      const existing =
        await User.findOne({
          role: "PLATFORM_ADMIN"
        });

      if (existing) {
        return res.status(409).json({
          message:
            "Platform Admin already exists"
        });
      }

      const {
        name,
        username,
        password
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

      const cleanUsername =
        String(username).trim();

      const usernameExists =
        await User.findOne({
          username: cleanUsername
        });

      if (usernameExists) {
        return res.status(409).json({
          message: "Username already exists"
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

      const hashedPassword =
        await bcrypt.hash(
          String(password),
          10
        );

      const platformAdmin =
        await User.create({
          name:
            String(name).trim(),

          username:
            cleanUsername,

          password:
            hashedPassword,

          role:
            "PLATFORM_ADMIN",

          tenantId:
            null,

          active:
            true,

          enabled:
            true
        });

      return res.status(201).json({
        message:
          "Platform Admin created successfully",

        user: {
          id:
            platformAdmin._id,

          name:
            platformAdmin.name,

          username:
            platformAdmin.username,

          role:
            platformAdmin.role,

          tenantId:
            null
        }
      });

    } catch (err) {

      console.error(
        "CREATE PLATFORM ADMIN ERROR:",
        err
      );

      if (err?.code === 11000) {
        return res.status(409).json({
          message: "Username already exists"
        });
      }

      return res.status(500).json({
        message: "Server error"
      });

    }

  }
);

module.exports = router;