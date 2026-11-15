// ===== Sistema: estado, rendimiento y monitoreo =====
const SY={t:null};
SY.cuentas=()=>({ventas:db.sales.length,productos:db.prods.length,clientes:db.clients.length,pagos:db.pays.length,cargos:db.cargos.length,movs:db.fin.mov.length});
// Prueba de velocidad con tus propios datos: guardar (serializar), cargar (leer) y redibujar todas las pantallas.
SY.medir=()=>{const t0=performance.now(),s=JSON.stringify(db),t1=performance.now();JSON.parse(s);const t2=performance.now();_agg=null;draw();const t3=performance.now();return{bytes:s.length,guardar:Math.round(t1-t0),cargar:Math.round(t2-t1),dibujar:Math.round(t3-t2)}};
SY.nivel=(m)=>m.bytes>100e6?['bad','Muy grande: conviene cerrar el período en una empresa nueva y archivar las ventas viejas (Configuración > Datos).']:m.bytes>30e6?['low','Grande: todavía rinde bien, pero empezá a pensar en cerrar el año.']:['ok','Todo en orden para este volumen de datos.'];
SY.mb=n=>(n/1048576).toFixed(2).replace('.',',')+' MB';
SY.render=async()=>{const box=$('#g_x'),c=SY.cuentas(),m=SY.ult||null,M=EDA&&sp.sys?await sp.sys.metricas():null,U=typeof UPD!=='undefined'&&EDA&&sp.upd?await UPD.html():'';
  const l=[`${c.ventas.toLocaleString('es-AR')} ventas`,`${c.productos.toLocaleString('es-AR')} productos`,`${c.clientes.toLocaleString('es-AR')} clientes`];
  if(M){l.push('archivo de datos '+M.archivoMB.toString().replace('.',',')+' MB','memoria '+M.memMB+' MB');}
  box.innerHTML=`${U}<div class="card"><h3>Estado</h3><p style="margin:0">${l.join(' · ')}</p>${M?`<p class="mu" style="margin:6px 0 0">Último respaldo automático: ${M.ultimoRespaldo?new Date(M.ultimoRespaldo).toLocaleString('es-AR'):'todavía ninguno'} · Abierto hace ${Math.max(1,Math.round(M.iniciada/60))} min</p>`:''}</div>
  <details class="card"><summary>Prueba de velocidad con tus datos</summary><p class="mu" style="margin-top:0">Mide cuánto tarda guardar, cargar y dibujar las pantallas con el volumen actual.</p><button class="btn" id="sy_m">Medir ahora</button>${m?`<div class="kpis" style="margin-top:10px">${CF.k('Tamaño',SY.mb(m.bytes))}${CF.k('Guardar',m.guardar+' ms')}${CF.k('Cargar',m.cargar+' ms')}${CF.k('Dibujar pantallas',m.dibujar+' ms')}</div><div class="tip" style="border-color:var(--${SY.nivel(m)[0]})">${SY.nivel(m)[1]}</div>`:''}</details>`};
$('#g_x').onclick=async e=>{if(e.target.id==='sy_m'){e.target.disabled=true;await new Promise(r=>setTimeout(r,30));SY.ult=SY.medir();await SY.render();$('#g_x details').open=true}};
CF.extras.sistema=sub=>{if(sub==='x'){if(!SY.t){SY.render();SY.t=setInterval(()=>{if($('#g').classList.contains('hide')||CF.sub!=='x'){clearInterval(SY.t);SY.t=null;return}SY.render()},5000)}}else if(SY.t){clearInterval(SY.t);SY.t=null}};
