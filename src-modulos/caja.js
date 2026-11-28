// ===== Caja: apertura, movimientos, cierre por turno e historial (v3.0.0, fase 1) =====
// Reglas:
//  - Cada usuario abre su propia caja (sin usuarios activados hay una sola caja compartida).
//  - Las ventas y los cobros de deudas quedan asociados a la caja abierta de quien los registra.
//  - Dinero esperado = inicial + ventas en efectivo + cobros en efectivo + ingresos − egresos.
//    Tarjeta, transferencia y cuenta corriente NO suman al efectivo de la caja.
//  - Diferencia = contado − esperado (positiva: sobrante · negativa: faltante · cero: equilibrada).
//  - Un cierre confirmado guarda una foto de los totales y no se puede editar (solo una corrección con permiso caja.editar, con motivo e historial).
//  - Caja "ciega" (v5.7.3): quien no tiene el permiso caja.ver (arqueo) NO ve el esperado, la diferencia ni el total vendido en ninguna pantalla;
//    declara lo contado y el cierre nunca se bloquea por faltante o sobrante. El cálculo del esperado sigue guardándose internamente.
//  - En el programa instalado y en el acceso remoto se exige caja abierta para cobrar (Configuración puede desactivarlo).
//    En la demo web es opcional (db.cfg.cajaObligatoria=true la exige).
const CJ={};
CJ.fix=()=>{db.cajas=db.cajas||[];db.cjid=db.cjid||1};
CJ.yo=()=>AU.habilitado&&AU.usuario?{uid:AU.usuario.id,user:AU.usuario.nombre||AU.usuario.user}:{uid:0,user:'Sin usuario'};
CJ.exige=()=>db.cfg.cajaObligatoria===true||(db.cfg.cajaObligatoria!==false&&KIND!=='local');
CJ.abierta=()=>{CJ.fix();const y=CJ.yo();return db.cajas.find(c=>!c.cierre&&c.uid===y.uid)||null};
CJ.r2=n=>Math.round((+n||0)*100)/100;
CJ.EF='Efectivo';
// Lector único de montos escritos a mano: acepta "1500", "1500,50", "1.500,50" y "1500.50". Devuelve NaN si no es un monto válido (el signo menos lo rechaza cada llamador).
CJ.num=v=>{if(typeof v==='number')return v;let t=String(v==null?'':v).replace(/[\s$]/g,'');if(!t)return NaN;
  if(t.includes(','))t=t.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(t))t=t.replace(/\./g,'');
  return/^-?\d+(\.\d+)?$/.test(t)?+t:NaN};
CJ.GRID='align-items:start;grid-template-columns:repeat(auto-fit,minmax(19ch,1fr))';// columnas de al menos ~19 caracteres: entra "12.345.678,90" completo
CJ.AYUDA='Para los centavos usá coma: 1500,50';CJ.ERR='Ese monto no es un número válido. Escribilo así: 1500 o 1500,50';
CJ.campo=(id,val='')=>'<input id="'+id+'" type="text" inputmode="decimal" autocomplete="off" value="'+val+'" aria-describedby="'+id+'_h">';
// La ayuda va en una fila propia debajo de todos los campos: así no empuja a los vecinos y los inputs quedan alineados.
CJ.ayuda=(id,extra)=>'<small id="'+id+'_h" class="mu" style="grid-column:1/-1;margin-top:-4px">'+CJ.AYUDA+(extra?' · '+extra:'')+'</small>';
// Totales de una caja calculados con los movimientos reales (ventas anuladas no cuentan).
CJ.calc=c=>{const S=db.sales.filter(s=>s.caja===c.id&&!s.void),P=db.pays.filter(p=>p.caja===c.id),M=c.movs||[];
  const porMedio={},porMedio0={};S.forEach(s=>{const k=/^Mercado Pago/.test(s.pay)?'Mercado Pago':s.pay;porMedio[k]=CJ.r2((porMedio[k]||0)+s.total);porMedio0[s.pay]=CJ.r2((porMedio0[s.pay]||0)+s.total)});
  const vendido=CJ.r2(S.reduce((a,s)=>a+s.total,0)),efV=porMedio[CJ.EF]||0,efC=CJ.r2(P.filter(p=>p.method===CJ.EF).reduce((a,p)=>a+p.amount,0)),
    cobros=CJ.r2(P.reduce((a,p)=>a+p.amount,0)),ing=CJ.r2(M.filter(m=>m.t==='ingreso').reduce((a,m)=>a+m.monto,0)),egr=CJ.r2(M.filter(m=>m.t==='egreso').reduce((a,m)=>a+m.monto,0));
  return{ventas:S.length,vendido,porMedio,porMedio0,efVentas:efV,efCobros:efC,cobros,ingresos:ing,egresos:egr,esperado:CJ.r2(c.ini+efV+efC+ing-egr)}};
CJ.dif=d=>Math.abs(d)<0.005?['','Equilibrada']:d>0?['low','Sobrante']:['out','Faltante'];
// Permisos: caja.ver = ver esperado, diferencias y totales (arqueo) · caja.editar = corregir cierres. Sin usuarios activados, quien usa el programa es el dueño y lo ve todo.
CJ.ve=()=>can('caja','ver');CJ.puedeCorregir=()=>can('caja','editar');
// Tipos de movimiento dentro del turno (la apertura y el cierre son de la caja; "queda en el local" es lo que se declara al cerrar). t = sentido para el efectivo.
CJ.TIPOS={retiro:['egreso','Retiro de efectivo'],ingreso:['ingreso','Ingreso extraordinario'],gasto:['egreso','Gasto de caja'],devolucion:['egreso','Devolución en efectivo']};
CJ.tipoMov=m=>m.tipo||(m.t==='ingreso'?'ingreso':'gasto');   // los movimientos viejos sin tipo: egreso = gasto (como se contaban)
CJ.nomMov=m=>(CJ.TIPOS[CJ.tipoMov(m)]||[,'Movimiento'])[1];
// Resumen de control del turno que ve cualquiera: solo cantidades, nada que permita reconstruir el efectivo esperado.
CJ.resumen=c=>{const T=db.sales.filter(s=>s.caja===c.id),V=T.filter(s=>!s.void),porMedio={},unidades={};
  V.forEach(s=>{const k=/^Mercado Pago/.test(s.pay)?'Mercado Pago':s.pay;porMedio[k]=(porMedio[k]||0)+1;(s.items||[]).forEach(i=>{unidades[i.name]=CJ.r2((unidades[i.name]||0)+i.qty)})});
  return{ventas:V.length,porMedio,unidades,anuladas:T.length-V.length,cobros:db.pays.filter(p=>p.caja===c.id).length,movs:c.movs||[]}};
// Traspaso de turno (v5.7.2): lo que debía quedar al cerrar la última caja (esperado − retiro) contra lo que cuenta el siguiente al abrir.
CJ.ultimaCerrada=()=>db.cajas.filter(c=>c.cierre&&c.queda!=null).sort((a,b)=>a.cierre<b.cierre?1:-1)[0]||null;
CJ.abrir=(ini,nombre,nota)=>{CJ.fix();ini=CJ.num(ini);if(!isFinite(ini))return{err:CJ.ERR};ini=CJ.r2(ini);if(ini<0)return{err:'Ingresá el dinero inicial (0 o más)'};if(CJ.abierta())return{err:'Ya tenés una caja abierta'};
  const y=CJ.yo(),c={id:db.cjid++,uid:y.uid,user:y.user,caja:String(nombre||'').trim().slice(0,40)||'Caja 1',abre:new Date().toISOString(),ini,nota:String(nota||'').trim().slice(0,200),movs:[]},u=CJ.ultimaCerrada();
  if(u)c.traspaso={de:u.id,deUser:u.cerro||u.user,debia:u.queda,dif:CJ.r2(ini-u.queda)};
  db.cajas.push(c);save();return{ok:true,caja:c}};
// Retiro de efectivo al cerrar y arqueo por medio de pago. medios: {qr,deb,cre,tra,pt} con los totales que dice el posnet o la cuenta (texto con coma; vacío = no se cuenta).
CJ.MEDIOS=[['qr','QR','Mercado Pago QR'],['deb','Débito','Tarjeta de débito'],['cre','Crédito','Tarjeta de crédito'],['tra','Transferencia','Transferencia'],['pt','Mercado Pago Point','Mercado Pago Point']];
CJ.arqueo=(c,medios)=>{const k=CJ.calc(c),out={};for(const [id,,pay] of CJ.MEDIOS){const v=medios&&medios[id];if(v===''||v==null)continue;const n=CJ.num(v);if(!isFinite(n)||n<0)return{err:CJ.ERR};const reg=CJ.r2(k.porMedio0[pay]||0);out[id]={dec:CJ.r2(n),reg,dif:CJ.r2(n-reg)}}return{ok:true,out}};
// Movimiento de efectivo durante el turno, sin cerrar la caja. tipo: retiro · ingreso · gasto · devolucion (por defecto: ingreso o gasto según el sentido).
// Solo quien ve el arqueo recibe el aviso "no hay tanto efectivo": al empleado no se le bloquea (el número real no se le revela).
CJ.mov=(t,monto,motivo,tipo)=>{const c=CJ.abierta();if(!c)return{err:'No hay una caja abierta'};monto=CJ.num(monto);if(!isFinite(monto))return{err:CJ.ERR};monto=CJ.r2(monto);if(!['ingreso','egreso'].includes(t))return{err:'Tipo de movimiento inválido'};
  tipo=tipo||(t==='ingreso'?'ingreso':'gasto');if(!CJ.TIPOS[tipo]||CJ.TIPOS[tipo][0]!==t)return{err:'Tipo de movimiento inválido'};
  if(!(monto>0))return{err:'Ingresá un monto mayor a 0'};motivo=String(motivo||'').trim();if(!motivo)return{err:'Escribí el motivo del movimiento'};
  if(t==='egreso'&&CJ.ve()&&monto>CJ.calc(c).esperado+0.005)return{err:'No hay tanto efectivo en la caja (esperado '+fmt(CJ.calc(c).esperado)+')'};
  c.movs.push({t,tipo,monto,motivo:motivo.slice(0,120),date:new Date().toISOString(),user:CJ.yo().user});save();return{ok:true}};
// Cierre ciego: se guarda lo declarado (contado, retiro al cerrar, medios), el esperado calculado y la diferencia. Nunca se bloquea por faltante o sobrante.
// queda = lo que DEBÍA quedar (esperado − retiro, para el traspaso) · quedaDecl = lo que el responsable declara que queda (contado − retiro).
CJ.cerrar=(contado,nota,c=CJ.abierta(),extra={})=>{if(!c)return{err:'No hay una caja abierta'};if(contado===''||contado==null)return{err:'Ingresá el dinero contado'};contado=CJ.num(contado);if(!isFinite(contado))return{err:CJ.ERR};contado=CJ.r2(contado);if(contado<0)return{err:'El dinero contado no puede ser negativo'};const k=CJ.calc(c),dif=CJ.r2(contado-k.esperado);nota=String(nota||'').trim();
  let retiro=0;if(extra.retiro!==''&&extra.retiro!=null){retiro=CJ.num(extra.retiro);if(!isFinite(retiro)||retiro<0)return{err:'El retiro: '+CJ.ERR};retiro=CJ.r2(retiro);if(retiro>contado+0.005)return{err:'No podés retirar más de lo contado ('+fmt(contado)+')'}}
  const aq=CJ.arqueo(c,extra.medios);if(aq.err)return aq;
  Object.assign(c,{cierre:new Date().toISOString(),contado,dif,notaCierre:nota.slice(0,300),tot:k,cerro:CJ.yo().user,retiro,queda:CJ.r2(k.esperado-retiro),quedaDecl:CJ.r2(contado-retiro)});if(Object.keys(aq.out).length)c.arqueo=aq.out;save();return{ok:true,caja:c}};
// Corrección de un cierre (solo con permiso caja.editar): cambia lo declarado, nunca el esperado, y deja antes/después, quién, cuándo y motivo. Nada se borra.
CJ.corregir=(id,cam,motivo)=>{if(!CJ.puedeCorregir())return{err:'Tu usuario no puede corregir cierres de caja'};const c=db.cajas.find(x=>x.id===id);if(!c||!c.cierre)return{err:'Esa caja no está cerrada'};motivo=String(motivo||'').trim();if(!motivo)return{err:'Escribí el motivo de la corrección'};
  const lee=(v,ant)=>{if(v===''||v==null)return ant;const n=CJ.num(v);return isFinite(n)&&n>=0?CJ.r2(n):NaN},con=c.queda!=null,esp=c.tot.esperado;
  const contado=lee((cam||{}).contado,c.contado),retiro=con?lee((cam||{}).retiro,c.retiro||0):0;if(isNaN(contado)||isNaN(retiro))return{err:CJ.ERR};if(retiro>contado+0.005)return{err:'No se puede retirar más de lo contado'};
  const nota=(cam||{}).nota==null?(c.notaCierre||''):String(cam.nota).trim().slice(0,300);
  const f=o=>({contado:o.contado,dif:o.dif,retiro:o.retiro||0,queda:o.queda,quedaDecl:o.quedaDecl,notaCierre:o.notaCierre||''}),antes=f(c);
  const des={contado,dif:CJ.r2(contado-esp),retiro,queda:con?CJ.r2(esp-retiro):c.queda,quedaDecl:con?CJ.r2(contado-retiro):c.quedaDecl,notaCierre:nota};
  if(JSON.stringify(f(des))===JSON.stringify(antes))return{err:'No cambiaste ningún dato'};
  (c.correcciones=c.correcciones||[]).push({date:new Date().toISOString(),user:CJ.yo().user,motivo:motivo.slice(0,200),antes,despues:f(des)});Object.assign(c,des);save();return{ok:true,caja:c}};
// Etiquetas que usa el resto del programa al registrar ventas y cobros.
CJ.tag=o=>{const c=CJ.abierta();if(c)o.caja=c.id;return o};
// Cada uno cierra su caja; quien puede editar la configuración (dueño o administrador) puede cerrar la de otro.
CJ.puedeCerrar=c=>c.uid===CJ.yo().uid||can('configuracion','editar');
// Caja que quedó abierta de un día anterior (cerraron el programa sin cerrarla).
CJ.vieja=c=>!c.cierre&&UT.dk(c.abre)<UT.hoy();
CJ.puedeVender=()=>!CJ.exige()||!!CJ.abierta();

// ---------- Interfaz ----------
$('#v').insertAdjacentHTML('afterbegin',`<div class="card" id="cjbar" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px"></div>`);
CJ.ov=(html)=>{CJ.close();document.body.insertAdjacentHTML('beforeend',`<div class="ov" id="cjov" role="dialog" aria-modal="true"><div class="card">${html}</div></div>`);const o=$('#cjov');o.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();CJ.close()}});const f=o.querySelector('input');if(f){f.focus();CJ.refocus(f)}return o};
CJ.refocus=f=>{const d=()=>{if(f.isConnected&&document.activeElement!==f)f.focus()};setTimeout(d,150);setTimeout(d,600);window.addEventListener('focus',d,{once:true})};
CJ.close=()=>{const o=$('#cjov');if(o)o.remove()};
CJ.drawBar=()=>{const b=$('#cjbar');if(!b||$('#v').classList.contains('hide'))return;const c=CJ.abierta();
  if(!c){b.innerHTML=`<span><b>Caja cerrada.</b> <span class="mu">${CJ.exige()?'Abrí la caja para poder cobrar.':'Podés abrir una caja para controlar el efectivo del turno.'}</span></span><span style="flex:1"></span><button class="btn" id="cj_ab">Abrir caja</button>`;return}
  const k=CJ.calc(c),r=CJ.resumen(c);b.innerHTML=`${CJ.vieja(c)?'<span class="tag out">Abierta desde otro día: cerrala y abrí una nueva</span>':''}<span><b>${esc(c.caja)}</b> abierta por ${esc(c.user)} · ${new Date(c.abre).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</span><span class="mu">Inicial ${fmt(c.ini)} · ${r.ventas} ${r.ventas===1?'venta':'ventas'}${CJ.ve()?' · Efectivo esperado <b>'+fmt(k.esperado)+'</b> · Vendido '+fmt(k.vendido):''}</span><span style="flex:1"></span><button class="btn sec" id="cj_rs">Resumen del turno</button><button class="btn sec" id="cj_mv">Movimientos de efectivo</button><button class="btn sec" id="cj_ce">Cerrar caja</button>`};
// Resumen de control del turno: cantidades, productos, anulaciones y movimientos propios. Quien tiene caja.ver suma el esperado y los totales.
CJ.formResumen=(c=CJ.abierta())=>{if(!c)return;const r=CJ.resumen(c),k=CJ.calc(c),L=Object.entries,R=(a,b)=>`<div class="row"><span>${a}</span><b>${b}</b></div>`;
  CJ.ov(`<h3>Resumen del turno</h3><p class="mu" style="margin-top:0">${esc(c.caja)} · ${esc(c.user)} · desde ${new Date(c.abre).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</p>
  ${R('Dinero inicial declarado',fmt(c.ini))}${R('Ventas',r.ventas)}${L(r.porMedio).map(([m,n])=>R('· '+esc(m),n+(n===1?' venta':' ventas'))).join('')}${R('Ventas anuladas',r.anuladas)}${R('Cobros de deudas',r.cobros)}
  ${CJ.ve()?R('Efectivo esperado',fmt(k.esperado))+R('Total vendido',fmt(k.vendido)):''}
  <h4 style="margin:12px 0 4px">Productos vendidos</h4>${L(r.unidades).map(([n,q])=>`<div class="row"><span>${esc(n)}</span><b>${q}</b></div>`).join('')||'<p class="mu">Todavía no se vendió nada.</p>'}
  <h4 style="margin:12px 0 4px">Movimientos de efectivo del turno</h4>${r.movs.map(m=>`<div class="row"><span>${esc(CJ.nomMov(m))} · ${esc(m.motivo)} <span class="mu">(${esc(m.user)}, ${new Date(m.date).toLocaleTimeString('es-AR',{timeStyle:'short'})})</span></span><b>${m.t==='egreso'?'− ':'+ '}${fmt(m.monto)}</b></div>`).join('')||'<p class="mu">No registraste movimientos.</p>'}
  <div style="display:flex;gap:8px;margin-top:12px"><button class="btn sec" data-cjx="1">Cerrar</button></div>`)};
CJ.formAbrir=(msg)=>{CJ.ov(`<h3>Abrir caja</h3>${msg?`<p class="tip">${esc(msg)}</p>`:''}<div class="form" style="${CJ.GRID}"><div><label>Dinero inicial en efectivo</label>${CJ.campo('cj_ini','0')}</div><div><label>Caja o terminal</label><input id="cj_nom" placeholder="Caja 1"></div><div><label>Observaciones (opcional)</label><input id="cj_no"></div>${CJ.ayuda('cj_ini')}</div><p class="mu" style="margin:0 0 10px">Responsable: <b>${esc(CJ.yo().user)}</b></p><div style="display:flex;gap:8px"><button class="btn" id="cj_aok">Abrir caja</button><button class="btn sec" data-cjx="1">Cancelar</button></div>`);
  $('#cj_aok').onclick=()=>{const r=CJ.abrir($('#cj_ini').value,$('#cj_nom').value,$('#cj_no').value);if(r.err)return toast(r.err);CJ.close();draw();const tp=r.caja.traspaso;toast('Caja abierta con '+fmt(r.caja.ini)+(!CJ.ve()?'':tp&&Math.abs(tp.dif)>=0.005?' · ATENCIÓN: el turno anterior (' +tp.deUser+') dejó '+fmt(tp.debia)+' y contaste '+fmt(r.caja.ini)+': diferencia de '+fmt(tp.dif):tp?' · coincide con lo que dejó el turno anterior':''));const q=$('#q');if(q)q.focus()};
  $('#cj_ini').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#cj_aok').click()}}};
CJ.formMov=()=>{CJ.ov(`<h3>Movimientos de efectivo</h3><p class="mu" style="margin-top:0">Podés retirar o cargar efectivo en cualquier momento del turno, sin cerrar la caja.</p><div class="form" style="${CJ.GRID}"><div><label>Tipo</label><select id="cj_mt">${Object.entries(CJ.TIPOS).map(([k,[,n]])=>`<option value="${k}">${n}</option>`).join('')}</select></div><div><label>Monto</label>${CJ.campo('cj_mm')}</div><div id="cj_mcw" class="hide"><label>Tipo de gasto</label><select id="cj_mc">${['Proveedor','Mercadería e insumos','Servicios','Sueldos','Otros'].map(x=>`<option>${x}</option>`).join('')}</select></div><div><label>Motivo</label><input id="cj_mo" placeholder="Ej.: a la caja fuerte, pago a proveedor, cambio"></div>${CJ.ayuda('cj_mm')}</div><div style="display:flex;gap:8px"><button class="btn" id="cj_mok">Registrar</button><button class="btn sec" data-cjx="1">Cancelar</button></div>`);
  $('#cj_mt').onchange=()=>$('#cj_mcw').classList.toggle('hide',$('#cj_mt').value!=='gasto');
  $('#cj_mok').onclick=()=>{const tp=$('#cj_mt').value,r=CJ.mov(CJ.TIPOS[tp][0],$('#cj_mm').value,$('#cj_mo').value,tp);if(r.err)return toast(r.err);if(tp==='gasto'){const c=CJ.abierta();c.movs[c.movs.length-1].cat=$('#cj_mc').value;save()}CJ.close();draw();toast(CJ.TIPOS[tp][1]+' registrado')}};
CJ.formCerrar=(msg,c=CJ.abierta())=>{if(!c)return;const k=CJ.calc(c),ve=CJ.ve(),R=(a,b,x='')=>`<div class="row"><span>${a}</span><b ${x}>${b}</b></div>`;
  CJ.ov(`<h3>Cerrar caja</h3>${msg?`<p class="tip">${esc(msg)}</p>`:''}<p class="mu" style="margin-top:0">${esc(c.caja)} · ${esc(c.user)} · desde ${new Date(c.abre).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</p>
  ${ve?`${R('Dinero inicial',fmt(c.ini))}${R('Ventas en efectivo',fmt(k.efVentas))}${R('Cobros de deudas en efectivo',fmt(k.efCobros))}${R('Ingresos',fmt(k.ingresos))}${R('Retiros y gastos','− '+fmt(k.egresos))}${R('Efectivo esperado',fmt(k.esperado),'style="font-size:18px"')}
  <p class="mu" style="margin:10px 0 4px">Total vendido en el turno: <b>${fmt(k.vendido)}</b> (${k.ventas} ventas)${Object.keys(k.porMedio).length?' · '+Object.entries(k.porMedio).map(([m,v])=>esc(m)+' '+fmt(v)).join(' · '):''}. Lo cobrado con tarjeta, transferencia o en cuenta corriente no está en la caja.</p>`
  :'<p class="mu" style="margin:0 0 10px">Contá el efectivo que hay en la caja y escribilo. El cierre se registra siempre, tal como lo declarás.</p>'}
  <div class="form" style="${CJ.GRID}"><div><label>Dinero contado</label>${CJ.campo('cj_ct')}</div><div><label>Observaciones (opcional)</label><input id="cj_cn"></div>${CJ.ayuda('cj_ct')}</div>${ve?'<div id="cj_df" style="font-weight:700;margin-bottom:10px"></div>':''}
  <div class="form" style="${CJ.GRID}"><div><label>Retiro de efectivo al cerrar (opcional)</label>${CJ.campo('cj_rt')}</div><div style="align-self:end"><span class="mu">Queda en la caja</span><br><b id="cj_qd" style="font-size:18px"></b></div>${CJ.ayuda('cj_rt','Podés retirar efectivo durante el turno desde «Movimientos de efectivo», o no retirar nada')}</div>
  <details style="margin:10px 0"><summary class="mu" style="cursor:pointer">Totales de posnet, QR y cuenta (opcional): cargá lo que dicen</summary><div class="form" style="${CJ.GRID};margin-top:8px">${CJ.MEDIOS.filter(([,,p])=>p!=='Mercado Pago Point'||k.porMedio0[p]).map(([id,n,p])=>`<div><label>${n}${ve?' (registrado '+fmt(k.porMedio0[p]||0)+')':''}</label>${CJ.campo('cj_m_'+id)}</div>`).join('')}</div><div id="cj_ad" class="mu" style="margin-top:6px"></div></details>
  <div style="display:flex;gap:8px"><button class="btn" id="cj_cok">Confirmar cierre</button><button class="btn sec" data-cjx="1">Cancelar</button></div>`);
  const medios=()=>{const m={};CJ.MEDIOS.forEach(([id])=>{const e=$('#cj_m_'+id);if(e)m[id]=e.value});return m};
  const queda=()=>{const n=CJ.num($('#cj_ct').value.trim()),r=CJ.num($('#cj_rt').value.trim()||0);$('#cj_qd').textContent=!isFinite(n)?'':isFinite(r)?fmt(CJ.r2(n-r)):CJ.ERR};
  $('#cj_ct').oninput=()=>{queda();if(!ve)return;const v=$('#cj_ct').value.trim();if(v===''){$('#cj_df').textContent='';return}const n=CJ.num(v);if(!isFinite(n)){$('#cj_df').textContent=CJ.ERR;return}const d=CJ.r2(n-k.esperado),[,t]=CJ.dif(d);$('#cj_df').innerHTML=`Diferencia: <span style="color:var(--${Math.abs(d)<0.005?'ok':d>0?'warn':'bad'})">${fmt(d)} · ${t}</span>`};
  $('#cj_rt').oninput=queda;
  const ad=()=>{if(!ve)return;const a=CJ.arqueo(c,medios());$('#cj_ad').innerHTML=a.err?a.err:Object.entries(a.out).map(([id,x])=>`${CJ.MEDIOS.find(m=>m[0]===id)[1]}: ${CJ.dif(x.dif)[1]}${Math.abs(x.dif)>=0.005?' '+fmt(x.dif):''}`).join(' · ')};
  CJ.MEDIOS.forEach(([id])=>{const e=$('#cj_m_'+id);if(e)e.oninput=ad});
  $('#cj_cok').onclick=()=>{const r=CJ.cerrar($('#cj_ct').value,$('#cj_cn').value,c,{retiro:$('#cj_rt').value,medios:medios()});if(r.err)return toast(r.err);CJ.close();draw();
    if(!ve)return toast('Cierre registrado');const[,t]=CJ.dif(r.caja.dif),dm=Object.values(r.caja.arqueo||{}).filter(x=>Math.abs(x.dif)>=0.005).length;toast('Cierre registrado · '+t+(Math.abs(r.caja.dif)>=0.005?' '+fmt(r.caja.dif):'')+(dm?' · diferencia en '+dm+' medio(s) de pago':'')+' · Debía quedar en la caja '+fmt(r.caja.queda))}};
// Corregir un cierre ya registrado (solo con permiso caja.editar): motivo obligatorio y queda el antes y el después.
CJ.formCorregir=id=>{const c=db.cajas.find(x=>x.id===id);if(!c||!c.cierre||!CJ.puedeCorregir())return;
  CJ.ov(`<h3>Corregir cierre de caja</h3><p class="mu" style="margin-top:0">${esc(c.caja)} · ${esc(c.user)} · cerrada el ${new Date(c.cierre).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}. El cierre original queda guardado en el historial de correcciones.</p>
  <div class="form" style="${CJ.GRID}"><div><label>Dinero contado</label>${CJ.campo('cj_xc',String(c.contado).replace('.',','))}</div>${c.queda!=null?`<div><label>Retiro al cerrar</label>${CJ.campo('cj_xr',String(c.retiro||0).replace('.',','))}</div>`:''}<div><label>Observaciones</label><input id="cj_xn" value="${esc(c.notaCierre||'')}"></div><div><label>Motivo de la corrección (obligatorio)</label><input id="cj_xm"></div>${CJ.ayuda('cj_xc')}</div>
  <div style="display:flex;gap:8px"><button class="btn" id="cj_xok">Guardar corrección</button><button class="btn sec" data-cjx="1">Cancelar</button></div>`);
  $('#cj_xok').onclick=()=>{const r=CJ.corregir(id,{contado:$('#cj_xc').value,retiro:$('#cj_xr')?$('#cj_xr').value:undefined,nota:$('#cj_xn').value},$('#cj_xm').value);if(r.err)return toast(r.err);CJ.close();draw();toast('Corrección registrada')}};
document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
  if(t.dataset.cjc){const c=(db.cajas||[]).find(x=>x.id===+t.dataset.cjc&&!x.cierre);if(c&&CJ.puedeCerrar(c))CJ.formCerrar('Vas a cerrar la caja de '+c.user+'. Contá el efectivo que quedó.',c)}else if(t.id==='cj_ab')CJ.formAbrir();else if(t.id==='cj_mv')CJ.formMov();else if(t.id==='cj_ce')CJ.formCerrar();else if(t.id==='cj_rs')CJ.formResumen();else if(t.dataset.cjk)CJ.formCorregir(+t.dataset.cjk);else if(t.dataset.cjx)CJ.close()});
// Al cerrar sesión con la caja abierta: se pide el cierre (no se cierra sola ni se inventan valores).
document.addEventListener('click',e=>{if(!e.target.closest('#salir'))return;if(CJ.abierta()){e.stopImmediatePropagation();e.preventDefault();CJ.formCerrar('Tenés la caja abierta. Cerrala antes de salir (contá el efectivo).')}},true);

// Al volver a abrir el programa (cierre con la X, corte de luz o falla) se avisa que la caja sigue abierta.
CJ.avisada=false;MODS.push(()=>{if(CJ.avisada||typeof toast!=='function')return;CJ.avisada=true;const c=CJ.abierta();if(c&&new Date(c.abre)<CJ.inicio)
  toast('Seguís con la caja abierta desde '+new Date(c.abre).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})+' (inicial '+fmt(c.ini)+').')});
CJ.inicio=new Date();
// Al cerrar la ventana con la caja abierta, el programa instalado pregunta si cerrarla (main.js muestra el cartel).
CJ.app=()=>KIND==='ipc';window.addEventListener('beforeunload',e=>{if(!CJ.app()||!CJ.abierta())return;e.preventDefault();e.returnValue='';setTimeout(()=>CJ.formCerrar('Cerrá la caja antes de salir (contá el efectivo).'),0)});

// ---------- Historial de cajas (Más > Caja) ----------
$('main').insertAdjacentHTML('beforeend',`<section id="k" class="hide"><div class="card"><div class="lh"><h3>Historial de cajas</h3></div><div class="form"><div><label>Empleado</label><select id="kh_u"></select></div><div><label>Desde</label><input id="kh_d" type="date"></div><div><label>Hasta</label><input id="kh_h" type="date"></div><div><label>Estado</label><select id="kh_e"><option value="">Todas</option><option value="a">Abiertas</option><option value="c">Cerradas</option><option value="d">Con diferencia</option></select></div></div><p id="kh_s" class="mu" style="margin:0 0 8px"></p><div class="wrap"><table><thead id="kh_h0"></thead><tbody id="kh_l"></tbody></table></div></div></section>`);
$('#masmenu').insertAdjacentHTML('beforeend','<button data-t="k">Caja</button>');
{const b=$('#masmenu button[data-t="k"]');b.onclick=()=>{$$('nav button').forEach(x=>x.classList.toggle('on',x===b));$$('nav button').map(x=>x.dataset.t).forEach(s=>$('#'+s)&&$('#'+s).classList.toggle('hide',s!=='k'));$('#masmenu').classList.add('hide');masRefresh();draw()}}
MODT.k='reporte';if(typeof CF!=='undefined'&&CF.NAVN)CF.NAVN.k='Caja';
{const r0=relevante;relevante=t=>t==='k'?true:r0(t)}
// Detalle de una caja para el historial. Con caja.ver: retiro, lo que debía quedar, traspaso, arqueo y correcciones. Sin caja.ver: solo lo que declaró (retiro y lo que dejó), sin ningún esperado.
CJ.extra=c=>{const L=[],ve=CJ.ve();if(ve&&c.traspaso&&Math.abs(c.traspaso.dif)>=0.005)L.push(`<span class="tag ${c.traspaso.dif<0?'out':'low'}">Traspaso: debía haber ${fmt(c.traspaso.debia)} (de ${esc(c.traspaso.deUser)}), se contó ${fmt(c.ini)} · ${fmt(c.traspaso.dif)}</span>`);
  if(c.cierre&&c.queda!=null)L.push(ve?`Retiro ${fmt(c.retiro||0)} · debía quedar ${fmt(c.queda)}${c.quedaDecl!=null?' · declaró que queda '+fmt(c.quedaDecl):''}`:`Retiro ${fmt(c.retiro||0)}${c.quedaDecl!=null?' · quedó '+fmt(c.quedaDecl):''}`);
  if(ve)Object.entries(c.arqueo||{}).forEach(([id,x])=>{const m=CJ.MEDIOS.find(y=>y[0]===id);if(m)L.push(`${esc(m[1])}: declarado ${fmt(x.dec)} / registrado ${fmt(x.reg)}${Math.abs(x.dif)>=0.005?` · <b>dif. ${fmt(x.dif)}</b>`:''}`)});
  if(ve)(c.correcciones||[]).forEach(x=>L.push(`<span class="tag low">Corregido</span> ${new Date(x.date).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})} por ${esc(x.user)}: contado ${fmt(x.antes.contado)} → ${fmt(x.despues.contado)} (dif. ${fmt(x.antes.dif)} → ${fmt(x.despues.dif)}) · motivo: ${esc(x.motivo)}`));
  return L.length?'<br><span class="mu">'+L.join('<br>')+'</span>':''};
CJ.drawHist=()=>{if($('#k').classList.contains('hide'))return;CJ.fix();const ve=CJ.ve(),yo=CJ.yo(),mias=db.cajas.filter(c=>ve||c.uid===yo.uid),su=$('#kh_u'),cu=su.value,us=[...new Set(mias.map(c=>c.user))];su.innerHTML='<option value="">Todos</option>'+us.map(u=>`<option>${esc(u)}</option>`).join('');su.value=us.includes(cu)?cu:'';
  {const se=$('#kh_e'),ev0=se.value;se.innerHTML='<option value="">Todas</option><option value="a">Abiertas</option><option value="c">Cerradas</option>'+(ve?'<option value="d">Con diferencia</option>':'');se.value=[...se.options].some(o=>o.value===ev0)?ev0:''}
  $('#kh_h0').innerHTML=ve?'<tr><th>Empleado</th><th>Caja</th><th>Apertura</th><th>Cierre</th><th class="n">Inicial</th><th class="n">Esperado</th><th class="n">Declarado</th><th class="n">Diferencia</th><th class="n">Vendido</th><th>Por medio de pago</th><th>Observaciones</th></tr>':'<tr><th>Empleado</th><th>Caja</th><th>Apertura</th><th>Cierre</th><th class="n">Inicial</th><th class="n">Declarado</th><th class="n">Ventas</th><th>Estado</th><th>Observaciones</th></tr>';
  const d=$('#kh_d').value,h=$('#kh_h').value,e=$('#kh_e').value;
  const L=mias.filter(c=>(!su.value||c.user===su.value)&&(!d||UT.dk(c.abre)>=d)&&(!h||UT.dk(c.abre)<=h)&&(!e||(e==='a'?!c.cierre:e==='c'?!!c.cierre:!!c.cierre&&Math.abs(c.dif)>=0.005))).sort((a,b)=>a.abre<b.abre?1:-1);
  const F=x=>new Date(x).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'}),cerr=L.filter(c=>c.cierre);
  $('#kh_s').innerHTML=`${L.length} ${L.length===1?'caja':'cajas'}${ve?` · Diferencia acumulada de las cerradas: <b>${fmt(cerr.reduce((a,c)=>a+c.dif,0))}</b>`:''}`;
  $('#kh_l').innerHTML=L.map(c=>{const k=c.cierre?c.tot:CJ.calc(c),[cl,t]=c.cierre?CJ.dif(c.dif):['','Abierta'],ab=`<span class="tag low">Abierta</span>${CJ.puedeCerrar(c)?` <button class="btn sec" data-cjc="${c.id}" style="padding:2px 8px">Cerrar</button>`:''}`,
      cie=c.cierre?F(c.cierre)+(c.cerro&&c.cerro!==c.user?'<br><span class="mu">por '+esc(c.cerro)+'</span>':''):ab,
      obs=`${[c.nota,c.notaCierre].filter(Boolean).map(esc).join(' · ')||'-'}${(c.movs||[]).length?`<br><span class="mu">${c.movs.map(m=>esc(CJ.nomMov(m))+' '+fmt(m.monto)+' ('+esc(m.motivo)+')').join(' · ')}</span>`:''}${CJ.extra(c)}${c.cierre&&CJ.puedeCorregir()?`<br><button class="btn sec" data-cjk="${c.id}" style="padding:2px 8px">Corregir</button>`:''}`;
    return ve?`<tr><td>${esc(c.user)}</td><td>${esc(c.caja)}</td><td>${F(c.abre)}</td><td>${cie}</td><td class="n">${fmt(c.ini)}</td><td class="n">${fmt(k.esperado)}</td><td class="n">${c.cierre?fmt(c.contado):'-'}</td><td class="n">${c.cierre?`${fmt(c.dif)} <span class="tag ${cl}">${t}</span>`:'-'}</td><td class="n">${fmt(k.vendido)}</td><td style="white-space:normal">${Object.entries(k.porMedio).map(([m,v])=>esc(m)+': '+fmt(v)).join('<br>')||'-'}</td><td style="white-space:normal">${obs}</td></tr>`
    :`<tr><td>${esc(c.user)}</td><td>${esc(c.caja)}</td><td>${F(c.abre)}</td><td>${cie}</td><td class="n">${fmt(c.ini)}</td><td class="n">${c.cierre?fmt(c.contado):'-'}</td><td class="n">${k.ventas!=null?k.ventas:'-'}</td><td>${c.cierre?'<span class="tag">Cierre registrado</span>':'<span class="tag low">Abierta</span>'}</td><td style="white-space:normal">${obs}</td></tr>`}).join('')||`<tr><td colspan="${ve?11:9}" class="mu">Todavía no hay cajas registradas.</td></tr>`};
['#kh_u','#kh_d','#kh_h','#kh_e'].forEach(s=>$(s).onchange=CJ.drawHist);
MODS.push(()=>{CJ.fix();CJ.drawBar();CJ.drawHist()});
// Configuración > Mi negocio: exigir caja abierta para cobrar.
{const n=$('#cfg_caja');if(n){n.insertAdjacentHTML('beforeend',`<div class="card" id="cfg_cajac" data-kw="caja abierta cobrar turno efectivo apertura cierre"><h3>Caja</h3><div class="aj"><div class="aj-t"><label for="cj_req">Exigir una caja abierta para cobrar ventas</label><p class="mu">Recomendado: cada empleado abre su caja con el dinero inicial y la cierra contando el efectivo al terminar el turno.</p></div><div class="aj-c"><input type="checkbox" id="cj_req"></div></div></div>`);
  $('#cj_req').onchange=()=>{if(!can('configuracion','editar')){$('#cj_req').checked=CJ.exige();return toast('Tu usuario no tiene permiso para esto')}db.cfg.cajaObligatoria=$('#cj_req').checked;save();draw();toast($('#cj_req').checked?'Se exige caja abierta para cobrar':'Ya no se exige caja abierta')};
  MODS.push(()=>{const c=$('#cj_req');if(c)c.checked=CJ.exige()})}}
