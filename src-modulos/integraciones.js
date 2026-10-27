// ===== Integraciones: claves de API, webhooks y catálogo de recetas =====
const IG={nuevo:null};
IG.CAT=[
 {t:'Excel o Google Sheets',d:'Cada venta en una planilla. Usá un webhook hacia Make, Zapier o n8n (que tienen conector a Sheets), o en Excel: Datos > Obtener datos > Desde la Web hacia /api/v1/ventas con el encabezado Authorization.'},
 {t:'Tienda online (Tiendanube, WooCommerce, Shopify)',d:'Un flujo en Make o Zapier llama a POST /api/v1/ventas cuando entra un pedido y descuenta tu stock. Con POST /api/v1/productos mantenés precios y stock sincronizados.'},
 {t:'Avisos al celular (Telegram, WhatsApp, correo)',d:'Un webhook de stock.bajo o venta.creada hacia n8n, Make o IFTTT te manda el aviso donde quieras.'},
 {t:'Contabilidad',d:'Exportá el libro de caja (Finanzas) y ventas o clientes (Configuración > Datos) en CSV, o consultá /api/v1/resumen mes a mes.'},
 {t:'ERP (SAP, Oracle, Odoo y similares)',d:'No incluimos conectores nativos. Se integran con la API REST en JSON o con los archivos CSV/JSON; un integrador puede armar el puente con la documentación.'},
 {t:'Otros programas de Windows',d:'Cualquier programa que pueda hacer un pedido HTTP puede consultar tus datos. Los CSV se abren con doble clic en Excel.'}];
IG.copiar=t=>{if(navigator.clipboard)navigator.clipboard.writeText(t).then(()=>toast('Copiado'));else toast(t)};
IG.render=async()=>{const box=$('#g_i');if(!EDA||!sp.int){box.innerHTML='<div class="card"><p>Las claves y webhooks se administran desde el programa de escritorio de la PC principal.</p></div>';return}
  const [tk,hk,hist,rem]=await Promise.all([sp.int.call('listarTokens'),sp.int.call('listarHooks'),sp.int.call('historial'),sp.remote()]);
  if(tk&&tk.ok===false){box.innerHTML=`<div class="card"><p>${esc(tk.err||'Sin permiso')}</p></div>`;return}
  const base=rem.running&&rem.urls[0]?rem.urls[0]:null,EV=['venta.creada','venta.anulada','stock.bajo','cliente.creado','producto.creado','pago.registrado'];
  box.innerHTML=`<div class="card"><h3>API REST</h3><p>${base?`Tu API está en <b>${esc(base)}/api/v1</b> · <a href="#" id="ig_doc">Ver documentación</a> <button class="btn sec" id="ig_cp">Copiar dirección</button>`:'Para usar la API tenés que activar el acceso remoto (pantalla Ventas &gt; Acceso desde el celular). La API responde en el mismo puerto.'}</p>
  ${IG.nuevo?`<div class="tip"><b>${esc(IG.nuevo.titulo)}:</b> <code style="word-break:break-all">${esc(IG.nuevo.valor)}</code> <button class="btn sec" id="ig_cv">Copiar</button><br><span class="mu">Guardala ahora: no se vuelve a mostrar.</span></div>`:''}
  <div class="form"><div><label>Nombre de la clave</label><input id="ig_n" placeholder="Tienda online"></div><div><label>Permiso</label><select id="ig_s"><option value="lectura">Solo lectura</option><option value="escritura">Lectura y escritura</option></select></div><div><button class="btn" id="ig_t">Crear clave</button></div></div>
  <div class="wrap" style="margin-top:8px"><table><thead><tr><th>Clave</th><th>Permiso</th><th>Último uso</th><th></th></tr></thead><tbody>${tk.map(t=>`<tr><td><b>${esc(t.nombre)}</b> <span class="mu">${esc(t.pref)}…</span></td><td>${t.scope==='lectura'?'Solo lectura':'Lectura y escritura'}</td><td>${t.ultimo?new Date(t.ultimo).toLocaleString('es-AR'):'Nunca'}</td><td><button class="btn del" data-tr="${t.id}">Revocar</button></td></tr>`).join('')||'<tr><td colspan="4" class="mu">Sin claves.</td></tr>'}</tbody></table></div></div>
  <div class="card" style="margin-top:12px"><h3>Webhooks (avisos automáticos)</h3><p class="mu" style="margin-top:0">Cuando pasa algo, StockProject avisa a la dirección que elijas con un mensaje firmado. Se reintenta 3 veces y se pausa tras 20 fallos seguidos.</p>
  <div class="form"><div style="grid-column:span 2"><label>Dirección que recibe los avisos</label><input id="hk_u" placeholder="https://…"></div></div><div style="margin:8px 0">${EV.map(e=>`<label class="opt" style="display:inline-flex;margin-right:6px"><input type="checkbox" data-ev="${e}" ${['venta.creada','stock.bajo'].includes(e)?'checked':''}> ${e}</label>`).join('')}</div><button class="btn" id="hk_g">Crear webhook</button>
  <div class="wrap" style="margin-top:8px"><table><tbody>${hk.map(h=>`<tr><td style="word-break:break-all"><b>${esc(h.url)}</b><br><span class="mu">${h.eventos.join(', ')}</span></td><td>${h.activo?'<span class="tag">Activo</span>':'<span class="tag out">Pausado</span>'}<br><span class="mu">${esc(h.estado||'Sin envíos')}</span></td><td><button class="btn sec" data-hp="${h.id}">Probar</button> ${h.activo?'':`<button class="btn sec" data-ha="${h.id}">Reactivar</button> `}<button class="btn del" data-hd="${h.id}">Borrar</button></td></tr>`).join('')||'<tr><td class="mu">Sin webhooks.</td></tr>'}</tbody></table></div>
  ${hist.length?`<details><summary>Últimos envíos</summary><div class="wrap"><table><tbody>${hist.slice(0,15).map(x=>`<tr><td>${esc(x.evento)}</td><td>${x.ok?'✓':'✗'} ${esc(x.estado)}</td></tr>`).join('')}</tbody></table></div></details>`:''}</div>
  <div class="card" style="margin-top:12px"><h3>Recetas para conectar</h3><div class="grid">${IG.CAT.map(c=>`<div class="tip"><b>${esc(c.t)}</b><br>${esc(c.d)}</div>`).join('')}</div></div>`;IG.base=base};
IG.ver=r=>{if(r&&r.ok===false){toast(r.err||'No se pudo completar');return false}return true};
$('#g_i').onclick=async e=>{const b=e.target.closest('button,a');if(!b)return;const d=b.dataset;if(b.id==='ig_doc'){e.preventDefault();window.open(IG.base+'/api/v1/docs','_blank')}
  if(b.id==='ig_cp')IG.copiar(IG.base+'/api/v1');if(b.id==='ig_cv')IG.copiar(IG.nuevo.valor);
  if(b.id==='ig_t'){const r=await sp.int.call('crearToken',$('#ig_n').value,$('#ig_s').value);if(!IG.ver(r))return;IG.nuevo={titulo:'Tu clave',valor:r.token};IG.render()}
  if(d.tr){if(!armed('tr'+d.tr))return;await sp.int.call('revocarToken',+d.tr);IG.nuevo=null;IG.render()}
  if(b.id==='hk_g'){const ev=$$('#g_i [data-ev]:checked').map(x=>x.dataset.ev),r=await sp.int.call('crearHook',{url:$('#hk_u').value.trim(),eventos:ev});if(!IG.ver(r))return;IG.nuevo={titulo:'Secreto para verificar la firma',valor:r.secreto};IG.render()}
  if(d.hp){const r=await sp.int.call('probar',+d.hp);toast(r.ok?'El destino respondió bien':'El destino no respondió bien');IG.render()}
  if(d.ha){await sp.int.call('activarHook',+d.ha);IG.render()}
  if(d.hd){if(!armed('hd'+d.hd))return;await sp.int.call('borrarHook',+d.hd);IG.render()}};
CF.extras.integraciones=sub=>{if(sub==='i'&&!$('#g_i').dataset.r){$('#g_i').dataset.r=1;IG.render()}};
document.querySelector('#gp').addEventListener('click',e=>{if(e.target.dataset&&e.target.dataset.s==='i'){$('#g_i').dataset.r='';}});
