const token = localStorage.getItem("token") || sessionStorage.getItem("staffToken") || "";
const role = localStorage.getItem("role") || sessionStorage.getItem("staffRole") || "";
if(!token){ location.href="/login.html"; }

const state = { templates:[], selected:null, currentImport:null, services:[] };
const $ = id=>document.getElementById(id);
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function clean(v){return String(v??"").trim()}
function authHeaders(extra={}){return {Authorization:`Bearer ${token}`,...extra}}
async function api(url,options={}){
  const res=await fetch(url,{...options,headers:authHeaders(options.headers||{})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.message||`Request failed (${res.status})`);
  return data;
}
function notice(msg,ok=true){const n=$("notice");n.textContent=msg;n.className=`notice ${ok?"ok":"err"}`}
function clearNotice(){$("notice").className="notice";$("notice").textContent=""}

function setTab(name){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  $("setupPanel").classList.toggle("active",name==="setup");
  $("reviewPanel").classList.toggle("active",name==="review");
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));

function emptyField(){return {label:"",internalKey:"",type:"TEXT",required:false,aliases:[],order:0}}
function renderFields(){
  const fields=state.selected?.fields || [];
  $("fieldsEditor").innerHTML=fields.map((f,i)=>`
    <div class="field-row" data-field-row="${i}">
      <div><label>Column Label</label><input data-k="label" value="${esc(f.label)}"></div>
      <div><label>GH Key</label><input data-k="internalKey" value="${esc(f.internalKey)}" placeholder="pickupAddress"></div>
      <div><label>Type</label><select data-k="type">${["TEXT","PHONE","DATE","TIME","NUMBER","ADDRESS","SERVICE","NOTES"].map(x=>`<option ${x===f.type?"selected":""}>${x}</option>`).join("")}</select></div>
      <div><label>Required</label><select data-k="required"><option value="false" ${!f.required?"selected":""}>No</option><option value="true" ${f.required?"selected":""}>Yes</option></select></div>
      <div><label>Aliases (comma separated)</label><input data-k="aliases" value="${esc((f.aliases||[]).join(", "))}"></div>
      <button class="btn btn-red" type="button" onclick="removeField(${i})">×</button>
    </div>`).join("") || `<div class="meta">Add the fields this organization's paper or spreadsheet contains.</div>`;
}
function collectFields(){
  return [...document.querySelectorAll("[data-field-row]")].map((row,i)=>({
    label:clean(row.querySelector('[data-k="label"]').value),
    internalKey:clean(row.querySelector('[data-k="internalKey"]').value),
    type:clean(row.querySelector('[data-k="type"]').value).toUpperCase(),
    required:row.querySelector('[data-k="required"]').value==="true",
    aliases:row.querySelector('[data-k="aliases"]').value.split(",").map(clean).filter(Boolean),
    order:i
  })).filter(f=>f.label&&f.internalKey);
}
window.removeField=i=>{state.selected.fields.splice(i,1);renderFields()}
$("addFieldBtn").onclick=()=>{if(!state.selected) newTemplate();state.selected.fields.push(emptyField());renderFields()}

function newTemplate(){
  state.selected={_id:null,name:"New Template",organizationType:"INSURANCE",organizationName:"",fields:[
    {label:"Customer Name",internalKey:"clientName",type:"TEXT",required:true,aliases:["Patient","Member Name","Passenger"],order:0},
    {label:"Phone",internalKey:"clientPhone",type:"PHONE",required:false,aliases:["Member Phone","Telephone"],order:1},
    {label:"Pickup",internalKey:"pickup",type:"ADDRESS",required:true,aliases:["Pickup Address","PU Address","Origin"],order:2},
    {label:"Dropoff",internalKey:"dropoff",type:"ADDRESS",required:true,aliases:["Dropoff Address","DO Address","Destination"],order:3},
    {label:"Trip Date",internalKey:"tripDate",type:"DATE",required:true,aliases:["Date","Service Date"],order:4},
    {label:"Pickup Time",internalKey:"tripTime",type:"TIME",required:true,aliases:["Time","PU Time"],order:5},
    {label:"Service",internalKey:"service",type:"SERVICE",required:false,aliases:["Service Type","Vehicle Type"],order:6},
    {label:"Appointment Time",internalKey:"appointmentTime",type:"TIME",required:false,aliases:["Appt","Appt Time"],order:7},
    {label:"Return Time",internalKey:"returnTime",type:"TIME",required:false,aliases:["Return"],order:8},
    {label:"Member ID",internalKey:"memberId",type:"TEXT",required:false,aliases:["Member #","Medicaid ID"],order:9},
    {label:"Notes",internalKey:"notes",type:"NOTES",required:false,aliases:["Comments"],order:10}
  ],signaturePosition:{page:1,xPercent:62,yPercent:78,widthPercent:28,heightPercent:12}};
  fillTemplateForm();renderTemplateList();
}
function fillTemplateForm(){
  const t=state.selected;if(!t)return;
  $("templateName").value=t.name||"";$("organizationType").value=t.organizationType||"INSURANCE";$("organizationName").value=t.organizationName||"";
  const p=t.signaturePosition||{};$("sigPage").value=p.page||1;$("sigX").value=p.xPercent??62;$("sigY").value=p.yPercent??78;$("sigW").value=p.widthPercent??28;$("sigH").value=p.heightPercent??12;
  renderFields();
}
function templatePayload(){return {
  name:clean($("templateName").value),organizationType:$("organizationType").value,organizationName:clean($("organizationName").value),
  fields:collectFields(),sourceTypes:["CSV","XLSX","IMAGE","PDF"],active:true,
  signaturePosition:{page:Number($("sigPage").value||1),xPercent:Number($("sigX").value||62),yPercent:Number($("sigY").value||78),widthPercent:Number($("sigW").value||28),heightPercent:Number($("sigH").value||12)}
}}
function renderTemplateList(){
  $("templateList").innerHTML=state.templates.map(t=>`<button class="template-btn ${state.selected?._id===t._id?"active":""}" onclick="selectTemplate('${t._id}')">${esc(t.name)}<div style="font-size:11px;font-weight:600;opacity:.8">${esc(t.organizationName||t.organizationType)}</div></button>`).join("") || `<div class="meta">No templates yet.</div>`;
}
window.selectTemplate=id=>{state.selected=state.templates.find(t=>t._id===id)||null;fillTemplateForm();renderTemplateList()}
async function loadTemplates(){
  const data=await api("/api/attachment-templates");state.templates=data.templates||[];
  if(!state.selected&&state.templates.length)state.selected=state.templates[0];
  renderTemplateList();if(state.selected)fillTemplateForm();
}
$("newTemplateBtn").onclick=()=>newTemplate();
$("duplicateTemplateBtn").onclick=()=>{if(!state.selected)return;const c=JSON.parse(JSON.stringify(state.selected));c._id=null;c.name=`${c.name} Copy`;state.selected=c;fillTemplateForm();renderTemplateList()}
$("deleteTemplateBtn").onclick=async()=>{if(!state.selected?._id)return;if(!confirm("Delete this template?"))return;try{await api(`/api/attachment-templates/${state.selected._id}`,{method:"DELETE"});state.selected=null;await loadTemplates();notice("Template deleted") }catch(e){notice(e.message,false)}};
$("saveTemplateBtn").onclick=async()=>{try{const payload=templatePayload();if(!payload.name)throw new Error("Template name is required");if(!payload.fields.length)throw new Error("Add at least one field");const data=state.selected?._id?await api(`/api/attachment-templates/${state.selected._id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}):await api("/api/attachment-templates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});state.selected=data.template;await loadTemplates();state.selected=state.templates.find(t=>t._id===data.template._id)||data.template;fillTemplateForm();renderTemplateList();notice("Template saved") }catch(e){notice(e.message,false)}};

$("uploadBtn").onclick=async()=>{
  try{
    clearNotice();if(!state.selected?._id)throw new Error("Save and select a template first");
    const files=[...$("attachmentFiles").files];if(!files.length)throw new Error("Select at least one file");
    const fd=new FormData();fd.append("templateId",state.selected._id);files.forEach(f=>fd.append("files",f));
    const res=await fetch("/api/attachment-imports/upload",{method:"POST",headers:authHeaders(),body:fd});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.message||"Upload failed");
    state.currentImport=data.import;state.services=data.services||[];renderReview();setTab("review");notice(`Attachment read. ${state.currentImport.reviewRows?.length||0} review row(s).`)
  }catch(e){notice(e.message,false)}
};
function renderReview(){
  const imp=state.currentImport;if(!imp){$("reviewTable").innerHTML=`<div style="padding:18px" class="meta">Upload a file to start review.</div>`;return}
  const t=state.selected||{};const fields=t.fields||[];
  $("reviewMeta").innerHTML=`Import <strong>${esc(imp._id)}</strong> • ${esc(imp.sourceType)} • ${(imp.sourceFiles||[]).length} source page/file(s) ${(imp.sourceFiles||[]).length===2?'• <span class="frontback">Front + Back</span>':''}`;
  $("reviewTable").innerHTML=`<table><thead><tr><th>#</th>${fields.map(f=>`<th>${esc(f.label)}</th>`).join("")}<th>Service</th><th>Validation</th></tr></thead><tbody>${(imp.reviewRows||[]).map(r=>`<tr class="${r.validationErrors?.length?'bad':''}" data-review-row="${r.rowIndex}"><td>${r.rowIndex+1}</td>${fields.map(f=>`<td><input data-key="${esc(f.internalKey)}" value="${esc(r.data?.[f.internalKey]??'')}"></td>`).join("")}<td><select data-service><option value="">Select service...</option>${state.services.map(s=>`<option value="${esc(s.serviceKey)}" ${s.serviceKey===r.serviceKey?'selected':''}>${esc(s.title)} (${esc(s.serviceKey)})</option>`).join("")}</select><div class="meta">${esc(r.serviceResolution||'UNRESOLVED')}</div></td><td><div class="error-text">${esc((r.validationErrors||[]).join(' • '))}</div>${r.tripNumber?`<strong>${esc(r.tripNumber)}</strong>`:''}</td></tr>`).join("")}</tbody></table>`;
}
function collectReviewRows(){
  const fields=state.selected?.fields||[];return [...document.querySelectorAll("[data-review-row]")].map(tr=>{const data={};fields.forEach(f=>{data[f.internalKey]=tr.querySelector(`[data-key="${CSS.escape(f.internalKey)}"]`)?.value||""});return {rowIndex:Number(tr.dataset.reviewRow),data,serviceKey:tr.querySelector("[data-service]")?.value||""}})
}
async function saveReview(){if(!state.currentImport)throw new Error("No import to review");const data=await api(`/api/attachment-imports/${state.currentImport._id}/review`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({rows:collectReviewRows()})});state.currentImport=data.import;state.services=data.services||state.services;renderReview();return data}
$("saveReviewBtn").onclick=async()=>{try{await saveReview();notice("Review saved")}catch(e){notice(e.message,false)}};
$("confirmImportBtn").onclick=async()=>{try{await saveReview();if((state.currentImport.reviewRows||[]).some(r=>r.validationErrors?.length))throw new Error("Fix all validation errors before Confirm");const data=await api(`/api/attachment-imports/${state.currentImport._id}/confirm`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});state.currentImport=data.import;renderReview();notice(`${data.createdCount} trip(s) created. Attachment trips now follow the normal GH Mobility flow.`)}catch(e){notice(e.message,false)}};

(async function init(){try{const feature=await api("/api/attachment-imports/feature");if(!feature.enabled){document.querySelector(".ai-main").innerHTML='<div class="notice err" style="display:block">Attachment Import is disabled for this company by Platform Admin.</div>';return}await loadTemplates();renderReview()}catch(e){notice(e.message,false)}})();
