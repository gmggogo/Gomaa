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

  const orderedColumns =
    fields.map((field,index)=>({
      columnIndex:index,
      documentLabel:field.documentLabel,
      internalKey:field.internalKey,
      required:field.required === true
    }));

  const lines = [
    "You are extracting transportation reservation trips from a reservation document.",
    clean(template?._recoveryInstruction) || "",
    "The source can contain printed text, handwriting, a hand-drawn table, or a normal form.",
    "",
    "CRITICAL POSITIONAL EXTRACTION RULE:",
    "Do NOT decide the destination field from the meaning of a value.",
    "Do NOT return a semantic data object.",
    "Return one positional cells array per physical row.",
    "The cells array MUST use the exact same order as ORDERED DOCUMENT COLUMNS below.",
    "cells[0] belongs only to columnIndex 0, cells[1] only to columnIndex 1, and so on.",
    "The server will map those positions to GH Mobility fields AFTER extraction.",
    "",
    "First locate the visible document headers and vertical column boundaries.",
    "Then read each physical data row horizontally and place each cell value into the matching positional slot.",
    "COLUMN POSITION IS AUTHORITATIVE.",
    "A value must stay in the physical column where it is written even if its content looks like a date, time, phone number, or address that would make more sense somewhere else.",
    "Never shift a value left or right because of its meaning.",
    "Never merge neighboring columns.",
    "Never copy or duplicate a value into another column.",
    "Never use a blank cell as a reason to shift later values into earlier positions.",
    "If a physical cell is blank, its corresponding cells[] position MUST be an empty string.",
    "Every row must contain exactly the same number of cells as ORDERED DOCUMENT COLUMNS.",
    "If handwriting crosses a border, assign it to the one cell containing the center/bulk of the handwriting.",
    "Read handwriting carefully and make the best faithful transcription from that cell only.",
    "Do not invent missing values.",
    "Preserve names, addresses, dates, times and phone numbers exactly as written.",
    "Do not normalize or correct addresses during extraction.",
    "Do not turn header text into a trip row.",
    "Count visible physical data rows first; output exactly one result row per physical trip/passenger row.",
    "",
    `ORDERED DOCUMENT COLUMNS: ${JSON.stringify(orderedColumns)}`,
    "",
    "Return JSON only. No markdown and no commentary.",
    "Required JSON shape:",
    '{"rows":[{"cells":["value for column 0","value for column 1"],"rawData":{"source":"visual","notes":""},"confidence":0.0}]}',
    `IMPORTANT: every cells array must contain exactly ${orderedColumns.length} positions.`,
    "confidence is 0 to 1 for the whole extracted row."
  ];

  if(clean(ocrText)){
    lines.push(
      "",
      "Google Document OCR text is provided below only as a secondary reading aid for deciphering characters.",
      "The ORIGINAL IMAGE/PDF is authoritative for physical row and column ownership.",
      "OCR text order is NOT column order.",
      "Never use OCR order to decide which cells[] position receives a value.",
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
      if(Array.isArray(row?.cells)){
        return row.cells.some(value=>clean(value));
      }

      const data =
        row?.data &&
        typeof row.data === "object"
          ? row.data
          : {};

      return Object.values(data)
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
        "The previous pass returned no usable row data. Re-read the ORIGINAL IMAGE/PDF. Return positional cells arrays in the exact ORDERED DOCUMENT COLUMNS order. Preserve blank cells as empty positions and never shift later values left or right."
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

  const orderedFields =
    (template?.fields || [])
      .map(field=>({
        internalKey:clean(field.internalKey),
        documentLabel:clean(field.label)
      }))
      .filter(field=>field.internalKey);

  return modelRows.map((modelRow,index)=>{
    const cells =
      Array.isArray(modelRow?.cells)
        ? modelRow.cells
        : [];

    const legacyIncoming =
      modelRow?.data &&
      typeof modelRow.data === "object"
        ? modelRow.data
        : {};

    const data = {};

    /*
      IMPORTANT:
      Visual rows are mapped by POSITION on the server.
      Gemini does not get to decide which GH Mobility key owns a value.
      Template field order == physical document column order.
    */
    for(let columnIndex=0;columnIndex<orderedFields.length;columnIndex++){
      const field=orderedFields[columnIndex];

      if(Array.isArray(modelRow?.cells)){
        data[field.internalKey] =
          clean(cells[columnIndex]);
      }else{
        // Backward-compatible fallback only if an older model response is returned.
        data[field.internalKey] =
          legacyIncoming[field.internalKey] ?? "";
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
            ? "GEMINI_POSITIONAL_WITH_GOOGLE_OCR_AID"
            : "GEMINI_POSITIONAL_EXTRACTED",
        _documentPages:
          (files || []).length,
        _ocrProvider:
          usefulOcr
            ? "GOOGLE_VISION"
            : "",
        _aiProvider:"GEMINI",
        _aiModel:result.model,
        _mappingMode:"POSITIONAL_TEMPLATE_ORDER",
        _expectedColumns:orderedFields.length,
        _receivedCells:cells.length,
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
