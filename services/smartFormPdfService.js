const SmartFormTemplate = require("../models/SmartFormTemplate");
const SmartFormSubmission = require("../models/SmartFormSubmission");
const TripSignature = require("../models/TripSignature");

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

function calc(page,m){
  const w = page.getWidth(), h = page.getHeight();
  const boxW = w * (Number(m.widthPercent || 20)/100);
  const boxH = h * (Number(m.heightPercent || 4)/100);
  const x = w * (Number(m.xPercent || 0)/100);
  const top = h * (Number(m.yPercent || 0)/100);
  const y = Math.max(0,h-top-boxH);
  return {x,y,boxW,boxH};
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

  let signatureImage = null;
  if(submission.tripId){
    const signature = await TripSignature.findOne({tenantId,tripId:submission.tripId}).lean();
    if(signature?.signatureData?.length){
      try{
        signatureImage = String(signature.signatureMimeType || "").toLowerCase().includes("jpeg")
          ? await pdfDoc.embedJpg(signature.signatureData)
          : await pdfDoc.embedPng(signature.signatureData);
      }catch(err){
        console.error("SMART FORM SIGNATURE EMBED ERROR",err);
      }
    }
  }

  const fields = [...(template.fields || [])].sort((a,b)=>Number(a.order||0)-Number(b.order||0));

  for(const field of fields){
    const m = field.mapping || {};
    if(m.mapped !== true) continue;
    const page = pages[Math.max(0,Number(m.page||1)-1)];
    if(!page) continue;
    const {x,y,boxW,boxH} = calc(page,m);

    if(field.type === "SIGNATURE"){
      if(signatureImage){
        const size = signatureImage.scale(1);
        const ratio = Math.min(boxW/size.width,boxH/size.height);
        page.drawImage(signatureImage,{x,y,width:size.width*ratio,height:size.height*ratio});
      }
      continue;
    }

    let text = field.type === "CHECKBOX"
      ? ((submission.formData?.[field.key]===true || submission.formData?.[field.key]==="true") ? "X" : "")
      : toText(submission.formData?.[field.key]);

    if(!text) continue;

    const fontSize = Math.max(5,Number(m.fontSize||10));
    let drawX = x;
    const width = font.widthOfTextAtSize(text,fontSize);
    if(m.textAlign==="CENTER") drawX = x + Math.max(0,(boxW-width)/2);
    if(m.textAlign==="RIGHT") drawX = x + Math.max(0,boxW-width);

    page.drawText(text,{x:drawX,y:y+Math.max(0,boxH-fontSize),size:fontSize,font,color:rgb(0,0,0),maxWidth:boxW});
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
