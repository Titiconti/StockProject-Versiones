// ===== Productos con capacidades propias (v3.1.0): peso, series y garantía, variantes, vencimiento obligatorio,
// cantidad mínima, precios por cantidad, categoría, marca y modelo. Cada producto usa solo lo que necesita.
// Modelo (todos opcionales; un producto viejo sin estos campos se comporta como siempre):
//   unidad 'u' | 'kg' (stock en gramos enteros) · control '' | 'serie' (cada lote es una unidad con su N.º) | 'variantes'
//   (producto principal sin stock propio; cada combinación es un producto hijo con padre e attrs, su código y su stock)
//   reqVto · minimo · tramos [{desde,precio}] · cat · garantia (meses) · marca · modelo
const PX={};
// Capacidades del negocio. Sin entrevista: las del rubro equivalente a la encuesta anterior; si tampoco hay, lo básico
// (categoría, peso y vencimiento). Marca, modelo, garantía, series, variantes y precios por cantidad solo aparecen si el rubro los usa.
PX.BASE={peso:true,vencimientos:true,series:false,garantias:false,variantes:false,tramos:false,minimos:false};
PX.caps=()=>{if(db.cfg.caps)return db.cfg.caps;const e=db.cfg.encuesta,rb=typeof RB!=='undefined'&&e&&RB.deTipo(e.tipo);return rb?RB.resolver({rubro:rb,r:{},extra:[]}).caps:PX.BASE};
PX.rubro=()=>typeof RB!=='undefined'?RB.PERFILES[db.cfg.rubro||(db.cfg.encuesta&&RB.deTipo(db.cfg.encuesta.tipo))||'']||null:null;
PX.on=c=>!!PX.caps()[c];
PX.hijos=p=>db.prods.filter(x=>x.padre===p.id);
PX.stockPadre=p=>PX.hijos(p).reduce((a,h)=>a+avail(h),0);
PX.cantidad=(p,v)=>{v=String(v==null?'':v).trim().replace(',','.');if(!v)return 0;const n=parseFloat(v);if(!isFinite(n))return 0;if(n<0)return -1;return esPeso(p)?Math.round(n*1000):Math.floor(n)};
PX.todasSeries=excluir=>{const s=new Set();db.prods.forEach(p=>{if(esSerie(p))p.lots.forEach(l=>{if(l.qty>0&&!(excluir&&excluir.has(l.id)))s.add(String(l.n).trim().toUpperCase())})});return s};
PX.series=(txt,q,pid)=>{const L=String(txt||'').split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean);if(L.length!==q)return{err:`Escribí ${q} ${q===1?'número de serie':'números de serie'} (uno por unidad, separados por coma) en el campo de lote`};
  const ex=PX.todasSeries(),vis=new Set();for(const n of L){const k=n.toUpperCase();if(vis.has(k)||ex.has(k))return{err:'El número de serie '+n+' ya está cargado'};vis.add(k)}return L};
PX.parseTramos=t=>{t=String(t||'').trim();if(!t)return{v:undefined};const out=[];for(const par of t.split(/[;\n]+/)){const m=par.trim().match(/^(\d+)\s*[=:]\s*([\d.,]+)$/);if(!m)return{err:'Precios por cantidad: usá el formato "desde=precio", por ejemplo 10=900; 50=800'};
  const desde=+m[1],precio=parseFloat(m[2].replace(/\.(?=\d{3}\b)/g,'').replace(',','.'));if(!(desde>=2))return{err:'Cada tramo empieza en 2 unidades o más'};if(!(precio>=0))return{err:'Precio por cantidad inválido'};out.push({desde,precio})}
  out.sort((a,b)=>a.desde-b.desde);for(let i=1;i<out.length;i++)if(out[i].desde===out[i-1].desde)return{err:'Hay dos tramos que empiezan en la misma cantidad'};return{v:out}};
// Texto → número: la coma es siempre el decimal ("1,125" = 1,125 kg) y el punto solo separa miles ("4.500,50" = 4500,5). NaN si no se entiende.
PX.num=v=>{v=String(v==null?'':v).replace(/[\s$]/g,'');if(!v)return NaN;v=v.includes(',')?v.replace(/\./g,'').replace(',','.'):/^\d{1,3}(\.\d{3})+$/.test(v)?v.replace(/\./g,''):v;return /^\d*\.?\d+$/.test(v)?parseFloat(v):NaN};
// Importe ↔ gramos de un producto por peso, en centavos enteros (mismo criterio que lineaTotal).
PX.gDesdeImporte=(p,imp)=>{const c=Math.round(precioUnit(p)*100);return c>0&&imp>0?Math.round(imp*100*1000/c):0};
PX.impDeG=(p,g)=>Math.round(Math.round(precioUnit(p)*100)*g/1000)/100;
PX.coma=(n,d)=>String(Math.round(n*10**d)/10**d).replace('.',',');
PX.limpiar=p=>{['unidad','control','reqVto','minimo','tramos','cat','garantia','marca','modelo','plu','balde'].forEach(k=>{const v=p[k];if(v==null||v===''||v===false||v===0||(Array.isArray(v)&&!v.length)||(k==='unidad'&&v==='u'))delete p[k]})};
// ---------- formulario de producto ----------
$('#fg').closest('.form').insertAdjacentHTML('afterend',`<details class="dt" id="pxo" style="margin:-2px 0 10px"><summary>Opciones del producto <span class="mu" id="pxr" style="font-weight:400"></span></summary><div class="form" style="margin-top:8px">
<div><label>Categoría</label><input id="px_cat" list="px_cats" placeholder="Ej.: Bebidas"><datalist id="px_cats"></datalist></div>
<div data-cap="peso"><label>Se vende por</label><select id="px_u"><option value="u">Unidad</option><option value="kg">Peso (precio por kg)</option></select></div>
<div data-cap="peso"><label>Código de balanza (PLU)</label><input id="px_plu" inputmode="numeric" placeholder="Ej.: 123"></div>
<input id="px_bal" type="hidden">
<div data-cap="control"><label>Control de stock</label><select id="px_ctl"><option value="">Normal (por cantidad y lote)</option><option value="serie" data-cap="series">Por número de serie</option><option value="variantes" data-cap="variantes">Con variantes (talle, color…)</option></select></div>
<div data-cap="minimos"><label>Compra mínima (unidades)</label><input id="px_min" type="number" min="0"></div>
<div data-cap="tramos" style="grid-column:span 2"><label>Precios por cantidad (desde=precio)</label><input id="px_tr" placeholder="10=900; 50=800"></div>
<div data-cap="garantias"><label>Garantía (meses)</label><input id="px_ga" type="number" min="0" max="240"></div>
<div data-cap="garantias"><label>Marca</label><input id="px_ma"></div><div data-cap="garantias"><label>Modelo</label><input id="px_mo"></div>
<div data-cap="vencimientos" style="align-self:center"><label class="opt" style="margin:0"><input type="checkbox" id="px_vr"> Exige fecha de vencimiento</label></div></div></details>`);
PX.vis=()=>{$$('#pxo [data-cap]').forEach(x=>{const c=x.dataset.cap;x.classList.toggle('hide',c==='control'?!(PX.on('series')||PX.on('variantes')):!PX.on(c));if(x.tagName==='OPTION'){x.hidden=!PX.on(c);x.disabled=!PX.on(c)}});
  {const rb=PX.rubro();if(rb){fn.placeholder='Ej.: '+rb.ej;$('#px_cat').placeholder=rb.cats[0]?'Ej.: '+rb.cats[0]:'Opcional'}
  }
  $('#px_cats').innerHTML=[...new Set([...db.prods.map(p=>p.cat).filter(Boolean),...((PX.rubro()||{}).cats||[])])].sort().map(c=>`<option value="${esc(c)}">`).join('');
  const u=$('#px_u').value,c=$('#px_ctl').value,lq=fs.previousElementSibling,ll=fl.previousElementSibling;
  if(lq)lq.textContent=c==='variantes'?'Cantidad (se carga en cada variante)':u==='kg'?($('#px_bal').value>0?'Cantidad a ingresar (baldes)':'Cantidad a ingresar (kg)'):'Cantidad a ingresar';if(ll)ll.textContent=c==='serie'?'N.º de serie (uno por unidad, separados por coma)':'N.º de lote (opcional)';
  fs.disabled=c==='variantes';fp.disabled=!!editId&&typeof HL!=='undefined'&&!HL.puedePrecios();{const g=u==='kg'&&$('#px_bal').value>0;$('#px_u').querySelector('option[value=kg]').textContent=g?'Balde (se cuenta en baldes)':'Peso (precio por kg)';fp.previousElementSibling.textContent=g?'Precio ('+MON+')':u==='kg'?'Precio por kg ('+MON+')':'Precio de venta ('+MON+')'}
  $('#pxr').textContent=[u==='kg'?'por peso':'',c==='serie'?'con N.º de serie':c==='variantes'?'con variantes':'',$('#px_vr').checked?'vence':'',$('#px_cat').value].filter(Boolean).join(' · ')};
['#px_u','#px_ctl','#px_vr','#px_cat'].forEach(x=>$(x).addEventListener('change',PX.vis));
PX.llenarForm=p=>{const d=p||{};$('#px_cat').value=d.cat||'';$('#px_u').value=d.unidad==='kg'?'kg':'u';$('#px_ctl').value=d.control||'';$('#px_min').value=d.minimo||'';$('#px_tr').value=(d.tramos||[]).map(t=>t.desde+'='+t.precio).join('; ');
  $('#px_plu').value=d.plu||'';$('#px_bal').value=d.balde?PX.coma(d.balde,3):'';
  $('#px_ga').value=d.garantia||'';$('#px_ma').value=d.marca||'';$('#px_mo').value=d.modelo||'';$('#px_vr').checked=p?!!d.reqVto:!!PX.caps().vtoPorDefecto;if(!p&&PX.caps().unidadPorDefecto&&PX.on('peso'))$('#px_u').value=PX.caps().unidadPorDefecto;PX.vis()};
// Lee y valida las opciones. Nunca cambia la forma de venta o el control de un producto que ya tiene stock (cambiaría el significado de sus cantidades).
PX.leerForm=prev=>{const u=$('#px_u').value==='kg'?'kg':'u',c=['serie','variantes'].includes($('#px_ctl').value)?$('#px_ctl').value:'',tr=PX.parseTramos($('#px_tr').value);if(tr.err)return{err:tr.err};
  const mi=$('#px_min').value===''?0:+$('#px_min').value,ga=$('#px_ga').value===''?0:+$('#px_ga').value;if(!(mi>=0)||!Number.isInteger(mi))return{err:'La compra mínima tiene que ser un número entero'};if(!(ga>=0&&ga<=240)||!Number.isInteger(ga))return{err:'La garantía va en meses enteros (0 a 240)'};
  if(u==='kg'&&c)return{err:'Un producto por peso no puede tener número de serie ni variantes'};
  const plu=$('#px_plu').value.trim().replace(/^0+(?=\d)/,''),bal=$('#px_bal').value.trim()===''?0:PX.num($('#px_bal').value);
  if(plu&&(!/^\d{1,13}$/.test(plu)||u!=='kg'))return{err:'El código de balanza son solo números y va en productos por peso'};
  {const o=plu&&db.prods.find(x=>(!prev||x.id!==prev.id)&&String(x.plu||'')===plu);if(o)return{err:'El código de balanza '+plu+' ya lo usa '+o.name}}
  if(!(bal>=0&&bal<=100)||(bal>0&&u!=='kg'))return{err:'Balde inválido'};
  // Solo gerente o administrador cambian precios (rubro heladería): el proceso principal lo vuelve a controlar.
  if(prev&&typeof HL!=='undefined'&&!HL.puedePrecios()&&Math.abs((parseFloat(fp.value)||0)-(prev.price||0))>0.004)return{err:'Solo el gerente o el administrador pueden cambiar precios'};
  if(prev){const t=tot(prev);if(t>0&&(prev.unidad||'u')!==u)return{err:'No se puede cambiar la forma de venta de un producto con stock: dejalo en 0 o creá otro producto'};if(t>0&&(prev.control||'')!==c)return{err:'No se puede cambiar el control de stock de un producto con stock: dejalo en 0 primero'};if(c!=='variantes'&&PX.hijos(prev).length)return{err:'Este producto tiene variantes: no se puede quitar la opción de variantes'}}
  return{d:{cat:$('#px_cat').value.trim().slice(0,60),unidad:u,control:c,reqVto:$('#px_vr').checked,minimo:mi,tramos:tr.v,garantia:ga,marca:$('#px_ma').value.trim().slice(0,60),modelo:$('#px_mo').value.trim().slice(0,60),plu,balde:bal}}};
// ---------- venta por peso o por número de serie ----------
PX.cerrar=()=>{const o=$('#pxm');if(o)o.remove()};
PX.ov=h=>{PX.cerrar();document.body.insertAdjacentHTML('beforeend',`<div class="ov" id="pxm" role="dialog" aria-modal="true"><div class="card">${h}</div></div>`);const o=$('#pxm');o.addEventListener('click',e=>{if(e.target.closest('[data-pxx]'))PX.cerrar()});o.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();PX.cerrar()}});return o};
PX.vigentes=p=>p.lots.filter(l=>l.qty>0&&(!l.exp||l.exp>=T()));
PX.elegir=(p,editar)=>{if(!p)return;const a=avail(p);if(a<=0&&!cart[p.id])return toast(p.name+': sin stock vendible');
  if(esPeso(p)){PX.ov(`<h3>${esc(p.name)}</h3><p class="mu" style="margin-top:0">${fmt(precioUnit(p))} por kg · disponible ${fq(p,a)}</p><div class="form"><div><label>Peso</label><input id="pxp" inputmode="decimal" placeholder="0,250" value="${editar&&cart[p.id]?String(cart[p.id]/1000).replace('.',','):''}"></div><div><label>En</label><select id="pxpu"><option value="kg">kg</option><option value="g">gramos</option></select></div><div><label>o Importe (${esc(MON)})</label><input id="pxi" inputmode="decimal" placeholder="4500" value="${editar&&cartImp[p.id]&&cartImp[p.id].g===cart[p.id]?PX.coma(cartImp[p.id].imp,2):''}"></div></div><div class="tot" id="pxpt">${fmt(0)}</div><div style="display:flex;gap:8px"><button class="btn" id="pxok" style="flex:1">Agregar (Enter)</button><button class="btn sec" data-pxx="1">Cancelar</button></div>`);
    const g=()=>{const v=String($('#pxp').value).trim().replace(',','.'),n=parseFloat(v);return isFinite(n)&&n>0?Math.round($('#pxpu').value==='g'?n:n*1000):0};
    // Dos formas de cargar: el peso (calcula el importe) o el importe (calcula los kg). Manda lo último que se escribió.
    let porImp=!!$('#pxi').value;const imp=()=>PX.num($('#pxi').value);
    const total=()=>porImp&&imp()>0?Math.round(imp()*100)/100:PX.impDeG(p,g()),vivo=()=>{$('#pxpt').textContent=fmt(total())};
    $('#pxp').oninput=$('#pxpu').onchange=()=>{porImp=false;const q=g();$('#pxi').value=q?PX.coma(PX.impDeG(p,q),2):'';vivo()};
    $('#pxi').oninput=()=>{porImp=true;const q=PX.gDesdeImporte(p,imp());$('#pxpu').value='kg';$('#pxp').value=q?PX.coma(q/1000,3):'';vivo()};
    vivo();
    const ok=()=>{let q=g();if(porImp){if(!(imp()>0))return toast('Escribí el importe con números (ej.: 4500)');q=PX.gDesdeImporte(p,imp());if(q<10)return toast('Ese importe da menos de 10 g: revisalo')}
      if(!(q>0))return toast('Ingresá el peso');if(q>a)return toast('No hay tanto stock: disponible '+fq(p,a));
      if(porImp)cartImp[p.id]={g:q,imp:Math.round(imp()*100)/100};else delete cartImp[p.id];cart[p.id]=q;PX.cerrar();drawCart();const s=$('#q');if(s)s.focus()};
    $('#pxok').onclick=ok;$('#pxp').onkeydown=$('#pxi').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();ok()}};$('#pxp').focus();return}
  if(esSerie(p)){const L=PX.vigentes(p),sel=new Set(cartSer[p.id]||[]);
    PX.ov(`<h3>${esc(p.name)}</h3><p class="mu" style="margin-top:0">Elegí o escaneá los números de serie que se venden${p.garantia?' · garantía de '+p.garantia+' meses':''}.</p><input id="pxs" placeholder="Escribí o escaneá el N.º de serie y Enter"><div id="pxl" style="max-height:40vh;overflow:auto;margin:8px 0">${L.map(l=>`<label class="opt"><input type="checkbox" data-sl="${l.id}" ${sel.has(l.id)?'checked':''}> ${esc(l.n)}${l.exp?' <span class="mu">· vto. '+fD(l.exp)+'</span>':''}</label>`).join('')||'<p class="mu">No hay unidades disponibles.</p>'}</div><div style="display:flex;gap:8px"><button class="btn" id="pxsok" style="flex:1">Listo</button><button class="btn sec" data-pxx="1">Cancelar</button></div>`);
    $('#pxs').onkeydown=e=>{if(e.key!=='Enter')return;e.preventDefault();e.stopPropagation();const v=e.target.value.trim().toUpperCase(),l=L.find(x=>String(x.n).trim().toUpperCase()===v);if(!l)return toast('Ese número de serie no está disponible en '+p.name);$(`#pxl [data-sl="${l.id}"]`).checked=true;e.target.value=''};
    $('#pxsok').onclick=()=>{const ids=$$('#pxl [data-sl]').filter(c=>c.checked).map(c=>+c.dataset.sl);if(ids.length){cartSer[p.id]=ids;cart[p.id]=ids.length}else{delete cartSer[p.id];delete cart[p.id]}PX.cerrar();drawCart()};$('#pxs').focus()}};
PX.serieOk=(p,ids,n)=>!!ids&&ids.length===n&&ids.every(id=>PX.vigentes(p).some(l=>l.id===id));
PX.sellSerie=(p,ids)=>{const used=[];(ids||[]).forEach(id=>{const l=p.lots.find(x=>x.id===id&&x.qty>0);if(l){l.qty=0;used.push({n:l.n,exp:l.exp,qty:1})}});p.lots=p.lots.filter(l=>l.qty>0);return used};
PX.agregarSerie=code=>{const k=String(code).trim().toUpperCase();if($('#pxl')){const c=$$('#pxl [data-sl]').find(x=>{const l=db.prods.flatMap(p=>p.lots).find(y=>y.id==x.dataset.sl);return l&&String(l.n).trim().toUpperCase()===k});if(c){c.checked=true;return true}toast('Ese número de serie no está disponible en este producto');return true}for(const p of db.prods){if(!esSerie(p))continue;const l=PX.vigentes(p).find(x=>String(x.n).trim().toUpperCase()===k);if(!l)continue;
    const s=cartSer[p.id]||[];if(s.includes(l.id)){toast('Ese número de serie ya está en la venta');return true}s.push(l.id);cartSer[p.id]=s;cart[p.id]=s.length;drawCart();toast(p.name+' · N.º '+l.n);return true}return false};
// ---------- variantes: elegir en Ventas, administrar en Inventario ----------
PX.atrs=()=>db.cfg.atributos&&db.cfg.atributos.length?db.cfg.atributos:['Talle','Color'];
PX.variante=pa=>{const H=PX.hijos(pa);PX.ov(`<h3>${esc(pa.name)}</h3><div class="wrap"><table><tbody>${H.map(h=>{const a=avail(h);return`<tr><td>${esc(Object.values(h.attrs||{}).join(' / ')||h.name)}</td><td class="mu">${a>0?'Disponible '+a:'Sin stock'}</td><td class="n">${fmt(precioUnit(h))}</td><td><button class="btn sec" data-pv="${h.id}" ${a>0?'':'disabled'}>Agregar</button></td></tr>`}).join('')||'<tr><td class="mu">Todavía no tiene variantes cargadas (Inventario > Variantes).</td></tr>'}</tbody></table></div><button class="btn sec" data-pxx="1" style="margin-top:8px">Cerrar</button>`);
  $('#pxm').onclick=e=>{const b=e.target.closest('[data-pv]');if(b){PX.cerrar();add(+b.dataset.pv)}};const f=$('#pxm [data-pv]:not([disabled])');if(f)f.focus()};
$('#i').insertAdjacentHTML('beforeend',`<div class="card hide" id="pxv"><div class="lh"><h3 id="pxvt"></h3><button class="btn sec" id="pxvc">Cerrar</button></div><div class="wrap"><table><thead><tr><th>Variante</th><th>Código</th><th class="n">Precio</th><th class="n">Stock</th><th></th></tr></thead><tbody id="pxvl"></tbody></table></div>
<h3 style="font-size:14px;margin-top:12px">Crear combinaciones</h3><p class="mu" style="margin-top:0">Escribí los valores separados por coma. Se crean solo las combinaciones que faltan; cada una tiene su propio código y stock.</p><div class="form" id="pxva"></div><button class="btn" id="pxvg">Crear variantes</button></div>
<div class="card"><h3>Consultar garantía</h3><div class="form"><div><label>N.º de serie</label><input id="pxg" placeholder="Escaneá o escribí el número"></div><div><button class="btn sec" id="pxgb">Consultar</button></div></div><div id="pxgr"></div></div>`);
let pxPadre=null;
PX.drawVar=()=>{const pa=db.prods.find(x=>x.id===pxPadre);$('#pxv').classList.toggle('hide',!pa);if(!pa)return;$('#pxvt').textContent='Variantes de '+pa.name;
  $('#pxvl').innerHTML=PX.hijos(pa).map(h=>`<tr><td>${esc(Object.entries(h.attrs||{}).map(([k,v])=>k+': '+v).join(' · '))}</td><td>${esc(h.code||'-')}</td><td class="n">${fmt(h.price)}</td><td class="n">${tot(h)}</td><td><button class="btn sec" data-vl="${h.id}">Lotes</button> <button class="btn sec" data-ve="${h.id}">Editar</button></td></tr>`).join('')||'<tr><td colspan="5" class="mu">Sin variantes todavía.</td></tr>';
  if(!$('#pxva').children.length||$('#pxva').dataset.k!==PX.atrs().join('|')){$('#pxva').dataset.k=PX.atrs().join('|');$('#pxva').innerHTML=PX.atrs().map((a,i)=>`<div><label>${esc(a)}</label><input data-va="${i}" placeholder="${i===0?'S, M, L':'Negra, Blanca'}"></div>`).join('')}};
PX.crearVar=(pa,valores)=>{const A=PX.atrs(),listas=A.map((a,i)=>[...new Set((valores[i]||'').split(',').map(x=>x.trim()).filter(Boolean))]);if(listas.some(l=>!l.length))return{err:'Completá al menos un valor para '+A.filter((a,i)=>!listas[i].length).join(' y ')};
  let combos=[[]];listas.forEach(l=>{combos=combos.flatMap(c=>l.map(v=>[...c,v]))});if(combos.length>200)return{err:'Son demasiadas combinaciones de una vez (máximo 200)'};
  const k=o=>A.map(a=>String(o[a]||'').trim().toLowerCase()).join('|'),ya=new Set(PX.hijos(pa).map(h=>k(h.attrs||{})));let n=0;
  combos.forEach(c=>{const attrs=Object.fromEntries(A.map((a,i)=>[a,c[i]]));if(ya.has(k(attrs)))return;ya.add(k(attrs));db.prods.push({id:db.nid++,name:pa.name+' · '+c.join(' / '),code:'',price:pa.price,cost:pa.cost||0,min:0,padre:pa.id,attrs,lots:[],...(pa.cat?{cat:pa.cat}:{})});n++});return{n}};
$('#pxv').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='pxvc'){pxPadre=null;PX.drawVar();return}
  if(b.id==='pxvg'){if(!can('productos','crear'))return toast('Tu usuario no tiene permiso para esto');const pa=db.prods.find(x=>x.id===pxPadre),r=PX.crearVar(pa,$$('#pxva [data-va]').map(i=>i.value));if(r.err)return toast(r.err);$$('#pxva [data-va]').forEach(i=>i.value='');save();draw();toast(r.n?r.n+(r.n===1?' variante creada':' variantes creadas'):'Esas combinaciones ya existían');return}
  if(b.dataset.vl){lotP=+b.dataset.vl;drawLots();$('#lots').scrollIntoView({behavior:'smooth'})}if(b.dataset.ve){pick(db.prods.find(x=>x.id==b.dataset.ve),true);$('nav button[data-t="p"]').click()}};
// En Inventario, "Lotes" de un producto con variantes abre sus variantes; no se borra un principal que tiene variantes.
$('#inv').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const p=db.prods.find(x=>x.id==(b.dataset.l||b.dataset.d));if(!p||!esPadre(p))return;
  if(b.dataset.l){e.stopImmediatePropagation();pxPadre=p.id;PX.drawVar();$('#pxv').scrollIntoView({behavior:'smooth'})}else if(b.dataset.d&&PX.hijos(p).length){e.stopImmediatePropagation();toast('Primero eliminá sus variantes')}},true);
// Garantía de una unidad vendida
PX.garantia=n=>{const k=String(n||'').trim().toUpperCase();if(!k)return null;for(const s of db.sales.slice().reverse())for(const i of s.items)if((i.series||[]).some(x=>String(x).toUpperCase()===k))return{s,i};return null};
$('#pxgb').onclick=()=>{const r=PX.garantia($('#pxg').value),o=$('#pxgr');if(!r){const p=db.prods.find(p=>esSerie(p)&&p.lots.some(l=>String(l.n).toUpperCase()===$('#pxg').value.trim().toUpperCase()));o.innerHTML=`<p class="mu">${p?'Ese número está en stock (todavía no se vendió): '+esc(p.name):'No se encontró una venta con ese número de serie.'}</p>`;return}
  const{s,i}=r,vig=i.garantiaHasta&&i.garantiaHasta>=T();o.innerHTML=`<div class="tip"><b>${esc(i.name)}</b> · N.º ${esc($('#pxg').value.trim())}<br>Vendido el ${new Date(s.date).toLocaleDateString('es-AR')} · venta N.º ${String(s.id).padStart(6,'0')}${s.cname?' · '+esc(s.cname):''}${s.void?' · <b>venta anulada</b>':''}<br>${i.garantiaHasta?`Garantía hasta ${fD(i.garantiaHasta)} <span class="tag ${vig?'':'out'}">${vig?'Vigente':'Vencida'}</span>`:'Sin garantía registrada'}</div>`};
$('#pxg').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#pxgb').click()}};
MODS.push(()=>{PX.vis();PX.drawVar()});
