// ===== Actividad reciente (v3.0.0, fase 2): historial unificado de acciones relevantes =====
// No guarda una copia aparte: arma la lista a partir de los registros reales (ventas, cobros, cajas, bajas, pedidos,
// recepciones, ajustes de inventario y precios, finanzas). Con usuarios activados, el registro detallado de cada
// clic sigue estando en Usuarios > Registro de actividad.
const AC={};
AC.F=d=>new Date(d).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'});
AC.N=n=>'N.º '+String(n).padStart(6,'0');
AC.TIPOS={venta:'Ventas',anulacion:'Anulaciones',cobro:'Cobros de deudas',caja:'Caja',baja:'Bajas de stock',pedido:'Pedidos y recepciones',ajuste:'Ajustes de inventario y productos',finanzas:'Finanzas'};
AC.AJN={'stock.lote_agregado':'Lote agregado','stock.lote_eliminado':'Lote eliminado','stock.ingreso':'Ingreso de stock','producto.precio':'Cambio de precio o costo','producto.eliminado':'Producto eliminado','venta.corregida':'Venta cargada para corregir'};
AC.lista=()=>{const L=[],add=(d,g,acc,user,txt)=>{if(d)L.push({d,g,acc,user:user||'Sin registrar',txt})};
  db.sales.forEach(s=>{add(s.date,'venta','Venta',s.user,`${AC.N(s.id)} · ${fmt(s.total)} · ${s.pay}${s.cname?' · '+s.cname:''}`);if(s.void)add(s.voidAt,'anulacion','Venta anulada',s.voidBy,`${AC.N(s.id)} · ${fmt(s.total)}`)});
  db.pays.forEach(p=>add(p.date,'cobro','Cobro de deuda',p.user,`${(cl$(p.cid)||{name:'Cliente'}).name} · ${fmt(p.amount)} (${p.method})`));
  (db.cajas||[]).forEach(c=>{add(c.abre,'caja','Apertura de caja',c.user,`${c.caja} · inicial ${fmt(c.ini)}`);if(CJ.ve()&&c.traspaso&&Math.abs(c.traspaso.dif)>=0.005)add(c.abre,'caja','Diferencia de traspaso de caja',c.user,`debía haber ${fmt(c.traspaso.debia)} (dejó ${c.traspaso.deUser}) y se contó ${fmt(c.ini)} · ${fmt(c.traspaso.dif)}`);(c.movs||[]).forEach(m=>add(m.date,'caja',CJ.nomMov(m),m.user,`${fmt(m.monto)} · ${m.motivo}`));
    if(c.cierre&&!CJ.ve())add(c.cierre,'caja','Cierre de caja',c.cerro||c.user,`${c.caja} · contado ${fmt(c.contado)}${c.queda!=null?` · retiro ${fmt(c.retiro||0)}${c.quedaDecl!=null?' · quedó '+fmt(c.quedaDecl):''}`:''}`);
    if(c.cierre&&CJ.ve()){const t=Math.abs(c.dif)<0.005?'equilibrada':c.dif>0?'sobrante '+fmt(c.dif):'faltante '+fmt(-c.dif);add(c.cierre,'caja','Cierre de caja',c.cerro||c.user,`${c.caja} · contado ${fmt(c.contado)} · ${t}${c.queda!=null?` · retiro ${fmt(c.retiro||0)} · queda ${fmt(c.queda)}`:''}`);(c.correcciones||[]).forEach(x=>add(x.date,'caja','Cierre de caja corregido',x.user,`${c.caja} · contado ${fmt(x.antes.contado)} → ${fmt(x.despues.contado)} · motivo: ${x.motivo}`));Object.entries(c.arqueo||{}).filter(([,x])=>Math.abs(x.dif)>=0.005).forEach(([id,x])=>add(c.cierre,'caja','Diferencia de arqueo ('+({qr:'QR',deb:'débito',cre:'crédito',tra:'transferencia',pt:'Point'}[id]||id)+')',c.cerro||c.user,`declarado ${fmt(x.dec)} · registrado ${fmt(x.reg)} · ${fmt(x.dif)}`))}});
  db.desv.forEach(v=>{const it=v.items.map(i=>i.qty+' x '+i.name).join(', ');add(v.reg||v.date,'baja','Baja de stock',v.user,`${v.reason?v.reason+' · ':''}${it}`);if(v.void)add(v.voidAt,'anulacion','Baja anulada',v.voidBy,it)});
  db.orders.forEach(o=>{add(o.date,'pedido','Pedido',o.user,`N.º ${o.id} · ${o.supplier||'Sin proveedor'} · ${o.items.length} productos`);(o.receipts||[]).forEach(r=>add(r.date,'pedido','Recepción de mercadería',r.user,`Pedido N.º ${o.id} · ${r.items.map(i=>i.qty+' x '+i.name).join(', ')}`))});
  (db.ajustes||[]).forEach(a=>add(a.date,a.tipo==='venta.corregida'?'anulacion':'ajuste',AC.AJN[a.tipo]||a.tipo,a.user,a.txt||''));
  db.fin.mov.forEach(m=>add(m.fecha+'T12:00:00','finanzas',m.tipo==='gasto'?'Gasto registrado':'Ingreso registrado',m.user,`${m.cat||''} · ${fmt(m.monto)}${m.desc?' · '+m.desc:''}`));
  db.fin.pagar.forEach(g=>{if(g.pagado&&g.pagoFecha)add(g.pagoFecha+'T12:00:00','finanzas','Pago a proveedor',g.user,`${g.prov} · ${fmt(g.monto)}${g.desc?' · '+g.desc:''}`)});
  return L.sort((a,b)=>a.d<b.d?1:-1)};
$('main').insertAdjacentHTML('beforeend',`<section id="z" class="hide"><div class="card"><div class="lh"><h3>Actividad reciente</h3></div><div class="form"><div><label>Tipo</label><select id="ac_t"><option value="">Todo</option>${Object.entries(AC.TIPOS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div><div><label>Usuario</label><select id="ac_u"></select></div><div><label>Desde</label><input id="ac_d" type="date"></div><div><label>Hasta</label><input id="ac_h" type="date"></div><div><label>Buscar</label><input id="ac_q" placeholder="Producto, cliente, N.º…"></div></div><p id="ac_s" class="mu" style="margin:0 0 8px"></p><div class="wrap"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody id="ac_l"></tbody></table></div></div></section>`);
$('#masmenu').insertAdjacentHTML('beforeend','<button data-t="z">Actividad</button>');
{const b=$('#masmenu button[data-t="z"]');b.onclick=()=>{$$('nav button').forEach(x=>x.classList.toggle('on',x===b));$$('nav button').map(x=>x.dataset.t).forEach(s=>$('#'+s)&&$('#'+s).classList.toggle('hide',s!=='z'));$('#masmenu').classList.add('hide');masRefresh();draw()}}
MODT.z='reporte';if(typeof CF!=='undefined'&&CF.NAVN)CF.NAVN.z='Actividad';
{const r0=relevante;relevante=t=>t==='z'?true:r0(t)}
AC.draw=()=>{if($('#z').classList.contains('hide'))return;const all=AC.lista(),su=$('#ac_u'),cu=su.value,us=[...new Set(all.map(x=>x.user))].sort();su.innerHTML='<option value="">Todos</option>'+us.map(u=>`<option>${esc(u)}</option>`).join('');su.value=us.includes(cu)?cu:'';
  const t=$('#ac_t').value,d=$('#ac_d').value,h=$('#ac_h').value,q=norm($('#ac_q').value.trim());
  const L=all.filter(x=>(!t||x.g===t)&&(!su.value||x.user===su.value)&&(!d||ld(x.d)>=d)&&(!h||ld(x.d)<=h)&&(!q||norm(x.acc+' '+x.txt).includes(q)));
  $('#ac_s').textContent=`${L.length} ${L.length===1?'acción':'acciones'}${L.length>300?' · se muestran las 300 más recientes':''}`;
  $('#ac_l').innerHTML=L.slice(0,300).map(x=>`<tr><td>${AC.F(x.d)}</td><td>${esc(x.user)}</td><td><b>${esc(x.acc)}</b></td><td style="white-space:normal">${esc(x.txt)}</td></tr>`).join('')||'<tr><td colspan="4" class="mu">No hay acciones con estos filtros.</td></tr>'};
['#ac_t','#ac_u','#ac_d','#ac_h'].forEach(s=>$(s).onchange=AC.draw);$('#ac_q').oninput=AC.draw;
MODS.push(AC.draw);
