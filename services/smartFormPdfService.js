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

function hasWords(id,...words){
  return words.every(w=>id.includes(norm(w)));
}

function milesValue(trip){
  const candidates=[
    trip?.stopEndMiles,
    trip?.stopExecution?.miles,
    trip?.miles,
    trip?.distanceMiles,
    trip?.totalMiles
  ];
  for(const v of candidates){
    const n=Number(v);
    if(Number.isFinite(n) && n>0) return n.toFixed(1).replace(/\.0$/,'');
  }
  const meters=Number(trip?.distanceMeters || 0);
  return meters>0 ? (meters/1609.344).toFixed(1).replace(/\.0$/,'') : '';
}

function automaticValue(field,{submission,trip,signature,driver,schedule,tenant}){
  const source=upper(field?.sourceType || "MANUAL");
  if(source==="MANUAL") return submission.formData?.[field.key];

  // Explicit Builder binding always wins. Supported roots make the source deterministic.
  const binding=clean(field?.tripBinding);
  if(binding){
    const roots={trip,driver,signature,submission,schedule,tenant};
    const [root,...rest]=binding.split(".");
    if(roots[root] && rest.length){
      const v=getPath(roots[root],rest.join("."));
      if(v !== "" && v !== null && v !== undefined) return v;
    }
    const direct=getPath(trip,binding);
    if(direct !== "" && direct !== null && direct !== undefined) return direct;
  }

  const id=norm(`${field?.key || ""} ${field?.label || ""}`);
  const isOdometer=hasWords(id,"ODOMETER");
  const isPickup= id.includes("PICKUP") || hasWords(id,"PICK","UP");
  const isDropoff= id.includes("DROPOFF") || hasWords(id,"DROP","OFF");

  if(source==="DRIVER_DATA"){
    if(id.includes("NAME") && id.includes("DRIVER")) return first(trip?.driverName,signature?.driverName,driver?.name);
    if(id.includes("PHONE")) return first(schedule?.phone,driver?.phone);
    if(id.includes("EMAIL")) return first(driver?.email);
    if(id.includes("ADDRESS")) return first(trip?.driverAddress,schedule?.address,driver?.address);
    if(id.includes("ID")) return first(trip?.driverId,signature?.driverId,driver?._id);
    return first(trip?.driverName,signature?.driverName,driver?.name);
  }

  if(source==="VEHICLE_DATA"){
    if(field?.type==="CHECKBOX" && id.includes("VEHICLE") && id.includes("TYPE")) return vehicleTypeMatches(field.label,trip);
    if(id.includes("LICENSE") || id.includes("FLEET") || hasWords(id,"VEHICLE","ID") || hasWords(id,"VEHICLE","NUMBER")){
      return first(trip?.vehicle,schedule?.vehicleNumber,driver?.vehicleNumber);
    }
    if(id.includes("MAKE") || id.includes("COLOR")) return ""; // no such stored field in supplied models
    if(id.includes("TYPE") || id.includes("CATEGORY")) return first(schedule?.vehicleCategory,trip?.vehicleTypeFromQuote,trip?.serviceType);
    return first(trip?.vehicle,schedule?.vehicleNumber,driver?.vehicleNumber);
  }

  if(source==="SYSTEM_AFTER_TRIP"){
    if(field?.type==="SIGNATURE" || id.includes("SIGNATURE")) return signature?.signatureData?.length ? "__SIGNATURE__" : "";

    // Odometer fields must NEVER receive a time/mileage guess.
    if(isOdometer) return "";

    if(id.includes("MILE")) return milesValue(trip);

    if(isDropoff && id.includes("TIME")){
      return formatTime(first(
        trip?.stopEndAt,
        trip?.finalStatusConfirmedAt,
        trip?.dispatchFinalConfirmedAt,
        trip?.sharedFinalConfirmedAt,
        trip?.customerSignatureAt,
        signature?.signedAt
      ));
    }
    if(isPickup && id.includes("TIME")) return first(trip?.pickupTime,trip?.tripTime,submission?.pickupTime);
    if(id.includes("COMPLETE") && id.includes("TIME")){
      return formatTime(first(trip?.finalStatusConfirmedAt,trip?.dispatchFinalConfirmedAt,trip?.stopEndAt,trip?.customerSignatureAt,signature?.signedAt));
    }
  }

  if(source==="TRIP_DATA" || source==="SYSTEM_AFTER_TRIP"){
    if((id.includes("MEMBER") || id.includes("CLIENT") || id.includes("PASSENGER")) && id.includes("NAME")) return first(trip?.clientName,trip?.name,submission?.clientName);
    if((id.includes("CLIENT") || id.includes("MEMBER") || id.includes("PASSENGER")) && id.includes("PHONE")) return first(trip?.clientPhone,trip?.phone);
    if(isPickup && (id.includes("LOCATION") || id.includes("ADDRESS"))) return first(trip?.pickup,trip?.pickupAddress,submission?.pickupAddress);
    if(isDropoff && (id.includes("LOCATION") || id.includes("ADDRESS"))) return first(trip?.dropoff,trip?.dropoffAddress,submission?.dropoffAddress);
    if(id.includes("DATE")) return first(trip?.tripDate,submission?.tripDate);
    if(!isOdometer && isPickup && id.includes("TIME")) return first(trip?.pickupTime,trip?.tripTime,submission?.pickupTime);
    if(id.includes("SERVICE")) return first(trip?.serviceName,trip?.serviceTitle,trip?.serviceType,trip?.serviceKey,submission?.serviceName);
    if(id.includes("TRIP") && (id.includes("NUMBER") || id.includes("NO"))) return first(trip?.tripNumber,submission?.tripNumber);
    if(id.includes("MILE")) return milesValue(trip);
    if(id.includes("COMPANY") || id.includes("PROVIDER") || id.includes("TENANT")) return first(trip?.companyName,trip?.company,tenant?.branding?.companyName,tenant?.name);
  }

  return "";
}
async function loadAutomaticContext({tenantId,submission}){
  let trip=null,signature=null,driver=null,schedule=null,tenant=null;

  tenant=await Tenant.findById(tenantId).lean();

  if(submission.tripId){
    trip=await Trip.findOne({_id:submission.tripId,tenantId}).lean();
    if(trip){
      signature=await TripSignature.findOne({tripId:trip._id}).select("+signatureData").lean();
    }
  }

  const driverRef=first(trip?.driverId,signature?.driverId);
  if(driverRef){
    const ref=String(driverRef);
    const ors=[{username:ref}];
    if(mongoose.Types.ObjectId.isValid(ref)) ors.unshift({_id:ref});
    driver=await User.findOne({tenantId,role:"driver",$or:ors}).lean();

    // DriverSchedule is the system source for vehicle number/category and schedule contact data.
    const scheduleRefs=[ref];
    if(driver?._id) scheduleRefs.push(String(driver._id));
    if(driver?.username) scheduleRefs.push(String(driver.username));
    schedule=await DriverSchedule.findOne({tenantId,driverId:{$in:[...new Set(scheduleRefs)]}}).lean();
  }

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

  const {trip,signature,driver,schedule,tenant}=await loadAutomaticContext({tenantId,submission});

  let signatureImage = null;
  if(signature?.signatureData?.length){
    try{
      signatureImage = String(signature.signatureMimeType || "").toLowerCase().includes("jpeg")
        ? await pdfDoc.embedJpg(signature.signatureData)
        : await pdfDoc.embedPng(signature.signatureData);
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
      const value=source==="MANUAL"
        ? submission.formData?.[field.key]
        : automaticValue(field,{submission,trip,signature,driver,schedule,tenant});

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
