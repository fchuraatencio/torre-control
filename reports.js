/* Fase 5 — Plantillas de reporte con fórmulas (parser seguro, sin eval). */
(function(){"use strict";
const $=id=>document.getElementById(id);
const esc=s=>(s==null?"":String(s)).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const KEY="cck_report_templates_v1", HEAD=()=>window.EXPECTED_HEADERS||[];
const num=v=>{const n=parseFloat(String(v==null?"":v).replace(",","."));return isNaN(n)?null:n;};
const eq=(a,b)=>String(a||"").trim().toLowerCase()===String(b).trim().toLowerCase();

/* ── Parser: expr → función(rows) ── */
function compile(src){
  const tk=[];const re=/\s*(?:(\d+(?:\.\d+)?)|"([^"]*)"|([a-zA-Z_]\w*)|([-+*\/(),]))/y;let m,pos=0;
  src=String(src||"");
  while(pos<src.length){re.lastIndex=pos;m=re.exec(src);if(!m){if(!src.slice(pos).trim())break;throw new Error("Carácter no válido cerca de «"+src.slice(pos,pos+8)+"»");}
    pos=re.lastIndex;if(m[1]!==undefined)tk.push({t:"n",v:+m[1]});else if(m[2]!==undefined)tk.push({t:"s",v:m[2]});else if(m[3])tk.push({t:"i",v:m[3]});else tk.push({t:"o",v:m[4]});}
  let i=0;const peek=()=>tk[i],eat=v=>{if(peek()&&peek().v===v&&peek().t==="o"){i++;return true;}return false;};
  const need=v=>{if(!eat(v))throw new Error("Falta «"+v+"»");};
  const field=n=>{if(HEAD().indexOf(n)<0)throw new Error("Campo desconocido: "+n);return n;};
  const F={
    count:()=>rs=>rs.length,
    sum:a=>{const f=field(a[0]);return rs=>rs.reduce((s,r)=>s+(num(r[f])||0),0);},
    avg:a=>{const f=field(a[0]);return rs=>{const v=rs.map(r=>num(r[f])).filter(x=>x!==null);return v.length?v.reduce((s,x)=>s+x,0)/v.length:0;};},
    min:a=>{const f=field(a[0]);return rs=>{const v=rs.map(r=>num(r[f])).filter(x=>x!==null);return v.length?Math.min(...v):0;};},
    max:a=>{const f=field(a[0]);return rs=>{const v=rs.map(r=>num(r[f])).filter(x=>x!==null);return v.length?Math.max(...v):0;};},
    distinct:a=>{const f=field(a[0]);return rs=>new Set(rs.map(r=>String(r[f]||"").trim()).filter(Boolean)).size;},
    countif:a=>{const f=field(a[0]),v=a[1];return rs=>rs.filter(r=>eq(r[f],v)).length;},
    countlike:a=>{const f=field(a[0]),v=String(a[1]).toLowerCase();return rs=>rs.filter(r=>String(r[f]||"").toLowerCase().includes(v)).length;},
    sumif:a=>{const f=field(a[0]),g=field(a[1]),v=a[2];return rs=>rs.filter(r=>eq(r[g],v)).reduce((s,r)=>s+(num(r[f])||0),0);},
  };
  function expr(){let l=term();for(;;){if(eat("+")){const a=l,b=term();l=rs=>a(rs)+b(rs);}else if(eat("-")){const a=l,b=term();l=rs=>a(rs)-b(rs);}else return l;}}
  function term(){let l=fac();for(;;){if(eat("*")){const a=l,b=fac();l=rs=>a(rs)*b(rs);}else if(eat("/")){const a=l,b=fac();l=rs=>{const d=b(rs);return d?a(rs)/d:0;};}else return l;}}
  function fac(){
    if(eat("-")){const a=fac();return rs=>-a(rs);}
    const k=tk[i++];if(!k)throw new Error("Fórmula incompleta");
    if(k.t==="n")return()=>k.v;
    if(k.t==="o"&&k.v==="("){const e=expr();need(")");return e;}
    if(k.t==="i"){need("(");
      if(k.v==="pct"||k.v==="round"){const a=expr();let b=null;if(eat(","))b=expr();need(")");
        if(k.v==="pct"){if(!b)throw new Error("pct necesita 2 valores");return rs=>{const d=b(rs);return d?a(rs)/d*100:0;};}
        return rs=>{const n=b?Math.round(b(rs)):0,p=Math.pow(10,n);return Math.round(a(rs)*p)/p;};}
      const args=[];if(!eat(")")){do{const x=tk[i++];if(!x||(x.t!=="i"&&x.t!=="s"))throw new Error("Argumento no válido en "+k.v);args.push(x.v);}while(eat(","));need(")");}
      if(!F[k.v])throw new Error("Función desconocida: "+k.v);return F[k.v](args);}
    throw new Error("Fórmula no válida");
  }
  const f=expr();if(i<tk.length)throw new Error("Sobra texto al final");return f;
}

/* ── Datos y plantillas ── */
function getRows(){try{const s=JSON.parse(localStorage.getItem("cck_master_data_v1")||"null");const c=new Set(JSON.parse(localStorage.getItem("cck_closed_sot_v1")||"[]"));return((s&&s.rows)||[]).filter(r=>!c.has((r.codsolot||"").trim()));}catch(e){return[];}}
const PRESETS=[
 {name:"Estado por zona",groupBy:"zona",filterField:"",filterText:"",metrics:[{label:"Total",formula:"count()"},{label:"Vencidas",formula:'countif(estproyecto,"Vencida")'},{label:"% Vencidas",formula:'round(pct(countif(estproyecto,"Vencida"),count()),1)'}]},
 {name:"Carga por responsable",groupBy:"admproyecto",filterField:"",filterText:"",metrics:[{label:"SOT",formula:"count()"},{label:"Días prom.",formula:"round(avg(dias_trans),1)"},{label:"Clientes",formula:"distinct(cliente)"}]},
 {name:"Tipo de trabajo",groupBy:"tipotrabajo",filterField:"",filterText:"",metrics:[{label:"SOT",formula:"count()"},{label:"A tiempo",formula:'countif(estproyecto,"A Tiempo")'}]}];
let T=[],cur=0,last=null;
function load(){try{T=JSON.parse(localStorage.getItem(KEY)||"null");}catch(e){T=null;}
  if(!Array.isArray(T)||!T.length){T=PRESETS.map((p,i)=>({id:"p"+i,...p}));save();} if(cur>=T.length)cur=0;}
function save(){localStorage.setItem(KEY,JSON.stringify(T));}

function run(tpl){
  let rows=getRows();
  if(tpl.filterField&&tpl.filterText)rows=rows.filter(r=>String(r[tpl.filterField]||"").toLowerCase().includes(tpl.filterText.toLowerCase()));
  const fns=tpl.metrics.map(m=>compile(m.formula));
  const groups=new Map();
  if(tpl.groupBy)rows.forEach(r=>{const k=String(r[tpl.groupBy]||"").trim()||"(sin dato)";(groups.get(k)||groups.set(k,[]).get(k)).push(r);});
  const line=(label,rs)=>({label,vals:fns.map(f=>{const v=f(rs);return Math.round(v*100)/100;})});
  const out=[...groups].map(([k,rs])=>line(k,rs)).sort((a,b)=>b.vals[0]-a.vals[0]);
  return {head:[tpl.groupBy||"Total",...tpl.metrics.map(m=>m.label)],lines:out,total:line("TOTAL",rows),n:rows.length};
}

/* ── UI ── */
function mount(){
  const sc=document.querySelector("#dashboardView .dash-scroll");if(!sc)return;
  let box=$("reportsBox");
  if(!box){box=document.createElement("div");box.id="reportsBox";box.className="dash-card";box.style.marginBottom="14px";sc.insertBefore(box,sc.firstChild);}
  load();
  box.innerHTML=`<div class="dash-card-title">Plantillas de reporte</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
   <select class="scnew-select" id="rpSel" style="width:auto;min-width:220px">${T.map((t,i)=>`<option value="${i}" ${i===cur?"selected":""}>${esc(t.name)}</option>`).join("")}</select>
   <button class="btn-secondary" id="rpNew">➕ Nueva</button><button class="btn-secondary" id="rpEdit">✏️ Editar</button>
   <button class="btn-secondary" id="rpDel">🗑 Eliminar</button><span style="flex:1"></span>
   <button class="btn-secondary" id="rpCopy">⎘ Copiar</button><button class="btn-secondary" id="rpCsv">⬇ CSV</button></div>
  <div id="rpOut" style="overflow:auto"></div>`;
  $("rpSel").onchange=e=>{cur=+e.target.value;draw();};
  $("rpNew").onclick=()=>edit(null);$("rpEdit").onclick=()=>edit(cur);
  $("rpDel").onclick=()=>{if(T.length<2){alert("Debe quedar al menos una plantilla.");return;}if(!confirm("¿Eliminar «"+T[cur].name+"»?"))return;T.splice(cur,1);cur=0;save();mount();};
  $("rpCopy").onclick=()=>{if(!last)return;navigator.clipboard.writeText(tsv()).then(()=>window.showToast&&window.showToast("success","⎘","Copiado","Pega el reporte en Excel."));};
  $("rpCsv").onclick=()=>{if(!last)return;const b=new Blob(["\ufeff"+tsv().replace(/\t/g,",")],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=T[cur].name.replace(/\W+/g,"_")+".csv";a.click();URL.revokeObjectURL(a.href);};
  draw();
}
const tsv=()=>[last.head,...last.lines.map(l=>[l.label,...l.vals]),["TOTAL",...last.total.vals]].map(r=>r.join("\t")).join("\n");
function draw(){
  const o=$("rpOut");if(!o)return;
  try{last=run(T[cur]);}catch(e){last=null;o.innerHTML='<div class="scnew-err">Error en la plantilla: '+esc(e.message)+"</div>";return;}
  if(!last.n){o.innerHTML='<div class="dash-empty">Sin datos. Carga y guarda un backlog primero.</div>';last=null;return;}
  const max=Math.max(1,...last.lines.map(l=>l.vals[0]));
  o.innerHTML='<table class="reg-tbl"><thead><tr>'+last.head.map(h=>`<th>${esc(h)}</th>`).join("")+"</tr></thead><tbody>"+
   last.lines.map(l=>`<tr><td>${esc(l.label)}</td>`+l.vals.map((v,i)=>i===0&&last.lines.length>1?`<td><span style="display:inline-block;height:8px;border-radius:4px;background:var(--signal-teal-dim);width:${Math.max(3,v/max*80)}px;margin-right:6px"></span>${v}</td>`:`<td>${v}</td>`).join("")+"</tr>").join("")+
   `<tr style="font-weight:800;background:var(--paper)"><td>TOTAL</td>${last.total.vals.map(v=>`<td>${v}</td>`).join("")}</tr></tbody></table>`;
}
function edit(idx){
  const tpl=idx===null?{name:"",groupBy:"zona",filterField:"",filterText:"",metrics:[{label:"Total",formula:"count()"}]}:JSON.parse(JSON.stringify(T[idx]));
  const ov=document.createElement("div");
  ov.style.cssText="position:fixed;inset:0;background:rgba(11,18,32,.55);z-index:330;display:flex;align-items:center;justify-content:center;padding:16px";
  const opts=(sel,blank)=>(blank?`<option value="">${blank}</option>`:"")+HEAD().map(h=>`<option ${h===sel?"selected":""}>${esc(h)}</option>`).join("");
  ov.innerHTML=`<div class="sccard" style="width:620px"><div class="schead"><h3>${idx===null?"➕ Nueva":"✏️ Editar"} plantilla</h3><button class="scclose" id="eX">✕</button></div><div class="scbody">
   <label class="scnew-lbl">Nombre</label><input class="scnew-input" id="eName" maxlength="60" value="${esc(tpl.name)}">
   <label class="scnew-lbl">Agrupar por</label><select class="scnew-select" id="eGrp">${opts(tpl.groupBy,"(sin agrupar)")}</select>
   <label class="scnew-lbl">Filtro opcional (campo contiene texto)</label>
   <div style="display:flex;gap:8px"><select class="scnew-select" id="eFF">${opts(tpl.filterField,"(sin filtro)")}</select><input class="scnew-input" id="eFT" value="${esc(tpl.filterText)}" placeholder="texto"></div>
   <label class="scnew-lbl">Columnas calculadas</label><div id="eMet"></div>
   <button class="scnew-btn" id="eAdd" style="margin-top:8px">➕ Columna</button>
   <p class="scnew-hint-sm">Funciones: <code>count()</code> <code>sum(campo)</code> <code>avg(campo)</code> <code>min/max(campo)</code> <code>distinct(campo)</code> <code>countif(campo,"valor")</code> <code>countlike(campo,"texto")</code> <code>sumif(campo,campo2,"valor")</code> <code>pct(a,b)</code> <code>round(x,2)</code> y + − × ÷ ( ). Clic en un chip inserta la función.</p>
   <div id="eChips" style="display:flex;flex-wrap:wrap;gap:5px"></div>
   <div class="scnew-err" id="eErr" style="display:none"></div></div>
   <div class="scfoot"><button class="sccancel" id="eC">Cancelar</button><button class="scok" id="eS">Guardar</button></div></div>`;
  document.body.appendChild(ov);
  let focus=null;const rowsAll=getRows();
  function metRows(){$("eMet").innerHTML=tpl.metrics.map((m,i)=>`<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center"><input class="scnew-input" data-l="${i}" value="${esc(m.label)}" placeholder="Título" style="width:130px"><input class="scnew-input" data-f="${i}" value="${esc(m.formula)}" placeholder="Fórmula"><span data-p="${i}" style="min-width:56px;font-size:11.5px;font-family:var(--mono)"></span><button class="sc-del-btn" data-d="${i}">🗑</button></div>`).join("");
    ov.querySelectorAll("[data-l]").forEach(x=>x.oninput=()=>tpl.metrics[+x.dataset.l].label=x.value);
    ov.querySelectorAll("[data-f]").forEach(x=>{x.onfocus=()=>focus=x;x.oninput=()=>{tpl.metrics[+x.dataset.f].formula=x.value;prev(+x.dataset.f);};prev(+x.dataset.f);});
    ov.querySelectorAll("[data-d]").forEach(x=>x.onclick=()=>{if(tpl.metrics.length>1){tpl.metrics.splice(+x.dataset.d,1);metRows();}});}
  function prev(i){const s=ov.querySelector(`[data-p="${i}"]`);if(!s)return;try{s.style.color="#176B45";s.textContent="= "+Math.round(compile(tpl.metrics[i].formula)(rowsAll)*100)/100;}catch(e){s.style.color="#8C1232";s.textContent="⚠ "+e.message;s.title=e.message;s.style.maxWidth="150px";s.style.whiteSpace="nowrap";s.style.overflow="hidden";s.style.textOverflow="ellipsis";}}
  metRows();
  $("eChips").innerHTML=["count()","sum(dias_trans)","avg(dias_trans)",'countif(estproyecto,"Vencida")',"distinct(cliente)","pct(,)"].map(c=>`<button class="chip-sb" type="button">${esc(c)}</button>`).join("");
  ov.querySelectorAll("#eChips .chip-sb").forEach(c=>c.onclick=()=>{const f=focus||ov.querySelector("[data-f]:last-of-type");if(!f)return;f.value+=c.textContent;f.dispatchEvent(new Event("input"));f.focus();});
  $("eAdd").onclick=()=>{tpl.metrics.push({label:"Nueva",formula:"count()"});metRows();};
  const close=()=>ov.remove();$("eX").onclick=close;$("eC").onclick=close;
  $("eS").onclick=()=>{
    tpl.name=$("eName").value.trim();tpl.groupBy=$("eGrp").value;tpl.filterField=$("eFF").value;tpl.filterText=$("eFT").value.trim();
    const er=$("eErr");er.style.display="none";
    try{if(!tpl.name)throw new Error("Ponle un nombre.");tpl.metrics.forEach(m=>{if(!m.label.trim())throw new Error("Cada columna necesita título.");compile(m.formula);});}
    catch(e){er.textContent=e.message;er.style.display="block";return;}
    if(idx===null){tpl.id="t"+Date.now();T.push(tpl);cur=T.length-1;}else T[idx]=tpl;
    save();close();mount();};
}
$("btnStripDashboard")?.addEventListener("click",()=>setTimeout(mount,0));
})();
