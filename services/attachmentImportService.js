const mongoose = require("mongoose");
const AttachmentImport = require("../models/AttachmentImport");
const Service = require("../models/Service");
const Tenant = require("../models/Tenant");
const Trip = require("../models/Trip");

const AttachmentTripCounter =
  mongoose.models.AttachmentTripCounter ||
  mongoose.model(
    "AttachmentTripCounter",
    new mongoose.Schema({
      tenantId:{ type:mongoose.Schema.Types.ObjectId, required:true, index:true },
      serviceKey:{ type:String, required:true, uppercase:true },
      value:{ type:Number, default:0 }
    },{ timestamps:true, collection:"attachment_trip_counters" })
      .index({ tenantId:1, serviceKey:1 },{ unique:true })
  );

const AttachmentDocumentCounter =
  mongoose.models.AttachmentDocumentCounter ||
  mongoose.model(
    "AttachmentDocumentCounter",
    new mongoose.Schema({
      tenantId:{ type:mongoose.Schema.Types.ObjectId, required:true, unique:true, index:true },
      value:{ type:Number, default:0 }
    },{ timestamps:true, collection:"attachment_document_counters" })
  );

const AttachmentDailyEntryCounter =
  mongoose.models.AttachmentDailyEntryCounter ||
  mongoose.model(
    "AttachmentDailyEntryCounter",
    new mongoose.Schema({
      tenantId:{ type:mongoose.Schema.Types.ObjectId, required:true, index:true },
      dayKey:{ type:String, required:true, index:true },
      value:{ type:Number, default:0 }
    },{ timestamps:true, collection:"attachment_daily_entry_counters" })
      .index({ tenantId:1, dayKey:1 },{ unique:true })
  );

function clean(v){ return String(v ?? "").trim(); }
function upper(v){ return clean(v).toUpperCase(); }
function normalizedWords(v){ return upper(v).replace(/[^A-Z0-9]+/g," ").trim(); }

function serviceOperationalCode(service){
  return upper(
    service?.customServiceCode ||
    service?.serviceKey ||
    service?.serviceCode ||
    service?.companySuffix ||
    service?.suffix
  );
}

function serviceGate(service){
  if(service?.customSlot) return `CUSTOM_${Number(service.customSlot)}`;
  return upper(service?.serviceKey);
}

async function enabledServicesForTenant(tenantId){
  const [tenant,services] = await Promise.all([
    Tenant.findById(tenantId).lean(),
    Service.find({ tenantId, enabled:{ $ne:false } }).lean()
  ]);

  if(!tenant) throw new Error("Tenant not found");
  const allowed = new Set((tenant.allowedServices || []).map(upper));

  return services.filter(service=>{
    const gate = serviceGate(service);
    return allowed.size === 0 || allowed.has(gate);
  }).map(service=>({
    id:service._id,
    serviceKey:serviceOperationalCode(service),
    serviceIdentity:serviceGate(service),
    customServiceSlot:Number(service.customSlot || 0),
    title:clean(service.title || service.name || service.serviceKey),
    customerSignatureRequired:service.customerSignatureRequired === true
  })).filter(s=>s.serviceKey);
}

function autoResolveService(value,enabledServices){
  const target = normalizedWords(value);
  if(!target) return null;
  return enabledServices.find(service=>{
    const code = normalizedWords(service.serviceKey);
    const title = normalizedWords(service.title);
    return target === code || target === title || target.includes(title) || title.includes(target);
  }) || null;
}

function first(data,...keys){
  for(const key of keys){
    const value = data?.[key];
    if(value !== undefined && value !== null && clean(value) !== "") return value;
  }
  return "";
}

function normalizeStops(value){
  if(Array.isArray(value)) return value.map(clean).filter(Boolean);
  const text = clean(value);
  if(!text) return [];
  return text
    .split(/\r?\n|\s*;\s*|\s*\|\s*/)
    .map(clean)
    .filter(Boolean);
}

function validateRow(row,template,enabledServices){
  const errors = [];
  for(const field of template?.fields || []){
    if(field.required && clean(row.data?.[field.internalKey]) === ""){
      errors.push(`${field.label} is required`);
    }
  }
  if(!row.serviceKey || !enabledServices.some(s=>s.serviceKey === row.serviceKey)){
    errors.push("Service must be selected from enabled services");
  }
  return errors;
}

async function nextTripNumber(tenantId,serviceKey){
  const counter = await AttachmentTripCounter.findOneAndUpdate(
    { tenantId, serviceKey },
    { $inc:{ value:1 } },
    { upsert:true, new:true, setDefaultsOnInsert:true }
  );
  return `AT${serviceKey}${String(counter.value).padStart(6,"0")}`;
}

async function nextDocumentNumber(tenantId){
  const counter = await AttachmentDocumentCounter.findOneAndUpdate(
    { tenantId },
    { $inc:{ value:1 } },
    { upsert:true, new:true, setDefaultsOnInsert:true }
  );
  return `DOC-${String(counter.value).padStart(6,"0")}`;
}

function dayKeyForTimezone(timeZone){
  const parts = new Intl.DateTimeFormat("en-CA",{
    timeZone:timeZone || "America/Phoenix",
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).formatToParts(new Date());

  const map = {};
  for(const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day}`;
}

async function allocateDailyEntryNumbers(tenantId,count){
  const safeCount = Math.max(0,Number(count || 0));
  const dayKey = dayKeyForTimezone(process.env.SYSTEM_TIMEZONE || "America/Phoenix");
  if(!safeCount) return { dayKey,numbers:[] };

  const counter = await AttachmentDailyEntryCounter.findOneAndUpdate(
    { tenantId,dayKey },
    { $inc:{ value:safeCount } },
    { upsert:true,new:true,setDefaultsOnInsert:true }
  );

  const end = Number(counter.value || 0);
  const start = end - safeCount + 1;
  return {
    dayKey,
    numbers:Array.from({length:safeCount},(_,i)=>start+i)
  };
}

function tripPayloadFromRow({row,service,importDoc,tenant}){
  const data = row.data || {};
  const customerName = first(data,"clientName","customerName","patientName","memberName","name");
  const phone = first(data,"clientPhone","phone","memberPhone","customerPhone");
  const pickup = first(data,"pickup","pickupAddress","origin","from");
  const dropoff = first(data,"dropoff","dropoffAddress","destination","to");
  const tripDate = first(data,"tripDate","date","pickupDate","serviceDate");
  const tripTime = first(data,"tripTime","pickupTime","time");

  return {
    tenantId:tenant._id,
    tenantSlug:tenant.slug || "",
    type:"company",
    company:first(data,"company","facility","facilityName","insurance","broker","organization"),
    entryName:first(data,"entryName","contactName"),
    entryPhone:first(data,"entryPhone","contactPhone"),
    clientName:customerName,
    clientPhone:phone,
    clientEmail:first(data,"clientEmail","email"),
    memberId:first(data,"memberId","memberID","medicaidId","memberNumber"),
    appointmentTime:first(data,"appointmentTime","apptTime"),
    returnTime:first(data,"returnTime"),
    pickup,
    dropoff,
    stops:normalizeStops(first(data,"stops","stop","additionalStops")),
    tripDate,
    tripTime,
    notes:first(data,"notes","note","comments"),
    brokerNotes:first(data,"brokerNotes"),
    bookingData:{ ...data },
    unmappedExternalFields:{ ...(row.rawData || {}) },
    serviceType:service.title,
    serviceKey:service.serviceKey,
    serviceCode:service.serviceKey,
    serviceIdentity:service.serviceIdentity,
    customServiceSlot:service.customServiceSlot,
    serviceName:service.title,
    serviceTitle:service.title,
    serviceSuffix:service.serviceKey,
    tripNumberSuffix:service.serviceKey,
    status:"Scheduled",
    attachmentImport:true,
    attachmentImportId:importDoc._id,
    attachmentTemplateId:importDoc.templateId,
    attachmentDocumentNumber:importDoc.documentNumber || "",
    attachmentDailyEntryNumber:Number(row.dailyEntryNumber || 0),
    attachmentRowIndex:Number(row.rowIndex || 0),
    attachmentSignatureRequired:service.customerSignatureRequired === true
  };
}

async function prepareReviewRows({importDoc,template}){
  const services = await enabledServicesForTenant(importDoc.tenantId);
  for(const row of importDoc.reviewRows){
    const explicit = first(row.data,"service","serviceType","serviceName","serviceKey");
    if(!row.serviceKey && explicit){
      const match = autoResolveService(explicit,services);
      if(match){
        row.serviceKey = match.serviceKey;
        row.serviceName = match.title;
        row.serviceResolution = "AUTO";
      }
    }
    row.validationErrors = validateRow(row,template,services);
  }
  return services;
}

async function confirmImport({importDoc,template,rowIndexes=null}){
  const tenant = await Tenant.findById(importDoc.tenantId);
  if(!tenant) throw new Error("Tenant not found");
  if(tenant.attachmentImportEnabled !== true){
    const err = new Error("Attachment Import is disabled for this company");
    err.statusCode = 403;
    throw err;
  }

  const services = await enabledServicesForTenant(importDoc.tenantId);
  const serviceMap = new Map(services.map(s=>[s.serviceKey,s]));
  const requested = Array.isArray(rowIndexes)
    ? new Set(rowIndexes.map(Number).filter(Number.isFinite))
    : null;
  const created = [];

  for(const row of importDoc.reviewRows){
    if(requested && !requested.has(Number(row.rowIndex))) continue;
    if(row.confirmed && row.tripId) continue;

    const service = serviceMap.get(upper(row.serviceKey));
    row.validationErrors = validateRow(row,template,services);
    if(row.validationErrors.length) continue;

    const tripNumber = await nextTripNumber(importDoc.tenantId,service.serviceKey);
    const payload = tripPayloadFromRow({row,service,importDoc,tenant});
    payload.tripNumber = tripNumber;

    const trip = await Trip.create(payload);
    row.confirmed = true;
    row.tripId = trip._id;
    row.tripNumber = tripNumber;
    created.push(trip);
  }

  const allDone = importDoc.reviewRows.length > 0 && importDoc.reviewRows.every(r=>r.confirmed);
  importDoc.status = allDone ? "CONFIRMED" : (created.length ? "PARTIAL" : "REVIEW");
  if(created.length) importDoc.confirmedAt = new Date();
  await importDoc.save();

  return { created, services, importDoc };
}

module.exports = {
  enabledServicesForTenant,
  prepareReviewRows,
  confirmImport,
  autoResolveService,
  nextDocumentNumber,
  allocateDailyEntryNumbers
};
