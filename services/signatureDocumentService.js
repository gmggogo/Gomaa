const AttachmentImport = require("../models/AttachmentImport");
const AttachmentTemplate = require("../models/AttachmentTemplate");
const TripSignature = require("../models/TripSignature");
const attachmentDocumentService = require("./attachmentDocumentService");

async function buildForTrip(trip){
  if(!trip?.attachmentImportId) return null;

  const [importDoc,signature] = await Promise.all([
    AttachmentImport.findById(trip.attachmentImportId),
    TripSignature.findOne({ tripId:trip._id })
  ]);

  if(!importDoc || !signature) return null;
  const template = await AttachmentTemplate.findById(importDoc.templateId).lean();
  const row = importDoc.reviewRows.find(r=>String(r.tripId||"") === String(trip._id)) ||
    importDoc.reviewRows.find(r=>Number(r.rowIndex) === Number(trip.attachmentRowIndex || 0));

  const signatureDataUri = `data:${signature.signatureMimeType || "image/png"};base64,${Buffer.from(signature.signatureData).toString("base64")}`;
  const html = attachmentDocumentService.buildSignedDocument({
    trip,
    row,
    importDoc,
    template,
    signatureDataUri
  });

  return { html, importDoc, template, signature, row };
}

async function archiveTrip(trip){
  const built = await buildForTrip(trip);
  if(!built) return null;

  const {importDoc,signature,row,html} = built;
  const structuredSource = ["CSV","XLSX"].includes(String(importDoc.sourceType || "").toUpperCase());
  /*
    For scanned/PDF originals do not duplicate the binary source as base64
    inside the same Mongo document. Original + signature stay persistent and
    the signed packet is rebuilt on demand. Excel/CSV generated HTML is small
    and can be stored directly.
  */
  const storedHtml = structuredSource ? html : "";
  const existing = (importDoc.archiveEntries || []).find(e=>String(e.tripId) === String(trip._id));

  if(existing){
    existing.tripNumber = trip.tripNumber || existing.tripNumber;
    existing.rowIndex = Number(row?.rowIndex || 0);
    existing.signedAt = signature.signedAt || existing.signedAt;
    existing.completedAt = trip.completedAt || existing.completedAt || new Date();
    existing.archivedAt = new Date();
    existing.documentType = "HTML";
    existing.finalDocumentHtml = storedHtml;
    existing.finalDocumentMimeType = "text/html";
  }else{
    importDoc.archiveEntries.push({
      tripId:trip._id,
      tripNumber:trip.tripNumber || "",
      rowIndex:Number(row?.rowIndex || 0),
      signedAt:signature.signedAt || null,
      completedAt:trip.completedAt || new Date(),
      archivedAt:new Date(),
      documentType:"HTML",
      finalDocumentHtml:storedHtml,
      finalDocumentMimeType:"text/html"
    });
  }

  const confirmedTripIds = (importDoc.reviewRows || []).filter(r=>r.confirmed && r.tripId).map(r=>String(r.tripId));
  const archivedIds = new Set((importDoc.archiveEntries || []).map(e=>String(e.tripId)));
  if(confirmedTripIds.length && confirmedTripIds.every(id=>archivedIds.has(id))){
    importDoc.status = "ARCHIVED";
    importDoc.archivedAt = new Date();
  }

  await importDoc.save();
  return html;
}

module.exports = { buildForTrip, archiveTrip };
