// ===== Catálogo precargado por rubro: productos típicos sin precio, a elegir por categoría, y carga rápida de precios =====
// Los datos viven en catalogos/<rubro>.json (se leen por IPC: sp.catalogo). Sin precios, sin marcas y sin códigos de barras.
// Cargar un producto del catálogo = crearlo con precio 0 y sin stock. Mientras no tenga precio no se vende (sinPrecio, en index.html).
// Nunca duplica: compara por nombre normalizado (sin tildes ni mayúsculas) contra los productos que ya existen.
const CT={cache:{},abiertas:new Set()};
CT.hay=()=>KIND==='ipc'&&!!sp.catalogo;   // en la demo web no hay catálogo
CT.rubros=()=>Object.keys(RB.PERFILES).filter(k=>k!=='otro');
// Valida lo que llega del archivo: descarta lo mal formado y repetido. u: 'u' (unidad) o 'kg' (por peso).
CT.limpiar=d=>{const vistos=new Set(),out=[];if(!d||!Array.isArray(d.productos))return out;
  d.productos.forEach(x=>{if(!x||typeof x.n!=='string'||typeof x.c!=='string')return;const n=x.n.replace(/\s+/g,' ').trim().slice(0,80),c=x.c.replace(/\s+/g,' ').trim().slice(0,40),k=norm(n);if(!n||!c||vistos.has(k))return;vistos.add(k);out.push({n,c,u:x.u==='kg'?'kg':'u'})});return out};
CT.leer=async r=>{if(CT.cache[r])return CT.cache[r];let d=null;try{d=await sp.catalogo(r)}catch(e){}const l=CT.limpiar(d);if(l.length)CT.cache[r]=l;return l};
CT.ya=()=>new Set(db.prods.map(p=>norm(p.name)));
CT.todos=items=>{const ya=CT.ya();return new Set(items.map((x,i)=>i).filter(i=>!ya.has(norm(items[i].n))))};
CT.sinPrecio=()=>db.prods.filter(sinPrecio);
// Agrega los productos (sin precio ni stock). Por peso solo si el negocio vende por peso; vencimiento obligatorio si el rubro lo pide. No guarda: quien llama hace save().
CT.agregar=items=>{const ya=CT.ya(),c=PX.caps();let n=0,repetidos=0;
  items.forEach(x=>{const k=norm(x.n);if(ya.has(k)){repetidos++;return}ya.add(k);const p={id:db.nid++,name:x.n,code:'',price:0,cost:0,min:0,cat:x.c,lots:[]};if(x.u==='kg'&&c.peso)p.unidad='kg';if(c.vtoPorDefecto)p.reqVto=true;db.prods.push(p);n++});
  if(n)ajuste({tipo:'catalogo.carga',txt:`Catálogo del rubro: ${n} productos cargados sin precio`});return{n,repetidos}};
CT.cargarElegidos=(items,sel)=>{if(!UT.chk('productos','crear'))return null;const r=CT.agregar(items.filter((x,i)=>sel.has(i)));if(r.n){save();draw()}return r};
CT.contar=n=>{const e=$('#ct_n');if(e)e.textContent=n?`${n} ${n===1?'producto elegido':'productos elegidos'}`:'No se va a cargar ningún producto';const b=$('#ct_ok');if(b)b.disabled=!n};
// ---------- vista previa por categoría ----------
CT.html=(items,sel)=>{const ya=CT.ya(),por={};items.forEach((x,i)=>(por[x.c]=por[x.c]||[]).push(i));
  const fila=i=>{const x=items[i],y=ya.has(norm(x.n));return `<label class="opt" style="display:flex;gap:6px;break-inside:avoid"><input type="checkbox" style="width:auto" data-ct-i="${i}" ${y?'disabled':''} ${sel.has(i)?'checked':''}> <span>${esc(x.n)}${x.u==='kg'?' <span class="mu">(por kg)</span>':''}${y?' <span class="mu">(ya lo tenés)</span>':''}</span></label>`};
  return `<div style="margin-bottom:6px;display:flex;gap:8px"><button type="button" class="btn sec" data-ct-todo="1">Elegir todos</button><button type="button" class="btn sec" data-ct-todo="0">Ninguno</button></div>`+Object.entries(por).map(([c,ix])=>{
    const libres=ix.filter(i=>!ya.has(norm(items[i].n))),on=libres.filter(i=>sel.has(i)).length,ab=CT.abiertas.has(c),k=esc(c);
    return `<div style="border-bottom:1px solid rgba(128,128,128,.25);padding:6px 0"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label style="display:inline-flex;gap:6px;align-items:center;flex:1;min-width:170px"><input type="checkbox" style="width:auto" data-ct-cat="${k}" ${libres.length&&on===libres.length?'checked':''} ${libres.length?'':'disabled'}> <b>${k}</b></label><span class="mu">${on} de ${libres.length}${ix.length>libres.length?' · '+(ix.length-libres.length)+' ya cargados':''}</span><button type="button" class="btn sec" data-ct-ver="${k}">${ab?'Ocultar':'Ver todos'}</button></div>${ab?`<div style="columns:2 230px;margin-top:4px">${ix.map(fila).join('')}</div>`:`<div class="mu" style="font-size:12.5px">${esc(ix.slice(0,4).map(i=>items[i].n).join(', '))}…</div>`}</div>`}).join('')};
// Dibuja en box y deja listos los eventos; sel (Set de posiciones) se modifica en el lugar.
CT.montar=(box,items,sel)=>{const pintar=()=>{box.innerHTML=CT.html(items,sel);CT.contar(sel.size)},ya=CT.ya();
  box.onchange=e=>{const t=e.target;if(t.dataset.ctI!==undefined){const i=+t.dataset.ctI;t.checked?sel.add(i):sel.delete(i)}else if(t.dataset.ctCat!==undefined)items.forEach((x,i)=>{if(x.c===t.dataset.ctCat&&!ya.has(norm(x.n)))t.checked?sel.add(i):sel.delete(i)});else return;pintar()};
  box.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.ctVer!==undefined){const c=b.dataset.ctVer;CT.abiertas.has(c)?CT.abiertas.delete(c):CT.abiertas.add(c)}else if(b.dataset.ctTodo!==undefined){if(b.dataset.ctTodo==='1')CT.todos(items).forEach(i=>sel.add(i));else sel.clear()}else return;pintar()};
  pintar()};
CT.cuerpo=()=>'<div id="ct_box" style="max-height:46vh;overflow:auto;margin:8px 0"></div>';CT.cuenta=()=>'<span id="ct_n" class="mu"></span>';
CT.htmlPaso=rubro=>`<h3>¿Querés cargar productos de ejemplo de tu rubro?</h3><p class="mu" style="margin-top:0">Te armamos una lista de productos típicos de ${esc(rubro.toLowerCase())}, sin precios, para que no arranques de cero. Elegí cuáles querés (podés tildar o destildar por categoría); si preferís empezar vacío, tocá Ninguno. Después les ponés el precio en una grilla.</p>${CT.cuerpo()}<p>${CT.cuenta()}</p>`;
// Paso del asistente de primer uso: la selección vive en st.cat y se aplica recién al terminar el asistente.
CT.paso=(st,box)=>{if(!st.cat||st.cat.rubro!==st.rubro)st.cat={rubro:st.rubro,items:null,sel:new Set()};const c=st.cat;
  if(c.items)return CT.montar(box,c.items,c.sel);
  box.innerHTML='<p class="mu">Cargando…</p>';
  CT.leer(st.rubro).then(items=>{if(!box.isConnected||st.cat!==c)return;c.items=items;c.sel=CT.todos(items);if(!items.length){box.innerHTML='<p class="mu">Este rubro no tiene catálogo. Podés seguir sin él.</p>';return}CT.montar(box,items,c.sel)})};
// ---------- Productos › Cargar catálogo de mi rubro ----------
CT.abrir=async rubro0=>{if(!CT.hay())return toast('El catálogo está disponible en el programa instalado');if(!UT.chk('productos','crear')||$('#ctov'))return;
  let rubro=rubro0||(CT.rubros().includes(db.cfg.rubro)?db.cfg.rubro:CT.rubros()[0]),items=[],sel=new Set();
  const ov=document.createElement('div');ov.className='ov';ov.id='ctov';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');document.body.appendChild(ov);
  ov.innerHTML=`<div class="card" style="max-width:740px;width:100%"><h3>Cargar catálogo de mi rubro</h3><p class="mu" style="margin-top:0">Productos típicos, sin precio y sin stock. Elegí los que vendés: los que ya tenés cargados no se repiten. Después les ponés el precio en una grilla; hasta entonces no se pueden vender.</p><div class="form"><div><label for="ct_r">Rubro</label><select id="ct_r">${CT.rubros().map(k=>`<option value="${k}" ${k===rubro?'selected':''}>${esc(RB.PERFILES[k].n)}</option>`).join('')}</select></div></div>${CT.cuerpo()}<div style="display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap">${CT.cuenta()}<span style="display:flex;gap:8px"><button class="btn sec" id="ct_x">Cancelar</button><button class="btn" id="ct_ok" disabled>Cargar productos</button></span></div></div>`;
  const box=ov.querySelector('#ct_box');
  const cargar=async()=>{box.innerHTML='<p class="mu">Cargando…</p>';const r=rubro;items=await CT.leer(r);if(!ov.isConnected||r!==rubro)return;sel=CT.todos(items);
    if(!items.length){box.innerHTML='<p class="mu">No se pudo leer el catálogo de este rubro.</p>';return CT.contar(0)}CT.montar(box,items,sel)};
  ov.querySelector('#ct_r').onchange=e=>{rubro=e.target.value;cargar()};ov.querySelector('#ct_x').onclick=()=>ov.remove();
  ov.querySelector('#ct_ok').onclick=()=>{const r=CT.cargarElegidos(items,sel);if(!r)return;ov.remove();if(!r.n)return toast('No había productos nuevos para cargar');toast(`Se cargaron ${r.n} productos sin precio`);CT.ofrecer()};
  cargar()};
// ---------- Después de cargar: ofrecer ponerles precio ----------
CT.ofrecer=despues=>{const fin=()=>{if(despues)despues()},n=CT.sinPrecio().length;if(!n||!can('productos','editar'))return fin();
  const ov=document.createElement('div');ov.className='ov';ov.id='ctof';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');document.body.appendChild(ov);
  ov.innerHTML=`<div class="card" style="max-width:480px"><h3>Ahora faltan los precios</h3><p>Hay <b>${n}</b> ${n===1?'producto':'productos'} sin precio. No se pueden vender hasta que lo tengan.</p><p class="mu">Podés ponerlos ahora en una grilla (escribís el precio y con Enter pasás al siguiente) o más tarde desde Productos.</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn sec" id="ctof_t">Más tarde</button><button class="btn" id="ctof_ok">Ponerles precio ahora</button></div></div>`;
  ov.querySelector('#ctof_t').onclick=()=>{ov.remove();fin()};ov.querySelector('#ctof_ok').onclick=()=>{ov.remove();CT.precios(fin)};ov.querySelector('#ctof_ok').focus()};
// ---------- Carga rápida de precios (grilla) ----------
CT.MAX_FILAS=300;
CT.precios=despues=>{if(!UT.chk('productos','editar')||$('#ctpr'))return;
  const todos=CT.sinPrecio().sort((a,b)=>(a.cat||'').localeCompare(b.cat||'','es')||a.name.localeCompare(b.name,'es'));
  if(!todos.length){toast('Todos tus productos ya tienen precio');return despues&&despues()}
  const cats=[...new Set(todos.map(p=>p.cat||'Sin categoría'))],val={};let filtro='';
  const ov=document.createElement('div');ov.className='ov';ov.id='ctpr';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');document.body.appendChild(ov);
  const dibujar=()=>{const L=todos.filter(p=>!filtro||(p.cat||'Sin categoría')===filtro),V=L.slice(0,CT.MAX_FILAS);
    ov.innerHTML=`<div class="card" style="max-width:760px;width:100%"><h3>Poné precio a tus productos</h3><p class="mu" style="margin-top:0">Escribí el precio de venta de cada uno y apretá Enter para pasar al siguiente. Los que dejes vacíos quedan sin precio y no se pueden vender. Los precios por kilo son para los productos marcados "por kg".</p><div class="form"><div><label for="ctp_c">Categoría</label><select id="ctp_c"><option value="">Todas (${todos.length})</option>${cats.map(c=>`<option value="${esc(c)}" ${c===filtro?'selected':''}>${esc(c)}</option>`).join('')}</select></div></div><div style="max-height:50vh;overflow:auto;margin:8px 0"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th></tr></thead><tbody>${V.map(p=>`<tr><td>${esc(p.name)}${p.unidad==='kg'?' <span class="mu">(por kg)</span>':''}</td><td class="mu">${esc(p.cat||'')}</td><td><input data-ctp="${p.id}" inputmode="decimal" autocomplete="off" style="width:110px" aria-label="Precio de ${esc(p.name)}" value="${esc(val[p.id]||'')}"></td></tr>`).join('')}</tbody></table></div>${L.length>V.length?`<p class="mu">Se muestran ${V.length} de ${L.length}: guardá estos y volvé a abrir la grilla para seguir.</p>`:''}<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn sec" id="ctp_x">Cerrar</button><button class="btn" id="ctp_ok">Guardar precios</button></div></div>`;
    const ins=[...ov.querySelectorAll('input[data-ctp]')];if(ins[0])ins[0].focus();
    ov.querySelector('#ctp_c').onchange=e=>{filtro=e.target.value;dibujar()};
    ins.forEach((el,i)=>{el.oninput=()=>{val[el.dataset.ctp]=el.value};el.onkeydown=e=>{if(e.key!=='Enter')return;e.preventDefault();(ins[i+1]||ov.querySelector('#ctp_ok')).focus()}});
    ov.querySelector('#ctp_x').onclick=()=>{ov.remove();if(despues)despues()};ov.querySelector('#ctp_ok').onclick=guardar};
  const guardar=()=>{if(!UT.chk('productos','editar'))return;const cambios=[];
    for(const [id,v] of Object.entries(val)){if(!String(v).trim())continue;const p=db.prods.find(x=>x.id==id),n=UT.num(v);if(!p||!sinPrecio(p))continue;
      if(n==null||!isFinite(n)||n<=0||n>=1e9)return toast('Revisá el precio de '+p.name+': tiene que ser un número mayor a 0');cambios.push([p,Math.round(n*100)/100])}
    if(!cambios.length)return toast('Todavía no escribiste ningún precio');
    cambios.forEach(([p,n])=>{p.price=n});ajuste({tipo:'producto.precio',txt:`Carga rápida de precios: ${cambios.length} productos`});save();draw();ov.remove();
    const q=CT.sinPrecio().length;toast(`Listo: ${cambios.length} ${cambios.length===1?'precio guardado':'precios guardados'}${q?` · quedan ${q} sin precio`:''}`);if(despues)despues()};
  dibujar()};
// Botones en Productos
{const f=$('#flast');if(f){f.insertAdjacentHTML('afterend','<div id="ct_bar" style="display:none;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sec" id="ct_ab">Cargar catálogo de mi rubro</button><button class="btn sec hide" id="ct_pr"></button></div>');
  $('#ct_ab').onclick=()=>CT.abrir();$('#ct_pr').onclick=()=>CT.precios();
  MODS.push(()=>{const b=$('#ct_bar');if(!b)return;b.style.display=CT.hay()?'flex':'none';const n=CT.sinPrecio().length,p=$('#ct_pr');p.classList.toggle('hide',!n);p.textContent=n===1?'Ponerle precio al producto sin precio':`Ponerles precio a los ${n} sin precio`})}}
