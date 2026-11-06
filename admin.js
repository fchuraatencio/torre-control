/* Fase 4 — Panel de usuarios (solo admin). */
(function(){"use strict";
const $=id=>document.getElementById(id);
const esc=s=>(s==null?"":String(s)).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const t=setInterval(()=>{ if(window.CCK_ROLE==="admin"&&window.CCK_SB&&!$("btnStripUsers")){clearInterval(t);mount();} },500);
function toast(m,ok){window.showToast&&window.showToast(ok?"success":"info",ok?"✔":"⚠️","Usuarios",esc(m));}
function mount(){
  const b=document.createElement("button");b.className="strip-btn";b.id="btnStripUsers";b.title="Usuarios";
  b.innerHTML='<span class="sico">👥</span><span class="slbl">Usuarios</span>';
  $("sideStrip").appendChild(b);b.onclick=open;
}
async function open(){
  let ov=$("usersOv");if(ov)ov.remove();
  ov=document.createElement("div");ov.id="usersOv";
  ov.style.cssText="position:fixed;inset:0;background:rgba(11,18,32,.55);z-index:330;display:flex;align-items:center;justify-content:center;padding:16px";
  ov.innerHTML=`<div class="sccard" style="width:640px"><div class="schead"><h3>👥 Usuarios</h3><button class="scclose" id="uClose">✕</button></div>
  <div class="scbody"><div id="uList"></div>
  <div class="sc-section-title">Crear usuario</div>
  <input class="scnew-input" id="uEmail" type="email" placeholder="correo@empresa.com" autocomplete="off">
  <input class="scnew-input" id="uPass" type="text" placeholder="Contraseña temporal (mín. 10 caracteres)" style="margin-top:8px" autocomplete="off">
  <select class="scnew-select" id="uRole" style="margin-top:8px"><option value="user">Usuario</option><option value="admin">Administrador</option></select>
  <div class="scnew-err" id="uErr" style="display:none"></div></div>
  <div class="scfoot"><button class="scok" id="uCreate">Crear usuario</button></div></div>`;
  document.body.appendChild(ov);
  $("uClose").onclick=()=>ov.remove();
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  $("uCreate").onclick=create;
  load();
}
async function load(){
  const sb=window.CCK_SB;
  const {data,error}=await sb.from("profiles").select("id,email,role,active").order("created_at");
  if(error){$("uList").textContent="Error: "+error.message;return;}
  const me=(await sb.auth.getUser()).data.user.id;
  $("uList").innerHTML=`<table class="reg-tbl"><thead><tr><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>`+
   data.map(u=>`<tr><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${u.active?"Activo":"Desactivado"}</td><td>${u.id===me?"(tú)":
   `<button class="reg-copy-btn" data-act="tog" data-id="${esc(u.id)}" data-v="${u.active}">${u.active?"Desactivar":"Activar"}</button>
    <button class="reg-copy-btn" data-act="rol" data-id="${esc(u.id)}" data-v="${esc(u.role)}">${u.role==="admin"?"Quitar admin":"Hacer admin"}</button>
    <button class="reg-copy-btn" data-act="pw" data-id="${esc(u.id)}">Clave</button>`}</td></tr>`).join("")+"</tbody></table>";
  $("uList").querySelectorAll("[data-act]").forEach(btn=>btn.onclick=()=>act(btn.dataset));
}
async function act(d){
  const sb=window.CCK_SB;let r;
  if(d.act==="tog")r=await sb.from("profiles").update({active:d.v!=="true"}).eq("id",d.id);
  else if(d.act==="rol")r=await sb.from("profiles").update({role:d.v==="admin"?"user":"admin"}).eq("id",d.id);
  else{const pw=prompt("Nueva contraseña (mín. 10 caracteres):");if(!pw)return;
    r=await sb.functions.invoke("admin-users",{body:{action:"reset",id:d.id,password:pw}});
    if(r.error||r.data?.error){toast(r.data?.error||r.error.message);return;} toast("Contraseña actualizada",true);return;}
  if(r.error)toast(r.error.message);else load();
}
async function create(){
  const err=$("uErr");err.style.display="none";
  const r=await window.CCK_SB.functions.invoke("admin-users",{body:{action:"create",email:$("uEmail").value,password:$("uPass").value,role:$("uRole").value}});
  const msg=r.data?.error||(r.error&&r.error.message);
  if(msg){err.textContent=msg;err.style.display="block";return;}
  $("uEmail").value="";$("uPass").value="";toast("Usuario creado",true);load();
}
})();
