"use strict";

/*
DESTINATION PATH:
server/services/brokerIntegrationService.js

REPLACE THE PREVIOUS VERSION WITH THIS FILE.

PURPOSE:
Single engine for all four supported connection methods:
API, Webhook, SFTP, File Import.

IMPORTANT:
Existing encrypted secrets are preserved when Platform Admin edits
a connection and leaves secret fields blank.
*/

const crypto = require("crypto");

const BrokerIntegration =
  require("../models/BrokerIntegration");

const {
  createExternalTrip,
  applyBrokerUpdate,
  cancelExternalTrip
} = require("./externalTripService");

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function connectionTypeSupported(type){
  return [
    "API",
    "WEBHOOK",
    "SFTP",
    "FILE_IMPORT"
  ].includes(
    upper(type)
  );
}

function encryptionKey(){

  const source =
    clean(
      process.env.BROKER_INTEGRATION_ENCRYPTION_KEY ||
      process.env.JWT_SECRET
    );

  if(!source){
    throw new Error(
      "BROKER_INTEGRATION_ENCRYPTION_KEY is required"
    );
  }

  return crypto
    .createHash("sha256")
    .update(source)
    .digest();
}

function encryptSecret(value){

  const plain =
    clean(value);

  if(!plain){
    return "";
  }

  const iv =
    crypto.randomBytes(12);

  const cipher =
    crypto.createCipheriv(
      "aes-256-gcm",
      encryptionKey(),
      iv
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        plain,
        "utf8"
      ),
      cipher.final()
    ]);

  const tag =
    cipher.getAuthTag();

  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64")
  ].join(".");
}

function decryptSecret(value){

  const packed =
    clean(value);

  if(!packed){
    return "";
  }

  const parts =
    packed.split(".");

  if(parts.length !== 3){
    throw new Error(
      "Invalid encrypted secret"
    );
  }

  const iv =
    Buffer.from(
      parts[0],
      "base64"
    );

  const tag =
    Buffer.from(
      parts[1],
      "base64"
    );

  const encrypted =
    Buffer.from(
      parts[2],
      "base64"
    );

  const decipher =
    crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      iv
    );

  decipher.setAuthTag(
    tag
  );

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString("utf8");
}

function sanitizeIntegrationForClient(doc){

  const obj =
    doc?.toObject
      ? doc.toObject()
      : { ...(doc || {}) };

  if(obj.api){
    obj.api = {
      ...obj.api,
      apiKeyEncrypted:
        obj.api.apiKeyEncrypted ? "********" : "",
      bearerTokenEncrypted:
        obj.api.bearerTokenEncrypted ? "********" : "",
      usernameEncrypted:
        obj.api.usernameEncrypted ? "********" : "",
      passwordEncrypted:
        obj.api.passwordEncrypted ? "********" : "",
      clientIdEncrypted:
        obj.api.clientIdEncrypted ? "********" : "",
      clientSecretEncrypted:
        obj.api.clientSecretEncrypted ? "********" : ""
    };
  }

  if(obj.webhook){
    obj.webhook = {
      ...obj.webhook,
      secretEncrypted:
        obj.webhook.secretEncrypted ? "********" : ""
    };
  }

  if(obj.sftp){
    obj.sftp = {
      ...obj.sftp,
      usernameEncrypted:
        obj.sftp.usernameEncrypted ? "********" : "",
      passwordEncrypted:
        obj.sftp.passwordEncrypted ? "********" : "",
      privateKeyEncrypted:
        obj.sftp.privateKeyEncrypted ? "********" : ""
    };
  }

  return obj;
}

function preserveOrEncrypt(newValue,oldValue){

  const next =
    clean(newValue);

  if(
    !next ||
    next === "********"
  ){
    return clean(oldValue);
  }

  return encryptSecret(next);
}

async function upsertIntegration({
  tenantId,
  tenantSlug,
  brokerCode,
  brokerName,
  connectionType,
  environment,
  integrationDirection,
  providerId,
  enabled,
  featureVisible,
  billingEnabled,
  monthlyFlatFee,
  api,
  webhook,
  sftp,
  fileImport,
  brokerConfig,
  updatedBy
}){

  const type =
    upper(connectionType);

  const code =
    upper(brokerCode)
      .replace(/[^A-Z0-9]/g,"")
      .slice(0,2);

  if(code.length !== 2){
    throw new Error(
      "Broker Code must be exactly two letters or numbers"
    );
  }

  if(!connectionTypeSupported(type)){
    throw new Error(
      "Unsupported connection type"
    );
  }

  const existing =
    await BrokerIntegration.findOne({
      tenantId,
      brokerCode:code
    });

  const oldApi =
    existing?.api || {};

  const oldWebhook =
    existing?.webhook || {};

  const oldSftp =
    existing?.sftp || {};

  const nextApi = {
    endpoint:
      clean(api?.endpoint),

    authType:
      upper(api?.authType || "NONE"),

    apiKeyEncrypted:
      preserveOrEncrypt(
        api?.apiKeyEncrypted,
        oldApi.apiKeyEncrypted
      ),

    bearerTokenEncrypted:
      preserveOrEncrypt(
        api?.bearerTokenEncrypted,
        oldApi.bearerTokenEncrypted
      ),

    usernameEncrypted:
      preserveOrEncrypt(
        api?.usernameEncrypted,
        oldApi.usernameEncrypted
      ),

    passwordEncrypted:
      preserveOrEncrypt(
        api?.passwordEncrypted,
        oldApi.passwordEncrypted
      ),

    clientIdEncrypted:
      preserveOrEncrypt(
        api?.clientIdEncrypted,
        oldApi.clientIdEncrypted
      ),

    clientSecretEncrypted:
      preserveOrEncrypt(
        api?.clientSecretEncrypted,
        oldApi.clientSecretEncrypted
      ),

    tokenUrl:
      clean(api?.tokenUrl),

    statusEndpoint:
      clean(api?.statusEndpoint),

    scope:
      clean(api?.scope),

    headers:
      api?.headers ||
      oldApi.headers ||
      {},

    pollEnabled:
      Boolean(
        api?.pollEnabled
      ),

    pollMinutes:
      Number(
        api?.pollMinutes ||
        15
      )
  };

  const nextWebhook = {
    inboundPath:
      clean(
        webhook?.inboundPath
      ),

    secretEncrypted:
      preserveOrEncrypt(
        webhook?.secretEncrypted,
        oldWebhook.secretEncrypted
      ),

    signatureHeader:
      clean(
        webhook?.signatureHeader
      ),

    signatureAlgorithm:
      upper(
        webhook?.signatureAlgorithm ||
        "NONE"
      ),

    outboundUrl:
      clean(
        webhook?.outboundUrl
      )
  };

  const nextSftp = {
    host:
      clean(
        sftp?.host
      ),

    port:
      Number(
        sftp?.port ||
        22
      ),

    usernameEncrypted:
      preserveOrEncrypt(
        sftp?.usernameEncrypted,
        oldSftp.usernameEncrypted
      ),

    passwordEncrypted:
      preserveOrEncrypt(
        sftp?.passwordEncrypted,
        oldSftp.passwordEncrypted
      ),

    privateKeyEncrypted:
      preserveOrEncrypt(
        sftp?.privateKeyEncrypted,
        oldSftp.privateKeyEncrypted
      ),

    remotePath:
      clean(
        sftp?.remotePath
      ),

    filePattern:
      clean(
        sftp?.filePattern
      ),

    processedPath:
      clean(
        sftp?.processedPath
      )
  };

  const update = {
    tenantId,
    tenantSlug:
      clean(tenantSlug),

    brokerCode:
      code,

    brokerName:
      clean(brokerName),

    connectionType:
      type,

    environment:
      ["SANDBOX","PRODUCTION"].includes(
        upper(environment)
      )
        ? upper(environment)
        : "SANDBOX",

    integrationDirection:
      ["INBOUND","OUTBOUND","BOTH"].includes(
        upper(integrationDirection)
      )
        ? upper(integrationDirection)
        : "INBOUND",

    providerId:
      clean(providerId),

    enabled:
      Boolean(enabled),

    featureVisible:
      Boolean(featureVisible),

    billingEnabled:
      Boolean(billingEnabled),

    monthlyFlatFee:
      Number(
        monthlyFlatFee ||
        0
      ),

    api:nextApi,
    webhook:nextWebhook,
    sftp:nextSftp,

    fileImport:
      fileImport ||
      existing?.fileImport ||
      {},

    brokerConfig:
      brokerConfig ||
      existing?.brokerConfig ||
      {},

    updatedBy:
      clean(updatedBy),

    connectionStatus:
      enabled
        ? (
            existing?.connectionStatus === "CONNECTED"
              ? "CONNECTED"
              : "CONFIGURED"
          )
        : "DISABLED"
  };

  const integration =
    await BrokerIntegration.findOneAndUpdate(
      {
        tenantId,
        brokerCode:code
      },
      {
        $set:update,
        $setOnInsert:{
          createdBy:
            clean(updatedBy)
        }
      },
      {
        new:true,
        upsert:true,
        runValidators:true,
        setDefaultsOnInsert:true
      }
    );

  return integration;
}

function safeTimingEqual(a,b){

  const A =
    Buffer.from(
      String(a || "")
    );

  const B =
    Buffer.from(
      String(b || "")
    );

  if(A.length !== B.length){
    return false;
  }

  return crypto.timingSafeEqual(
    A,
    B
  );
}

function webhookSignatureValid({
  integration,
  rawBody,
  signature
}){

  const algorithm =
    upper(
      integration?.webhook?.signatureAlgorithm ||
      "NONE"
    );

  if(algorithm === "NONE"){
    return true;
  }

  const secret =
    decryptSecret(
      integration?.webhook?.secretEncrypted
    );

  if(!secret){
    return false;
  }

  const received =
    clean(signature);

  if(!received){
    return false;
  }

  if(algorithm === "HMAC_SHA256"){

    const expected =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(rawBody)
        .digest("hex");

    return safeTimingEqual(
      expected,
      received
    );
  }

  if(algorithm === "HMAC_SHA1"){

    const expected =
      crypto
        .createHmac(
          "sha1",
          secret
        )
        .update(rawBody)
        .digest("hex");

    return safeTimingEqual(
      expected,
      received
    );
  }

  return false;
}

async function receiveTrip({
  integration,
  payload,
  eventType="CREATE"
}){

  const action =
    upper(eventType);

  if(
    !integration ||
    integration.enabled !== true
  ){
    throw new Error(
      "Integration is disabled"
    );
  }

  if(
    action === "CREATE" ||
    action === "ASSIGNMENT" ||
    action === "NEW"
  ){

    const result =
      await createExternalTrip({
        tenantId:
          integration.tenantId,

        tenantSlug:
          integration.tenantSlug,

        integrationId:
          integration._id,

        brokerCode:
          integration.brokerCode,

        brokerName:
          integration.brokerName,

        connectionType:
          integration.connectionType,

        payload,
        source:"BROKER"
      });

    integration.lastReceivedAt =
      new Date();

    integration.lastConnectedAt =
      new Date();

    integration.connectionStatus =
      "CONNECTED";

    integration.lastErrorMessage =
      "";

    await integration.save();

    return result;
  }

  const externalTripId =
    clean(
      payload?.externalTripId ||
      payload?.tripId ||
      payload?.requestId ||
      payload?.reservationId ||
      payload?.trackingNumber
    );

  if(!externalTripId){
    throw new Error(
      "External trip id is required for update or cancellation"
    );
  }

  const ExternalTrip =
    require("../models/ExternalTrip");

  const existing =
    await ExternalTrip.findOne({
      tenantId:
        integration.tenantId,

      brokerCode:
        integration.brokerCode,

      externalTripId
    });

  if(!existing){
    throw new Error(
      "External trip not found"
    );
  }

  if(
    action === "CANCEL" ||
    action === "CANCELLED"
  ){

    const trip =
      await cancelExternalTrip(
        existing,
        payload?.status ||
        "CANCELLED"
      );

    return {
      created:false,
      duplicate:false,
      trip
    };
  }

  const trip =
    await applyBrokerUpdate(
      existing,
      payload
    );

  return {
    created:false,
    duplicate:false,
    trip
  };
}

async function testIntegration(integration){

  if(!integration){
    throw new Error(
      "Integration not found"
    );
  }

  integration.connectionStatus =
    "TESTING";

  integration.lastTestAt =
    new Date();

  await integration.save();

  try{

    let result = {
      success:true,
      connectionType:
        integration.connectionType,
      message:"Configuration validated"
    };

    if(
      integration.connectionType === "API"
    ){

      if(
        !clean(
          integration.api?.endpoint
        )
      ){
        throw new Error(
          "API endpoint is required"
        );
      }

      result.message =
        "API configuration is ready for broker-specific live testing";
    }

    if(
      integration.connectionType === "WEBHOOK"
    ){

      if(
        !clean(
          integration.webhook?.inboundPath
        )
      ){
        throw new Error(
          "Webhook inbound path is required"
        );
      }

      result.message =
        "Webhook configuration is ready";
    }

    if(
      integration.connectionType === "SFTP"
    ){

      if(
        !clean(
          integration.sftp?.host
        )
      ){
        throw new Error(
          "SFTP host is required"
        );
      }

      result.message =
        "SFTP configuration is ready for broker-specific live testing";
    }

    if(
      integration.connectionType === "FILE_IMPORT"
    ){
      result.message =
        "File Import configuration is ready";
    }

    integration.connectionStatus =
      "CONFIGURED";

    integration.lastErrorMessage =
      "";

    await integration.save();

    return result;

  }catch(err){

    integration.connectionStatus =
      "ERROR";

    integration.lastErrorAt =
      new Date();

    integration.lastErrorMessage =
      err.message;

    await integration.save();

    throw err;
  }
}

module.exports = {
  connectionTypeSupported,
  encryptSecret,
  decryptSecret,
  sanitizeIntegrationForClient,
  upsertIntegration,
  webhookSignatureValid,
  receiveTrip,
  testIntegration
};
