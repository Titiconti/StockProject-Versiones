// ===== Heladería (v5.7.0): control de baldes aparte, tamaños de precio fijo =====
// Modelo (todo opcional; un negocio que no es heladería no cambia):
//   tamaño = producto `tipo:'tamano'` (cucurucho, 1/4, 1/2, 1 kg…) de precio fijo y sin stock propio: se vende como cualquier producto.
//   gusto  = producto por peso (stock en gramos) con `balde` (kg por balde lleno). NO se toca con las ventas: solo se carga cuánto queda
//            y qué baldes entran en la pantalla Heladería (sirve para ver qué hay que pedir). Cada carga queda en `db.baldes` (quién y cuándo).
// Configuración: db.cfg.hel = { balde (kg por defecto), pedir (baldes) }. Las ventas usan user y la caja del empleado, como en el resto del sistema.
const HL={};
HL.on=()=>PX.on('heladeria');
HL.cfg=()=>db.cfg.hel||{};
HL.baldeKg=p=>p.balde>0?p.balde:(HL.cfg().balde||5);
HL.esGusto=p=>!!p&&p.unidad==='kg'&&p.balde>0;
HL.gustos=()=>db.prods.filter(HL.esGusto);
HL.tamanos=()=>db.prods.filter(p=>p.tipo==='tamano');
// Solo administrador y gerente cambian precios (lo vuelve a controlar el proceso principal en usuarios.js).
HL.puedePrecios=()=>!AU.habilitado||!HL.on()||(['admin','gerente'].includes((AU.usuario||{}).rol)&&can('productos','editar'));
HL.puedeStock=()=>can('productos','editar');
HL.baldes=p=>tot(p)/1000/HL.baldeKg(p);
// Se muestra redondeado al medio balde (0,5 · 1 · 1,5); los gramos reales siguen guardados.
HL.fmtB=b=>{const r=Math.round(b*2)/2;return r===0&&b>0?'menos de 0,5':PX.coma(r,1)};
HL.pedir=p=>HL.baldes(p)<(HL.cfg().pedir||1);
// Antes de cobrar: los tamaños necesitan precio. Devuelve el motivo o ''.
HL.antes=()=>{if(!HL.on())return'';
  for(const id of Object.keys(cart)){const p=db.prods.find(x=>x.id==id);if(p&&p.tipo==='tamano'&&!(p.price>0))return p.name+': falta el precio (lo carga el gerente)'}return''};
// ---------- Baldes: gustos, ingresos, ajustes e historial ----------
HL.log=(p,t,baldes,g)=>{db.baldes=db.baldes||[];db.bid=db.bid||1;db.baldes.push({id:db.bid++,date:new Date().toISOString(),user:quien(),gid:p.id,gusto:p.name,t,baldes,g});if(db.baldes.length>5000)db.baldes.splice(0,db.baldes.length-5000)};
HL.nuevoGusto=(nombre,kgBalde,baldes)=>{nombre=String(nombre||'').trim().slice(0,60);if(!nombre)return{err:'Escribí el nombre del gusto'};if(db.prods.some(p=>norm(p.name)===norm(nombre)))return{err:'Ese nombre ya existe'};
  const kg=kgBalde===''||kgBalde==null?HL.baldeKg({}):PX.num(kgBalde),n=baldes===''||baldes==null?0:PX.num(baldes);if(!(kg>0&&kg<=100))return{err:'Los kg por balde van de 0 a 100'};if(!(n>=0))return{err:'Cantidad de baldes inválida'};
  const p={id:db.nid++,name:nombre,code:'',price:0,cost:0,min:0,unidad:'kg',balde:kg,cat:'Helado',lots:[]};db.prods.push(p);if(n>0)HL.cargar(p.id,n);else save();return{ok:true,p}};
// Entran n baldes nuevos.
HL.cargar=(id,n)=>{const p=db.prods.find(x=>x.id===id),g=p&&Math.round(n*HL.baldeKg(p)*1000);if(!p||!(g>0))return{err:'Cargá una cantidad de baldes mayor a 0'};addLot(p,'Baldes',g,'');HL.log(p,'ingreso',n,g);ajuste({tipo:'stock.ingreso',pid:p.id,txt:p.name+': +'+PX.coma(n,2)+' balde(s)'});save();return{ok:true}};
// Ajuste manual ("queda medio balde"): deja el stock en `baldes` baldes y anota la diferencia.
HL.ajustar=(id,baldes)=>{const p=db.prods.find(x=>x.id===id),b=PX.num(baldes);if(!p)return{err:'Gusto inexistente'};if(!(b>=0))return{err:'Escribí cuántos baldes quedan (ej.: 0,5)'};
  const meta=Math.round(b*HL.baldeKg(p)*1000),dif=meta-tot(p);if(!dif)return{ok:true};
  if(dif>0)addLot(p,'Ajuste',dif,'');else{let n=-dif;p.lots.slice().sort((x,y)=>(x.exp||'9')>(y.exp||'9')?1:-1).forEach(l=>{const u=Math.min(l.qty,n);l.qty-=u;n-=u});p.lots=p.lots.filter(l=>l.qty>0)}
  HL.log(p,'ajuste',b,dif);ajuste({tipo:'stock.ajuste',pid:p.id,txt:p.name+': ajuste a '+PX.coma(b,2)+' balde(s) ('+(dif>0?'+':'')+dif+' g)'});save();return{ok:true,dif}};

// ---------- Tamaños de precio fijo ----------
HL.nuevoTamano=(nombre,precio)=>{nombre=String(nombre||'').trim().slice(0,60);precio=precio===''||precio==null?0:PX.num(precio);
  if(!nombre)return{err:'Escribí el nombre del tamaño'};if(db.prods.some(p=>norm(p.name)===norm(nombre)))return{err:'Ese nombre ya existe'};if(!(precio>=0))return{err:'Precio inválido'};
  const p={id:db.nid++,name:nombre,code:'',price:precio,cost:0,min:0,tipo:'tamano',cat:'Tamaños',lots:[]};db.prods.push(p);save();return{ok:true,p}};
// Nombres de ejemplo (sin precio: lo carga el gerente). No pisa los que ya existen.
HL.EJ=['Cucurucho','1/4 kg','1/2 kg','1 kg'];
HL.ejemplos=()=>{let n=0;HL.EJ.forEach(a=>{if(!db.prods.some(p=>norm(p.name)===norm(a))&&HL.nuevoTamano(a,0).ok)n++});return n};

// ---------- Pantalla Heladería (Más) ----------
$('main').insertAdjacentHTML('beforeend',`<section id="hl" class="hide"><div class="card"><div class="lh"><h3>Baldes</h3></div><p class="mu" style="margin-top:0">Control aparte de las ventas: cuánto queda de cada gusto y qué baldes entran. Se ve en baldes (redondeado al medio balde) y se guarda en gramos. Un balde lleno pesa los kg que indiques en cada gusto.</p>
<div class="form"><div><label>Nombre del gusto</label><input id="hl_gn" placeholder="Ej.: Dulce de leche"></div><div><label>Kg por balde</label><input id="hl_gk" inputmode="decimal" placeholder="5"></div><div><label>Baldes iniciales</label><input id="hl_gb" inputmode="decimal" placeholder="0"></div><div><button class="btn" id="hl_ga">Agregar gusto</button></div></div>
<div class="wrap"><table><thead><tr><th>Gusto</th><th class="n">Baldes</th><th class="n">Kg</th><th class="n">Kg por balde</th><th>Entró un balde / queda</th></tr></thead><tbody id="hl_gl"></tbody></table></div></div>
<div class="card"><h3>Historial de baldes</h3><div class="wrap"><table><thead><tr><th>Cuándo</th><th>Quién</th><th>Gusto</th><th>Movimiento</th></tr></thead><tbody id="hl_hl"></tbody></table></div></div>
<div class="card"><div class="lh"><h3>Tamaños de precio fijo</h3><button class="btn sec" id="hl_ej">Cargar tamaños de ejemplo</button></div><p class="mu" style="margin-top:0">Se venden como cualquier producto (cucurucho, 1/4, 1/2, 1 kg…). Solo el gerente o el administrador cambian precios.</p>
<div class="form"><div><label>Nombre</label><input id="hl_tn" placeholder="Ej.: 1/2 kg"></div><div><label>Precio</label><input id="hl_tp" inputmode="decimal" placeholder="0"></div><div><button class="btn" id="hl_ta">Agregar tamaño</button></div></div>
<div class="wrap"><table><thead><tr><th>Tamaño</th><th class="n">Precio</th></tr></thead><tbody id="hl_tl"></tbody></table></div></div></section>`);
$('#masmenu').insertAdjacentHTML('beforeend','<button data-t="hl">Heladería</button>');
{const b=$('#masmenu button[data-t="hl"]');b.onclick=()=>{$$('nav button').forEach(x=>x.classList.toggle('on',x===b));$$('nav button').map(x=>x.dataset.t).forEach(s=>$('#'+s)&&$('#'+s).classList.toggle('hide',s!=='hl'));$('#masmenu').classList.add('hide');masRefresh();draw()}}
MODT.hl='inventario';if(typeof CF!=='undefined'&&CF.NAVN)CF.NAVN.hl='Heladería';
{const r0=relevante;relevante=t=>t==='hl'?HL.on():r0(t)}
HL.mov=h=>h.t==='ingreso'?'Entró '+PX.coma(h.baldes,2)+' balde(s)':'Quedó en '+PX.coma(h.baldes,2)+' balde(s) ('+(h.g>0?'+':'')+h.g+' g)';
HL.drawPant=()=>{if($('#hl').classList.contains('hide'))return;const pp=HL.puedePrecios(),ps=HL.puedeStock();
  $('#hl_gl').innerHTML=HL.gustos().map(p=>`<tr><td><b>${esc(p.name)}</b>${HL.pedir(p)?' <span class="tag low">Pedir</span>':''}</td><td class="n">${HL.fmtB(HL.baldes(p))}</td><td class="n">${PX.coma(tot(p)/1000,3)}</td><td class="n">${PX.coma(HL.baldeKg(p),3)}</td><td><button class="btn sec" data-hm="${p.id}" ${ps?'':'disabled'}>Entró 1 balde</button> <input data-hq="${p.id}" inputmode="decimal" placeholder="Queda (baldes)" style="width:130px" ${ps?'':'disabled'}> <button class="btn sec" data-ha="${p.id}" ${ps?'':'disabled'}>Ajustar</button></td></tr>`).join('')||'<tr><td colspan="5" class="mu">Todavía no cargaste gustos.</td></tr>';
  $('#hl_hl').innerHTML=(db.baldes||[]).slice(-50).reverse().map(h=>`<tr><td>${new Date(h.date).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</td><td>${esc(h.user||'-')}</td><td>${esc(h.gusto)}</td><td>${HL.mov(h)}</td></tr>`).join('')||'<tr><td colspan="4" class="mu">Todavía no hay movimientos.</td></tr>';
  $('#hl_tl').innerHTML=HL.tamanos().map(p=>`<tr><td><b>${esc(p.name)}</b></td><td class="n"><input data-tp="${p.id}" value="${p.price?PX.coma(p.price,2):''}" placeholder="Sin precio" inputmode="decimal" style="width:110px" ${pp?'':'disabled'}></td></tr>`).join('')||'<tr><td colspan="2" class="mu">Todavía no hay tamaños: cargá los de ejemplo o agregá el tuyo.</td></tr>';
  $('#hl_ej').disabled=!pp;$('#hl_ta').disabled=!pp};
{const sin=()=>toast('Tu usuario no tiene permiso para esto'),fin=(r,m)=>{if(r.err)return toast(r.err);draw();if(m)toast(m)};
  $('#hl_ga').onclick=()=>{if(!can('productos','crear'))return sin();const r=HL.nuevoGusto($('#hl_gn').value,$('#hl_gk').value,$('#hl_gb').value);if(!r.err)['#hl_gn','#hl_gk','#hl_gb'].forEach(s=>$(s).value='');fin(r,'Gusto agregado')};
  $('#hl_ta').onclick=()=>{if(!HL.puedePrecios())return sin();const r=HL.nuevoTamano($('#hl_tn').value,$('#hl_tp').value);if(!r.err)['#hl_tn','#hl_tp'].forEach(s=>$(s).value='');fin(r,'Tamaño agregado')};
  $('#hl_ej').onclick=()=>{if(!HL.puedePrecios())return sin();const n=HL.ejemplos();fin({},n?n+' tamaños cargados: completá el precio de cada uno':'Los tamaños de ejemplo ya estaban')};
  $('#hl_gl').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(!HL.puedeStock())return sin();if(b.dataset.hm)fin(HL.cargar(+b.dataset.hm,1),'Balde cargado');else if(b.dataset.ha){const i=$(`#hl_gl [data-hq="${b.dataset.ha}"]`);fin(HL.ajustar(+b.dataset.ha,i.value),'Stock ajustado')}};
  // Cambio de precio de un tamaño: se guarda al salir del campo.
  $('#hl_tl').onchange=e=>{const i=e.target,p=db.prods.find(x=>x.id===+i.dataset.tp);if(!p)return;if(!HL.puedePrecios()){draw();return sin()}
    const v=PX.num(i.value);if(i.value.trim()===''||!(v>=0)){draw();return toast('Precio inválido')}if(Math.abs(v-p.price)>0.004){ajuste({tipo:'producto.precio',pid:p.id,txt:p.name+': precio '+fmt(p.price)+' → '+fmt(v)});p.price=v}save();draw()}}
MODS.push(()=>HL.drawPant());
