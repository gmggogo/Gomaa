"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const User = require("../models/User");

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function clean(value){
  return String(value ?? "").trim();
}

function bearerToken(req){
  const auth =
    clean(
      req.headers.authorization
    );

  if(
    !auth
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return auth
    .slice(7)
    .trim();
}

async function ensurePrimaryPlatformAdmin(){

  let primary =
    await User.findOne({
      role:"PLATFORM_ADMIN",
      isPrimaryPlatformAdmin:true
    })
    .sort({
      createdAt:1,
      _id:1
    });

  if(primary){
    return primary;
  }

  const original =
    await User.findOne({
      role:"PLATFORM_ADMIN"
    })
    .sort({
      createdAt:1,
      _id:1
    });

  if(!original){
    return null;
  }

  original.isPrimaryPlatformAdmin =
    true;

  await original.save();

  return original;
}

async function requirePlatformAdmin(
  req,
  res,
  next
){

  const token =
    bearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    if(
      clean(decoded.role)
        .toUpperCase() !==
      "PLATFORM_ADMIN"
    ){
      return res.status(403).json({
        success:false,
        message:"Platform Admin only"
      });
    }

    const user =
      await User.findOne({
        _id:decoded.id,
        role:"PLATFORM_ADMIN"
      });

    if(
      !user ||
      user.enabled === false ||
      user.active === false
    ){
      return res.status(403).json({
        success:false,
        message:"Platform Admin unavailable"
      });
    }

    req.authUser = decoded;
    req.platformAdmin = user;

    return next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

async function requirePrimaryPlatformAdmin(
  req,
  res,
  next
){

  try{

    const primary =
      await ensurePrimaryPlatformAdmin();

    if(
      !primary ||
      String(primary._id) !==
      String(req.platformAdmin?._id)
    ){
      return res.status(403).json({
        success:false,
        message:"Primary Platform Admin only"
      });
    }

    req.primaryPlatformAdmin =
      primary;

    return next();

  }catch(err){

    console.error(
      "PRIMARY PLATFORM ADMIN CHECK ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Unable to verify Primary Platform Admin"
    });
  }
}

function publicAdmin(user){

  return {
    id:
      String(user?._id || ""),
    name:
      clean(user?.name),
    username:
      clean(user?.username),
    email:
      clean(user?.email),
    role:
      clean(user?.role),
    isPrimaryPlatformAdmin:
      user?.isPrimaryPlatformAdmin === true,
    active:
      user?.active !== false,
    enabled:
      user?.enabled !== false,
    createdAt:
      user?.createdAt || null,
    updatedAt:
      user?.updatedAt || null
  };
}

router.use(
  requirePlatformAdmin
);

router.get(
  "/me",
  async (req,res)=>{

    try{

      const primary =
        await ensurePrimaryPlatformAdmin();

      const isPrimary =
        !!primary &&
        String(primary._id) ===
        String(req.platformAdmin._id);

      return res.json({
        success:true,
        isPrimaryPlatformAdmin:
          isPrimary,
        user:
          publicAdmin(
            req.platformAdmin
          )
      });

    }catch(err){

      console.error(
        "PLATFORM ADMIN ME ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          "Unable to load Platform Admin access"
      });
    }
  }
);

router.get(
  "/",
  requirePrimaryPlatformAdmin,
  async (req,res)=>{

    try{

      const users =
        await User.find({
          role:"PLATFORM_ADMIN"
        })
        .sort({
          isPrimaryPlatformAdmin:-1,
          createdAt:1,
          name:1
        })
        .lean();

      return res.json({
        success:true,
        platformAdmins:
          users.map(
            publicAdmin
          )
      });

    }catch(err){

      console.error(
        "LOAD PLATFORM ADMINS ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          "Unable to load Platform Admins"
      });
    }
  }
);

router.post(
  "/",
  requirePrimaryPlatformAdmin,
  async (req,res)=>{

    try{

      const name =
        clean(req.body?.name);

      const username =
        clean(req.body?.username);

      const email =
        clean(req.body?.email);

      const password =
        String(
          req.body?.password ||
          ""
        );

      if(
        !name ||
        !username ||
        !password
      ){
        return res.status(400).json({
          success:false,
          message:
            "Name, username, and password are required"
        });
      }

      if(password.length < 8){
        return res.status(400).json({
          success:false,
          message:
            "Password must be at least 8 characters"
        });
      }

      const exists =
        await User.findOne({
          username
        })
        .lean();

      if(exists){
        return res.status(409).json({
          success:false,
          message:"Username already exists"
        });
      }

      const hashedPassword =
        await bcrypt.hash(
          password,
          10
        );

      const user =
        await User.create({
          name,
          username,
          email,
          password:
            hashedPassword,
          role:
            "PLATFORM_ADMIN",
          tenantId:
            null,
          active:
            true,
          enabled:
            true,
          isPrimaryPlatformAdmin:
            false
        });

      return res.status(201).json({
        success:true,
        message:
          "Platform Admin created successfully",
        user:
          publicAdmin(user)
      });

    }catch(err){

      console.error(
        "CREATE PLATFORM ADMIN ERROR:",
        err
      );

      if(err?.code === 11000){
        return res.status(409).json({
          success:false,
          message:"Username already exists"
        });
      }

      return res.status(500).json({
        success:false,
        message:
          err?.message ||
          "Unable to create Platform Admin"
      });
    }
  }
);

router.patch(
  "/:id/toggle",
  requirePrimaryPlatformAdmin,
  async (req,res)=>{

    try{

      const target =
        await User.findOne({
          _id:req.params.id,
          role:"PLATFORM_ADMIN"
        });

      if(!target){
        return res.status(404).json({
          success:false,
          message:
            "Platform Admin not found"
        });
      }

      if(
        target.isPrimaryPlatformAdmin ===
        true
      ){
        return res.status(403).json({
          success:false,
          message:
            "Primary Platform Admin cannot be disabled"
        });
      }

      const enabled =
        target.enabled === false;

      target.enabled =
        enabled;

      target.active =
        enabled;

      await target.save();

      return res.json({
        success:true,
        message:
          enabled
            ? "Platform Admin enabled"
            : "Platform Admin disabled",
        user:
          publicAdmin(target)
      });

    }catch(err){

      console.error(
        "TOGGLE PLATFORM ADMIN ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          "Unable to update Platform Admin"
      });
    }
  }
);

router.delete(
  "/:id",
  requirePrimaryPlatformAdmin,
  async (req,res)=>{

    try{

      const target =
        await User.findOne({
          _id:req.params.id,
          role:"PLATFORM_ADMIN"
        });

      if(!target){
        return res.status(404).json({
          success:false,
          message:
            "Platform Admin not found"
        });
      }

      if(
        target.isPrimaryPlatformAdmin ===
        true
      ){
        return res.status(403).json({
          success:false,
          message:
            "Primary Platform Admin cannot be deleted"
        });
      }

      await User.deleteOne({
        _id:target._id,
        role:"PLATFORM_ADMIN",
        isPrimaryPlatformAdmin:{
          $ne:true
        }
      });

      return res.json({
        success:true,
        message:
          "Platform Admin deleted"
      });

    }catch(err){

      console.error(
        "DELETE PLATFORM ADMIN ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          "Unable to delete Platform Admin"
      });
    }
  }
);

module.exports = router;
