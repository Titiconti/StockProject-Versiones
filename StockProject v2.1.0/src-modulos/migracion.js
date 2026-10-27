// ===== Migración de datos: importar productos, clientes y saldos desde Excel/CSV con validación y posibilidad de deshacer =====
const MG={st:null};
const MGN=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
MG.ENT={
  productos:{nom:'Productos',campos:[
    {k:'name',lab:'Nombre',req:1,al:['nombre','producto','articulo','descripcion','detalle','item','denominacion']},
    {k:'code',lab:'Código',al:['codigo','cod','sku','ean','codigo de barras','barras','plu','codigo interno']},
    {k:'price',lab:'Precio de venta',req:1,al:['precio','precio de venta','precio venta','pvp','venta','precio publico','p venta','precio lista']},
    {k:'cost',lab:'Costo',al:['costo','precio de costo','precio costo','costo unitario','compra','p costo']},
    {k:'stock',lab:'Stock',al:['stock','existencia','existencias','cantidad','cant','inventario','stock actual']},
    {k:'min',lab:'Stock mínimo',al:['minimo','stock minimo','punto de pedido','reposicion','stock min']},
    {k:'exp',lab:'Vencimiento',al:['vencimiento','vto','fecha de vencimiento','fecha vencimiento','caducidad']}]},
  clientes:{nom:'Clientes',campos:[
    {k:'name',lab:'Nombre',req:1,al:['nombre','cliente','razon social','nombre y apellido','apellido y nombre','denominacion']},
    {k:'phone',lab:'Teléfono',al:['telefono','tel','celular','movil','whatsapp','telefono celular']},
    {k:'mail',lab:'Correo',al:['correo','email','e mail','mail','correo electronico']},
    {k:'disc',lab:'Descuento %',al:['descuento','desc','bonificacion','dto']},
    {k:'limite',lab:'Límite de crédito',al:['limite','limite de credito','tope','credito maximo']},
    {k:'note',lab:'Notas',al:['nota','notas','observaciones','obs','comentarios','direccion','domicilio']}]},
  saldos:{nom:'Saldos de clientes (deudas iniciales)',campos:[
    {k:'name',lab:'Cliente',req:1,al:['nombre','cliente','razon social','nombre y apellido']},
    {k:'saldo',lab:'Saldo (deuda positiva, a favor negativo)',req:1,al:['saldo','deuda','importe','monto','saldo deudor','adeuda']}]}};
// Detecta a qué columna corresponde cada campo, por nombre (sin acentos ni mayúsculas); no repite columnas.
MG.autoMapa=(ent,headers)=>{const H=headers.map(MGN),map={},usada=new Set();MG.ENT[ent].campos.forEach(f=>{let i=H.findIndex((h,j)=>!usada.has(j)&&(h===MGN(f.lab)||f.al.includes(h)));if(i<0)i=H.findIndex((h,j)=>!usada.has(j)&&h&&f.al.some(a=>a.length>3&&(h.includes(a)||a.includes(h))));if(i>=0){map[f.k]=i;usada.add(i)}});return map};
MG.plantilla=ent=>{const c=MG.ENT[ent].campos,ej={productos:[['Yerba mate 1 kg','7790001','2500','1700','20','5','2027-12-31'],['Azúcar 1 kg','7790002','1200','800','50','10','']],clientes:[['María Pérez','1155551234','maria@correo.com','5','50000','Cliente del barrio'],['Juan Gómez','','','0','','']],saldos:[['María Pérez','15000'],['Juan Gómez','-500']]}[ent];return UT.csv([c.map(x=>x.lab),...ej])};
// Valida todas las filas. Devuelve por fila: valores limpios, errores (bloquean la fila), avisos y qué haría (nuevo / actualiza).
MG.validar=(ent,datos,map)=>{const E=MG.ENT[ent],vistos=new Map(),out=[];const v=(r,k)=>map[k]==null?'':String(r[map[k]]==null?'':r[map[k]]).trim();
  const exProd=new Map(),exCli=new Map();db.prods.forEach(p=>{if(p.code)exProd.set('c:'+String(p.code).toLowerCase(),p);exProd.set('n:'+norm(p.name),p)});db.clients.forEach(c=>exCli.set(norm(c.name),c));
  datos.forEach((r,i)=>{const o={n:i+2,v:{},err:[],av:[],accion:'nuevo',ref:null},e=(c,m)=>o.err.push({c,m}),a=m=>o.av.push(m);
    E.campos.forEach(f=>{o.v[f.k]=v(r,f.k)});const x=o.v;
    if(!x.name||x.name.length<2)e('name','Falta el nombre');else if(x.name.length>120)e('name','El nombre es demasiado largo (máximo 120)');
    if(ent==='productos'){
      const pr=UT.num(x.price);if(x.price===''||pr==null)e('price','Falta el precio');else if(isNaN(pr)||pr<0)e('price','Precio inválido');else x.price=pr;
      if(x.cost!==''){const c=UT.num(x.cost);if(isNaN(c)||c<0)e('cost','Costo inválido');else{x.cost=c;if(typeof x.price==='number'&&c>x.price)a('El costo es mayor que el precio de venta')}}else x.cost=0;
      if(x.stock!==''){const s=UT.num(x.stock);if(isNaN(s)||s<0)e('stock','Stock inválido');else{if(s!==Math.floor(s))a('El stock tiene decimales: se redondea');x.stock=Math.round(s)}}else x.stock=0;
      if(x.min!==''){const s=UT.num(x.min);if(isNaN(s)||s<0)e('min','Mínimo inválido');else x.min=Math.round(s)}else x.min=0;
      if(x.exp!==''){const f=UT.fecha(x.exp);if(typeof f!=='string')e('exp','Fecha de vencimiento inválida (usá dd/mm/aaaa)');else{x.exp=f;if(f<UT.hoy()&&x.stock>0)a('El lote ya está vencido')}}
      const kc=x.code?'c:'+x.code.toLowerCase():null,kn='n:'+norm(x.name);
      if(kc&&vistos.has(kc))e('code','Código repetido en el archivo (fila '+vistos.get(kc)+')');else if(kc)vistos.set(kc,o.n);
      if(!kc&&vistos.has(kn))a('Nombre repetido en el archivo (fila '+vistos.get(kn)+')');vistos.set(kn,vistos.get(kn)||o.n);
      const ex=(kc&&exProd.get(kc))||(!x.code&&exProd.get(kn));if(ex){o.accion='actualiza';o.ref=ex.id}
      else if(x.code&&exProd.get(kn)&&exProd.get(kn).code&&exProd.get(kn).code!==x.code)a('Existe un producto con ese nombre y otro código')}
    if(ent==='clientes'){
      if(x.disc!==''){const d=UT.num(x.disc);if(isNaN(d)||d<0||d>100)e('disc','El descuento debe estar entre 0 y 100');else x.disc=d}else x.disc=0;
      if(x.limite!==''){const d=UT.num(x.limite);if(isNaN(d)||d<0)e('limite','Límite inválido');else x.limite=d}else x.limite=0;
      if(x.phone&&x.phone.replace(/\D/g,'').length<6)a('El teléfono parece incompleto');if(x.mail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.mail))a('El correo no parece válido');
      const kn=norm(x.name);if(x.name&&vistos.has(kn))e('name','Cliente repetido en el archivo (fila '+vistos.get(kn)+')');else vistos.set(kn,o.n);const ex=exCli.get(kn);if(ex){o.accion='actualiza';o.ref=ex.id}}
    if(ent==='saldos'){
      const s=UT.num(x.saldo);if(x.saldo===''||s==null)e('saldo','Falta el saldo');else if(isNaN(s)||s===0)e('saldo','Saldo inválido');else x.saldo=s;
      const kn=norm(x.name),c=exCli.get(kn);if(x.name&&!c)e('name','Ese cliente no existe: importá primero los clientes');else if(c){o.ref=c.id;o.accion='nuevo';if(db.cargos.some(g=>g.cid===c.id&&g.tipo==='saldo inicial'))e('name','Ya tiene un saldo inicial cargado')}
      if(x.name&&vistos.has(kn))e('name','Cliente repetido en el archivo (fila '+vistos.get(kn)+')');else vistos.set(kn,o.n)}
    out.push(o)});return out};
// Aplica las filas sin errores. Guarda una copia de lo que cambia para poder deshacer.
MG.aplicar=(ent,filas,{modo='actualizar',stock='sumar'}={})=>{const ok=filas.filter(f=>!f.err.length),r={nuevos:0,actualizados:0,omitidos:filas.length-ok.length},fecha=new Date().toISOString();
  const prev=ent==='productos'?{prods:db.prods,nid:db.nid,lid:db.lid}:ent==='clientes'?{clients:db.clients,cid:db.cid}:{cargos:db.cargos,cgid:db.cgid},snap=JSON.stringify(prev);
  db.cfg.ultimaImport=snap.length<8e6?{fecha,ent,n:ok.length,prev:snap}:{fecha,ent,n:ok.length,prev:null};
  ok.forEach(f=>{const x=f.v;
    if(ent==='productos'){let p=f.ref&&db.prods.find(q=>q.id===f.ref);if(p){if(modo==='soloNuevos'){r.omitidos++;return}Object.assign(p,{name:x.name,price:x.price,cost:x.cost,min:x.min});if(x.code)p.code=x.code;r.actualizados++;
        if(x.stock>0&&stock==='reemplazar'){p.lots=[];addLot(p,'Importado '+fecha.slice(0,10),x.stock,x.exp)}else if(x.stock>0&&stock==='sumar')addLot(p,'Importado '+fecha.slice(0,10),x.stock,x.exp)}
      else{p={id:db.nid++,name:x.name,code:x.code,price:x.price,cost:x.cost,min:x.min,lots:[]};db.prods.push(p);if(x.stock>0)addLot(p,'Inicial',x.stock,x.exp);r.nuevos++}}
    if(ent==='clientes'){let c=f.ref&&cl$(f.ref);const d={name:x.name,phone:x.phone,mail:x.mail,disc:x.disc,note:x.note};if(x.limite)d.limite=x.limite;if(c){if(modo==='soloNuevos'){r.omitidos++;return}Object.assign(c,d);r.actualizados++}else{db.clients.push({id:db.cid++,...d});r.nuevos++}}
    if(ent==='saldos'){db.cargos.push({id:db.cgid++,cid:f.ref,date:fecha,desc:'Saldo inicial (importado)',amount:x.saldo,tipo:'saldo inicial'});r.nuevos++}});return r};
MG.deshacer=()=>{const u=db.cfg.ultimaImport;if(!u||!u.prev)return false;const p=JSON.parse(u.prev);Object.assign(db,p);delete db.cfg.ultimaImport;return true};

// ---------- asistente ----------
MG.nuevo=()=>({paso:1,ent:'productos',headers:[],datos:[],map:{},filas:[],modo:'actualizar',stock:'sumar',archivo:'',msg:''});
MG.render=()=>{const box=$('#g_d');box.dataset.r=1;if(!MG.st)MG.st=MG.nuevo();const s=MG.st,E=MG.ENT[s.ent],u=db.cfg.ultimaImport;
  const pasos=['Qué importar','Archivo','Columnas','Revisar','Confirmar'],cab=`<div class="pills">${pasos.map((p,i)=>`<button class="${s.paso===i+1?'on':''}" disabled>${i+1}. ${p}</button>`).join('')}</div>`;let h='';
  if(s.paso===1)h=`<p>Podés traer tus datos desde otro programa o desde una planilla. Exportá desde tu sistema actual a Excel o CSV y seguí los pasos. Todo se procesa en esta PC.</p><div class="form"><div><label>¿Qué querés importar?</label><select id="mg_e">${Object.entries(MG.ENT).map(([k,v])=>`<option value="${k}" ${s.ent===k?'selected':''}>${v.nom}</option>`).join('')}</select></div></div><p class="mu">Columnas que reconoce: ${E.campos.map(f=>f.lab+(f.req?' (obligatoria)':'')).join(', ')}.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" id="mg_pl">Descargar plantilla de ${E.nom.toLowerCase()}</button><button class="btn" id="mg_n1">Ya tengo mi archivo</button></div>`;
  if(s.paso===2)h=`<p>Elegí el archivo CSV (en Excel: <i>Archivo > Guardar como > CSV UTF-8</i>). Máximo 20 MB.</p><input type="file" id="mg_f" accept=".csv,.txt,.tsv"><p class="mu">${esc(s.msg)}</p><button class="btn sec" id="mg_a1">Atrás</button>`;
  if(s.paso===3)h=`<p>Archivo: <b>${esc(s.archivo)}</b> · ${s.datos.length} filas. Revisá a qué columna corresponde cada dato.</p><div class="form">${E.campos.map(f=>`<div><label>${f.lab}${f.req?' *':''}</label><select data-mc="${f.k}"><option value="">(no importar)</option>${s.headers.map((h,i)=>`<option value="${i}" ${s.map[f.k]===i?'selected':''}>${esc(h||'Columna '+(i+1))}</option>`).join('')}</select></div>`).join('')}</div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn sec" id="mg_a2">Atrás</button><button class="btn" id="mg_n3">Validar datos</button></div>`;
  if(s.paso===4){const err=s.filas.filter(f=>f.err.length),av=s.filas.filter(f=>f.av.length&&!f.err.length),nu=s.filas.filter(f=>!f.err.length&&f.accion==='nuevo').length,ac=s.filas.filter(f=>!f.err.length&&f.accion==='actualiza').length;
    h=`<div class="kpis"><div class="card"><div class="mu">Se crearían</div><div class="big">${nu}</div></div><div class="card"><div class="mu">Se actualizarían</div><div class="big">${ac}</div></div><div class="card"><div class="mu">Con errores</div><div class="big" style="color:var(--${err.length?'bad':'ok'})">${err.length}</div></div><div class="card"><div class="mu">Con avisos</div><div class="big">${av.length}</div></div></div>
    ${err.length?`<h3>Corregí los errores (o dejalos afuera)</h3><p class="mu" style="margin-top:0">Podés escribir el valor correcto acá mismo. Las filas con error no se importan.</p><div class="wrap"><table><thead><tr><th>Fila</th>${E.campos.map(f=>`<th>${f.lab}</th>`).join('')}<th>Problema</th></tr></thead><tbody>${err.slice(0,100).map(f=>`<tr><td>${f.n}</td>${E.campos.map(c=>{const bad=f.err.some(e=>e.c===c.k);return`<td>${bad?`<input data-fx="${f.n}|${c.k}" value="${esc(f.v[c.k])}" style="border-color:var(--bad);width:130px">`:esc(f.v[c.k])}</td>`}).join('')}<td>${f.err.map(e=>esc(e.m)).join('; ')}</td></tr>`).join('')}</tbody></table></div>${err.length>100?`<p class="mu">Se muestran las primeras 100 de ${err.length}.</p>`:''}`:'<p>✅ No se encontraron errores.</p>'}
    ${av.length?`<details><summary>${av.length} filas con avisos (se importan igual)</summary><div class="wrap"><table><tbody>${av.slice(0,50).map(f=>`<tr><td>Fila ${f.n}</td><td>${esc(f.v.name)}</td><td>${f.av.map(esc).join('; ')}</td></tr>`).join('')}</tbody></table></div></details>`:''}
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sec" id="mg_a3">Atrás</button><button class="btn" id="mg_n4" ${nu+ac?'':'disabled'}>Continuar</button></div>`}
  if(s.paso===5){const ok=s.filas.filter(f=>!f.err.length);h=`<p>Se van a procesar <b>${ok.length}</b> filas de ${E.nom.toLowerCase()}${s.filas.length-ok.length?` (${s.filas.length-ok.length} con errores quedan afuera)`:''}.</p><div class="form">${s.ent==='saldos'?'':`<div><label>Si ya existe</label><select id="mg_m"><option value="actualizar" ${s.modo==='actualizar'?'selected':''}>Actualizar los datos</option><option value="soloNuevos" ${s.modo==='soloNuevos'?'selected':''}>Dejarlo como está (solo agregar nuevos)</option></select></div>`}${s.ent==='productos'?`<div><label>Stock de productos que ya existen</label><select id="mg_s"><option value="sumar" ${s.stock==='sumar'?'selected':''}>Sumar lo importado</option><option value="reemplazar" ${s.stock==='reemplazar'?'selected':''}>Reemplazar el stock</option><option value="ignorar" ${s.stock==='ignorar'?'selected':''}>No tocar el stock</option></select></div>`:''}</div><p class="mu">Antes de importar se hace una copia de seguridad y podrás deshacer esta importación.</p><div style="display:flex;gap:8px"><button class="btn sec" id="mg_a4">Atrás</button><button class="btn" id="mg_ok">Importar ahora</button></div>`}
  box.innerHTML=`<div class="card"><h3>Importar datos</h3>${cab}${s.fin?`<div class="tip">${esc(s.fin)}</div>`:''}${h}</div>
  <div class="card" style="margin-top:12px"><h3>Deshacer y exportar</h3>${u?`<p>Última importación: ${u.n} filas de ${MG.ENT[u.ent].nom.toLowerCase()} (${new Date(u.fecha).toLocaleString('es-AR')}).</p>${u.prev?'<button class="btn sec" id="mg_un">Deshacer esa importación</button>':'<p class="mu">Era demasiado grande para guardar el estado anterior; usá un respaldo para volver atrás.</p>'}`:'<p class="mu">No hay importaciones para deshacer.</p>'}<h3 style="margin-top:14px">Sacar tus datos a Excel</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" data-ex="productos">Productos (CSV)</button><button class="btn sec" data-ex="clientes">Clientes (CSV)</button><button class="btn sec" data-ex="ventas">Ventas (CSV)</button><button class="btn sec" data-ex="json">Todo (JSON)</button></div></div>`};
MG.revalidar=()=>{const s=MG.st;s.filas=MG.validar(s.ent,s.datos,s.map)};
$('#g_d').onchange=e=>{const t=e.target,s=MG.st;if(t.id==='mg_e'){s.ent=t.value;s.map={};MG.render()}
  if(t.id==='mg_f'){const f=t.files[0];if(!f)return;if(f.size>20e6){s.msg='El archivo supera los 20 MB';return MG.render()}f.text().then(tx=>{if(tx.startsWith('PK')){s.msg='Ese es un archivo de Excel (.xlsx). Abrilo en Excel y usá Guardar como > CSV UTF-8.';return MG.render()}
      const {rows}=UT.parseCSV(tx);if(rows.length<2){s.msg='El archivo no tiene filas de datos.';return MG.render()}s.headers=rows[0].map(x=>x.trim());s.datos=rows.slice(1);s.archivo=f.name;s.msg='';const guardado=(db.cfg.mapeos||{})[s.ent+'|'+s.headers.map(MGN).join(',')];s.map=guardado||MG.autoMapa(s.ent,s.headers);s.paso=3;MG.render()})}
  if(t.dataset.mc){s.map[t.dataset.mc]=t.value===''?undefined:+t.value}
  if(t.id==='mg_m')s.modo=t.value;if(t.id==='mg_s')s.stock=t.value;
  if(t.dataset.fx){const[n,k]=t.dataset.fx.split('|'),i=+n-2;const campo=MG.ENT[s.ent].campos.find(c=>c.k===k);if(s.map[k]==null){s.map[k]=s.headers.length;s.headers.push(campo.lab);s.datos.forEach(r=>r[s.map[k]]='')}s.datos[i][s.map[k]]=t.value;MG.revalidar();MG.render()}};
$('#g_d').onclick=async e=>{const b=e.target.closest('button');if(!b||!MG.st)return;const s=MG.st,id=b.id;
  if(id==='mg_pl')UT.bajar(`plantilla-${s.ent}.csv`,MG.plantilla(s.ent),'text/csv');
  if(id==='mg_n1'){s.paso=2;s.fin='';MG.render()}if(id==='mg_a1'){s.paso=1;MG.render()}if(id==='mg_a2'){s.paso=2;MG.render()}if(id==='mg_a3'){s.paso=3;MG.render()}if(id==='mg_a4'){s.paso=4;MG.render()}
  if(id==='mg_n3'){const falt=MG.ENT[s.ent].campos.filter(f=>f.req&&s.map[f.k]==null);if(falt.length)return toast('Falta indicar la columna de: '+falt.map(f=>f.lab).join(', '));db.cfg.mapeos=db.cfg.mapeos||{};db.cfg.mapeos[s.ent+'|'+s.headers.map(MGN).join(',')]=s.map;MG.revalidar();s.paso=4;MG.render()}
  if(id==='mg_n4'){s.paso=5;MG.render()}
  if(id==='mg_ok'){if(!UT.chk('productos','crear')||!UT.chk('clientes','crear'))return;if(EDA&&sp.now)try{await sp.now()}catch(x){}const r=MG.aplicar(s.ent,s.filas,{modo:s.modo,stock:s.stock});save();call('audit','migracion.importar',`${s.ent}: ${r.nuevos} nuevos, ${r.actualizados} actualizados, ${r.omitidos} omitidos (${s.archivo})`);
    const fin=`Importación lista: ${r.nuevos} nuevos, ${r.actualizados} actualizados, ${r.omitidos} omitidos.`;MG.st=MG.nuevo();MG.st.fin=fin;draw();MG.render();toast(fin)}
  if(id==='mg_un'){if(!UT.chk('productos','eliminar')||!armed('mgun'))return;if(MG.deshacer()){save();call('audit','migracion.deshacer');MG.st=MG.nuevo();MG.st.fin='Se deshizo la última importación.';draw();MG.render()}}
  if(b.dataset.ex){if(!UT.chk('respaldo','ver'))return;const t=b.dataset.ex;let txt,nom=`${t}-${UT.hoy()}.csv`;
    if(t==='productos')txt=UT.csv([['Nombre','Código','Precio de venta','Costo','Stock','Stock mínimo','Vencimiento'],...db.prods.map(p=>{const v=p.lots.filter(l=>l.exp).map(l=>l.exp).sort()[0]||'';return[p.name,p.code||'',p.price,p.cost||0,tot(p),p.min||0,v]})]);
    else if(t==='clientes')txt=UT.csv([['Nombre','Teléfono','Correo','Descuento %','Límite de crédito','Notas','Saldo'],...db.clients.map(c=>[c.name,c.phone||'',c.mail||'',c.disc||0,c.limite||'',c.note||'',debtOf(c.id)])]);
    else if(t==='ventas')txt=UT.csv([['N.º','Fecha','Cliente','Medio de pago','Producto','Cantidad','Precio','Total de la venta'],...db.sales.filter(s=>!s.void).flatMap(s=>s.items.map(i=>[s.id,s.date,s.cname||'',s.pay,i.name,i.qty,i.price,s.total]))]);
    else{txt=JSON.stringify(db,null,1);nom=`stockproject-${UT.hoy()}.json`}
    UT.bajar(nom,txt,t==='json'?'application/json':'text/csv');call('audit','datos.exportar',t)}};
CF.extras.migracion=sub=>{if(sub!=='d')return;if(!$('#g_d').dataset.r||!MG.st||MG.st.paso===1||MG.st.paso===5)MG.render()};
