function valueText(v){if(Array.isArray(v))return v.join(", ");if(v==null)return "";return String(v);}
async function buildPdf(template,values,manualOverrides={}){
 if(!template?.sourceFile?.data) throw new Error("Blank form source file is missing");
 if(!String(template.sourceFile.mimeType||"").toLowerCase().includes("pdf")) throw new Error("Final PDF generation currently requires a PDF blank form");
 let PDFDocument,StandardFonts,rgb; try{({PDFDocument,StandardFonts,rgb}=require("pdf-lib"));}catch(_){const e=new Error("Smart Forms PDF generation requires the pdf-lib package");e.code="PDF_LIB_MISSING";throw e;}
 const pdf=await PDFDocument.load(template.sourceFile.data); const font=await pdf.embedFont(StandardFonts.Helvetica); const pages=pdf.getPages();
 for(const field of template.fields||[]){if(!field.enabled)continue;const page=pages[(Number(field.page)||1)-1];if(!page)continue;const raw=Object.prototype.hasOwnProperty.call(manualOverrides,field.fieldId)?manualOverrides[field.fieldId]:values[field.fieldId];const text=valueText(raw);if(!text||field.fieldType==="SIGNATURE")continue;const {width,height}=page.getSize();const b=field.bbox||{};const x=(Number(b.x)||0)*width;const boxY=(Number(b.y)||0)*height;const boxH=(Number(b.height)||0)*height;const y=height-boxY-boxH+2;const maxH=Math.max(7,boxH-2);const size=Math.max(7,Math.min(11,maxH));page.drawText(text.slice(0,250),{x:x+2,y,size,font,color:rgb(0,0,0),maxWidth:Math.max(20,(Number(b.width)||.2)*width-4)});}
 return Buffer.from(await pdf.save());
}
module.exports={buildPdf};
