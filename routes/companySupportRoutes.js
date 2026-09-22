"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();

const Conversation =
require("../models/CompanySupportConversation");

const Message =
require("../models/CompanySupportMessage");

const Tenant =
mongoose.models.Tenant ||
require("../models/Tenant");

const User =
global.User ||
mongoose.models.User ||
require("../models/User");

const JWT_SECRET =
process.env.JWT_SECRET ||
"dev_secret";

function clean(value){
  return String(
    value ?? ""
  ).trim();
}

function upper(value){
  return clean(value)
    .toUpperCase();
}

function normalizeRole(value){
  const role =
    upper(value)
      .replace(/[\s-]+/g,"_");

  if(role === "SUPERADMIN"){
    return "SUPER_ADMIN";
  }

  return role;
}

function bearer(req){
  const header =
    clean(
      req.headers?.authorization
    );

  if(
    !header
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return header.slice(7).trim();
}

function requireAuth(
  req,
  res,
  next
){
  const token =
    bearer(req);

  if(!token){
    return res.status(401).json({
      success:false,
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
        clean(
          verified.id ||
          verified._id
        ),

      name:
        clean(
          verified.name ||
          verified.fullName ||
          verified.username
        ),

      username:
        clean(
          verified.username
        ),

      role:
        normalizeRole(
          verified.role
        ),

      tenantId:
        clean(
          verified.tenantId
        ),

      facilityId:
        clean(
          verified.facilityId ||
          verified.companyId
        )
    };

    if(
      !req.authUser.tenantId
    ){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    next();

  }catch(err){
    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

function isCompany(req){
  return (
    normalizeRole(
      req.authUser?.role
    ) ===
    "COMPANY"
  );
}

function isSuperAdmin(req){
  return (
    normalizeRole(
      req.authUser?.role
    ) ===
    "SUPER_ADMIN"
  );
}

async function currentUser(req){
  const id =
    clean(
      req.authUser?.id
    );

  if(
    !id ||
    !mongoose.Types.ObjectId
      .isValid(id)
  ){
    return null;
  }

  return await User
    .findOne({
      _id:id,
      tenantId:
        req.authUser.tenantId
    })
    .lean();
}

function pickCompanyName(user,req){
  return clean(
    user?.facilityName ||
    user?.organizationName ||
    user?.companyName ||
    user?.company ||
    user?.businessName ||
    user?.name ||
    user?.fullName ||
    req.authUser?.name ||
    req.authUser?.username ||
    "Company"
  );
}

function pickPhone(user){
  return clean(
    user?.companyPhone ||
    user?.businessPhone ||
    user?.phone ||
    user?.phoneNumber ||
    user?.mobile ||
    user?.cellPhone ||
    user?.contactPhone
  );
}

function pickUserName(user,req){
  return clean(
    user?.fullName ||
    user?.name ||
    user?.displayName ||
    user?.username ||
    req.authUser?.name ||
    req.authUser?.username ||
    "Company User"
  );
}

async function companyIdentity(req){
  const user =
    await currentUser(req);

  const facilityId =
    clean(
      user?.facilityId ||
      user?.companyId ||
      req.authUser?.facilityId ||
      user?._id ||
      req.authUser?.id
    );

  const companyUserId =
    clean(
      user?._id ||
      req.authUser?.id
    );

  const companyKey =
    facilityId ||
    companyUserId;

  return {
    tenantId:
      req.authUser.tenantId,

    companyKey,

    companyUserId,

    facilityId,

    companyName:
      pickCompanyName(
        user,
        req
      ),

    companyPhone:
      pickPhone(user),

    userName:
      pickUserName(
        user,
        req
      ),

    userPhone:
      pickPhone(user),

    userRole:"COMPANY"
  };
}

async function superAdminIdentity(req){
  const user =
    await currentUser(req);

  return {
    userId:
      clean(
        user?._id ||
        req.authUser?.id
      ),

    userName:
      clean(
        user?.fullName ||
        user?.name ||
        user?.displayName ||
        user?.username ||
        req.authUser?.name ||
        req.authUser?.username ||
        "Super Admin"
      ),

    userPhone:
      pickPhone(user),

    userRole:"SUPER_ADMIN"
  };
}

function scopeFilter(scope){
  const value =
    clean(scope)
      .toLowerCase();

  if(value === "history"){
    return {
      status:"RESOLVED"
    };
  }

  if(value === "active"){
    return {
      status:{
        $ne:"RESOLVED"
      }
    };
  }

  return {};
}

function validId(value){
  return mongoose.Types.ObjectId
    .isValid(
      clean(value)
    );
}

async function findAccessibleConversation(
  req,
  conversationId
){
  if(!validId(conversationId)){
    return null;
  }

  if(isSuperAdmin(req)){
    return await Conversation
      .findOne({
        _id:conversationId,
        tenantId:
          req.authUser.tenantId
      });
  }

  if(isCompany(req)){
    const identity =
      await companyIdentity(req);

    return await Conversation
      .findOne({
        _id:conversationId,
        tenantId:
          req.authUser.tenantId,
        companyKey:
          identity.companyKey
      });
  }

  return null;
}

/* =========================
   COMPANY IDENTITY
========================= */

router.get(
  "/company/me",
  requireAuth,
  async (req,res)=>{
    try{
      if(!isCompany(req)){
        return res.status(403).json({
          success:false,
          message:"Company account required"
        });
      }

      const identity =
        await companyIdentity(req);

      res.json({
        success:true,
        identity
      });

    }catch(err){
      console.error(
        "COMPANY SUPPORT ME:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not load company identity"
      });
    }
  }
);

/* =========================
   COMPANY LIST
========================= */

router.get(
  "/company/conversations",
  requireAuth,
  async (req,res)=>{
    try{
      if(!isCompany(req)){
        return res.status(403).json({
          success:false,
          message:"Company account required"
        });
      }

      const identity =
        await companyIdentity(req);

      const rows =
        await Conversation
          .find({
            tenantId:
              req.authUser.tenantId,
            companyKey:
              identity.companyKey,
            ...scopeFilter(
              req.query?.scope
            )
          })
          .sort({
            lastMessageAt:-1
          })
          .lean();

      res.json({
        success:true,
        conversations:rows
      });

    }catch(err){
      console.error(
        "COMPANY SUPPORT LIST:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not load support conversations"
      });
    }
  }
);

/* =========================
   COMPANY CREATE
========================= */

router.post(
  "/company/conversations",
  requireAuth,
  async (req,res)=>{
    try{
      if(!isCompany(req)){
        return res.status(403).json({
          success:false,
          message:"Company account required"
        });
      }

      const subject =
        clean(
          req.body?.subject
        );

      const message =
        clean(
          req.body?.message
        );

      if(!subject){
        return res.status(400).json({
          success:false,
          message:"Subject is required"
        });
      }

      if(!message){
        return res.status(400).json({
          success:false,
          message:"Describe your issue"
        });
      }

      const identity =
        await companyIdentity(req);

      if(!identity.companyKey){
        return res.status(400).json({
          success:false,
          message:"Company identity unavailable"
        });
      }

      const conversation =
        await Conversation.create({
          tenantId:
            req.authUser.tenantId,

          companyKey:
            identity.companyKey,

          companyUserId:
            identity.companyUserId,

          facilityId:
            identity.facilityId,

          companyName:
            identity.companyName,

          companyPhone:
            identity.companyPhone,

          subject,

          status:
            "WAITING_FOR_SUPPORT",

          createdByUserId:
            identity.companyUserId,

          createdByName:
            identity.userName,

          createdByRole:
            identity.userRole,

          createdByPhone:
            identity.userPhone,

          lastMessageAt:
            new Date(),

          lastMessagePreview:
            message.slice(
              0,
              500
            ),

          companyUnreadCount:0,
          superAdminUnreadCount:1
        });

      await Message.create({
        conversationId:
          conversation._id,

        tenantId:
          req.authUser.tenantId,

        companyKey:
          identity.companyKey,

        senderType:
          "COMPANY",

        senderUserId:
          identity.companyUserId,

        senderName:
          identity.userName,

        senderRole:
          identity.userRole,

        senderPhone:
          identity.userPhone,

        message
      });

      res.status(201).json({
        success:true,
        conversation
      });

    }catch(err){
      console.error(
        "COMPANY SUPPORT CREATE:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not create support conversation"
      });
    }
  }
);

/* =========================
   READ CONVERSATION
========================= */

router.get(
  "/conversations/:conversationId",
  requireAuth,
  async (req,res)=>{
    try{
      if(
        !isCompany(req) &&
        !isSuperAdmin(req)
      ){
        return res.status(403).json({
          success:false,
          message:"Support access denied"
        });
      }

      const conversation =
        await findAccessibleConversation(
          req,
          req.params.conversationId
        );

      if(!conversation){
        return res.status(404).json({
          success:false,
          message:"Conversation not found"
        });
      }

      const messages =
        await Message
          .find({
            conversationId:
              conversation._id,
            tenantId:
              req.authUser.tenantId
          })
          .sort({
            createdAt:1
          })
          .lean();

      const now =
        new Date();

      if(isCompany(req)){
        await Promise.all([
          Message.updateMany(
            {
              conversationId:
                conversation._id,
              senderType:
                "SUPER_ADMIN",
              readByCompanyAt:null
            },
            {
              $set:{
                readByCompanyAt:now
              }
            }
          ),

          Conversation.updateOne(
            {
              _id:
                conversation._id
            },
            {
              $set:{
                companyUnreadCount:0
              }
            }
          )
        ]);
      }else{
        await Promise.all([
          Message.updateMany(
            {
              conversationId:
                conversation._id,
              senderType:
                "COMPANY",
              readBySuperAdminAt:null
            },
            {
              $set:{
                readBySuperAdminAt:now
              }
            }
          ),

          Conversation.updateOne(
            {
              _id:
                conversation._id
            },
            {
              $set:{
                superAdminUnreadCount:0
              }
            }
          )
        ]);
      }

      const freshConversation =
        await Conversation
          .findById(
            conversation._id
          )
          .lean();

      res.json({
        success:true,
        conversation:
          freshConversation,
        messages
      });

    }catch(err){
      console.error(
        "COMPANY SUPPORT READ:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not load support conversation"
      });
    }
  }
);

/* =========================
   SEND MESSAGE
========================= */

router.post(
  "/conversations/:conversationId/messages",
  requireAuth,
  async (req,res)=>{
    try{
      if(
        !isCompany(req) &&
        !isSuperAdmin(req)
      ){
        return res.status(403).json({
          success:false,
          message:"Support access denied"
        });
      }

      const message =
        clean(
          req.body?.message
        );

      if(!message){
        return res.status(400).json({
          success:false,
          message:"Message is required"
        });
      }

      const conversation =
        await findAccessibleConversation(
          req,
          req.params.conversationId
        );

      if(!conversation){
        return res.status(404).json({
          success:false,
          message:"Conversation not found"
        });
      }

      const senderType =
        isCompany(req)
          ? "COMPANY"
          : "SUPER_ADMIN";

      let identity;

      if(senderType === "COMPANY"){
        identity =
          await companyIdentity(req);
      }else{
        identity =
          await superAdminIdentity(req);
      }

      const senderUserId =
        clean(
          identity.companyUserId ||
          identity.userId
        );

      const senderName =
        clean(
          identity.userName
        );

      const senderPhone =
        clean(
          identity.userPhone
        );

      const senderRole =
        senderType;

      const created =
        await Message.create({
          conversationId:
            conversation._id,

          tenantId:
            req.authUser.tenantId,

          companyKey:
            conversation.companyKey,

          senderType,

          senderUserId,

          senderName,

          senderRole,

          senderPhone,

          message
        });

      const update = {
        lastMessageAt:
          created.createdAt,

        lastMessagePreview:
          message.slice(
            0,
            500
          )
      };

      if(senderType === "COMPANY"){
        update.status =
          "WAITING_FOR_SUPPORT";

        update.superAdminUnreadCount =
          Number(
            conversation.superAdminUnreadCount ||
            0
          ) + 1;

      }else{
        update.status =
          "WAITING_FOR_CUSTOMER";

        update.companyUnreadCount =
          Number(
            conversation.companyUnreadCount ||
            0
          ) + 1;
      }

      if(
        conversation.status ===
        "RESOLVED"
      ){
        update.resolvedAt = null;
        update.resolvedByUserId = "";
        update.resolvedByName = "";
        update.resolvedByRole = "";
      }

      await Conversation.updateOne(
        {
          _id:
            conversation._id
        },
        {
          $set:update
        }
      );

      res.status(201).json({
        success:true,
        message:created
      });

    }catch(err){
      console.error(
        "COMPANY SUPPORT SEND:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not send support message"
      });
    }
  }
);

/* =========================
   SUPER ADMIN LIST
========================= */

router.get(
  "/super-admin/conversations",
  requireAuth,
  async (req,res)=>{
    try{
      if(!isSuperAdmin(req)){
        return res.status(403).json({
          success:false,
          message:"Super Admin required"
        });
      }

      const filter = {
        tenantId:
          req.authUser.tenantId,
        ...scopeFilter(
          req.query?.scope
        )
      };

      const requestedStatus =
        upper(
          req.query?.status
        );

      if(
        [
          "OPEN",
          "WAITING_FOR_SUPPORT",
          "WAITING_FOR_CUSTOMER",
          "RESOLVED"
        ].includes(
          requestedStatus
        )
      ){
        filter.status =
          requestedStatus;
      }

      const rows =
        await Conversation
          .find(
            filter
          )
          .sort(
            requestedStatus === "RESOLVED" ||
            clean(req.query?.scope).toLowerCase() === "history"
              ? {
                  resolvedAt:-1,
                  lastMessageAt:-1
                }
              : {
                  lastMessageAt:-1
                }
          )
          .lean();

      res.json({
        success:true,
        conversations:rows
      });

    }catch(err){
      console.error(
        "COMPANY SUPPORT SUPER LIST:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not load company support inbox"
      });
    }
  }
);

/* =========================
   SUPER ADMIN STATUS
========================= */

router.patch(
  "/super-admin/conversations/:conversationId/status",
  requireAuth,
  async (req,res)=>{
    try{
      if(!isSuperAdmin(req)){
        return res.status(403).json({
          success:false,
          message:"Super Admin required"
        });
      }

      const status =
        upper(
          req.body?.status
        );

      if(
        ![
          "OPEN",
          "WAITING_FOR_SUPPORT",
          "WAITING_FOR_CUSTOMER",
          "RESOLVED"
        ].includes(status)
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid support status"
        });
      }

      if(
        !validId(
          req.params.conversationId
        )
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid conversation id"
        });
      }

      const identity =
        await superAdminIdentity(
          req
        );

      const update = {
        status
      };

      if(status === "RESOLVED"){
        update.resolvedAt =
          new Date();

        update.resolvedByUserId =
          identity.userId;

        update.resolvedByName =
          identity.userName;

        update.resolvedByRole =
          identity.userRole;

        update.companyUnreadCount = 0;
        update.superAdminUnreadCount = 0;

      }else{
        update.resolvedAt = null;
        update.resolvedByUserId = "";
        update.resolvedByName = "";
        update.resolvedByRole = "";
      }

      const conversation =
        await Conversation
          .findOneAndUpdate(
            {
              _id:
                req.params.conversationId,
              tenantId:
                req.authUser.tenantId
            },
            {
              $set:update
            },
            {
              new:true
            }
          )
          .lean();

      if(!conversation){
        return res.status(404).json({
          success:false,
          message:"Conversation not found"
        });
      }

      res.json({
        success:true,
        conversation
      });

    }catch(err){
      console.error(
        "COMPANY SUPPORT SUPER STATUS:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not update support status"
      });
    }
  }
);

/* =========================
   UNREAD COUNT
========================= */

router.get(
  "/unread-count",
  requireAuth,
  async (req,res)=>{
    try{
      if(isCompany(req)){
        const identity =
          await companyIdentity(
            req
          );

        const rows =
          await Conversation
            .find({
              tenantId:
                req.authUser.tenantId,
              companyKey:
                identity.companyKey,
              status:{
                $ne:"RESOLVED"
              },
              companyUnreadCount:{
                $gt:0
              }
            })
            .select({
              companyUnreadCount:1
            })
            .lean();

        const count =
          rows.reduce(
            (
              total,
              row
            ) =>
              total +
              Number(
                row.companyUnreadCount ||
                0
              ),
            0
          );

        return res.json({
          success:true,
          count
        });
      }

      if(isSuperAdmin(req)){
        const rows =
          await Conversation
            .find({
              tenantId:
                req.authUser.tenantId,
              status:{
                $ne:"RESOLVED"
              },
              superAdminUnreadCount:{
                $gt:0
              }
            })
            .select({
              superAdminUnreadCount:1
            })
            .lean();

        const count =
          rows.reduce(
            (
              total,
              row
            ) =>
              total +
              Number(
                row.superAdminUnreadCount ||
                0
              ),
            0
          );

        return res.json({
          success:true,
          count
        });
      }

      return res.status(403).json({
        success:false,
        message:"Support access denied"
      });

    }catch(err){
      console.error(
        "COMPANY SUPPORT UNREAD:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not load support unread count"
      });
    }
  }
);

module.exports = router;
