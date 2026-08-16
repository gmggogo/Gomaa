const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Tenant = require("../models/Tenant");

/* =========================================
   LOGIN
========================================= */

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    if (!user.enabled) {
      return res.status(403).json({
        message: "Account Disabled"
      });
    }

    const validPass = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPass) {
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    /* =========================================
       TENANT CHECK
       PLATFORM_ADMIN DOES NOT REQUIRE TENANT
    ========================================= */

    let tenant = null;

    if (user.role !== "PLATFORM_ADMIN") {

      /*
        TEMPORARY COMPATIBILITY:
        Old users may not have tenantId yet.
        We do not block them during migration.
      */

      if (user.tenantId) {
        tenant = await Tenant.findById(user.tenantId);

        if (!tenant) {
          return res.status(403).json({
            message: "Organization not found"
          });
        }

        if (!tenant.enabled) {
          return res.status(403).json({
            message: "Organization Disabled"
          });
        }

        if (
          tenant.subscriptionStatus === "SUSPENDED" ||
          tenant.subscriptionStatus === "CANCELED"
        ) {
          return res.status(403).json({
            message: "Organization subscription inactive"
          });
        }
      }
    }

    /* =========================================
       JWT
    ========================================= */

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        tenantId: user.tenantId
          ? user.tenantId.toString()
          : null
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d"
      }
    );

    /* =========================================
       COOKIE
    ========================================= */

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "None"
    });

    /* =========================================
       RESPONSE
    ========================================= */

    res.json({
      message: "Login success",
      role: user.role,
      tenantId: user.tenantId || null,
      tenant: tenant
        ? {
            id: tenant._id,
            name: tenant.name,
            slug: tenant.slug,
            subscriptionStatus:
              tenant.subscriptionStatus
          }
        : null
    });

  } catch (err) {

    console.error("LOGIN ERROR:", err);

    res.status(500).json({
      message: "Server error"
    });
  }
});

/* =========================================
   LOGOUT
========================================= */

router.post("/logout", (req, res) => {

  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "None"
  });

  res.json({
    message: "Logged out"
  });

});

module.exports = router;