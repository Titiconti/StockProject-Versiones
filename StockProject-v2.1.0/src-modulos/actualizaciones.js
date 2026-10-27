// ===== Actualizaciones automáticas: tarjeta de versión y aviso =====
const UPD={est:null,oculto:false};
UPD.texto=e=>({desarrollo:'Las actualizaciones funcionan en el programa instalado.',inicial:'Todavía no se buscó.',buscando:'Buscando actualizaciones…',
  'al-dia':'✓ Tenés la última versión.',descargando:`Descargando la versión ${e.nueva||''} (${e.pct||0} %)…`,
  lista:`La versión ${e.nueva||''} ya está descargada. Se instala sola al cerrar el programa, o podés actualizar ahora.`,
  'sin-conexion':'No se pudo comprobar si hay una versión nueva (¿hay internet?). Se vuelve a intentar sola.',error:'No se pudo descargar la actualización. Se vuelve a intentar sola.'}[e.fase]||'');
UPD.html=async()=>{const e=UPD.est=await sp.upd.estado(),lista=e.fase==='lista',oc=['buscando','descargando'].includes(e.fase);
  return `<div class="card"><h3>Versión ${esc(e.version)}</h3><p style="margin:0 0 10px">${esc(UPD.texto(e))}${e.ultima&&e.fase==='al-dia'?` <span class="mu">(revisado ${new Date(e.ultima).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})})</span>`:''}</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${lista?'<button class="btn" id="up_i">Actualizar ahora</button>':''}<button class="btn sec" id="up_b" ${oc||!e.empaquetada?'disabled':''}>Buscar actualizaciones</button><label class="opt" style="margin:0"><input type="checkbox" id="up_a" ${e.auto?'checked':''}> Buscar solo cada tanto</label></div></div>`};
UPD.ocupado=()=>{try{return Object.keys(cart).length>0}catch(x){return false}};
UPD.instalar=async()=>{if(UPD.ocupado())return toast('Terminá o vaciá la venta en curso antes de actualizar.');const r=await sp.upd.instalar();if(r&&r.ok===false)toast(r.err||'No se pudo actualizar')};
// Aviso discreto arriba: solo si ya hay una versión descargada y esta persona puede instalarla.
UPD.banner=e=>{let b=$('#updb');const ver=e&&e.fase==='lista'&&!UPD.oculto&&can('configuracion','editar');if(!ver){if(b)b.remove();return}
  if(!b){b=document.createElement('div');b.id='updb';b.style.cssText='position:sticky;top:0;z-index:54;background:var(--ac);color:#fff;text-align:center;padding:7px 10px;font-size:14px;display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap';document.body.prepend(b)}
  b.innerHTML=`<span>Hay una versión nueva (${esc(e.nueva||'')}) lista para instalar.</span><button class="btn sec" id="updb_i" style="padding:3px 10px">Actualizar ahora</button><button class="btn sec" id="updb_x" style="padding:3px 10px">Más tarde</button>`;
  $('#updb_i').onclick=UPD.instalar;$('#updb_x').onclick=()=>{UPD.oculto=true;UPD.banner(null)}};
$('#g_x').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='up_i')UPD.instalar();if(b.id==='up_b'){b.disabled=true;await sp.upd.buscar();SY.render()}});
$('#g_x').addEventListener('change',async e=>{if(e.target.id==='up_a'){const r=await sp.upd.auto(e.target.checked);if(r&&r.ok===false){toast(r.err);SY.render()}else toast(e.target.checked?'Va a buscar actualizaciones solo':'No va a buscar solo; podés hacerlo a mano')}});
if(EDA&&sp.upd){sp.upd.alCambiar(e=>{UPD.est=e;UPD.banner(e);if(!$('#g').classList.contains('hide')&&CF.sub==='x')SY.render()});sp.upd.estado().then(UPD.banner)}
