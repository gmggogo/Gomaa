const { PDFDocument, rgb } = require("pdf-lib");

function clean(v){ return String(v ?? "").trim(); }
function clamp(n,min,max){ n=Number(n); return Number.isFinite(n)?Math.min(max,Math.max(min,n)):min; }
function safeName(field,index){
  const raw=clean(field?.fieldId)||clean(field?.semanticKey)||clean(field?.label)||`field_${index+1}`;
  const page=Math.max(1,Number(field?.page)||1);
  const occ=Math.max(1,Number(field?.occurrenceIndex)||1);
  return `${raw.replace(/[^\w.-]+/g,"_")}_p${page}_o${occ}_${index+1}`;
}
function rectFor(page,field){
  const b=field?.bbox||{};
  const W=page.getWidth(), H=page.getHeight();
  const nx=clamp(b.x,0,1), ny=clamp(b.y,0,1);
  const nw=clamp(b.width,0.002,1-nx), nh=clamp(b.height,0.002,1-ny);
  return {x:nx*W,y:H-((ny+nh)*H),width:nw*W,height:nh*H};
}
function mime(file){ return clean(file?.mimetype).toLowerCase(); }

async function sourceToPdf(file){
  if(!file?.buffer?.length) throw new Error("Source form file is empty");
  const type=mime(file);
  if(type==="application/pdf" || /\.pdf$/i.test(file.originalname||"")){
    return PDFDocument.load(file.buffer,{ignoreEncryption:false});
  }
  const pdf=await PDFDocument.create();
  let image;
  if(type==="image/png" || /\.png$/i.test(file.originalname||"")) image=await pdf.embedPng(file.buffer);
  else if(type==="image/jpeg" || type==="image/jpg" || /\.jpe?g$/i.test(file.originalname||"")) image=await pdf.embedJpg(file.buffer);
  else{
    const e=new Error(`Editable conversion currently supports PDF, PNG and JPG. Received ${type||"unknown file type"}`);
    e.code="SMART_FORM_UNSUPPORTED_SOURCE";
    throw e;
  }
  const size=image.scale(1);
  const maxW=612,maxH=792,scale=Math.min(maxW/size.width,maxH/size.height,1);
  const w=size.width*scale,h=size.height*scale;
  const page=pdf.addPage([w,h]);
  page.drawImage(image,{x:0,y:0,width:w,height:h});
  return pdf;
}

function transparentWidgetOptions(rect){
  return {...rect,borderWidth:0,backgroundColor:undefined,borderColor:undefined,textColor:rgb(0,0,0)};
}
async function buildEditablePdf(file,fields=[]){
  const pdf=await sourceToPdf(file);
  const form=pdf.getForm();
  const pages=pdf.getPages();
  let created=0, skipped=0;
  for(let i=0;i<fields.length;i++){
    const f=fields[i];
    if(f?.enabled===false){skipped++;continue;}
    const pageIndex=Math.max(0,(Number(f?.page)||1)-1);
    const page=pages[pageIndex];
    if(!page){skipped++;continue;}
    const rect=rectFor(page,f);
    if(rect.width<2||rect.height<2){skipped++;continue;}
    const name=safeName(f,i);
    const type=clean(f?.fieldType).toUpperCase();
    try{
      if(type==="CHECKBOX"){
        const cb=form.createCheckBox(name);
        cb.addToPage(page,{x:rect.x,y:rect.y,width:rect.width,height:rect.height,borderWidth:0});
      }else{
        const tf=form.createTextField(name);
        if(type==="SIGNATURE") tf.enableMultiline();
        if(type==="NUMBER") tf.setMaxLength(40);
        tf.addToPage(page,transparentWidgetOptions(rect));
        tf.setFontSize(Math.max(6,Math.min(12,rect.height*0.62)));
      }
      created++;
    }catch(err){
      console.warn("SMART FORM FIELD CREATE SKIP",name,err.message);
      skipped++;
    }
  }
  // Keep original page artwork unchanged. Widgets have no visible border/background.
  const bytes=await pdf.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:true});
  return {buffer:Buffer.from(bytes),created,skipped,pageCount:pages.length};
}
async function buildEditablePdfFromTemplate(template){
  if(!template?.sourceFile?.data) throw new Error("Template source file is missing");
  return buildEditablePdf({
    buffer:Buffer.from(template.sourceFile.data),
    mimetype:template.sourceFile.mimeType,
    originalname:template.sourceFile.originalName
  },template.fields||[]);
}
module.exports={buildEditablePdf,buildEditablePdfFromTemplate};
