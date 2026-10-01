/* DESTINATION PATH: server/public/admin/js/smart-form-review.js */
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
  const state={trips:[],visible:[],selected:new Set(),query:""};

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
      templateName:clean(member.templateName)||"—",
      serviceName:clean(member.serviceName||trip.serviceName||trip.serviceKey)||"—",
      clientName:clean(member.clientName||member.name)||"—",
      tripDate:clean(member.tripDate||trip.tripDate)||"—",
      pickupTime:clean(member.pickupTime||member.tripTime||trip.tripTime)||"—",
      pickup:clean(member.pickupAddress||member.pickup)||"—",
      stops:stops(member),
      dropoff:clean(member.dropoffAddress||member.dropoff)||"—"
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
        <td>${cell(rows.map(member=>member.serviceName))}</td>
        <td>${cell(rows.map(member=>member.clientName))}</td>
        <td>${cell(rows.map(member=>member.tripDate))}</td>
        <td>${cell(rows.map(member=>member.pickupTime))}</td>
        <td>${cell(rows.map(member=>member.pickup))}</td>
        <td>${memberStopsCell(rows)}</td>
        <td>${cell(rows.map(member=>member.dropoff))}</td>
        <td>${money(recordPrice(trip))}</td>
        <td><span class="mode-pill ${shared?"shared":"individual"}">${shared?"Shared":"Individual"}</span></td>
        <td><span class="status-pill review">Final Review</span></td>
        <td><button class="eye-btn" type="button" data-eye="${esc(id)}" aria-label="View original template data">◉</button></td>
      </tr>`;
    }).join("");

    $("emptyState").hidden=state.visible.length>0;
    $("statTrips").textContent=state.trips.length;
    $("statShared").textContent=state.trips.filter(trip=>trip.isShared||trip.submissions.length>1).length;
    $("statIndividuals").textContent=state.trips.length-Number($("statShared").textContent);
    $("statTemplates").textContent=new Set(
      state.trips.flatMap(trip=>trip.submissions.map(member=>String(member.templateId||""))).filter(Boolean)
    ).size;
    $("statSelected").textContent=state.selected.size;
    $("statReady").textContent=state.trips.length;
    $("selectedCount").textContent=`${state.selected.size} selected`;
    $("sendDispatchBtn").disabled=!state.selected.size;
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

  function notice(text,error=false){
    const box=$("notice");
    box.textContent=text;
    box.className=`notice show ${error?"error":"ok"}`;
    setTimeout(()=>box.className="notice",5000);
  }

  async function load(){
    const data=await api("/api/smart-forms/workflow/review");
    state.trips=groupRows(Array.isArray(data.submissions)?data.submissions:[]);
    const ids=new Set(state.trips.map(tripKey));
    state.selected=new Set([...state.selected].filter(id=>ids.has(id)));
    render();
  }

  $("reviewRows").addEventListener("change",event=>{
    const box=event.target.closest("[data-select]");
    if(!box)return;
    box.checked?state.selected.add(box.dataset.select):state.selected.delete(box.dataset.select);
    render();
  });

  $("reviewRows").addEventListener("click",event=>{
    const button=event.target.closest("[data-eye]");
    if(button)openDetails(button.dataset.eye);
  });

  $("selectAllBtn").onclick=()=>{
    state.visible.forEach(trip=>state.selected.add(tripKey(trip)));
    render();
  };
  $("selectNoneBtn").onclick=()=>{
    state.selected.clear();
    render();
  };
  $("searchInput").addEventListener("input",event=>{
    state.query=clean(event.target.value).toLowerCase();
    render();
  });

  const refresh=()=>load().catch(error=>notice(error.message,true));
  $("refreshBtn").onclick=refresh;
  $("refreshTopBtn").onclick=refresh;

  $("sendDispatchBtn").onclick=async()=>{
    const submissionIds=[...new Set(
      state.trips
        .filter(trip=>state.selected.has(tripKey(trip)))
        .flatMap(trip=>trip.submissions.map(submission=>String(submission._id)))
    )];
    if(!submissionIds.length)return;
    if(!window.confirm(`Send ${state.selected.size} selected trip(s) to Dispatch?`))return;
    try{
      const count=state.selected.size;
      const result=await api("/api/smart-forms/workflow/review/confirm",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({submissionIds})
      });
      state.selected.clear();
      notice(`${result.confirmedCount||count} Smart Form submission(s) sent to Dispatch.`);
      await load();
    }catch(error){
      notice(error.message,true);
    }
  };

  document.addEventListener("keydown",event=>{
    if(event.key==="Escape")closeDetails();
  });
  load().catch(error=>notice(error.message,true));
})();
