// ===== Panel para el celular desde cualquier lugar (solo consulta) =====
// La PC envía los datos al servidor; desde el celular se ven ventas y estadísticas con una dirección propia del comercio.
// Solo aparece en el programa instalado. La dirección y la clave de instalación las entrega soporte al dar de alta el comercio.
const NB={};
if(ED&&sp.nube){const n=$('[data-sub="n"]');n.insertAdjacentHTML('beforeend',`<details class="card" id="nb"><summary>Ver mi negocio desde el celular (desde cualquier lugar)</summary><div id="nb_e"></div>
<div class="form" style="margin-top:10px"><div style="grid-column:span 2"><label>Dirección del servidor</label><input id="nb_u" placeholder="https://stockproject.qd.je" autocomplete="off"></div><div style="grid-column:span 2"><label>Clave de instalación</label><input id="nb_t" type="password" placeholder="spn_…" autocomplete="off"></div><div style="grid-column:span 2"><label>Dirección de tu panel (para compartir)</label><input id="nb_p" placeholder="https://minegocio.stockproject.qd.je" autocomplete="off"></div></div>
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="nb_g">Guardar y conectar</button><button class="btn sec" id="nb_s">Enviar ahora</button><button class="btn sec" id="nb_a"></button><button class="btn del" id="nb_q">Quitar</button></div>
<p class="mu" style="margin:10px 0 0;font-size:13px">Desde el celular solo se puede consultar: no se puede vender, cobrar ni cambiar nada. Se envían ventas, stock, cajas y los saldos de clientes (nombre y saldo). Si se corta Internet el programa sigue funcionando y se pone al día solo.</p></details>`);
  NB.draw=async()=>{if($('#g').classList.contains('hide')||!$('#nb').open)return;const e=await sp.nube.estado(),F=x=>new Date(x).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'medium'});
    $('#nb_e').innerHTML=!e.configurado?'<p class="mu" style="margin:0">Todavía no está conectado. Pedí a soporte la dirección y la clave de instalación de tu comercio.</p>':`<div class="tip" style="border-left-color:var(--${e.error?'warn':e.activo?'ok':'bd'})"><b>${e.activo?(e.error?'Con problemas':'Conectado'):'En pausa'}</b>${e.ultima?' · último envío: '+F(e.ultima):' · todavía no se envió nada'}${e.error?'<br>'+esc(e.error):''}${e.panel?`<br>Tu panel: <b>${esc(e.panel)}</b>`:''}</div>`;
    if(document.activeElement.id!=='nb_u'&&!$('#nb_u').value)$('#nb_u').value=e.url;if(document.activeElement.id!=='nb_p'&&!$('#nb_p').value)$('#nb_p').value=e.panel;
    $('#nb_a').textContent=e.activo?'Pausar':'Reanudar';['#nb_s','#nb_a','#nb_q'].forEach(x=>$(x).classList.toggle('hide',!e.configurado))};
  const hacer=async(n,a,ok)=>{const r=await sp.nube.call(n,a);if(r&&r.err)toast(r.err);else if(ok)toast(ok);NB.draw();return r};
  $('#nb_g').onclick=async()=>{const r=await hacer('configurar',{url:$('#nb_u').value,token:$('#nb_t').value,panel:$('#nb_p').value},'Guardado: enviando los datos…');if(r&&r.ok){$('#nb_t').value='';setTimeout(NB.draw,2500)}};
  $('#nb_s').onclick=async()=>{const r=await hacer('ahora');if(r&&!r.err)toast(r.error?r.error:'Datos enviados')};
  $('#nb_a').onclick=async()=>{const e=await sp.nube.estado();hacer('activar',!e.activo,e.activo?'Envío en pausa':'Envío reanudado')};
  $('#nb_q').onclick=()=>{if(!armed('nbq'))return toast('Tocá de nuevo para quitar la conexión con el panel');arm='';hacer('quitar',null,'Conexión quitada');$('#nb_u').value=$('#nb_p').value=''};
  $('#nb').addEventListener('toggle',()=>NB.draw());MODS.push(NB.draw)}
