// ===== Resumen financiero y Reportes › Tendencias =====
// Resumen financiero: todo sale de ventas, cobros, caja y deudas; no hay que cargar nada. Los gastos son los retiros de caja
// (con su tipo). Finanzas completa (libro mayor, gastos fijos, banco, sueldos) queda en Funciones avanzadas.
// Tendencias: la analítica pasa a ser una pestaña de Reportes en lugar de una pantalla aparte.
const PL={per:'s'};
PL.GASTOS=['Proveedor','Mercadería e insumos','Servicios','Sueldos','Otros'];
PL.rango=()=>{const h=UT.hoy();return PL.per==='h'?[h,h]:PL.per==='s'?[UT.add(h,-6),h]:[h.slice(0,8)+'01',h]};
PL.medio=m=>m==='Efectivo'?'Efectivo':/Tarjeta/.test(m||'')?'Tarjeta':m==='Transferencia'?'Transferencia':'Otros';
PL.calc=()=>{const[d,h]=PL.rango(),en=x=>{const k=UT.dk(x);return k>=d&&k<=h},S=db.sales.filter(s=>!s.void&&en(s.date)),P=db.pays.filter(p=>en(p.date));
  const ent={Efectivo:0,Tarjeta:0,Transferencia:0,Otros:0};S.filter(s=>s.pay!=='Cuenta corriente').forEach(s=>{ent[PL.medio(s.pay)]+=s.total});P.forEach(p=>{ent[PL.medio(p.method)]+=p.amount});
  const gastos=[];(db.cajas||[]).forEach(c=>(c.movs||[]).forEach(m=>{if(m.t==='egreso'&&en(m.date))gastos.push({date:m.date,motivo:m.motivo,cat:m.cat||'Otros',monto:m.monto,user:m.user})}));gastos.sort((a,b)=>a.date<b.date?1:-1);
  const vendido=UT.suma(S),costo=S.reduce((a,s)=>a+s.items.reduce((b,i)=>b+i.qty*(i.cost||0),0),0),gas=gastos.reduce((a,g)=>a+g.monto,0);
  const deben=db.clients.reduce((a,c)=>a+Math.max(0,debtOf(c.id)),0),debes=db.fin.pagar.filter(g=>!g.pagado),caja=typeof CJ!=='undefined'&&CJ.abierta()?CJ.calc(CJ.abierta()).esperado:null;
  return{ent,entro:UT.r2(Object.values(ent).reduce((a,b)=>a+b,0)),vendido:UT.r2(vendido),ganancia:UT.r2(vendido-costo-gas),gastos,totalGastos:UT.r2(gas),deben:UT.r2(deben),debes,totalDebes:UT.r2(debes.reduce((a,g)=>a+g.monto,0)),caja}};
$('main').insertAdjacentHTML('beforeend',`<section id="w" class="hide"><div class="pills" id="pn_p" style="margin-bottom:14px"><button data-pp="h">Hoy</button><button data-pp="s" class="on">Esta semana</button><button data-pp="m">Este mes</button></div>
<div class="grid" style="grid-template-columns:1.3fr 1fr 1fr;margin-bottom:14px"><div class="card" style="margin:0;background:var(--ink);color:#fff;border:0"><div style="color:#B9C6DC" id="pn_et">Entró esta semana</div><div class="tot" id="pn_e" style="margin:4px 0;color:#fff"></div><div id="pn_m" style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:#D5DEEE"></div></div>
<div class="card" style="margin:0"><div class="mu">Ganancia estimada</div><div class="kpi"><div id="pn_g"></div></div><div class="mu" style="font-size:13px">Ventas menos el costo de lo vendido y los gastos de caja</div></div>
<div class="card" style="margin:0;display:flex;flex-direction:column;gap:8px"><div class="row" style="padding:0;border:0"><span class="mu">Te deben clientes</span><b id="pn_td"></b></div><div class="row" style="padding:0;border:0"><span class="mu">Debés a proveedores</span><b id="pn_dp" style="color:var(--bad)"></b></div><div class="row" style="padding:0;border:0"><span class="mu">Efectivo en caja ahora</span><b id="pn_ca"></b></div></div></div>
<div class="grid" style="grid-template-columns:minmax(0,1fr) 380px"><div class="card" style="margin:0"><div class="lh"><h3>Gastos pagados con la caja</h3><span class="mu" id="pn_gt"></span></div><div class="wrap"><table><tbody id="pn_gl"></tbody></table></div><p class="mu" style="margin:10px 0 0;font-size:13px">Se cargan desde la caja con «Ingreso / retiro», eligiendo el tipo de gasto.</p></div>
<div class="card" style="margin:0"><h3>Le debés a</h3><div id="pn_dl"></div><p class="mu" style="margin:10px 0 0;font-size:13px">«Pagar» descuenta la deuda y, si es en efectivo, la registra como retiro de caja.</p></div></div></section>`);
$('#masmenu').insertAdjacentHTML('afterbegin','<button data-t="w">Resumen financiero</button>');
{const b=$('#masmenu button[data-t="w"]');b.onclick=()=>{$$('nav button').forEach(x=>x.classList.toggle('on',x===b));$$('nav button').map(x=>x.dataset.t).forEach(s=>$('#'+s)&&$('#'+s).classList.toggle('hide',s!=='w'));$('#masmenu').classList.add('hide');masRefresh();draw()}}
MODT.w='finanzas';CF.NAVN.w='Resumen financiero';CF.HELP.w='Lo que entró por cada medio de pago, la ganancia estimada, lo que te deben, lo que debés a proveedores y los gastos pagados con la caja. Todo sale solo de tus ventas, cobros y caja.';
{const r0=relevante;relevante=t=>t==='w'?true:r0(t)}
PL.draw=()=>{if($('#w').classList.contains('hide'))return;const k=PL.calc(),N={h:'hoy',s:'esta semana',m:'este mes'}[PL.per];
  $('#pn_et').textContent='Entró '+N;$('#pn_e').textContent=fmt(k.entro);$('#pn_m').innerHTML=Object.entries(k.ent).filter(([m,v])=>v||m!=='Otros').map(([m,v])=>`<span>${m} ${fmt(v)}</span>`).join('');
  $('#pn_g').textContent=fmt(k.ganancia);$('#pn_g').style.color=k.ganancia<0?'var(--bad)':'var(--ok)';$('#pn_td').textContent=fmt(k.deben);$('#pn_dp').textContent=fmt(k.totalDebes);$('#pn_ca').textContent=k.caja==null?'Caja cerrada':fmt(k.caja);
  $('#pn_gt').textContent='Total '+fmt(k.totalGastos);$('#pn_gl').innerHTML=k.gastos.slice(0,60).map(g=>`<tr><td>${new Date(g.date).toLocaleDateString('es-AR',{weekday:'short',day:'2-digit',month:'2-digit'})}</td><td style="white-space:normal">${esc(g.motivo)} <span class="tag ${g.cat==='Proveedor'?'':'low'}">${esc(g.cat)}</span></td><td class="n"><b>${fmt(g.monto)}</b></td></tr>`).join('')||'<tr><td class="mu">No hubo gastos pagados con la caja en este período.</td></tr>';
  $('#pn_dl').innerHTML=k.debes.map(g=>`<div class="row"><span><b>${esc(g.prov)}</b><br><span class="mu" style="font-size:12.5px">${esc(g.desc||'')}</span></span><span style="display:flex;gap:8px;align-items:center"><b>${fmt(g.monto)}</b><button class="btn sec" data-pg="${g.id}">Pagar</button></span></div>`).join('')||'<p class="mu" style="margin:0">No le debés nada a ningún proveedor.</p>'};
$('#pn_p').onclick=e=>{const b=e.target.closest('[data-pp]');if(!b)return;PL.per=b.dataset.pp;$$('#pn_p button').forEach(x=>x.classList.toggle('on',x===b));PL.draw()};
// Pagar una deuda con un proveedor: en efectivo sale de la caja; por otro medio, no la toca.
PL.pagar=(id,medio)=>{const g=db.fin.pagar.find(x=>x.id==id&&!x.pagado);if(!g)return{err:'Esa deuda ya no está pendiente'};
  if(medio==='caja'){if(typeof CJ==='undefined'||!CJ.abierta())return{err:'No hay una caja abierta: abrila o elegí otro medio'};const r=CJ.mov('egreso',g.monto,'Pago a '+g.prov);if(r.err)return r;const c=CJ.abierta();c.movs[c.movs.length-1].cat='Proveedor'}
  g.pagado=true;g.pagoFecha=UT.hoy();g.cta=medio==='caja'?'Caja':'Banco';g.pagoUser=quien();save();return{ok:true}};
$('#pn_dl').onclick=e=>{const b=e.target.closest('[data-pg]');if(!b)return;if(!can('finanzas','editar'))return toast('Tu usuario no tiene permiso para esto');const g=db.fin.pagar.find(x=>x.id==b.dataset.pg);if(!g)return;
  document.body.insertAdjacentHTML('beforeend',`<div class="ov" id="plv" role="dialog" aria-modal="true"><div class="card"><h3>Pagar a ${esc(g.prov)}</h3><div class="tot">${fmt(g.monto)}</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-pm="caja" style="background:var(--ok)">Con el efectivo de la caja</button><button class="btn sec" data-pm="otro">Transferencia u otro medio</button><button class="btn sec" data-pm="x">Cancelar</button></div></div></div>`);
  const ov=$('#plv'),cerrar=()=>ov.parentNode&&ov.parentNode.removeChild(ov);ov.onclick=ev=>{const m=ev.target.closest('[data-pm]');if(!m)return;if(m.dataset.pm==='x')return cerrar();const r=PL.pagar(g.id,m.dataset.pm);if(r.err)return toast(r.err);cerrar();draw();toast('Pago registrado: '+fmt(g.monto))};
  ov.addEventListener('keydown',ev=>{if(ev.key==='Escape')cerrar()});ov.querySelector('[data-pm]').focus()};
MODS.push(PL.draw);
// Finanzas completa: avanzada.
document.head.insertAdjacentHTML('beforeend','<style>nav button[data-t="a"]{display:none!important}#r.tend>:not(#r_t):not(#a){display:none!important}</style>');

// ---------- Reportes › Tendencias ----------
$('#r').insertAdjacentHTML('afterbegin','<div class="pills" id="r_t" style="margin-bottom:14px"><button data-rt="r" class="on">Resumen</button><button data-rt="t">Tendencias</button></div>');
$('#r').appendChild($('#a'));
PL.rtab='r';
PL.verTend=t=>{PL.rtab=t;$$('#r_t button').forEach(x=>x.classList.toggle('on',x.dataset.rt===t));$('#r').classList.toggle('tend',t==='t');$('#a').classList.toggle('hide',t!=='t');if(t==='t'&&typeof AN!=='undefined')AN.draw();else draw()};
$('#r_t').onclick=e=>{const b=e.target.closest('[data-rt]');if(b)PL.verTend(b.dataset.rt)};
MODS.push(()=>{if($('#r').classList.contains('hide'))return;if(PL.rtab==='t'&&$('#a').classList.contains('hide')){$('#a').classList.remove('hide');if(typeof AN!=='undefined')AN.draw()}});
