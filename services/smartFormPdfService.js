const mongoose = require("mongoose");
const SmartFormTemplate = require("../models/SmartFormTemplate");
const SmartFormSubmission = require("../models/SmartFormSubmission");
const TripSignature = require("../models/TripSignature");
const Trip = require("../models/Trip");
const User = require("../models/User");
const DriverSchedule = require("../models/DriverSchedule");
const Tenant = require("../models/Tenant");

function requirePdfLib(){
  try{return require("pdf-lib");}
  catch{
    const e = new Error("pdf-lib is not installed. Run: npm install pdf-lib");
    e.statusCode = 500;
    throw e;
  }
}

function toText(value){
  if(value === null || value === undefined) return "";
  if(Array.isArray(value)) return value.join(", ");
  if(typeof value === "boolean") return value ? "Yes" : "No";
  if(typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function clean(v){ return String(v ?? "").trim(); }
function upper(v){ return clean(v).toUpperCase(); }
function norm(v){
  return upper(v)
    .replace(/[^A-Z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function first(...values){
  for(const v of values){
    if(v !== undefined && v !== null && clean(v) !== "") return v;
  }
  return "";
}

function getPath(obj,path){
  if(!obj || !path) return "";
  const parts=String(path).split(".").filter(Boolean);
  let cur=obj;
  for(const p of parts){
    if(cur === null || cur === undefined) return "";
    cur=cur[p];
  }
  return cur ?? "";
}

function formatTripDate(value){
  if(!value) return "";
  const raw=clean(value);
  const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return `${m[2]}/${m[3]}/${m[1]}`;
  const d=value instanceof Date?value:new Date(value);
  if(Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
}

function isDriverSignatureField(field){
  const id=norm(`${field?.key||""} ${field?.label||""}`);
  return id.includes("DRIVER SIGNATURE") || id.includes("DRIVER SIGN");
}

function isTripDateField(field){
  const id=norm(`${field?.key||""} ${field?.label||""}`);
  return id==="DATE" || id.includes("TRIP DATE") || id.includes("DRIVER DATE") || id.includes("SIGNATURE DATE");
}

function driverDisplayName(ctx){
  return clean(first(ctx?.trip?.driverName,ctx?.signature?.driverName,ctx?.driver?.name,ctx?.driver?.username));
}

function formatTime(value){
  if(!value) return "";
  if(typeof value === "string" && !/^\d{4}-\d\d-\d\dT/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if(Number.isNaN(d.getTime())) return clean(value);
  return d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
}

function calc(page,m){
  const w = page.getWidth(), h = page.getHeight();
  const boxW = w * (Number(m.widthPercent || 20)/100);
  const boxH = h * (Number(m.heightPercent || 4)/100);
  const x = w * (Number(m.xPercent || 0)/100);
  const top = h * (Number(m.yPercent || 0)/100);
  const y = Math.max(0,h-top-boxH);
  return {x,y,boxW,boxH};
}

function vehicleTypeMatches(label,trip){
  const wanted=norm(label)
    .replace(/^VEHICLE TYPE /,"")
    .trim();
  if(!wanted) return false;

  const actual=norm(first(
    trip?.vehicleTypeFromQuote,
    trip?.serviceType,
    trip?.serviceKey,
    trip?.serviceCode,
    trip?.serviceName
  ));

  const aliases={
    "WHEELCHAIR VAN":["WHEELCHAIR VAN","WHEELCHAIR","WC","WH"],
    "TAXI":["TAXI","TX"],
    "BUS":["BUS"],
    "STRETCHER CAR":["STRETCHER CAR","STRETCHER"],
    "OTHER":["OTHER"]
  };

  return (aliases[wanted] || [wanted]).some(x=>actual===x || actual.includes(x));
}

function exactBindingValue(field,ctx){
  const binding=clean(field?.tripBinding);
  if(!binding) return "";
  const roots={
    trip:ctx.trip,
    driver:ctx.driver,
    schedule:ctx.schedule,
    signature:ctx.signature,
    submission:ctx.submission,
    tenant:ctx.tenant
  };
  const parts=binding.split(".").filter(Boolean);
  const root=String(parts[0]||"").toLowerCase();
  if(roots[root] && parts.length>1) return getPath(roots[root],parts.slice(1).join("."));
  return getPath(ctx.trip,binding);
}

function actualMiles(trip){
  // Keep this in the same order as Admin Summary: completed/stop execution miles first.
  const candidates=[trip?.stopEndMiles,trip?.stopExecution?.miles,trip?.miles];
  for(const raw of candidates){
    const n=Number(raw);
    if(Number.isFinite(n) && n>0) return n;
  }
  const meters=Number(trip?.distanceMeters||0);
  return Number.isFinite(meters) && meters>0 ? meters/1609.344 : 0;
}

function automaticValue(field,ctx){
  const {submission,trip,signature,driver,schedule,tenant}=ctx;
  const source=upper(field?.sourceType || "MANUAL");

  // Final certification fields are always automatic, even if the Builder field
  // was accidentally left as MANUAL. This keeps normal MANUAL fields unchanged.
  if(isDriverSignatureField(field)) return driverDisplayName(ctx);
  if(isTripDateField(field)) return formatTripDate(first(trip?.tripDate,submission?.tripDate));

  if(source==="MANUAL") return submission.formData?.[field.key];

  const bound=exactBindingValue(field,ctx);
  if(bound !== "" && bound !== null && bound !== undefined) return bound;

  const id=norm(`${field?.key || ""} ${field?.label || ""}`);


  if(source==="DRIVER_DATA"){
    if(id.includes("DRIVER NAME") || id==="DRIVER" || id.includes("DRIVER S NAME")){
      return first(trip?.driverName,signature?.driverName,driver?.name,driver?.username);
    }
    if(id.includes("PHONE")) return first(schedule?.phone,driver?.phone);
    if(id.includes("EMAIL")) return first(driver?.email);
    if(id.includes("ADDRESS")) return first(trip?.driverAddress,schedule?.address,driver?.address);
    if(id.includes("DRIVER ID")) return first(trip?.driverId,signature?.driverId,schedule?.driverId,driver?._id);
    return "";
  }

  if(source==="VEHICLE_DATA"){
    if(field?.type==="CHECKBOX" && id.includes("VEHICLE TYPE")){
      const scheduleType=first(schedule?.vehicleCategory);
      if(scheduleType){
        const wanted=norm(field?.label).replace(/^VEHICLE TYPE /,"").trim();
        const actual=norm(scheduleType);
        if(wanted && (actual===wanted || actual.includes(wanted) || wanted.includes(actual))) return true;
      }
      return vehicleTypeMatches(field.label,trip);
    }
    if(id.includes("LICENSE") || id.includes("FLEET") || id.includes("VEHICLE ID") || id.includes("VEHICLE NUMBER") || id.includes("PLATE")){
      return first(trip?.vehicle,schedule?.vehicleNumber,driver?.vehicleNumber);
    }
    if(id.includes("MAKE") || id.includes("COLOR")) return "";
    if(id.includes("VEHICLE TYPE") || id.includes("VEHICLE CATEGORY")){
      return first(schedule?.vehicleCategory,trip?.vehicleTypeFromQuote,trip?.serviceType,trip?.serviceName);
    }
    return first(trip?.vehicle,schedule?.vehicleNumber,driver?.vehicleNumber);
  }

  if(source==="SYSTEM_AFTER_TRIP"){
    if(field?.type==="SIGNATURE" || id.includes("MEMBER SIGNATURE") || id.includes("CLIENT SIGNATURE") || id.includes("CUSTOMER SIGNATURE")){
      return signature?.signatureData?.length ? "__SIGNATURE__" : "";
    }
    // Never substitute time/miles into odometer fields. There is no odometer source in current Trip schema.
    if(id.includes("ODOMETER")) return "";
    if(id.includes("TRIP MILES") || id==="MILES" || id.includes("MILEAGE")){
      const miles=actualMiles(trip);
      return miles>0 ? miles.toFixed(2).replace(/\.00$/,"").replace(/(\.\d)0$/,"$1") : "";
    }
    if(id.includes("DROP OFF TIME") || id.includes("DROPOFF TIME")){
      return formatTime(first(trip?.stopEndAt,trip?.stopExecution?.endedAt,trip?.customerSignatureAt,signature?.signedAt,trip?.finalStatusConfirmedAt));
    }
    if(id.includes("PICK UP TIME") || id.includes("PICKUP TIME")){
      return first(trip?.tripTime,trip?.pickupTime,submission?.pickupTime);
    }
    if(id.includes("COMPLETED") || id.includes("COMPLETE TIME")){
      return formatTime(first(trip?.stopEndAt,trip?.stopExecution?.endedAt,trip?.customerSignatureAt,signature?.signedAt,trip?.finalStatusConfirmedAt));
    }
  }

  if(source==="TRIP_DATA" || source==="SYSTEM_AFTER_TRIP"){
    if(id.includes("COMPANY NAME") || id.includes("PROVIDER NAME") || id.includes("TRANSPORTATION PROVIDER")){
      return first(tenant?.branding?.companyName,tenant?.name);
    }
    if(id.includes("MEMBER NAME") || id.includes("CLIENT NAME") || id.includes("PASSENGER NAME")) return first(trip?.clientName,submission?.clientName);
    if(id.includes("CLIENT PHONE") || id.includes("MEMBER PHONE") || id.includes("PASSENGER PHONE")) return first(trip?.clientPhone);
    if(id.includes("PICK UP") && (id.includes("LOCATION") || id.includes("ADDRESS"))) return first(trip?.pickup,submission?.pickupAddress);
    if((id.includes("DROP OFF") || id.includes("DROPOFF")) && (id.includes("LOCATION") || id.includes("ADDRESS"))) return first(trip?.dropoff,submission?.dropoffAddress);
    if(id.includes("TRIP DATE") || id==="DATE") return formatTripDate(first(trip?.tripDate,submission?.tripDate));
    if(id.includes("PICK UP TIME") || id.includes("PICKUP TIME") || id==="TIME") return first(trip?.tripTime,trip?.pickupTime,submission?.pickupTime);
    if(id.includes("SERVICE")) return first(trip?.serviceName,trip?.serviceType,trip?.serviceKey,submission?.serviceName);
    if(id.includes("TRIP NUMBER")) return first(trip?.tripNumber,submission?.tripNumber);
    if(id.includes("TRIP MILES") || id==="MILES" || id.includes("MILEAGE")){
      const miles=actualMiles(trip);
      return miles>0 ? miles.toFixed(2).replace(/\.00$/,"").replace(/(\.\d)0$/,"$1") : "";
    }
  }

  return "";
}

async function findDriver({tenantId,trip,signature}){
  const ids=[trip?.driverId,signature?.driverId].map(clean).filter(Boolean);
  for(const id of ids){
    let driver=null;
    if(mongoose.Types.ObjectId.isValid(id)) driver=await User.findOne({_id:id,tenantId,role:"driver"}).lean();
    if(!driver) driver=await User.findOne({tenantId,role:"driver",username:id}).lean();
    if(driver) return driver;
  }
  if(clean(trip?.driverName)){
    const driver=await User.findOne({tenantId,role:"driver",name:trip.driverName}).lean();
    if(driver) return driver;
  }
  return null;
}

async function findSchedule({tenantId,trip,signature,driver}){
  const ids=[trip?.driverId,signature?.driverId,driver?._id,driver?.username].map(clean).filter(Boolean);
  for(const driverId of [...new Set(ids)]){
    const row=await DriverSchedule.findOne({tenantId,driverId}).lean();
    if(row) return row;
  }
  return null;
}

async function loadAutomaticContext({tenantId,submission}){
  let trip=null,signature=null,driver=null,schedule=null,tenant=null;
  tenant=await Tenant.findById(tenantId).lean();

  if(submission.tripId){
    [trip,signature]=await Promise.all([
      Trip.findOne({_id:submission.tripId,tenantId}).lean(),
      TripSignature.findOne({tenantId,tripId:submission.tripId}).select("+signatureData").lean()
    ]);
  }

  driver=await findDriver({tenantId,trip,signature});
  schedule=await findSchedule({tenantId,trip,signature,driver});
  return {trip,signature,driver,schedule,tenant};
}

async function generateFinalPdf({tenantId,submissionId}){
  const {PDFDocument,StandardFonts,rgb} = requirePdfLib();

  const submission = await SmartFormSubmission.findOne({_id:submissionId,tenantId}).select("+generatedPdf.data");
  if(!submission){ const e=new Error("Submission not found"); e.statusCode=404; throw e; }

  const template = await SmartFormTemplate.findOne({_id:submission.templateId,tenantId}).select("+originalPdf.data");
  if(!template){ const e=new Error("Template not found"); e.statusCode=404; throw e; }
  if(!template.originalPdf?.data?.length){ const e=new Error("Official PDF has not been uploaded"); e.statusCode=400; throw e; }

  const pdfDoc = await PDFDocument.load(template.originalPdf.data);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const driverSignatureFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const {trip,signature,driver,schedule,tenant}=await loadAutomaticContext({tenantId,submission});

  let signatureImage = null;
  if(signature?.signatureData){
    try{
      const signatureBuffer = Buffer.isBuffer(signature.signatureData)
        ? signature.signatureData
        : Buffer.from(signature.signatureData?.buffer || signature.signatureData);
      if(signatureBuffer.length){
        signatureImage = String(signature.signatureMimeType || "").toLowerCase().includes("jpeg")
          ? await pdfDoc.embedJpg(signatureBuffer)
          : await pdfDoc.embedPng(signatureBuffer);
      }
    }catch(err){
      console.error("SMART FORM SIGNATURE EMBED ERROR",err);
    }
  }

  const fields = [...(template.fields || [])].sort((a,b)=>Number(a.order||0)-Number(b.order||0));

  for(const field of fields){
    const savedMaps=Array.isArray(field.mappings)&&field.mappings.length?field.mappings:[field.mapping||{}];

    for(const m of savedMaps){
      if(m.mapped !== true) continue;
      const page = pages[Math.max(0,Number(m.page||1)-1)];
      if(!page) continue;
      const {x,y,boxW,boxH} = calc(page,m);

      const source=upper(field.sourceType || "MANUAL");
      const autoCtx={submission,trip,signature,driver,schedule,tenant};
      const forceFinalField=isDriverSignatureField(field) || isTripDateField(field);
      const value=forceFinalField
        ? automaticValue(field,autoCtx)
        : (source==="MANUAL"
            ? submission.formData?.[field.key]
            : automaticValue(field,autoCtx));

      // Driver Signature is NOT the member signature image.
      // It is the assigned driver's real name rendered in a signature-like handwritten style.
      if(isDriverSignatureField(field)){
        const driverName=driverDisplayName({trip,signature,driver});
        if(driverName){
          const sigSize=Math.max(11,Math.min(18,Number(m.fontSize||14)+3));
          const sigWidth=driverSignatureFont.widthOfTextAtSize(driverName,sigSize);
          const scale=Math.min(1,boxW/Math.max(sigWidth,1));
          page.drawText(driverName,{
            x,
            y:y+Math.max(0,(boxH-(sigSize*scale))*0.35),
            size:sigSize*scale,
            font:driverSignatureFont,
            color:rgb(0,0,0),
            maxWidth:boxW
          });
        }
        continue;
      }

      if(field.type === "SIGNATURE"){
        if(signatureImage && source!=="MANUAL"){
          const size = signatureImage.scale(1);
          const ratio = Math.min(boxW/size.width,boxH/size.height);
          page.drawImage(signatureImage,{
            x,
            y,
            width:size.width*ratio,
            height:size.height*ratio
          });
        }
        continue;
      }

      let text;
      if(field.type === "CHECKBOX"){
        const checked=value===true || value==="true" || value==="X" || value==="x" || value===1 || value==="1";
        text=checked ? "X" : "";
      }else{
        text=toText(value);
      }

      if(!text) continue;

      const fontSize = Math.max(5,Number(m.fontSize||10));
      let drawX = x;
      const width = font.widthOfTextAtSize(text,fontSize);
      if(m.textAlign==="CENTER") drawX = x + Math.max(0,(boxW-width)/2);
      if(m.textAlign==="RIGHT") drawX = x + Math.max(0,boxW-width);

      page.drawText(text,{
        x:drawX,
        y:y+Math.max(0,boxH-fontSize),
        size:fontSize,
        font,
        color:rgb(0,0,0),
        maxWidth:boxW
      });
    }
  }

  const bytes = await pdfDoc.save();
  const fileName = `${submission.organizationName || "smart-form"}-${submission._id}.pdf`.replace(/[^a-zA-Z0-9._-]/g,"_");

  submission.generatedPdf = {
    fileName,
    mimeType:"application/pdf",
    size:bytes.length,
    data:Buffer.from(bytes),
    generatedAt:new Date()
  };
  await submission.save();

  return {buffer:Buffer.from(bytes),fileName,submission};
}

module.exports = { generateFinalPdf };
