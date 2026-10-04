/* SMART FORM LINKED MULTI-TRIP SPLIT — 2026-10-04 — SMART_FORM_HUB_MULTI_TRIP_LINKED_ROWS_2026_10_04 */
/* DESTINATION: server/public/admin/js/smart-form-split.js */
(()=>{
  "use strict";

  const $=id=>document.getElementById(id);
  const clean=value=>String(value??"").trim();
  const esc=value=>clean(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const token=sessionStorage.getItem("token")||sessionStorage.getItem("staffToken")||localStorage.getItem("token")||localStorage.getItem("staffToken")||"";
  const authHeaders=token?{Authorization:`Bearer ${token}`} : {};
  const state={submissions:[],groups:[],capabilities:{},activeTab:"ORIGINAL",selectedOriginal:new Set(),selectedIndividual:new Set(),selectedGroups:new Set(),template:"ALL",day:"ALL",search:"",confirmedCount:0,today:"",tomorrow:"",editingId:""};

  async function request(url,options={}){
    const response=await fetch(url,{credentials:"include",cache:"no-store",...options,headers:{...authHeaders,...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||`Request failed (${response.status})`);
    return data;
  }

  function notice(message,isError=false){
    const box=$("pageNotice");
    box.textContent=message;box.className=`notice show ${isError?"error":"ok"}`;
    clearTimeout(notice.timer);notice.timer=setTimeout(()=>box.className="notice",4500);
  }

  function isRoutePlaceholder(value){return /^(?:route|route\s+optimized(?:\s+per\s+passenger)?|route\s+order\s+will\s+be\s+calculated\s+by\s+the\s+shared\s+engine)[.!]?$/i.test(clean(value));}
  function notes(row){const value=clean(row?.notes);return isRoutePlaceholder(value)?"":value;}
  function stops(row){return(Array.isArray(row?.stops)?row.stops:[]).map(item=>typeof item==="string"?item:item?.address||"").map(clean).filter(value=>value&&!isRoutePlaceholder(value));}
  function displayTrip(row){const base=clean(row.smartFormBaseTripNumber)||clean(row.tripNumber).replace(/-T\d+$/i,"");const part=clean(row.smartFormTripLabel)||(Number(row.smartFormTripIndex)>0?`T${row.smartFormTripIndex}`:"");return `${base||"—"}${part?` · ${part}`:""}`;}
  function lane(row){if(clean(row?.sharedGroupId))return"SHARED";const value=clean(row?.splitDisposition).toUpperCase();return value==="INDIVIDUAL"?"INDIVIDUAL":"ORIGINAL";}
  function matches(row){
    if(state.template!=="ALL"&&clean(row.templateId)!==state.template)return false;
    if(state.day==="TODAY"&&clean(row.tripDate)!==state.today)return false;
    if(state.day==="TOMORROW"&&clean(row.tripDate)!==state.tomorrow)return false;
    if(!state.search)return true;
    return[row.tripNumber,row.templateName,row.clientName,row.pickupAddress,row.dropoffAddress,row.serviceName,notes(row),...stops(row)].join(" ").toLowerCase().includes(state.search);
  }
  function rowsFor(target){return state.submissions.filter(row=>lane(row)===target&&matches(row));}
  function sharedFeatureEnabled(){return state.capabilities?.sharedServiceEnabled===true||state.capabilities?.sharedServiceFound===true;}
  function address(value){return`<span class="address-box">${esc(value||"—")}</span>`;}
  function stopBoxes(row){const list=stops(row);return list.length?list.map(value=>`<span class="gh-stop-box">${esc(value)}</span>`).join(""):`<span class="gh-stop-box">—</span>`;}
  function selectedSet(target=state.activeTab){return target==="ORIGINAL"?state.selectedOriginal:target==="INDIVIDUAL"?state.selectedIndividual:state.selectedGroups;}
  function rowActions(row,allowEdit=true){const id=esc(row._id);return`<div class="row-actions"><button class="btn btn-blue" data-eye="${id}" type="button">View</button>${allowEdit?`<button class="btn btn-green" data-edit="${id}" type="button">Edit</button><button class="btn btn-red" data-delete="${id}" type="button">Delete</button>`:""}</div>`;}

  function originalRow(row){
    const id=String(row._id),checked=state.selectedOriginal.has(id)?" checked":"";
    return`<tr><td class="check-cell"><input type="checkbox" data-select-original="${esc(id)}"${checked}></td><td class="trip-id">${esc(displayTrip(row))}</td><td>${esc(row.templateName||"—")}</td><td>${esc(row.pickupTime||"—")}</td><td>${esc(row.clientName||"—")}</td><td class="address-cell">${address(row.pickupAddress)}</td><td class="stops-cell">${stopBoxes(row)}</td><td class="address-cell">${address(row.dropoffAddress)}</td><td>${esc(row.serviceName||"—")}</td><td class="notes-cell">${esc(notes(row)||"—")}</td><td><span class="status ready">Original</span></td><td><button class="eye-btn" data-eye="${esc(id)}" type="button" aria-label="View details">◉</button></td><td>${rowActions(row)}</td></tr>`;
  }
  function renderOriginal(){
    const rows=rowsFor("ORIGINAL"),groups=new Map();
    rows.forEach(row=>{const date=clean(row.tripDate)||"No Date";if(!groups.has(date))groups.set(date,[]);groups.get(date).push(row);});
    $("originalTripRows").innerHTML=[...groups.entries()].map(([date,list])=>`<tr class="date-group-row"><td colspan="13">${esc(date)} · ${list.length} trip${list.length===1?"":"s"}</td></tr>${list.map(originalRow).join("")}`).join("");
    $("originalCount").textContent=String(rows.length);$("originalEmpty").hidden=rows.length>0;
  }

  function individualRow(row){
    const id=String(row._id),checked=state.selectedIndividual.has(id)?" checked":"";
    return`<tr><td><input type="checkbox" data-select-individual="${esc(id)}"${checked}></td><td class="individual-trip-number">${esc(displayTrip(row))}</td><td>${esc(row.templateName||"—")}</td><td>${esc(row.pickupTime||"—")}</td><td>${esc(row.clientName||"—")}</td><td class="individual-address">${address(row.pickupAddress)}</td><td class="individual-stops">${stopBoxes(row)}</td><td class="individual-address">${address(row.dropoffAddress)}</td><td>${esc(row.serviceName||"—")}</td><td><span class="status ready">Individual</span></td><td><button class="eye-btn" data-eye="${esc(id)}" type="button">◉</button></td><td>${rowActions(row)}</td></tr>`;
  }
  function renderIndividual(){const rows=rowsFor("INDIVIDUAL");$("individualTripRows").innerHTML=rows.map(individualRow).join("");$("individualCount").textContent=String(rows.length);$("individualEmpty").hidden=rows.length>0;}

  function groupMatches(group){return(group.trips||[]).some(matches);}
  function routeSteps(group){
    const plan=Array.isArray(group.routePlan)?group.routePlan:[];
    const points=plan.length?plan:(group.trips||[]).flatMap(row=>[{type:"PICKUP",address:row.pickupAddress},{type:"DROPOFF",address:row.dropoffAddress}]);
    return points.map((point,index)=>{const label=clean(point.label||point.type||point.kind||`Stop ${index+1}`);const value=clean(point.address||point.location?.address||point.name);return`<div class="route-step"><span class="route-index">${index+1}</span><span><strong>${esc(label)}</strong>${value?` · ${esc(value)}`:""}</span></div>`;}).join("");
  }
  function groupCard(group){
    const groupId=clean(group.groupId),checked=state.selectedGroups.has(groupId)?" checked":"",trips=(group.trips||[]).filter(matches);
    return`<article class="group-card"><div class="group-head"><div><div class="group-title"><input type="checkbox" data-select-group="${esc(groupId)}"${checked}><span>Share Group · ${esc(groupId)}</span></div><div class="group-meta"><span>${trips.length} riders</span><span>${esc(group.tripDate||"")}</span><span>${Number(group.routeMiles||0).toFixed(1)} miles</span><span>${Math.round(Number(group.routeMinutes||0))} minutes</span><span>First pickup ${esc(group.calculatedFirstPickupTime||"—")}</span></div></div><span class="status shared">Shared</span></div><div class="table-wrap"><table><thead><tr><th>Select</th><th class="group-trip-number-head">Trip Number</th><th>Template</th><th>Pickup Time</th><th>Client</th><th>Pickup</th><th>Stops</th><th>Drop-off</th><th>Service</th><th>Details</th></tr></thead><tbody>${trips.map(row=>`<tr><td><input type="checkbox" checked disabled></td><td class="group-trip-number">${esc(row.tripNumber||"—")}</td><td>${esc(row.templateName||"—")}</td><td>${esc(row.pickupTime||"—")}</td><td>${esc(row.clientName||"—")}</td><td>${address(row.pickupAddress)}</td><td>${stopBoxes(row)}</td><td>${address(row.dropoffAddress)}</td><td>${esc(row.serviceName||"—")}</td><td><button class="eye-btn" data-eye="${esc(row._id)}" type="button">◉</button></td></tr>`).join("")}</tbody></table></div><div class="route-box"><strong>Route Order</strong>${routeSteps(group)||"<div>Route order will be calculated by the shared engine.</div>"}</div></article>`;
  }
  function renderGroups(){const groups=state.groups.filter(groupMatches);$("sharedGroups").innerHTML=groups.map(groupCard).join("");$("groupCount").textContent=String(groups.length);$("sharedEmpty").hidden=groups.length>0;}

  function renderFilters(){
    const current=$("templateFilter").value||state.template,templates=new Map();
    state.submissions.forEach(row=>{const id=clean(row.templateId);if(id)templates.set(id,clean(row.templateName)||"Template");});
    $("templateFilter").innerHTML=`<option value="ALL">All Templates</option>${[...templates].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join("")}`;
    $("templateFilter").value=templates.has(current)||current==="ALL"?current:"ALL";state.template=$("templateFilter").value;
  }
  function renderDayFilter(){
    const current=$("dayFilter").value||state.day||"ALL";
    $("dayFilter").innerHTML=`<option value="ALL">Today &amp; Tomorrow</option><option value="TODAY">Today · ${esc(state.today)}</option><option value="TOMORROW">Tomorrow · ${esc(state.tomorrow)}</option>`;
    $("dayFilter").value=["ALL","TODAY","TOMORROW"].includes(current)?current:"ALL";state.day=$("dayFilter").value;
  }
  function renderStats(){
    const originals=state.submissions.filter(row=>lane(row)==="ORIGINAL"),individuals=state.submissions.filter(row=>lane(row)==="INDIVIDUAL");
    const selected=state.selectedOriginal.size+state.selectedIndividual.size+state.selectedGroups.size;
    $("statTotalTrips").textContent=state.submissions.length;$("statNewTrips").textContent=originals.length;$("statIndividual").textContent=individuals.length;$("statGroups").textContent=state.groups.length;$("statSelected").textContent=selected;$("statConfirmed").textContent=state.confirmedCount;$("statActiveTemplates").textContent=new Set(state.submissions.map(row=>clean(row.templateId)).filter(Boolean)).size;$("statWithStops").textContent=state.submissions.filter(row=>stops(row).length).length;
    $("shareBtn").disabled=state.activeTab!=="ORIGINAL"||state.selectedOriginal.size<2;
    $("restoreBtn").disabled=!((state.activeTab==="INDIVIDUAL"&&state.selectedIndividual.size)||(state.activeTab==="SHARED"&&state.selectedGroups.size));
    $("confirmAllBtn").disabled=selectedSet().size===0;
  }
  function renderTabs(){
    document.querySelectorAll("[data-tab]").forEach(button=>button.classList.toggle("active",button.dataset.tab===state.activeTab));
    document.querySelectorAll("[data-trip-panel]").forEach(panel=>panel.classList.toggle("trip-panel-hidden",panel.dataset.tripPanel!==state.activeTab));
  }
  function renderShareVisibility(){const sharedAllowed=sharedFeatureEnabled();$("sharedTabBtn").classList.toggle("hidden",!sharedAllowed);$("shareBtn").classList.toggle("hidden",!sharedAllowed);$("splitTabs").classList.toggle("two-tabs",!sharedAllowed);if(!sharedAllowed&&state.activeTab==="SHARED")state.activeTab="ORIGINAL";}
  function render(){renderOriginal();renderIndividual();renderGroups();renderShareVisibility();renderStats();renderTabs();}

  function detailLine(label,value){let output=value;if(Array.isArray(value))output=value.join("\n");else if(value&&typeof value==="object")output=JSON.stringify(value,null,2);return`<div class="view-line"><div class="view-label">${esc(label)}</div><div class="view-value">${esc(output||"—")}</div></div>`;}
  function closeDetails(){document.getElementById("smartFormSplitDetails")?.remove();}
  function openDetails(id){
    const row=state.submissions.find(item=>String(item._id)===String(id));if(!row)return;closeDetails();
    const data=row.formData||{},snapshot=Array.isArray(row.fieldSnapshot)?row.fieldSnapshot:[],known=new Set(snapshot.map(field=>String(field.key)));
    const templateFields=snapshot.map(field=>detailLine(field.label||field.key,data[field.key])).join("");
    const extras=Object.entries(data).filter(([key])=>!known.has(String(key))).map(([key,value])=>detailLine(key,value)).join("");
    const overlay=document.createElement("div");overlay.id="smartFormSplitDetails";overlay.className="view-overlay";overlay.innerHTML=`<section class="view-box"><header class="view-head"><span>${esc(displayTrip(row))} · ${esc(row.templateName||"")}</span><button class="view-close" data-close-details type="button">×</button></header><div class="view-body">${detailLine("Part",row.smartFormTripLabel||"")}${detailLine("Client",row.clientName)}${detailLine("Service",row.serviceName)}${detailLine("Pickup",row.pickupAddress)}${detailLine("Stops",stops(row))}${detailLine("Drop-off",row.dropoffAddress)}${detailLine("Trip Date",row.tripDate)}${detailLine("Pickup Time",row.pickupTime)}${templateFields}${extras}</div></section>`;
    overlay.onclick=event=>{if(event.target===overlay||event.target.closest("[data-close-details]"))closeDetails();};document.body.appendChild(overlay);
  }

  function inputType(field){const type=clean(field.type).toUpperCase();if(type==="DATE")return"date";if(type==="TIME")return"time";if(type==="PHONE")return"tel";if(type==="NUMBER")return"number";return"text";}
  function openEdit(id){
    const row=state.submissions.find(item=>String(item._id)===String(id));if(!row||lane(row)==="SHARED")return;
    state.editingId=String(id);$("editDialogTitle").textContent=`Edit ${row.tripNumber||"Smart Form Trip"}`;
    const fields=(Array.isArray(row.fieldSnapshot)?row.fieldSnapshot:[]).filter(field=>clean(field.type).toUpperCase()!=="SIGNATURE");
    $("editFields").innerHTML=fields.map(field=>{const key=clean(field.key),label=clean(field.label)||key,value=row.formData?.[key]??"",type=clean(field.type).toUpperCase(),full=["TEXTAREA","ADDRESS","STOPS"].includes(type),required=field.required===true?" required":"";if(type==="SELECT"&&Array.isArray(field.options))return`<div class="dialog-field"><label>${esc(label)}</label><select data-edit-key="${esc(key)}"${required}><option value="">Select</option>${field.options.map(option=>`<option value="${esc(option)}"${clean(option)===clean(value)?" selected":""}>${esc(option)}</option>`).join("")}</select></div>`;if(full)return`<div class="dialog-field full"><label>${esc(label)}</label><textarea data-edit-key="${esc(key)}"${required}>${esc(Array.isArray(value)?value.join("\n"):value)}</textarea></div>`;return`<div class="dialog-field"><label>${esc(label)}</label><input data-edit-key="${esc(key)}" type="${inputType(field)}" value="${esc(value)}"${required}></div>`;}).join("");
    $("editDialog").showModal();
  }
  async function saveEdit(event){
    event.preventDefault();if(!state.editingId)return;const row=state.submissions.find(item=>String(item._id)===state.editingId);if(!row)return;
    const formData={...(row.formData||{})};document.querySelectorAll("#editFields [data-edit-key]").forEach(input=>{formData[input.dataset.editKey]=input.value;});
    await request(`/api/smart-forms/workflow/split/${encodeURIComponent(state.editingId)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({formData})});
    $("editDialog").close();notice("Smart Form trip updated.");await load();
  }
  async function removeTrip(id){if(!confirm("Delete this Smart Form trip? This cannot be undone."))return;await request(`/api/smart-forms/workflow/hub/${encodeURIComponent(id)}`,{method:"DELETE"});state.selectedOriginal.delete(String(id));state.selectedIndividual.delete(String(id));notice("Smart Form trip deleted.");await load();}

  async function load(){
    const [data,settings]=await Promise.all([request("/api/smart-forms/workflow/split/bootstrap"),request("/api/shared-engine/settings").catch(()=>({capabilities:{}}))]);state.submissions=Array.isArray(data.submissions)?data.submissions:[];state.groups=Array.isArray(data.groups)?data.groups:[];state.capabilities=settings?.capabilities||{};state.confirmedCount=Number(data.confirmedCount||0);state.today=clean(data.today);state.tomorrow=clean(data.tomorrow);
    const rowIds=new Set(state.submissions.map(row=>String(row._id))),groupIds=new Set(state.groups.map(group=>clean(group.groupId)));
    state.selectedOriginal=new Set([...state.selectedOriginal].filter(id=>rowIds.has(id)));state.selectedIndividual=new Set([...state.selectedIndividual].filter(id=>rowIds.has(id)));state.selectedGroups=new Set([...state.selectedGroups].filter(id=>groupIds.has(id)));
    renderFilters();renderDayFilter();render();
  }

  document.querySelectorAll("[data-tab]").forEach(button=>button.addEventListener("click",()=>{if(button.dataset.tab==="SHARED"&&!sharedFeatureEnabled())return;state.activeTab=button.dataset.tab;render();}));
  $("templateFilter").addEventListener("change",event=>{state.template=event.target.value;render();});
  $("dayFilter").addEventListener("change",event=>{state.day=event.target.value;render();});
  $("tripSearch").addEventListener("input",event=>{state.search=clean(event.target.value).toLowerCase();render();});
  document.body.addEventListener("change",event=>{const original=event.target.closest("[data-select-original]");const individual=event.target.closest("[data-select-individual]");const group=event.target.closest("[data-select-group]");if(original)original.checked?state.selectedOriginal.add(original.dataset.selectOriginal):state.selectedOriginal.delete(original.dataset.selectOriginal);if(individual)individual.checked?state.selectedIndividual.add(individual.dataset.selectIndividual):state.selectedIndividual.delete(individual.dataset.selectIndividual);if(group)group.checked?state.selectedGroups.add(group.dataset.selectGroup):state.selectedGroups.delete(group.dataset.selectGroup);if(original||individual||group)renderStats();});
  document.body.addEventListener("click",event=>{const eye=event.target.closest("[data-eye]"),edit=event.target.closest("[data-edit]"),remove=event.target.closest("[data-delete]");if(eye)openDetails(eye.dataset.eye);else if(edit)openEdit(edit.dataset.edit);else if(remove)removeTrip(remove.dataset.delete).catch(error=>notice(error.message,true));});

  $("selectAllBtn").onclick=()=>{const set=selectedSet(),values=state.activeTab==="SHARED"?state.groups.filter(groupMatches).map(group=>clean(group.groupId)):rowsFor(state.activeTab).map(row=>String(row._id));const allSelected=values.length&&values.every(id=>set.has(id));values.forEach(id=>allSelected?set.delete(id):set.add(id));render();};
  $("shareBtn").onclick=async()=>{try{if(!sharedFeatureEnabled())throw new Error("Shared service is disabled for this company.");const data=await request("/api/smart-forms/workflow/split/share",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({submissionIds:[...state.selectedOriginal]})});state.selectedOriginal.clear();notice(`${(data.groups||[]).length} share group(s) built. Unmatched trips moved to Individual Trips.`);await load();}catch(error){notice(error.message,true);}};
  $("restoreBtn").onclick=async()=>{try{if(state.activeTab==="INDIVIDUAL"){await request("/api/smart-forms/workflow/split/restore-individuals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({submissionIds:[...state.selectedIndividual]})});state.selectedIndividual.clear();}else if(state.activeTab==="SHARED"){for(const groupId of state.selectedGroups)await request("/api/smart-forms/workflow/split/restore",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({groupId})});state.selectedGroups.clear();}state.activeTab="ORIGINAL";notice("Selected trips restored to Original Trips.");await load();}catch(error){notice(error.message,true);}};
  $("confirmAllBtn").onclick=async()=>{try{const groupIds=state.activeTab==="SHARED"?[...state.selectedGroups]:[];const individualSubmissionIds=state.activeTab==="ORIGINAL"?[...state.selectedOriginal]:state.activeTab==="INDIVIDUAL"?[...state.selectedIndividual]:[];const data=await request("/api/smart-forms/workflow/split/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({groupIds,individualSubmissionIds})});selectedSet().clear();notice(`${data.movedCount||0} trip(s) moved to Smart Form Review.`);await load();}catch(error){notice(error.message,true);}};
  $("closeEditBtn").onclick=()=>$("editDialog").close();$("editForm").addEventListener("submit",event=>saveEdit(event).catch(error=>notice(error.message,true)));document.addEventListener("keydown",event=>{if(event.key==="Escape")closeDetails();});
  load().catch(error=>notice(error.message,true));
})();
