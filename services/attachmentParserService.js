function clean(value){
  return String(value ?? "").trim();
}

function normalizeKey(value){
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

function parseCsv(text){
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for(let i=0;i<text.length;i++){
    const ch = text[i];
    const next = text[i+1];

    if(ch === '"'){
      if(quoted && next === '"'){
        cell += '"';
        i++;
      }else{
        quoted = !quoted;
      }
      continue;
    }

    if(ch === ',' && !quoted){
      row.push(cell);
      cell = "";
      continue;
    }

    if((ch === '\n' || ch === '\r') && !quoted){
      if(ch === '\r' && next === '\n') i++;
      row.push(cell);
      cell = "";
      if(row.some(v=>clean(v)!=="")) rows.push(row);
      row = [];
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  if(row.some(v=>clean(v)!=="")) rows.push(row);
  if(!rows.length) return [];

  const headers = rows[0].map((h,i)=>clean(h) || `Column ${i+1}`);
  return rows.slice(1).map(values=>{
    const out = {};
    headers.forEach((h,i)=>{ out[h] = values[i] ?? ""; });
    return out;
  });
}

function parseWorkbook(buffer){
  let XLSX;
  try{
    XLSX = require("xlsx");
  }catch(err){
    const e = new Error("Excel import requires the xlsx package on the server");
    e.code = "XLSX_PACKAGE_MISSING";
    throw e;
  }

  const workbook = XLSX.read(buffer,{ type:"buffer", cellDates:false });
  const sheetName = workbook.SheetNames[0];
  if(!sheetName) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{
    defval:"",
    raw:false
  });
}

function fieldCandidates(field){
  return [
    field.label,
    field.internalKey,
    ...(Array.isArray(field.aliases) ? field.aliases : [])
  ]
  .map(normalizeKey)
  .filter(Boolean);
}

function mapRawRow(raw,template){
  const rawEntries = Object.entries(raw || {});
  const rawMap = new Map(
    rawEntries.map(([k,v])=>[normalizeKey(k),v])
  );
  const data = {};

  for(const field of template?.fields || []){
    const candidates = fieldCandidates(field);
    let value = "";

    for(const candidate of candidates){
      if(rawMap.has(candidate)){
        value = rawMap.get(candidate);
        break;
      }
    }

    data[field.internalKey] = value ?? "";
  }

  return data;
}

function detectSourceType(files){
  const types = new Set();
  for(const file of files || []){
    const name = clean(file.originalname).toLowerCase();
    const mime = clean(file.mimetype).toLowerCase();
    if(name.endsWith(".csv") || mime.includes("csv")) types.add("CSV");
    else if(name.endsWith(".xlsx") || name.endsWith(".xls") || mime.includes("spreadsheet") || mime.includes("excel")) types.add("XLSX");
    else if(name.endsWith(".pdf") || mime.includes("pdf")) types.add("PDF");
    else if(mime.startsWith("image/") || /\.(png|jpe?g|webp|tiff?)$/.test(name)) types.add("IMAGE");
    else types.add("MIXED");
  }
  return types.size === 1 ? [...types][0] : "MIXED";
}

function parseStructuredFiles(files,template){
  const allRawRows = [];
  for(const file of files || []){
    const name = clean(file.originalname).toLowerCase();
    const mime = clean(file.mimetype).toLowerCase();

    if(name.endsWith(".csv") || mime.includes("csv")){
      allRawRows.push(...parseCsv(file.buffer.toString("utf8")));
      continue;
    }

    if(name.endsWith(".xlsx") || name.endsWith(".xls") || mime.includes("spreadsheet") || mime.includes("excel")){
      allRawRows.push(...parseWorkbook(file.buffer));
    }
  }

  return allRawRows.map((rawData,index)=>({
    rowIndex:index,
    rawData,
    data:mapRawRow(rawData,template),
    extractionConfidence:null
  }));
}

function blankDocumentRow(files,template,status){
  const blank = {};
  for(const field of template?.fields || []) blank[field.internalKey] = "";
  return [{
    rowIndex:0,
    rawData:{
      _documentPages:(files || []).length,
      _extractionStatus:status
    },
    data:blank,
    extractionConfidence:null
  }];
}

function jsonFromModelText(text){
  const raw = clean(text);
  if(!raw) return null;

  try{ return JSON.parse(raw); }catch(_){ /* continue */ }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if(fenced){
    try{ return JSON.parse(fenced[1]); }catch(_){ /* continue */ }
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if(first >= 0 && last > first){
    try{ return JSON.parse(raw.slice(first,last+1)); }catch(_){ /* continue */ }
  }

  return null;
}

function fieldSpecForVision(template){
  return (template?.fields || [])
    .filter(field=>clean(field.label) && clean(field.internalKey))
    .map(field=>({
      documentLabel:clean(field.label),
      internalKey:clean(field.internalKey),
      aliases:Array.isArray(field.aliases) ? field.aliases.map(clean).filter(Boolean) : [],
      required:field.required === true
    }));
}

/*
  IMPORTANT:
  The visible Template has only "Document Field".
  internalKey remains stored and hidden.

  Gemini extracts by DOCUMENT LABEL, never by internalKey and never by
  the Review-column order. After extraction, this function maps the
  document labels back to their saved hidden internalKey.
*/
function normalizeDocumentLabel(value){
  return clean(value)
    .toLowerCase()
    .replace(/[_\-]+/g," ")
    .replace(/[^a-z0-9#]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function mapDocumentDataToInternalKeys(documentData,template){
  const incoming =
    documentData &&
    typeof documentData === "object"
      ? documentData
      : {};

  const normalizedIncoming = new Map();

  for(const [key,value] of Object.entries(incoming)){
    normalizedIncoming.set(
      normalizeDocumentLabel(key),
      value
    );
  }

  const data = {};

  for(const field of template?.fields || []){
    const internalKey=clean(field.internalKey);
    const documentLabel=clean(field.label);

    if(!internalKey || !documentLabel) continue;

    const candidates=[
      documentLabel,
      ...(Array.isArray(field.aliases) ? field.aliases : [])
    ]
      .map(normalizeDocumentLabel)
      .filter(Boolean);

    let value="";

    for(const candidate of candidates){
      if(normalizedIncoming.has(candidate)){
        value=normalizedIncoming.get(candidate);
        break;
      }
    }

    data[internalKey]=value ?? "";
  }

  return data;
}

function isImageFile(file){
  const name = clean(file?.originalname).toLowerCase();
  const mime = clean(file?.mimetype).toLowerCase();
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|tiff?|heic|heif)$/.test(name);
}

function geminiMime(file){
  const name = clean(file?.originalname).toLowerCase();
  const mime = clean(file?.mimetype).toLowerCase();

  if(mime) return mime;
  if(name.endsWith(".pdf")) return "application/pdf";
  if(name.endsWith(".png")) return "image/png";
  if(name.endsWith(".webp")) return "image/webp";
  if(name.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function geminiResponseText(payload){
  const parts =
    payload?.candidates?.[0]?.content?.parts;

  if(!Array.isArray(parts)) return "";

  return parts
    .map(part=>clean(part?.text))
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function googleVisionOcr(files){
  const apiKey =
    clean(
      process.env.GOOGLE_VISION_API_KEY ||
      process.env.GOOGLE_CLOUD_VISION_API_KEY
    );

  if(!apiKey){
    return {
      used:false,
      text:"",
      pages:0,
      error:"GOOGLE_VISION_API_KEY_NOT_SET"
    };
  }

  const imageFiles =
    (files || []).filter(isImageFile);

  if(!imageFiles.length){
    return {
      used:false,
      text:"",
      pages:0,
      error:"NO_IMAGE_FILES"
    };
  }

  const requests =
    imageFiles.map(file=>({
      image:{
        content:file.buffer.toString("base64")
      },
      features:[
        {
          type:"DOCUMENT_TEXT_DETECTION",
          maxResults:1
        }
      ],
      imageContext:{
        languageHints:["en"]
      }
    }));

  try{
    const response =
      await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            requests
          })
        }
      );

    const payload =
      await response.json().catch(()=>({}));

    if(!response.ok){
      return {
        used:false,
        text:"",
        pages:0,
        error:
          clean(payload?.error?.message) ||
          `GOOGLE_VISION_${response.status}`
      };
    }

    const textParts = [];

    for(let i=0;i<(payload?.responses || []).length;i++){
      const item = payload.responses[i] || {};
      const pageText =
        clean(
          item?.fullTextAnnotation?.text ||
          item?.textAnnotations?.[0]?.description
        );

      if(pageText){
        textParts.push(
          `--- PAGE ${i+1} ---\n${pageText}`
        );
      }
    }

    return {
      used:textParts.length > 0,
      text:textParts.join("\n\n"),
      pages:textParts.length,
      error:""
    };
  }catch(err){
    return {
      used:false,
      text:"",
      pages:0,
      error:clean(err?.message) || "GOOGLE_VISION_ERROR"
    };
  }
}

function extractionPrompt(template,ocrText=""){
  const fields =
    fieldSpecForVision(template);

  const lines = [
    "You are extracting transportation reservation trips from a reservation document.",
    clean(template?._recoveryInstruction) || "",
    "The source can contain printed text, handwriting, a hand-drawn table, or a normal form.",
    "Detect the table headers, visible column boundaries, row boundaries, and the spatial position of every handwritten or printed value.",
    "For tables, COLUMN POSITION IS AUTHORITATIVE: assign a value only to the column in which it is visibly written.",
    "Never move, merge, borrow, prepend, append, or copy a value from a neighboring column.",
    "Never infer a missing street number, phone number, date, time, stop, or address from another cell.",
    "If a cell is visibly blank, keep it blank even when a nearby cell contains a plausible value. If handwriting exists in the cell, make the best faithful transcription of that handwriting.",
    "If a value crosses a hand-drawn border visually, use the center/bulk of the writing to decide which single cell owns it; never duplicate it.",
    "Read each physical row from left to right using the visible grid, and output exactly one trip row for each physical passenger/trip row.",
    "Count the visible data rows first before extracting fields. Do not collapse multiple physical rows into one.",
    "Do not return an all-empty trip row when the document visibly contains handwritten trip data.",
    "If one field in a row is uncertain, keep the other clearly readable fields from that same row.",
    "If the document has front and back pages, treat them as one logical document and combine only information that clearly belongs to the same row/person.",
    "Read handwriting carefully.",
    "Do not invent values. Read the best visible value from its own cell. Use an empty string only when the cell is truly unreadable or absent.",
    "Preserve names, addresses, dates, times and phone numbers exactly as written; do not normalize or correct addresses during extraction.",
    "Use the VISIBLE DOCUMENT HEADER above each cell. Do not use GH Mobility internal field names to decide column ownership.",
    "Return row data keyed by the DOCUMENT FIELD LABEL exactly as supplied in Document fields below.",
    "The server will map each Document Field label to its hidden GH Mobility internalKey AFTER extraction.",
    "Therefore never shift values because of output order, Review order, field type, or semantic meaning.",
    "Example: if the visible header is Pickup Date, the value under it must be returned under the document label Pickup Date. If the visible header is Pickup Time, return it under Pickup Time.",
    "A number written under Phone # belongs only to Phone #. A street written under Stops belongs only to Stops.",
    "If Service is configured in the template but there is NO visible Service column/field in the document, return Service as an empty string. Never infer Service from Notes such as Wheelchair, Walker, Round Trip, or Stretcher.",
    "For a Stops field, preserve only text visibly written inside the Stops column; separate multiple stops with semicolons.",
    "Return JSON only. No markdown and no commentary.",
    `Document fields: ${JSON.stringify(fields.map(field=>({documentLabel:field.documentLabel,required:field.required})))}`,
    "Required JSON shape:",
    '{"rows":[{"documentData":{"<Document Field label>":"value"},"rawData":{"source":"visual","notes":""},"confidence":0.0}]}',
    "Include every supplied Document Field label inside every row.documentData object, even when blank.",
    "Do NOT return internalKey names in documentData.",
    "confidence is 0 to 1 for the whole extracted row."
  ];

  if(clean(ocrText)){
    lines.push(
      "",
      "Google Document OCR text is provided below only as a secondary reading aid.",
      "The ORIGINAL IMAGE/PDF is authoritative for row and column ownership.",
      "If OCR order conflicts with the visible table layout, ignore the OCR order and follow the visible cells.",
      "Never use OCR text to pull a number or word from one visible column into another.",
      "Do not turn header text into a trip row.",
      "",
      clean(ocrText)
    );
  }

  return lines.join("\n");
}

function geminiInlineParts(files){
  return (files || [])
    .filter(file=>{
      const name = clean(file?.originalname).toLowerCase();
      const mime = clean(file?.mimetype).toLowerCase();
      return (
        isImageFile(file) ||
        mime === "application/pdf" ||
        name.endsWith(".pdf")
      );
    })
    .map(file=>({
      inlineData:{
        mimeType:geminiMime(file),
        data:file.buffer.toString("base64")
      }
    }));
}

async function callGemini({files,template,ocrText=""}){
  const apiKey =
    clean(process.env.GEMINI_API_KEY);

  if(!apiKey){
    const err =
      new Error(
        "Image/PDF reading requires GEMINI_API_KEY on the server"
      );
    err.statusCode = 503;
    throw err;
  }

  const model =
    clean(process.env.ATTACHMENT_GEMINI_MODEL) ||
    "gemini-3.5-flash-lite";

  const prompt =
    extractionPrompt(
      template,
      ocrText
    );

  /*
    Spatial-table path:
    Gemini must ALWAYS see the original image/PDF for visual documents.
    Google Vision OCR is only a secondary reading aid; it must never replace
    the original visual layout because column position determines field ownership.
  */
  const visualParts =
    geminiInlineParts(files);

  const parts = [
    { text:prompt },
    ...visualParts
  ];

  if(!visualParts.length){
    return null;
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response =
    await fetch(
      url,
      {
        method:"POST",
        headers:{
          "x-goog-api-key":apiKey,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          contents:[
            {
              role:"user",
              parts
            }
          ],
          generationConfig:{
            responseMimeType:"application/json",
            temperature:0
          }
        })
      }
    );

  const payload =
    await response.json().catch(()=>({}));

  if(!response.ok){
    const message =
      clean(payload?.error?.message) ||
      `Gemini extraction failed (${response.status})`;

    const err =
      new Error(message);

    err.statusCode = 502;
    throw err;
  }

  return {
    payload,
    text:geminiResponseText(payload),
    model
  };
}

async function parseVisualDocument(files,template){
  const imageOnly =
    (files || []).length > 0 &&
    (files || []).every(isImageFile);

  let ocr = {
    used:false,
    text:"",
    pages:0,
    error:""
  };

  /*
    Google Vision is optional.
    If GOOGLE_VISION_API_KEY is present and the upload is image-only,
    use DOCUMENT_TEXT_DETECTION first. It is especially useful for printed
    forms and many handwriting cases, and it reduces Gemini image usage.
  */
  if(imageOnly){
    ocr =
      await googleVisionOcr(files);
  }

  /*
    Very short OCR output is usually not enough to rebuild a table reliably.
    In that case Gemini sees the original image directly.
  */
  const usefulOcr =
    clean(ocr.text).length >= 40
      ? clean(ocr.text)
      : "";

  const result =
    await callGemini({
      files,
      template,
      ocrText:usefulOcr
    });

  if(!result){
    return blankDocumentRow(
      files,
      template,
      "UNSUPPORTED_VISUAL_FILE"
    );
  }

  let parsed =
    jsonFromModelText(
      result.text
    );

  let modelRows =
    Array.isArray(parsed?.rows)
      ? parsed.rows
      : [];

  const hasUsefulVisualRow =
    modelRows.some(row=>{
      const extracted =
        row?.documentData &&
        typeof row.documentData === "object"
          ? row.documentData
          : (
              row?.data &&
              typeof row.data === "object"
                ? row.data
                : {}
            );

      return Object.values(extracted)
        .some(value=>clean(value));
    });

  /*
    Recovery pass:
    A very strict first pass can occasionally return an empty row even though
    handwriting is visible. Retry once with the original image/PDF still attached,
    asking for the best faithful transcription while keeping column ownership strict.
  */
  if(!modelRows.length || !hasUsefulVisualRow){
    const recoveryTemplate = {
      ...(template || {}),
      _recoveryInstruction:
        "The previous pass returned no usable row data. The document visibly contains trip data. Re-read the ORIGINAL IMAGE/PDF and transcribe the best visible value from each cell. Keep every value in its visible column. Do not invent or move values between columns."
    };

    const recovery =
      await callGemini({
        files,
        template:recoveryTemplate,
        ocrText:usefulOcr
      });

    if(recovery){
      parsed =
        jsonFromModelText(
          recovery.text
        );

      modelRows =
        Array.isArray(parsed?.rows)
          ? parsed.rows
          : [];
    }
  }

  if(!modelRows.length){
    return blankDocumentRow(
      files,
      template,
      "VISION_NO_ROWS_FOUND"
    );
  }

  return modelRows.map((modelRow,index)=>{
    /*
      New format: Gemini returns documentData by visible Document Field label.
      Backward compatibility: if an older response returns data by internalKey,
      keep accepting it without changing the rest of the import workflow.
    */
    const documentData =
      modelRow?.documentData &&
      typeof modelRow.documentData === "object"
        ? modelRow.documentData
        : null;

    let data;

    if(documentData){
      data =
        mapDocumentDataToInternalKeys(
          documentData,
          template
        );
    }else{
      const legacy =
        modelRow?.data &&
        typeof modelRow.data === "object"
          ? modelRow.data
          : {};

      data={};

      for(const field of template?.fields || []){
        const key=clean(field.internalKey);
        if(!key) continue;
        data[key]=legacy[key] ?? "";
      }
    }

    return {
      rowIndex:index,
      rawData:{
        ...(
          modelRow?.rawData &&
          typeof modelRow.rawData === "object"
            ? modelRow.rawData
            : {}
        ),
        _extractionStatus:
          usefulOcr
            ? "GEMINI_VISUAL_WITH_GOOGLE_OCR_AID"
            : "GEMINI_VISUAL_EXTRACTED",
        _documentPages:
          (files || []).length,
        _ocrProvider:
          usefulOcr
            ? "GOOGLE_VISION"
            : "",
        _aiProvider:"GEMINI",
        _aiModel:result.model,
        _googleVisionError:
          ocr.error || ""
      },
      data,
      extractionConfidence:
        Number.isFinite(
          Number(modelRow?.confidence)
        )
          ? Math.max(
              0,
              Math.min(
                1,
                Number(modelRow.confidence)
              )
            )
          : null
    };
  });
}

async function parseAttachment({files,template}){
  const sourceType = detectSourceType(files);
  let rows = [];

  if(sourceType === "CSV" || sourceType === "XLSX"){
    rows = parseStructuredFiles(files,template);
  }else if(sourceType === "MIXED"){
    const structured = (files || []).filter(file=>{
      const n = clean(file.originalname).toLowerCase();
      return /\.(csv|xlsx?|xls)$/.test(n) || /csv|spreadsheet|excel/.test(clean(file.mimetype).toLowerCase());
    });
    const visual = (files || []).filter(file=>!structured.includes(file));

    rows = structured.length ? parseStructuredFiles(structured,template) : [];
    if(visual.length){
      const visualRows = await parseVisualDocument(visual,template);
      rows.push(...visualRows.map((row,index)=>({ ...row,rowIndex:rows.length+index })));
    }
  }else{
    rows = await parseVisualDocument(files,template);
  }

  return { sourceType, rows };
}

module.exports = {
  parseAttachment,
  parseCsv,
  mapRawRow,
  normalizeKey,
  parseVisualDocument,
  googleVisionOcr
};
