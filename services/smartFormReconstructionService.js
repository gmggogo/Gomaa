function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function pct(n){n=Number(n)||0;return `${Math.max(0,Math.min(1,n))*100}%`;}
function px(n,d=0){n=Number(n);return `${Number.isFinite(n)?n:d}px`;}
function styleBox(el){
  const b=el.bbox||{},s=el.style||{};
  return `left:${pct(b.x)};top:${pct(b.y)};width:${pct(b.width)};height:${pct(b.height)};`+
    `font-size:${px(s.fontSize,10)};font-weight:${esc(s.fontWeight||"normal")};text-align:${esc(s.textAlign||"left")};`+
    `color:${esc(s.color||"#111")};background:${esc(s.background||"transparent")};transform:rotate(${Number(s.rotation)||0}deg);`;
}
function renderElement(el){
  const common=`position:absolute;box-sizing:border-box;overflow:hidden;${styleBox(el)}`;
  const s=el.style||{}, bw=Math.max(0,Number(s.borderWidth)||1), bs=esc(s.borderStyle||"solid"), bc=esc(s.color||"#111");
  switch(String(el.type||"TEXT").toUpperCase()){
    case "LINE": return `<div style="${common}border-top:${bw}px ${bs} ${bc};height:0"></div>`;
    case "RECT": return `<div style="${common}border:${bw}px ${bs} ${bc}"></div>`;
    case "CHECKBOX": return `<div style="${common}border:${Math.max(1,bw)}px solid ${bc}"></div>`;
    case "CIRCLE": return `<div style="${common}border:${Math.max(1,bw)}px solid ${bc};border-radius:50%"></div>`;
    case "SIGNATURE_LINE": return `<div style="${common}border-bottom:${Math.max(1,bw)}px solid ${bc}"></div>`;
    case "IMAGE_PLACEHOLDER": return `<div style="${common}border:1px dashed #94a3b8;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px">IMAGE / LOGO</div>`;
    case "INPUT": return `<div style="${common}border-bottom:1px solid #111"></div>`;
    default: return `<div style="${common}white-space:pre-wrap;line-height:1.08">${esc(el.text||"")}</div>`;
  }
}
function renderField(f){
  const b=f.bbox||{};
  const base=`position:absolute;box-sizing:border-box;left:${pct(b.x)};top:${pct(b.y)};width:${pct(b.width)};height:${pct(b.height)};z-index:5;`;
  const id=esc(f.fieldId);
  const title=esc(f.label||f.fieldId);
  if(String(f.fieldType).toUpperCase()==="CHECKBOX"){
    return `<input aria-label="${title}" title="${title}" data-field="${id}" type="checkbox" style="${base}margin:0;opacity:.88">`;
  }
  if(String(f.fieldType).toUpperCase()==="SIGNATURE"){
    return `<div data-field="${id}" title="${title}" contenteditable="true" style="${base}border-bottom:1px solid #111;background:rgba(255,255,255,.06);outline:none"></div>`;
  }
  return `<input aria-label="${title}" title="${title}" data-field="${id}" type="text" style="${base}border:0;background:rgba(255,255,255,.01);outline:1px dashed rgba(37,99,235,.22);padding:1px 2px;font:inherit">`;
}
function buildHtml(template){
  const pages=Math.max(1,Number(template.pageCount)||1);
  const sizes=Array.isArray(template.pageSizes)?template.pageSizes:[];
  const els=Array.isArray(template.layoutElements)?template.layoutElements:[];
  const fields=Array.isArray(template.fields)?template.fields:[];
  const html=[];
  for(let page=1;page<=pages;page++){
    const size=sizes.find(x=>Number(x.page)===page)||{width:612,height:792};
    const ratio=(Number(size.height)||792)/(Number(size.width)||612);
    html.push(`<section class="sheet" style="aspect-ratio:1/${ratio};">${els.filter(x=>Number(x.page||1)===page).map(renderElement).join("")}${fields.filter(x=>Number(x.page||1)===page&&x.enabled!==false).map(renderField).join("")}</section>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#e2e8f0;font-family:Arial,Helvetica,sans-serif}.sheet{position:relative;width:min(100%,816px);margin:0 auto 18px;background:#fff;box-shadow:0 3px 16px rgba(15,23,42,.18);overflow:hidden}@media print{body{padding:0;background:#fff}.sheet{width:100%;margin:0;box-shadow:none;page-break-after:always}}</style>
</head><body>${html.join("")}</body></html>`;
}
module.exports={buildHtml};
