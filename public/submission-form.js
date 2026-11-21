(() => {
/* ---------- Submission form ---------- */
let CATS=[], S=[];
let kind=document.body.dataset.submissionKind || "recommend";
const $=s=>document.querySelector(s);
const {esc}=SGSSRender;
const dlg=$("#dlg");
function fillFormLists(data){
  CATS=data.categories; S=data.services;
  $("#fCat").innerHTML=CATS.map(c=>`<option value="${c.id}">${esc(c.label)}</option>`).join("");
  $("#fWhich").innerHTML=S.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");
}
function setKind(k){
  kind=k;$("#fKind").value=k;document.querySelectorAll(".seg button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.kind===k));
  $("#fRecommend").hidden=k!=="recommend";$("#fUpdate").hidden=k!=="update";
  $("#fDetailsLabel").textContent=k==="recommend"?"Why is it helpful? Who is it for?":"What's changed? (new number, hours, closed, moved)";
}
function openForm(k="recommend",which){
  setKind(k);if(which)$("#fWhich").value=which;$("#fMsg").hidden=true;
  if(dlg){try{dlg.showModal()}catch{dlg.setAttribute("open","")}}
}
$("#openForm")?.addEventListener("click",()=>openForm());
document.addEventListener("click",e=>{const r=e.target.closest("[data-report]");if(r)openForm("update",r.dataset.report);if(e.target.closest("[data-open]"))openForm();});
document.querySelectorAll(".seg button").forEach(b=>b.addEventListener("click",()=>setKind(b.dataset.kind)));
$("#cancelForm")?.addEventListener("click",()=>dlg.close());
function showMsg(html,cls){const m=$("#fMsg");m.className=cls||"";m.innerHTML=html;m.hidden=false;}

$("#subForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const details=$("#fDetails").value.trim();
  if(kind==="recommend"&&!$("#fName").value.trim()){showMsg("Add the service or programme name.","note");$("#fName").focus();return;}
  if(kind==="update"&&!$("#fWhich").value){showMsg("Choose the listing to update.","note");$("#fWhich").focus();return;}
  if(!details){showMsg("Add a short description so we know what to change or add.","note");$("#fDetails").focus();return;}
  const userEmail=$("#fUserEmail").value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)){showMsg("Add your email address.","note");$("#fUserEmail").focus();return;}
  if(!$("#fRole").value.trim()){showMsg("Add your occupation.","note");$("#fRole").focus();return;}
  if(!$("#fOrgType").value){showMsg("Choose your organisation type.","note");$("#fOrgType").focus();return;}
  const rec={kind,details,role:$("#fRole").value.trim(),submitter_email:$("#fUserEmail").value.trim(),submitter_org_type:$("#fOrgType").value,website:$("#fHp").value,
    ...(kind==="recommend"?{name:$("#fName").value.trim(),org:$("#fOrg").value.trim(),category:$("#fCat").value,phone:$("#fPhone").value.trim(),sms_whatsapp:$("#fSmsWhatsapp").value.trim(),email:$("#fEmail").value.trim(),web:$("#fWeb").value.trim()}:{serviceId:$("#fWhich").value,name:S.find(s=>s.id===$("#fWhich").value)?.name||""})};
  const btn=$("#sendForm");btn.disabled=true;
  try{
    const r=await fetch("/api/submissions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(rec)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){showMsg(esc(d.error||"That didn't go through. Try again in a moment."),"note");return;}
    showMsg("Thanks. Your submission is in and will be reviewed before the directory is updated.","ok");
    ["fName","fOrg","fPhone","fSmsWhatsapp","fEmail","fWeb","fDetails","fUserEmail","fRole","fOrgType"].forEach(i=>$("#"+i).value="");
  }catch{showMsg("That didn't go through. Check your connection and try again.","note");}
  finally{btn.disabled=false;}
});

setKind(kind);
window.SGSSForm={init(data){
  fillFormLists(data);
  const id=new URLSearchParams(location.search).get("report");
  if(id&&S.some(s=>s.id===id))openForm("update",id);
}};
if(!dlg){
  fetch("/api/services").then(r=>{if(!r.ok)throw new Error();return r.json();})
    .then(data=>SGSSForm.init(data))
    .catch(()=>showMsg('The service list could not be refreshed. You can still use the lists on this page.',"note"));
}
})();
