const token=localStorage.getItem("token")||"";
const role=String(localStorage.getItem("role")||"").toUpperCase();
if(!token||role!=="PLATFORM_ADMIN")location.replace("/login.html");
const TENANT_API="/api/platform-admin/tenants", ORG_API="/api/smart-form-organizations";
let organizations=[],templates=[];
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
function msg(t,type="ok"){const b=document.getElementById("message");b.textContent=t;b.className=`message show ${type}`;clearTimeout(msg.t);msg.t=setTimeout(()=>b.className="message",3000);}
async function api(url,opt={}){const h={...(opt.headers||{}),Authorization:`Bearer ${token}`};if(opt.body)h["Content-Type"]="application/json";const r=await fetch(url,{...opt,headers:h}),tx=await r.text();let d={};try{d=tx?JSON.parse(tx):{}}catch{}if(!r.ok)throw new Error(d.message||`Request failed (${r.status})`);return d;}
async function loadTenants(){const tenants=await api(TENANT_API),s=document.getElementById("tenantSelect");s.innerHTML=(Array.isArray(tenants)?tenants:tenants.tenants||[]).map(t=>`<option value="${esc(t._id)}">${esc(t.name)}</option>`).join("");await loadOrganizations();}
async function loadOrganizations(){
  const id=document.getElementById("tenantSelect").value;if(!id)return;
  organizations=(await api(`${ORG_API}?tenantId=${encodeURIComponent(id)}`)).organizations||[];
  document.getElementById("organizationBody").innerHTML=organizations.length?organizations.map(o=>`<tr><td>${esc(o.name)}</td><td>${esc(o.type)}</td><td>${esc(o.code||"")}</td><td>${o.active?"ACTIVE":"DISABLED"}</td><td><button class="${o.active?"danger":"primary"}" data-id="${o._id}" data-active="${o.active?"1":"0"}">${o.active?"Disable":"Enable"}</button></td></tr>`).join(""):`<tr><td colspan="5">No organizations.</td></tr>`;
  const sel=document.getElementById("templateOrganization"),active=organizations.filter(o=>o.active!==false);
  sel.innerHTML=active.map(o=>`<option value="${esc(o._id)}">${esc(o.name)}</option>`).join("");
  await loadTemplates();
}
async function loadTemplates(){
  templates=[];
  for(const org of organizations.filter(o=>o.active!==false)){
    const d=await api(`${ORG_API}/${encodeURIComponent(org._id)}/templates`);
    for(const t of (d.templates||[]))templates.push({...t,organizationName:org.name});
  }
  document.getElementById("templateBody").innerHTML=templates.length?templates.map(t=>`<tr><td>${esc(t.name)}</td><td>${esc(t.organizationName)}</td><td>${t.active!==false?"ACTIVE":"DISABLED"}</td><td><button class="${t.active!==false?"danger":"primary"}" data-template-toggle-id="${esc(t._id)}" data-org-id="${esc(t.organizationId)}" data-template-active="${t.active!==false?"1":"0"}">${t.active!==false?"Disable":"Enable"}</button> <button class="danger" data-template-delete-id="${esc(t._id)}" data-org-id="${esc(t.organizationId)}">Delete</button></td></tr>`).join(""):`<tr><td colspan="4">No paid templates.</td></tr>`;
}
document.getElementById("tenantSelect").onchange=loadOrganizations;
document.getElementById("addBtn").onclick=async()=>{const tenantId=document.getElementById("tenantSelect").value,name=document.getElementById("organizationName").value.trim(),type=document.getElementById("organizationType").value,code=document.getElementById("organizationCode").value.trim();if(!tenantId||!name)return msg("Company and name are required.","err");try{await api(ORG_API,{method:"POST",body:JSON.stringify({tenantId,name,type,code})});document.getElementById("organizationName").value="";document.getElementById("organizationCode").value="";await loadOrganizations();msg("Organization created.");}catch(e){msg(e.message,"err");}};
document.getElementById("organizationBody").onclick=async e=>{const id=e.target.dataset.id;if(!id)return;try{await api(`${ORG_API}/${id}`,{method:"PUT",body:JSON.stringify({active:e.target.dataset.active!=="1"})});await loadOrganizations();}catch(err){msg(err.message,"err");}};
loadTenants().catch(e=>msg(e.message,"err"));

document.getElementById("addTemplateBtn").onclick=async()=>{
  const organizationId=document.getElementById("templateOrganization").value,name=document.getElementById("templateName").value.trim();
  if(!organizationId||!name)return msg("Organization and template name are required.","err");
  try{await api(`${ORG_API}/${encodeURIComponent(organizationId)}/templates`,{method:"POST",body:JSON.stringify({name})});document.getElementById("templateName").value="";await loadTemplates();msg("Paid Smart Form template created.");}catch(e){msg(e.message,"err");}
};
document.getElementById("templateBody").onclick=async e=>{
  const orgId=e.target.dataset.orgId;
  const deleteId=e.target.dataset.templateDeleteId;
  if(deleteId&&orgId){
    if(!confirm("Delete this template?"))return;
    try{await api(`${ORG_API}/${encodeURIComponent(orgId)}/templates/${encodeURIComponent(deleteId)}`,{method:"DELETE"});await loadTemplates();msg("Template deleted.");}catch(err){msg(err.message,"err");}
    return;
  }
  const templateId=e.target.dataset.templateToggleId;
  if(!templateId||!orgId)return;
  try{await api(`${ORG_API}/${encodeURIComponent(orgId)}/templates/${encodeURIComponent(templateId)}`,{method:"PUT",body:JSON.stringify({active:e.target.dataset.templateActive!=="1"})});await loadTemplates();}catch(err){msg(err.message,"err");}
};
