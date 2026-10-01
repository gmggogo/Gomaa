/* DESTINATION: server/public/admin/js/smart-form-split.js */
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const token=localStorage.getItem("token")||sessionStorage.getItem("token")||localStorage.getItem("staffToken")||sessionStorage.getItem("staffToken")||"";
  const headers=token?{Authorization:`Bearer ${token}`} : {};
  const state={submissions:[],groups:[],selectedIds:new Set(),selectedGroupIds:new Set(),query:""};
  const clean=v=>String(v??"").trim();
  const escape=v=>clean(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  async function request(url,options={}){const r=await fetch(url,{credentials:"include",cache:"no-store",...options,headers:{...headers,...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||`Request failed (${r.status})`);return d;}
  function stops(r){return(Array.isArray(r.stops)?r.stops:[]).map(x=>typeof x==="string"?x:x?.address||"").map(clean).filter(Boolean);}
  function cell(v){const items=Array.isArray(v)?v:[v];return `<div class="cell-box">${items.length?items.map(x=>`<div class="cell-item">${escape(x||"—")}</div>`).join(""):`<div class="cell-item">—</div>`}</div>`;}
  function tripSearch(row){return[row.tripNumber,row.templateName,row.serviceName,row.clientName,row.pickupAddress,row.dropoffAddress,...stops(row)].join(" ").toLowerCase();}
  function filtered(row){return!state.query||tripSearch(row).includes(state.query);}
  function notify(text,error=false){const n=$("notice");n.textContent=text;n.className=`notice show ${error?"error":"ok"}`;setTimeout(()=>n.className="notice",4500);}
  function renderIndividuals(){
    const members=state.submissions.filter(r=>!clean(r.sharedGroupId)&&filtered(r));
    $("individualRows").innerHTML=members.map(r=>{const id=String(r._id);return `<tr><td><input type="checkbox" data-individual="${escape(id)}" ${state.selectedIds.has(id)?"checked":""}></td><td><span class="trip-number">${escape(r.tripNumber||"—")}</span></td><td>${cell(r.templateName||"—")}</td><td>${cell(r.serviceName||"—")}</td><td>${cell(r.clientName||"—")}</td><td>${escape(r.tripDate||"—")}</td><td>${escape(r.pickupTime||"—")}</td><td>${cell(r.pickupAddress||"—")}</td><td>${cell(r.dropoffAddress||"—")}</td><td><span class="mode-pill individual">Individual</span></td><td><button class="eye-btn" data-eye="${escape(id)}" type="button">◉</button></td></tr>`;}).join("");
    $("individualEmpty").hidden=members.length>0;
  }
  function renderGroups(){
    const groups=state.groups.filter(g=>(g.trips||[]).some(filtered));
    $("groupCount").textContent=`${groups.length} groups`;
    $("groupList").innerHTML=groups.map(group=>{
      const id=clean(group.groupId),trips=(group.trips||[]).filter(filtered),selected=state.selectedGroupIds.has(id);
      return `<article class="group-card"><header class="group-head"><div><div class="group-title"><label><input type="checkbox" data-group="${escape(id)}" ${selected?"checked":""}> Share Group · ${escape(id)}</label></div><div class="group-meta"><span>${trips.length} trips</span><span>${escape(group.tripDate||"")}</span><span>${Number(group.routeMiles||0).toFixed(1)} miles</span><span>${Number(group.routeMinutes||0)} minutes</span><span>Pickup ${escape(group.calculatedFirstPickupTime||"")}</span></div></div><span class="mode-pill shared">Shared</span></header><div class="group-members">${trips.map(r=>`<div class="group-member"><div><span class="member-label">Trip / Template</span>${escape(r.tripNumber||"—")} · ${escape(r.templateName||"—")}</div><div><span class="member-label">Client / Service</span>${escape(r.clientName||"—")} · ${escape(r.serviceName||"—")}</div><div><span class="member-label">Pickup</span>${escape(r.pickupAddress||"—")}</div><div><span class="member-label">Drop-off</span>${escape(r.dropoffAddress||"—")}</div></div>`).join("")}</div></article>`;
    }).join("");
    $("groupEmpty").hidden=groups.length>0;
  }
  function renderStats(){const shared=state.groups.reduce((n,g)=>n+(Array.isArray(g.trips)?g.trips.length:0),0);$("statTrips").textContent=state.submissions.length;$("statGroups").textContent=state.groups.length;$("statSharedTrips").textContent=shared;$("statIndividuals").textContent=state.submissions.filter(r=>!r.sharedGroupId).length;$("statSelected").textContent=state.selectedIds.size+state.selectedGroupIds.size;$("statTemplates").textContent=new Set(state.submissions.map(x=>String(x.templateId||"")).filter(Boolean)).size;$("selectedCount").textContent=`${state.selectedIds.size+state.selectedGroupIds.size} selected`;$("buildShareBtn").disabled=state.selectedIds.size<2;$("confirmBtn").disabled=!state.selectedIds.size&&!state.selectedGroupIds.size;$("restoreBtn").disabled=!state.selectedGroupIds.size;}
  function render(){renderIndividuals();renderGroups();renderStats();}
  function line(label,value){return `<div class="view-line"><div class="view-label">${escape(label)}</div><div class="view-value">${escape(value===undefined||value===null||value===""?"—":typeof value==="object"?JSON.stringify(value,null,2):value)}</div></div>`;}
  function closeEye(){document.getElementById("smartFormSplitDetails")?.remove();}
  function openEye(id){const row=state.submissions.find(r=>String(r._id)===id);if(!row)return;closeEye();const fd=row.formData||{},snapshot=Array.isArray(row.fieldSnapshot)?row.fieldSnapshot:[];const fields=snapshot.map(f=>line(f.label||f.key,fd[f.key])).join("");const extra=Object.entries(fd).filter(([key])=>!snapshot.some(f=>String(f.key)===String(key))).map(([key,value])=>line(key,value)).join("");const o=document.createElement("div");o.id="smartFormSplitDetails";o.className="view-overlay";o.innerHTML=`<section class="view-box"><header class="view-head"><span>${escape(row.tripNumber||"Smart Form Trip")} · ${escape(row.templateName||"")}</span><button class="view-close" data-close type="button">×</button></header><div class="view-body">${line("Client",row.clientName)}${line("Service",row.serviceName)}${line("Pickup",row.pickupAddress)}${line("Stops",stops(row).join("\n"))}${line("Drop-off",row.dropoffAddress)}${line("Date",row.tripDate)}${line("Pickup Time",row.pickupTime)}${fields}${extra}</div></section>`;o.onclick=e=>{if(e.target===o||e.target.closest("[data-close]"))closeEye();};document.body.appendChild(o);}
  async function load(){const d=await request("/api/smart-forms/workflow/split/bootstrap");state.submissions=Array.isArray(d.submissions)?d.submissions:[];state.groups=Array.isArray(d.groups)?d.groups:[];const ids=new Set(state.submissions.map(r=>String(r._id)));state.selectedIds=new Set([...state.selectedIds].filter(id=>ids.has(id)));const groups=new Set(state.groups.map(g=>String(g.groupId)));state.selectedGroupIds=new Set([...state.selectedGroupIds].filter(id=>groups.has(id)));render();}
  $("individualRows").addEventListener("change",e=>{const box=e.target.closest("[data-individual]");if(!box)return;box.checked?state.selectedIds.add(box.dataset.individual):state.selectedIds.delete(box.dataset.individual);render();});
  $("individualRows").addEventListener("click",e=>{const button=e.target.closest("[data-eye]");if(button)openEye(button.dataset.eye);});
  $("groupList").addEventListener("change",e=>{const box=e.target.closest("[data-group]");if(!box)return;box.checked?state.selectedGroupIds.add(box.dataset.group):state.selectedGroupIds.delete(box.dataset.group);render();});
  $("searchInput").addEventListener("input",e=>{state.query=clean(e.target.value).toLowerCase();render();});
  $("selectAllBtn").onclick=()=>{state.submissions.filter(r=>!r.sharedGroupId).forEach(r=>state.selectedIds.add(String(r._id)));state.groups.forEach(g=>state.selectedGroupIds.add(String(g.groupId)));render();};
  $("selectNoneBtn").onclick=()=>{state.selectedIds.clear();state.selectedGroupIds.clear();render();};
  $("buildShareBtn").onclick=async()=>{try{const d=await request("/api/smart-forms/workflow/split/share",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({submissionIds:[...state.selectedIds]})});state.selectedIds.clear();state.selectedGroupIds.clear();notify(`${(d.groups||[]).length} share group(s) built; unmatched trips remain individual.`);await load();}catch(e){notify(e.message,true);}};
  $("restoreBtn").onclick=async()=>{try{const ids=[...state.selectedGroupIds];for(const groupId of ids)await request("/api/smart-forms/workflow/split/restore",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({groupId})});state.selectedGroupIds.clear();notify("Selected groups returned to individual trips.");await load();}catch(e){notify(e.message,true);}};
  $("confirmBtn").onclick=async()=>{try{const d=await request("/api/smart-forms/workflow/split/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({groupIds:[...state.selectedGroupIds],individualSubmissionIds:[...state.selectedIds]})});state.selectedIds.clear();state.selectedGroupIds.clear();notify(`${d.movedCount||0} trip(s) moved to final Review.`);await load();}catch(e){notify(e.message,true);}};
  $("refreshBtn").onclick=()=>load().catch(e=>notify(e.message,true));document.addEventListener("keydown",e=>{if(e.key==="Escape")closeEye();});
  load().catch(e=>notify(e.message,true));
})();
