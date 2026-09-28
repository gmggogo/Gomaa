function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function pct(n){n=Number(n)||0;return `${Math.max(0,Math.min(1,n))*100}%`;}
function px(n,d=0){n=Number(n);return `${Number.isFinite(n)?n:d}px`;}

function styleBox(el){
  const b=el?.bbox||{},s=el?.style||{};
  return `left:${pct(b.x)};top:${pct(b.y)};width:${pct(b.width)};height:${pct(b.height)};`+
    `font-size:${px(s.fontSize,10)};font-weight:${esc(s.fontWeight||"normal")};text-align:${esc(s.textAlign||"left")};`+
    `color:${esc(s.color||"#111")};background:${esc(s.background||"transparent")};transform:rotate(${Number(s.rotation)||0}deg);`;
}

function renderElement(el){
  const common=`position:absolute;box-sizing:border-box;overflow:hidden;${styleBox(el)}`;
  const s=el?.style||{};
  const bw=Math.max(0,Number(s.borderWidth)||1);
  const bs=esc(s.borderStyle||"solid");
  const bc=esc(s.color||"#111");
  switch(String(el?.type||"TEXT").toUpperCase()){
    case "LINE":
      return `<div class="sf-static" style="${common}border-top:${bw}px ${bs} ${bc};height:0"></div>`;
    case "RECT":
      return `<div class="sf-static" style="${common}border:${bw}px ${bs} ${bc}"></div>`;
    case "CHECKBOX":
      return `<div class="sf-static" style="${common}border:${Math.max(1,bw)}px solid ${bc}"></div>`;
    case "CIRCLE":
      return `<div class="sf-static" style="${common}border:${Math.max(1,bw)}px solid ${bc};border-radius:50%"></div>`;
    case "SIGNATURE_LINE":
      return `<div class="sf-static" style="${common}border-bottom:${Math.max(1,bw)}px solid ${bc}"></div>`;
    case "IMAGE_PLACEHOLDER":
      return `<div class="sf-static image-placeholder" style="${common}"></div>`;
    case "INPUT":
      return `<div class="sf-static" style="${common}border-bottom:1px solid #111"></div>`;
    default:
      return `<div class="sf-static" style="${common}white-space:pre-wrap;line-height:1.08">${esc(el?.text||"")}</div>`;
  }
}

function inputType(fieldType){
  switch(String(fieldType||"").toUpperCase()){
    case "DATE":return "date";
    case "TIME":return "time";
    case "NUMBER":return "number";
    case "PHONE":return "tel";
    default:return "text";
  }
}

function renderField(f){
  const b=f?.bbox||{};
  const base=`position:absolute;box-sizing:border-box;left:${pct(b.x)};top:${pct(b.y)};width:${pct(b.width)};height:${pct(b.height)};z-index:20;`;
  const id=esc(f?.fieldId);
  const title=esc(f?.label||f?.fieldId||"Field");
  const type=String(f?.fieldType||"TEXT").toUpperCase();

  if(type==="CHECKBOX"){
    return `<input aria-label="${title}" title="${title}" data-field="${id}" type="checkbox" class="sf-control sf-check" style="${base}">`;
  }
  if(type==="SIGNATURE"){
    return `<div aria-label="${title}" data-field="${id}" title="${title}" contenteditable="true" class="sf-control sf-signature" style="${base}"></div>`;
  }
  return `<input aria-label="${title}" title="${title}" data-field="${id}" type="${inputType(type)}" class="sf-control" style="${base}">`;
}

function buildHtml(template){
  const pages=Math.max(1,Number(template?.pageCount)||1);
  const sizes=Array.isArray(template?.pageSizes)?template.pageSizes:[];
  const els=Array.isArray(template?.layoutElements)?template.layoutElements:[];
  const fields=Array.isArray(template?.fields)?template.fields:[];
  const body=[];

  const hasLayout=els.length>0;
  const hasFields=fields.some(f=>f?.enabled!==false);

  if(!hasLayout){
    body.push(`<div class="warning">
      This template has no saved reconstruction layout. It was probably created before the reconstruction route was fixed.
      Re-upload/rebuild this template once so GH Mobility can save its text, tables, lines and controls.
    </div>`);
  }

  for(let page=1;page<=pages;page++){
    const size=sizes.find(x=>Number(x?.page)===page)||{width:612,height:792};
    const width=Math.max(200,Number(size.width)||612);
    const height=Math.max(200,Number(size.height)||792);
    const pageEls=els.filter(x=>Number(x?.page||1)===page);
    const pageFields=fields.filter(x=>Number(x?.page||1)===page&&x?.enabled!==false);
    body.push(
      `<section class="sheet" data-page="${page}" style="aspect-ratio:${width}/${height};">`+
      pageEls.map(renderElement).join("")+
      pageFields.map(renderField).join("")+
      `</section>`
    );
  }

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;font-family:Arial,Helvetica,sans-serif}
body{padding:18px;background:#e2e8f0;color:#111}
.warning{max-width:816px;margin:0 auto 12px;padding:10px 12px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;border-radius:8px;font-size:12px;font-weight:700}
.sheet{position:relative;width:min(100%,816px);margin:0 auto 18px;background:#fff;box-shadow:0 3px 16px rgba(15,23,42,.18);overflow:hidden}
.sf-static{position:absolute}
.image-placeholder{border:1px dashed #94a3b8;background:transparent}
.sf-control{border:0;background:rgba(255,255,255,.001);outline:1px dashed rgba(37,99,235,.22);padding:1px 2px;font:inherit}
.sf-control:focus{outline:2px solid #2563eb;background:rgba(219,234,254,.2)}
.sf-check{margin:0;opacity:.92}
.sf-signature{border-bottom:1px solid #111;outline:1px dashed rgba(37,99,235,.22)}
@media print{
  body{padding:0;background:#fff}
  .warning{display:none}
  .sheet{width:100%;margin:0;box-shadow:none;page-break-after:always}
  .sf-control{outline:none}
}
</style></head><body>${body.join("")}</body></html>`;
}

module.exports={buildHtml};
