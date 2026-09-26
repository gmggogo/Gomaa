const token = localStorage.getItem("token") || sessionStorage.getItem("staffToken") || "";
if(!token){ location.href="/login.html"; }

const state = {
  templates:[],
  selected:null,
  currentImport:null,
  services:[],
  editingRows:new Set(),
  shareRatings:new Map(),
  sharePlan:null
};
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
function syncFieldRowFromDom(row){
  if(!state.selected || !row) return;

  const index=Number(row.dataset.fieldRow);
  if(!Number.isFinite(index) || !state.selected.fields?.[index]) return;

  const current=state.selected.fields[index];
  const label=clean(row.querySelector('[data-k="label"]')?.value);
  const internalKey=clean(row.querySelector('[data-k="internalKey"]')?.value);
  const meta=ghFieldMeta(internalKey);

  let oldAliases=[];
  try{
    oldAliases=JSON.parse(row.dataset.originalAliases||"[]");
  }catch(_){
    oldAliases=[];
  }

  state.selected.fields[index]={
    ...current,
    label,
    internalKey,
    type:meta?.type || row.dataset.originalType || current.type || "TEXT",
    required:row.querySelector('[data-k="required"]')?.value==="true",
    visibleInReview:row.querySelector('[data-k="visibleInReview"]')?.value!=="false",
    aliases:meta?.aliases || oldAliases,
    order:index
  };
}

function bindFieldEditorSync(){
  document.querySelectorAll("[data-field-row]").forEach(row=>{
    row.querySelectorAll("input,select").forEach(control=>{
      control.addEventListener("input",()=>syncFieldRowFromDom(row));
      control.addEventListener("change",()=>syncFieldRowFromDom(row));
    });
  });
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

  bindFieldEditorSync();
}
function collectFields(){
  const rows=[...document.querySelectorAll("[data-field-row]")];

  rows.forEach(syncFieldRowFromDom);

  return rows.map((row,i)=>{
    const field=state.selected?.fields?.[i] || {};
    return {
      ...field,
      order:i
    };
  }).filter(f=>clean(f.label)&&clean(f.internalKey));
}
window.removeField=i=>{state.selected.fields.splice(i,1);renderFields()}
$("addFieldBtn").onclick=()=>{if(!state.selected)newTemplate();state.selected.fields.push(emptyField());renderFields()}

const STANDARD_DOCUMENT_FIELD_MAP = new Map([
  ["client name","clientName"],
  ["customer name","clientName"],
  ["phone","clientPhone"],
  ["phone #","clientPhone"],
  ["pickup","pickup"],
  ["pickup address","pickup"],
  ["pick up address","pickup"],
  ["stops","stops"],
  ["stop","stops"],
  ["dropoff","dropoff"],
  ["drop off","dropoff"],
  ["dropoff address","dropoff"],
  ["drop off address","dropoff"],
  ["pickup date","tripDate"],
  ["pick up date","tripDate"],
  ["trip date","tripDate"],
  ["pickup time","tripTime"],
  ["pick up time","tripTime"],
  ["notes","notes"]
]);

function normalizeTemplateLabel(value){
  return clean(value)
    .toLowerCase()
    .replace(/\s+/g," ")
    .trim();
}

function repairStandardTemplateMapping(){
  if(!state.selected?.fields?.length) return 0;

  let changed=0;

  state.selected.fields=state.selected.fields.map((field,index)=>{
    const wanted=STANDARD_DOCUMENT_FIELD_MAP.get(
      normalizeTemplateLabel(field.label)
    );

    if(!wanted || field.internalKey===wanted){
      return {...field,order:index};
    }

    const meta=ghFieldMeta(wanted);
    changed+=1;

    return {
      ...field,
      internalKey:wanted,
      type:meta?.type || field.type || "TEXT",
      aliases:meta?.aliases || field.aliases || [],
      order:index
    };
  });

  renderFields();
  return changed;
}


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
$("saveTemplateBtn").onclick=async()=>{
  try{
    document.querySelectorAll("[data-field-row]").forEach(syncFieldRowFromDom);

    const repaired=repairStandardTemplateMapping();
    const payload=templatePayload();

    if(!payload.name) throw new Error("Template name is required");
    if(!payload.fields.length) throw new Error("Add at least one field");

    const data=state.selected?._id
      ? await api(`/api/attachment-templates/${state.selected._id}`,{
          method:"PUT",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify(payload)
        })
      : await api("/api/attachment-templates",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify(payload)
        });

    state.selected=data.template;
    await loadTemplates();
    state.selected=state.templates.find(t=>t._id===data.template._id)||data.template;
    fillTemplateForm();
    renderTemplateList();

    notice(
      repaired
        ? `Template saved. ${repaired} standard field mapping(s) corrected.`
        : "Template saved"
    );
  }catch(e){
    notice(e.message,false);
  }
};

$("uploadBtn").onclick=async()=>{
  try{
    clearNotice();
    if(!state.selected?._id) throw new Error("Save and select a template first");

    const files=[...$("attachmentFiles").files];
    if(!files.length) throw new Error("Select at least one file");

    const fd=new FormData();
    fd.append("templateId",state.selected._id);
    files.forEach(f=>fd.append("files",f));

    const res=await fetch("/api/attachment-imports/upload",{
      method:"POST",
      headers:authHeaders(),
      body:fd
    });

    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message||"Upload failed");

    state.currentImport=data.import;
    state.services=data.services||[];
    state.editingRows.clear();
    state.shareRatings.clear();
    state.sharePlan=null;

    setTab("review");
    renderReview();

    /*
      One browser request validates/corrects all Pickup / Stops / Dropoff
      addresses for the whole imported document.
    */
    await validateAddresses({silent:true});

    notice(
      `Document ${state.currentImport.documentNumber||""} read. ` +
      `${state.currentImport.reviewRows?.length||0} review row(s). Addresses checked.`
    );
  }catch(e){
    notice(e.message,false);
  }
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
function shareServiceEnabled(){
  return state.services.some(service=>{
    const code=clean(service?.serviceKey).toUpperCase();
    const title=clean(service?.title).toUpperCase();
    return code==="SH" || title==="SHARED" || title.includes("SHARED");
  });
}

function ensureReviewActionButtons(){
  const submitBtn=$("submitSelectedBtn");
  const toolbar=submitBtn?.parentElement || $("saveReviewBtn")?.parentElement;
  if(!toolbar) return;

  let validateBtn=$("validateAddressesBtn");
  if(!validateBtn){
    validateBtn=document.createElement("button");
    validateBtn.id="validateAddressesBtn";
    validateBtn.type="button";
    validateBtn.className="btn btn-muted";
    validateBtn.textContent="Validate Addresses";
    validateBtn.addEventListener("click",()=>validateAddresses({silent:false}));
    toolbar.appendChild(validateBtn);
  }

  let shareBtn=$("shareReviewBtn");
  if(!shareBtn){
    shareBtn=document.createElement("button");
    shareBtn.id="shareReviewBtn";
    shareBtn.type="button";
    shareBtn.className="btn btn-primary";
    shareBtn.textContent="Share";
    shareBtn.addEventListener("click",runShareEvaluation);
    toolbar.appendChild(shareBtn);
  }

  shareBtn.style.display=shareServiceEnabled() ? "" : "none";

  let result=$("shareReviewResult");
  if(!result){
    result=document.createElement("div");
    result.id="shareReviewResult";
    result.className="meta";
    result.style.marginLeft="8px";
    result.style.fontWeight="700";
    toolbar.appendChild(result);
  }

  if(!shareServiceEnabled()){
    result.textContent="";
  }

  let deleteBtn=$("deleteSelectedRowsBtn");
  if(!deleteBtn){
    deleteBtn=document.createElement("button");
    deleteBtn.id="deleteSelectedRowsBtn";
    deleteBtn.type="button";
    deleteBtn.className="btn btn-red";
    deleteBtn.textContent="Delete Selected";
    deleteBtn.addEventListener("click",deleteSelectedRows);
    toolbar.appendChild(deleteBtn);
  }
}

function injectReviewLockStyles(){
  if(document.getElementById("attachmentReviewLockStyles")) return;

  const style=document.createElement("style");
  style.id="attachmentReviewLockStyles";
  style.textContent=`
    .review-table input:disabled,
    .review-table select:disabled{
      background:#f3f6f9 !important;
      color:#334155 !important;
      opacity:1 !important;
      cursor:not-allowed;
    }
    .review-table .edit-col{min-width:92px;text-align:center}
    .review-table .share-col{min-width:110px;text-align:center}
    .review-table .share-match{font-weight:800;color:#087443}
    .review-table .share-no{font-weight:800;color:#9a3412}
    .review-table .share-wait{font-weight:700;color:#64748b}
    #deleteSelectedRowsBtn{
      margin-left:auto;
    }
  `;
  document.head.appendChild(style);
}

function shareRatingText(row){
  const value=state.shareRatings.get(Number(row.rowIndex)) || "";
  if(value==="MATCHED") return `<span class="share-match">Matched</span>`;
  if(value==="NOT_MATCHED") return `<span class="share-no">Not matched</span>`;
  if(value==="EXCLUDED") return `<span class="share-no">Excluded</span>`;
  return `<span class="share-wait">Not checked</span>`;
}

function renderReview(){
  const imp=state.currentImport;
  const selectAll=$("selectAllRows");
  if(selectAll) selectAll.checked=false;

  ensureReviewActionButtons();
  injectReviewLockStyles();

  if(!imp){
    $("reviewMeta").innerHTML="";
    $("reviewTable").innerHTML=`<div style="padding:18px" class="meta">Upload a file to start review.</div>`;
    return;
  }

  const fields=visibleReviewFields();
  const showShare=shareServiceEnabled();

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
    ${showShare?'<th class="share-col">Share Rating</th>':''}
    <th>Validation / Trip #</th>
    <th class="edit-col">Edit</th>
    <th class="submit-col">Submit</th>
  </tr></thead><tbody>${rows.map(r=>{
    const rowIndex=Number(r.rowIndex);
    const editing=!r.confirmed && state.editingRows.has(rowIndex);
    const locked=!editing || r.confirmed;

    return `
    <tr class="${r.validationErrors?.length?'bad':''} ${r.confirmed?'confirmed-row':''}" data-review-row="${r.rowIndex}">
      <td class="select-col"><input class="row-select" type="checkbox" data-select-row="${r.rowIndex}" ${r.confirmed?'disabled':''}></td>
      <td class="daily-col"><strong>${esc(r.dailyEntryNumber??'—')}</strong></td>
      ${fields.map(f=>`<td><input data-key="${esc(f.internalKey)}" value="${esc(r.data?.[f.internalKey]??'')}" ${locked?'disabled':''}></td>`).join("")}
      <td>
        <select data-service ${locked?'disabled':''}>${serviceOptions(r)}</select>
        <div class="meta">${esc(r.serviceResolution||'UNRESOLVED')}</div>
      </td>
      <td>${confidenceText(r.extractionConfidence)}</td>
      ${showShare?`<td class="share-col">${shareRatingText(r)}</td>`:''}
      <td>
        <div class="error-text">${esc((r.validationErrors||[]).join(' • '))}</div>
        ${r.tripNumber?`<strong>${esc(r.tripNumber)}</strong>`:''}
      </td>
      <td class="edit-col">
        <button
          class="btn ${r.confirmed?'btn-muted':(editing?'btn-green':'btn-muted')}"
          type="button"
          data-edit-row="${r.rowIndex}"
          ${r.confirmed?'disabled':''}
        >${r.confirmed?'Locked':(editing?'Save':'Edit')}</button>
      </td>
      <td class="submit-col">
        <button
          class="btn ${r.confirmed?'btn-muted':'btn-green'} row-submit-btn"
          type="button"
          data-submit-row="${r.rowIndex}"
          ${r.confirmed?'disabled':''}
        >${r.confirmed?'Submitted':'Submit'}</button>
      </td>
    </tr>`;
  }).join("")}</tbody></table>`;

  document.querySelectorAll("[data-submit-row]").forEach(btn=>{
    btn.addEventListener("click",()=>submitRows([Number(btn.dataset.submitRow)]));
  });

  document.querySelectorAll("[data-edit-row]").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      const rowIndex=Number(btn.dataset.editRow);
      if(state.editingRows.has(rowIndex)){
        await saveEditedRow(rowIndex);
      }else{
        state.editingRows.add(rowIndex);
        renderReview();
      }
    });
  });
}

function findFieldInput(tr,internalKey){
  return [...tr.querySelectorAll("[data-key]")].find(
    input=>String(input.dataset.key||"")===String(internalKey||"")
  ) || null;
}

function collectReviewRows(rowIndexes=null){
  const fields=state.selected?.fields||[];
  const wanted=Array.isArray(rowIndexes)
    ? new Set(rowIndexes.map(Number).filter(Number.isFinite))
    : null;

  return [...document.querySelectorAll("[data-review-row]")]
    .filter(tr=>!wanted || wanted.has(Number(tr.dataset.reviewRow)))
    .map(tr=>{
      const rowIndex=Number(tr.dataset.reviewRow);
      const original=(state.currentImport?.reviewRows||[])
        .find(r=>Number(r.rowIndex)===rowIndex);

      const data={...(original?.data||{})};

      fields.forEach(f=>{
        const input=findFieldInput(tr,f.internalKey);
        if(input) data[f.internalKey]=input.value||"";
      });

      const serviceSelect=tr.querySelector("[data-service]");
      const serviceKey=serviceSelect
        ? serviceSelect.value||""
        : original?.serviceKey||"";

      return {
        rowIndex,
        data,
        serviceKey
      };
    });
}


async function deleteSelectedRows(){
  try{
    if(!state.currentImport){
      throw new Error("No import to edit");
    }

    const indexes=selectedRowIndexes();
    if(!indexes.length){
      throw new Error("Select at least one trip to delete");
    }

    const confirmed=(state.currentImport.reviewRows||[]).filter(
      row=>indexes.includes(Number(row.rowIndex)) && (row.confirmed || row.tripId)
    );

    if(confirmed.length){
      throw new Error(
        "Submitted trips cannot be deleted from Import Review. " +
        "Select only trips that have not been submitted."
      );
    }

    if(!confirm(
      indexes.length === 1
        ? "Delete this selected trip from Import Review?"
        : `Delete these ${indexes.length} selected trips from Import Review?`
    )){
      return;
    }

    const data=await api(
      `/api/attachment-imports/${state.currentImport._id}/review-rows`,
      {
        method:"DELETE",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({rowIndexes:indexes})
      }
    );

    state.currentImport=data.import;
    indexes.forEach(index=>{
      state.editingRows.delete(Number(index));
      state.shareRatings.delete(Number(index));
    });

    renderReview();

    const blocked=Array.isArray(data.blocked) ? data.blocked : [];
    if(blocked.length){
      notice(
        `${data.deletedCount||0} trip(s) deleted. ` +
        `Submitted row(s) ${blocked.join(", ")} were kept.`,
        false
      );
    }else{
      notice(`${data.deletedCount||0} trip(s) deleted from Import Review.`);
    }
  }catch(e){
    notice(e.message,false);
  }
}

async function saveRows(rowIndexes=null,{render=true}={}){
  if(!state.currentImport){
    throw new Error("No import to review");
  }

  const rows=collectReviewRows(rowIndexes);

  if(!rows.length){
    throw new Error("No review rows found to save");
  }

  const data=await api(
    `/api/attachment-imports/${state.currentImport._id}/review`,
    {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({rows})
    }
  );

  state.currentImport=data.import;
  state.services=data.services||state.services;

  if(render){
    renderReview();
  }

  return data;
}

async function saveEditedRow(rowIndex){
  try{
    await saveRows([rowIndex],{render:false});
    state.editingRows.delete(Number(rowIndex));
    renderReview();
    notice(`Row ${rowIndex} saved`);
  }catch(e){
    notice(e.message,false);
  }
}

async function validateAddresses({silent=false,rowIndexes=null}={}){
  if(!state.currentImport) return null;

  try{
    const data=await api(
      `/api/attachment-imports/${state.currentImport._id}/validate-addresses`,
      {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          rowIndexes:Array.isArray(rowIndexes) ? rowIndexes : undefined
        })
      }
    );

    state.currentImport=data.import;
    state.services=data.services||state.services;
    renderReview();

    if(!silent){
      notice(`${data.checkedRows||0} trip row(s) checked with one address-validation request.`);
    }

    return data;
  }catch(e){
    if(!silent) notice(e.message,false);
    else notice(`Address validation warning: ${e.message}`,false);
    return null;
  }
}

function reviewRowCandidate(row){
  const data=row?.data||{};
  const id=`ATT-${state.currentImport?._id||"DOC"}-${row.rowIndex}`;

  return {
    id,
    pairId:id,
    tripLeg:"OUTBOUND",
    generatedReturn:false,
    clientName:clean(data.clientName),
    clientPhone:clean(data.clientPhone),
    pickup:clean(data.pickup),
    dropoff:clean(data.dropoff),
    pickupLat:Number.isFinite(Number(data.pickupLat)) ? Number(data.pickupLat) : null,
    pickupLng:Number.isFinite(Number(data.pickupLng)) ? Number(data.pickupLng) : null,
    dropoffLat:Number.isFinite(Number(data.dropoffLat)) ? Number(data.dropoffLat) : null,
    dropoffLng:Number.isFinite(Number(data.dropoffLng)) ? Number(data.dropoffLng) : null,
    tripDate:clean(data.tripDate),
    tripTime:clean(data.tripTime),
    pickupTime:clean(data.tripTime),
    appointmentTime:clean(data.appointmentTime),
    returnTime:clean(data.returnTime),
    notes:clean(data.notes),
    source:"company",
    sharedEngineSource:"COMPANY",
    company:clean(data.company || data.facility || data.insurance || state.selected?.organizationName),
    companyName:clean(data.company || data.facility || data.insurance || state.selected?.organizationName),
    facilityName:clean(data.company || data.facility || data.insurance || state.selected?.organizationName),
    status:"Scheduled",
    attachmentRowIndex:Number(row.rowIndex)
  };
}

function collectIdsFromPlanRows(rows){
  const ids=new Set();
  (Array.isArray(rows)?rows:[]).forEach(item=>{
    const id=clean(item?.id || item?.tripId);
    if(id) ids.add(id);
  });
  return ids;
}

async function runShareEvaluation(){
  try{
    if(!shareServiceEnabled()){
      throw new Error("Shared service is not enabled for this company");
    }

    if(!state.currentImport){
      throw new Error("No import to review");
    }

    await saveReview();

    const selected=selectedRowIndexes();
    const selectedSet=new Set(selected.map(Number));

    const rows=(state.currentImport.reviewRows||[]).filter(row=>{
      if(row.confirmed) return false;
      if(selectedSet.size && !selectedSet.has(Number(row.rowIndex))) return false;
      return true;
    });

    if(rows.length < 2){
      throw new Error("Select at least 2 trips for Share evaluation");
    }

    const trips=rows.map(reviewRowCandidate);

    const res=await fetch("/api/company-shared/plan",{
      method:"POST",
      headers:authHeaders({"Content-Type":"application/json"}),
      body:JSON.stringify({trips})
    });

    const data=await res.json().catch(()=>({}));
    if(!res.ok){
      throw new Error(data.message || "Shared planning failed");
    }

    state.sharePlan=data;
    state.shareRatings.clear();

    const matchedIds=new Set();
    (Array.isArray(data.groups)?data.groups:[]).forEach(group=>{
      collectIdsFromPlanRows(group?.trips).forEach(id=>matchedIds.add(id));
    });

    const singleIds=collectIdsFromPlanRows(data.singles);
    const excludedIds=collectIdsFromPlanRows(data.excluded);

    rows.forEach(row=>{
      const id=`ATT-${state.currentImport._id}-${row.rowIndex}`;
      if(matchedIds.has(id)) state.shareRatings.set(Number(row.rowIndex),"MATCHED");
      else if(excludedIds.has(id)) state.shareRatings.set(Number(row.rowIndex),"EXCLUDED");
      else if(singleIds.has(id)) state.shareRatings.set(Number(row.rowIndex),"NOT_MATCHED");
      else state.shareRatings.set(Number(row.rowIndex),"NOT_MATCHED");
    });

    renderReview();

    const groupCount=Array.isArray(data.groups)?data.groups.length:0;
    const matchedCount=[...state.shareRatings.values()].filter(x=>x==="MATCHED").length;
    const result=$("shareReviewResult");
    if(result){
      result.textContent=`Share: ${groupCount} group(s), ${matchedCount} matched trip(s)`;
    }

    notice(`Share engine checked ${rows.length} trip(s).`);
  }catch(e){
    notice(e.message,false);
  }
}

async function saveReview(){
  return await saveRows(null,{render:true});
}

$("saveReviewBtn").onclick=async()=>{
  try{
    await saveRows(null,{render:false});
    state.editingRows.clear();
    renderReview();
    notice("Review saved");
  }catch(e){
    notice(e.message,false);
  }
};

function selectedRowIndexes(){
  return [...document.querySelectorAll(".row-select:checked")].map(x=>Number(x.dataset.selectRow)).filter(Number.isFinite);
}
$("selectAllRows").addEventListener("change",e=>{
  document.querySelectorAll(".row-select:not(:disabled)").forEach(cb=>{cb.checked=e.target.checked});
});

async function submitRows(rowIndexes){
  try{
    if(!state.currentImport){
      throw new Error("No import to submit");
    }

    const indexes=(rowIndexes||[])
      .map(Number)
      .filter(Number.isFinite);

    if(!indexes.length){
      throw new Error("Select at least one trip");
    }

    /*
      Save exactly the trip row(s) being submitted.
      Do not re-render between Save and Submit, so the button action cannot
      lose its row selection or current values.
    */
    await saveRows(indexes,{render:false});

    const requested=new Set(indexes);
    const invalid=(state.currentImport.reviewRows||[]).filter(
      r=>requested.has(Number(r.rowIndex)) && r.validationErrors?.length
    );

    if(invalid.length){
      const message=invalid
        .map(r=>`Row ${r.rowIndex}: ${(r.validationErrors||[]).join(" • ")}`)
        .join(" | ");
      renderReview();
      throw new Error(message || "Fix validation errors before Submit");
    }

    const data=await api(
      `/api/attachment-imports/${state.currentImport._id}/confirm`,
      {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({rowIndexes:indexes})
      }
    );

    state.currentImport=data.import;

    const failed=indexes.filter(index=>{
      const row=(state.currentImport.reviewRows||[]).find(
        item=>Number(item.rowIndex)===Number(index)
      );
      return !row?.confirmed || !row?.tripId || !row?.tripNumber;
    });

    indexes.forEach(index=>state.editingRows.delete(Number(index)));
    renderReview();

    if(failed.length){
      throw new Error(
        `Trip creation failed for row(s): ${failed.join(", ")}. ` +
        "They were kept in Import Review."
      );
    }

    const numbers=(data.trips||[])
      .map(t=>t.tripNumber)
      .filter(Boolean)
      .join(", ");

    notice(
      `${data.createdCount} trip(s) created in Trips Hub` +
      (numbers ? `: ${numbers}` : ".")
    );
  }catch(e){
    notice(e.message,false);
  }
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

    try{
      const serviceData=await api("/api/attachment-imports/services");
      state.services=serviceData.services||state.services;
    }catch(_){}

    ensureReviewActionButtons();
    renderReview();
  }catch(e){notice(e.message,false)}
})();
