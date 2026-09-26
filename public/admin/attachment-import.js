const token = localStorage.getItem("token") || sessionStorage.getItem("staffToken") || "";
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
function clearNotice(){const n=$("notice");n.className="notice";n.textContent=""}

function setTab(name){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  $("setupPanel").classList.toggle("active",name==="setup");
  $("reviewPanel").classList.toggle("active",name==="review");
  $("aiLayout")?.classList.toggle("review-mode",name==="review");
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));

const GH_FIELD_OPTIONS = [
  {key:"clientName", label:"Customer Name", type:"TEXT", aliases:["Patient","Patient Name","Member Name","Passenger","Customer","Client Name"]},
  {key:"clientPhone", label:"Phone", type:"PHONE", aliases:["Member Phone","Telephone","Phone Number","Phone #"]},
  {key:"pickup", label:"Pickup Address", type:"ADDRESS", aliases:["Pickup Address","PU Address","Pick Up","Origin"]},
  {key:"stops", label:"Stops", type:"TEXT", aliases:["Stop","Stops","Additional Stop","Additional Stops"]},
  {key:"dropoff", label:"Dropoff Address", type:"ADDRESS", aliases:["Dropoff Address","DO Address","Drop Off","Destination"]},
  {key:"tripDate", label:"Trip Date", type:"DATE", aliases:["Date","Service Date","Trip Date","Pickup Date","Pick Up Date"]},
  {key:"tripTime", label:"Pickup Time", type:"TIME", aliases:["Time","PU Time","Pickup Time","Pick Up Time"]},
  {key:"service", label:"Service", type:"SERVICE", aliases:["Service","Service Type","Vehicle Type"]},
  {key:"appointmentTime", label:"Appointment Time", type:"TIME", aliases:["Appointment Time","Appt","Appt Time"]},
  {key:"returnTime", label:"Return Time", type:"TIME", aliases:["Return","Return Time"]},
  {key:"memberId", label:"Member ID", type:"TEXT", aliases:["Member ID","Member #","Medicaid ID"]},
  {key:"notes", label:"Notes", type:"NOTES", aliases:["Notes","Comments"]}
];
function ghFieldMeta(key){return GH_FIELD_OPTIONS.find(x=>x.key===key)||null}
function emptyField(){return {label:"",internalKey:"",type:"TEXT",required:false,visibleInReview:true,aliases:[],order:0}}
function ghFieldOptions(currentKey=""){
  const options=[`<option value="">Select GH Mobility field...</option>`];
  GH_FIELD_OPTIONS.forEach(x=>options.push(`<option value="${esc(x.key)}" ${x.key===currentKey?"selected":""}>${esc(x.label)}</option>`));
  if(currentKey&&!ghFieldMeta(currentKey))options.push(`<option value="${esc(currentKey)}" selected>${esc(currentKey)} (Existing custom field)</option>`);
  return options.join("");
}
function renderFields(){
  const fields=state.selected?.fields || [];
  $("fieldsEditor").innerHTML=fields.map((f,i)=>`
    <div class="field-row simple-field-row" data-field-row="${i}" data-original-type="${esc(f.type||"TEXT")}" data-original-aliases="${esc(JSON.stringify(f.aliases||[]))}">
      <div><label>Document Field</label><input data-k="label" value="${esc(f.label)}" placeholder="Example: Client Name"></div>
      <div><label>GH Mobility Field</label><select data-k="internalKey">${ghFieldOptions(f.internalKey)}</select></div>
      <div><label>Show in Review</label><select data-k="visibleInReview"><option value="true" ${f.visibleInReview!==false?"selected":""}>Show</option><option value="false" ${f.visibleInReview===false?"selected":""}>Hide</option></select></div>
      <div><label>Required</label><select data-k="required"><option value="false" ${!f.required?"selected":""}>No</option><option value="true" ${f.required?"selected":""}>Yes</option></select></div>
      <button class="btn btn-red field-delete" type="button" onclick="removeField(${i})" title="Delete field">×</button>
    </div>`).join("") || `<div class="meta">Add only the fields that appear on this organization's document.</div>`;
}
function collectFields(){
  return [...document.querySelectorAll("[data-field-row]")].map((row,i)=>{
    const label=clean(row.querySelector('[data-k="label"]').value);
    const internalKey=clean(row.querySelector('[data-k="internalKey"]').value);
    const meta=ghFieldMeta(internalKey);
    let oldAliases=[];
    try{oldAliases=JSON.parse(row.dataset.originalAliases||"[]")}catch(_){oldAliases=[]}
    return {
      label,
      internalKey,
      type:meta?.type || row.dataset.originalType || "TEXT",
      required:row.querySelector('[data-k="required"]').value==="true",
      visibleInReview:row.querySelector('[data-k="visibleInReview"]').value!=="false",
      aliases:meta?.aliases || oldAliases,
      order:i
    };
  }).filter(f=>f.label&&f.internalKey);
}
window.removeField=i=>{state.selected.fields.splice(i,1);renderFields()}
$("addFieldBtn").onclick=()=>{if(!state.selected)newTemplate();state.selected.fields.push(emptyField());renderFields()}

function newTemplate(){
  state.selected={_id:null,name:"New Template",organizationType:"INSURANCE",organizationName:"",fields:[
    {label:"Client Name",internalKey:"clientName",type:"TEXT",required:true,visibleInReview:true,aliases:["Patient","Patient Name","Member Name","Passenger","Customer","Client Name"],order:0},
    {label:"Pickup Date",internalKey:"tripDate",type:"DATE",required:true,visibleInReview:true,aliases:["Date","Service Date","Trip Date","Pickup Date","Pick Up Date"],order:1},
    {label:"Pickup Time",internalKey:"tripTime",type:"TIME",required:true,visibleInReview:true,aliases:["Time","PU Time","Pickup Time","Pick Up Time"],order:2},
    {label:"Phone #",internalKey:"clientPhone",type:"PHONE",required:false,visibleInReview:true,aliases:["Member Phone","Telephone","Phone Number","Phone #"],order:3},
    {label:"Pickup Address",internalKey:"pickup",type:"ADDRESS",required:true,visibleInReview:true,aliases:["Pickup Address","PU Address","Pick Up","Origin"],order:4},
    {label:"Stops",internalKey:"stops",type:"TEXT",required:false,visibleInReview:true,aliases:["Stop","Stops","Additional Stop","Additional Stops"],order:5},
    {label:"Drop Off Address",internalKey:"dropoff",type:"ADDRESS",required:true,visibleInReview:true,aliases:["Dropoff Address","DO Address","Drop Off","Destination"],order:6},
    {label:"Service",internalKey:"service",type:"SERVICE",required:false,visibleInReview:true,aliases:["Service","Service Type","Vehicle Type"],order:7}
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
    state.currentImport=data.import;state.services=data.services||[];renderReview();setTab("review");notice(`Document ${state.currentImport.documentNumber||""} read. ${state.currentImport.reviewRows?.length||0} review row(s).`)
  }catch(e){notice(e.message,false)}
};

function visibleReviewFields(){
  return (state.selected?.fields||[]).filter(f=>f.visibleInReview!==false);
}
function serviceOptions(row){
  return `<option value="">Select service...</option>${state.services.map(s=>`<option value="${esc(s.serviceKey)}" ${s.serviceKey===row.serviceKey?"selected":""}>${esc(s.title)} (${esc(s.serviceKey)})</option>`).join("")}`;
}
function confidenceText(value){
  const n=Number(value);
  return Number.isFinite(n) ? `${Math.round(n*100)}%` : "—";
}
function renderReview(){
  const imp=state.currentImport;
  const selectAll=$("selectAllRows");
  if(selectAll) selectAll.checked=false;

  if(!imp){
    $("reviewMeta").innerHTML="";
    $("reviewTable").innerHTML=`<div style="padding:18px" class="meta">Upload a file to start review.</div>`;
    return;
  }

  const fields=visibleReviewFields();
  $("reviewMeta").innerHTML=`
    <div><strong>Document #:</strong> ${esc(imp.documentNumber||"—")}</div>
    <div><strong>Daily Entry Date:</strong> ${esc(imp.dailyEntryDate||"—")}</div>
    <div><strong>Source:</strong> ${esc(imp.sourceType)} • ${(imp.sourceFiles||[]).length} page/file(s) ${(imp.sourceFiles||[]).length===2?'• <span class="frontback">Front + Back</span>':''}</div>
  `;

  const rows=imp.reviewRows||[];
  $("reviewTable").innerHTML=`<table class="review-table"><thead><tr>
    <th class="select-col">Select</th>
    <th class="daily-col">Daily #</th>
    ${fields.map(f=>`<th>${esc(f.label)}</th>`).join("")}
    <th>Service</th>
    <th>Confidence</th>
    <th>Validation / Trip #</th>
    <th class="submit-col">Submit</th>
  </tr></thead><tbody>${rows.map(r=>`
    <tr class="${r.validationErrors?.length?'bad':''} ${r.confirmed?'confirmed-row':''}" data-review-row="${r.rowIndex}">
      <td class="select-col"><input class="row-select" type="checkbox" data-select-row="${r.rowIndex}" ${r.confirmed?'disabled':''}></td>
      <td class="daily-col"><strong>${esc(r.dailyEntryNumber??'—')}</strong></td>
      ${fields.map(f=>`<td><input data-key="${esc(f.internalKey)}" value="${esc(r.data?.[f.internalKey]??'')}" ${r.confirmed?'disabled':''}></td>`).join("")}
      <td><select data-service ${r.confirmed?'disabled':''}>${serviceOptions(r)}</select><div class="meta">${esc(r.serviceResolution||'UNRESOLVED')}</div></td>
      <td>${confidenceText(r.extractionConfidence)}</td>
      <td><div class="error-text">${esc((r.validationErrors||[]).join(' • '))}</div>${r.tripNumber?`<strong>${esc(r.tripNumber)}</strong>`:''}</td>
      <td class="submit-col"><button class="btn ${r.confirmed?'btn-muted':'btn-green'} row-submit-btn" type="button" data-submit-row="${r.rowIndex}" ${r.confirmed?'disabled':''}>${r.confirmed?'Submitted':'Submit'}</button></td>
    </tr>`).join("")}</tbody></table>`;

  document.querySelectorAll("[data-submit-row]").forEach(btn=>{
    btn.addEventListener("click",()=>submitRows([Number(btn.dataset.submitRow)]));
  });
}

function collectReviewRows(){
  const fields=state.selected?.fields||[];
  return [...document.querySelectorAll("[data-review-row]")].map(tr=>{
    const original=(state.currentImport?.reviewRows||[]).find(r=>Number(r.rowIndex)===Number(tr.dataset.reviewRow));
    const data={...(original?.data||{})};
    fields.forEach(f=>{
      const input=tr.querySelector(`[data-key="${CSS.escape(f.internalKey)}"]`);
      if(input) data[f.internalKey]=input.value||"";
    });
    return {rowIndex:Number(tr.dataset.reviewRow),data,serviceKey:tr.querySelector("[data-service]")?.value||original?.serviceKey||""};
  });
}
async function saveReview(){
  if(!state.currentImport)throw new Error("No import to review");
  const data=await api(`/api/attachment-imports/${state.currentImport._id}/review`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({rows:collectReviewRows()})});
  state.currentImport=data.import;state.services=data.services||state.services;renderReview();return data;
}
$("saveReviewBtn").onclick=async()=>{try{await saveReview();notice("Review saved")}catch(e){notice(e.message,false)}};

function selectedRowIndexes(){
  return [...document.querySelectorAll(".row-select:checked")].map(x=>Number(x.dataset.selectRow)).filter(Number.isFinite);
}
$("selectAllRows").addEventListener("change",e=>{
  document.querySelectorAll(".row-select:not(:disabled)").forEach(cb=>{cb.checked=e.target.checked});
});

async function submitRows(rowIndexes){
  try{
    if(!state.currentImport) throw new Error("No import to submit");
    const indexes=(rowIndexes||[]).map(Number).filter(Number.isFinite);
    if(!indexes.length) throw new Error("Select at least one trip");

    await saveReview();
    const requested=new Set(indexes);
    const invalid=(state.currentImport.reviewRows||[]).filter(r=>requested.has(Number(r.rowIndex)) && r.validationErrors?.length);
    if(invalid.length) throw new Error("Fix validation errors in the selected trip(s) before Submit");

    const data=await api(`/api/attachment-imports/${state.currentImport._id}/confirm`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({rowIndexes:indexes})
    });
    state.currentImport=data.import;
    renderReview();
    notice(`${data.createdCount} trip(s) submitted to the normal GH Mobility flow.`);
  }catch(e){notice(e.message,false)}
}

$("submitSelectedBtn").onclick=()=>submitRows(selectedRowIndexes());

(async function init(){
  try{
    const feature=await api("/api/attachment-imports/feature");
    if(!feature.enabled){
      document.querySelector(".ai-main").innerHTML='<div class="notice err" style="display:block">Attachment Import is disabled for this company by Platform Admin.</div>';
      return;
    }
    await loadTemplates();
    renderReview();
  }catch(e){notice(e.message,false)}
})();
