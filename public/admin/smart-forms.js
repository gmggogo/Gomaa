const API="/api/smart-forms";
const token=sessionStorage.getItem("staffToken")||localStorage.getItem("staffToken")||sessionStorage.getItem("token")||localStorage.getItem("token")||"";
const role=String(sessionStorage.getItem("staffRole")||localStorage.getItem("staffRole")||sessionStorage.getItem("role")||localStorage.getItem("role")||"").toUpperCase();
if(!token || !["SUPER_ADMIN","ADMIN","DISPATCHER"].includes(role)) location.replace("/login.html");

let organizations=[],templates=[],builderFields=[],mapperFields=[],activeBuilderTemplate=null,activeMapperTemplate=null,selectedMapFieldId="",pdfDoc=null,pdfPageNumber=1,pdfPageCount=0,pdfjsLib=null;

const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
function msg(t,type="ok"){const b=document.getElementById("sfMessage");b.textContent=t;b.className=`sf-message show ${type}`;clearTimeout(msg.t);msg.t=setTimeout(()=>b.className="sf-message",3500);}
async function api(url,opt={}){const h={...(opt.headers||{}),Authorization:`Bearer ${token}`};if(opt.body && !(opt.body instanceof FormData)) h["Content-Type"]="application/json";const r=await fetch(url,{...opt,headers:h});const ct=String(r.headers.get("content-type")||"");if(ct.includes("application/pdf")){if(!r.ok)throw new Error(`Request failed (${r.status})`);return r.blob();}const tx=await r.text();let d={};try{d=tx?JSON.parse(tx):{}}catch{}if(!r.ok)throw new Error(d.message||`Request failed (${r.status})`);return d;}
const currentTemplate=id=>templates.find(x=>String(x._id)===String(id))||null;
function orgOptions(sel){sel.innerHTML=organizations.length?organizations.map(o=>`<option value="${esc(o._id)}">${esc(o.name)}</option>`).join(""):`<option value="">No organizations</option>`;}
function templateOptions(sel,org,keep=""){const rows=templates.filter(t=>String(t.organizationId)===String(org));sel.innerHTML=rows.length?rows.map(t=>`<option value="${esc(t._id)}">${esc(t.name)}</option>`).join(""):`<option value="">No templates</option>`;if(keep&&rows.some(t=>String(t._id)===String(keep)))sel.value=keep;}
function syncSelects(){[["entryOrganization","entryTemplate"],["builderOrganization","builderTemplate"],["mapperOrganization","mapperTemplate"]].forEach(([o,t])=>templateOptions(document.getElementById(t),document.getElementById(o).value,document.getElementById(t).value));}

document.querySelectorAll(".sf-tab").forEach(b=>b.onclick=()=>{const tab=b.dataset.tab;document.querySelectorAll(".sf-tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".sf-panel").forEach(p=>p.classList.toggle("active",p.id===`panel-${tab}`));if(tab==="review")loadReview();if(tab==="mapper")activateMapper();});

async function start(){const f=await api(`${API}/feature`);if(!f.enabled)throw new Error("Smart Forms disabled");{
  const organizationResponse =
    await api(`${API}/organizations`);

  organizations =
    organizationResponse.organizations || [];

  ["entryOrganization","builderOrganization","mapperOrganization"]
    .forEach(
      id=>orgOptions(document.getElementById(id))
    );

  if(!organizations.length){
    msg(
      "No Smart Forms organizations are assigned to this company.",
      "err"
    );
  }
}templates=(await api(`${API}/templates`)).templates||[];syncSelects();renderEntry(currentTemplate(document.getElementById("entryTemplate").value));activateBuilder();await loadReview();}
function inputControl(f,v=""){const label=`${esc(f.label)}${f.required?" *":""}`;if(f.type==="TEXTAREA")return `<div class="sf-control"><label>${label}</label><textarea id="entry_${esc(f.key)}">${esc(v)}</textarea></div>`;if(f.type==="SELECT")return `<div class="sf-control"><label>${label}</label><select id="entry_${esc(f.key)}"><option value="">Select...</option>${(f.options||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select></div>`;if(f.type==="CHECKBOX")return `<div class="sf-control"><label>${label}</label><input id="entry_${esc(f.key)}" type="checkbox"></div>`;if(f.type==="SIGNATURE")return `<div class="sf-control"><label>${label}</label><div style="padding:12px;border:1px dashed #bbb;border-radius:8px">Captured in Driver App</div></div>`;const m={NUMBER:"number",PHONE:"tel",DATE:"date",TIME:"time"};return `<div class="sf-control"><label>${label}</label><input id="entry_${esc(f.key)}" type="${m[f.type]||"text"}" value="${esc(v)}"></div>`;}
function renderEntry(t){const host=document.getElementById("entryForm");if(!t){host.innerHTML=`<div>No template selected.</div>`;return;}host.innerHTML=(t.fields||[]).sort((a,b)=>(a.order||0)-(b.order||0)).map(f=>`<div class="sf-entry-field" style="width:${Number(f.widthPercent||50)}%">${inputControl(f)}</div>`).join("");}
function collectEntry(t){const d={};for(const f of t.fields||[]){if(f.type==="SIGNATURE")continue;const el=document.getElementById(`entry_${f.key}`);if(!el)continue;d[f.key]=f.type==="CHECKBOX"?el.checked:el.value;}return d;}
async function saveEntry(status){const t=currentTemplate(document.getElementById("entryTemplate").value);if(!t)return msg("Choose a template first.","err");try{await api(`${API}/submissions`,{method:"POST",body:JSON.stringify({templateId:t._id,formData:collectEntry(t),status})});msg(status==="REVIEW"?"Sent to Review.":"Draft saved.");renderEntry(t);if(status==="REVIEW")loadReview();}catch(e){msg(e.message,"err");}}
function activateBuilder(){activeBuilderTemplate=currentTemplate(document.getElementById("builderTemplate").value);builderFields=JSON.parse(JSON.stringify(activeBuilderTemplate?.fields||[]));renderBuilder();}
function renderBuilder(){const h=document.getElementById("builderList"),p=document.getElementById("builderPreview");if(!activeBuilderTemplate){h.innerHTML="Create or select a template.";p.innerHTML="";return;}h.innerHTML=builderFields.map((f,i)=>`<div class="sf-builder-row"><span>☰</span><div><strong>${esc(f.label)}</strong><div style="font-size:11px">${esc(f.type)}</div></div><select data-width="${i}">${[25,33,50,66,75,100].map(w=>`<option value="${w}" ${Number(f.widthPercent||50)===w?"selected":""}>${w}%</option>`).join("")}</select><button data-up="${i}">↑</button><button data-del="${i}">Delete</button></div>`).join("");p.innerHTML=builderFields.map(f=>`<div class="sf-entry-field" style="width:${Number(f.widthPercent||50)}%">${inputControl(f)}</div>`).join("");}
document.getElementById("addFieldBtn").onclick=()=>{if(!activeBuilderTemplate)return msg("Select a template.","err");const label=document.getElementById("fieldLabel").value.trim();if(!label)return msg("Field label required.","err");let key=label.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")||`field_${builderFields.length+1}`;let n=2,base=key;while(builderFields.some(f=>f.key===key))key=`${base}_${n++}`;const type=document.getElementById("fieldType").value;builderFields.push({key,label,type,required:document.getElementById("fieldRequired").checked,options:document.getElementById("fieldOptions").value.split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean),widthPercent:Number(document.getElementById("fieldWidth").value),order:builderFields.length,mapping:{mapped:false,page:1,xPercent:0,yPercent:0,widthPercent:20,heightPercent:type==="SIGNATURE"?8:4,fontSize:10,textAlign:"LEFT"}});document.getElementById("fieldLabel").value="";document.getElementById("fieldOptions").value="";renderBuilder();};
document.getElementById("builderList").onclick=e=>{if(e.target.dataset.del!==undefined){builderFields.splice(Number(e.target.dataset.del),1);renderBuilder();}if(e.target.dataset.up!==undefined){const i=Number(e.target.dataset.up);if(i>0)[builderFields[i-1],builderFields[i]]=[builderFields[i],builderFields[i-1]];builderFields.forEach((f,j)=>f.order=j);renderBuilder();}};
document.getElementById("builderList").onchange=e=>{if(e.target.dataset.width!==undefined){builderFields[Number(e.target.dataset.width)].widthPercent=Number(e.target.value);renderBuilder();}};
document.getElementById("saveBuilderBtn").onclick=async()=>{if(!activeBuilderTemplate)return;try{const d=await api(`${API}/templates/${activeBuilderTemplate._id}/fields`,{method:"PUT",body:JSON.stringify({fields:builderFields})});const i=templates.findIndex(x=>String(x._id)===String(d.template._id));if(i>=0)templates[i]=d.template;activeBuilderTemplate=d.template;builderFields=JSON.parse(JSON.stringify(d.template.fields||[]));renderBuilder();syncSelects();msg("Form Builder saved.");}catch(e){msg(e.message,"err");}};
document.getElementById("newTemplateBtn").onclick=async()=>{const org=document.getElementById("builderOrganization").value,name=prompt("Template name:");if(!org||!name?.trim())return;try{const d=await api(`${API}/templates`,{method:"POST",body:JSON.stringify({organizationId:org,name:name.trim()})});templates.unshift(d.template);syncSelects();document.getElementById("builderTemplate").value=d.template._id;activateBuilder();msg("Template created.");}catch(e){msg(e.message,"err");}};

async function ensurePdfJs(){if(pdfjsLib)return pdfjsLib;pdfjsLib=await import("/vendor/pdfjs/pdf.mjs");pdfjsLib.GlobalWorkerOptions.workerSrc="/vendor/pdfjs/pdf.worker.mjs";return pdfjsLib;}
async function activateMapper(){activeMapperTemplate=currentTemplate(document.getElementById("mapperTemplate").value);mapperFields=JSON.parse(JSON.stringify(activeMapperTemplate?.fields||[]));selectedMapFieldId=mapperFields[0]?._id||"";renderMapFieldList();await loadPdf();}
function renderMapFieldList(){const h=document.getElementById("mapFieldList");h.innerHTML=mapperFields.map(f=>`<button class="sf-map-field ${String(f._id)===String(selectedMapFieldId)?"active":""}" data-id="${esc(f._id)}"><span>${esc(f.label)}</span><small>${f.mapping?.mapped?"Mapped":"Not mapped"}</small></button>`).join("");h.querySelectorAll("[data-id]").forEach(
  b=>b.onclick=()=>{
    selectedMapFieldId=
      b.dataset.id;

    renderMapFieldList();
    renderBoxes();

    const f=
      mapperFields.find(
        x=>
          String(x._id)===
          String(selectedMapFieldId)
      );

    if(f){
      msg(
        `Selected: ${f.label}. Click once on the PDF where you want it.`
      );
    }
  }
);}
async function loadPdf(localSource=null){
  try{
    if(!localSource && !activeMapperTemplate?.originalPdf?.hasPdf){
      pdfDoc=null;
      return;
    }

    let bytes;

    if(localSource){
      if(localSource instanceof ArrayBuffer){
        bytes=localSource;
      }else if(localSource?.arrayBuffer){
        bytes=await localSource.arrayBuffer();
      }else{
        throw new Error("Invalid local PDF source");
      }
    }else{
      const blob=
        await api(
          `${API}/templates/${activeMapperTemplate._id}/pdf`
        );

      bytes=
        await blob.arrayBuffer();
    }

    const lib=
      await ensurePdfJs();

    pdfDoc=
      await lib.getDocument({
        data:new Uint8Array(bytes)
      }).promise;

    pdfPageCount=
      pdfDoc.numPages;

    pdfPageNumber=1;

    await renderPdfPage();

    msg(
      "PDF loaded successfully."
    );

  }catch(err){
    console.error(
      "SMART FORMS PDF LOAD ERROR:",
      err
    );

    pdfDoc=null;

    throw new Error(
      `Failed to load PDF: ${err?.message || "Unknown error"}`
    );
  }
}
async function renderPdfPage(){
  if(!pdfDoc) return;

  const page=
    await pdfDoc.getPage(
      pdfPageNumber
    );

  const v=
    page.getViewport({
      scale:1.35
    });

  const c=
    document.getElementById(
      "sfPdfCanvas"
    );

  const stage=
    document.getElementById(
      "pdfStage"
    );

  c.width=v.width;
  c.height=v.height;

  stage.style.width=
    `${v.width}px`;

  stage.style.height=
    `${v.height}px`;

  await page.render({
    canvasContext:
      c.getContext("2d"),
    viewport:v
  }).promise;

  const info=
    document.getElementById(
      "pdfPageInfo"
    );

  if(info){
    info.textContent=
      `Page ${pdfPageNumber} of ${pdfPageCount}`;
  }

  [
    "prevPdfPage",
    "prevPdfPageTop"
  ].forEach(id=>{
    const btn=
      document.getElementById(id);

    if(btn){
      btn.disabled=
        pdfPageNumber <= 1;
    }
  });

  [
    "nextPdfPage",
    "nextPdfPageTop"
  ].forEach(id=>{
    const btn=
      document.getElementById(id);

    if(btn){
      btn.disabled=
        pdfPageNumber >= pdfPageCount;
    }
  });

  renderBoxes();
}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function renderBoxes(){
  const stage=document.getElementById("pdfStage");
  stage.querySelectorAll(".sf-map-box").forEach(x=>x.remove());
  if(!pdfDoc)return;

  mapperFields
    .filter(f=>f.mapping?.mapped&&Number(f.mapping.page||1)===pdfPageNumber)
    .forEach(f=>{
      const b=document.createElement("div");
      const active=String(f._id)===String(selectedMapFieldId);
      b.className=`sf-map-box ${active?"active":""}`;
      b.dataset.fieldId=String(f._id);
      b.style.left=`${f.mapping.xPercent}%`;
      b.style.top=`${f.mapping.yPercent}%`;
      b.style.width=`${f.mapping.widthPercent}%`;
      b.style.height=`${f.mapping.heightPercent}%`;
      b.innerHTML=`<span class="label">${esc(f.label)}</span>${active?["nw","n","ne","e","se","s","sw","w"].map(d=>`<span class="sf-resize-handle ${d}" data-dir="${d}"></span>`).join(""):""}`;

      b.addEventListener("pointerdown",e=>{
        e.preventDefault();
        e.stopPropagation();
        selectedMapFieldId=f._id;
        if(!b.classList.contains("active")){
          renderMapFieldList();
          renderBoxes();
          return;
        }

        const handle=e.target.closest(".sf-resize-handle");
        const dir=handle?.dataset.dir||"move";
        const rect=stage.getBoundingClientRect();
        const startX=e.clientX;
        const startY=e.clientY;
        const start={
          x:Number(f.mapping.xPercent)||0,
          y:Number(f.mapping.yPercent)||0,
          w:Number(f.mapping.widthPercent)||20,
          h:Number(f.mapping.heightPercent)||4
        };
        const minW=Math.max(1.5,1000/Math.max(rect.width,1));
        const minH=Math.max(1.2,700/Math.max(rect.height,1));
        b.setPointerCapture?.(e.pointerId);

        const move=ev=>{
          ev.preventDefault();
          const dx=((ev.clientX-startX)/rect.width)*100;
          const dy=((ev.clientY-startY)/rect.height)*100;
          let x=start.x,y=start.y,w=start.w,h=start.h;

          if(dir==="move"){
            x=clamp(start.x+dx,0,100-start.w);
            y=clamp(start.y+dy,0,100-start.h);
          }else{
            if(dir.includes("e")) w=clamp(start.w+dx,minW,100-start.x);
            if(dir.includes("s")) h=clamp(start.h+dy,minH,100-start.y);
            if(dir.includes("w")){
              const right=start.x+start.w;
              x=clamp(start.x+dx,0,right-minW);
              w=right-x;
            }
            if(dir.includes("n")){
              const bottom=start.y+start.h;
              y=clamp(start.y+dy,0,bottom-minH);
              h=bottom-y;
            }
          }

          f.mapping.xPercent=x;
          f.mapping.yPercent=y;
          f.mapping.widthPercent=w;
          f.mapping.heightPercent=h;
          b.style.left=`${x}%`;
          b.style.top=`${y}%`;
          b.style.width=`${w}%`;
          b.style.height=`${h}%`;
        };

        const end=ev=>{
          b.removeEventListener("pointermove",move);
          b.removeEventListener("pointerup",end);
          b.removeEventListener("pointercancel",end);
          try{b.releasePointerCapture?.(ev.pointerId);}catch(_){ }
          renderMapFieldList();
          renderBoxes();
        };

        b.addEventListener("pointermove",move);
        b.addEventListener("pointerup",end);
        b.addEventListener("pointercancel",end);
      });

      stage.appendChild(b);
    });
}
document.getElementById("pdfStage").onclick=e=>{
  if(
    e.target.closest(".sf-map-box")
  ){
    return;
  }

  const f=
    mapperFields.find(
      x=>
        String(x._id)===
        String(selectedMapFieldId)
    );

  if(!f || !pdfDoc){
    return;
  }

  const r=
    e.currentTarget
      .getBoundingClientRect();

  const clickX=
    ((e.clientX-r.left)/r.width)*100;

  const clickY=
    ((e.clientY-r.top)/r.height)*100;

  const width=
    Number(
      f.mapping?.widthPercent ||
      (f.type==="SIGNATURE" ? 25 : 20)
    );

  const height=
    Number(
      f.mapping?.heightPercent ||
      (f.type==="SIGNATURE" ? 8 : 4)
    );

  f.mapping={
    ...(f.mapping||{}),

    mapped:true,
    page:pdfPageNumber,

    xPercent:
      Math.max(
        0,
        Math.min(
          100-width,
          clickX
        )
      ),

    yPercent:
      Math.max(
        0,
        Math.min(
          100-height,
          clickY
        )
      ),

    widthPercent:width,
    heightPercent:height,

    fontSize:
      Number(
        document
          .getElementById(
            "mapFont"
          )
          .value || 10
      ),

    textAlign:
      document
        .getElementById(
          "mapAlign"
        )
        .value
  };

  renderMapFieldList();
  renderBoxes();

  msg(
    `${f.label} placed on page ${pdfPageNumber}.`
  );
};
document.getElementById("uploadPdfBtn").onclick=async()=>{
  if(!activeMapperTemplate){
    return msg(
      "Select a template.",
      "err"
    );
  }

  const file=
    document
      .getElementById(
        "pdfUpload"
      )
      .files?.[0];

  if(!file){
    return msg(
      "Choose a PDF.",
      "err"
    );
  }

  const fd=
    new FormData();

  fd.append(
    "pdf",
    file
  );

  try{
    const d=
      await api(
        `${API}/templates/${activeMapperTemplate._id}/pdf`,
        {
          method:"POST",
          body:fd
        }
      );

    const i=
      templates.findIndex(
        x=>
          String(x._id)===
          String(d.template._id)
      );

    if(i>=0){
      templates[i]=d.template;
    }

    activeMapperTemplate=
      d.template;

    msg(
      "PDF uploaded. Loading preview..."
    );

    /*
      Preview the exact local file that was just uploaded.
      This avoids a second immediate server round-trip.
    */
    await loadPdf(file);

  }catch(e){
    console.error(
      "SMART FORMS PDF UPLOAD/PREVIEW ERROR:",
      e
    );

    msg(
      e.message,
      "err"
    );
  }
};
document.getElementById("saveMappingBtn").onclick=async()=>{if(!activeMapperTemplate)return;try{const d=await api(`${API}/templates/${activeMapperTemplate._id}/mapping`,{method:"PUT",body:JSON.stringify({fields:mapperFields.map(f=>({_id:f._id,mapping:f.mapping}))})});const i=templates.findIndex(x=>String(x._id)===String(d.template._id));if(i>=0)templates[i]=d.template;activeMapperTemplate=d.template;mapperFields=JSON.parse(JSON.stringify(d.template.fields||[]));msg("Mapping saved.");renderMapFieldList();renderBoxes();}catch(e){msg(e.message,"err");}};
document.getElementById("prevPdfPage").onclick=async()=>{if(pdfDoc&&pdfPageNumber>1){pdfPageNumber--;await renderPdfPage();}};
document.getElementById("nextPdfPage").onclick=async()=>{if(pdfDoc&&pdfPageNumber<pdfPageCount){pdfPageNumber++;await renderPdfPage();}};

document.getElementById("prevPdfPageTop").onclick=async()=>{
  if(
    pdfDoc &&
    pdfPageNumber>1
  ){
    pdfPageNumber--;
    await renderPdfPage();
  }
};

document.getElementById("nextPdfPageTop").onclick=async()=>{
  if(
    pdfDoc &&
    pdfPageNumber<pdfPageCount
  ){
    pdfPageNumber++;
    await renderPdfPage();
  }
};

async function loadReview(){const b=document.getElementById("reviewBody");b.innerHTML=`<tr><td colspan="7">Loading...</td></tr>`;try{const rows=(await api(`${API}/submissions`)).submissions||[];b.innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(new Date(r.createdAt).toLocaleString())}</td><td>${esc(r.organizationName)}</td><td>${esc(r.templateName)}</td><td><span class="sf-status ${esc(r.status)}">${esc(r.status)}</span></td><td>${esc(r.tripNumber||"")}</td><td>${r.generatedPdf?.hasPdf?"Ready":""}</td><td><div class="sf-actions">${r.status!=="CONFIRMED"?`<button data-review="${r._id}">Review</button>`:""}<button data-generate="${r._id}">Generate PDF</button>${r.generatedPdf?.hasPdf?`<button data-view="${r._id}">View PDF</button>`:""}${r.status!=="CONFIRMED"?`<button data-confirm="${r._id}">Confirm</button><button data-delete="${r._id}">Delete</button>`:""}</div></td></tr>`).join(""):`<tr><td colspan="7">No reservations.</td></tr>`;}catch(e){b.innerHTML=`<tr><td colspan="7">${esc(e.message)}</td></tr>`;}}
document.getElementById("reviewBody").onclick=async e=>{try{if(e.target.dataset.review)await api(`${API}/submissions/${e.target.dataset.review}/review`,{method:"POST"});if(e.target.dataset.confirm)await api(`${API}/submissions/${e.target.dataset.confirm}/confirm`,{method:"POST"});if(e.target.dataset.generate)await api(`${API}/submissions/${e.target.dataset.generate}/generate-pdf`,{method:"POST"});if(e.target.dataset.delete){if(confirm("Delete this form?"))await api(`${API}/submissions/${e.target.dataset.delete}`,{method:"DELETE"});}if(e.target.dataset.view){const blob=await api(`${API}/submissions/${e.target.dataset.view}/pdf`),u=URL.createObjectURL(blob);window.open(u,"_blank");}await loadReview();}catch(err){msg(err.message,"err");}};
document.getElementById("refreshReviewBtn").onclick=loadReview;
document.getElementById("saveDraftBtn").onclick=()=>saveEntry("DRAFT");
document.getElementById("sendReviewBtn").onclick=()=>saveEntry("REVIEW");

[["entryOrganization","entryTemplate"],["builderOrganization","builderTemplate"],["mapperOrganization","mapperTemplate"]].forEach(([o,t])=>document.getElementById(o).onchange=()=>{templateOptions(document.getElementById(t),document.getElementById(o).value);if(o==="entryOrganization")renderEntry(currentTemplate(document.getElementById(t).value));if(o==="builderOrganization")activateBuilder();if(o==="mapperOrganization")activateMapper();});
document.getElementById("entryTemplate").onchange=e=>renderEntry(currentTemplate(e.target.value));
document.getElementById("builderTemplate").onchange=activateBuilder;
document.getElementById("mapperTemplate").onchange=activateMapper;

start().catch(e=>{console.error(e);msg(e.message,"err");});
