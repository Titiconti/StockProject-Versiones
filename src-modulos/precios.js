// ===== Aumento masivo de precios: un porcentaje (+ o -) a todos los productos, a una categoría o a un proveedor, con vista previa =====
// Redondeo: si el precio era un número entero se redondea al peso entero más cercano; si tenía centavos, a 2 decimales.
// Los precios por cantidad (tramos) se ajustan igual. Un producto que quedaría en $0 o menos queda sin tocar (se cuenta aparte).
// El proveedor de un producto es el de su último pedido (igual que en Reposición). Requiere permiso de editar y eliminar productos (no cajeros).
const PM={st:{pct:'',alc:'todos',val:'',vista:null},MIN:-90,MAX:500};
PM.redondear=(v,orig)=>Number.isInteger(orig)?Math.round(v):Math.round(v*100)/100;
PM.cats=()=>[...new Set(db.prods.map(p=>(p.cat||'').trim()).filter(Boolean))].sort();
PM.provs=()=>[...new Set(RP.prov().values())].sort();
// Calcula sin modificar nada. Devuelve {err} o {pct,items:[{id,name,antes,despues}],omitidos}.
PM.calc=(pct,alc,val)=>{pct=typeof pct==='number'?pct:UT.num(pct);
  if(pct==null||!isFinite(pct))return{err:'Escribí un porcentaje válido (ej.: 10 o -5)'};if(pct===0)return{err:'El porcentaje no puede ser 0'};
  if(pct<PM.MIN||pct>PM.MAX)return{err:`El porcentaje debe estar entre ${PM.MIN} y ${PM.MAX}`};
  const pv=alc==='prov'?RP.prov():null;if(alc!=='todos'&&!val)return{err:alc==='cat'?'Elegí una categoría':'Elegí un proveedor'};
  const sel=db.prods.filter(p=>alc==='cat'?(p.cat||'').trim()===val:alc==='prov'?pv.get(p.id)===val:true),items=[];let omitidos=0;
  sel.forEach(p=>{const d=PM.redondear(p.price*(1+pct/100),p.price);if(!(d>0)||!isFinite(d)){omitidos++;return}if(d!==p.price)items.push({id:p.id,name:p.name,antes:p.price,despues:d})});
  return{pct,alc,val,items,omitidos,total:sel.length}};
// Aplica de verdad. Revalida todo y comprueba permisos acá (no solo en la pantalla).
PM.aplicar=(pct,alc,val)=>{if(!can('productos','editar')||!can('productos','eliminar'))return{err:'Tu usuario no tiene permiso para cambiar precios en forma masiva'};
  const r=PM.calc(pct,alc,val);if(r.err)return r;
  r.items.forEach(it=>{const p=db.prods.find(q=>q.id===it.id);p.price=it.despues;if(Array.isArray(p.tramos))p.tramos.forEach(t=>{t.precio=PM.redondear(t.precio*(1+r.pct/100),t.precio)});
    ajuste({tipo:'producto.precio',pid:p.id,txt:`${p.name}: precio ${fmt(it.antes)} → ${fmt(it.despues)} (${r.pct>0?'+':''}${r.pct}%)`})});return r};
PM.dibujar=()=>{const box=$('#g_d');if(!box)return;const s=PM.st,v=s.vista,L=s.alc==='cat'?PM.cats():s.alc==='prov'?PM.provs():[];
  const sel=s.alc==='todos'?'':`<div><label>${s.alc==='cat'?'Categoría':'Proveedor'}</label><select id="pm_val"><option value="">(elegí)</option>${L.map(x=>`<option ${x===s.val?'selected':''}>${esc(x)}</option>`).join('')}</select>${L.length?'':`<p class="mu">No hay ${s.alc==='cat'?'categorías cargadas':'proveedores con pedidos'}.</p>`}</div>`;
  const vp=!v?'':v.err?`<div class="tip">${esc(v.err)}</div>`:`<div class="tip"><b>${v.items.length}</b> productos cambiarían de precio (${v.pct>0?'+':''}${v.pct}%)${v.omitidos?` · ${v.omitidos} quedarían en $0 y no se tocan`:''}.</div>${v.items.length?`<div class="wrap"><table><thead><tr><th>Producto</th><th>Antes</th><th>Después</th></tr></thead><tbody>${v.items.slice(0,8).map(i=>`<tr><td>${esc(i.name)}</td><td>${fmt(i.antes)}</td><td>${fmt(i.despues)}</td></tr>`).join('')}</tbody></table></div>${v.items.length>8?`<p class="mu">Se muestran 8 de ${v.items.length}.</p>`:''}<button class="btn" id="pm_ok">Confirmar y aplicar</button>`:''}`;
  box.insertAdjacentHTML('beforeend',`<div class="card" id="pm_card" style="margin-top:12px"><h3>Aumento masivo de precios</h3><p class="mu" style="margin-top:0">Subí o bajá los precios de venta con un porcentaje (negativo para bajar). Primero ves una vista previa; no se cambia nada hasta confirmar. Se redondea al peso entero (o a centavos si el precio los tenía).</p><div class="form"><div><label>Porcentaje %</label><input id="pm_pct" inputmode="decimal" value="${esc(s.pct)}" placeholder="ej.: 10 o -5"></div><div><label>Aplicar a</label><select id="pm_alc"><option value="todos" ${s.alc==='todos'?'selected':''}>Todos los productos</option><option value="cat" ${s.alc==='cat'?'selected':''}>Una categoría</option><option value="prov" ${s.alc==='prov'?'selected':''}>Un proveedor</option></select></div>${sel}</div><div style="display:flex;gap:8px;margin:10px 0"><button class="btn sec" id="pm_v">Ver vista previa</button></div>${vp}</div>`)};
{const r0=MG.render;MG.render=function(){r0.apply(this,arguments);PM.dibujar()}}
$('#g_d').addEventListener('change',e=>{const t=e.target,s=PM.st;if(!t.id||t.id.slice(0,3)!=='pm_')return;
  if(t.id==='pm_pct'){s.pct=t.value;if(!s.vista)return}   // sin vista previa no se redibuja: si no, el blur cambia el botón entre mousedown y mouseup y se pierde el clic en Ver vista previa
  if(t.id==='pm_alc'){s.alc=t.value;s.val=''}if(t.id==='pm_val')s.val=t.value;s.vista=null;MG.render()});
$('#g_d').addEventListener('click',async e=>{const b=e.target.closest('button'),s=PM.st;if(!b||!b.id||b.id.slice(0,3)!=='pm_')return;
  if(b.id==='pm_v'){const pc=$('#pm_pct');if(pc)s.pct=pc.value;s.vista=PM.calc(s.pct,s.alc,s.val);MG.render()}
  if(b.id==='pm_ok'){if(!UT.chk('productos','editar')||!UT.chk('productos','eliminar'))return;if(EDA&&sp.now)try{await sp.now()}catch(x){}
    const r=PM.aplicar(s.pct,s.alc,s.val);if(r.err)return toast(r.err);save();call('audit','precios.masivo',`${r.pct}% ${s.alc}${s.val?' '+s.val:''}: ${r.items.length} productos`);
    PM.st={pct:'',alc:'todos',val:'',vista:null};draw();MG.render();toast(`Listo: se actualizaron ${r.items.length} precios`)}});
