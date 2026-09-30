(()=>{
"use strict";
const token=sessionStorage.getItem("staffToken")||localStorage.getItem("staffToken")||sessionStorage.getItem("token")||localStorage.getItem("token")||localStorage.getItem("adminToken")||"";
const headers={Authorization:`Bearer ${token}`};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function json(url,opt={}){
  const r=await fetch(url,{...opt,headers:{...headers,...(opt.headers||{})}});
  const x=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(x.message||`Request failed (${r.status})`);
  return x;
}
function stopsHtml(stops){
  const list=Array.isArray(stops)?stops.filter(Boolean):[];
  return list.length?list.map((s,i)=>`<span class="stop">${i+1}. ${esc(s)}</span>`).join(""):"—";
}
async function openPdf(id){
  await json(`/api/smart-forms/submissions/${encodeURIComponent(id)}/generate-pdf`,{method:"POST"});
  const r=await fetch(`/api/smart-forms/submissions/${encodeURIComponent(id)}/pdf`,{headers});
  if(!r.ok){
    const x=await r.json().catch(()=>({}));
    throw new Error(x.message||`PDF failed (${r.status})`);
  }
  const blob=await r.blob();
  const url=URL.createObjectURL(blob);
  window.open(url,"_blank","noopener");
  setTimeout(()=>URL.revokeObjectURL(url),120000);
}
async function load(){
  const f=await json("/api/smart-forms/feature");
  if(!f.enabled){location.href="summary.html";return;}
  const x=await json("/api/smart-forms/submissions?status=CONFIRMED");
  const rows=x.submissions||[];
  document.querySelector("#body").innerHTML=rows.map(s=>`<tr>
    <td>${esc(s.tripNumber)}</td>
    <td>${esc(s.templateName)}</td>
    <td>${esc(s.clientName)}</td>
    <td>${esc(s.pickupAddress)}</td>
    <td class="stops">${stopsHtml(s.stops)}</td>
    <td>${esc(s.dropoffAddress)}</td>
    <td>${esc(s.tripDate)}</td>
    <td>${esc(s.pickupTime)}</td>
    <td>${esc(s.serviceName)}</td>
    <td>${Number(s.distanceMiles||0).toFixed(1)}</td>
    <td>$${Number(s.pricing?.amount||0).toFixed(2)}</td>
    <td><button class="btn eye" data-eye="${encodeURIComponent(JSON.stringify(s.formData||{}))}" title="View details" aria-label="View details">👁</button></td>
    <td><button class="btn review" data-id="${esc(s._id)}">Review</button></td>
  </tr>`).join("");
  document.querySelectorAll("[data-eye]").forEach(b=>b.onclick=()=>alert(JSON.stringify(JSON.parse(decodeURIComponent(b.dataset.eye)),null,2)));
  document.querySelectorAll(".review").forEach(b=>b.onclick=()=>openPdf(b.dataset.id).catch(e=>alert(e.message)));
}
load().catch(e=>alert(e.message));
})();