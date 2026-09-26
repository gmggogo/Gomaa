function esc(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function dataUri(file){
  if(!file?.data) return "";
  const mime = file.mimeType || "application/octet-stream";
  return `data:${mime};base64,${Buffer.from(file.data).toString("base64")}`;
}

function generatedDataDocument({trip,row,template,signatureDataUri}){
  const fields = Array.isArray(template?.fields) ? template.fields : [];
  const data = row?.data || {};
  const rows = fields.map(field=>`
    <tr>
      <th>${esc(field.label)}</th>
      <td>${esc(data[field.internalKey] ?? trip?.[field.internalKey] ?? "")}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(trip?.tripNumber || "Trip Document")}</title>
<style>
body{font-family:Arial,sans-serif;margin:32px;color:#18202b}.sheet{max-width:900px;margin:auto;border:1px solid #ccd3dc;border-radius:12px;padding:26px}h1{margin:0 0 6px}.meta{margin-bottom:20px;color:#586273}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d8dde5;padding:10px;text-align:left;vertical-align:top}th{width:32%;background:#f3f6f9}.sig{margin-top:28px;border-top:1px solid #9da7b3;padding-top:16px}.sig img{max-width:320px;max-height:130px}.print{margin:20px auto;max-width:900px}@media print{.print{display:none}.sheet{border:0;padding:0}}
</style></head><body>
<div class="print"><button onclick="window.print()">Print / Save PDF</button></div>
<div class="sheet">
<h1>Trip Service Document</h1>
<div class="meta">Trip Number: <strong>${esc(trip?.tripNumber)}</strong> &nbsp; | &nbsp; Service: ${esc(trip?.serviceName || trip?.serviceKey)}</div>
<table>${rows}</table>
<div class="sig"><strong>Customer Signature</strong><br>${signatureDataUri ? `<img src="${signatureDataUri}" alt="Customer Signature">` : "No signature"}</div>
</div></body></html>`;
}

function originalDocumentPacket({trip,importDoc,template,signatureDataUri}){
  const position = template?.signaturePosition || {};
  const pageTarget = Math.max(1,Number(position.page || 1));
  const pages = (importDoc?.sourceFiles || []).map((file,index)=>{
    const uri = dataUri(file);
    const pageNumber = Number(file.page || index+1);
    const isTarget = pageNumber === pageTarget;
    const mime = String(file.mimeType || "").toLowerCase();
    const signature = isTarget && signatureDataUri ? `
      <img class="overlay-signature" src="${signatureDataUri}" style="left:${Number(position.xPercent ?? 62)}%;top:${Number(position.yPercent ?? 78)}%;width:${Number(position.widthPercent ?? 28)}%;height:${Number(position.heightPercent ?? 12)}%;" alt="Customer Signature">` : "";

    if(mime.startsWith("image/")){
      return `<section class="page"><div class="page-label">Page ${pageNumber}</div><div class="image-wrap"><img class="original-image" src="${uri}">${signature}</div></section>`;
    }

    if(mime.includes("pdf")){
      return `<section class="page"><div class="page-label">Original PDF</div><object data="${uri}" type="application/pdf" width="100%" height="900"></object>${isTarget && signatureDataUri ? `<div class="pdf-signature"><strong>Customer Signature</strong><br><img src="${signatureDataUri}"></div>` : ""}</section>`;
    }

    return `<section class="page"><div class="page-label">${esc(file.originalName)}</div><p>Original file preserved in archive.</p></section>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(trip?.tripNumber || "Signed Trip Document")}</title>
<style>body{font-family:Arial,sans-serif;margin:20px;background:#eef2f6}.toolbar,.page{max-width:980px;margin:0 auto 18px}.page{background:#fff;padding:16px;box-shadow:0 3px 18px #0002}.page-label{font-weight:800;margin-bottom:10px}.image-wrap{position:relative}.original-image{display:block;width:100%;height:auto}.overlay-signature{position:absolute;object-fit:contain;background:transparent}.pdf-signature img{max-width:320px;max-height:130px}@media print{body{background:#fff}.toolbar{display:none}.page{box-shadow:none;page-break-after:always}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save PDF</button> &nbsp; <strong>${esc(trip?.tripNumber)}</strong></div>${pages}</body></html>`;
}

function buildSignedDocument(args){
  const sourceType = String(args?.importDoc?.sourceType || "").toUpperCase();
  if(sourceType === "CSV" || sourceType === "XLSX"){
    return generatedDataDocument(args);
  }
  return originalDocumentPacket(args);
}

module.exports = {
  buildSignedDocument,
  generatedDataDocument,
  originalDocumentPacket
};
