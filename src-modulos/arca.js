// ===== Facturación electrónica con ARCA (ex AFIP) =====
// Todo lo que habla con ARCA vive en el proceso principal (arca.js, arca-ws.js); acá solo está la pantalla: asistente de conexión en Configuración,
// botón "Facturar" en el historial, facturación automática al cobrar, reintento de las pendientes y el bloque fiscal (CAE + QR) del comprobante.
// La factura se guarda en la venta como `fe`: { estado:'ok', letra, ptoVta, nro, cae, vto, fecha, receptor, emisor, qr, amb } (o 'pendiente' / 'error').
const FA={e:null,busy:false,qrC:{}};
FA.ok=()=>ED&&!!sp.arca;
FA.COND={5:'Consumidor final',1:'Responsable inscripto',6:'Monotributo',4:'Exento',13:'Monotributista social',16:'Monotributo trabajador independiente',15:'IVA no alcanzado',7:'No categorizado'};
FA.num=f=>String(f.ptoVta).padStart(4,'0')+'-'+String(f.nro).padStart(8,'0');
FA.nombre=f=>'Factura '+f.letra+' '+FA.num(f);
FA.fecha=iso=>iso&&/^\d{4}-\d{2}-\d{2}$/.test(iso)?iso.split('-').reverse().join('/'):'';
FA.cargar=async()=>{if(!FA.ok())return FA.e=null;try{FA.e=await sp.arca.estado()}catch(x){FA.e=null}return FA.e};
// Qué letra se emite: C para monotributo; A (cliente inscripto con CUIT) o B para responsable inscripto.
FA.letra=(docTipo,cond)=>FA.e&&FA.e.cfg.condIva==='monotributo'?'C':(+docTipo===80&&[1,6,13,16].includes(+cond)?'A':'B');
FA.receptorDe=c=>{const d=String(c&&c.doc||'').replace(/\D/g,''),t=d.length===11?80:d.length>=7&&d.length<=8?96:99;return{docTipo:t,docNro:t===99?'0':d,condIva:c&&c.iva?+c.iva:t===80?1:5}};

// Pide el comprobante a ARCA y guarda el resultado en la venta. Si no hay internet queda "pendiente" y se reintenta sola.
FA.emitir=async(id,receptor,callado)=>{const s=db.sales.find(x=>x.id===id);if(!s||s.void||(s.fe&&s.fe.cae))return null;
  let r;try{r=await sp.arca.facturar(id,receptor)}catch(x){r={ok:false,err:'No se pudo facturar'}}
  const v=db.sales.find(x=>x.id===id);if(!v)return r;
  if(r.ok){v.fe=r.fe;save();draw();if(!callado)toast(FA.nombre(r.fe)+' emitida · CAE '+r.fe.cae)}
  else{v.fe={estado:r.pendiente?'pendiente':'error',err:String(r.err||'').slice(0,300),receptor};save();draw();if(!callado)toast(r.pendiente?'Sin conexión con ARCA: queda pendiente de facturar y se reintenta sola':'No se pudo facturar: '+r.err)}
  return r};
// Gancho de cobrar: según el modo elegido por el comercio (a pedido / siempre / solo clientes marcados).
FA.alCobrar=s=>{if(!FA.ok()||!FA.e||!FA.e.listo||!s)return;const c=s.cid?cl$(s.cid):null,m=FA.e.cfg.modo;
  if(m==='siempre'||(m==='clientes'&&c&&c.facturar))FA.emitir(s.id,FA.receptorDe(c))};
FA.reintentar=async()=>{if(FA.busy||!FA.ok())return;FA.busy=true;try{await FA.cargar();if(!FA.e||!FA.e.listo)return;
  for(const s of db.sales.filter(x=>!x.void&&x.fe&&x.fe.estado==='pendiente').slice(0,5)){const r=await FA.emitir(s.id,s.fe.receptor,true);if(r&&!r.ok&&r.pendiente)break}}finally{FA.busy=false}};

// Historial: etiqueta de la factura o botón para emitirla.
FA.tag=s=>`<span class="tag" title="CAE ${esc(s.fe.cae)}">${esc(FA.nombre(s.fe))}</span>`;
FA.fila=s=>{if(s.fe&&s.fe.cae)return FA.tag(s);if(!FA.ok()||!FA.e||!FA.e.listo)return'';const f=s.fe&&s.fe.estado;
  return `<button class="btn sec" data-fa="${s.id}">${f==='pendiente'?'Reintentar factura':'Facturar'}</button>`+(f==='pendiente'?' <span class="tag low">Pendiente de facturar</span>':f==='error'?` <span class="tag out" title="${esc(s.fe.err||'')}">No se pudo facturar</span>`:'')};
FA.dialogo=s=>{const c=s.cid?cl$(s.cid):null,r=s.fe&&s.fe.receptor||FA.receptorDe(c),prueba=FA.e.cfg.ambiente!=='produccion';
  document.body.insertAdjacentHTML('beforeend',`<div class="ov" id="fad" role="dialog" aria-modal="true"><div class="card" style="max-width:460px"><h3>Facturar la venta N.º ${String(s.id).padStart(6,'0')} · ${fmt(s.total)}</h3>
  ${prueba?'<div class="tip" style="border-left-color:var(--warn)">Modo de prueba: estas facturas no tienen validez fiscal.</div>':''}
  <div class="form"><div><label for="fad_t">Documento del cliente</label><select id="fad_t"><option value="99">Consumidor final (sin identificar)</option><option value="96">DNI</option><option value="80">CUIT</option><option value="86">CUIL</option></select></div>
  <div><label for="fad_n">Número</label><input id="fad_n" inputmode="numeric" maxlength="11" autocomplete="off"></div>
  <div style="grid-column:span 2"><label for="fad_c">Condición del cliente frente al IVA</label><select id="fad_c">${Object.entries(FA.COND).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div></div>
  <p class="mu" id="fad_l" style="margin:8px 0"></p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn sec" id="fad_x">Cancelar</button><button class="btn" id="fad_ok">Emitir factura</button></div></div></div>`);
  $('#fad_t').value=r.docTipo;$('#fad_n').value=r.docTipo===99?'':r.docNro;$('#fad_c').value=r.condIva;
  const act=()=>{const t=+$('#fad_t').value;$('#fad_n').disabled=t===99;if(t===99){$('#fad_n').value='';$('#fad_c').value='5'}$('#fad_l').textContent='Se emite una Factura '+FA.letra(t,$('#fad_c').value)+'.'};
  $('#fad_t').onchange=$('#fad_c').onchange=act;act();const x=()=>{const o=$('#fad');if(o)o.remove()};$('#fad_x').onclick=x;
  $('#fad_ok').onclick=async()=>{const t=+$('#fad_t').value,rc={docTipo:t,docNro:t===99?'0':$('#fad_n').value.replace(/\D/g,''),condIva:+$('#fad_c').value};$('#fad_ok').disabled=true;await FA.emitir(s.id,rc);x();
    const v=db.sales.find(y=>y.id===s.id);if(v&&v.fe&&v.fe.cae&&$('#prt')&&$('#prt').checked)printTicket(v)}};
if(FA.ok()){const h=$('#hist');if(h)h.addEventListener('click',e=>{const b=e.target.closest('[data-fa]');if(!b)return;e.stopImmediatePropagation();const s=db.sales.find(x=>x.id==b.dataset.fa);if(s&&FA.e&&FA.e.listo)FA.dialogo(s)},true)}

// Bloque fiscal del comprobante: datos obligatorios, CAE y QR oficial. El QR se dibuja en el proceso principal (necesitaFA.cargarQr antes de mostrar).
FA.necesitaQr=s=>FA.ok()&&s&&s.fe&&s.fe.cae&&s.fe.qr&&!(s.fe.cae in FA.qrC);
FA.cargarQr=async s=>{try{FA.qrC[s.fe.cae]=await sp.arca.qr(s.fe.qr)}catch(x){FA.qrC[s.fe.cae]=''}};
FA.bloque=s=>{const f=s&&s.fe;if(!f||!f.cae)return'';const e=f.emisor||{},r=f.receptor||{},dc={80:'CUIT',86:'CUIL',96:'DNI'}[r.docTipo];
  return `<hr><div style="text-align:center"><b>${esc(FA.nombre(f))}</b>${f.amb==='homologacion'?'<br><b>PRUEBA - SIN VALIDEZ FISCAL</b>':''}<br>Fecha de emisión: ${FA.fecha(f.fecha)}</div>
  <div style="margin-top:4px">${esc(e.razon||'')}<br>CUIT: ${esc(e.cuit||'')} · ${e.condIva==='ri'?'IVA Responsable Inscripto':'Responsable Monotributo'}${e.domicilio?'<br>'+esc(e.domicilio):''}${e.inicio?'<br>Inicio de actividades: '+esc(e.inicio):''}</div>
  <div style="margin-top:4px">Cliente: ${dc?dc+' '+esc(r.docNro):'Consumidor final'} · ${esc(FA.COND[r.condIva]||'')}</div>${f.iva>0?`<div>Neto gravado ${fmt(f.neto)} · IVA ${fmt(f.iva)}</div>`:''}
  <div style="margin-top:4px">CAE: ${esc(f.cae)}<br>Vencimiento del CAE: ${FA.fecha(f.vto)}</div>${FA.qrC[f.cae]?`<div style="width:110px;margin:6px auto 0">${FA.qrC[f.cae]}</div>`:''}`};

// ---- Asistente de conexión (Configuración > Tu negocio) ----
if(FA.ok()){const n=$('[data-sub="n"]');if(n){n.insertAdjacentHTML('beforeend',`<details class="card" id="fa"><summary>Facturación electrónica (ARCA)</summary><div id="fa_e" style="margin:8px 0"></div><div id="fa_adm">
<p class="mu" style="margin:0 0 8px">Conectá <b>tu</b> negocio con ARCA para emitir facturas desde este programa. Es gratis: se usa el servicio oficial de ARCA con un certificado propio. Empezás en <b>modo prueba</b> (homologación); recién cuando lo activás a mano se emiten facturas reales.</p>
<h4 style="margin:12px 0 4px">1. Datos del negocio</h4><div class="form"><div><label for="fa_cuit">CUIT (sin guiones)</label><input id="fa_cuit" inputmode="numeric" maxlength="11" autocomplete="off"></div><div><label for="fa_raz">Razón social o nombre</label><input id="fa_raz" maxlength="100"></div>
<div><label for="fa_dom">Domicilio comercial</label><input id="fa_dom" maxlength="120"></div><div><label for="fa_ini">Inicio de actividades</label><input id="fa_ini" placeholder="dd/mm/aaaa" maxlength="10"></div>
<div><label for="fa_cond">Condición frente al IVA</label><select id="fa_cond"><option value="monotributo">Monotributo (Factura C)</option><option value="ri">Responsable inscripto (Factura A/B)</option></select></div>
<div><label for="fa_pv">Punto de venta (tipo Web Services)</label><input id="fa_pv" type="number" min="1" max="99999"></div><div id="fa_alw"><label for="fa_al">IVA de tus precios</label><select id="fa_al"><option value="21">21 %</option><option value="10.5">10,5 %</option><option value="27">27 %</option><option value="0">0 %</option></select></div></div>
<button class="btn" id="fa_g1" style="margin-top:8px">Guardar datos</button>
<h4 style="margin:16px 0 4px">2. Pedido de certificado</h4><p class="mu" style="margin:0 0 6px">El programa crea una clave privada que <b>queda guardada y protegida solo en esta PC</b> (no se envía a ningún lado) y un pedido de certificado para subir a ARCA.</p>
<button class="btn sec" id="fa_csr">Generar clave y pedido de certificado</button><div id="fa_csrb" class="hide" style="margin-top:8px"><textarea id="fa_csrt" readonly rows="6" style="width:100%;font:12px ui-monospace,monospace"></textarea><div style="display:flex;gap:8px;margin-top:6px"><button class="btn sec" id="fa_cp">Copiar</button><button class="btn sec" id="fa_cd">Guardar archivo .csr</button></div></div>
<ol class="mu" style="margin:8px 0 0;padding-left:20px;line-height:1.5"><li>Entrá a <b>arca.gob.ar</b> con tu CUIT y tu clave fiscal.</li><li>Abrí <b>Administración de certificados digitales</b> (si no te aparece, agregalo desde <b>Administrador de relaciones de clave fiscal</b>).</li><li>Creá un alias (por ejemplo "stockproject"), pegá el pedido de arriba y descargá el certificado (.crt).</li><li>En <b>Administrador de relaciones</b>, creá una relación nueva: servicio <b>Facturación electrónica (WSFE)</b>, representante = el alias que creaste.</li><li>En <b>Administración de puntos de venta y domicilios</b>, agregá un punto de venta del tipo <b>Factura electrónica - Web Services</b> y anotá su número arriba.</li><li>Para el <i>modo prueba</i> el certificado se pide en el sitio de homologación de ARCA (servicio WSASS): está explicado en la guía "Conectar ARCA".</li></ol>
<h4 style="margin:16px 0 4px">3. Cargar el certificado</h4><div class="form"><div><label for="fa_camb">Es el certificado de</label><select id="fa_camb"><option value="homologacion">Prueba (homologación)</option><option value="produccion">Producción (facturas reales)</option></select></div><div><label for="fa_crf">Archivo .crt</label><input id="fa_crf" type="file" accept=".crt,.pem,.cer,.txt"></div></div>
<textarea id="fa_crt" rows="4" placeholder="…o pegá acá el contenido del certificado (-----BEGIN CERTIFICATE-----)" style="width:100%;margin-top:6px;font:12px ui-monospace,monospace"></textarea><button class="btn" id="fa_cg" style="margin-top:6px">Guardar certificado</button>
<h4 style="margin:16px 0 4px">4. Probar la conexión</h4><button class="btn sec" id="fa_pr">Probar con ARCA</button><div id="fa_prr" class="mu" style="margin-top:6px"></div>
<h4 style="margin:16px 0 4px">5. Cuándo facturar</h4><div class="opt-list"><label class="opt"><input type="radio" name="fa_modo" value="manual"> A pedido: yo toco "Facturar" en cada venta que lo necesite</label><label class="opt"><input type="radio" name="fa_modo" value="siempre"> Siempre: factura automática al cobrar cada venta</label><label class="opt"><input type="radio" name="fa_modo" value="clientes"> Solo a los clientes que marque (en Clientes: "Facturarle siempre")</label></div>
<label class="opt" style="margin-top:8px"><input type="checkbox" id="fa_prod"> <b>Producción:</b> emitir facturas reales (si está apagado, son de prueba y no valen)</label><button class="btn" id="fa_g5" style="margin-top:8px">Guardar</button></div></details>`);
  const L=()=>{const e=FA.e;if(!e)return;const c=e.cfg;$('#fa_adm').classList.toggle('hide',!e.admin);$('#fa_cuit').value=c.cuit||'';$('#fa_raz').value=c.razon||'';$('#fa_dom').value=c.domicilio||'';$('#fa_ini').value=c.inicio||'';$('#fa_cond').value=c.condIva||'monotributo';$('#fa_pv').value=c.ptoVta||'';$('#fa_al').value=String(c.alicuota||21);$('#fa_alw').classList.toggle('hide',c.condIva!=='ri');
    $$('input[name=fa_modo]').forEach(r=>r.checked=r.value===c.modo);$('#fa_prod').checked=c.ambiente==='produccion'};
  FA.estadoHtml=()=>{const e=FA.e;if(!e)return'';const F=t=>new Date(t).toLocaleDateString('es-AR');
    if(e.listo)return `<div class="tip" style="border-left-color:var(--${e.cfg.ambiente==='produccion'?'ok':'warn'})"><b>Conectado · ${e.cfg.ambiente==='produccion'?'facturas reales':'modo prueba (sin validez fiscal)'}</b><br>CUIT ${esc(e.cfg.cuit)} · punto de venta ${e.cfg.ptoVta} · certificado vigente hasta ${F(e.vence)}${e.vence-Date.now()<30*864e5?' <b style="color:var(--bad)">(vence pronto: pedí uno nuevo)</b>':''}</div>`;
    return `<div class="tip" style="border-left-color:var(--${e.vencido?'bad':'bd'})">${e.vencido?'<b>El certificado venció.</b> Generá un pedido nuevo (paso 2) y cargá el certificado nuevo.':'Todavía no está conectado. Seguí los pasos de abajo.'}</div>`};
  FA.pintar=async()=>{await FA.cargar();const el=$('#fa_e');if(el)el.innerHTML=FA.estadoHtml()};
  $('#fa').addEventListener('toggle',async()=>{if($('#fa').open){await FA.pintar();L()}});
  const R=async(p,ok)=>{const r=await p;if(r&&r.ok){if(ok)toast(ok)}else toast((r&&r.err)||'No se pudo');await FA.pintar();L();return r};
  $('#fa_cuit').oninput=()=>{$('#fa_cuit').value=$('#fa_cuit').value.replace(/\D/g,'')};$('#fa_cond').onchange=()=>$('#fa_alw').classList.toggle('hide',$('#fa_cond').value!=='ri');
  $('#fa_g1').onclick=()=>R(sp.arca.config({cuit:$('#fa_cuit').value,razon:$('#fa_raz').value,domicilio:$('#fa_dom').value,inicio:$('#fa_ini').value,condIva:$('#fa_cond').value,ptoVta:$('#fa_pv').value,alicuota:$('#fa_al').value}),'Datos guardados');
  $('#fa_csr').onclick=async()=>{let r=await sp.arca.csr({});if(r&&r.confirmar){if(!confirm(r.err+'\n\n¿Generar uno nuevo igual?'))return;r=await sp.arca.csr({regenerar:true})}
    if(r&&r.ok){$('#fa_csrt').value=r.csr;$('#fa_csrb').classList.remove('hide');toast('Listo: copiá el pedido y subilo a ARCA');await FA.pintar()}else toast((r&&r.err)||'No se pudo generar')};
  $('#fa_cp').onclick=async()=>{try{await navigator.clipboard.writeText($('#fa_csrt').value);toast('Pedido copiado')}catch(x){$('#fa_csrt').select();toast('Seleccionado: copialo con Ctrl+C')}};
  $('#fa_cd').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([$('#fa_csrt').value],{type:'text/plain'}));a.download='stockproject.csr';a.click()};
  $('#fa_crf').onchange=()=>{const f=$('#fa_crf').files[0];if(!f||f.size>20000)return f&&toast('Ese archivo no parece un certificado');const r=new FileReader();r.onload=()=>{$('#fa_crt').value=String(r.result)};r.readAsText(f)};
  $('#fa_cg').onclick=async()=>{const r=await R(sp.arca.cert($('#fa_crt').value,$('#fa_camb').value),'Certificado guardado');if(r&&r.ok)$('#fa_crt').value=''};
  $('#fa_pr').onclick=async()=>{$('#fa_pr').disabled=true;$('#fa_prr').textContent='Conectando con ARCA…';const r=await sp.arca.probar();$('#fa_pr').disabled=false;
    $('#fa_prr').innerHTML=r.ok?`<span style="color:var(--ok)"><b>Conexión correcta.</b></span> ${r.ptoVtaOk?'El punto de venta está habilitado.':'<span style="color:var(--bad)">'+esc(r.ptoVtaMsg)+'</span>'}${r.ptos&&r.ptos.length?'<br>Puntos de venta en ARCA: '+r.ptos.map(p=>p.nro+(p.bloqueado||p.baja?' (bloqueado)':'')).join(', '):''}`:`<span style="color:var(--bad)">${esc(r.err||'No se pudo conectar')}</span>`};
  $('#fa_g5').onclick=async()=>{const prod=$('#fa_prod').checked;if(prod&&!confirm('Vas a emitir facturas REALES ante ARCA, con validez fiscal. ¿Seguro?'))return;
    await R(sp.arca.config({modo:($$('input[name=fa_modo]').find(r=>r.checked)||{}).value||'manual',ambiente:prod?'produccion':'homologacion'}),prod?'Producción activada: las facturas son reales':'Guardado')};
  MODS.push(()=>{if($('#fa')&&$('#fa').open&&!$('#g').classList.contains('hide'))FA.pintar()});
  FA.cargar().then(()=>{if(FA.e&&FA.e.listo)draw()});setInterval(()=>FA.reintentar(),6e4);setTimeout(()=>FA.reintentar(),5e3)}}
