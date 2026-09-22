const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Tenant = require("../models/Tenant");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================================
   HELPERS
========================================= */

function clean(value){
  return String(value ?? "").trim();
}

function normalizeRole(value){
  return clean(value);
}

async function findRequestedTenant({
  tenantId,
  tenantSlug
}){

  const cleanTenantId =
    clean(tenantId);

  const cleanTenantSlug =
    clean(tenantSlug)
      .toLowerCase();

  if(cleanTenantId){

    const tenant =
      await Tenant.findById(
        cleanTenantId
      );

    return tenant || null;
  }

  if(cleanTenantSlug){

    const tenant =
      await Tenant.findOne({
        slug:cleanTenantSlug
      });

    return tenant || null;
  }

  return null;
}

function tenantIsInactive(tenant){

  if(!tenant){
    return true;
  }

  if(tenant.enabled === false){
    return true;
  }

  const status =
    clean(
      tenant.subscriptionStatus
    )
    .toUpperCase();

  return (
    status === "SUSPENDED" ||
    status === "CANCELED"
  );
}

/* =========================================
   LOGIN
========================================= */

router.post(
  "/login",
  async (req,res)=>{

  try{

    const {
      username,
      password,
      tenantId,
      tenantSlug
    } = req.body || {};

    const cleanUsername =
      clean(username);

    const cleanPassword =
      String(password ?? "");

    if(
      !cleanUsername ||
      !cleanPassword
    ){

      return res.status(400).json({
        message:
          "Username and password are required"
      });
    }

    /*
      PLATFORM_ADMIN remains global.

      Normal tenant users are isolated by tenantId.
      If tenantId / tenantSlug is supplied, login is
      resolved inside that tenant only.

      If it is not supplied, we allow login only when
      the username resolves unambiguously to one account.
    */

    const requestedTenant =
      await findRequestedTenant({
        tenantId,
        tenantSlug
      });

    if(
      (tenantId || tenantSlug) &&
      !requestedTenant
    ){

      return res.status(403).json({
        message:
          "Organization not found"
      });
    }

    let candidates = [];

    if(requestedTenant){

      candidates =
        await User.find({
          username:cleanUsername,
          tenantId:requestedTenant._id
        });

    }else{

      candidates =
        await User.find({
          username:cleanUsername
        });
    }

    if(!candidates.length){

      return res.status(400).json({
        message:"Invalid credentials"
      });
    }

    /*
      Compare passwords for matching username rows.
      This allows tenant-scoped usernames without
      exposing which tenant owns an account.
    */

    const validUsers = [];

    for(const candidate of candidates){

      try{

        const valid =
          await bcrypt.compare(
            cleanPassword,
            candidate.password
          );

        if(valid){
          validUsers.push(candidate);
        }

      }catch(err){
        // Ignore malformed legacy password rows.
      }
    }

    if(!validUsers.length){

      return res.status(400).json({
        message:"Invalid credentials"
      });
    }

    /*
      If more than one account matches the same
      username + password and no organization was
      supplied, login is ambiguous and must stop.
    */

    if(
      !requestedTenant &&
      validUsers.length > 1
    ){

      return res.status(409).json({
        message:
          "Organization is required for this username"
      });
    }

    const user =
      validUsers[0];

    const role =
      normalizeRole(
        user.role
      );

    if(
      user.enabled === false ||
      user.active === false
    ){

      return res.status(403).json({
        message:"Account Disabled"
      });
    }

    /* =========================================
       TENANT CHECK
       PLATFORM_ADMIN DOES NOT REQUIRE TENANT
    ========================================= */

    let tenant = null;

    if(role !== "PLATFORM_ADMIN"){

      /*
        STRICT MULTI-TENANT RULE:
        Every non-platform account MUST belong
        to a tenant. Old unassigned users are
        no longer allowed to login.
      */

      if(!user.tenantId){

        return res.status(403).json({
          message:
            "Account is not assigned to an organization"
        });
      }

      tenant =
        await Tenant.findById(
          user.tenantId
        );

      if(!tenant){

        return res.status(403).json({
          message:
            "Organization not found"
        });
      }

      if(tenant.enabled === false){

        return res.status(403).json({
          message:
            "Organization Disabled"
        });
      }

      const subscriptionStatus =
        clean(
          tenant.subscriptionStatus
        )
        .toUpperCase();

      if(
        subscriptionStatus ===
          "SUSPENDED" ||
        subscriptionStatus ===
          "CANCELED"
      ){

        return res.status(403).json({
          message:
            "Organization subscription inactive"
        });
      }

      /*
        If caller supplied an organization,
        ensure the account belongs to it.
      */

      if(
        requestedTenant &&
        String(user.tenantId) !==
        String(requestedTenant._id)
      ){

        return res.status(403).json({
          message:
            "Account does not belong to this organization"
        });
      }
    }

    /* =========================================
       JWT
    ========================================= */

    const token =
      jwt.sign(
        {
          id:
            String(user._id),

          role,

          name:
            user.name || "",

          username:
            user.username || "",

          tenantId:
            user.tenantId
              ? String(user.tenantId)
              : null
        },
        JWT_SECRET,
        {
          expiresIn:"1d"
        }
      );

    /* =========================================
       COOKIE
    ========================================= */

    res.cookie(
      "token",
      token,
      {
        httpOnly:true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite:
          process.env.NODE_ENV ===
          "production"
            ? "None"
            : "Lax",
        maxAge:
          24 * 60 * 60 * 1000
      }
    );

    /* =========================================
       RESPONSE

       Keeps both shapes:
       - data.user.role used by staff-login.js
       - top-level role for older pages
    ========================================= */

    return res.json({

      message:
        "Login success",

      token,

      role,

      tenantId:
        user.tenantId || null,

      user:{
        id:
          user._id,

        name:
          user.name || "",

        username:
          user.username || "",

        email:
          user.email || "",

        phone:
          user.phone || "",

        role,

        tenantId:
          user.tenantId || null
      },

      tenant:
        tenant
          ? {
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
                tenant.timezone || ""
            }
          : null

    });

  }catch(err){

    console.error(
      "LOGIN ERROR:",
      err
    );

    return res.status(500).json({
      message:"Server error"
    });
  }
});

/* =========================================
   LOGOUT
========================================= */

router.post(
  "/logout",
  (req,res)=>{

    res.clearCookie(
      "token",
      {
        httpOnly:true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite:
          process.env.NODE_ENV ===
          "production"
            ? "None"
            : "Lax"
      }
    );

    return res.json({
      message:"Logged out"
    });

  }
);

module.exports = router;