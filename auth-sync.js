/* Login + sincronización localStorage <-> Supabase (tabla app_state). */
(function(){
"use strict";
const CFG=window.CCK_CONFIG, PFX="cck_", SKIP=new Set(["cck_last_raw_paste"]);
const syncable=k=>k&&k.indexOf(PFX)===0&&!SKIP.has(k);
const ls=window.localStorage;
const origSet=ls.setItem.bind(ls), origRemove=ls.removeItem.bind(ls);
let sb=null, uid=null, ready=false;
const timers={};

/* ── Overlay de login ── */
const css=document.createElement("style");
css.textContent=`#authGate{position:fixed;inset:0;z-index:99999;background:#0B1220;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
#authGate form{background:#121C30;border:1px solid #22324f;border-radius:14px;padding:28px;width:340px;max-width:100%;color:#E7ECF5}
#authGate h2{margin:0 0 4px;font-size:18px}#authGate p{margin:0 0 18px;font-size:12.5px;color:#8FA3C8}
#authGate label{display:block;font-size:12px;margin:12px 0 5px;color:#AFC0DE}
#authGate input{width:100%;padding:10px 11px;border-radius:8px;border:1px solid #22324f;background:#0B1220;color:#fff;font-size:14px}
#authGate input:focus-visible{outline:2px solid #00D9C0;outline-offset:1px}
#authGate button{width:100%;margin-top:18px;padding:11px;border:none;border-radius:8px;background:#00D9C0;color:#0B1220;font-weight:700;font-size:14px;cursor:pointer}
#authGate button:disabled{opacity:.5}#authErr{color:#FF8FA3;font-size:12.5px;margin-top:12px;min-height:16px}
#btnLogout{position:fixed;bottom:62px;right:12px;z-index:900;background:#121C30;color:#AFC0DE;border:1px solid #22324f;border-radius:8px;padding:6px 10px;font-size:11.5px;cursor:pointer}
#btnLogout:hover{color:#fff;border-color:#00D9C0}`;
document.head.appendChild(css);

const gate=document.createElement("div");
gate.id="authGate";
gate.innerHTML=`<form id="authForm" autocomplete="on"><h2>Torre de Control</h2><p>Ingresa con tu cuenta autorizada.</p>
<label for="authEmail">Correo</label><input id="authEmail" type="email" required autocomplete="username">
<label for="authPass">Contraseña</label><input id="authPass" type="password" required autocomplete="current-password">
<button id="authBtn" type="submit">Ingresar</button><div id="authErr" role="alert"></div></form>`;
document.documentElement.appendChild(gate);
const errEl=()=>document.getElementById("authErr");

/* ── Carga de supabase-js (versión fija) ── */
const s=document.createElement("script");
s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
s.onload=init;
s.onerror=()=>{errEl().textContent="No se pudo cargar el servicio de acceso. Revisa tu conexión.";};
document.head.appendChild(s);

async function init(){
  sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  window.CCK_SB=sb;
  const {data}=await sb.auth.getSession();
  if(data.session) await onLogin(data.session);
  document.getElementById("authForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const btn=document.getElementById("authBtn");btn.disabled=true;errEl().textContent="";
    const {data,error}=await sb.auth.signInWithPassword({
      email:document.getElementById("authEmail").value.trim(),
      password:document.getElementById("authPass").value});
    btn.disabled=false;
    if(error){errEl().textContent="Correo o contraseña incorrectos.";return;}
    await onLogin(data.session);
  });
}

async function onLogin(session){
  uid=session.user.id;
  const {data:prof}=await sb.from("profiles").select("active,role").eq("id",uid).maybeSingle();
  if(!prof||!prof.active){await sb.auth.signOut();errEl().textContent="Cuenta desactivada o sin perfil.";return;}
  window.CCK_ROLE=prof.role;
  /* Descarga estado remoto; sube lo local que aún no exista (migración inicial) */
  const {data:rows,error}=await sb.from("app_state").select("key,value");
  if(error){errEl().textContent="No se pudo leer tus datos: "+error.message;return;}
  const remote=new Map((rows||[]).map(r=>[r.key,r.value]));
  let changed=false;
  remote.forEach((v,k)=>{ if(syncable(k)){ const str=typeof v==="string"?v:JSON.stringify(v); if(ls.getItem(k)!==str){origSet(k,str);changed=true;} }});
  const up=[];
  for(let i=0;i<ls.length;i++){const k=ls.key(i);if(syncable(k)&&!remote.has(k))up.push({user_id:uid,key:k,value:ls.getItem(k)});}
  if(up.length) await sb.from("app_state").upsert(up);
  ready=true;
  if(changed&&!sessionStorage.getItem("cck_reloaded")){sessionStorage.setItem("cck_reloaded","1");location.reload();return;}
  sessionStorage.removeItem("cck_reloaded");
  gate.remove();
  addLogout();
}

/* ── Sincronización de escritura (con debounce) ── */
function push(k){
  if(!ready||!uid||!syncable(k))return;
  clearTimeout(timers[k]);
  timers[k]=setTimeout(async()=>{
    const v=ls.getItem(k);
    const {error}=v===null? await sb.from("app_state").delete().eq("key",k)
      : await sb.from("app_state").upsert({user_id:uid,key:k,value:v,updated_at:new Date().toISOString()});
    if(error&&window.showToast)window.showToast("info","⚠️","Sin sincronizar","No se pudo guardar en la nube: "+String(error.message).replace(/[<>&]/g,""));
  },1500);
}
ls.setItem=function(k,v){origSet(k,v);push(k);};
ls.removeItem=function(k){origRemove(k);push(k);};

/* ── Cerrar sesión: limpia datos locales (equipos compartidos) ── */
function addLogout(){
  const b=document.createElement("button");b.id="btnLogout";b.textContent="Cerrar sesión";
  b.onclick=async()=>{
    Object.keys(timers).forEach(k=>clearTimeout(timers[k]));
    ready=false;
    await sb.auth.signOut();
    const del=[];for(let i=0;i<ls.length;i++){const k=ls.key(i);if(k&&k.indexOf(PFX)===0)del.push(k);}
    del.forEach(origRemove);
    location.reload();
  };
  document.body.appendChild(b);
}
})();
