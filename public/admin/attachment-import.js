/*
  GH Mobility admin auth:
  Do not blindly prefer localStorage.token. An older/stale token can remain
  there while the current staff login lives in sessionStorage.staffToken.
  Keep all available staff-token candidates and retry once on 401.
*/
function uniqueAuthTokens(values){
  return [...new Set(
    values
      .map(value=>String(value||"").trim())
      .filter(Boolean)
  )];
}

function readAuthTokenCandidates(){
  return uniqueAuthTokens([
    sessionStorage.getItem("staffToken"),
    localStorage.getItem("staffToken"),
    sessionStorage.getItem("token"),
    localStorage.getItem("token")
  ]);
}

let authTokenCandidates = readAuthTokenCandidates();
let token = authTokenCandidates[0] || "";

if(!token){
  location.href="/login.html";
}

function authHeaders(extra={},tokenOverride=token){
  return {
    Authorization:`Bearer ${tokenOverride}`,
    ...extra
  };
}

async function fetchWithAuth(url,options={}){
  authTokenCandidates = uniqueAuthTokens([
    token,
    ...readAuthTokenCandidates()
  ]);

  let lastResponse = null;

  for(const candidate of authTokenCandidates){
    const response = await fetch(url,{
      ...options,
      headers:authHeaders(options.headers||{},candidate)
    });

    lastResponse = response;

    if(response.status !== 401){
      token = candidate;
      return response;
    }
  }

  return lastResponse;
}

const state = {
  templates:[],
  selected:null,
  currentImport:null,
  draftImports:[],
  autoSaveTimers:new Map(),
  services:[],
  editingRows:new Set(),
  shareRatings:new Map(),
  sharePlan:null,
  setupAcceptedRows:new Set(),
  selectedPreviewUrls:[],
  previewRotations:[],
  documentSubmitting:false,
  selectedFileSignature:""
};
const $ = id=>document.getElementById(id);

const templateFieldStyle=document.createElement("style");
templateFieldStyle.textContent=`
  .one-field-map-row{
    grid-template-columns:minmax(320px,2fr) minmax(140px,.7fr) minmax(120px,.6fr) auto !important;
  }
  .one-field-map-row .document-field-only input{
    width:100%;
  }
`;
document.head.appendChild(templateFieldStyle);

function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function clean(v){return String(v??"").trim()}
async function api(url,options={}){
  const res=await fetchWithAuth(url,options);
  const data=await res.json().catch(()=>({}));

  if(!res.ok){
    if(res.status===401){
      throw new Error("Session expired. Please sign in again.");
    }
    throw new Error(data.message||`Request failed (${res.status})`);
  }

  return data;
}
function notice(msg,ok=true){const n=$("notice");n.textContent=msg;n.className=`notice ${ok?"ok":"err"}`}
function clearNotice(){const n=$("notice");n.className="notice";n.textContent=""}


/* =========================================================
   SMART IMPORT WORKFLOW UI
   Setup = document + extracted trips + optional template fields
   Review = accepted trips only, service + final check + final submit
========================================================= */
const smartWorkflowStyle=document.createElement("style");
smartWorkflowStyle.textContent=`
  .ai-tabs{display:flex!important;gap:14px!important;margin:14px 0 18px!important}
  .ai-tabs .tab,.tab[data-tab]{min-height:54px!important;padding:14px 28px!important;border-radius:12px!important;font-size:17px!important;font-weight:900!important;border:2px solid #cbd5e1!important}
  .tab[data-tab="setup"]{background:#e0f2fe!important;color:#075985!important}
  .tab[data-tab="review"]{background:#ede9fe!important;color:#5b21b6!important}
  .tab[data-tab].active{box-shadow:0 0 0 3px rgba(37,99,235,.12)!important;border-color:#2563eb!important}
  #templateFieldsToggle{margin-left:auto}
  .setup-workflow-toolbar{display:flex;align-items:center;gap:10px;margin:10px 0}
  .setup-extracted-wrap{margin:14px 0 18px}
  .setup-trip-card{border:1px solid #cbd5e1;border-radius:12px;padding:12px;margin:10px 0;background:#fff}
  .setup-trip-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:9px}
  .setup-extracted-wrap{position:sticky;top:8px;z-index:40;background:#f8fafc;border-radius:12px;padding:8px;box-shadow:0 6px 18px rgba(15,23,42,.08)}
  .setup-trip-head{position:sticky;top:8px;z-index:42;background:#fff;padding:8px;border-radius:9px}
  .document-preview-toolbar{position:sticky;top:8px;z-index:35;display:flex;justify-content:flex-end;gap:8px;padding:8px 0;background:#fff}
  .document-preview-page{position:relative}
  .document-preview-stage{width:100%;max-width:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#f8fafc;min-height:220px}
  .document-preview-stage img{display:block;max-width:100%;width:auto;height:auto;object-fit:contain;transform-origin:center center;transition:transform .18s ease}
  .document-preview-page,.document-preview-wrap,#setupWorkflowMount{max-width:100%;min-width:0;overflow-x:hidden}
  .setup-trip-card,.setup-trip-grid,.setup-trip-field{min-width:0}
  .setup-trip-field{overflow-wrap:anywhere}

  .setup-trip-actions{display:flex;gap:8px}
  .setup-trip-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
  .setup-trip-field{border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#f8fafc;min-height:54px}
  .setup-trip-field b{display:block;font-size:11px;color:#64748b;margin-bottom:3px}
  .document-preview-wrap{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:14px}
  .document-preview-title{font-weight:900;font-size:16px;margin-bottom:10px}
  .document-preview-page{width:100%;margin:0 0 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;overflow:hidden}
  .document-preview-page img{display:block;width:100%;height:auto;object-fit:contain}
  .document-preview-page embed{display:block;width:100%;height:850px}
  .document-file-card{padding:22px;text-align:center;font-weight:800}
  .template-editor-collapsed{display:none!important}
  [data-template-editor-card="1"].template-editor-collapsed{display:none!important}
  #templateFieldsToggle{width:100%;margin:8px 0!important}

  #uploadBtn:disabled{opacity:.55!important;cursor:not-allowed!important}
`;
document.head.appendChild(smartWorkflowStyle);

function acceptedStorageKey(){
  return `ghAttachmentSetupAccepted:${state.currentImport?._id||"none"}`;
}
function loadAcceptedRows(){
  try{
    const raw=JSON.parse(localStorage.getItem(acceptedStorageKey())||"[]");
    state.setupAcceptedRows=new Set((Array.isArray(raw)?raw:[]).map(Number).filter(Number.isFinite));
  }catch(_){
    state.setupAcceptedRows=new Set();
  }
}
function saveAcceptedRows(){
  try{
    localStorage.setItem(
      acceptedStorageKey(),
      JSON.stringify([...state.setupAcceptedRows])
    );
  }catch(_){}
}
function currentSetupRows(){
  return (state.currentImport?.reviewRows||[]).filter(
    row=>!state.setupAcceptedRows.has(Number(row.rowIndex))
  );
}
function currentReviewRows(){
  return (state.currentImport?.reviewRows||[]).filter(
    row=>state.setupAcceptedRows.has(Number(row.rowIndex)) || row.confirmed || row.tripId
  );
}
function clearSelectedPreviewUrls(){
  (state.selectedPreviewUrls||[]).forEach(url=>{
    try{ URL.revokeObjectURL(url); }catch(_){}
  });
  state.selectedPreviewUrls=[];
  state.previewRotations=[];
}
function rotatePreview(index,delta){
  const img=document.querySelector(`[data-preview-image="${index}"]`);
  if(!img) return;
  const next=((Number(state.previewRotations[index]||0)+delta)%360+360)%360;
  state.previewRotations[index]=next;
  const stage=img.closest(".document-preview-stage");
  const fitRotatedImage=()=>{
    if(!stage) return;
    if(next===90||next===270){
      const sw=Math.max(1,stage.clientWidth);
      const iw=Math.max(1,img.naturalWidth||img.clientWidth);
      const ih=Math.max(1,img.naturalHeight||img.clientHeight);
      const baseWidth=Math.min(sw,iw);
      const renderedHeight=baseWidth*(ih/iw);
      const scale=Math.min(1,sw/Math.max(1,renderedHeight));
      img.style.transform=`rotate(${next}deg) scale(${scale})`;
      stage.style.minHeight=`${Math.max(260,baseWidth*scale)}px`;
    }else{
      img.style.transform=`rotate(${next}deg)`;
      stage.style.minHeight="220px";
    }
  };
  if(img.complete) fitRotatedImage();
  else img.addEventListener("load",fitRotatedImage,{once:true});
}
function renderDocumentPreview(files=[]){
  let host=document.getElementById("documentFullPreview");
  if(!host) return;
  clearSelectedPreviewUrls();

  if(!files.length){
    host.innerHTML=`<div class="meta">Choose a new document to display it here.</div>`;
    return;
  }

  const parts=files.map((file,index)=>{
    const url=URL.createObjectURL(file);
    state.selectedPreviewUrls.push(url);
    const type=String(file.type||"").toLowerCase();
    const name=esc(file.name||`Page ${index+1}`);

    if(type.startsWith("image/")){
      state.previewRotations[index]=0;
      return `
        <div class="document-preview-page">
          <div class="document-preview-toolbar">
            <button type="button" class="btn btn-muted" data-rotate-left="${index}">↶ Rotate Left</button>
            <button type="button" class="btn btn-muted" data-rotate-right="${index}">↷ Rotate Right</button>
          </div>
          <div class="document-preview-stage">
            <img data-preview-image="${index}" src="${url}" alt="${name}">
          </div>
        </div>`;
    }
    if(type==="application/pdf" || /\.pdf$/i.test(file.name||"")){
      return `<div class="document-preview-page"><embed src="${url}" type="application/pdf"></div>`;
    }
    return `<div class="document-preview-page document-file-card">${name}</div>`;
  }).join("");

  host.innerHTML=`
    <div class="document-preview-title">
      Document Preview ${files.length===2?'• Front + Back':''}
    </div>
    ${parts}
  `;

  host.querySelectorAll("[data-rotate-left]").forEach(btn=>{
    btn.addEventListener("click",()=>rotatePreview(Number(btn.dataset.rotateLeft),-90));
  });
  host.querySelectorAll("[data-rotate-right]").forEach(btn=>{
    btn.addEventListener("click",()=>rotatePreview(Number(btn.dataset.rotateRight),90));
  });
}
function fieldDisplayPairs(row){
  const fields=(state.selected?.fields||[]).filter(f=>f.visibleInReview!==false);
  return fields.map(f=>({
    label:f.label||f.internalKey,
    value:row?.data?.[f.internalKey]??""
  }));
}
function renderSetupExtractedTrips(){
  const host=document.getElementById("setupExtractedTrips");
  if(!host) return;

  if(!state.currentImport){
    host.innerHTML="";
    return;
  }

  const rows=currentSetupRows();
  if(!rows.length){
    host.innerHTML=state.currentImport.reviewRows?.length
      ? `<div class="meta">All extracted trips from this document were moved to Import Review.</div>`
      : "";
    return;
  }

  host.innerHTML=`
    <div style="font-weight:900;font-size:17px;margin-bottom:8px">Extracted Trips</div>
    ${rows.map(row=>`
      <div class="setup-trip-card" data-setup-row="${Number(row.rowIndex)}">
        <div class="setup-trip-head">
          <div><strong>Trip ${esc(row.dailyEntryNumber??(Number(row.rowIndex)+1))}</strong>
          <span class="meta"> • ${confidenceText(row.extractionConfidence)}</span></div>
          <div class="setup-trip-actions">
            <button type="button" class="btn btn-green" data-accept-setup="${Number(row.rowIndex)}">Submit</button>
            <button type="button" class="btn btn-red" data-delete-setup="${Number(row.rowIndex)}">Delete</button>
          </div>
        </div>
        <div class="setup-trip-grid">
          ${fieldDisplayPairs(row).map(item=>`
            <div class="setup-trip-field"><b>${esc(item.label)}</b>${esc(item.value||"—")}</div>
          `).join("")}
        </div>
      </div>
    `).join("")}
  `;

  host.querySelectorAll("[data-accept-setup]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const index=Number(btn.dataset.acceptSetup);
      state.setupAcceptedRows.add(index);
      saveAcceptedRows();
      renderSetupExtractedTrips();
      renderReview();
      notice("Trip moved to Import Review.");
    });
  });

  host.querySelectorAll("[data-delete-setup]").forEach(btn=>{
    btn.addEventListener("click",()=>deleteSetupRow(Number(btn.dataset.deleteSetup)));
  });
}
async function deleteSetupRow(rowIndex){
  try{
    const row=(state.currentImport?.reviewRows||[]).find(r=>Number(r.rowIndex)===Number(rowIndex));
    if(!row) return;
    if(row.confirmed || row.tripId) throw new Error("Submitted trips cannot be deleted.");
    if(!confirm("Delete this extracted trip?")) return;

    const data=await api(
      `/api/attachment-imports/${state.currentImport._id}/review-rows`,
      {
        method:"DELETE",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({rowIndexes:[Number(rowIndex)]})
      }
    );

    state.currentImport=data.import;
    state.setupAcceptedRows.delete(Number(rowIndex));
    saveAcceptedRows();
    renderSetupExtractedTrips();
    renderReview();
    notice("Trip deleted.");
  }catch(e){
    notice(e.message,false);
  }
}

function normalizeOrganizationSidebar(){
  const templatesPanel=$("templatesPanel");
  if(!templatesPanel) return;

  /*
    This is an organization list, not a generic template workspace.
    Existing template records remain the storage mechanism; only the operator UI changes.
  */
  const heading=[...templatesPanel.querySelectorAll("h1,h2,h3,h4,strong")]
    .find(el=>/templates?/i.test(el.textContent||""));
  if(heading) heading.textContent="Insurance / Broker / Company";

  templatesPanel.querySelectorAll("button").forEach(btn=>{
    const label=String(btn.textContent||"").trim();
    if(/^duplicate$/i.test(label)){
      btn.remove();
    }
  });

  const duplicate=$("duplicateTemplateBtn") || $("duplicateBtn");
  if(duplicate) duplicate.remove();
}

function installSetupWorkflowUI(){
  const setup=$("setupPanel");
  if(!setup || document.getElementById("setupWorkflowMount")) return;

  const mount=document.createElement("div");
  mount.id="setupWorkflowMount";

  const fileInput=$("attachmentFiles");
  const uploadBtn=$("uploadBtn");
  const uploadCard=fileInput?.closest(".card") || fileInput?.parentElement?.parentElement;

  mount.innerHTML=`
    <div class="setup-workflow-toolbar">
      <button type="button" class="btn btn-muted" id="templateFieldsToggle">Template Fields</button>
    </div>
    <div id="setupExtractedTrips" class="setup-extracted-wrap"></div>
    <div id="documentFullPreview" class="document-preview-wrap"></div>
  `;

  if(uploadCard?.parentNode){
    uploadCard.parentNode.insertBefore(mount,uploadCard.nextSibling);
  }else{
    setup.appendChild(mount);
  }

  const fieldsEditor=$("fieldsEditor");
  const templateCard=fieldsEditor?.closest(".card") || $("templateName")?.closest(".card");
  if(templateCard){
    templateCard.dataset.templateEditorCard="1";
    templateCard.classList.add("template-editor-collapsed");
  }

  const settingsToggle=document.getElementById("templateFieldsToggle");
  const templatesPanel=$("templatesPanel");
  if(settingsToggle && templatesPanel){
    settingsToggle.textContent="Open Settings";
    templatesPanel.appendChild(settingsToggle);
  }

  document.getElementById("templateFieldsToggle")?.addEventListener("click",()=>{
    if(!templateCard) return;
    const opening=templateCard.classList.contains("template-editor-collapsed");
    templateCard.classList.toggle("template-editor-collapsed",!opening);
    document.getElementById("templateFieldsToggle").textContent=
      opening ? "Close Settings" : "Open Settings";
    if(opening){
      templateCard.scrollIntoView({behavior:"smooth",block:"start"});
    }
  });

  if(uploadBtn){
    uploadBtn.disabled=true;
    uploadBtn.dataset.readyForNewFile="0";
  }

  fileInput?.addEventListener("change",()=>{
    const files=[...fileInput.files];
    const signature=files.map(f=>`${f.name}:${f.size}:${f.lastModified}`).join("|");
    state.selectedFileSignature=signature;
    state.documentSubmitting=false;
    if(uploadBtn){
      uploadBtn.disabled=!files.length;
      uploadBtn.dataset.readyForNewFile=files.length?"1":"0";
      uploadBtn.textContent="Submit Document";
    }
    renderDocumentPreview(files);
  });

  renderDocumentPreview([]);
  renderSetupExtractedTrips();
  normalizeOrganizationSidebar();

  const sidebarObserver=new MutationObserver(()=>normalizeOrganizationSidebar());
  if($("templatesPanel")){
    sidebarObserver.observe($("templatesPanel"),{childList:true,subtree:true});
  }
}

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
function normalizeFieldLabel(value){
  return clean(value)
    .toLowerCase()
    .replace(/[_\-]+/g," ")
    .replace(/[^\p{L}\p{N}#]+/gu," ")
    .replace(/\s+/g," ")
    .trim();
}

function localFieldMatch(label){
  const target=normalizeFieldLabel(label);
  if(!target) return null;

  let best=null;
  let bestScore=0;

  for(const meta of GH_FIELD_OPTIONS){
    const candidates=[
      meta.label,
      meta.key,
      ...(Array.isArray(meta.aliases)?meta.aliases:[])
    ].map(normalizeFieldLabel).filter(Boolean);

    for(const candidate of candidates){
      let score=0;

      if(target===candidate){
        score=100;
      }else if(
        target.length>=4 &&
        (target.includes(candidate) || candidate.includes(target))
      ){
        score=80;
      }else{
        const a=new Set(target.split(" "));
        const b=new Set(candidate.split(" "));
        const common=[...a].filter(x=>b.has(x)).length;
        const total=new Set([...a,...b]).size;
        if(total) score=Math.round((common/total)*70);
      }

      if(score>bestScore){
        bestScore=score;
        best=meta;
      }
    }
  }

  return bestScore>=70 ? best : null;
}

function applyFieldMapping(field,label,internalKey){
  const meta=ghFieldMeta(internalKey);
  return {
    ...field,
    label:clean(label),
    internalKey:clean(internalKey),
    type:meta?.type || field?.type || "TEXT",
    aliases:meta?.aliases || field?.aliases || []
  };
}
function syncFieldRowFromDom(row){
  if(!state.selected || !row) return;

  const index=Number(row.dataset.fieldRow);
  if(!Number.isFinite(index) || !state.selected.fields?.[index]) return;

  const current=state.selected.fields[index];
  const label=clean(row.querySelector('[data-k="label"]')?.value);
  const local=localFieldMatch(label);
  const currentKey=clean(current.internalKey);

  const internalKey=
    local?.key ||
    currentKey ||
    "";

  state.selected.fields[index]={
    ...applyFieldMapping(current,label,internalKey),
    required:row.querySelector('[data-k="required"]')?.value==="true",
    visibleInReview:row.querySelector('[data-k="visibleInReview"]')?.value!=="false",
    order:index
  };

  const hint=row.querySelector("[data-map-hint]");
  if(hint){
    hint.textContent=internalKey
      ? `Mapped internally: ${ghFieldMeta(internalKey)?.label || internalKey}`
      : "Will be identified automatically when saved";
  }
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
    <div
      class="field-row simple-field-row one-field-map-row"
      data-field-row="${i}"
      data-internal-key="${esc(f.internalKey||"")}"
    >
      <div class="document-field-only">
        <label>Document Field</label>
        <input
          data-k="label"
          value="${esc(f.label)}"
          placeholder="Type the field name exactly as it appears on the document"
        >
        <div class="meta" data-map-hint>
          ${
            f.internalKey
              ? `Mapped internally: ${esc(ghFieldMeta(f.internalKey)?.label || f.internalKey)}`
              : "Will be identified automatically when saved"
          }
        </div>
      </div>

      <div>
        <label>Show in Review</label>
        <select data-k="visibleInReview">
          <option value="true" ${f.visibleInReview!==false?"selected":""}>Show</option>
          <option value="false" ${f.visibleInReview===false?"selected":""}>Hide</option>
        </select>
      </div>

      <div>
        <label>Required</label>
        <select data-k="required">
          <option value="false" ${!f.required?"selected":""}>No</option>
          <option value="true" ${f.required?"selected":""}>Yes</option>
        </select>
      </div>

      <button
        class="btn btn-red field-delete"
        type="button"
        onclick="removeField(${i})"
        title="Delete field"
      >×</button>
    </div>
  `).join("") || `<div class="meta">Add only the fields that appear on this organization's document.</div>`;

  bindFieldEditorSync();
}
function collectFields(){
  const rows=[...document.querySelectorAll("[data-field-row]")];

  rows.forEach(syncFieldRowFromDom);

  return rows.map((row,i)=>{
    const field=state.selected?.fields?.[i] || {};
    return {
      ...field,
      label:clean(field.label),
      internalKey:clean(field.internalKey),
      order:i
    };
  }).filter(f=>clean(f.label));
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

async function resolveUnknownTemplateFields(){
  if(!state.selected?.fields?.length) return;

  document.querySelectorAll("[data-field-row]").forEach(syncFieldRowFromDom);

  const unknown=state.selected.fields
    .map((field,index)=>({
      index,
      label:clean(field.label),
      internalKey:clean(field.internalKey)
    }))
    .filter(item=>item.label && !item.internalKey);

  if(!unknown.length) return;

  const data=await api(
    "/api/attachment-imports/map-template-fields",
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        fields:unknown.map(item=>({
          index:item.index,
          label:item.label
        }))
      })
    }
  );

  const mappings=Array.isArray(data.mappings)
    ? data.mappings
    : [];

  for(const mapping of mappings){
    const index=Number(mapping.index);
    const key=clean(mapping.internalKey);

    if(
      Number.isFinite(index) &&
      state.selected.fields?.[index] &&
      key
    ){
      state.selected.fields[index]=applyFieldMapping(
        state.selected.fields[index],
        state.selected.fields[index].label,
        key
      );
    }
  }

  const stillUnknown=state.selected.fields.filter(
    field=>clean(field.label) && !clean(field.internalKey)
  );

  if(stillUnknown.length){
    throw new Error(
      "Could not identify: " +
      stillUnknown.map(field=>field.label).join(", ")
    );
  }

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

    await resolveUnknownTemplateFields();

    const payload=templatePayload();

    if(!payload.name){
      throw new Error("Template name is required");
    }

    if(!payload.fields.length){
      throw new Error("Add at least one field");
    }

    if(payload.fields.some(field=>!clean(field.internalKey))){
      throw new Error("Every Document Field must be identified before saving");
    }

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
    notice("Template saved");
  }catch(e){
    notice(e.message,false);
  }
};

$("uploadBtn").onclick=async()=>{
  const btn=$("uploadBtn");

  if(
    state.documentSubmitting ||
    btn?.disabled ||
    btn?.dataset.readyForNewFile!=="1"
  ){
    return;
  }

  state.documentSubmitting=true;
  btn.disabled=true;
  btn.textContent="Processing...";

  try{
    clearNotice();
    if(!state.selected?._id) throw new Error("Save and select a template first");

    const files=[...$("attachmentFiles").files];
    if(!files.length) throw new Error("Select at least one new file");

    const fd=new FormData();
    fd.append("templateId",state.selected._id);
    files.forEach(f=>fd.append("files",f));

    const res=await fetchWithAuth("/api/attachment-imports/upload",{
      method:"POST",
      body:fd
    });

    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message||"Upload failed");

    state.currentImport=data.import;
    state.services=data.services||[];
    state.editingRows.clear();
    state.shareRatings.clear();
    state.sharePlan=null;
    state.setupAcceptedRows=new Set();
    saveAcceptedRows();

    /*
      Keep the user in Import Setup.
      Submit Document means Upload + Extract only.
      Each extracted trip must be explicitly submitted to Import Review.
    */
    setTab("setup");
    renderSetupExtractedTrips();
    renderReview();

    await validateAddresses({silent:true});
    await loadSavedDrafts({preferId:state.currentImport?._id,openLatest:false});
    loadAcceptedRows();
    renderSetupExtractedTrips();
    renderReview();

    btn.dataset.readyForNewFile="0";
    btn.disabled=true;
    btn.textContent="Document Submitted";

    notice(
      `Document ${state.currentImport.documentNumber||""} read. ` +
      `${state.currentImport.reviewRows?.length||0} trip(s) extracted.`
    );
  }catch(e){
    /*
      A failed request may be retried with the same selected file.
      A successful request stays locked until Choose Files changes.
    */
    state.documentSubmitting=false;
    if(btn){
      btn.disabled=false;
      btn.dataset.readyForNewFile="1";
      btn.textContent="Submit Document";
    }
    notice(e.message,false);
    return;
  }

  state.documentSubmitting=false;
};

function isOpenDraft(imp){
  if(!imp) return false;
  if(["CONFIRMED","ARCHIVED"].includes(String(imp.status||"").toUpperCase())) return false;
  return (imp.reviewRows||[]).some(row=>!row.confirmed && !row.tripId);
}

function syncSelectedTemplateForImport(imp){
  if(!imp) return;
  const match=(state.templates||[]).find(t=>String(t._id)===String(imp.templateId));
  if(match) state.selected=match;
}

async function loadSavedDrafts({preferId=null,openLatest=true}={}){
  const data=await api("/api/attachment-imports");
  state.draftImports=(data.imports||[]).filter(isOpenDraft);

  let target=null;
  if(preferId){
    target=state.draftImports.find(x=>String(x._id)===String(preferId))||null;
  }
  if(!target && openLatest){
    target=state.draftImports[0]||null;
  }

  if(target){
    const detail=await api(`/api/attachment-imports/${target._id}`);
    state.currentImport=detail.import;
    state.services=detail.services||state.services;
    if(detail.template){
      const existing=(state.templates||[]).find(t=>String(t._id)===String(detail.template._id));
      state.selected=existing||detail.template;
    }else{
      syncSelectedTemplateForImport(state.currentImport);
    }
  }else if(openLatest){
    state.currentImport=null;
  }

  renderDraftPicker();
  return target;
}

function renderDraftPicker(){
  let wrap=document.getElementById("savedDraftPicker");
  const meta=$("reviewMeta");
  if(!meta) return;

  if(!wrap){
    wrap=document.createElement("div");
    wrap.id="savedDraftPicker";
    wrap.style.cssText="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px 0;padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px";
    meta.parentNode.insertBefore(wrap,meta);
  }

  if(!state.draftImports.length){
    wrap.style.display="none";
    return;
  }

  wrap.style.display="flex";
  wrap.innerHTML=`<strong>Saved Drafts:</strong><select id="savedDraftSelect" style="min-width:260px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:7px">
    ${state.draftImports.map(imp=>`<option value="${esc(imp._id)}" ${String(imp._id)===String(state.currentImport?._id)?"selected":""}>${esc(imp.documentNumber||"Draft")} • ${esc(imp.templateName||"")} • ${(imp.reviewRows||[]).filter(r=>!r.confirmed).length} row(s)</option>`).join("")}
  </select>`;

  document.getElementById("savedDraftSelect")?.addEventListener("change",async e=>{
    try{
      const id=e.target.value;
      const detail=await api(`/api/attachment-imports/${id}`);
      state.currentImport=detail.import;
      state.services=detail.services||state.services;
      if(detail.template){
        const existing=(state.templates||[]).find(t=>String(t._id)===String(detail.template._id));
        state.selected=existing||detail.template;
      }else syncSelectedTemplateForImport(state.currentImport);
      state.editingRows.clear();
      state.shareRatings.clear();
      state.sharePlan=null;
      renderDraftPicker();
      renderReview();
      setTab("review");
    }catch(err){notice(err.message,false)}
  });
}

function scheduleRowAutoSave(rowIndex){
  const key=Number(rowIndex);
  const old=state.autoSaveTimers.get(key);
  if(old) clearTimeout(old);
  const timer=setTimeout(async()=>{
    state.autoSaveTimers.delete(key);
    try{
      await saveRows([key],{render:false});
      notice(`Row ${key} auto-saved`);
    }catch(err){
      notice(`Auto-save failed: ${err.message}`,false);
    }
  },500);
  state.autoSaveTimers.set(key,timer);
}

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
  renderDraftPicker();

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

  const rows=currentReviewRows();

  if(!rows.length){
    $("reviewTable").innerHTML=`<div style="padding:18px" class="meta">No trips have been submitted from Import Setup yet.</div>`;
    return;
  }

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

  document.querySelectorAll("[data-review-row] input[data-key], [data-review-row] select[data-service]").forEach(control=>{
    control.addEventListener("input",()=>{
      const tr=control.closest("[data-review-row]");
      if(tr) scheduleRowAutoSave(Number(tr.dataset.reviewRow));
    });
    control.addEventListener("change",()=>{
      const tr=control.closest("[data-review-row]");
      if(tr) scheduleRowAutoSave(Number(tr.dataset.reviewRow));
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
    state.draftImports=state.draftImports
      .map(imp=>String(imp._id)===String(data.import?._id)?data.import:imp)
      .filter(isOpenDraft);
    renderDraftPicker();
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
  state.draftImports=state.draftImports
    .map(imp=>String(imp._id)===String(data.import?._id)?data.import:imp)
    .filter(isOpenDraft);
  renderDraftPicker();

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

    const res=await fetchWithAuth("/api/company-shared/plan",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
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
    installSetupWorkflowUI();
    await loadTemplates();

    try{
      const serviceData=await api("/api/attachment-imports/services");
      state.services=serviceData.services||state.services;
    }catch(_){}

    await loadSavedDrafts({openLatest:true});
    if(state.currentImport){
      loadAcceptedRows();
      renderSetupExtractedTrips();
    }

    ensureReviewActionButtons();
    renderReview();
    setTab("setup");
  }catch(e){notice(e.message,false)}
})();
