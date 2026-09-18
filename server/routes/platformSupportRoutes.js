"use strict";

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const router = express.Router();

const Conversation =
  require("../models/PlatformSupportConversation");

const Message =
  require("../models/PlatformSupportMessage");

const Tenant =
  mongoose.models.Tenant ||
  require("../models/Tenant");

const User =
  global.User ||
  mongoose.models.User ||
  require("../models/User");

const SystemDesign =
  mongoose.models.SystemDesign ||
  require("../models/SystemDesign");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function readBearerToken(req){
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

  return header
    .slice(7)
    .trim();
}

function requireSupportAuth(
  req,
  res,
  next
){
  const token =
    readBearerToken(req);

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
        verified.id ||
        verified._id ||
        "",
      name:
        verified.name ||
        verified.fullName ||
        "",
      username:
        verified.username ||
        "",
      role:
        upper(
          verified.role ||
          ""
        ),
      tenantId:
        clean(
          verified.tenantId ||
          ""
        )
    };

    if(
      req.authUser.role ===
      "PLATFORM_ADMIN"
    ){
      return next();
    }

    if(
      ![
        "ADMIN",
        "DISPATCHER",
        "SUPER_ADMIN",
        "SUPERADMIN"
      ].includes(
        req.authUser.role
      )
    ){
      return res.status(403).json({
        success:false,
        message:"Support Chat is not available for this role"
      });
    }

    if(
      !req.authUser.tenantId ||
      !mongoose.Types.ObjectId
        .isValid(
          req.authUser.tenantId
        )
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

function isPlatform(req){
  return (
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  );
}

function normalizeRole(role){
  const value = upper(role);

  if(value === "SUPERADMIN"){
    return "SUPER_ADMIN";
  }

  return value;
}

async function getTenantProfile(
  tenantId
){
  if(
    !tenantId ||
    !mongoose.Types.ObjectId
      .isValid(
        tenantId
      )
  ){
    return null;
  }

  return Tenant
    .findById(
      tenantId
    )
    .lean();
}

async function getSystemDesignProfile(
  tenantId
){
  if(
    !tenantId ||
    !mongoose.Types.ObjectId
      .isValid(
        tenantId
      )
  ){
    return null;
  }

  /*
    Company Phone must come from the same tenant's
    System Design -> Contact & Footer -> Phone Number.
  */
  let design =
    await SystemDesign
      .findOne({
        tenantId
      })
      .lean();

  /*
    Backward compatibility for an older single-tenant
    SystemDesign record that may not have tenantId yet.
  */
  if(!design){
    design =
      await SystemDesign
        .findOne({
          $or:[
            {tenantId:{$exists:false}},
            {tenantId:null},
            {tenantId:""}
          ]
        })
        .lean();
  }

  return design;
}

function tenantNameFromRecord(
  tenant
){
  return clean(
    tenant?.companyName ||
    tenant?.name ||
    tenant?.businessName ||
    tenant?.tenantName ||
    tenant?.displayName ||
    tenant?.slug ||
    ""
  );
}

function tenantPhoneFromRecord(
  tenant
){
  return clean(
    tenant?.companyPhone ||
    tenant?.phone ||
    tenant?.phoneNumber ||
    tenant?.businessPhone ||
    tenant?.contactPhone ||
    tenant?.supportPhone ||
    tenant?.mobile ||
    ""
  );
}

function systemDesignPhoneFromRecord(
  design
){
  return clean(
    design?.phoneNumber ||
    design?.contactPhone ||
    design?.companyPhone ||
    design?.phone ||
    design?.businessPhone ||
    design?.supportPhone ||
    design?.mobile ||
    ""
  );
}

async function getCurrentUserProfile(
  req
){
  const userId =
    clean(
      req.authUser?.id
    );

  let user = null;

  if(
    userId &&
    mongoose.Types.ObjectId
      .isValid(
        userId
      )
  ){
    user =
      await User
        .findById(
          userId
        )
        .lean();
  }

  return user;
}

function userNameFromRecord(
  req,
  user
){
  return clean(
    user?.fullName ||
    user?.name ||
    user?.displayName ||
    user?.username ||
    req.authUser?.name ||
    req.authUser?.username ||
    ""
  );
}

function userPhoneFromRecord(
  user
){
  return clean(
    user?.phone ||
    user?.phoneNumber ||
    user?.mobile ||
    user?.cellPhone ||
    user?.contactPhone ||
    ""
  );
}

async function buildTenantIdentity(
  req
){
  const tenantId =
    clean(
      req.authUser?.tenantId
    );

  const [
    tenant,
    user,
    systemDesign
  ] =
    await Promise.all([
      getTenantProfile(
        tenantId
      ),
      getCurrentUserProfile(
        req
      ),
      getSystemDesignProfile(
        tenantId
      )
    ]);

  return {
    tenantId,
    tenantName:
      tenantNameFromRecord(
        tenant
      ),
    companyPhone:
      systemDesignPhoneFromRecord(
        systemDesign
      ) ||
      tenantPhoneFromRecord(
        tenant
      ),
    userId:
      clean(
        req.authUser?.id
      ),
    userName:
      userNameFromRecord(
        req,
        user
      ),
    userRole:
      normalizeRole(
        req.authUser?.role
      ),
    userPhone:
      userPhoneFromRecord(
        user
      )
  };
}

async function getConversationForRequest(
  req,
  conversationId
){
  if(
    !mongoose.Types.ObjectId
      .isValid(
        conversationId
      )
  ){
    return null;
  }

  const filter = {
    _id:conversationId
  };

  if(!isPlatform(req)){
    filter.tenantId =
      req.authUser.tenantId;
  }

  return Conversation
    .findOne(
      filter
    )
    .lean();
}

/* =========================
   TENANT CURRENT IDENTITY
========================= */

router.get(
  "/tenant/me",
  requireSupportAuth,
  async (
    req,
    res
  ) => {
    try{
      if(isPlatform(req)){
        return res.status(403).json({
          success:false,
          message:"Tenant staff endpoint"
        });
      }

      const identity =
        await buildTenantIdentity(
          req
        );

      res.json({
        success:true,
        identity
      });

    }catch(err){
      console.error(
        "SUPPORT TENANT ME:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not load support profile"
      });
    }
  }
);

/* =========================
   TENANT CONVERSATIONS
========================= */

router.get(
  "/tenant/conversations",
  requireSupportAuth,
  async (
    req,
    res
  ) => {
    try{
      if(isPlatform(req)){
        return res.status(403).json({
          success:false,
          message:"Tenant staff endpoint"
        });
      }

      const scope =
        clean(
          req.query?.scope
        ).toLowerCase();

      const filter = {
        tenantId:
          req.authUser.tenantId
      };

      if(scope === "history"){
        filter.status =
          "RESOLVED";
      }else if(scope === "active"){
        filter.status = {
          $ne:"RESOLVED"
        };
      }

      const rows =
        await Conversation
          .find(
            filter
          )
          .sort(
            scope === "history"
              ? {resolvedAt:-1,lastMessageAt:-1}
              : {lastMessageAt:-1}
          )
          .lean();

      res.json({
        success:true,
        conversations:rows
      });

    }catch(err){
      console.error(
        "SUPPORT TENANT LIST:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not load support conversations"
      });
    }
  }
);

router.post(
  "/tenant/conversations",
  requireSupportAuth,
  async (
    req,
    res
  ) => {
    try{
      if(isPlatform(req)){
        return res.status(403).json({
          success:false,
          message:"Tenant staff endpoint"
        });
      }

      const subject =
        clean(
          req.body?.subject
        );

      const firstMessage =
        clean(
          req.body?.message
        );

      if(!subject){
        return res.status(400).json({
          success:false,
          message:"Subject is required"
        });
      }

      if(!firstMessage){
        return res.status(400).json({
          success:false,
          message:"Message is required"
        });
      }

      const identity =
        await buildTenantIdentity(
          req
        );

      const conversation =
        await Conversation.create({
          tenantId:
            identity.tenantId,
          tenantName:
            identity.tenantName,
          companyPhone:
            identity.companyPhone,
          subject,
          status:
            "WAITING_FOR_SUPPORT",
          createdByUserId:
            identity.userId,
          createdByName:
            identity.userName,
          createdByRole:
            identity.userRole,
          createdByPhone:
            identity.userPhone,
          lastMessageAt:
            new Date(),
          lastMessagePreview:
            firstMessage.slice(
              0,
              240
            ),
          tenantUnreadCount:0,
          platformUnreadCount:1
        });

      await Message.create({
        conversationId:
          conversation._id,
        tenantId:
          identity.tenantId,
        senderType:
          "TENANT_STAFF",
        senderUserId:
          identity.userId,
        senderName:
          identity.userName,
        senderRole:
          identity.userRole,
        senderPhone:
          identity.userPhone,
        message:
          firstMessage
      });

      res.status(201).json({
        success:true,
        conversation
      });

    }catch(err){
      console.error(
        "SUPPORT TENANT CREATE:",
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
   SHARED CONVERSATION READ
========================= */

router.get(
  "/conversations/:conversationId",
  requireSupportAuth,
  async (
    req,
    res
  ) => {
    try{
      const conversation =
        await getConversationForRequest(
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
              conversation._id
          })
          .sort({
            createdAt:1
          })
          .lean();

      if(isPlatform(req)){
        await Message.updateMany(
          {
            conversationId:
              conversation._id,
            senderType:
              "TENANT_STAFF",
            readByPlatformAt:null
          },
          {
            $set:{
              readByPlatformAt:
                new Date()
            }
          }
        );

        await Conversation.updateOne(
          {
            _id:
              conversation._id
          },
          {
            $set:{
              platformUnreadCount:0
            }
          }
        );

      }else{
        await Message.updateMany(
          {
            conversationId:
              conversation._id,
            senderType:
              "PLATFORM_ADMIN",
            readByTenantAt:null
          },
          {
            $set:{
              readByTenantAt:
                new Date()
            }
          }
        );

        await Conversation.updateOne(
          {
            _id:
              conversation._id,
            tenantId:
              req.authUser.tenantId
          },
          {
            $set:{
              tenantUnreadCount:0
            }
          }
        );
      }

      res.json({
        success:true,
        conversation,
        messages
      });

    }catch(err){
      console.error(
        "SUPPORT CONVERSATION READ:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not load conversation"
      });
    }
  }
);

router.post(
  "/conversations/:conversationId/messages",
  requireSupportAuth,
  async (
    req,
    res
  ) => {
    try{
      const text =
        clean(
          req.body?.message
        );

      if(!text){
        return res.status(400).json({
          success:false,
          message:"Message is required"
        });
      }

      const conversation =
        await getConversationForRequest(
          req,
          req.params.conversationId
        );

      if(!conversation){
        return res.status(404).json({
          success:false,
          message:"Conversation not found"
        });
      }

      if(
        conversation.status ===
        "RESOLVED"
      ){
        await Conversation.updateOne(
          {
            _id:
              conversation._id
          },
          {
            $set:{
              status:
                isPlatform(req)
                  ? "WAITING_FOR_CUSTOMER"
                  : "WAITING_FOR_SUPPORT",
              resolvedAt:null,
              resolvedBy:"",
              resolvedByUserId:"",
              resolvedByName:"",
              resolvedByRole:""
            }
          }
        );
      }

      let sender = {
        userId:
          clean(
            req.authUser?.id
          ),
        userName:
          clean(
            req.authUser?.name ||
            req.authUser?.username ||
            "Platform Admin"
          ),
        userRole:
          normalizeRole(
            req.authUser?.role
          ),
        userPhone:""
      };

      if(!isPlatform(req)){
        const identity =
          await buildTenantIdentity(
            req
          );

        sender = {
          userId:
            identity.userId,
          userName:
            identity.userName,
          userRole:
            identity.userRole,
          userPhone:
            identity.userPhone
        };
      }

      const senderType =
        isPlatform(req)
          ? "PLATFORM_ADMIN"
          : "TENANT_STAFF";

      const message =
        await Message.create({
          conversationId:
            conversation._id,
          tenantId:
            conversation.tenantId,
          senderType,
          senderUserId:
            sender.userId,
          senderName:
            sender.userName,
          senderRole:
            sender.userRole,
          senderPhone:
            sender.userPhone,
          message:text
        });

      const update = {
        lastMessageAt:
          new Date(),
        lastMessagePreview:
          text.slice(
            0,
            240
          ),
        status:
          isPlatform(req)
            ? "WAITING_FOR_CUSTOMER"
            : "WAITING_FOR_SUPPORT"
      };

      if(isPlatform(req)){
        update.tenantUnreadCount =
          Math.max(
            0,
            Number(
              conversation
                .tenantUnreadCount ||
              0
            )
          ) + 1;

        update.platformUnreadCount = 0;

      }else{
        update.platformUnreadCount =
          Math.max(
            0,
            Number(
              conversation
                .platformUnreadCount ||
              0
            )
          ) + 1;

        update.tenantUnreadCount = 0;
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
        message
      });

    }catch(err){
      console.error(
        "SUPPORT MESSAGE CREATE:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not send message"
      });
    }
  }
);

/* =========================
   TENANT RESOLVE / REOPEN
   ADMIN + SUPER ADMIN ONLY
========================= */

router.patch(
  "/tenant/conversations/:conversationId/status",
  requireSupportAuth,
  async (
    req,
    res
  ) => {
    try{
      if(isPlatform(req)){
        return res.status(403).json({
          success:false,
          message:"Tenant staff endpoint"
        });
      }

      const role =
        normalizeRole(
          req.authUser?.role
        );

      if(
        ![
          "ADMIN",
          "SUPER_ADMIN"
        ].includes(role)
      ){
        return res.status(403).json({
          success:false,
          message:"Only Admin or Super Admin can resolve or reopen support conversations"
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
          "RESOLVED"
        ].includes(status)
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid tenant support status"
        });
      }

      if(
        !mongoose.Types.ObjectId
          .isValid(
            req.params.conversationId
          )
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid conversation id"
        });
      }

      const identity =
        await buildTenantIdentity(
          req
        );

      const update = {
        status
      };

      if(status === "RESOLVED"){
        update.resolvedAt =
          new Date();

        update.resolvedBy =
          identity.userName ||
          "Tenant Admin";

        update.resolvedByUserId =
          identity.userId;

        update.resolvedByName =
          identity.userName ||
          "Tenant Admin";

        update.resolvedByRole =
          identity.userRole;

        update.tenantUnreadCount = 0;
        update.platformUnreadCount = 0;

      }else{
        update.resolvedAt = null;
        update.resolvedBy = "";
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
        "SUPPORT TENANT STATUS UPDATE:",
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
   PLATFORM -> COMPANY CONTACT
========================= */

router.get(
  "/platform/tenants",
  requireSupportAuth,
  async (
    req,
    res
  ) => {
    try{
      if(!isPlatform(req)){
        return res.status(403).json({
          success:false,
          message:"Platform Admin only"
        });
      }

      const tenants =
        await Tenant
          .find({})
          .sort({
            name:1,
            companyName:1,
            createdAt:1
          })
          .lean();

      const companies =
        tenants.map(tenant=>({
          tenantId:
            String(
              tenant._id
            ),
          name:
            tenantNameFromRecord(
              tenant
            ) ||
            "Company",
          slug:
            clean(
              tenant.slug
            ),
          enabled:
            tenant.enabled !== false
        }));

      return res.json({
        success:true,
        companies
      });

    }catch(err){
      console.error(
        "SUPPORT PLATFORM TENANT LIST:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Could not load SaaS companies"
      });
    }
  }
);

router.post(
  "/platform/conversations",
  requireSupportAuth,
  async (
    req,
    res
  ) => {
    try{
      if(!isPlatform(req)){
        return res.status(403).json({
          success:false,
          message:"Platform Admin only"
        });
      }

      const tenantId =
        clean(
          req.body?.tenantId
        );

      const subject =
        clean(
          req.body?.subject
        );

      const firstMessage =
        clean(
          req.body?.message
        );

      if(
        !tenantId ||
        !mongoose.Types.ObjectId
          .isValid(
            tenantId
          )
      ){
        return res.status(400).json({
          success:false,
          message:"Select a valid SaaS company"
        });
      }

      if(!subject){
        return res.status(400).json({
          success:false,
          message:"Subject is required"
        });
      }

      if(!firstMessage){
        return res.status(400).json({
          success:false,
          message:"Message is required"
        });
      }

      const [
        tenant,
        systemDesign
      ] =
        await Promise.all([
          getTenantProfile(
            tenantId
          ),
          getSystemDesignProfile(
            tenantId
          )
        ]);

      if(!tenant){
        return res.status(404).json({
          success:false,
          message:"SaaS company not found"
        });
      }

      const platformName =
        clean(
          req.authUser?.name ||
          req.authUser?.username ||
          "Platform Admin"
        );

      const platformUserId =
        clean(
          req.authUser?.id
        );

      const companyPhone =
        systemDesignPhoneFromRecord(
          systemDesign
        ) ||
        tenantPhoneFromRecord(
          tenant
        );

      const conversation =
        await Conversation.create({
          tenantId,
          tenantName:
            tenantNameFromRecord(
              tenant
            ),
          companyPhone,
          subject,
          status:
            "WAITING_FOR_CUSTOMER",
          createdByUserId:
            platformUserId,
          createdByName:
            platformName,
          createdByRole:
            "PLATFORM_ADMIN",
          createdByPhone:"",
          lastMessageAt:
            new Date(),
          lastMessagePreview:
            firstMessage.slice(
              0,
              240
            ),
          tenantUnreadCount:1,
          platformUnreadCount:0
        });

      await Message.create({
        conversationId:
          conversation._id,
        tenantId,
        senderType:
          "PLATFORM_ADMIN",
        senderUserId:
          platformUserId,
        senderName:
          platformName,
        senderRole:
          "PLATFORM_ADMIN",
        senderPhone:"",
        message:
          firstMessage
      });

      return res.status(201).json({
        success:true,
        conversation
      });

    }catch(err){
      console.error(
        "SUPPORT PLATFORM CREATE:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Could not create company support conversation"
      });
    }
  }
);

/* =========================
   PLATFORM INBOX
========================= */

router.get(
  "/platform/conversations",
  requireSupportAuth,
  async (
    req,
    res
  ) => {
    try{
      if(!isPlatform(req)){
        return res.status(403).json({
          success:false,
          message:"Platform Admin only"
        });
      }

      const status =
        upper(
          req.query?.status
        );

      const scope =
        clean(
          req.query?.scope
        ).toLowerCase();

      const filter = {};

      if(
        [
          "OPEN",
          "WAITING_FOR_SUPPORT",
          "WAITING_FOR_CUSTOMER",
          "RESOLVED"
        ].includes(
          status
        )
      ){
        filter.status =
          status;
      }else if(scope === "history"){
        filter.status =
          "RESOLVED";
      }else if(scope === "active"){
        filter.status = {
          $ne:"RESOLVED"
        };
      }

      const rows =
        await Conversation
          .find(
            filter
          )
          .sort(
            scope === "history" || status === "RESOLVED"
              ? {resolvedAt:-1,lastMessageAt:-1}
              : {lastMessageAt:-1}
          )
          .lean();

      res.json({
        success:true,
        conversations:rows
      });

    }catch(err){
      console.error(
        "SUPPORT PLATFORM LIST:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not load support inbox"
      });
    }
  }
);

router.patch(
  "/platform/conversations/:conversationId/status",
  requireSupportAuth,
  async (
    req,
    res
  ) => {
    try{
      if(!isPlatform(req)){
        return res.status(403).json({
          success:false,
          message:"Platform Admin only"
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
        ].includes(
          status
        )
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid support status"
        });
      }

      const update = {
        status
      };

      if(
        status ===
        "RESOLVED"
      ){
        const resolverName =
          clean(
            req.authUser?.name ||
            req.authUser?.username ||
            "Platform Admin"
          );

        update.resolvedAt =
          new Date();

        update.resolvedBy =
          resolverName;

        update.resolvedByUserId =
          clean(
            req.authUser?.id
          );

        update.resolvedByName =
          resolverName;

        update.resolvedByRole =
          "PLATFORM_ADMIN";

        update.tenantUnreadCount = 0;
        update.platformUnreadCount = 0;

      }else{
        update.resolvedAt = null;
        update.resolvedBy = "";
        update.resolvedByUserId = "";
        update.resolvedByName = "";
        update.resolvedByRole = "";
      }

      const conversation =
        await Conversation
          .findOneAndUpdate(
            {
              _id:
                req.params.conversationId
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
        "SUPPORT STATUS UPDATE:",
        err
      );

      res.status(500).json({
        success:false,
        message:"Could not update support status"
      });
    }
  }
);

router.get(
  "/unread-count",
  requireSupportAuth,
  async (
    req,
    res
  ) => {
    try{
      let filter = {};

      if(isPlatform(req)){
        filter = {
          platformUnreadCount:{
            $gt:0
          }
        };
      }else{
        filter = {
          tenantId:
            req.authUser.tenantId,
          tenantUnreadCount:{
            $gt:0
          }
        };
      }

      const rows =
        await Conversation
          .find(
            filter
          )
          .select(
            "tenantUnreadCount platformUnreadCount"
          )
          .lean();

      const count =
        rows.reduce(
          (
            sum,
            row
          ) =>
            sum +
            Number(
              isPlatform(req)
                ? row.platformUnreadCount || 0
                : row.tenantUnreadCount || 0
            ),
          0
        );

      res.json({
        success:true,
        count
      });

    }catch(err){
      res.status(500).json({
        success:false,
        message:"Could not load unread count"
      });
    }
  }
);

module.exports = router;
