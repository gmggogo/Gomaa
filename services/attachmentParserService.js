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

function responseOutputText(payload){
  if(clean(payload?.output_text)) return clean(payload.output_text);

  const parts = [];
  for(const item of payload?.output || []){
    for(const content of item?.content || []){
      if(content?.type === "output_text" && clean(content?.text)){
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function fieldSpecForVision(template){
  return (template?.fields || []).map(field=>({
    documentLabel:clean(field.label),
    internalKey:clean(field.internalKey),
    aliases:Array.isArray(field.aliases) ? field.aliases.map(clean).filter(Boolean) : [],
    required:field.required === true
  }));
}

function toVisionContent(files){
  const content = [];

  for(const file of files || []){
    const name = clean(file.originalname) || "document";
    const mime = clean(file.mimetype).toLowerCase();
    const base64 = file.buffer.toString("base64");

    if(mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")){
      content.push({
        type:"input_file",
        filename:name,
        file_data:base64
      });
    }else if(mime.startsWith("image/")){
      content.push({
        type:"input_image",
        image_url:`data:${mime || "image/jpeg"};base64,${base64}`,
        detail:"high"
      });
    }
  }

  return content;
}

async function parseVisualDocument(files,template){
  const apiKey = clean(process.env.OPENAI_API_KEY);
  if(!apiKey){
    const err = new Error("Image/PDF reading requires OPENAI_API_KEY on the server");
    err.statusCode = 503;
    throw err;
  }

  const fields = fieldSpecForVision(template);
  const prompt = [
    "You are extracting transportation reservation trips from uploaded documents.",
    "The document can be a photo, scan, PDF, handwritten sheet, printed form, or hand-drawn table.",
    "Read handwriting carefully. Detect table headers and row boundaries. Every passenger/trip row is a separate output row.",
    "If two images are provided they can be FRONT and BACK of the same physical document; use both together.",
    "Do not invent values. If a value is unreadable or absent, return an empty string for that field.",
    "Preserve addresses, names, dates, times and phone numbers as written as closely as possible.",
    "For a Stops field, preserve multiple stops in one string separated by semicolons.",
    "Return JSON only. No markdown.",
    `Template fields: ${JSON.stringify(fields)}`,
    "Required JSON shape:",
    '{"rows":[{"data":{"<internalKey>":"value"},"rawData":{"source":"visual","notes":""},"confidence":0.0}]}',
    "Include every template internalKey inside each row.data object, even when blank.",
    "confidence is 0 to 1 for the whole extracted row."
  ].join("\n");

  const content = [
    { type:"input_text", text:prompt },
    ...toVisionContent(files)
  ];

  if(content.length <= 1){
    return blankDocumentRow(files,template,"UNSUPPORTED_VISUAL_FILE");
  }

  const model = clean(process.env.ATTACHMENT_VISION_MODEL) || "gpt-5.6-luna";
  const response = await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${apiKey}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model,
      input:[{ role:"user", content }]
    })
  });

  const payload = await response.json().catch(()=>({}));
  if(!response.ok){
    const message = clean(payload?.error?.message) || `Vision extraction failed (${response.status})`;
    const err = new Error(message);
    err.statusCode = 502;
    throw err;
  }

  const parsed = jsonFromModelText(responseOutputText(payload));
  const modelRows = Array.isArray(parsed?.rows) ? parsed.rows : [];

  if(!modelRows.length){
    return blankDocumentRow(files,template,"VISION_NO_ROWS_FOUND");
  }

  const requiredKeys = (template?.fields || []).map(f=>clean(f.internalKey)).filter(Boolean);

  return modelRows.map((modelRow,index)=>{
    const incoming = modelRow?.data && typeof modelRow.data === "object" ? modelRow.data : {};
    const data = {};
    for(const key of requiredKeys){
      data[key] = incoming[key] ?? "";
    }

    return {
      rowIndex:index,
      rawData:{
        ...(modelRow?.rawData && typeof modelRow.rawData === "object" ? modelRow.rawData : {}),
        _extractionStatus:"VISION_EXTRACTED",
        _documentPages:(files || []).length
      },
      data,
      extractionConfidence:Number.isFinite(Number(modelRow?.confidence))
        ? Math.max(0,Math.min(1,Number(modelRow.confidence)))
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
  parseVisualDocument
};
