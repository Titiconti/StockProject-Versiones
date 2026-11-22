// ===== Cobro con Mercado Pago (QR en pantalla y terminal Point), con la cuenta del propio comercio =====
// Todo el contacto con Mercado Pago pasa por el proceso principal (mercadopago.js): acá solo se muestra el cobro y se espera.
// Sin webhooks: se pregunta cada pocos segundos hasta que paga, vence o se cancela. Solo en el programa instalado.
const MP={QR:'Mercado Pago QR',PT:'Mercado Pago Point',INT:3000,MAX:300000,est:null,pago:null};
MP.ok=()=>ED&&!!sp.mp;
MP.TJ={'Tarjeta de débito':'debito','Tarjeta de crédito':'credito'};
// Débito/Crédito van al Point solo si el comercio lo activó y hay terminal; si no, solo se registran como siempre.
MP.es=p=>p===MP.QR||p===MP.PT||!!(MP.TJ[p]&&MP.est&&MP.est.puedeTarjetas);
const mpN=id=>String(id).padStart(6,'0');
// Si el medio es Mercado Pago y todavía no se cobró, abre el cobro y devuelve true (la venta sigue sola cuando se aprueba).
MP.paso=(pay,total,seguir)=>{if(!MP.ok()||!MP.es(pay))return false;if(MP.pago&&MP.pago.medio===pay&&Math.abs(MP.pago.monto-total)<.005)return false;MP.pago=null;MP.cobrar(pay,total,seguir);return true};
MP.marcar=s=>{if(MP.pago&&MP.es(s.pay)){const{medio,...p}=MP.pago;s.mp=p;if(MP.TJ[s.pay]&&p.tarjeta)s.pay=p.tarjeta==='credit_card'?'Tarjeta de crédito':p.tarjeta==='debit_card'?'Tarjeta de débito':s.pay}MP.pago=null};
MP.opciones=()=>{const s=$('#pay'),e=MP.est;if(!s||!e||!MP.ok())return;
  [[MP.QR,e.puedeQr],[MP.PT,e.puedePoint]].forEach(([n,on])=>{const o=[...s.options].find(x=>x.value===n);if(on&&!o)s.add(new Option(n,n));if(!on&&o)s.remove(o.index)})};
MP.cargar=async()=>{if(!MP.ok())return;MP.est=await sp.mp.estado();MP.opciones();MP.pintar()};
const mpCerrar=()=>{const o=$('#mpov');if(o)o.remove()};
MP.cobrar=async(pay,total,seguir)=>{
  const medio=pay===MP.QR?'qr':'point',tarjeta=MP.TJ[pay],e=MP.est||{};
  document.body.insertAdjacentHTML('beforeend',`<div class="ov" id="mpov" role="dialog" aria-modal="true"><div class="card" style="text-align:center"><h3>${esc(pay)}</h3><div class="tot">${fmt(total)}</div>${e.modo==='produccion'?'':'<p class="mu" style="color:var(--bad)"><b>Modo prueba:</b> no se cobra plata real</p>'}<div id="mpqr"></div><p id="mpmsg" class="mu">Creando el cobro…</p><button class="btn sec" id="mpx">Cancelar cobro</button></div></div>`);
  const msg=t=>{const m=$('#mpmsg');if(m)m.textContent=t};
  const r=await sp.mp.cobrar({medio,monto:total,tarjeta});
  if(!r||!r.ok){mpCerrar();return toast((r&&r.err)||'No se pudo iniciar el cobro')}
  if(r.qrSvg)$('#mpqr').innerHTML=`<img alt="Código QR de Mercado Pago" width="260" height="260" src="data:image/svg+xml;utf8,${encodeURIComponent(r.qrSvg)}">`;
  msg(medio==='qr'?'Pedile al cliente que escanee el código con la app de Mercado Pago':(tarjeta?'Pagá con '+(tarjeta==='debito'?'débito':'crédito')+' en la terminal Point: ':'')+'pasá la tarjeta o el celular por la terminal');
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
  $('#mp_f').classList.toggle('hide',!can('usuarios','editar'));$('#mp_pel').classList.toggle('hide',!can('usuarios','editar'));$('#mp_cb').classList.toggle('hide',!e.configurado||!can('reporte','ver'));
  UT.guiaPintar($('#mp_guia'),'mp_ig','Ver guía de instalación',MP.guia());$('#mp_m').value=e.modo;$('#mp_qr').value=e.posQr;$('#mp_pt').value=e.terminalId;$('#mp_tj').checked=!!e.tarjetasPoint;$('#mp_cw').classList.toggle('hide',$('#mp_m').value!=='produccion')};
// Guía de instalación (para quien le instala el programa a un cliente). Los tildes salen de lo que el programa sabe: token, caja, prueba de conexión, ventas, modo.
MP.guia=()=>{const e=MP.est||{},hayVenta=db.sales.some(s=>s.mp);return[
 {t:'Crear la aplicación en Mercado Pago Developers con la cuenta del CLIENTE',ok:null,d:'<p>Entrá a <b>mercadopago.com.ar/developers</b> con el usuario de Mercado Pago del dueño del negocio (no el tuyo) → <b>Tus integraciones</b> → <b>Crear aplicación</b>. Elegí pagos presenciales y la solución <b>Código QR (QR Code)</b>. <i>Verificar:</i> Mercado Pago cambia los nombres del menú.</p>'},
 {t:'Copiar las credenciales',ok:null,d:'<p>En la aplicación, <b>Credenciales de prueba</b> → copiá el <b>Access Token</b> (hay que activarlas la primera vez). No lo mandes por mail ni WhatsApp.</p>'},
 {t:'Pegar el token y guardar',ok:!!e.configurado,d:'<p>Pegalo en <b>Access Token</b> y tocá <b>Guardar</b>. Se guarda cifrado en esta PC. Dejá el modo en <b>Prueba</b>.</p>'},
 {t:'Probar la conexión',ok:!!MP.probado,d:'<p>Tocá <b>Probar conexión</b>: tiene que decir "Conexión correcta".</p>'},
 {t:'Crear la caja QR',ok:!!e.puedeQr,d:'<p><button class="btn sec" id="mp_cj_ab" aria-expanded="false" aria-controls="mp_cj">Crear caja QR automáticamente</button> Crea en la cuenta un local y una caja y carga solo el identificador en "Caja QR". Pide la dirección del local y su latitud y longitud. También podés crearla a mano en Mercado Pago y pegar su identificador externo.</p>'},
 {t:'Terminal Point',op:1,ok:!!e.puedePoint,d:'<p>Solo si el cliente usa Point: vinculala a su cuenta, ponela en modo PDV (<i>verificar</i> el nombre del menú), tocá <b>Buscar mis terminales</b>, elegila y guardá. Con <b>Cobrar débito y crédito con el Point</b> tildado, esos medios también se cobran en la terminal.</p>'},
 {t:'Probar con una venta de $10 en modo prueba',ok:hayVenta,d:'<p>En Ventas cobrá $10 con <b>Mercado Pago QR</b> y pagá con la app logueada con una cuenta compradora de prueba (Developers → Cuentas de prueba). La venta tiene que quedar registrada sola. Después probá <b>Conciliar</b>.</p>'},
 {t:'Pasar a producción',ok:e.modo==='produccion',d:'<p>En Developers activá las <b>credenciales de producción</b> del cliente (<i>verificar</i> qué datos pide Mercado Pago), pegá ese token, y en <b>Zona delicada</b> elegí <b>Producción</b>. Hacé un cobro chico real y revisalo en Conciliar.</p>'}]};
MP.fecha=()=>UT.hoy();
MP.conciliar=async()=>{const f=$('#mp_d').value||MP.fecha();$('#mp_r').textContent='Buscando…';const r=await sp.mp.conciliar(f);
  if(!r||!r.ok){$('#mp_r').textContent=(r&&r.err)||'No se pudo conciliar';return}
  const T=(t,h,rows)=>rows.length?`<h4>${t} (${rows.length})</h4><table><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr>${rows.map(c=>`<tr>${c.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</table>`:'';
  $('#mp_r').innerHTML=`<p><b>${r.coinciden.length}</b> ventas coinciden con su pago · ${r.pagos} pagos aprobados en Mercado Pago ese día.</p>`+
    T('Diferencias',['Venta','Programa','Mercado Pago','Qué pasó'],r.diferencias.map(x=>[mpN(x.venta),fmt(x.total),fmt(x.monto),esc(x.motivo)]))+
    T('Ventas sin pago en Mercado Pago',['Venta','Total'],r.ventasSinPago.map(x=>[mpN(x.venta),fmt(x.total)]))+
    T('Pagos en Mercado Pago sin venta en el programa',['Pago','Monto'],r.pagosSinVenta.map(x=>[esc(x.pago),fmt(x.monto)]))+
    (r.diferencias.length+r.ventasSinPago.length+r.pagosSinVenta.length?'<p class="mu">Los pagos sin venta pueden ser cobros que no se hicieron desde este programa.</p>':'<p style="color:var(--ok)">Todo coincide.</p>')};
if(MP.ok()){const n=$('#cfg_mp');if(n){n.insertAdjacentHTML('beforeend',`<div class="card" id="mpc" data-kw="mercado pago qr point terminal token cobrar conciliar"><h3>Cobrar con Mercado Pago</h3><p class="mu cfg-e">Es la cuenta de Mercado Pago de tu negocio: la plata va directo a vos. Mirá la guía "Conectar Mercado Pago". Empezás en modo prueba.</p><p class="mu" id="mp_e"></p>
<div id="mp_f"><div id="mp_guia"></div><div id="mp_cj" class="hide" role="group" aria-labelledby="mp_cjt" style="border:1px solid var(--bd);border-radius:10px;padding:10px 12px;margin-bottom:12px"><h4 id="mp_cjt" style="margin:0 0 6px">Crear caja QR</h4><div class="form"><div style="grid-column:span 2"><label for="mp_cn">Nombre del local</label><input id="mp_cn" maxlength="45" autocomplete="off"></div><div><label for="mp_cc1">Calle</label><input id="mp_cc1" autocomplete="off"></div><div><label for="mp_cc2">Número</label><input id="mp_cc2" inputmode="numeric" maxlength="10" autocomplete="off"></div><div><label for="mp_cc3">Localidad</label><input id="mp_cc3" autocomplete="off"></div><div><label for="mp_cc4">Provincia</label><input id="mp_cc4" autocomplete="off"></div><div><label for="mp_cla">Latitud</label><input id="mp_cla" inputmode="decimal" placeholder="-32.9442" autocomplete="off"></div><div><label for="mp_clo">Longitud</label><input id="mp_clo" inputmode="decimal" placeholder="-60.6505" autocomplete="off"></div></div><p class="mu" style="margin:6px 0">Latitud y longitud: buscá la dirección en Google Maps, clic derecho sobre el punto y copiá los dos números.</p><p id="mp_cje" role="alert" style="color:var(--bad);margin:0 0 6px"></p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="mp_cjg">Crear caja</button><button class="btn sec" id="mp_cjx">Cancelar</button></div></div>
<div class="form"><div style="grid-column:span 2"><label for="mp_t">Access Token (se guarda cifrado en esta PC)</label><input id="mp_t" type="password" autocomplete="off" placeholder="Pegalo acá"></div>
<div style="grid-column:span 2"><label class="opt"><input type="checkbox" id="mp_tj"> Cobrar débito y crédito con el Point (un solo Point para todo)</label><p class="mu" style="margin:2px 0 0">Necesita una terminal Point elegida. Si está apagado, Débito y Crédito solo se registran.</p></div><div><label for="mp_qr">Caja QR (identificador externo)</label><input id="mp_qr" autocomplete="off"></div><div><label for="mp_pt">Terminal Point</label><input id="mp_pt" autocomplete="off" list="mp_tl"><datalist id="mp_tl"></datalist></div></div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" id="mp_g">Guardar</button><button class="btn sec" id="mp_p">Probar conexión</button><button class="btn sec" id="mp_b">Buscar mis terminales</button></div></div>
<div id="mp_cb" class="hide" style="margin-top:12px"><h4>Conciliar Mercado Pago</h4><div class="form"><div><label for="mp_d">Día</label><input id="mp_d" type="date"></div></div><button class="btn sec" id="mp_cc" style="margin-top:8px">Conciliar</button></div><div id="mp_r" style="margin-top:10px"></div></div>
<div class="cfg-peligro" id="mp_pel" role="group" aria-labelledby="mp_pelt"><h3 id="mp_pelt">Zona delicada</h3><p class="mu">En modo producción se cobran pagos de verdad. Cambiá el modo solo cuando ya probaste todo.</p>
<div class="form"><div><label for="mp_m">Modo de cobro</label><select id="mp_m"><option value="prueba">Prueba (no cobra de verdad)</option><option value="produccion">Producción (cobra de verdad)</option></select></div>
<div id="mp_cw" class="hide"><label class="opt"><input type="checkbox" id="mp_c"> Entiendo que se van a cobrar pagos reales</label></div></div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sec" id="mp_g2">Guardar el modo</button><button class="btn sec" id="mp_q">Desconectar Mercado Pago</button></div></div>`);
  $('#mp_d').value=MP.fecha();
  const dec=async(p,ok)=>{const r=await p;if(r&&r.ok)toast(ok);else toast((r&&r.err)||'No se pudo');await MP.cargar();return r};
  $('#mp_m').onchange=()=>$('#mp_cw').classList.toggle('hide',$('#mp_m').value!=='produccion');
  const gd=()=>{const t=$('#mp_t').value;dec(sp.mp.guardar({token:t,modo:$('#mp_m').value,confirmaProduccion:$('#mp_c').checked,posQr:$('#mp_qr').value,terminalId:$('#mp_pt').value,tarjetasPoint:$('#mp_tj').checked}),'Mercado Pago guardado').then(r=>{if(r&&r.ok)$('#mp_t').value=''})};$('#mp_g').onclick=gd;$('#mp_g2').onclick=gd;
  $('#mp_p').onclick=async()=>{const r=await sp.mp.probar();if(!r||!r.ok)return toast((r&&r.err)||'No se pudo probar');MP.probado=true;MP.pintar();const m=MP.est&&MP.est.modo;toast('Conexión correcta'+(r.pareceDePrueba===true?' (cuenta de prueba)':r.pareceDePrueba===false&&m!=='produccion'?'. OJO: parece una cuenta real y estás en modo prueba':''))};
  $('#mp_b').onclick=async()=>{const r=await sp.mp.terminales();if(!r||!r.ok)return toast((r&&r.err)||'No se pudo buscar');$('#mp_tl').innerHTML=r.terminales.map(t=>`<option value="${esc(t.id)}">${esc(t.modo||'')}</option>`).join('');toast(r.terminales.length?r.terminales.length+' terminal(es): elegí una en el campo':'No hay terminales vinculadas')};
  $('#mp_q').onclick=()=>{if(confirm('¿Desconectar Mercado Pago de este programa?')){MP.probado=false;dec(sp.mp.quitar(),'Mercado Pago desconectado')}};
  $('#mp_guia').onclick=e=>{if(!e.target.closest('#mp_cj_ab'))return;const f=$('#mp_cj');f.classList.toggle('hide');e.target.closest('#mp_cj_ab').setAttribute('aria-expanded',!f.classList.contains('hide'));if(f.classList.contains('hide'))return;
    if(!$('#mp_cn').value){const s=db.shop||{},m=/^(.*?)[\s,]+(\d{1,6})\b[,\s-]*(.*)$/.exec(String(s.a||''));$('#mp_cn').value=(s.n||'').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,45);if(m){$('#mp_cc1').value=m[1];$('#mp_cc2').value=m[2];$('#mp_cc3').value=m[3].split(',')[0].trim()}}$('#mp_cn').focus()};
  $('#mp_cjx').onclick=()=>{$('#mp_cj').classList.add('hide');const b=$('#mp_cj_ab');if(b)b.setAttribute('aria-expanded','false')};
  $('#mp_cjg').onclick=async()=>{const b=$('#mp_cjg'),er=$('#mp_cje'),num=v=>v.trim()===''?null:Number(v.replace(',','.'));er.textContent='';
    if(MP.est&&MP.est.posQr&&!confirm('Ya hay una caja QR cargada ('+MP.est.posQr+'). ¿Crear otra y reemplazarla?'))return;
    b.disabled=true;er.textContent='Creando…';let r;try{r=await sp.mp.crearCaja({nombre:$('#mp_cn').value,calle:$('#mp_cc1').value,numero:$('#mp_cc2').value,ciudad:$('#mp_cc3').value,provincia:$('#mp_cc4').value,lat:num($('#mp_cla').value),lng:num($('#mp_clo').value)})}catch(x){r={ok:false,err:'No se pudo crear la caja'}}
    b.disabled=false;if(r&&r.ok){er.textContent='';$('#mp_cj').classList.add('hide');toast('Caja QR creada: '+r.posQr);await MP.cargar()}else er.textContent=(r&&r.err)||'No se pudo crear la caja'};
  $('#mp_cc').onclick=MP.conciliar;MODS.push(MP.opciones);MP.cargar()}}
