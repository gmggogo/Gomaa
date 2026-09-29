// GH Mobility Smart Forms - mapping fix 2026-09-29
const API="/api/smart-forms";
const token=sessionStorage.getItem("staffToken")||localStorage.getItem("staffToken")||sessionStorage.getItem("token")||localStorage.getItem("token")||"";
const role=String(sessionStorage.getItem("staffRole")||localStorage.getItem("staffRole")||sessionStorage.getItem("role")||localStorage.getItem("role")||"").toUpperCase();
if(!token || !["SUPER_ADMIN","ADMIN","DISPATCHER"].includes(role)) location.replace("/login.html");

let organizations=[],templates=[],builderFields=[],mapperFields=[],activeBuilderTemplate=null,activeMapperTemplate=null,selectedMapFieldId="",mapViewMode="ALL",pdfDoc=null,pdfPageNumber=1,pdfPageCount=0,pdfjsLib=null;

const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
function msg(t,type="ok"){const b=document.getElementById("sfMessage");b.textContent=t;b.className=`sf-message show ${type}`;clearTimeout(msg.t);msg.t=setTimeout(()=>b.className="sf-message",3500);}
async function api(url,opt={}){const h={...(opt.headers||{}),Authorization:`Bearer ${token}`};if(opt.body && !(opt.body instanceof FormData)) h["Content-Type"]="application/json";const r=await fetch(url,{...opt,headers:h});const ct=String(r.headers.get("content-type")||"");if(ct.includes("application/pdf")){if(!r.ok)throw new Error(`Request failed (${r.status})`);return r.blob();}const tx=await r.text();let d={};try{d=tx?JSON.parse(tx):{}}catch{}if(!r.ok)throw new Error(d.message||`Request failed (${r.status})`);return d;}
const currentTemplate=id=>templates.find(x=>String(x._id)===String(id))||null;
function orgOptions(sel){sel.innerHTML=organizations.length?organizations.map(o=>`<option value="${esc(o._id)}">${esc(o.name)}</option>`).join(""):`<option value="">No organizations</option>`;}
function templateOptions(sel,org,keep=""){const rows=templates.filter(t=>String(t.organizationId)===String(org));sel.innerHTML=rows.length?rows.map(t=>`<option value="${esc(t._id)}">${esc(t.name)}</option>`).join(""):`<option value="">No templates</option>`;if(keep&&rows.some(t=>String(t._id)===String(keep)))sel.value=keep;}
function syncSelects(){[["entryOrganization","entryTemplate"],["builderOrganization","builderTemplate"],["mapperOrganization","mapperTemplate"]].forEach(([o,t])=>templateOptions(document.getElementById(t),document.getElementById(o).value,document.getElementById(t).value));}

document.querySelectorAll(".sf-tab").forEach(b=>b.onclick=()=>{const tab=b.dataset.tab;document.querySelectorAll(".sf-tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".sf-panel").forEach(p=>p.classList.toggle("active",p.id===`panel-${tab}`));if(tab==="review")loadReview();if(tab==="builder")activateBuilder();if(tab==="mapper")activateMapper(true);});

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
}templates=(await api(`${API}/templates`)).templates||[];syncSelects();renderTemplateSidebar();selectEntryTemplate(document.getElementById("entryTemplate").value);activateBuilder();}
function inputControl(f,v=""){const label=`${esc(f.label)}${f.required?" *":""}`;if(f.type==="TEXTAREA")return `<div class="sf-control"><label>${label}</label><textarea id="entry_${esc(f.key)}">${esc(v)}</textarea></div>`;if(f.type==="SELECT")return `<div class="sf-control"><label>${label}</label><select id="entry_${esc(f.key)}"><option value="">Select...</option>${(f.options||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select></div>`;if(f.type==="CHECKBOX")return `<div class="sf-control"><label>${label}</label><input id="entry_${esc(f.key)}" type="checkbox"></div>`;if(f.type==="SIGNATURE")return `<div class="sf-control"><label>${label}</label><div style="padding:12px;border:1px dashed #bbb;border-radius:8px">Captured in Driver App</div></div>`;const m={NUMBER:"number",PHONE:"tel",DATE:"date",TIME:"time"};return `<div class="sf-control"><label>${label}</label><input id="entry_${esc(f.key)}" type="${m[f.type]||"text"}" value="${esc(v)}"></div>`;}
function renderEntry(t){const host=document.getElementById("entryForm");if(!t){host.innerHTML=`<div>No template selected.</div>`;return;}host.innerHTML=(t.fields||[]).filter(f=>(f.sourceType||"MANUAL")==="MANUAL").sort((a,b)=>(a.order||0)-(b.order||0)).map(f=>`<div class="sf-entry-field" style="width:${Number(f.widthPercent||50)}%">${inputControl(f)}</div>`).join("");}
function collectEntry(t){const d={};for(const f of t.fields||[]){if(f.type==="SIGNATURE")continue;const el=document.getElementById(`entry_${f.key}`);if(!el)continue;d[f.key]=f.type==="CHECKBOX"?el.checked:el.value;}return d;}
async function saveEntry(status){const t=currentTemplate(document.getElementById("entryTemplate").value);if(!t)return msg("Choose a template first.","err");try{await api(`${API}/submissions`,{method:"POST",body:JSON.stringify({templateId:t._id,formData:collectEntry(t),status})});msg(status==="REVIEW"?"Sent to Review.":"Draft saved.");renderEntry(t);if(status==="REVIEW")loadReview();}catch(e){msg(e.message,"err");}}
function activateBuilder(){activeBuilderTemplate=currentTemplate(document.getElementById("builderTemplate").value);builderFields=JSON.parse(JSON.stringify(activeBuilderTemplate?.fields||[]));renderBuilder();}
function renderBuilder(){
  const h=document.getElementById("builderList"),p=document.getElementById("builderPreview");
  if(!activeBuilderTemplate){h.innerHTML="Create or select a template.";p.innerHTML="";return;}
  const sources=["MANUAL","TRIP_DATA","DRIVER_DATA","VEHICLE_DATA","SYSTEM_AFTER_TRIP"];
  h.innerHTML=builderFields.map((f,i)=>`<div class="sf-builder-row">
    <span>☰</span>
    <div><strong>${esc(f.label)}</strong><div class="sf-source-badge">${esc(f.type)} · ${esc(f.sourceType||"MANUAL")}</div></div>
    <select data-width="${i}">${[10,20,25,33,40,50,60,66,75,80,100].map(w=>`<option value="${w}" ${Number(f.widthPercent||50)===w?"selected":""}>${w}%</option>`).join("")}</select>
    <select data-source="${i}">${sources.map(v=>`<option value="${v}" ${(f.sourceType||"MANUAL")===v?"selected":""}>${v.replaceAll("_"," ")}</option>`).join("")}</select>
    <label class="sf-repeat-wrap"><input type="checkbox" data-repeat="${i}" ${f.repeat===true?"checked":""}> Repeat</label>
    <button data-up="${i}" title="Move up">↑</button>
    <button data-down="${i}" title="Move down">↓</button>
    <button data-del="${i}">Delete</button>
  </div>`).join("");
  p.innerHTML=builderFields.map(f=>`<div class="sf-entry-field" style="width:${Number(f.widthPercent||50)}%">${inputControl(f)}</div>`).join("");
}
// GH Mobility - choose the official PDF page when creating a field.
(function ensureFieldPdfPageSelector(){
  const addBtn=document.getElementById("addFieldBtn");
  if(!addBtn || document.getElementById("fieldPdfPage"))return;
  const wrap=document.createElement("div");
  wrap.className="sf-control";
  wrap.innerHTML='<label>PDF Page</label><select id="fieldPdfPage"><option value="1">Page 1</option><option value="2">Page 2</option></select>';
  addBtn.parentNode.insertBefore(wrap,addBtn);
})();

document.getElementById("addFieldBtn").onclick=()=>{if(!activeBuilderTemplate)return msg("Select a template.","err");const label=document.getElementById("fieldLabel").value.trim();if(!label)return msg("Field label required.","err");let key=label.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")||`field_${builderFields.length+1}`;let n=2,base=key;while(builderFields.some(f=>f.key===key))key=`${base}_${n++}`;const type=document.getElementById("fieldType").value;builderFields.push({key,label,type,sourceType:"MANUAL",repeat:false,required:document.getElementById("fieldRequired").checked,options:document.getElementById("fieldOptions").value.split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean),widthPercent:Number(document.getElementById("fieldWidth").value),order:builderFields.length,mapping:{mapped:true,page:Number(document.getElementById("fieldPdfPage")?.value||1),xPercent:2,yPercent:2,widthPercent:20,heightPercent:type==="SIGNATURE"?8:4,fontSize:10,textAlign:"LEFT"},mappings:[{mapped:true,page:Number(document.getElementById("fieldPdfPage")?.value||1),xPercent:2,yPercent:2,widthPercent:20,heightPercent:type==="SIGNATURE"?8:4,fontSize:10,textAlign:"LEFT"}]});document.getElementById("fieldLabel").value="";document.getElementById("fieldOptions").value="";renderBuilder();};
document.getElementById("builderList").onclick=e=>{
  if(e.target.dataset.del!==undefined){builderFields.splice(Number(e.target.dataset.del),1);}
  if(e.target.dataset.up!==undefined){const i=Number(e.target.dataset.up);if(i>0)[builderFields[i-1],builderFields[i]]=[builderFields[i],builderFields[i-1]];}
  if(e.target.dataset.down!==undefined){const i=Number(e.target.dataset.down);if(i<builderFields.length-1)[builderFields[i+1],builderFields[i]]=[builderFields[i],builderFields[i+1]];}
  builderFields.forEach((f,j)=>f.order=j);renderBuilder();
};
document.getElementById("builderList").onchange=e=>{
  if(e.target.dataset.width!==undefined)builderFields[Number(e.target.dataset.width)].widthPercent=Number(e.target.value);
  if(e.target.dataset.source!==undefined)builderFields[Number(e.target.dataset.source)].sourceType=e.target.value;
  if(e.target.dataset.repeat!==undefined)builderFields[Number(e.target.dataset.repeat)].repeat=e.target.checked;
  renderBuilder();
};
document.getElementById("saveBuilderBtn").onclick=async()=>{if(!activeBuilderTemplate)return;try{const d=await api(`${API}/templates/${activeBuilderTemplate._id}/fields`,{method:"PUT",body:JSON.stringify({fields:builderFields})});const i=templates.findIndex(x=>String(x._id)===String(d.template._id));if(i>=0)templates[i]=d.template;activeBuilderTemplate=d.template;builderFields=JSON.parse(JSON.stringify(d.template.fields||[]));if(activeMapperTemplate&&String(activeMapperTemplate._id)===String(d.template._id)){activeMapperTemplate=d.template;mapperFields=JSON.parse(JSON.stringify(d.template.fields||[]));}renderBuilder();syncSelects();msg("Form Builder saved.");}catch(e){msg(e.message,"err");}};

async function canvasPageBlob(pageNo){
  if(!pdfDoc)throw new Error("Upload the official PDF first.");
  const page=await pdfDoc.getPage(pageNo),viewport=page.getViewport({scale:1.45});
  const canvas=document.createElement("canvas");canvas.width=viewport.width;canvas.height=viewport.height;
  await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
  return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not render PDF page")),"image/jpeg",0.78));
}
async function aiDetectFields(){
  if(!activeBuilderTemplate)return msg("Select a template first.","err");
  const mapperTemplate=currentTemplate(activeBuilderTemplate._id);activeMapperTemplate=mapperTemplate;
  if(!mapperTemplate?.originalPdf?.hasPdf)return msg("Upload the official PDF in PDF Map first.","err");
  const btn=document.getElementById("aiDetectBtn");btn.classList.add("sf-ai-busy");btn.textContent="✦ AI analyzing PDF...";
  try{
    await loadPdf();const fd=new FormData();
    for(let n=1;n<=Math.min(pdfPageCount,8);n++){const blob=await canvasPageBlob(n);fd.append("pages",blob,`page-${n}.jpg`);}
    const d=await api(`${API}/templates/${activeBuilderTemplate._id}/ai-detect`,{method:"POST",body:fd});
    const i=templates.findIndex(x=>String(x._id)===String(d.template._id));if(i>=0)templates[i]=d.template;
    activeBuilderTemplate=d.template;builderFields=JSON.parse(JSON.stringify(d.template.fields||[]));activeMapperTemplate=d.template;mapperFields=JSON.parse(JSON.stringify(d.template.fields||[]));
    renderBuilder();renderMapFieldList();msg(`AI detected ${builderFields.length} fields. Review layout, sources and PDF positions, then save.`);
  }catch(e){msg(e.message,"err");}
  finally{btn.classList.remove("sf-ai-busy");btn.textContent="✦ AI Detect Fields";}
}
document.getElementById("aiDetectBtn").onclick=aiDetectFields;

async function ensurePdfJs(){if(pdfjsLib)return pdfjsLib;pdfjsLib=await import("/vendor/pdfjs/pdf.mjs");pdfjsLib.GlobalWorkerOptions.workerSrc="/vendor/pdfjs/pdf.worker.mjs";return pdfjsLib;}
async function activateMapper(refreshFromServer=false){
  const templateId=document.getElementById("mapperTemplate").value;
  if(refreshFromServer){
    try{
      const d=await api(`${API}/templates`);
      const fresh=d.templates||[];
      if(fresh.length){
        templates=fresh;
        syncSelects();
        document.getElementById("mapperTemplate").value=templateId;
      }
    }catch(e){ console.warn("Could not refresh Smart Form templates:",e); }
  }
  activeMapperTemplate=currentTemplate(document.getElementById("mapperTemplate").value);
  mapperFields=JSON.parse(JSON.stringify(activeMapperTemplate?.fields||[]));
  const stillExists=mapperFields.some(f=>String(f._id)===String(selectedMapFieldId));
  if(!stillExists) selectedMapFieldId=mapperFields[0]?._id||"";
  renderMapFieldList();
  await loadPdf();
  requestAnimationFrame(()=>renderBoxes());
}
function renderMapFieldList(){
  const h=document.getElementById("mapFieldList");
  const mappedCount=mapperFields.filter(f=>fieldMaps(f).length>0).length;
  const missingCount=mapperFields.length-mappedCount;

  let controls=document.getElementById("sfMapViewControls");
  if(!controls){
    controls=document.createElement("div");
    controls.id="sfMapViewControls";
    controls.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px 0";
    controls.innerHTML=`<button type="button" id="sfShowSelectedBtn">Show Selected Only</button><button type="button" id="sfShowAllBtn">Show All</button>`;
    h.parentElement.insertBefore(controls,h);
    document.getElementById("sfShowSelectedBtn").onclick=()=>{mapViewMode="SELECTED";renderMapFieldList();renderBoxes();};
    document.getElementById("sfShowAllBtn").onclick=()=>{mapViewMode="ALL";renderMapFieldList();renderBoxes();};
  }
  const selectedBtn=document.getElementById("sfShowSelectedBtn"),allBtn=document.getElementById("sfShowAllBtn");
  if(selectedBtn)selectedBtn.style.fontWeight=mapViewMode==="SELECTED"?"700":"400";
  if(allBtn)allBtn.style.fontWeight=mapViewMode==="ALL"?"700":"400";

  let status=document.getElementById("sfMapStatus");
  if(!status){
    status=document.createElement("div");
    status.id="sfMapStatus";
    status.style.cssText="font-size:12px;margin:0 0 8px 0;color:#555";
    h.parentElement.insertBefore(status,h);
  }
  status.textContent=`Mapped: ${mappedCount} · Missing: ${missingCount}`;

  h.innerHTML=mapperFields.map(f=>{
    const count=fieldMaps(f).length;
    return `<button class="sf-map-field ${String(f._id)===String(selectedMapFieldId)?"active":""}" data-id="${esc(f._id)}"><span>${esc(f.label)}</span><small>${count?`Mapped${count>1?` (${count})`:""}`:"Missing / Not mapped"}</small></button>`;
  }).join("");

  h.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{
    selectedMapFieldId=b.dataset.id;
    renderMapFieldList();
    const f=mapperFields.find(x=>String(x._id)===String(selectedMapFieldId));
    const maps=f?fieldMaps(f):[];
    const targetPage=Number(maps[0]?.page||f?.mapping?.page||pdfPageNumber||1);
    if(pdfDoc && targetPage>=1 && targetPage<=pdfPageCount && targetPage!==pdfPageNumber){
      pdfPageNumber=targetPage;
      renderPdfPage();
    }else{
      renderBoxes();
    }
    if(f)msg(maps.length?`Selected: ${f.label}. Page ${targetPage}. Drag or resize its existing box.`:`${f.label} is Missing / Not mapped. Create its box from Form Builder.`);
  });
}

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
  requestAnimationFrame(()=>renderBoxes());
}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function fieldMaps(f){
  const arr=Array.isArray(f.mappings)?f.mappings.filter(m=>m?.mapped):[];
  if(arr.length)return arr;
  return f.mapping?.mapped?[f.mapping]:[];
}
function renderBoxes(){
  const stage=document.getElementById("pdfStage");
  stage.querySelectorAll(".sf-map-box").forEach(x=>x.remove());
  if(!pdfDoc)return;
  mapperFields.forEach(f=>{
    if(mapViewMode==="SELECTED" && String(f._id)!==String(selectedMapFieldId))return;
    const maps=fieldMaps(f);
    maps.forEach((m,mapIndex)=>{
      if(Number(m.page||1)!==pdfPageNumber)return;
      const b=document.createElement("div"),active=String(f._id)===String(selectedMapFieldId);
      b.className=`sf-map-box ${active?"active":""}`;b.dataset.fieldId=String(f._id);b.dataset.mapIndex=String(mapIndex);
      b.style.left=`${m.xPercent}%`;b.style.top=`${m.yPercent}%`;b.style.width=`${m.widthPercent}%`;b.style.height=`${m.heightPercent}%`;b.style.zIndex=active?"30":"10";
      b.innerHTML=`<span class="label">${esc(f.label)}${maps.length>1?` #${mapIndex+1}`:""}</span><button type="button" class="sf-map-delete" title="Delete mapping" aria-label="Delete mapping" style="position:absolute;right:-9px;top:-9px;width:20px;height:20px;border-radius:50%;border:1px solid #b91c1c;background:#fff;color:#b91c1c;font-weight:700;line-height:16px;padding:0;cursor:pointer;z-index:50">×</button>${active?["nw","n","ne","e","se","s","sw","w"].map(d=>`<span class="sf-resize-handle ${d}" data-dir="${d}"></span>`).join(""):""}`;

      b.querySelector(".sf-map-delete").onclick=e=>{
        e.preventDefault();e.stopPropagation();
        const current=fieldMaps(f);
        current.splice(mapIndex,1);
        if(current.length){
          f.mapping={...current[0]};
          f.mappings=current.map(x=>({...x}));
        }else{
          f.mapping={...(f.mapping||{}),mapped:false};
          f.mappings=[];
        }
        renderMapFieldList();renderBoxes();
        msg(current.length?`${f.label}: mapping deleted. ${current.length} remaining.`:`${f.label}: last box deleted — now Missing / Not mapped.`);
      };

      b.addEventListener("pointerdown",e=>{
        if(e.target.closest(".sf-map-delete"))return;
        e.preventDefault();e.stopPropagation();selectedMapFieldId=f._id;
        if(!b.classList.contains("active")){renderMapFieldList();renderBoxes();return;}
        const dir=e.target.closest(".sf-resize-handle")?.dataset.dir||"move",rect=stage.getBoundingClientRect(),startX=e.clientX,startY=e.clientY;
        const start={x:Number(m.xPercent)||0,y:Number(m.yPercent)||0,w:Number(m.widthPercent)||20,h:Number(m.heightPercent)||4};
        const minW=Math.max(1.5,1000/Math.max(rect.width,1)),minH=Math.max(1.2,700/Math.max(rect.height,1));b.setPointerCapture?.(e.pointerId);
        const move=ev=>{ev.preventDefault();const dx=((ev.clientX-startX)/rect.width)*100,dy=((ev.clientY-startY)/rect.height)*100;let x=start.x,y=start.y,w=start.w,h=start.h;
          if(dir==="move"){x=clamp(start.x+dx,0,100-start.w);y=clamp(start.y+dy,0,100-start.h);}else{if(dir.includes("e"))w=clamp(start.w+dx,minW,100-start.x);if(dir.includes("s"))h=clamp(start.h+dy,minH,100-start.y);if(dir.includes("w")){const right=start.x+start.w;x=clamp(start.x+dx,0,right-minW);w=right-x;}if(dir.includes("n")){const bottom=start.y+start.h;y=clamp(start.y+dy,0,bottom-minH);h=bottom-y;}}
          Object.assign(m,{xPercent:x,yPercent:y,widthPercent:w,heightPercent:h});if(mapIndex===0)f.mapping={...m};b.style.left=`${x}%`;b.style.top=`${y}%`;b.style.width=`${w}%`;b.style.height=`${h}%`;
        };
        const end=ev=>{b.removeEventListener("pointermove",move);b.removeEventListener("pointerup",end);b.removeEventListener("pointercancel",end);try{b.releasePointerCapture?.(ev.pointerId)}catch(_){}renderMapFieldList();renderBoxes();};
        b.addEventListener("pointermove",move);b.addEventListener("pointerup",end);b.addEventListener("pointercancel",end);
      });
      stage.appendChild(b);
    });
  });
}

document.getElementById("pdfStage").onclick=e=>{
  // PDF Map is edit-only. Clicking the PDF background must never create a box.
  // Boxes are created by Form Builder / AI and are only moved, resized or deleted here.
  if(e.target.closest(".sf-map-box"))return;
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
document.getElementById("saveMappingBtn").onclick=async()=>{if(!activeMapperTemplate)return;try{const d=await api(`${API}/templates/${activeMapperTemplate._id}/mapping`,{method:"PUT",body:JSON.stringify({fields:mapperFields.map(f=>({_id:f._id,mapping:f.mapping,mappings:f.mappings||[]}))})});const i=templates.findIndex(x=>String(x._id)===String(d.template._id));if(i>=0)templates[i]=d.template;activeMapperTemplate=d.template;mapperFields=JSON.parse(JSON.stringify(d.template.fields||[]));if(activeBuilderTemplate&&String(activeBuilderTemplate._id)===String(d.template._id)){activeBuilderTemplate=d.template;builderFields=JSON.parse(JSON.stringify(d.template.fields||[]));renderBuilder();}msg("Mapping saved.");renderMapFieldList();renderBoxes();}catch(e){msg(e.message,"err");}};
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
if(document.getElementById("refreshReviewBtn"))document.getElementById("refreshReviewBtn").onclick=loadReview;
document.getElementById("saveDraftBtn").onclick=()=>saveEntry("DRAFT");
document.getElementById("sendReviewBtn").onclick=()=>saveEntry("REVIEW");

[["entryOrganization","entryTemplate"],["builderOrganization","builderTemplate"],["mapperOrganization","mapperTemplate"]].forEach(([o,t])=>document.getElementById(o).onchange=()=>{templateOptions(document.getElementById(t),document.getElementById(o).value);if(o==="entryOrganization"){renderEntry(currentTemplate(document.getElementById(t).value));renderTemplateSidebar();}if(o==="builderOrganization")activateBuilder();if(o==="mapperOrganization")activateMapper();});
document.getElementById("entryTemplate").onchange=e=>{renderEntry(currentTemplate(e.target.value));renderTemplateSidebar();};
document.getElementById("builderTemplate").onchange=activateBuilder;
document.getElementById("mapperTemplate").onchange=activateMapper;


function companyDisplayName(){
  const keys=["companyName","staffCompanyName","tenantName","company","tenantSlug"];
  for(const k of keys){const v=sessionStorage.getItem(k)||localStorage.getItem(k);if(v&&String(v).trim())return String(v).trim();}
  return "Company";
}
function showSmartPanel(name){
  document.querySelectorAll(".sf-panel").forEach(p=>p.classList.toggle("active",p.id===`panel-${name}`));
  document.querySelectorAll(".sf-tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  document.getElementById("openFormBtn")?.classList.toggle("active",name==="entry");
  document.getElementById("openSettingsBtn")?.classList.toggle("active",name!=="entry");
  const settings=document.getElementById("sfSettingsHome");if(settings)settings.classList.toggle("open",name!=="entry");
  if(name==="builder")activateBuilder();
  if(name==="mapper")activateMapper(true);
}
function selectEntryTemplate(id){
  const t=currentTemplate(id)||templates[0]||null;
  if(!t){renderEntry(null);renderTemplateSidebar();return;}
  const orgId=String(t.organizationId||"");
  document.getElementById("entryOrganization").value=orgId;
  templateOptions(document.getElementById("entryTemplate"),orgId,String(t._id));
  document.getElementById("entryTemplate").value=String(t._id);
  document.getElementById("builderOrganization").value=orgId;
  templateOptions(document.getElementById("builderTemplate"),orgId,String(t._id));
  document.getElementById("builderTemplate").value=String(t._id);
  document.getElementById("mapperOrganization").value=orgId;
  templateOptions(document.getElementById("mapperTemplate"),orgId,String(t._id));
  document.getElementById("mapperTemplate").value=String(t._id);
  const title=document.getElementById("entryTemplateTitle");if(title)title.textContent=t.name||"New Reservation Form";
  const pageTitle=document.getElementById("sfPageTitle");if(pageTitle)pageTitle.textContent=t.name||"Smart Form";
  renderEntry(t);renderTemplateSidebar();showSmartPanel("entry");
}
function renderTemplateSidebar(){
  const host=document.getElementById("sfTemplateList");if(!host)return;
  const active=String(document.getElementById("entryTemplate")?.value||"");
  const organizationId=String(document.getElementById("entryOrganization")?.value||"");
  const rows=templates.filter(t=>String(t.organizationId||"")===organizationId);
  host.innerHTML=rows.length?rows.map(t=>`<button type="button" class="sf-template-item ${String(t._id)===active?"active":""}" data-template-id="${esc(t._id)}"><span>${esc(t.name)}</span></button>`).join(""):`<div class="sf-empty-side">No templates</div>`;
  host.querySelectorAll("[data-template-id]").forEach(b=>b.onclick=()=>selectEntryTemplate(b.dataset.templateId));
}
const companyNameEl=document.getElementById("sfCompanyName");if(companyNameEl)companyNameEl.textContent=companyDisplayName();
document.getElementById("openFormBtn")?.addEventListener("click",()=>showSmartPanel("entry"));
document.getElementById("openSettingsBtn")?.addEventListener("click",()=>showSmartPanel("builder"));

start().catch(e=>{console.error(e);msg(e.message,"err");});
