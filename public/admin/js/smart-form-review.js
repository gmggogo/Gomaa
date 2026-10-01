DESTINATION: server/public/admin/js/smart-form-review.js
/* DESTINATION: server/public/admin/js/smart-form-review.js */
(()=>{
  "use strict";

  const $=id=>document.getElementById(id);
  const token=
    sessionStorage.getItem("token")||
    sessionStorage.getItem("staffToken")||
    localStorage.getItem("token")||
    localStorage.getItem("staffToken")||
    "";
  const auth=token?{Authorization:`Bearer ${token}`} : {};
  const state={trips:[],visible:[],selected:new Set(),query:"",baselineIds:new Set(),baselineInitialized:false,editing:null};

  const clean=value=>String(value??"").trim();
  const esc=value=>clean(value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");

  async function api(url,options={}){
    const response=await fetch(url,{
      credentials:"include",
      cache:"no-store",
      ...options,
      headers:{...auth,...(options.headers||{})}
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||`Request failed (${response.status})`);
    return data;
  }

  function tripKey(row){
    return String(row.tripId||row.dispatchTrip?._id||row._id);
  }

  function recordPrice(row){
    const members=row.submissions||[];
    if(
      !members.length||
      members.some(member=>
        member.pricing?.calculated!==true||
        member.pricing?.amount===null||
        member.pricing?.amount===undefined
      )
    )return null;
    return members.reduce((sum,member)=>sum+Number(member.pricing.amount),0);
  }

  function money(value){
    return value===null||!Number.isFinite(value)?"—":`$${value.toFixed(2)}`;
  }

  function normalize(row){
    const dispatch=row.dispatchTrip||{};
    return {
      ...row,
      ...dispatch,
      tripId:String(dispatch._id||row.tripId||""),
      submissions:[],
      dispatchTrip:dispatch
    };
  }

  function groupRows(rows){
    const map=new Map();
    for(const raw of rows){
      const row=normalize(raw);
      const key=tripKey(row);
      let entry=map.get(key);
      if(!entry){
        entry={...row,submissions:[]};
        map.set(key,entry);
      }
      entry.submissions.push(raw);
    }
    return [...map.values()];
  }

  function stopAddress(value){
    if(value&&typeof value==="object"){
      return clean(value.address||value.value||value.location||value.name||value.label);
    }
    return clean(value);
  }

  function stops(source){
    return Array.isArray(source?.stops)
      ? source.stops.map(stopAddress).filter(Boolean)
      : [];
  }

  function reviewMemberRows(trip){
    const members=Array.isArray(trip.submissions)?trip.submissions:[];
    const source=members.length?members:[trip];
    return source.map(member=>({
      id:String(member._id||member.id||trip._id||""),
      templateName:clean(member.templateName)||"—",
      serviceName:clean(member.serviceName||trip.serviceName||trip.serviceKey)||"—",
      clientName:clean(member.clientName||member.name)||"—",
      phone:clean(member.phone||member.phoneNumber||member.formData?.phone||member.formData?.Phone)||"—",
      tripDate:clean(member.tripDate||trip.tripDate)||"—",
      pickupTime:clean(member.pickupTime||member.tripTime||trip.tripTime)||"—",
      pickup:clean(member.pickupAddress||member.pickup)||"—",
      stops:stops(member),
      dropoff:clean(member.dropoffAddress||member.dropoff)||"—",
      notes:clean(member.notes||member.driverInstructions||member.formData?.notes||member.formData?.Notes)||"—",
      raw:member
    }));
  }

  function searchText(trip){
    const rows=reviewMemberRows(trip);
    return [
      trip.tripNumber,
      trip.groupId,
      ...rows.flatMap(member=>[
        member.templateName,
        member.serviceName,
        member.clientName,
        member.tripDate,
        member.pickupTime,
        member.pickup,
        ...member.stops,
        member.dropoff
      ])
    ].join(" ").toLowerCase();
  }

  function cell(values){
    const list=Array.isArray(values)?values:[values];
    const shown=list.length?list:["—"];
    return `<div class="cell-box">${shown.map(value=>
      `<div class="cell-item">${esc(value||"—")}</div>`
    ).join("")}</div>`;
  }

  function memberStopsCell(rows){
    return `<div class="cell-box">${rows.map(member=>{
      const values=member.stops;
      return `<div class="cell-item review-stops-wrap">${
        values.length
          ? values.map((stop,index)=>
              `<div class="review-stop-box"><span class="review-stop-number">${index+1}.</span><span>${esc(stop)}</span></div>`
            ).join("")
          : `<div class="review-stop-box empty-stop">—</div>`
      }</div>`;
    }).join("")}</div>`;
  }

  function activeTemplates(){
    return new Set(
      state.trips.flatMap(trip=>trip.submissions.map(member=>String(member.templateId||""))).filter(Boolean)
    ).size;
  }

  function stats(){
    const shared=state.trips.filter(trip=>trip.isShared||trip.submissions.length>1);
    return {
      sharedGroups:shared.length,
      sharedTrips:shared.reduce((count,trip)=>count+Math.max(1,trip.submissions.length),0),
      sharedPassengers:shared.reduce((count,trip)=>count+Math.max(1,trip.submissions.length),0),
      individualTrips:state.trips.length-shared.length,
      newTrips:state.baselineInitialized
        ? state.trips.filter(trip=>!state.baselineIds.has(tripKey(trip))).length
        : 0,
      activeTemplates:activeTemplates()
    };
  }

  function tripSubmissionIds(trip){
    return [...new Set((trip.submissions||[]).map(member=>String(member._id)).filter(Boolean))];
  }

  function selectedSubmissionIds(){
    return [...new Set(
      state.trips
        .filter(trip=>state.selected.has(tripKey(trip)))
        .flatMap(tripSubmissionIds)
    )];
  }

  function actionButtons(id){
    return `<div class="review-actions">
      <button class="btn green mini" type="button" data-confirm="${esc(id)}">Confirm</button>
      <button class="btn navy mini" type="button" data-edit="${esc(id)}">Edit</button>
      <button class="eye-btn" type="button" data-eye="${esc(id)}" aria-label="View original template data">◉</button>
    </div>`;
  }

  function render(){
    const query=state.query;
    state.visible=state.trips.filter(trip=>!query||searchText(trip).includes(query));

    $("reviewRows").innerHTML=state.visible.map(trip=>{
      const id=tripKey(trip);
      const rows=reviewMemberRows(trip);
      const shared=Boolean(trip.isShared||rows.length>1);
      const selected=state.selected.has(id);

      return `<tr>
        <td><input type="checkbox" data-select="${esc(id)}" ${selected?"checked":""} aria-label="Select ${esc(trip.tripNumber)}"></td>
        <td><span class="trip-number">${esc(trip.tripNumber||"—")}</span></td>
        <td>${cell(rows.map(member=>member.templateName))}</td>
        <td><span class="mode-pill ${shared?"shared":"individual"}">${shared?"Shared":"Individual"}</span></td>
        <td>${esc(trip.groupId||trip.sharedGroupId||"—")}</td>
        <td>${cell(rows.map(member=>member.tripDate))}</td>
        <td>${cell(rows.map(member=>member.pickupTime))}</td>
        <td>${cell(rows.map(member=>member.clientName))}</td>
        <td>${cell(rows.map(member=>member.phone))}</td>
        <td>${cell(rows.map(member=>member.pickup))}</td>
        <td>${memberStopsCell(rows)}</td>
        <td>${cell(rows.map(member=>member.dropoff))}</td>
        <td>${cell(rows.map(member=>member.serviceName))}</td>
        <td>${cell(rows.map(member=>member.notes))}</td>
        <td>${money(recordPrice(trip))}</td>
        <td><span class="status-pill review">Final Review</span></td>
        <td>${actionButtons(id)}</td>
      </tr>`;
    }).join("");

    $("emptyState").hidden=state.visible.length>0;
    const currentStats=stats();
    $("statSharedGroups").textContent=currentStats.sharedGroups;
    $("statSharedTrips").textContent=currentStats.sharedTrips;
    $("statSharedPassengers").textContent=currentStats.sharedPassengers;
    $("statIndividualTrips").textContent=currentStats.individualTrips;
    $("statNewTrips").textContent=currentStats.newTrips;
    $("statActiveTemplates").textContent=currentStats.activeTemplates;
    $("selectedCount").textContent=`${state.selected.size} selected`;
    $("confirmSelectedBtn").disabled=!state.selected.size;
    $("deleteSelectedBtn").disabled=!state.selected.size;
  }

  function line(label,value){
    const shown=value===undefined||value===null||value===""
      ? "—"
      : typeof value==="object"
        ? JSON.stringify(value,null,2)
        : value;
    return `<div class="view-line"><div class="view-label">${esc(label)}</div><div class="view-value">${esc(shown)}</div></div>`;
  }

  function closeDetails(){
    $("reviewDetails")?.remove();
  }

  function openDetails(id){
    const trip=state.trips.find(row=>tripKey(row)===id);
    if(!trip)return;
    closeDetails();

    const templateBlocks=trip.submissions.map((submission,index)=>{
      const data=submission.formData&&typeof submission.formData==="object"?submission.formData:{};
      const fields=Array.isArray(submission.fieldSnapshot)?submission.fieldSnapshot:[];
      const mapped=fields
        .filter(field=>data[field?.key]!==undefined)
        .map(field=>line(field.label||field.key,data[field.key]));
      const known=new Set(fields.map(field=>String(field.key)));
      const extra=Object.entries(data)
        .filter(([key])=>!known.has(String(key)))
        .map(([key,value])=>line(key,value));
      return `<section><div class="panel-head">${esc(submission.templateName||"Smart Form Template")} · ${index+1}</div><div class="view-body">${line("Template ID",submission.templateId)}${mapped.join("")}${extra.join("")}</div></section>`;
    }).join("");

    const routeBlocks=reviewMemberRows(trip).map((member,index)=>
      line(
        `Rider ${index+1} Route`,
        [
          `Pickup Time: ${member.pickupTime}`,
          `Pickup: ${member.pickup}`,
          `Stops: ${member.stops.length?member.stops.join(" | "):"—"}`,
          `Drop-off: ${member.dropoff}`
        ].join("\n")
      )
    ).join("");

    const overlay=document.createElement("div");
    overlay.id="reviewDetails";
    overlay.className="view-overlay";
    overlay.innerHTML=`<section class="view-box">
      <header class="view-head"><span>${esc(trip.tripNumber||"Smart Form Trip")} · Original template data</span><button class="view-close" type="button" data-close>×</button></header>
      <div class="view-body">${line("Service",trip.serviceName||trip.serviceKey)}${line("Trip Date",trip.tripDate)}${routeBlocks}${templateBlocks||line("Template data","No saved template snapshot")}</div>
    </section>`;
    overlay.onclick=event=>{
      if(event.target===overlay||event.target.closest("[data-close]"))closeDetails();
    };
    document.body.appendChild(overlay);
  }

  function editableFields(submission){
    return (Array.isArray(submission?.fieldSnapshot)?submission.fieldSnapshot:[])
      .filter(field=>{
        const key=clean(field?.key).toLowerCase();
        const label=clean(field?.label).toLowerCase();
        const type=clean(field?.type).toUpperCase();
        const haystack=`${key} ${label}`;
        if(type==="SIGNATURE")return false;
        if(haystack.includes("date"))return false;
        if(haystack.includes("time"))return false;
        return clean(field?.key);
      });
  }

  function fieldInput(field,value){
    const key=esc(field.key);
    const label=esc(field.label||field.key);
    const type=clean(field.type).toUpperCase();
    const shown=value===undefined||value===null?"":value;
    if(type==="TEXTAREA"){
      return `<label class="edit-field full"><span>${label}</span><textarea data-edit-key="${key}">${esc(shown)}</textarea></label>`;
    }
    if(type==="SELECT"&&Array.isArray(field.options)){
      return `<label class="edit-field"><span>${label}</span><select data-edit-key="${key}">${
        field.options.map(option=>{
          const opt=typeof option==="object"?clean(option.value||option.label):clean(option);
          return `<option value="${esc(opt)}" ${String(shown)===opt?"selected":""}>${esc(opt)}</option>`;
        }).join("")
      }</select></label>`;
    }
    return `<label class="edit-field"><span>${label}</span><input data-edit-key="${key}" value="${esc(shown)}"></label>`;
  }

  function closeEdit(){
    $("reviewEdit")?.remove();
    state.editing=null;
  }

  function openEdit(id){
    const trip=state.trips.find(row=>tripKey(row)===id);
    if(!trip)return;
    const submissions=Array.isArray(trip.submissions)?trip.submissions:[];
    const editable=submissions.map((submission,index)=>{
      const fields=editableFields(submission);
      const data=submission.formData&&typeof submission.formData==="object"?submission.formData:{};
      return `<section class="edit-section" data-edit-submission="${esc(submission._id)}">
        <h3>${esc(submission.templateName||"Smart Form Template")} · Rider ${index+1}</h3>
        <div class="edit-grid">${
          fields.length
            ? fields.map(field=>fieldInput(field,data[field.key])).join("")
            : `<div class="empty">No editable fields for this rider.</div>`
        }</div>
      </section>`;
    }).join("");
    closeEdit();
    state.editing=id;
    const overlay=document.createElement("div");
    overlay.id="reviewEdit";
    overlay.className="view-overlay";
    overlay.innerHTML=`<section class="view-box review-edit-box">
      <header class="view-head"><span>Edit ${esc(trip.tripNumber||"Smart Form Trip")} · date/time locked</span><button class="view-close" type="button" data-close>×</button></header>
      <div class="view-body">${editable||"<div class='empty'>No editable submissions.</div>"}<div class="edit-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn green" type="button" data-save-edit>Save Edit</button></div></div>
    </section>`;
    overlay.onclick=event=>{
      if(event.target===overlay||event.target.closest("[data-close]"))closeEdit();
      if(event.target.closest("[data-save-edit]"))saveEdit();
    };
    document.body.appendChild(overlay);
  }

  async function saveEdit(){
    const overlay=$("reviewEdit");
    const trip=state.trips.find(row=>tripKey(row)===state.editing);
    if(!overlay||!trip)return;
    const updates=[...overlay.querySelectorAll("[data-edit-submission]")].map(section=>{
      const formData={};
      section.querySelectorAll("[data-edit-key]").forEach(input=>{
        formData[input.dataset.editKey]=input.value;
      });
      return {submissionId:section.dataset.editSubmission,formData};
    });
    try{
      await api(`/api/smart-forms/workflow/review/edit/${encodeURIComponent(state.editing)}`,{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({updates})
      });
      closeEdit();
      notice("Trip updated. Date and pickup time were not changed.");
      await load();
    }catch(error){
      notice(error.message,true);
    }
  }

  function notice(text,error=false){
    const box=$("notice");
    box.textContent=text;
    box.className=`notice show ${error?"error":"ok"}`;
    setTimeout(()=>box.className="notice",5000);
  }

  async function load(){
    const data=await api("/api/smart-forms/workflow/review");
    state.trips=groupRows(Array.isArray(data.submissions)?data.submissions:[]);
    if(!state.baselineInitialized){
      state.baselineIds=new Set(state.trips.map(tripKey));
      state.baselineInitialized=true;
    }
    const ids=new Set(state.trips.map(tripKey));
    state.selected=new Set([...state.selected].filter(id=>ids.has(id)));
    render();
  }

  async function confirmSubmissionIds(submissionIds,countLabel){
    if(!submissionIds.length)return;
    if(!window.confirm(`Confirm ${countLabel} and send to Dispatch?`))return;
    try{
      const result=await api("/api/smart-forms/workflow/review/confirm",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({submissionIds})
      });
      state.selected.clear();
      notice(`${result.confirmedCount||submissionIds.length} Smart Form submission(s) sent to Dispatch.`);
      await load();
    }catch(error){
      notice(error.message,true);
    }
  }

  async function confirmTrip(id){
    const trip=state.trips.find(row=>tripKey(row)===id);
    if(!trip)return;
    await confirmSubmissionIds(tripSubmissionIds(trip),`trip ${trip.tripNumber||id}`);
  }

  async function deleteSelected(){
    const tripIds=[...state.selected];
    if(!tripIds.length)return;
    if(!window.confirm(`Delete ${tripIds.length} selected Smart Form trip(s)? This cannot be undone.`))return;
    try{
      await api("/api/smart-forms/workflow/review/delete",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({tripIds})
      });
      state.selected.clear();
      notice("Selected Smart Form Review trip(s) deleted.");
      await load();
    }catch(error){
      notice(error.message,true);
    }
  }

  $("reviewRows").addEventListener("change",event=>{
    const box=event.target.closest("[data-select]");
    if(!box)return;
    box.checked?state.selected.add(box.dataset.select):state.selected.delete(box.dataset.select);
    render();
  });

  $("reviewRows").addEventListener("click",event=>{
    const eye=event.target.closest("[data-eye]");
    if(eye)openDetails(eye.dataset.eye);
    const confirm=event.target.closest("[data-confirm]");
    if(confirm)confirmTrip(confirm.dataset.confirm);
    const edit=event.target.closest("[data-edit]");
    if(edit)openEdit(edit.dataset.edit);
  });

  $("selectAllBtn").onclick=()=>{
    state.visible.forEach(trip=>state.selected.add(tripKey(trip)));
    render();
  };
  $("searchInput").addEventListener("input",event=>{
    state.query=clean(event.target.value).toLowerCase();
    render();
  });

  $("confirmSelectedBtn").onclick=()=>confirmSubmissionIds(selectedSubmissionIds(),`${state.selected.size} selected trip(s)`);
  $("deleteSelectedBtn").onclick=deleteSelected;

  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"){closeDetails();closeEdit();}
  });
  load().catch(error=>notice(error.message,true));
})();
