(()=>{
"use strict";

const token =
  sessionStorage.getItem("staffToken") ||
  localStorage.getItem("staffToken") ||
  sessionStorage.getItem("token") ||
  localStorage.getItem("token") ||
  localStorage.getItem("adminToken") || "";

const headers = token ? {Authorization:`Bearer ${token}`} : {};

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

async function json(url,opt={}){
  const r=await fetch(url,{
    credentials:"include",
    ...opt,
    headers:{...headers,...(opt.headers||{})}
  });
  const x=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(x.message||`Request failed (${r.status})`);
  return x;
}

function asStops(s){
  const candidates=[
    s?.stops,
    s?.stopAddresses,
    s?.extraStops,
    s?.trip?.stops,
    s?.tripData?.stops
  ];
  for(const value of candidates){
    if(Array.isArray(value)){
      return value.map(v=>{
        if(typeof v==="string") return v.trim();
        return String(v?.address||v?.name||v?.location||"").trim();
      }).filter(Boolean);
    }
  }
  return [];
}

function stopsHtml(s){
  const list=asStops(s);
  if(!list.length) return `<div class="cell-box"><div class="cell-item">—</div></div>`;
  return `<div class="cell-box">${list.map((v,i)=>
    `<div class="cell-item">${i+1}. ${esc(v)}</div>`
  ).join("")}</div>`;
}

function addressHtml(value){
  return `<div class="cell-box"><div class="cell-item">${esc(value||"—")}</div></div>`;
}

function displayValue(v){
  if(v===null||v===undefined||v==="") return "—";
  if(Array.isArray(v)) return v.length ? v.map((x,i)=>`${i+1}. ${typeof x==="object"?JSON.stringify(x):x}`).join("\n") : "—";
  if(typeof v==="object") return JSON.stringify(v,null,2);
  if(typeof v==="boolean") return v ? "Yes" : "No";
  return String(v);
}

function addDetail(out,label,value,full=false){
  const text=displayValue(value);
  out.push(
    `<div class="detail${full?" full":""}">`+
    `<div class="detail-label">${esc(label)}</div>`+
    `<div class="detail-value">${esc(text)}</div>`+
    `</div>`
  );
}

function openEye(s){
  const out=[];
  addDetail(out,"Trip #",s.tripNumber);
  addDetail(out,"Template",s.templateName);
  addDetail(out,"Client",s.clientName);
  addDetail(out,"Pickup",s.pickupAddress,true);
  addDetail(out,"Stops",asStops(s),true);
  addDetail(out,"Dropoff",s.dropoffAddress,true);
  addDetail(out,"Trip Date",s.tripDate);
  addDetail(out,"Pickup Time",s.pickupTime);
  addDetail(out,"Appointment Time",s.appointmentTime);
  addDetail(out,"Return Time",s.returnTime);
  addDetail(out,"Service",s.serviceName);
  addDetail(out,"Miles",Number(s.distanceMiles||0).toFixed(1));
  addDetail(out,"Price",`$${Number(s.pricing?.amount||0).toFixed(2)}`);
  addDetail(out,"Status",s.status);
  addDetail(out,"Passengers",s.totalPassengers);

  const used=new Set([
    "CLIENT_NAME","PICKUP_ADDRESS","STOPS","DROPOFF_ADDRESS",
    "TRIP_DATE","PICKUP_TIME","APPOINTMENT_TIME","RETURN_TIME","SERVICE"
  ]);

  const snapshot=Array.isArray(s.fieldSnapshot)?s.fieldSnapshot:[];
  const shownKeys=new Set();

  for(const f of snapshot){
    const key=String(f?.key||"");
    const binding=String(f?.tripBinding||"").toUpperCase();
    if(!key || used.has(binding)) continue;
    shownKeys.add(key);
    addDetail(out,f.label||key,s.formData?.[key]);
  }

  const formData=s.formData&&typeof s.formData==="object"?s.formData:{};
  for(const [key,value] of Object.entries(formData)){
    if(shownKeys.has(key)) continue;
    const f=snapshot.find(x=>String(x?.key||"")===key);
    const binding=String(f?.tripBinding||"").toUpperCase();
    if(used.has(binding)) continue;
    addDetail(out,f?.label||key,value);
  }

  if(s.notes) addDetail(out,"Notes",s.notes,true);

  document.getElementById("eyeTitle").textContent=`${s.tripNumber||"Smart Form"} — Details`;
  document.getElementById("eyeDetails").innerHTML=out.join("");
  const modal=document.getElementById("eyeModal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden","false");
}

function closeEye(){
  const modal=document.getElementById("eyeModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden","true");
}

async function openPdf(id){
  await json(`/api/smart-forms/submissions/${encodeURIComponent(id)}/generate-pdf`,{method:"POST"});
  const r=await fetch(`/api/smart-forms/submissions/${encodeURIComponent(id)}/pdf`,{
    credentials:"include",
    headers
  });
  if(!r.ok){
    const x=await r.json().catch(()=>({}));
    throw new Error(x.message||`PDF failed (${r.status})`);
  }
  const blob=await r.blob();
  const url=URL.createObjectURL(blob);
  window.open(url,"_blank","noopener");
  setTimeout(()=>URL.revokeObjectURL(url),120000);
}

function groupByDate(rows){
  const groups={};
  for(const row of rows){
    const key=String(row.tripDate||"Unknown");
    (groups[key]||(groups[key]=[])).push(row);
  }
  return groups;
}

function render(rows){
  const root=document.getElementById("summaryContent");
  if(!rows.length){
    root.innerHTML=`<div class="table-wrap"><div class="empty-state">No Smart Form Summary Trips Found</div></div>`;
    return;
  }

  const groups=groupByDate(rows);
  let counter=1;
  let body="";

  Object.keys(groups)
    .sort((a,b)=>{
      const da=Date.parse(a), db=Date.parse(b);
      if(Number.isNaN(da)&&Number.isNaN(db)) return a.localeCompare(b);
      if(Number.isNaN(da)) return 1;
      if(Number.isNaN(db)) return -1;
      return db-da;
    })
    .forEach(day=>{
      body+=`<tr class="date-row"><td colspan="14">Trip Date: ${esc(day)}</td></tr>`;
      for(const s of groups[day]){
        body+=`<tr class="trip-divider">
          <td class="col-num">${counter++}</td>
          <td class="col-trip">${esc(s.tripNumber||"—")}</td>
          <td class="col-template">${esc(s.templateName||"—")}</td>
          <td class="wide-passenger">${esc(s.clientName||"—")}</td>
          <td class="wide-address">${addressHtml(s.pickupAddress)}</td>
          <td class="wide-stops">${stopsHtml(s)}</td>
          <td class="wide-address">${addressHtml(s.dropoffAddress)}</td>
          <td class="col-date">${esc(s.tripDate||"—")}</td>
          <td class="col-time">${esc(s.pickupTime||"—")}</td>
          <td class="col-service">${esc(s.serviceName||"—")}</td>
          <td class="col-miles">${Number(s.distanceMiles||0).toFixed(1)}</td>
          <td class="col-money">$${Number(s.pricing?.amount||0).toFixed(2)}</td>
          <td class="col-eye"><button class="eye-btn" type="button" data-eye="${esc(s._id)}" title="View all details">👁</button></td>
          <td class="col-review"><button class="review-btn" type="button" data-pdf="${esc(s._id)}">Review</button></td>
        </tr>`;
      }
    });

  root.innerHTML=`
    <div class="table-wrap">
      <table class="summary-table">
        <thead><tr>
          <th class="col-num">#</th>
          <th class="col-trip">Trip #</th>
          <th class="col-template">Template</th>
          <th class="wide-passenger">Client</th>
          <th class="wide-address">Pickup</th>
          <th class="wide-stops">Stops</th>
          <th class="wide-address">Dropoff</th>
          <th class="col-date">Trip Date</th>
          <th class="col-time">Time</th>
          <th class="col-service">Service</th>
          <th class="col-miles">Miles</th>
          <th class="col-money">Price</th>
          <th class="col-eye">👁️</th>
          <th class="col-review">Review</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  const byId=new Map(rows.map(s=>[String(s._id),s]));

  root.querySelectorAll("[data-eye]").forEach(btn=>{
    btn.onclick=()=>{
      const row=byId.get(String(btn.dataset.eye));
      if(row) openEye(row);
    };
  });

  root.querySelectorAll("[data-pdf]").forEach(btn=>{
    btn.onclick=()=>openPdf(btn.dataset.pdf).catch(e=>alert(e.message));
  });
}

async function load(){
  const f=await json("/api/smart-forms/feature");
  if(!f.enabled){
    location.href="summary.html";
    return;
  }
  const x=await json("/api/smart-forms/submissions?status=CONFIRMED");
  render(Array.isArray(x)?x:(x.submissions||[]));
}

document.getElementById("closeEyeBtn")?.addEventListener("click",closeEye);
document.getElementById("eyeModal")?.addEventListener("click",e=>{
  if(e.target.id==="eyeModal") closeEye();
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape") closeEye();
});

load().catch(e=>alert(e.message));
})();