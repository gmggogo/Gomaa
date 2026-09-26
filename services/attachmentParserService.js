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
  return (template?.fields || []).map(field=>({
    documentLabel:clean(field.label),
    internalKey:clean(field.internalKey),
    aliases:Array.isArray(field.aliases) ? field.aliases.map(clean).filter(Boolean) : [],
    required:field.required === true
  }));
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
    "The source can contain printed text, handwriting, a hand-drawn table, or a normal form.",
    "Detect the table headers and row boundaries. Every passenger/trip row must be a separate output row.",
    "If the document has front and back pages, treat them as one logical document and combine matching information.",
    "Read handwriting carefully.",
    "Do not invent values. If a value is unreadable or absent, return an empty string.",
    "Preserve names, addresses, dates, times and phone numbers as closely as possible.",
    "For a Stops field, preserve multiple stops in one string separated by semicolons.",
    "Return JSON only. No markdown and no commentary.",
    `Template fields: ${JSON.stringify(fields)}`,
    "Required JSON shape:",
    '{"rows":[{"data":{"<internalKey>":"value"},"rawData":{"source":"visual","notes":""},"confidence":0.0}]}',
    "Include every template internalKey inside every row.data object, even when blank.",
    "confidence is 0 to 1 for the whole extracted row."
  ];

  if(clean(ocrText)){
    lines.push(
      "",
      "Google Document OCR text is provided below.",
      "Use it as a reading aid, but reconstruct rows according to the visible document structure described by the labels.",
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
    Cost-saving path:
    - If Google Vision produced useful OCR text, send only the OCR text to Gemini.
    - Otherwise send the original image/PDF directly to Gemini.
    This keeps handwriting support while avoiding image-token cost when OCR is enough.
  */
  const parts = [
    { text:prompt }
  ];

  if(!clean(ocrText)){
    parts.push(
      ...geminiInlineParts(files)
    );
  }

  if(parts.length === 1 && !clean(ocrText)){
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

  const parsed =
    jsonFromModelText(
      result.text
    );

  const modelRows =
    Array.isArray(parsed?.rows)
      ? parsed.rows
      : [];

  if(!modelRows.length){
    return blankDocumentRow(
      files,
      template,
      "VISION_NO_ROWS_FOUND"
    );
  }

  const requiredKeys =
    (template?.fields || [])
      .map(f=>clean(f.internalKey))
      .filter(Boolean);

  return modelRows.map((modelRow,index)=>{
    const incoming =
      modelRow?.data &&
      typeof modelRow.data === "object"
        ? modelRow.data
        : {};

    const data = {};

    for(const key of requiredKeys){
      data[key] =
        incoming[key] ?? "";
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
            ? "GOOGLE_OCR_GEMINI_EXTRACTED"
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
