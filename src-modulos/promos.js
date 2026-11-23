// ===== Promos y packs (v5.7.2): un producto que se arma con otros =====
// Modelo: producto `tipo:'promo'` con `comp:[{id,q}]` (id del componente, q unidades por promo). No tiene stock propio:
// lo vendible es el mínimo según sus componentes (promoDisp, en el núcleo). Al vender descuenta cada componente (sell) y al anular los devuelve (restore).
// Los componentes se siguen vendiendo sueltos. Se carga en Productos › Promos y combos.
const PRM={ed:{id:null,comps:[{id:'',q:1}]}};
// Componentes posibles: productos comunes por unidad (sin series, variantes ni peso).
PRM.elegibles=()=>db.prods.filter(x=>x.tipo!=='promo'&&x.tipo!=='tamano'&&x.control!=='serie'&&x.control!=='variantes'&&x.unidad!=='kg');
PRM.promos=()=>db.prods.filter(p=>p.tipo==='promo');
// Alta o edición. Devuelve {ok,p} o {err}. Une los componentes repetidos y calcula el costo con el de los componentes.
PRM.guardar=({id,name,price,comps})=>{
  name=String(name||'').trim().slice(0,80);if(!name)return{err:'Poné un nombre a la promo'};
  price=Number(price);if(!(price>0))return{err:'Poné el precio de la promo'};
  const m=new Map();for(const c of comps||[]){if(c.id===''||c.id==null)continue;const cid=+c.id,q=Number(c.q),pr=db.prods.find(x=>x.id===cid);
    if(!pr||!PRM.elegibles().includes(pr))return{err:'Un componente no existe o no se puede usar en una promo'};
    if(!(q>0)||!Number.isInteger(q))return{err:'La cantidad de '+pr.name+' tiene que ser un número entero mayor a cero'};m.set(cid,(m.get(cid)||0)+q)}
  if(!m.size)return{err:'Agregá al menos un componente'};
  if(db.prods.some(x=>x.id!==id&&norm(x.name)===norm(name)))return{err:'Ya hay un producto con ese nombre'};
  const comp=[...m].map(([cid,q])=>({id:cid,q})),cost=Math.round(comp.reduce((a,c)=>a+(db.prods.find(x=>x.id===c.id).cost||0)*c.q,0)*100)/100;
  let p=id!=null?db.prods.find(x=>x.id===id&&x.tipo==='promo'):null;
  if(id!=null&&!p)return{err:'La promo no existe'};
  if(p)Object.assign(p,{name,price,cost,comp});else{p={id:db.nid++,name,code:'',price,cost,min:0,tipo:'promo',cat:'Promos',comp,lots:[]};db.prods.push(p)}
  save();return{ok:true,p}};
PRM.eliminar=id=>{const p=db.prods.find(x=>x.id===id&&x.tipo==='promo');if(!p)return{err:'La promo no existe'};db.prods=db.prods.filter(x=>x!==p);delete cart[id];delete cartImp[id];save();return{ok:true}};
PRM.contenido=p=>(p.comp||[]).map(c=>{const x=db.prods.find(y=>y.id===c.id);return c.q+' × '+(x?esc(x.name):'<i>(eliminado)</i>')}).join(' + ');
$('#p').insertAdjacentHTML('beforeend',`<details class="card" id="prm"><summary style="cursor:pointer"><b>Promos y combos</b> <span class="mu">· productos que se arman con otros (ej.: café + 2 medialunas)</span></summary>
<p class="mu">Al vender la promo se descuentan sus componentes del stock; al anular la venta vuelven. Los componentes se siguen vendiendo sueltos.</p>
<div class="form"><div><label>Nombre de la promo</label><input id="prm_n" placeholder="Ej.: Café + 2 medialunas"></div><div><label>Precio (ARS)</label><input id="prm_p" type="number" min="0" step="0.01"></div></div>
<div id="prm_c"></div><div style="display:flex;gap:6px;margin:8px 0"><button class="btn sec" id="prm_a">Agregar componente</button><button class="btn" id="prm_g">Guardar promo</button><button class="btn sec hide" id="prm_x">Cancelar edición</button></div>
<div class="wrap"><table><thead><tr><th>Promo</th><th class="n">Precio</th><th>Contiene</th><th class="n">Disponibles</th><th></th></tr></thead><tbody id="prm_l"></tbody></table></div></details>`);
// Lee las filas del formulario (cantidades y componentes elegidos) hacia PRM.ed.
PRM.leer=()=>{PRM.ed.comps=$$('#prm_c [data-pc]').map(r=>({id:r.querySelector('select').value,q:r.querySelector('input').value}))};
PRM.filas=()=>{const op=PRM.elegibles();$('#prm_c').innerHTML=PRM.ed.comps.map((c,i)=>`<div class="form" data-pc="${i}"><div><label>Componente</label><select aria-label="Componente ${i+1}"><option value="">Elegí un producto…</option>${op.map(x=>`<option value="${x.id}" ${String(x.id)===String(c.id)?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div><div><label>Cantidad</label><input type="number" min="1" step="1" value="${esc(String(c.q))}" aria-label="Cantidad del componente ${i+1}"></div><div style="align-self:end"><button class="btn del" data-px="${i}" aria-label="Quitar componente ${i+1}">×</button></div></div>`).join('')};
PRM.lista=()=>{$('#prm_l').innerHTML=PRM.promos().map(p=>`<tr><td><b>${esc(p.name)}</b></td><td class="n">${fmt(p.price)}</td><td>${PRM.contenido(p)}</td><td class="n">${avail(p)}</td><td><button class="btn sec" data-pe="${p.id}">Editar</button> <button class="btn del" data-pd="${p.id}" ${can('productos','eliminar')?'':'disabled'}>${arm==='pr'+p.id?'¿Seguro? Eliminar':'Eliminar'}</button></td></tr>`).join('')||'<tr><td colspan="5" class="mu">Todavía no cargaste promos.</td></tr>'};
PRM.vaciar=()=>{PRM.ed={id:null,comps:[{id:'',q:1}]};$('#prm_n').value='';$('#prm_p').value='';$('#prm_x').classList.add('hide');PRM.filas()};
{const sin=()=>toast('Tu usuario no tiene permiso para esto');
  $('#prm_a').onclick=()=>{PRM.leer();PRM.ed.comps.push({id:'',q:1});PRM.filas()};
  $('#prm_c').onclick=e=>{const b=e.target.closest('[data-px]');if(!b)return;PRM.leer();PRM.ed.comps.splice(+b.dataset.px,1);if(!PRM.ed.comps.length)PRM.ed.comps.push({id:'',q:1});PRM.filas()};
  $('#prm_x').onclick=PRM.vaciar;
  $('#prm_g').onclick=()=>{if(!can('productos',PRM.ed.id?'editar':'crear'))return sin();PRM.leer();const r=PRM.guardar({id:PRM.ed.id,name:$('#prm_n').value,price:$('#prm_p').value,comps:PRM.ed.comps});if(r.err)return toast(r.err);PRM.vaciar();draw();toast('Promo guardada')};
  $('#prm_l').onclick=e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.pd){if(!can('productos','eliminar'))return sin();if(armed('pr'+b.dataset.pd)){const r=PRM.eliminar(+b.dataset.pd);arm='';draw();toast(r.err||'Promo eliminada')}return}
    if(b.dataset.pe){const p=db.prods.find(x=>x.id===+b.dataset.pe);if(!p)return;PRM.ed={id:p.id,comps:p.comp.map(c=>({id:c.id,q:c.q}))};$('#prm_n').value=p.name;$('#prm_p').value=p.price;$('#prm_x').classList.remove('hide');PRM.filas();$('#prm_n').focus()}};
  $('#prm').addEventListener('toggle',()=>{if($('#prm').open){PRM.leer();PRM.filas()}})}
PRM.filas();
MODS.push(PRM.lista);
