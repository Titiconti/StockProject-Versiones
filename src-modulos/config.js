// ===== Configuración: encuesta inicial, personalización, Inicio, ayuda, seguridad y privacidad =====
const CF={};
CF.TIPOS={minorista:'Minorista (ropa, electrónica, etc.)',servicios:'Servicios (consultoría, reparaciones, etc.)',restaurante:'Restaurante / Cafetería',online:'Comercio online',mayorista:'Distribuidor / Mayorista',otro:'Otro'};
CF.VOLS={pequeno:'Pequeño (1 a 10 transacciones por día)',mediano:'Mediano (11 a 50 por día)',grande:'Grande (51 o más por día)'};
CF.NECS={inventario:'Inventario físico',proveedores:'Proveedores y compras',facturas:'Facturas y cobros',empleados:'Empleados y nóminas',caja:'Caja y bancos',clientes:'Clientes y deudas',reportes:'Reportes financieros',automatizacion:'Automatización de procesos'};
CF.PAISES={AR:{n:'Argentina',mon:'ARS',loc:'es-AR',imp:'IVA',tasa:21,id:'CUIT'},ES:{n:'España',mon:'EUR',loc:'es-ES',imp:'IVA',tasa:21,id:'NIF'},MX:{n:'México',mon:'MXN',loc:'es-MX',imp:'IVA',tasa:16,id:'RFC'},CL:{n:'Chile',mon:'CLP',loc:'es-CL',imp:'IVA',tasa:19,id:'RUT'},UY:{n:'Uruguay',mon:'UYU',loc:'es-UY',imp:'IVA',tasa:22,id:'RUT'},CO:{n:'Colombia',mon:'COP',loc:'es-CO',imp:'IVA',tasa:19,id:'NIT'},PE:{n:'Perú',mon:'PEN',loc:'es-PE',imp:'IGV',tasa:18,id:'RUC'},BR:{n:'Brasil',mon:'BRL',loc:'pt-BR',imp:'ICMS',tasa:18,id:'CNPJ'},US:{n:'Estados Unidos',mon:'USD',loc:'en-US',imp:'Sales tax',tasa:0,id:'EIN'},OT:{n:'Otro país',mon:'USD',loc:'es-AR',imp:'Impuesto',tasa:0,id:'ID fiscal'}};
CF.MONEDAS={ARS:'Peso argentino',USD:'Dólar estadounidense',EUR:'Euro',MXN:'Peso mexicano',CLP:'Peso chileno',UYU:'Peso uruguayo',COP:'Peso colombiano',PEN:'Sol peruano',BRL:'Real brasileño'};
CF.WN={ventas:'Ventas de hoy',caja:'Dinero cobrado hoy',stock:'Stock bajo',vencer:'Productos por vencer',deudas:'Deuda de clientes',pedidos:'Pedidos abiertos',top:'Más vendidos',margen:'Ganancia del mes',tendencia:'Gráfico de ventas',cobros:'Cobros para recordar'};
CF.NAVN={h:'Inicio',v:'Ventas',i:'Inventario',p:'Productos',o:'Pedidos',c:'Clientes',e:'Baja de Stock',f:'Finanzas',r:'Reportes',a:'Analítica',g:'Configuración',u:'Usuarios'};
// Perfil por tipo de comercio: orden del menú, widgets del Inicio, categorías de gastos y consejos.
CF.PERFIL={
  minorista:{prim:['h','v','p','i','c','r'],menu:['h','v','p','i','c','o','f','r','a','e','g','u'],w:['ventas','caja','stock','top','tendencia','deudas','margen'],gastos:['Alquiler','Servicios','Sueldos','Impuestos','Mercadería','Publicidad','Mantenimiento','Otros']},
  servicios:{prim:['h','v','c','f','r','p'],menu:['h','v','c','f','r','a','p','o','i','e','g','u'],w:['ventas','caja','deudas','cobros','tendencia','margen'],gastos:['Alquiler','Servicios','Sueldos','Impuestos','Herramientas','Publicidad','Capacitación','Otros']},
  restaurante:{prim:['h','v','i','p','c','r'],menu:['h','v','i','e','p','o','f','c','r','a','g','u'],w:['ventas','caja','stock','vencer','top','tendencia','margen'],gastos:['Alquiler','Servicios','Sueldos','Impuestos','Insumos','Gas y energía','Mantenimiento','Otros']},
  online:{prim:['h','v','p','i','c','r'],menu:['h','v','p','i','c','f','r','a','o','e','g','u'],w:['ventas','tendencia','top','stock','margen','deudas'],gastos:['Plataforma','Envíos','Publicidad','Impuestos','Sueldos','Embalaje','Comisiones','Otros']},
  mayorista:{prim:['h','v','i','o','c','r'],menu:['h','v','o','i','p','c','f','r','a','e','g','u'],w:['ventas','deudas','stock','pedidos','tendencia','cobros','vencer'],gastos:['Alquiler','Flete y logística','Sueldos','Impuestos','Mercadería','Servicios','Mantenimiento','Otros']},
  otro:{prim:['h','v','p','i','c','r'],menu:['h','v','p','i','c','o','f','r','a','e','g','u'],w:['ventas','caja','stock','deudas','tendencia','top'],gastos:['Alquiler','Servicios','Sueldos','Impuestos','Mercadería','Otros']}
};
CF.NECTABS={inventario:['i','p'],proveedores:['o'],facturas:['f','c'],empleados:['f'],caja:['f'],clientes:['c'],reportes:['r','a','f'],automatizacion:['f','c']};
CF.enc=()=>db.cfg.encuesta||null;
CF.tabsActivas=()=>{const e=CF.enc();if(!e)return null;if(db.cfg.tabs)return db.cfg.tabs;const s=new Set(['h','v','g','u','p']);(e.necs||[]).forEach(n=>(CF.NECTABS[n]||[]).forEach(t=>s.add(t)));if(['minorista','mayorista','restaurante'].includes(e.tipo)&&(e.necs||[]).includes('inventario'))s.add('e');return [...s]};
CF.perfil=()=>CF.PERFIL[(CF.enc()||{}).tipo]||CF.PERFIL.otro;
CF.gastosCats=()=>db.cfg.gastosCats||CF.perfil().gastos;
// ¿Hay que mostrar la pestaña t? Sin encuesta: todo en escritorio/remoto; en la demo web, solo lo clásico.
relevante=t=>{const a=CF.tabsActivas();if(a)return a.includes(t);return KIND!=='local'||['v','i','p','o','c','e','r','u'].includes(t)};
CF.prim=()=>(CF.enc()&&CF.perfil().prim)||['h','v','p','i','c','r'];
CF.ordenar=()=>{const nav=$('nav'),mas=$('#masw'),menu=$('#masmenu'),prim=CF.prim(),ord=(CF.enc()?db.cfg.orden||CF.perfil().menu:['h','v','p','i','c','r','o','f','a','e','g','u']);
  prim.forEach(t=>{const b=document.querySelector(`nav button[data-t=${t}]`);if(b)nav.insertBefore(b,mas)});
  [...ord,...Object.keys(CF.NAVN)].forEach(t=>{const b=document.querySelector(`nav button[data-t=${t}]`);if(b&&!prim.includes(t))menu.appendChild(b)})};
CF.aplicar=()=>{const e=CF.enc();if(e){MON=e.mon||'ARS';LOC=e.loc||'es-AR'}if(db.cfg.moneda){MON=db.cfg.moneda;LOC=db.cfg.loc||LOC}$$('.mon').forEach(x=>x.textContent=MON);CF.ordenar();navRefresh();const vis=$$('nav button:not(.hide)');const on=vis.find(b=>$('#'+b.dataset.t)&&!$('#'+b.dataset.t).classList.contains('hide'));if(!on&&vis[0])vis[0].click()};

// ---------- Inicio: panel con widgets según el perfil ----------
CF.k=(tit,big,sub,dl)=>`<div class="card"><div class="mu" style="font-size:13px">${tit}</div><div class="big">${big}</div><div class="mu" style="font-size:13px">${sub||''}</div>${dl==null?'':`<div class="dl ${dl<0?'neg':''}">${dl>=0?'▲':'▼'} ${Math.abs(dl).toFixed(0)}% vs. ayer</div>`}</div>`;
CF.W={
  ventas:()=>{const h=UT.hoy(),v=UT.ventas(h,h),y=UT.ventas(UT.add(h,-1),UT.add(h,-1)),t=UT.suma(v),ty=UT.suma(y);return CF.k('Ventas de hoy',fmt(t),`${v.length} ventas · ticket ${fmt(v.length?t/v.length:0)}`,ty?(t-ty)/ty*100:null)},
  caja:()=>{const h=UT.hoy(),v=UT.ventas(h,h).filter(s=>s.pay!=='Cuenta corriente'),c=db.pays.filter(p=>UT.dk(p.date)===h);return CF.k('Cobrado hoy',fmt(UT.suma(v)+c.reduce((a,p)=>a+p.amount,0)),`Ventas al contado ${fmt(UT.suma(v))} · cobros de deudas ${fmt(c.reduce((a,p)=>a+p.amount,0))}`)},
  stock:()=>{const l=db.prods.filter(p=>p.min&&avail(p)<=p.min);return CF.k('Stock bajo',l.length+' productos',l.slice(0,4).map(p=>esc(p.name)).join(', ')||'Todo en orden')},
  vencer:()=>{const lim=UT.add(UT.hoy(),30);let n=0;db.prods.forEach(p=>p.lots.forEach(l=>{if(l.exp&&l.exp>=T()&&l.exp<=lim)n+=l.qty}));return CF.k('Vencen en 30 días',n+' unidades','Revisá Inventario para ofertarlos a tiempo')},
  deudas:()=>{const d=db.clients.map(c=>({c,d:debtOf(c.id)})).filter(x=>x.d>0.005).sort((a,b)=>b.d-a.d);return CF.k('Deuda de clientes',fmt(d.reduce((a,x)=>a+x.d,0)),d.slice(0,3).map(x=>esc(x.c.name)+' '+fmt(x.d)).join(' · ')||'Sin deudas')},
  pedidos:()=>{const n=db.orders.filter(o=>!o.closed).length;return CF.k('Pedidos abiertos',n,'Pendientes de recibir o cerrar')},
  top:()=>{const m={},h=UT.hoy();UT.ventas(UT.add(h,-29),h).forEach(s=>s.items.forEach(i=>m[i.name]=(m[i.name]||0)+i.qty));const l=Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5);return CF.k('Más vendidos (30 días)',l[0]?esc(l[0][0]):'-',l.map(x=>esc(x[0])+' ('+x[1]+')').join(' · ')||'Todavía no hay ventas')},
  margen:()=>{const h=UT.hoy(),d1=h.slice(0,8)+'01',v=UT.ventas(d1,h);return CF.k('Ganancia del mes',fmt(UT.ganancia(v)),`Sobre ventas por ${fmt(UT.suma(v))}`)},
  tendencia:()=>{const h=UT.hoy(),ks=[...Array(14)].map((_,i)=>UT.add(h,i-13)),vals=ks.map(k=>UT.suma(UT.ventas(k,k)));return `<div class="card" style="grid-column:1/-1"><div class="mu" style="font-size:13px">Ventas de los últimos 14 días</div>${UT.grafico(vals,ks.map(k=>k.slice(5).split('-').reverse().join('/')),{alto:130})}</div>`}
};
CF.tips=()=>{const t=[],e=CF.enc()||{},n=(e.necs||[]);
  if(db.prods.some(p=>!p.cost))t.push(['costos','Hay productos sin costo cargado: sin eso no se puede calcular la ganancia real.','p']);
  if(AU.habilitado&&!(AU.usuario||{}).pregunta&&!db.cfg.tipPreg)t.push(['pregunta','Configurá una pregunta de seguridad en Mi cuenta para poder recuperar tu contraseña.','u']);
  if(!AU.habilitado&&EDA)t.push(['usuarios','Todavía no activaste usuarios: cualquiera que abra el programa ve y modifica todo.','u']);
  if(n.includes('clientes')&&db.clients.some(c=>debtOf(c.id)>0.005)&&!(db.rules.recordatorio||{}).on)t.push(['recordatorios','Tenés clientes con deuda: podés activar recordatorios de cobro en Finanzas > Recordatorios.','f']);
  if(n.includes('inventario')&&db.prods.some(p=>!p.min))t.push(['minimos','Definí un stock mínimo en tus productos para recibir avisos de reposición.','p']);
  if((e.necs||[]).includes('reportes')&&db.sales.length>20)t.push(['analitica','Probá la pestaña Analítica: comparativas contra el período anterior y pronóstico de ventas.','a']);
  return t.filter(x=>!(db.cfg.tipsOff||[]).includes(x[0]))};
CF.drawInicio=()=>{const s=$('#h');if(s.classList.contains('hide'))return;const e=CF.enc(),ws=(db.cfg.widgets||CF.perfil().w.slice(0,5)).filter(w=>CF.W[w]&&(w!=='cobros'||(typeof COB!=='undefined'&&COB.R().recordatorio.on)));
  const tips=CF.tips().slice(0,2);
  s.querySelector('#hk').innerHTML=ws.map(w=>CF.W[w]()).join('')+(CF.W.cobros&&ws.includes('cobros')?'':'');
  $('#htips').innerHTML=tips.length?'<h3>Recomendaciones</h3>'+tips.map(([id,tx,tab])=>`<div class="tip">${esc(tx)} <button class="btn sec" data-ir="${tab}" style="padding:3px 9px;margin-left:6px">Ir</button> <button class="btn sec" data-nt="${id}" style="padding:3px 9px">No mostrar más</button></div>`).join(''):'';
  $('#hnom').textContent=(db.shop&&db.shop.n)||'Tu negocio';$('#hsub').textContent=e?`${CF.TIPOS[e.tipo]||''} · ${CF.PAISES[e.pais]?CF.PAISES[e.pais].n:''}`:'Contestá la encuesta de Configuración para personalizar este panel.'};
MODS.push(CF.drawInicio);

// ---------- Encuesta inicial ----------
CF.paisAuto=()=>{const l=(navigator.language||'es-AR').split('-')[1];return CF.PAISES[l]?l:'AR'};
CF.abrirEncuesta=(forzar)=>{if($('#enc'))return;const e=CF.enc()||{};let paso=0;const st={tipo:e.tipo||'minorista',vol:e.vol||'pequeno',necs:e.necs||['inventario','clientes','reportes'],pais:e.pais||CF.paisAuto(),mon:e.mon||null,ha:(e.horario||{}).a||'09:00',hc:(e.horario||{}).c||'18:00',notif:e.notif!==false};
  const ov=document.createElement('div');ov.className='ov';ov.id='enc';document.body.appendChild(ov);
  const rad=(n,o,v)=>Object.entries(o).map(([k,t])=>`<label class="opt"><input type="radio" name="${n}" value="${k}" ${v===k?'checked':''}> ${esc(t)}</label>`).join('');
  const pasos=[()=>`<h3>1. ¿Qué tipo de comercio tenés?</h3>${rad('tipo',CF.TIPOS,st.tipo)}`,()=>`<h3>2. ¿Cuántas operaciones hacés por día?</h3>${rad('vol',CF.VOLS,st.vol)}`,
    ()=>`<h3>3. ¿Qué necesitás resolver?</h3>${Object.entries(CF.NECS).map(([k,t])=>`<label class="opt"><input type="checkbox" name="necs" value="${k}" ${st.necs.includes(k)?'checked':''}> ${esc(t)}</label>`).join('')}`,
    ()=>{const p=CF.PAISES[st.pais];return `<h3>4. Configuración inicial</h3><div class="form"><div><label>País (define impuestos y formato)</label><select id="e_pais">${Object.entries(CF.PAISES).map(([k,v])=>`<option value="${k}" ${st.pais===k?'selected':''}>${v.n}</option>`).join('')}</select></div><div><label>Moneda principal</label><select id="e_mon">${Object.entries(CF.MONEDAS).map(([k,v])=>`<option value="${k}" ${(st.mon||p.mon)===k?'selected':''}>${k} · ${v}</option>`).join('')}</select></div><div><label>Abrís desde</label><input id="e_ha" type="time" value="${st.ha}"></div><div><label>Cerrás a las</label><input id="e_hc" type="time" value="${st.hc}"></div></div><label class="opt" style="margin-top:10px"><input type="checkbox" id="e_not" ${st.notif?'checked':''}> Avisarme con notificaciones del sistema (stock bajo, deudas, recomendaciones)</label><p class="mu">Impuesto sugerido para ${p.n}: ${p.imp} ${p.tasa}% (podés cambiarlo después).</p>`}];
  const leer=()=>{const q=n=>[...ov.querySelectorAll(`[name=${n}]:checked`)].map(x=>x.value);if(paso===0)st.tipo=q('tipo')[0]||st.tipo;if(paso===1)st.vol=q('vol')[0]||st.vol;if(paso===2)st.necs=q('necs');if(paso===3){st.pais=$('#e_pais').value;st.mon=$('#e_mon').value;st.ha=$('#e_ha').value;st.hc=$('#e_hc').value;st.notif=$('#e_not').checked}};
  const dibujar=()=>{ov.innerHTML=`<div class="card"><div class="mu" style="margin-bottom:6px">Paso ${paso+1} de 4 · Configuración inicial</div>${pasos[paso]()}<div style="display:flex;gap:8px;margin-top:14px;justify-content:space-between"><button class="btn sec" id="e_atras" ${paso?'':'disabled'}>Atrás</button><span style="display:flex;gap:8px"><button class="btn sec" id="e_cerrar">${forzar?'Cancelar':'Más tarde'}</button><button class="btn" id="e_sig">${paso===3?'Terminar':'Siguiente'}</button></span></div></div>`;
    if(paso===3)$('#e_pais').onchange=()=>{leer();st.mon=null;dibujar()};
    $('#e_atras').onclick=()=>{leer();paso--;dibujar()};$('#e_cerrar').onclick=()=>ov.remove();
    $('#e_sig').onclick=()=>{leer();if(paso<3){paso++;return dibujar()}const p=CF.PAISES[st.pais];
      db.cfg.moneda=st.mon||p.mon;db.cfg.loc=p.loc;db.cfg.encuesta={fecha:new Date().toISOString(),tipo:st.tipo,vol:st.vol,necs:st.necs,pais:st.pais,mon:st.mon||p.mon,loc:p.loc,horario:{a:st.ha,c:st.hc},notif:st.notif,fiscal:{imp:p.imp,tasa:p.tasa,id:p.id}};
      delete db.cfg.tabs;delete db.cfg.orden;delete db.cfg.widgets;delete db.cfg.gastosCats;
      if(call&&AU.habilitado)call('audit','config.encuesta',st.tipo);save();ov.remove();CF.aplicar();draw();CF.drawCfg();
      const ir=$('nav button:not(.hide)[data-t=h]');if(ir)ir.click();if(!db.cfg.tourVisto)setTimeout(CF.tour,300)}};
  dibujar()};

// ---------- Recorrido guiado y ayuda contextual ----------
CF.HELP={h:'Es tu panel del día: ventas, caja, stock y deudas de un vistazo. Los cuadros que ves dependen de tu tipo de comercio y los podés elegir en Configuración > Negocio.',v:'Buscá o escaneá el producto, elegí el medio de pago y tocá Cobrar. Si vendés en cuenta corriente, elegí primero al cliente. Para cobrar tiene que haber una caja abierta. Atajos: F2 buscar, F4 efectivo, F5 tarjeta, F6 transferencia, F7 cuenta corriente, F8 cobrar (pide confirmación).',k:'Historial de cajas: apertura, dinero inicial, esperado, contado y diferencia de cada turno. Filtrá por empleado, fecha o las que tuvieron diferencia.',z:'Actividad reciente: ventas, anulaciones, cobros, cajas, bajas, pedidos, ajustes de stock y cambios de precio, con su responsable.',p:'Cargá productos con código, costo, precio y stock mínimo. Con el costo cargado el programa calcula tu ganancia real.',i:'Muestra el stock por lote y vencimiento. Los productos en rojo están por debajo del mínimo o vencidos.',o:'Armá pedidos a proveedores y registrá lo que recibís: el stock sube solo al recibir.',c:'Fichas de clientes con deuda, descuentos, historial de contactos, puntos y planes de pago.',e:'Baja de Stock: registra salidas sin venta (vencimientos, daños, extravíos, retiros) con motivo y justificación, para encontrar pérdidas.',f:'Movimientos de caja, cuentas a pagar, conciliación bancaria, libro mayor y recordatorios de cobro.',r:'Resumen de ventas por período, con exportación a PDF.',a:'Compará períodos, mirá tendencias y un pronóstico de ventas. Podés exportar a Excel (CSV) o imprimir.',g:'Datos del negocio, seguridad, importación de datos, integraciones, empresas y estado del sistema.',u:'Usuarios, roles, permisos y registro de actividad.'};
CF.tabActual=()=>{const b=$$('nav button').find(b=>$('#'+b.dataset.t)&&!$('#'+b.dataset.t).classList.contains('hide'));return b?b.dataset.t:'v'};
$('#ayuda').onclick=()=>{if($('#ayu'))return;const t=CF.tabActual(),ov=document.createElement('div');ov.className='ov';ov.id='ayu';ov.innerHTML=`<div class="card"><h3>Ayuda: ${CF.NAVN[t]||''}</h3><p>${esc(CF.HELP[t]||'')}</p><p class="mu">Atajos: Alt+1, Alt+2… cambian de pantalla en el orden del menú · F8 cobra en Ventas (con confirmación).</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn sec" id="ay_t">Repetir el recorrido guiado</button><button class="btn" id="ay_x">Cerrar</button></div></div>`;document.body.appendChild(ov);$('#ay_x').onclick=()=>ov.remove();$('#ay_t').onclick=()=>{ov.remove();CF.tour()}};
CF.tour=()=>{if($('#tour'))return;const pasos=$$('nav button:not(.hide)').map(b=>({el:b.closest('#masmenu')?$('#masb'):b,b,t:b.dataset.t})).filter(x=>CF.HELP[x.t]);let i=0;if(!pasos.length)return;
  const box=document.createElement('div');box.id='tour';box.style.cssText='position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:80;width:min(520px,94vw)';document.body.appendChild(box);
  const fin=()=>{pasos.forEach(p=>p.el.classList.remove('spot'));box.remove();db.cfg.tourVisto=true;save()};
  const mostrar=()=>{pasos.forEach(p=>p.el.classList.remove('spot'));const p=pasos[i];p.el.classList.add('spot');p.b.click();box.innerHTML=`<div class="card" style="margin:0"><div class="mu" style="font-size:12px">Recorrido ${i+1} de ${pasos.length}</div><h3 style="margin:2px 0 6px">${CF.NAVN[p.t]}</h3><p style="margin:0 0 10px">${esc(CF.HELP[p.t])}</p><div style="display:flex;gap:8px;justify-content:space-between"><button class="btn sec" id="t_s">Salir</button><span style="display:flex;gap:8px"><button class="btn sec" id="t_a" ${i?'':'disabled'}>Atrás</button><button class="btn" id="t_n">${i===pasos.length-1?'Listo':'Siguiente'}</button></span></div></div>`;
    $('#t_s').onclick=fin;$('#t_a').onclick=()=>{i--;mostrar()};$('#t_n').onclick=()=>{if(i===pasos.length-1)return fin();i++;mostrar()}};mostrar()};

// ---------- Atajos de teclado (dentro de la ventana, para no molestar a otros programas) ----------
document.addEventListener('keydown',e=>{if(e.altKey&&/^[1-9]$/.test(e.key)){const b=$$('nav button:not(.hide)')[+e.key-1];if(b){e.preventDefault();b.click()}}
  else if(e.key==='F9'&&!$('#v').classList.contains('hide')){e.preventDefault();$('#cobrar').click()}
  else if(e.key==='Escape'){const o=$('#ayu');if(o)o.remove()}});

// ---------- Avisos del sistema (una vez por día) ----------
CF.avisar=()=>{const e=CF.enc();if(!e||e.notif===false||typeof Notification==='undefined')return;const h=UT.hoy();if(db.cfg.avisoDia===h)return;const t=CF.tips();if(!t.length)return;db.cfg.avisoDia=h;save();
  const go=()=>{try{new Notification('StockProject',{body:t[0][1]})}catch(x){}};if(Notification.permission==='granted')go();else if(Notification.permission!=='denied')Notification.requestPermission().then(p=>{if(p==='granted')go()})};

// ---------- Pantalla Configuración ----------
CF.sub='n';CF.extras={};
CF.drawCfg=()=>{if($('#g').classList.contains('hide'))return;const av=['i','m','x'].includes(CF.sub);$$('#gp button').forEach(b=>b.classList.toggle('on',b.dataset.s==='x'?av:b.dataset.s===CF.sub));$('#gp2').classList.toggle('hide',!av);$$('#gp2 button').forEach(b=>b.classList.toggle('on',b.dataset.s===CF.sub));$$('#g [data-sub]').forEach(x=>x.classList.toggle('hide',x.dataset.sub!==CF.sub));
  const e=CF.enc();
  if(CF.sub==='n'){
    $('#g_res').innerHTML=e?`<b>${esc(CF.TIPOS[e.tipo])}</b> · ${esc(CF.VOLS[e.vol])}<br>Necesidades: ${e.necs.map(n=>esc(CF.NECS[n])).join(', ')||'ninguna'}<br>${esc(CF.PAISES[e.pais].n)} · ${e.mon} · ${e.fiscal.imp} ${e.fiscal.tasa}% · Horario ${e.horario.a} a ${e.horario.c}`:'Todavía no completaste la encuesta de configuración.';
    const act=CF.tabsActivas()||[],ord=db.cfg.orden||CF.perfil().menu;$('#g_tabs').innerHTML=ord.filter(t=>t!=='u'&&t!=='g'&&t!=='h').map(t=>`<label class="opt"><input type="checkbox" data-tab="${t}" ${act.includes(t)?'checked':''}> ${CF.NAVN[t]}</label>`).join('');
    const ws=db.cfg.widgets||CF.perfil().w.slice(0,5);$('#g_ws').innerHTML=Object.keys(CF.W).map(w=>`<label class="opt"><input type="checkbox" data-w="${w}" ${ws.includes(w)?'checked':''}> ${CF.WN[w]||w}</label>`).join('');
    $('#g_gc').value=CF.gastosCats().join(', ');
  }
  if(CF.sub==='s')CF.drawSeg();
  Object.values(CF.extras).forEach(f=>{try{f(CF.sub)}catch(e){console.error(e)}});
};
CF.drawSeg=async()=>{const hay=EDA&&sp.seg;$('#sg_ed').classList.toggle('hide',!hay);if(!hay)return;const s=await sp.seg.estado();
  $('#sg_c').innerHTML=s.disponible?(s.activo?'<span class="tag">Activado</span> Tus datos y respaldos se guardan cifrados (AES-256).':'<span class="tag out">Desactivado</span> Los datos se guardan sin cifrar en este equipo.'):'Windows no ofrece protección de claves en este equipo; el cifrado no está disponible.';
  $('#sg_on').classList.toggle('hide',!s.disponible||s.activo);$('#sg_off').classList.toggle('hide',!s.activo);
  const r=await sp.remote();window.__https=!!r.https;$('#sg_https').textContent=r.https?'Desactivar HTTPS':'Activar HTTPS';$('#sg_hs').textContent=r.https?'Activo: el acceso desde el celular va cifrado.':'Desactivado: el acceso desde el celular viaja sin cifrar dentro de tu red.'};
CF.nombreVal=s=>String(s||'').trim();
CF.mostrarClave=hex=>{const ov=document.createElement('div');ov.className='ov';ov.id='clv';ov.innerHTML=`<div class="card"><h3>Guardá tu clave de recuperación</h3><p>Si reinstalás Windows o cambiás de usuario, <b>solo con esta clave</b> vas a poder abrir tus datos y respaldos cifrados. Guardala en un lugar seguro y distinto de esta PC (un pendrive, tu gestor de contraseñas).</p><input readonly id="clv_k" value="${hex}" style="font:13px monospace;width:100%"><div style="display:flex;gap:8px;margin:10px 0"><button class="btn sec" id="clv_d">Descargar como archivo</button></div><label class="opt"><input type="checkbox" id="clv_ok"> Ya guardé la clave en un lugar seguro</label><button class="btn" id="clv_x" style="margin-top:8px" disabled>Continuar</button></div>`;document.body.appendChild(ov);
  $('#clv_ok').onchange=()=>$('#clv_x').disabled=!$('#clv_ok').checked;$('#clv_x').onclick=()=>ov.remove();$('#clv_d').onclick=()=>UT.bajar('StockProject-clave-de-recuperacion.txt','Clave de recuperación de StockProject (no la compartas):\n'+hex+'\n')};
CF.msg=(r,ok)=>toast(r&&r.ok?ok:(r&&r.err)||'No se pudo completar');
$('#gp').onclick=$('#gp2').onclick=e=>{const b=e.target.closest('button');if(!b)return;CF.sub=b.dataset.s;CF.drawCfg()};
$('#g_enc').onclick=()=>CF.abrirEncuesta(true);
$('#g').addEventListener('change',e=>{const t=e.target;if(t.dataset.tab){const a=new Set(CF.tabsActivas()||[]);t.checked?a.add(t.dataset.tab):a.delete(t.dataset.tab);['h','g','u','v'].forEach(x=>a.add(x));db.cfg.tabs=[...a];save();CF.aplicar()}
  if(t.dataset.w){const ws=new Set(db.cfg.widgets||CF.perfil().w.slice(0,5));t.checked?ws.add(t.dataset.w):ws.delete(t.dataset.w);db.cfg.widgets=Object.keys(CF.W).filter(w=>ws.has(w));save();draw()}});
$('#g_gcs').onclick=()=>{const l=$('#g_gc').value.split(',').map(x=>x.trim()).filter(Boolean);if(!l.length)return toast('Escribí al menos una categoría');db.cfg.gastosCats=l;save();toast('Categorías guardadas');draw()};
$('#g_rst').onclick=()=>{delete db.cfg.tabs;delete db.cfg.orden;delete db.cfg.widgets;delete db.cfg.gastosCats;save();CF.aplicar();draw();toast('Se restablecieron los valores sugeridos para tu perfil')};
$('#sg_on').onclick=async()=>{const r=await sp.seg.activar();if(r.ok){CF.mostrarClave(r.clave);CF.drawSeg()}else CF.msg(r)};
$('#sg_off').onclick=async()=>{if(!armed('sgoff'))return;const r=await sp.seg.desactivar();CF.msg(r,'Cifrado desactivado');CF.drawSeg()};
$('#sg_cp').onclick=async()=>{const r=await sp.seg.copiaProtegida($('#sg_pw').value);if(r.ok){$('#sg_pw').value='';toast('Copia protegida guardada')}else if(r.err)toast(r.err)};
$('#sg_rp').onclick=async()=>{const r=await sp.seg.restaurarProtegida($('#sg_pw').value);if(r.err)toast(r.err)};
$('#sg_https').onclick=async()=>{const r=await sp.setRemote({https:!window.__https});window.__https=!!r.https;toast(r.https?'HTTPS activado: el navegador del celular avisará una vez que el certificado es propio':'HTTPS desactivado');CF.drawSeg()};
MODS.push(CF.drawCfg);

// ---------- Privacidad (RGPD / LOPDGDD): derechos de acceso y supresión por cliente ----------
CF.datosCliente=c=>({cliente:c,ventas:db.sales.filter(s=>s.cid===c.id),pagos:db.pays.filter(p=>p.cid===c.id),cargos:db.cargos.filter(x=>x.cid===c.id),interacciones:db.inter.filter(x=>x.cid===c.id),planes:db.planes.filter(x=>x.cid===c.id),exportado:new Date().toISOString()});
CF.anonimizar=c=>{if(debtOf(c.id)>0.005)return {ok:false,err:'No se puede anonimizar mientras tenga deuda: se necesita el dato para cobrarla.'};
  const n='Cliente anonimizado '+c.id;db.sales.forEach(s=>{if(s.cid===c.id)s.cname=n});c.name=n;c.phone='';c.note='';c.notes='';c.mail='';c.doc='';c.anon=true;db.inter=db.inter.filter(x=>x.cid!==c.id);return{ok:true}};
$('#cdet').addEventListener('click',e=>{const b=e.target.closest('#cgdpr,#canon');if(!b)return;const c=cl$(cSel);if(!c)return;
  if(b.id==='cgdpr'){UT.bajar('cliente-'+c.id+'-datos.json',JSON.stringify(CF.datosCliente(c),null,2),'application/json');call('audit','privacidad.exportar_cliente','#'+c.id)}
  if(b.id==='canon'){if(!UT.chk('clientes','eliminar')||!armed('anon'+c.id))return;const r=CF.anonimizar(c);if(!r.ok)return toast(r.err);save();call('audit','privacidad.anonimizar_cliente','#'+c.id);cSel=null;toast('Cliente anonimizado');draw()}});
$('#htips').onclick=e=>{const g=e.target.closest('[data-ir]'),n=e.target.closest('[data-nt]');if(g){const b=$('nav button[data-t='+g.dataset.ir+']');if(b&&!b.classList.contains('hide'))b.click()}if(n){db.cfg.tipsOff=[...(db.cfg.tipsOff||[]),n.dataset.nt];save();draw()}};
window.arrancar=()=>{CF.aplicar();if(can('finanzas','editar')){try{if(typeof COB!=='undefined')COB.arranque();if(typeof FN!=='undefined')FN.arranque()}catch(e){console.error(e)}}if(!CF.enc()&&KIND!=='local'&&(!AU.habilitado||can('configuracion','editar')))setTimeout(()=>CF.abrirEncuesta(false),400);else{CF.avisar();const inicio=$('nav button[data-t=h]');if(CF.enc()&&inicio&&!inicio.classList.contains('hide')&&!(AU.usuario&&(AU.usuario.prefs||{}).inicio))inicio.click()}};
