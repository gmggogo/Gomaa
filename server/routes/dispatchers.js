const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const filePath = path.join(
  __dirname,
  "..",
  "data",
  "dispatchers.json"
);

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
   FILE HELPERS
========================= */

function readData(){

  try{

    if(!fs.existsSync(filePath)){
      return [];
    }

    const raw =
      fs.readFileSync(
        filePath,
        "utf8"
      );

    const data =
      JSON.parse(raw || "[]");

    return Array.isArray(data)
      ? data
      : [];

  }catch(err){

    console.log(
      "DISPATCHERS READ ERROR:",
      err
    );

    return [];
  }
}

function saveData(data){

  const dir =
    path.dirname(filePath);

  if(!fs.existsSync(dir)){
    fs.mkdirSync(
      dir,
      { recursive:true }
    );
  }

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      data,
      null,
      2
    )
  );
}

/* =========================
   TENANT AUTH
========================= */

function readBearerToken(req){

  const header =
    String(
      req.headers?.authorization ||
      ""
    ).trim();

  if(
    !header
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return header
    .slice(7)
    .trim();
}

function requireTenantApi(
  req,
  res,
  next
){

  const token =
    readBearerToken(req);

  if(!token){

    return res.status(401).json({
      message:"Access Denied"
    });
  }

  try{

    const verified =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.authUser = {
      id:
        verified.id || null,

      role:
        verified.role || "",

      tenantId:
        verified.tenantId || null
    };

    if(
      req.authUser.role ===
      "PLATFORM_ADMIN"
    ){
      return next();
    }

    if(!req.authUser.tenantId){

      return res.status(403).json({
        message:"Tenant Required"
      });
    }

    next();

  }catch(err){

    return res.status(401).json({
      message:"Invalid Token"
    });
  }
}

function sameTenant(
  rowTenantId,
  requestTenantId
){

  return (
    String(rowTenantId || "") ===
    String(requestTenantId || "")
  );
}

/* =========================
   GET DISPATCHERS
========================= */

router.get(
  "/",
  requireTenantApi,
  (req,res)=>{

    const users =
      readData();

    if(
      req.authUser.role ===
      "PLATFORM_ADMIN"
    ){

      return res.json(
        users
      );
    }

    const filtered =
      users.filter(user=>
        sameTenant(
          user.tenantId,
          req.authUser.tenantId
        )
      );

    return res.json(
      filtered
    );
  }
);

/* =========================
   CREATE DISPATCHER
========================= */

router.post(
  "/",
  requireTenantApi,
  (req,res)=>{

    const users =
      readData();

    const {
      name,
      username,
      password
    } = req.body || {};

    if(
      !name ||
      !username ||
      !password
    ){

      return res.status(400).json({
        error:"Missing fields"
      });
    }

    const tenantId =
      req.authUser.role ===
      "PLATFORM_ADMIN"
        ? (
            req.body?.tenantId ||
            null
          )
        : req.authUser.tenantId;

    if(!tenantId){

      return res.status(403).json({
        error:"Tenant Required"
      });
    }

    const duplicate =
      users.find(user=>
        sameTenant(
          user.tenantId,
          tenantId
        ) &&
        String(
          user.username || ""
        )
        .trim()
        .toLowerCase() ===
        String(username)
        .trim()
        .toLowerCase()
      );

    if(duplicate){

      return res.status(400).json({
        error:
          "Username already exists"
      });
    }

    const newUser = {

      id:
        Date.now(),

      tenantId:
        String(tenantId),

      name:
        String(name).trim(),

      username:
        String(username).trim(),

      password,

      active:true,

      createdAt:
        new Date().toISOString()
    };

    users.push(
      newUser
    );

    saveData(
      users
    );

    return res.status(201).json(
      newUser
    );
  }
);

/* =========================
   DELETE DISPATCHER
========================= */

router.delete(
  "/:id",
  requireTenantApi,
  (req,res)=>{

    const users =
      readData();

    const target =
      users.find(user=>
        String(user.id) ===
        String(req.params.id)
      );

    if(!target){

      return res.status(404).json({
        error:"Dispatcher not found"
      });
    }

    if(
      req.authUser.role !==
      "PLATFORM_ADMIN" &&
      !sameTenant(
        target.tenantId,
        req.authUser.tenantId
      )
    ){

      return res.status(404).json({
        error:"Dispatcher not found"
      });
    }

    const nextUsers =
      users.filter(user=>
        String(user.id) !==
        String(req.params.id)
      );

    saveData(
      nextUsers
    );

    return res.json({
      success:true
    });
  }
);

module.exports = router;