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
    data:mapRawRow(rawData,template)
  }));
}

function imageOrPdfPlaceholderRows(files,template){
  /*
    The document is preserved immediately. OCR/vision extraction can be
    connected later without changing the stored document/template contract.
    Review still has one row so an admin can complete/correct mapped fields.
  */
  const blank = {};
  for(const field of template?.fields || []) blank[field.internalKey] = "";
  return [{
    rowIndex:0,
    rawData:{
      _documentPages:(files || []).length,
      _extractionStatus:"DOCUMENT_REVIEW_REQUIRED"
    },
    data:blank
  }];
}

function parseAttachment({files,template}){
  const sourceType = detectSourceType(files);
  let rows = [];

  if(sourceType === "CSV" || sourceType === "XLSX"){
    rows = parseStructuredFiles(files,template);
  }else if(sourceType === "MIXED"){
    const structured = (files || []).filter(file=>{
      const n = clean(file.originalname).toLowerCase();
      return /\.(csv|xlsx?|xls)$/.test(n) || /csv|spreadsheet|excel/.test(clean(file.mimetype).toLowerCase());
    });
    rows = structured.length
      ? parseStructuredFiles(structured,template)
      : imageOrPdfPlaceholderRows(files,template);
  }else{
    rows = imageOrPdfPlaceholderRows(files,template);
  }

  return { sourceType, rows };
}

module.exports = {
  parseAttachment,
  parseCsv,
  mapRawRow,
  normalizeKey
};
