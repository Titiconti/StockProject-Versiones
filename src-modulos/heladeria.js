// ===== Heladería (v5.7.0): gustos por balde, tamaños de precio fijo y vendedor en cada venta =====
// Modelo (todo opcional; un negocio que no es heladería no cambia):
//   gusto  = producto por peso (stock en gramos) con `balde` (kg por balde lleno). Los baldes son solo la forma de verlo y cargarlo.
//   tamaño = producto `tipo:'armado'` con `receta:{g,gustos}` (gramos totales y máximo de gustos) y precio fijo, sin stock propio.
//   venta  = `items[].gustos:[{id,n,g,lots}]` (lo descontado de cada gusto, para devolverlo exacto al anular), `items[].sel` (gustos por unidad)
//            y `vend:{id,nombre}` (quién vendió). `user` pasa a ser el vendedor y `cajero` queda con quien tenía la sesión.
// Configuración: db.cfg.hel = { balde (kg por defecto), vend:[{id,nombre}], vid }.
const HL={};
HL.on=()=>PX.on('heladeria');
HL.cfg=()=>db.cfg.hel||{};
HL.baldeKg=p=>p.balde>0?p.balde:(HL.cfg().balde||5);
HL.esGusto=p=>!!p&&p.unidad==='kg'&&p.balde>0;
HL.gustos=()=>db.prods.filter(HL.esGusto);
HL.armados=()=>db.prods.filter(p=>p.tipo==='armado');
// Solo administrador y gerente cambian precios (lo vuelve a controlar el proceso principal en usuarios.js).
HL.puedePrecios=()=>!AU.habilitado||!HL.on()||(['admin','gerente'].includes((AU.usuario||{}).rol)&&can('productos','editar'));
HL.puedeStock=()=>can('productos','editar');
HL.baldes=p=>avail(p)/1000/HL.baldeKg(p);
// Se muestra redondeado al medio balde (0,5 · 1 · 1,5); los gramos reales siguen guardados.
HL.fmtB=b=>{const r=Math.round(b*2)/2;return r===0&&b>0?'menos de 0,5':PX.coma(r,1)};
// Cuántos tamaños se podrían armar todavía con los gustos que hay (el control exacto se hace al cobrar).
HL.disp=p=>{const g=(p.receta||{}).g||0;return g?Math.min(9999,Math.floor(HL.gustos().reduce((a,x)=>a+avail(x),0)/g)):0};
// Reparte g gramos entre n gustos en gramos enteros; lo que sobra va al primero.
HL.reparto=(g,n)=>{const b=Math.floor(g/n);return Array.from({length:n},(_,i)=>i?b:g-b*(n-1))};
// Gramos que necesita cada gusto para todo lo que hay en el carrito.
HL.necesidad=()=>{const m={};Object.keys(cartGus).forEach(id=>{const p=db.prods.find(x=>x.id==id);if(!p||!p.receta)return;(cartGus[id]||[]).forEach(u=>HL.reparto(p.receta.g,u.length).forEach((g,i)=>{m[u[i]]=(m[u[i]]||0)+g}))});return m};
HL.faltante=()=>{const m=HL.necesidad();for(const gid in m){const gp=db.prods.find(x=>x.id==gid),a=gp?avail(gp):0;if(m[gid]>a)return(gp?gp.name:'Un gusto')+': no alcanza ('+a+' g disponibles, hacen falta '+m[gid]+' g)'}return''};
// Vendedor: el último que se tocó queda preseleccionado (en este equipo) pero siempre a la vista.
HL.vend=()=>HL.cfg().vend||[];
HL.K='sp_hl_vend';
HL.actual=()=>{let id=HL._v;if(id==null){try{id=+localStorage.getItem(HL.K)||0}catch(e){id=0}}return HL.vend().find(v=>v.id===id)||null};
HL.elegirV=id=>{HL._v=id;try{localStorage.setItem(HL.K,String(id))}catch(e){}};
HL.marcar=sale=>{if(!HL.on())return;const v=HL.actual();if(!v)return;sale.vend={id:v.id,nombre:v.nombre};sale.cajero=sale.user;sale.user=v.nombre};
// Antes de cobrar: vendedor elegido, gustos de cada tamaño y gramos suficientes. Devuelve el motivo o ''.
HL.antes=()=>{if(!HL.on())return'';if(HL.vend().length&&!HL.actual())return'Tocá quién vende antes de cobrar';
  for(const id of Object.keys(cart)){const p=db.prods.find(x=>x.id==id);if(!p||p.tipo!=='armado')continue;const s=cartGus[id]||[];if(s.length!==cart[id]||s.some(u=>!u.length))return p.name+': elegí los gustos de cada uno';if(!(p.price>0))return p.name+': falta el precio (lo carga el gerente)'}
  return HL.faltante()};
// Descuenta los gramos de cada gusto (FIFO por lote) y devuelve lo descontado, agrupado por gusto.
HL.vender=(p,sel)=>{const por={};(sel||[]).forEach(u=>HL.reparto(p.receta.g,u.length).forEach((g,i)=>{const gp=db.prods.find(x=>x.id==u[i]);if(!gp)return;const o=por[gp.id]=por[gp.id]||{id:gp.id,n:gp.name,g:0,lots:[]};o.g+=g;
  sell(gp,g).forEach(l=>{const k=o.lots.find(y=>y.n===l.n&&y.exp===l.exp);if(k)k.qty+=l.qty;else o.lots.push(l)})}));return Object.values(por)};
HL.devolver=i=>(i.gustos||[]).forEach(x=>{const gp=db.prods.find(p=>p.id===x.id);if(gp)restore(gp,x.lots,x.g)});
HL.det=id=>{const s=cartGus[id]||[];return s.length?' · '+s.map(u=>u.map(g=>esc((db.prods.find(x=>x.id==g)||{}).name||'?')).join(' + ')).join(' | '):''};
// Ventas por vendedor desde un día (AAAA-MM-DD). Las anuladas no cuentan; las de antes de la heladería van a "Sin vendedor".
HL.porVendedor=desde=>{const m={};db.sales.filter(s=>!s.void&&UT.dk(s.date)>=desde).forEach(s=>{const k=s.vend?s.vend.nombre:'Sin vendedor',o=m[k]=m[k]||{nombre:k,n:0,total:0};o.n++;o.total=UT.r2(o.total+s.total)});return Object.values(m).sort((a,b)=>b.total-a.total)};

// ---------- Altas: gustos, baldes y tamaños ----------
HL.nuevoGusto=(nombre,kgBalde,baldes)=>{nombre=String(nombre||'').trim().slice(0,60);if(!nombre)return{err:'Escribí el nombre del gusto'};if(db.prods.some(p=>norm(p.name)===norm(nombre)))return{err:'Ese nombre ya existe'};
  const kg=kgBalde===''||kgBalde==null?HL.baldeKg({}):PX.num(kgBalde),n=baldes===''||baldes==null?0:PX.num(baldes);if(!(kg>0&&kg<=100))return{err:'Los kg por balde van de 0 a 100'};if(!(n>=0))return{err:'Cantidad de baldes inválida'};
  const p={id:db.nid++,name:nombre,code:'',price:0,cost:0,min:0,unidad:'kg',balde:kg,cat:'Helado',lots:[]};db.prods.push(p);if(n>0)HL.cargar(p.id,n);else save();return{ok:true,p}};
HL.cargar=(id,n)=>{const p=db.prods.find(x=>x.id===id),g=p&&Math.round(n*HL.baldeKg(p)*1000);if(!p||!(g>0))return{err:'Cargá una cantidad de baldes mayor a 0'};addLot(p,'Baldes',g,'');ajuste({tipo:'stock.ingreso',pid:p.id,txt:p.name+': +'+PX.coma(n,2)+' balde(s)'});save();return{ok:true}};
// Ajuste manual ("queda medio balde"): deja el stock en `baldes` baldes y anota la diferencia.
HL.ajustar=(id,baldes)=>{const p=db.prods.find(x=>x.id===id),b=PX.num(baldes);if(!p)return{err:'Gusto inexistente'};if(!(b>=0))return{err:'Escribí cuántos baldes quedan (ej.: 0,5)'};
  const meta=Math.round(b*HL.baldeKg(p)*1000),dif=meta-tot(p);if(!dif)return{ok:true};
  if(dif>0)addLot(p,'Ajuste',dif,'');else{let n=-dif;p.lots.slice().sort((x,y)=>(x.exp||'9')>(y.exp||'9')?1:-1).forEach(l=>{const u=Math.min(l.qty,n);l.qty-=u;n-=u});p.lots=p.lots.filter(l=>l.qty>0)}
  ajuste({tipo:'stock.ajuste',pid:p.id,txt:p.name+': ajuste a '+PX.coma(b,2)+' balde(s) ('+(dif>0?'+':'')+dif+' g)'});save();return{ok:true,dif}};
HL.nuevoTamano=(nombre,g,gustos,precio)=>{nombre=String(nombre||'').trim().slice(0,60);g=PX.num(g);gustos=PX.num(gustos);precio=precio===''||precio==null?0:PX.num(precio);
  if(!nombre)return{err:'Escribí el nombre del tamaño'};if(db.prods.some(p=>norm(p.name)===norm(nombre)))return{err:'Ese nombre ya existe'};if(!(Number.isInteger(g)&&g>=1&&g<=20000))return{err:'Los gramos son un número entero (1 a 20000)'};
  if(!(Number.isInteger(gustos)&&gustos>=1&&gustos<=12))return{err:'El máximo de gustos va de 1 a 12'};if(!(precio>=0))return{err:'Precio inválido'};
  const p={id:db.nid++,name:nombre,code:'',price:precio,cost:0,min:0,tipo:'armado',receta:{g,gustos},cat:'Tamaños',lots:[]};db.prods.push(p);save();return{ok:true,p}};
// Valores de ejemplo (sin precio: lo carga el gerente). No pisa los que ya existen.
HL.EJ=[['Cucurucho',150,2],['1/4 kg',250,3],['1/2 kg',500,4],['1 kg',1000,4]];
HL.ejemplos=()=>{let n=0;HL.EJ.forEach(([a,g,k])=>{if(!db.prods.some(p=>norm(p.name)===norm(a))&&HL.nuevoTamano(a,g,k,0).ok)n++});return n};
HL.guardarVend=txt=>{const nombres=[...new Set(String(txt||'').split(/[,;\n]+/).map(x=>x.trim().slice(0,40)).filter(Boolean))].slice(0,12),h=db.cfg.hel=db.cfg.hel||{},ant=h.vend||[];h.vid=h.vid||1;
  h.vend=nombres.map(nombre=>ant.find(v=>norm(v.nombre)===norm(nombre))||{id:h.vid++,nombre});save();return{ok:true,vend:h.vend}};

// ---------- Elegir los gustos de un tamaño (Ventas) ----------
document.head.insertAdjacentHTML('beforeend','<style>.hlg{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin:8px 0;max-height:50vh;overflow:auto}.hlg .btn{padding:14px 8px;text-align:center}.hlg .btn.on,.hlv.on{background:var(--ac);color:var(--act)}#hlbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px}.hlv{font-size:18px;padding:14px 22px;min-width:110px}.hlv.sec{background:var(--bg);color:var(--tx);border:1px solid var(--bd)}</style>');
HL.elegir=p=>{if(!(p.price>0))return toast(p.name+': falta el precio (lo carga el gerente)');const max=p.receta.gustos,L=HL.gustos().filter(x=>avail(x)>0),sel=new Set(),nom=id=>(db.prods.find(x=>x.id===id)||{}).name;
  PX.ov(`<h3>${esc(p.name)}</h3><p class="mu" style="margin-top:0">Elegí hasta ${max} gusto${max>1?'s':''} · ${p.receta.g} g repartidos en partes iguales</p><div id="hlg" class="hlg">${L.map(x=>`<button class="btn sec" data-hg="${x.id}">${esc(x.name)}<br><small>${HL.fmtB(HL.baldes(x))} baldes</small></button>`).join('')||'<p class="mu">No hay gustos con stock.</p>'}</div><p class="mu" id="hlgs" style="min-height:1.4em"></p><div style="display:flex;gap:8px"><button class="btn" id="hlok" style="flex:1">Agregar</button><button class="btn sec" data-pxx="1">Cancelar</button></div>`);
  const pint=()=>{$$('#hlg [data-hg]').forEach(b=>b.classList.toggle('on',sel.has(+b.dataset.hg)));$('#hlgs').textContent=sel.size?sel.size+' de '+max+': '+[...sel].map((id,i)=>nom(id)+' '+HL.reparto(p.receta.g,sel.size)[i]+' g').join(' · '):''};
  $('#hlg').onclick=e=>{const b=e.target.closest('[data-hg]');if(!b)return;const id=+b.dataset.hg;if(sel.has(id))sel.delete(id);else if(sel.size>=max)return toast('Máximo '+max+' gustos');else sel.add(id);pint()};
  $('#hlok').onclick=()=>{if(!sel.size)return toast('Elegí al menos un gusto');const a=cartGus[p.id],c=cart[p.id];cartGus[p.id]=[...(a||[]),[...sel]];cart[p.id]=cartGus[p.id].length;
    const f=HL.faltante();if(f){if(a)cartGus[p.id]=a;else delete cartGus[p.id];if(c)cart[p.id]=c;else delete cart[p.id];return toast(f)}PX.cerrar();drawCart()}};

// ---------- Barra del vendedor (Ventas) ----------
$('#v').insertAdjacentHTML('afterbegin','<div class="card hide" id="hlbar"></div>');
HL.drawBar=()=>{const b=$('#hlbar');if(!b)return;const on=HL.on();b.classList.toggle('hide',!on);if(!on)return;const V=HL.vend(),a=HL.actual();
  b.innerHTML=V.length?`<b>Vende:</b> ${V.map(v=>`<button class="btn hlv ${a&&a.id===v.id?'on':'sec'}" data-hv="${v.id}" aria-pressed="${!!(a&&a.id===v.id)}">${esc(v.nombre)}</button>`).join('')}`:'<span class="mu">Cargá los empleados del turno en Heladería para elegir quién vende en cada venta.</span>'};
$('#hlbar').onclick=e=>{const b=e.target.closest('[data-hv]');if(!b)return;HL.elegirV(+b.dataset.hv);HL.drawBar()};

// ---------- Pantalla Heladería (Más) ----------
$('main').insertAdjacentHTML('beforeend',`<section id="hl" class="hide"><div class="card"><div class="lh"><h3>Gustos y baldes</h3></div><p class="mu" style="margin-top:0">El stock se ve en baldes (se redondea al medio balde) y se guarda en gramos. Un balde lleno pesa los kg que indiques en cada gusto.</p>
<div class="form"><div><label>Nombre del gusto</label><input id="hl_gn" placeholder="Ej.: Dulce de leche"></div><div><label>Kg por balde</label><input id="hl_gk" inputmode="decimal" placeholder="5"></div><div><label>Baldes iniciales</label><input id="hl_gb" inputmode="decimal" placeholder="0"></div><div><button class="btn" id="hl_ga">Agregar gusto</button></div></div>
<div class="wrap"><table><thead><tr><th>Gusto</th><th class="n">Baldes</th><th class="n">Kg</th><th class="n">Kg por balde</th><th>Cargar / ajustar</th></tr></thead><tbody id="hl_gl"></tbody></table></div></div>
<div class="card"><div class="lh"><h3>Tamaños de precio fijo</h3><button class="btn sec" id="hl_ej">Cargar tamaños de ejemplo</button></div><p class="mu" style="margin-top:0">Cada tamaño descuenta sus gramos de los gustos que se elijan al vender. Solo el gerente o el administrador cambian gramos, gustos y precios.</p>
<div class="form"><div><label>Nombre</label><input id="hl_tn" placeholder="Ej.: 1/2 kg"></div><div><label>Gramos</label><input id="hl_tg" inputmode="numeric" placeholder="500"></div><div><label>Máximo de gustos</label><input id="hl_tm" inputmode="numeric" placeholder="4"></div><div><label>Precio</label><input id="hl_tp" inputmode="decimal" placeholder="0"></div><div><button class="btn" id="hl_ta">Agregar tamaño</button></div></div>
<div class="wrap"><table><thead><tr><th>Tamaño</th><th class="n">Gramos</th><th class="n">Máx. gustos</th><th class="n">Precio</th></tr></thead><tbody id="hl_tl"></tbody></table></div></div>
<div class="card"><h3>Empleados del turno</h3><p class="mu" style="margin-top:0">Separados por coma. En Ventas aparecen como botones grandes: se toca quién vende y queda registrado en cada venta.</p><div class="form"><div style="grid-column:span 2"><input id="hl_vs" placeholder="Ana, Luis, Marta"></div><div><button class="btn" id="hl_vg">Guardar empleados</button></div></div></div>
<div class="card"><div class="lh"><h3>Ventas por vendedor</h3><select id="hl_vp" style="width:auto"><option value="0">Hoy</option><option value="6">Últimos 7 días</option><option value="29">Últimos 30 días</option></select></div><div class="wrap"><table><thead><tr><th>Vendedor</th><th class="n">Ventas</th><th class="n">Total</th></tr></thead><tbody id="hl_vl"></tbody></table></div></div></section>`);
$('#masmenu').insertAdjacentHTML('beforeend','<button data-t="hl">Heladería</button>');
{const b=$('#masmenu button[data-t="hl"]');b.onclick=()=>{$$('nav button').forEach(x=>x.classList.toggle('on',x===b));$$('nav button').map(x=>x.dataset.t).forEach(s=>$('#'+s)&&$('#'+s).classList.toggle('hide',s!=='hl'));$('#masmenu').classList.add('hide');masRefresh();draw()}}
MODT.hl='inventario';if(typeof CF!=='undefined'&&CF.NAVN)CF.NAVN.hl='Heladería';
{const r0=relevante;relevante=t=>t==='hl'?HL.on():r0(t)}
HL.drawPant=()=>{if($('#hl').classList.contains('hide'))return;const pp=HL.puedePrecios(),ps=HL.puedeStock();
  $('#hl_gl').innerHTML=HL.gustos().map(p=>`<tr><td><b>${esc(p.name)}</b></td><td class="n">${HL.fmtB(HL.baldes(p))}</td><td class="n">${PX.coma(avail(p)/1000,3)}</td><td class="n">${PX.coma(HL.baldeKg(p),3)}</td><td><button class="btn sec" data-hm="${p.id}" ${ps?'':'disabled'}>+ 1 balde</button> <input data-hq="${p.id}" inputmode="decimal" placeholder="Queda (baldes)" style="width:130px" ${ps?'':'disabled'}> <button class="btn sec" data-ha="${p.id}" ${ps?'':'disabled'}>Ajustar</button></td></tr>`).join('')||'<tr><td colspan="5" class="mu">Todavía no cargaste gustos.</td></tr>';
  $('#hl_tl').innerHTML=HL.armados().map(p=>`<tr><td><b>${esc(p.name)}</b></td><td class="n"><input data-tg="${p.id}" value="${p.receta.g}" inputmode="numeric" style="width:90px" ${pp?'':'disabled'}></td><td class="n"><input data-tm="${p.id}" value="${p.receta.gustos}" inputmode="numeric" style="width:70px" ${pp?'':'disabled'}></td><td class="n"><input data-tp="${p.id}" value="${p.price?PX.coma(p.price,2):''}" placeholder="Sin precio" inputmode="decimal" style="width:110px" ${pp?'':'disabled'}></td></tr>`).join('')||'<tr><td colspan="4" class="mu">Todavía no hay tamaños: cargá los de ejemplo o agregá el tuyo.</td></tr>';
  $('#hl_ej').disabled=!pp;$('#hl_ta').disabled=!pp;if(document.activeElement!==$('#hl_vs'))$('#hl_vs').value=HL.vend().map(v=>v.nombre).join(', ');
  $('#hl_vl').innerHTML=HL.porVendedor(UT.add(UT.hoy(),-(+$('#hl_vp').value))).map(o=>`<tr><td>${esc(o.nombre)}</td><td class="n">${o.n}</td><td class="n">${fmt(o.total)}</td></tr>`).join('')||'<tr><td colspan="3" class="mu">Sin ventas en el período.</td></tr>'};
{const sin=()=>toast('Tu usuario no tiene permiso para esto'),fin=(r,m)=>{if(r.err)return toast(r.err);draw();if(m)toast(m)};
  $('#hl_ga').onclick=()=>{if(!can('productos','crear'))return sin();const r=HL.nuevoGusto($('#hl_gn').value,$('#hl_gk').value,$('#hl_gb').value);if(!r.err)['#hl_gn','#hl_gk','#hl_gb'].forEach(s=>$(s).value='');fin(r,'Gusto agregado')};
  $('#hl_ta').onclick=()=>{if(!HL.puedePrecios())return sin();const r=HL.nuevoTamano($('#hl_tn').value,$('#hl_tg').value,$('#hl_tm').value,$('#hl_tp').value);if(!r.err)['#hl_tn','#hl_tg','#hl_tm','#hl_tp'].forEach(s=>$(s).value='');fin(r,'Tamaño agregado')};
  $('#hl_ej').onclick=()=>{if(!HL.puedePrecios())return sin();const n=HL.ejemplos();fin({},n?n+' tamaños cargados: completá el precio de cada uno':'Los tamaños de ejemplo ya estaban')};
  $('#hl_vg').onclick=()=>{if(!HL.puedeStock())return sin();HL.guardarVend($('#hl_vs').value);fin({},'Empleados guardados')};
  $('#hl_vp').onchange=HL.drawPant;
  $('#hl_gl').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(!HL.puedeStock())return sin();if(b.dataset.hm)fin(HL.cargar(+b.dataset.hm,1),'Balde cargado');else if(b.dataset.ha){const i=$(`#hl_gl [data-hq="${b.dataset.ha}"]`);fin(HL.ajustar(+b.dataset.ha,i.value),'Stock ajustado')}};
  // Cambios en la tabla de tamaños (gramos, gustos, precio): se guardan al salir del campo.
  $('#hl_tl').onchange=e=>{const i=e.target,id=+(i.dataset.tg||i.dataset.tm||i.dataset.tp),p=db.prods.find(x=>x.id===id);if(!p)return;if(!HL.puedePrecios()){draw();return sin()}
    const v=PX.num(i.value);if(i.dataset.tp){if(i.value.trim()===''||!(v>=0)){draw();return toast('Precio inválido')}if(Math.abs(v-p.price)>0.004){ajuste({tipo:'producto.precio',pid:p.id,txt:p.name+': precio '+fmt(p.price)+' → '+fmt(v)});p.price=v}}
    else{const k=i.dataset.tg?'g':'gustos',max=k==='g'?20000:12;if(!(Number.isInteger(v)&&v>=1&&v<=max)){draw();return toast(k==='g'?'Los gramos son un número entero (1 a 20000)':'El máximo de gustos va de 1 a 12')}p.receta={...p.receta,[k]:v}}
    save();draw()}}
MODS.push(()=>{HL.drawBar();HL.drawPant()});
