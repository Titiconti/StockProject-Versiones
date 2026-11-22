// ===== Caja: apertura, movimientos, cierre por turno e historial (v3.0.0, fase 1) =====
// Reglas:
//  - Cada usuario abre su propia caja (sin usuarios activados hay una sola caja compartida).
//  - Las ventas y los cobros de deudas quedan asociados a la caja abierta de quien los registra.
//  - Dinero esperado = inicial + ventas en efectivo + cobros en efectivo + ingresos − egresos.
//    Tarjeta, transferencia y cuenta corriente NO suman al efectivo de la caja.
//  - Diferencia = contado − esperado (positiva: sobrante · negativa: faltante · cero: equilibrada).
//  - Un cierre confirmado guarda una foto de los totales y no se puede editar.
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
  const porMedio={};S.forEach(s=>{const k=/^Mercado Pago/.test(s.pay)?'Mercado Pago':s.pay;porMedio[k]=CJ.r2((porMedio[k]||0)+s.total)});
  const vendido=CJ.r2(S.reduce((a,s)=>a+s.total,0)),efV=porMedio[CJ.EF]||0,efC=CJ.r2(P.filter(p=>p.method===CJ.EF).reduce((a,p)=>a+p.amount,0)),
    cobros=CJ.r2(P.reduce((a,p)=>a+p.amount,0)),ing=CJ.r2(M.filter(m=>m.t==='ingreso').reduce((a,m)=>a+m.monto,0)),egr=CJ.r2(M.filter(m=>m.t==='egreso').reduce((a,m)=>a+m.monto,0));
  return{ventas:S.length,vendido,porMedio,efVentas:efV,efCobros:efC,cobros,ingresos:ing,egresos:egr,esperado:CJ.r2(c.ini+efV+efC+ing-egr)}};
CJ.dif=d=>Math.abs(d)<0.005?['','Equilibrada']:d>0?['low','Sobrante']:['out','Faltante'];
CJ.abrir=(ini,nombre,nota)=>{CJ.fix();ini=CJ.num(ini);if(!isFinite(ini))return{err:CJ.ERR};ini=CJ.r2(ini);if(ini<0)return{err:'Ingresá el dinero inicial (0 o más)'};if(CJ.abierta())return{err:'Ya tenés una caja abierta'};
  const y=CJ.yo(),c={id:db.cjid++,uid:y.uid,user:y.user,caja:String(nombre||'').trim().slice(0,40)||'Caja 1',abre:new Date().toISOString(),ini,nota:String(nota||'').trim().slice(0,200),movs:[]};
  db.cajas.push(c);save();return{ok:true,caja:c}};
CJ.mov=(t,monto,motivo)=>{const c=CJ.abierta();if(!c)return{err:'No hay una caja abierta'};monto=CJ.num(monto);if(!isFinite(monto))return{err:CJ.ERR};monto=CJ.r2(monto);if(!['ingreso','egreso'].includes(t))return{err:'Tipo de movimiento inválido'};
  if(!(monto>0))return{err:'Ingresá un monto mayor a 0'};motivo=String(motivo||'').trim();if(!motivo)return{err:'Escribí el motivo del movimiento'};
  if(t==='egreso'&&monto>CJ.calc(c).esperado+0.005)return{err:'No hay tanto efectivo en la caja (esperado '+fmt(CJ.calc(c).esperado)+')'};
  c.movs.push({t,monto,motivo:motivo.slice(0,120),date:new Date().toISOString(),user:CJ.yo().user});save();return{ok:true}};
CJ.cerrar=(contado,nota,c=CJ.abierta())=>{if(!c)return{err:'No hay una caja abierta'};if(contado===''||contado==null)return{err:'Ingresá el dinero contado'};contado=CJ.num(contado);if(!isFinite(contado))return{err:CJ.ERR};contado=CJ.r2(contado);if(contado<0)return{err:'El dinero contado no puede ser negativo'};const k=CJ.calc(c),dif=CJ.r2(contado-k.esperado);nota=String(nota||'').trim();
  if(Math.abs(dif)>=0.005&&!nota)return{err:'Hay una diferencia de '+fmt(dif)+': escribí una observación para explicarla'};
  Object.assign(c,{cierre:new Date().toISOString(),contado,dif,notaCierre:nota.slice(0,300),tot:k,cerro:CJ.yo().user});save();return{ok:true,caja:c}};
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
  const k=CJ.calc(c);b.innerHTML=`${CJ.vieja(c)?'<span class="tag out">Abierta desde otro día: cerrala y abrí una nueva</span>':''}<span><b>${esc(c.caja)}</b> abierta por ${esc(c.user)} · ${new Date(c.abre).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</span><span class="mu">Inicial ${fmt(c.ini)} · Efectivo esperado <b>${fmt(k.esperado)}</b> · Vendido ${fmt(k.vendido)}</span><span style="flex:1"></span><button class="btn sec" id="cj_mv">Ingreso / retiro</button><button class="btn sec" id="cj_ce">Cerrar caja</button>`};
CJ.formAbrir=(msg)=>{CJ.ov(`<h3>Abrir caja</h3>${msg?`<p class="tip">${esc(msg)}</p>`:''}<div class="form" style="${CJ.GRID}"><div><label>Dinero inicial en efectivo</label>${CJ.campo('cj_ini','0')}</div><div><label>Caja o terminal</label><input id="cj_nom" placeholder="Caja 1"></div><div><label>Observaciones (opcional)</label><input id="cj_no"></div>${CJ.ayuda('cj_ini')}</div><p class="mu" style="margin:0 0 10px">Responsable: <b>${esc(CJ.yo().user)}</b></p><div style="display:flex;gap:8px"><button class="btn" id="cj_aok">Abrir caja</button><button class="btn sec" data-cjx="1">Cancelar</button></div>`);
  $('#cj_aok').onclick=()=>{const r=CJ.abrir($('#cj_ini').value,$('#cj_nom').value,$('#cj_no').value);if(r.err)return toast(r.err);CJ.close();draw();toast('Caja abierta con '+fmt(r.caja.ini));const q=$('#q');if(q)q.focus()};
  $('#cj_ini').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#cj_aok').click()}}};
CJ.formMov=()=>{CJ.ov(`<h3>Ingreso o retiro de efectivo</h3><div class="form" style="${CJ.GRID}"><div><label>Tipo</label><select id="cj_mt"><option value="egreso">Retiro (sale efectivo)</option><option value="ingreso">Ingreso (entra efectivo)</option></select></div><div><label>Monto</label>${CJ.campo('cj_mm')}</div><div id="cj_mcw"><label>Tipo de gasto</label><select id="cj_mc">${['Proveedor','Mercadería e insumos','Servicios','Sueldos','Otros'].map(x=>`<option>${x}</option>`).join('')}</select></div><div><label>Motivo</label><input id="cj_mo" placeholder="Ej.: pago a proveedor, cambio"></div>${CJ.ayuda('cj_mm')}</div><div style="display:flex;gap:8px"><button class="btn" id="cj_mok">Registrar</button><button class="btn sec" data-cjx="1">Cancelar</button></div>`);
  $('#cj_mt').onchange=()=>$('#cj_mcw').classList.toggle('hide',$('#cj_mt').value!=='egreso');
  $('#cj_mok').onclick=()=>{const t=$('#cj_mt').value,r=CJ.mov(t,$('#cj_mm').value,$('#cj_mo').value);if(r.err)return toast(r.err);if(t==='egreso'){const c=CJ.abierta();c.movs[c.movs.length-1].cat=$('#cj_mc').value;save()}CJ.close();draw();toast('Movimiento registrado')}};
CJ.formCerrar=(msg,c=CJ.abierta())=>{if(!c)return;const k=CJ.calc(c),R=(a,b,x='')=>`<div class="row"><span>${a}</span><b ${x}>${b}</b></div>`;
  CJ.ov(`<h3>Cerrar caja</h3>${msg?`<p class="tip">${esc(msg)}</p>`:''}<p class="mu" style="margin-top:0">${esc(c.caja)} · ${esc(c.user)} · desde ${new Date(c.abre).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</p>
  ${R('Dinero inicial',fmt(c.ini))}${R('Ventas en efectivo',fmt(k.efVentas))}${R('Cobros de deudas en efectivo',fmt(k.efCobros))}${R('Ingresos',fmt(k.ingresos))}${R('Retiros','− '+fmt(k.egresos))}${R('Efectivo esperado',fmt(k.esperado),'style="font-size:18px"')}
  <p class="mu" style="margin:10px 0 4px">Total vendido en el turno: <b>${fmt(k.vendido)}</b> (${k.ventas} ventas)${Object.keys(k.porMedio).length?' · '+Object.entries(k.porMedio).map(([m,v])=>esc(m)+' '+fmt(v)).join(' · '):''}. Lo cobrado con tarjeta, transferencia o en cuenta corriente no está en la caja.</p>
  <div class="form" style="${CJ.GRID}"><div><label>Dinero contado</label>${CJ.campo('cj_ct')}</div><div><label>Observaciones</label><input id="cj_cn"></div>${CJ.ayuda('cj_ct','Si hay diferencia, explicá por qué en Observaciones')}</div><div id="cj_df" style="font-weight:700;margin-bottom:10px"></div>
  <div style="display:flex;gap:8px"><button class="btn" id="cj_cok">Confirmar cierre</button><button class="btn sec" data-cjx="1">Cancelar</button></div>`);
  $('#cj_ct').oninput=()=>{const v=$('#cj_ct').value.trim();if(v===''){$('#cj_df').textContent='';return}const n=CJ.num(v);if(!isFinite(n)){$('#cj_df').textContent=CJ.ERR;return}const d=CJ.r2(n-k.esperado),[,t]=CJ.dif(d);$('#cj_df').innerHTML=`Diferencia: <span style="color:var(--${Math.abs(d)<0.005?'ok':d>0?'warn':'bad'})">${fmt(d)} · ${t}</span>`};
  $('#cj_cok').onclick=()=>{const r=CJ.cerrar($('#cj_ct').value,$('#cj_cn').value,c);if(r.err)return toast(r.err);CJ.close();draw();const[,t]=CJ.dif(r.caja.dif);toast('Caja cerrada · '+t+(Math.abs(r.caja.dif)>=0.005?' '+fmt(r.caja.dif):''))}};
document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
  if(t.dataset.cjc){const c=(db.cajas||[]).find(x=>x.id===+t.dataset.cjc&&!x.cierre);if(c&&CJ.puedeCerrar(c))CJ.formCerrar('Vas a cerrar la caja de '+c.user+'. Contá el efectivo que quedó.',c)}else if(t.id==='cj_ab')CJ.formAbrir();else if(t.id==='cj_mv')CJ.formMov();else if(t.id==='cj_ce')CJ.formCerrar();else if(t.dataset.cjx)CJ.close()});
// Al cerrar sesión con la caja abierta: se pide el cierre (no se cierra sola ni se inventan valores).
document.addEventListener('click',e=>{if(!e.target.closest('#salir'))return;if(CJ.abierta()){e.stopImmediatePropagation();e.preventDefault();CJ.formCerrar('Tenés la caja abierta. Cerrala antes de salir (contá el efectivo).')}},true);

// Al volver a abrir el programa (cierre con la X, corte de luz o falla) se avisa que la caja sigue abierta.
CJ.avisada=false;MODS.push(()=>{if(CJ.avisada||typeof toast!=='function')return;CJ.avisada=true;const c=CJ.abierta();if(c&&new Date(c.abre)<CJ.inicio)
  toast('Seguís con la caja abierta desde '+new Date(c.abre).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})+' (inicial '+fmt(c.ini)+').')});
CJ.inicio=new Date();
// Al cerrar la ventana con la caja abierta, el programa instalado pregunta si cerrarla (main.js muestra el cartel).
CJ.app=()=>KIND==='ipc';window.addEventListener('beforeunload',e=>{if(!CJ.app()||!CJ.abierta())return;e.preventDefault();e.returnValue='';setTimeout(()=>CJ.formCerrar('Cerrá la caja antes de salir (contá el efectivo).'),0)});

// ---------- Historial de cajas (Más > Caja) ----------
$('main').insertAdjacentHTML('beforeend',`<section id="k" class="hide"><div class="card"><div class="lh"><h3>Historial de cajas</h3></div><div class="form"><div><label>Empleado</label><select id="kh_u"></select></div><div><label>Desde</label><input id="kh_d" type="date"></div><div><label>Hasta</label><input id="kh_h" type="date"></div><div><label>Estado</label><select id="kh_e"><option value="">Todas</option><option value="a">Abiertas</option><option value="c">Cerradas</option><option value="d">Con diferencia</option></select></div></div><p id="kh_s" class="mu" style="margin:0 0 8px"></p><div class="wrap"><table><thead><tr><th>Empleado</th><th>Caja</th><th>Apertura</th><th>Cierre</th><th class="n">Inicial</th><th class="n">Esperado</th><th class="n">Contado</th><th class="n">Diferencia</th><th class="n">Vendido</th><th>Por medio de pago</th><th>Observaciones</th></tr></thead><tbody id="kh_l"></tbody></table></div></div></section>`);
$('#masmenu').insertAdjacentHTML('beforeend','<button data-t="k">Caja</button>');
{const b=$('#masmenu button[data-t="k"]');b.onclick=()=>{$$('nav button').forEach(x=>x.classList.toggle('on',x===b));$$('nav button').map(x=>x.dataset.t).forEach(s=>$('#'+s)&&$('#'+s).classList.toggle('hide',s!=='k'));$('#masmenu').classList.add('hide');masRefresh();draw()}}
MODT.k='reporte';if(typeof CF!=='undefined'&&CF.NAVN)CF.NAVN.k='Caja';
{const r0=relevante;relevante=t=>t==='k'?true:r0(t)}
CJ.drawHist=()=>{if($('#k').classList.contains('hide'))return;CJ.fix();const su=$('#kh_u'),cu=su.value,us=[...new Set(db.cajas.map(c=>c.user))];su.innerHTML='<option value="">Todos</option>'+us.map(u=>`<option>${esc(u)}</option>`).join('');su.value=us.includes(cu)?cu:'';
  const d=$('#kh_d').value,h=$('#kh_h').value,e=$('#kh_e').value;
  const L=db.cajas.filter(c=>(!su.value||c.user===su.value)&&(!d||UT.dk(c.abre)>=d)&&(!h||UT.dk(c.abre)<=h)&&(!e||(e==='a'?!c.cierre:e==='c'?!!c.cierre:!!c.cierre&&Math.abs(c.dif)>=0.005))).sort((a,b)=>a.abre<b.abre?1:-1);
  const F=x=>new Date(x).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'}),cerr=L.filter(c=>c.cierre);
  $('#kh_s').innerHTML=`${L.length} ${L.length===1?'caja':'cajas'} · Diferencia acumulada de las cerradas: <b>${fmt(cerr.reduce((a,c)=>a+c.dif,0))}</b>`;
  $('#kh_l').innerHTML=L.map(c=>{const k=c.cierre?c.tot:CJ.calc(c),[cl,t]=c.cierre?CJ.dif(c.dif):['','Abierta'];
    return `<tr><td>${esc(c.user)}</td><td>${esc(c.caja)}</td><td>${F(c.abre)}</td><td>${c.cierre?F(c.cierre)+(c.cerro&&c.cerro!==c.user?'<br><span class="mu">por '+esc(c.cerro)+'</span>':''):'<span class="tag low">Abierta</span>'+(CJ.puedeCerrar(c)?` <button class="btn sec" data-cjc="${c.id}" style="padding:2px 8px">Cerrar</button>`:'')}</td><td class="n">${fmt(c.ini)}</td><td class="n">${fmt(k.esperado)}</td><td class="n">${c.cierre?fmt(c.contado):'-'}</td><td class="n">${c.cierre?`${fmt(c.dif)} <span class="tag ${cl}">${t}</span>`:'-'}</td><td class="n">${fmt(k.vendido)}</td><td style="white-space:normal">${Object.entries(k.porMedio).map(([m,v])=>esc(m)+': '+fmt(v)).join('<br>')||'-'}</td><td style="white-space:normal">${[c.nota,c.notaCierre].filter(Boolean).map(esc).join(' · ')||'-'}${(c.movs||[]).length?`<br><span class="mu">${c.movs.map(m=>(m.t==='egreso'?'Retiro ':'Ingreso ')+fmt(m.monto)+' ('+esc(m.motivo)+')').join(' · ')}</span>`:''}</td></tr>`}).join('')||'<tr><td colspan="11" class="mu">Todavía no hay cajas registradas.</td></tr>'};
['#kh_u','#kh_d','#kh_h','#kh_e'].forEach(s=>$(s).onchange=CJ.drawHist);
MODS.push(()=>{CJ.fix();CJ.drawBar();CJ.drawHist()});
// Configuración > Mi negocio: exigir caja abierta para cobrar.
{const n=$('[data-sub="n"]');if(n){n.insertAdjacentHTML('beforeend',`<details class="card"><summary>Caja</summary><label class="opt"><input type="checkbox" id="cj_req"> Exigir una caja abierta para cobrar ventas</label><p class="mu" style="margin:4px 0 0">Recomendado: cada empleado abre su caja con el dinero inicial y la cierra contando el efectivo al terminar el turno.</p></details>`);
  $('#cj_req').onchange=()=>{if(!can('configuracion','editar')){$('#cj_req').checked=CJ.exige();return toast('Tu usuario no tiene permiso para esto')}db.cfg.cajaObligatoria=$('#cj_req').checked;save();draw();toast($('#cj_req').checked?'Se exige caja abierta para cobrar':'Ya no se exige caja abierta')};
  MODS.push(()=>{const c=$('#cj_req');if(c)c.checked=CJ.exige()})}}
