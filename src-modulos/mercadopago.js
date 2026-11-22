// ===== Cobro con Mercado Pago (QR en pantalla y terminal Point), con la cuenta del propio comercio =====
// Todo el contacto con Mercado Pago pasa por el proceso principal (mercadopago.js): acá solo se muestra el cobro y se espera.
// Sin webhooks: se pregunta cada pocos segundos hasta que paga, vence o se cancela. Solo en el programa instalado.
const MP={QR:'Mercado Pago QR',PT:'Mercado Pago Point',INT:3000,MAX:300000,est:null,pago:null};
MP.ok=()=>ED&&!!sp.mp;
MP.es=p=>p===MP.QR||p===MP.PT;
const mpN=id=>String(id).padStart(6,'0');
// Si el medio es Mercado Pago y todavía no se cobró, abre el cobro y devuelve true (la venta sigue sola cuando se aprueba).
MP.paso=(pay,total,seguir)=>{if(!MP.ok()||!MP.es(pay))return false;if(MP.pago&&MP.pago.medio===pay&&Math.abs(MP.pago.monto-total)<.005)return false;MP.pago=null;MP.cobrar(pay,total,seguir);return true};
MP.marcar=s=>{if(MP.pago&&MP.es(s.pay)){const{medio,...p}=MP.pago;s.mp=p}MP.pago=null};
MP.opciones=()=>{const s=$('#pay'),e=MP.est;if(!s||!e||!MP.ok())return;
  [[MP.QR,e.puedeQr],[MP.PT,e.puedePoint]].forEach(([n,on])=>{const o=[...s.options].find(x=>x.value===n);if(on&&!o)s.add(new Option(n,n));if(!on&&o)s.remove(o.index)})};
MP.cargar=async()=>{if(!MP.ok())return;MP.est=await sp.mp.estado();MP.opciones();MP.pintar()};
const mpCerrar=()=>{const o=$('#mpov');if(o)o.remove()};
MP.cobrar=async(pay,total,seguir)=>{
  const medio=pay===MP.QR?'qr':'point',e=MP.est||{};
  document.body.insertAdjacentHTML('beforeend',`<div class="ov" id="mpov" role="dialog" aria-modal="true"><div class="card" style="text-align:center"><h3>${esc(pay)}</h3><div class="tot">${fmt(total)}</div>${e.modo==='produccion'?'':'<p class="mu" style="color:var(--bad)"><b>Modo prueba:</b> no se cobra plata real</p>'}<div id="mpqr"></div><p id="mpmsg" class="mu">Creando el cobro…</p><button class="btn sec" id="mpx">Cancelar cobro</button></div></div>`);
  const msg=t=>{const m=$('#mpmsg');if(m)m.textContent=t};
  const r=await sp.mp.cobrar({medio,monto:total});
  if(!r||!r.ok){mpCerrar();return toast((r&&r.err)||'No se pudo iniciar el cobro')}
  if(r.qrSvg)$('#mpqr').innerHTML=`<img alt="Código QR de Mercado Pago" width="260" height="260" src="data:image/svg+xml;utf8,${encodeURIComponent(r.qrSvg)}">`;
  msg(medio==='qr'?'Pedile al cliente que escanee el código con la app de Mercado Pago':'Pasá la tarjeta o el celular por la terminal Point');
  let fin=false;const t0=Date.now();
  const resolver=q=>{ // true = terminó
    if(q.estado==='aprobado'){fin=true;mpCerrar();
      if(db.sales.some(s=>!s.void&&s.mp&&s.mp.pago===q.pago.pago)){toast('Ese pago ya estaba registrado en otra venta');return true}
      MP.pago={...q.pago,medio:pay};toast('Pago aprobado');seguir();return true}
    if(['cancelado','expirado','rechazado','devuelto','diferencia','yaRegistrado'].includes(q.estado)){fin=true;mpCerrar();toast(q.msg||'El cobro no se completó');return true}
    if(q.msg)msg(q.msg);return false};
  const cancelar=async()=>{const q=await sp.mp.cancelar(r.orden);if(!q||!q.ok){msg((q&&q.err)||'No se pudo cancelar: seguimos esperando');return false}
    if(q.estado==='cancelado'&&!q.msg){fin=true;mpCerrar();toast('Cobro cancelado: podés elegir otro medio');return true}
    return resolver(q)};
  $('#mpx').onclick=()=>{if(!fin){$('#mpx').disabled=true;cancelar().then(f=>{if(!f&&$('#mpx'))$('#mpx').disabled=false})}};
  const tic=async()=>{if(fin)return;
    if(Date.now()-t0>MP.MAX){msg('Se acabó el tiempo: cancelando…');if(await cancelar())return;return setTimeout(tic,MP.INT)}
    const q=await sp.mp.consultar(r.orden);if(fin)return;
    if(!q||!q.ok)msg((q&&q.err)||'Sin conexión: sigo intentando');else if(resolver(q))return;
    setTimeout(tic,MP.INT)};
  setTimeout(tic,MP.INT)};
// ---- Configuración (solo administrador) y conciliación ----
MP.pintar=()=>{const e=MP.est,d=$('#mpc');if(!d||!e)return;
  $('#mp_e').innerHTML=e.configurado?`Conectado (token terminado en ${esc(e.fin)}) · Modo <b>${e.modo==='produccion'?'PRODUCCIÓN (cobra de verdad)':'prueba'}</b>`:'Todavía no conectaste Mercado Pago.';
  $('#mp_f').classList.toggle('hide',!can('usuarios','editar'));$('#mp_cb').classList.toggle('hide',!e.configurado||!can('reporte','ver'));
  $('#mp_m').value=e.modo;$('#mp_qr').value=e.posQr;$('#mp_pt').value=e.terminalId;$('#mp_cw').classList.toggle('hide',$('#mp_m').value!=='produccion')};
MP.fecha=()=>UT.hoy();
MP.conciliar=async()=>{const f=$('#mp_d').value||MP.fecha();$('#mp_r').textContent='Buscando…';const r=await sp.mp.conciliar(f);
  if(!r||!r.ok){$('#mp_r').textContent=(r&&r.err)||'No se pudo conciliar';return}
  const T=(t,h,rows)=>rows.length?`<h4>${t} (${rows.length})</h4><table><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr>${rows.map(c=>`<tr>${c.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</table>`:'';
  $('#mp_r').innerHTML=`<p><b>${r.coinciden.length}</b> ventas coinciden con su pago · ${r.pagos} pagos aprobados en Mercado Pago ese día.</p>`+
    T('Diferencias',['Venta','Programa','Mercado Pago','Qué pasó'],r.diferencias.map(x=>[mpN(x.venta),fmt(x.total),fmt(x.monto),esc(x.motivo)]))+
    T('Ventas sin pago en Mercado Pago',['Venta','Total'],r.ventasSinPago.map(x=>[mpN(x.venta),fmt(x.total)]))+
    T('Pagos en Mercado Pago sin venta en el programa',['Pago','Monto'],r.pagosSinVenta.map(x=>[esc(x.pago),fmt(x.monto)]))+
    (r.diferencias.length+r.ventasSinPago.length+r.pagosSinVenta.length?'<p class="mu">Los pagos sin venta pueden ser cobros que no se hicieron desde este programa.</p>':'<p style="color:var(--ok)">Todo coincide.</p>')};
if(MP.ok()){const n=$('[data-sub="n"]');if(n){n.insertAdjacentHTML('beforeend',`<details class="card" id="mpc"><summary>Cobrar con Mercado Pago</summary><p class="mu" id="mp_e"></p>
<div id="mp_f"><p class="mu">Es la cuenta de Mercado Pago de tu negocio: la plata va directo a vos. Mirá la guía "Conectar Mercado Pago". Empezá en modo prueba.</p>
<div class="form"><div style="grid-column:span 2"><label>Access Token (se guarda cifrado en esta PC)</label><input id="mp_t" type="password" autocomplete="off" placeholder="Pegalo acá"></div>
<div><label>Modo</label><select id="mp_m"><option value="prueba">Prueba (no cobra de verdad)</option><option value="produccion">Producción (cobra de verdad)</option></select></div>
<div id="mp_cw" class="hide"><label><input type="checkbox" id="mp_c"> Entiendo que se van a cobrar pagos reales</label></div>
<div><label>Caja QR (identificador externo)</label><input id="mp_qr" autocomplete="off"></div><div><label>Terminal Point</label><input id="mp_pt" autocomplete="off" list="mp_tl"><datalist id="mp_tl"></datalist></div></div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" id="mp_g">Guardar</button><button class="btn sec" id="mp_p">Probar conexión</button><button class="btn sec" id="mp_b">Buscar mis terminales</button><button class="btn sec" id="mp_q">Desconectar</button></div></div>
<div id="mp_cb" class="hide" style="margin-top:12px"><h4>Conciliar Mercado Pago</h4><div class="form"><div><label>Día</label><input id="mp_d" type="date"></div></div><button class="btn sec" id="mp_cc" style="margin-top:8px">Conciliar</button></div><div id="mp_r" style="margin-top:10px"></div></details>`);
  $('#mp_d').value=MP.fecha();
  const dec=async(p,ok)=>{const r=await p;if(r&&r.ok)toast(ok);else toast((r&&r.err)||'No se pudo');await MP.cargar();return r};
  $('#mp_m').onchange=()=>$('#mp_cw').classList.toggle('hide',$('#mp_m').value!=='produccion');
  $('#mp_g').onclick=()=>{const t=$('#mp_t').value;dec(sp.mp.guardar({token:t,modo:$('#mp_m').value,confirmaProduccion:$('#mp_c').checked,posQr:$('#mp_qr').value,terminalId:$('#mp_pt').value}),'Mercado Pago guardado').then(r=>{if(r&&r.ok)$('#mp_t').value=''})};
  $('#mp_p').onclick=async()=>{const r=await sp.mp.probar();if(!r||!r.ok)return toast((r&&r.err)||'No se pudo probar');const m=MP.est&&MP.est.modo;toast('Conexión correcta'+(r.pareceDePrueba===true?' (cuenta de prueba)':r.pareceDePrueba===false&&m!=='produccion'?'. OJO: parece una cuenta real y estás en modo prueba':''))};
  $('#mp_b').onclick=async()=>{const r=await sp.mp.terminales();if(!r||!r.ok)return toast((r&&r.err)||'No se pudo buscar');$('#mp_tl').innerHTML=r.terminales.map(t=>`<option value="${esc(t.id)}">${esc(t.modo||'')}</option>`).join('');toast(r.terminales.length?r.terminales.length+' terminal(es): elegí una en el campo':'No hay terminales vinculadas')};
  $('#mp_q').onclick=()=>{if(confirm('¿Desconectar Mercado Pago de este programa?'))dec(sp.mp.quitar(),'Mercado Pago desconectado')};
  $('#mp_cc').onclick=MP.conciliar;MODS.push(MP.opciones);MP.cargar()}}
