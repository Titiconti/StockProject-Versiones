// ===== Panel para ver el negocio desde el celular (desde cualquier lugar, solo consulta) =====
// Al terminar la encuesta con el nombre del negocio, el programa crea su panel en Internet y empieza a enviarle los datos.
// Si no hay conexión en ese momento, queda pendiente y se crea solo cuando vuelve. Solo en el programa instalado.
const NB={};
NB.ok=()=>ED&&!!sp.nube;
NB.listo=r=>{if(!r||!r.ok)return;document.body.insertAdjacentHTML('beforeend',`<div class="ov" id="nbok" role="dialog" aria-modal="true"><div class="card"><h3>Tu panel está listo</h3><p class="mu" style="margin-top:0">Desde el celular o cualquier computadora, entrá a esta dirección y escribí la clave. Solo se puede consultar: ventas, estadísticas, stock y caja.</p>
<label>Dirección</label><input readonly value="${esc(r.panel||'')}" style="width:100%;margin-bottom:10px"><label>Clave</label><input readonly value="${esc(r.clave||'')}" style="width:100%;font:600 18px ui-monospace,monospace;letter-spacing:.08em"><p class="mu">Anotala o mandatela por WhatsApp. Siempre la volvés a ver en Configuración > Mi negocio > Ver mi negocio desde el celular.</p><button class="btn" id="nbok_x">Listo</button></div></div>`);
  const x=()=>{const o=$('#nbok');if(o)o.parentNode.removeChild(o)};$('#nbok_x').onclick=x;$('#nbok').addEventListener('keydown',e=>{if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();x()}});$('#nbok_x').focus()};
// Reglas de una clave elegida por el usuario (las mismas que valida el servidor). '' = está bien.
NB.errClave=(k,nombre)=>{k=String(k||'').trim();if(k.length<8||k.length>64)return 'La clave tiene que tener entre 8 y 64 caracteres';if(!/\p{L}/u.test(k)||!/\p{N}/u.test(k))return 'La clave tiene que tener al menos una letra y un número';if(nombre&&k.toLowerCase()===String(nombre).trim().toLowerCase())return 'La clave no puede ser igual al nombre del negocio';return ''};
// Lo llama la encuesta al terminar (clave: opcional, la que eligió el usuario).
NB.crear=async(nombre,clave)=>{if(!NB.ok())return null;const r=await sp.nube.call('registrar',clave?{nombre,clave}:nombre);if(r&&r.ok)NB.listo(r);else if(r&&r.pendiente)toast('No hay conexión: tu panel se va a crear solo cuando vuelva Internet');else if(r&&r.err&&!/ya tiene/.test(r.err))toast(r.err);NB.draw&&NB.draw();return r};
if(NB.ok()){const n=$('[data-sub="n"]');n.insertAdjacentHTML('beforeend',`<details class="card" id="nb"><summary>Ver mi negocio desde el celular</summary><div id="nb_e"></div>
<div id="nb_crear" style="margin-top:10px"><button class="btn" id="nb_c">Crear mi panel</button></div>
<div id="nb_acc" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sec" id="nb_v">Ver la clave</button><button class="btn sec" id="nb_s">Enviar ahora</button><button class="btn sec" id="nb_a"></button><button class="btn sec" id="nb_k" aria-expanded="false" aria-controls="nb_kf">Cambiar la clave</button></div>
<form id="nb_kf" class="hide" style="margin-top:10px" autocomplete="off"><div class="form"><div><label for="nb_k1">Clave nueva</label><input id="nb_k1" type="password" autocomplete="new-password" maxlength="64"></div><div><label for="nb_k2">Repetila</label><input id="nb_k2" type="password" autocomplete="new-password" maxlength="64"></div></div><p class="mu" style="margin:4px 0 8px;font-size:13px">Mínimo 8, con letras y números. Distingue mayúsculas. Se cierra la sesión en los celulares que estaban dentro.</p><div style="display:flex;gap:8px"><button class="btn" type="submit" id="nb_kg">Guardar la clave</button><button class="btn sec" type="button" id="nb_kx">Cancelar</button></div></form>
<details class="dt" style="margin-top:10px"><summary class="mu">Conectar con datos de soporte</summary><div class="form" style="margin-top:8px"><div style="grid-column:span 2"><label>Dirección del servidor</label><input id="nb_u" autocomplete="off"></div><div style="grid-column:span 2"><label>Clave de instalación</label><input id="nb_t" type="password" placeholder="spn_…" autocomplete="off"></div><div style="grid-column:span 2"><label>Dirección del panel</label><input id="nb_p" autocomplete="off"></div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" id="nb_g">Guardar y conectar</button><button class="btn del" id="nb_q">Desconectar</button></div></details>
<p class="mu" style="margin:10px 0 0;font-size:13px">Desde el celular solo se puede consultar: no se puede vender, cobrar ni cambiar nada. Se envían ventas, stock, cajas y los saldos de clientes (nombre y saldo). Si se corta Internet el programa sigue funcionando y se pone al día solo.</p></details>`);
  NB.draw=async()=>{if($('#g').classList.contains('hide')||!$('#nb').open)return;const e=await sp.nube.estado(),F=x=>new Date(x).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'});
    $('#nb_e').innerHTML=e.configurado?`<div class="tip" style="border-left-color:var(--${e.error?'warn':e.activo?'ok':'bd'})"><b>${e.activo?(e.error?'Con problemas':'Funcionando'):'En pausa'}</b>${e.ultima?' · último envío: '+F(e.ultima):' · todavía no se envió nada'}${e.error?'<br>'+esc(e.error):''}${e.panel?`<br>Tu panel: <b>${esc(e.panel)}</b>`:''}</div>`
      :e.pendiente?`<div class="tip" style="border-left-color:var(--warn)">Tu panel "${esc(e.pendiente)}" se va a crear solo cuando haya Internet.${e.error?'<br>'+esc(e.error):''}</div>`
      :`<p class="mu" style="margin:0">Creá tu panel para ver las ventas y las estadísticas desde el celular, desde cualquier lugar.</p>`;
    $('#nb_crear').classList.toggle('hide',e.configurado||!!e.pendiente||!e.puedeCrear);$('#nb_acc').classList.toggle('hide',!e.configurado);if(!e.configurado)$('#nb_kf').classList.add('hide');$('#nb_v').classList.toggle('hide',!e.tieneClave);$('#nb_a').textContent=e.activo?'Pausar':'Reanudar'};
  const hacer=async(n,a,ok)=>{const r=await sp.nube.call(n,a);if(r&&r.err)toast(r.err);else if(ok)toast(ok);NB.draw();return r};
  $('#nb_c').onclick=async()=>{const n=((db.shop&&db.shop.n)||'').trim();if(!n||n==='StockProject')return toast('Primero escribí el nombre de tu negocio en Reportes > Herramientas > Datos del comercio');$('#nb_c').disabled=true;try{await NB.crear(n)}finally{$('#nb_c').disabled=false}};
  $('#nb_v').onclick=async()=>{const r=await sp.nube.call('clave');const e=await sp.nube.estado();if(r&&r.clave)NB.listo({ok:true,panel:e.panel,clave:r.clave});else toast(r&&r.err||'No se pudo leer la clave')};
  $('#nb_g').onclick=async()=>{const r=await hacer('configurar',{url:$('#nb_u').value,token:$('#nb_t').value,panel:$('#nb_p').value},'Guardado: enviando los datos…');if(r&&r.ok){$('#nb_t').value='';setTimeout(NB.draw,2500)}};
  $('#nb_s').onclick=async()=>{const r=await hacer('ahora');if(r&&!r.err)toast(r.error?r.error:'Datos enviados')};
  $('#nb_a').onclick=async()=>{const e=await sp.nube.estado();hacer('activar',!e.activo,e.activo?'Envío en pausa':'Envío reanudado')};
  $('#nb_q').onclick=()=>{if(!armed('nbq'))return toast('Tocá de nuevo para desconectar el panel');arm='';hacer('quitar',null,'Panel desconectado')};
  const kForm=on=>{$('#nb_kf').classList.toggle('hide',!on);$('#nb_k').setAttribute('aria-expanded',on?'true':'false');$('#nb_k1').value=$('#nb_k2').value='';if(on)$('#nb_k1').focus()};
  $('#nb_k').onclick=()=>kForm($('#nb_kf').classList.contains('hide'));$('#nb_kx').onclick=()=>kForm(false);
  $('#nb_kf').onsubmit=async ev=>{ev.preventDefault();const a=$('#nb_k1').value,b=$('#nb_k2').value,er=NB.errClave(a,(db.shop&&db.shop.n)||'');if(er){$('#nb_k1').focus();return toast(er)}if(a!==b){$('#nb_k2').focus();return toast('Las dos claves no coinciden')}
    $('#nb_kg').disabled=true;try{const r=await sp.nube.call('cambiarClave',a);if(r&&r.ok){kForm(false);toast('Listo: la clave del panel cambió')}else toast(r&&r.err||'No se pudo cambiar la clave')}finally{$('#nb_kg').disabled=false}};
  $('#nb').addEventListener('toggle',()=>NB.draw());MODS.push(NB.draw)}
// ---- Cambios de precio pedidos por el dueño desde el celular ----
// Los aplica el proceso principal (ver precios-remoto.js) y acá solo se refleja lo hecho, sin pisar lo que el usuario está tocando:
// se actualiza el precio en memoria, el historial y la versión, y se avisa con un cartelito. No se redibuja si hay una ventana abierta.
const PCEL={};
PCEL.refrescar=info=>{if(!info||!Array.isArray(info.cambios)||!info.cambios.length)return;
  info.cambios.forEach(c=>{const p=db.prods.find(x=>x.id===c.pid);if(p)p.price=c.precio});
  if(Array.isArray(info.ajustes)){db.ajustes=info.ajustes;db.ajid=info.ajid}if(Array.isArray(info.preciosCel))db.preciosCel=info.preciosCel;
  if(typeof info.rev==='number'){rev=info.rev;db.rev=info.rev}
  const c0=info.cambios[0];toast('El dueño cambió el precio de '+c0.nombre+' desde el celular'+(info.cambios.length>1?' (y '+(info.cambios.length-1)+' más)':''));
  if(!document.querySelector('.ov'))draw()};
if(ED&&sp.precios)sp.precios.alCambiar(PCEL.refrescar);
