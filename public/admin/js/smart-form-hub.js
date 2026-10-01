/* DESTINATION: server/public/admin/js/smart-form-hub.js */
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const token=localStorage.getItem("token")||sessionStorage.getItem("token")||localStorage.getItem("staffToken")||sessionStorage.getItem("staffToken")||"";
  const headers=token?{Authorization:`Bearer ${token}`} : {};
  const state={rows:[],visible:[],selected:new Set()};
  const clean=v=>String(v??"").trim();
  const escape=v=>clean(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const money=v=>{const n=Number(v);return Number.isFinite(n)?`$${n.toFixed(2)}`:"—";};
  async function request(url,options={}){
    const response=await fetch(url,{credentials:"include",cache:"no-store",...options,headers:{...headers,...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||`Request failed (${response.status})`);
    return data;
  }
  function stops(row){return (Array.isArray(row.stops)?row.stops:[]).map(x=>typeof x==="string"?x:x?.address||x?.label||"").map(clean).filter(Boolean);}
  function cell(value){const values=Array.isArray(value)?value:[value];return `<div class="cell-box">${values.length?values.map(x=>`<div class="cell-item">${escape(x||"—")}</div>`).join(""):`<div class="cell-item">—</div>`}</div>`;}
  function priceValue(row){return row.pricing?.calculated===true&&row.pricing.amount!==null&&row.pricing.amount!==undefined?row.pricing.amount:null;}
  function fillTemplateFilter(){const select=$("templateFilter"),old=select.value;const names=[...new Set(state.rows.map(r=>clean(r.templateName)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));select.innerHTML='<option value="">All Templates</option>'+names.map(n=>`<option value="${escape(n)}">${escape(n)}</option>`).join("");if(names.includes(old))select.value=old;}
  function renderStats(){const rows=state.visible;$("statTrips").textContent=rows.length;$("statTemplates").textContent=new Set(rows.map(r=>r.templateId).filter(Boolean).map(String)).size;$("statSelected").textContent=state.selected.size;$("statShared").textContent=rows.filter(r=>r.pickupAddress&&r.dropoffAddress&&r.tripDate&&r.pickupTime&&r.serviceName).length;$("statPriced").textContent=rows.filter(r=>priceValue(r)!==null&&priceValue(r)!=="").length;$("statStops").textContent=rows.filter(r=>stops(r).length>0).length;$("selectedCount").textContent=`${state.selected.size} selected`;$("openSplitBtn").disabled=!state.selected.size;}
  function render(){
    const search=clean($("searchInput").value).toLowerCase(),template=clean($("templateFilter").value),from=$("fromDate").value,to=$("toDate").value;
    state.visible=state.rows.filter(row=>{
      const date=clean(row.tripDate).slice(0,10);
      const text=[row.tripNumber,row.templateName,row.serviceName,row.clientName,row.pickupAddress,row.dropoffAddress,...stops(row)].join(" ").toLowerCase();
      return(!search||text.includes(search))&&(!template||clean(row.templateName)===template)&&(!from||date>=from)&&(!to||date<=to);
    });
    const tbody=$("hubRows");
    if(!state.visible.length){tbody.innerHTML="";$("emptyState").hidden=false;}else{
      $("emptyState").hidden=true;
      tbody.innerHTML=state.visible.map(row=>{
        const id=String(row._id),selected=state.selected.has(id),price=priceValue(row);
        return `<tr><td><input type="checkbox" data-select="${escape(id)}" ${selected?"checked":""} aria-label="Select ${escape(row.tripNumber)}"></td><td><span class="trip-number">${escape(row.tripNumber||"—")}</span></td><td>${cell(row.templateName||"—")}</td><td>${cell(row.serviceName||"—")}</td><td>${cell(row.clientName||"—")}</td><td>${escape(row.tripDate||"—")}</td><td>${escape(row.pickupTime||"—")}</td><td>${cell(row.pickupAddress||"—")}</td><td>${cell(stops(row))}</td><td>${cell(row.dropoffAddress||"—")}</td><td>${price===null||price===""?"—":money(price)}</td><td><span class="status-pill review">Ready for Split</span></td><td><button type="button" class="eye-btn" data-eye="${escape(id)}" aria-label="View details">◉</button></td></tr>`;
      }).join("");
    }
    renderStats();
  }
  function showNotice(message,isError=false){const n=$("notice");n.textContent=message;n.className=`notice show ${isError?"error":"ok"}`;setTimeout(()=>{n.className="notice";},4500);}
  function openEye(id){const row=state.rows.find(r=>String(r._id)===id);if(!row)return;closeEye();const fields=Array.isArray(row.fieldSnapshot)?row.fieldSnapshot:[],formData=row.formData&&typeof row.formData==="object"?row.formData:{};const lines=fields.map(f=>[f.label||f.key,formData[f.key]]).filter(([,v])=>v!==undefined).map(([label,value])=>line(label,value));const known=new Set(fields.map(f=>String(f.key)));const extra=Object.entries(formData).filter(([key])=>!known.has(key)).map(([key,value])=>line(key,value));const overlay=document.createElement("div");overlay.id="smartFormHubDetails";overlay.className="view-overlay";overlay.innerHTML=`<section class="view-box"><header class="view-head"><span>${escape(row.tripNumber||"Smart Form Trip")} · ${escape(row.templateName||"")}</span><button class="view-close" type="button" data-close>×</button></header><div class="view-body">${line("Service",row.serviceName)}${line("Client",row.clientName)}${line("Pickup",row.pickupAddress)}${line("Stops",stops(row).join("\n"))}${line("Drop-off",row.dropoffAddress)}${line("Trip Date",row.tripDate)}${line("Pickup Time",row.pickupTime)}${line("Price",priceValue(row)===null?"":money(priceValue(row)))}${lines.join("")}${extra.join("")}${line("Notes",row.notes)}</div></section>`;overlay.onclick=e=>{if(e.target===overlay||e.target.closest("[data-close]"))closeEye();};document.body.appendChild(overlay);}
  function line(label,value){return `<div class="view-line"><div class="view-label">${escape(label)}</div><div class="view-value">${escape(value===undefined||value===null||value===""?"—":typeof value==="object"?JSON.stringify(value,null,2):value)}</div></div>`;}
  function closeEye(){document.getElementById("smartFormHubDetails")?.remove();}
  async function load(){const data=await request("/api/smart-forms/workflow/hub");state.rows=Array.isArray(data.submissions)?data.submissions:[];const ids=new Set(state.rows.map(x=>String(x._id)));state.selected=new Set([...state.selected].filter(id=>ids.has(id)));fillTemplateFilter();render();}
  $("hubRows").addEventListener("change",e=>{const box=e.target.closest("[data-select]");if(!box)return;box.checked?state.selected.add(box.dataset.select):state.selected.delete(box.dataset.select);render();});
  $("hubRows").addEventListener("click",e=>{const button=e.target.closest("[data-eye]");if(button)openEye(button.dataset.eye);});
  $("selectAllBtn").onclick=()=>{state.visible.forEach(row=>state.selected.add(String(row._id)));render();};
  $("selectNoneBtn").onclick=()=>{state.selected.clear();render();};
  $("openSplitBtn").onclick=async()=>{try{const ids=[...state.selected];if(!ids.length)return;const result=await request("/api/smart-forms/workflow/split/enter",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({submissionIds:ids})});if(!result.movedCount)throw new Error("No selected trips moved to Split");location.href="/admin/smart-form-split.html";}catch(err){showNotice(err.message,true);}};
  $("refreshBtn").onclick=()=>load().catch(e=>showNotice(e.message,true));
  ["searchInput","templateFilter","fromDate","toDate"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",render));
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeEye();});
  load().catch(e=>showNotice(e.message,true));
})();
