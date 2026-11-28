// ===== Horarios (v5.8.0): turnos y francos de los empleados =====
// Solo para ver y para que el administrador arme la grilla (los pedidos de cambio llegan por WhatsApp y los carga él).
// Datos en db.horarios (todo opcional; un negocio que no lo usa no cambia):
//   emp:[{id,uid,user,nombre}]  empleados de la grilla (se traen de los usuarios del programa o se cargan a mano)
//   plan:{[empId]:{'AAAA-MM-DD':{t:[['22:00','06:00']],f:1,nota}}}   turnos (si la salida es menor o igual que la entrada, cruza la medianoche) o franco; nota = cambio excepcional
//   hist:[{id,t,quien,txt,canal}]   historial de modificaciones
// Editar pide horarios.editar (lo vuelve a controlar el proceso principal en permisos-datos.js); ver, horarios.ver.
const HR={};
HR.NOM=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
HR.d=()=>{const h=db.horarios=db.horarios||{};h.emp=h.emp||[];h.plan=h.plan||{};h.hist=h.hist||[];h.nid=h.nid||1;return h};
HR.ed=()=>can('horarios','editar');
HR.yo=()=>{const u=AU.habilitado&&AU.usuario;return u?HR.d().emp.find(e=>e.uid===u.id||(e.user&&norm(e.user)===norm(u.user))):null};
// ---------- Fechas y horas ----------
HR.dn=f=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(f);return m?Math.floor(Date.UTC(+m[1],+m[2]-1,+m[3])/864e5):NaN};
HR.fd=n=>new Date(n*864e5).toISOString().slice(0,10);
HR.mas=(f,n)=>HR.fd(HR.dn(f)+n);
HR.lunes=f=>{const n=HR.dn(f);return HR.fd(n-(new Date(n*864e5).getUTCDay()+6)%7)};
HR.corto=f=>+f.slice(8)+'/'+ +f.slice(5,7);
HR.dia=f=>HR.NOM[(HR.dn(f)+3)%7]+' '+HR.corto(f);
HR.min=s=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(s==null?'':s).trim());return m&&+m[1]<24&&+m[2]<60?+m[1]*60+ +m[2]:NaN};
HR.hh=s=>{const m=HR.min(s);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
// Intervalo (minutos desde la medianoche) de un turno; si sale antes o a la misma hora que entra, cruza la medianoche.
HR.iv=t=>{const s=HR.min(t[0]);let e=HR.min(t[1]);if(e<=s)e+=1440;return[s,e]};
HR.cruza=t=>HR.min(t[1])<=HR.min(t[0]);
HR.celTxt=c=>!c?'':c.f?'Franco':(c.t||[]).map(t=>t[0]+'–'+t[1]+(HR.cruza(t)?' (+1)':'')).join(' · ');
HR.nom=e=>(HR.d().emp.find(x=>x.id===e)||{}).nombre||'?';
HR.log=txt=>{const H=HR.d();H.hist.push({id:H.nid++,t:new Date().toISOString(),quien:quien(),txt,canal:'programa'});if(H.hist.length>2000)H.hist.splice(0,H.hist.length-2000)};
// ---------- Grilla: cargar y copiar ----------
// Un día: {t:[['09:00','17:00'],...]} o {f:1}; con o sin nota. Devuelve la celda, null (sin horario) o {err}.
HR.armar=({t,f,nota})=>{nota=String(nota||'').trim().slice(0,120);if(f)return{f:1,...(nota?{nota}:{})};
  const T=(t||[]).filter(x=>x&&(String(x[0]).trim()||String(x[1]).trim()));if(T.length>3)return{err:'Como máximo 3 turnos por día'};
  if(T.some(x=>isNaN(HR.min(x[0]))||isNaN(HR.min(x[1]))||HR.min(x[0])===HR.min(x[1])))return{err:'Horario inválido: usá el formato 09:00 y que entrada y salida sean distintas'};
  const I=T.map(HR.iv).sort((a,b)=>a[0]-b[0]);if(I.some((x,k)=>k&&x[0]<I[k-1][1]))return{err:'Los turnos del día se pisan'};
  return T.length||nota?{...(T.length?{t:T.map(x=>[HR.hh(x[0]),HR.hh(x[1])])}:{}),...(nota?{nota}:{})}:null};
HR.poner=(e,f,datos)=>{if(!HR.ed())return{err:'Tu usuario no puede modificar los horarios'};const H=HR.d();if(!H.emp.some(x=>x.id===e)||isNaN(HR.dn(f)))return{err:'Empleado o fecha inválidos'};
  const c=HR.armar(datos);if(c&&c.err)return c;const antes=(H.plan[e]||{})[f]||null;H.plan[e]=H.plan[e]||{};if(c)H.plan[e][f]=c;else delete H.plan[e][f];
  HR.log(`${HR.nom(e)}, ${HR.dia(f)}: ${HR.celTxt(antes)||'sin horario'} → ${HR.celTxt(c)||'sin horario'}`);save();return{ok:true}};
HR.copiar=(lunes,force)=>{if(!HR.ed())return{err:'Tu usuario no puede modificar los horarios'};const H=HR.d(),sig=HR.mas(lunes,7);let n=0,hay=false;
  H.emp.forEach(({id:e})=>{for(let i=0;i<7;i++){if((H.plan[e]||{})[HR.mas(sig,i)])hay=true;if((H.plan[e]||{})[HR.mas(lunes,i)])n++}});
  if(!n)return{err:'Esta semana no tiene horarios cargados'};if(hay&&!force)return{err:'La semana siguiente ya tiene horarios',existe:true};
  H.emp.forEach(({id:e})=>{H.plan[e]=H.plan[e]||{};for(let i=0;i<7;i++){const o=H.plan[e][HR.mas(lunes,i)],d=HR.mas(sig,i);if(o){const{nota,...r}=o;H.plan[e][d]=JSON.parse(JSON.stringify(r))}else delete H.plan[e][d]}});
  HR.log('Semana del '+HR.corto(lunes)+' copiada a la del '+HR.corto(sig));save();return{ok:true,n,sig}};
// ---------- Empleados ----------
HR.agregar=(nombre,uid,user)=>{if(!HR.ed())return{err:'Tu usuario no puede modificar los horarios'};const H=HR.d();nombre=String(nombre||'').trim().slice(0,60);if(!nombre)return{err:'Escribí el nombre'};
  if(H.emp.some(e=>norm(e.nombre)===norm(nombre)||(uid!=null&&e.uid===uid)))return{err:'Ya está en la grilla'};H.emp.push({id:H.nid++,uid:uid==null?null:uid,user:user||'',nombre});HR.log('Empleado agregado: '+nombre);save();return{ok:true}};
HR.quitar=id=>{if(!HR.ed())return{err:'Tu usuario no puede modificar los horarios'};const H=HR.d(),e=H.emp.find(x=>x.id===id);if(!e)return{err:'No existe'};H.emp=H.emp.filter(x=>x.id!==id);delete H.plan[id];HR.log('Empleado quitado: '+e.nombre);save();return{ok:true}};
HR.traer=async()=>{const r=await call('listar');if(!Array.isArray(r)||!r.length)return{err:'No se pudo leer la lista de usuarios (hace falta ver Usuarios)'};let n=0;r.filter(u=>u.activo).forEach(u=>{if(HR.agregar(u.nombre||u.user,u.id,u.user).ok)n++});return{ok:true,n}};
// ---------- Compartir por WhatsApp (sin API: enlace wa.me y una imagen) ----------
HR.texto=(lunes,e)=>{const H=HR.d(),L=[`*Horarios del ${HR.corto(lunes)} al ${HR.corto(HR.mas(lunes,6))}*`];
  H.emp.filter(x=>!e||x.id===e).forEach(x=>{L.push('','*'+x.nombre+'*');for(let i=0;i<7;i++){const f=HR.mas(lunes,i),c=(H.plan[x.id]||{})[f];L.push(HR.dia(f)+': '+(HR.celTxt(c)||'—')+(c&&c.nota?' ('+c.nota+')':''))}});return L.join('\n')};
HR.wa=(lunes,e)=>can('horarios','ver')?'https://wa.me/?text='+encodeURIComponent(HR.texto(lunes,e)):'';
// Imagen de la grilla (legible en el celular): una fila por empleado, una columna por día.
HR.png=(lunes,e)=>{if(!can('horarios','ver'))return null;const H=HR.d(),E=H.emp.filter(x=>!e||x.id===e),W=190,N=170,Hh=96,cv=document.createElement('canvas');cv.width=N+W*7;cv.height=120+(E.length+1)*Hh;
  const g=cv.getContext('2d');if(!g)return null;g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);g.fillStyle='#111';g.font='bold 34px sans-serif';g.textBaseline='middle';
  g.fillText('Horarios '+HR.corto(lunes)+' al '+HR.corto(HR.mas(lunes,6)),20,40);g.font='bold 24px sans-serif';
  for(let i=0;i<7;i++){g.fillStyle='#e8edf7';g.fillRect(N+i*W,80,W-4,Hh-6);g.fillStyle='#111';g.fillText(HR.dia(HR.mas(lunes,i)),N+i*W+12,80+Hh/2-3)}
  E.forEach((x,r)=>{const y=80+(r+1)*Hh;g.fillStyle='#111';g.font='bold 26px sans-serif';g.fillText(x.nombre.slice(0,12),10,y+Hh/2-3);
    for(let i=0;i<7;i++){const c=(H.plan[x.id]||{})[HR.mas(lunes,i)];g.fillStyle=c&&c.f?'#fde8c8':c&&c.t?'#e3f5e8':'#f3f4f6';g.fillRect(N+i*W,y,W-4,Hh-6);g.fillStyle='#111';g.font='22px sans-serif';
      const l=c&&c.f?['Franco']:c&&c.t?c.t.map(t=>t[0]+'-'+t[1]+(HR.cruza(t)?'+1':'')):['—'];l.slice(0,3).forEach((s,k)=>g.fillText(s,N+i*W+10,y+16+k*26+(3-Math.min(3,l.length))*10))}});
  return cv};
HR.blob=cv=>new Promise(r=>cv.toBlob(r,'image/png'));
HR.descargar=async(lunes,e)=>{const cv=HR.png(lunes,e);if(!cv)return{err:'No se pudo dibujar la imagen'};const b=await HR.blob(cv);if(!b)return{err:'No se pudo crear la imagen'};
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='horarios-'+lunes+'.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);return{ok:true}};
HR.copiarImg=async(lunes,e)=>{const cv=HR.png(lunes,e);if(!cv)return{err:'No se pudo dibujar la imagen'};try{await navigator.clipboard.write([new ClipboardItem({'image/png':await HR.blob(cv)})]);return{ok:true}}catch(x){return{err:'No se pudo copiar: descargala'}}};

// ---------- Pantalla ----------
HR.sem=HR.lunes(ld(new Date()));HR.ver='';HR.sel=null;
$('main').insertAdjacentHTML('beforeend',`<section id="hz" class="hide"><div class="card"><div class="lh"><h3>Horarios</h3><div class="pills" style="margin:0"><button id="hz_pa">‹ Anterior</button><button id="hz_ho">Esta semana</button><button id="hz_pn">Siguiente ›</button></div></div>
<div class="form"><div><label>Ver</label><select id="hz_v"></select></div><div><button class="btn sec" id="hz_cp">Copiar a la semana siguiente</button></div><div><button class="btn sec" id="hz_wa">Enviar por WhatsApp</button></div><div><button class="btn sec" id="hz_im">Descargar imagen</button></div><div><button class="btn sec" id="hz_ic">Copiar imagen</button></div></div>
<p class="mu" id="hz_t" style="margin:0 0 8px"></p><div class="wrap"><table id="hz_g"></table></div>
<div id="hz_ed" class="card hide" style="margin-top:10px"><b id="hz_et"></b><div class="form" style="margin-top:8px"><div><label>Turno 1 entra</label><input id="hz_a1" placeholder="09:00"></div><div><label>Turno 1 sale</label><input id="hz_b1" placeholder="17:00"></div><div><label>Turno 2 entra</label><input id="hz_a2" placeholder="opcional"></div><div><label>Turno 2 sale</label><input id="hz_b2" placeholder="opcional"></div><div><label><input type="checkbox" id="hz_fr"> Franco</label></div><div><label>Nota (cambio excepcional)</label><input id="hz_nt" maxlength="120"></div></div><button class="btn" id="hz_gu">Guardar</button> <button class="btn sec" id="hz_bo">Dejar sin horario</button> <button class="btn sec" id="hz_ce">Cerrar</button></div></div>
<div class="card" id="hz_cf"><h3>Empleados</h3><div class="chips" id="hz_em"></div><div class="form" style="margin-top:10px"><div><label>Agregar empleado</label><input id="hz_nn" placeholder="Nombre"></div><div><button class="btn sec" id="hz_na">Agregar</button></div><div><button class="btn sec" id="hz_us">Traer usuarios del programa</button></div></div></div>
<div class="card"><h3>Historial de modificaciones</h3><div class="wrap"><table><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Canal</th></tr></thead><tbody id="hz_h"></tbody></table></div></div></section>`);
$('#masmenu').insertAdjacentHTML('beforeend','<button data-t="hz">Horarios</button>');
{const b=$('#masmenu button[data-t="hz"]');b.onclick=()=>{$$('nav button').forEach(x=>x.classList.toggle('on',x===b));$$('nav button').map(x=>x.dataset.t).forEach(s=>$('#'+s)&&$('#'+s).classList.toggle('hide',s!=='hz'));$('#masmenu').classList.add('hide');masRefresh();draw()}}
MODT.hz='horarios';if(typeof CF!=='undefined'&&CF.NAVN)CF.NAVN.hz='Horarios';
{const r0=relevante;relevante=t=>t==='hz'?true:r0(t)}
HR.draw=()=>{if(!$('#hz')||$('#hz').classList.contains('hide'))return;const H=HR.d(),ed=HR.ed(),yo=HR.yo(),hoy=ld(new Date());
  $('#hz_cf').classList.toggle('hide',!ed);$('#hz_cp').classList.toggle('hide',!ed);
  const v=$('#hz_v'),pv=HR.ver;v.innerHTML='<option value="">Todos</option>'+H.emp.map(x=>`<option value="${x.id}">${esc(x.nombre)}</option>`).join('');v.value=H.emp.some(x=>String(x.id)===String(pv))?pv:'';HR.ver=v.value;
  const E=H.emp.filter(x=>!HR.ver||x.id===+HR.ver);
  $('#hz_t').textContent='Semana del '+HR.corto(HR.sem)+' al '+HR.corto(HR.mas(HR.sem,6))+(ed?' · tocá un día para cargarlo o cambiarlo':'');
  $('#hz_g').innerHTML='<thead><tr><th>Empleado</th>'+[0,1,2,3,4,5,6].map(i=>`<th${HR.mas(HR.sem,i)===hoy?' style="color:var(--ac)"':''}>${HR.dia(HR.mas(HR.sem,i))}</th>`).join('')+'</tr></thead><tbody>'+
    (E.map(x=>`<tr${yo&&yo.id===x.id?' class="hz-yo" style="background:color-mix(in srgb,var(--ac) 12%,transparent)"':''}><td><b>${esc(x.nombre)}</b>${yo&&yo.id===x.id?' (vos)':''}</td>`+[0,1,2,3,4,5,6].map(i=>{const f=HR.mas(HR.sem,i),c=(H.plan[x.id]||{})[f];
      return`<td data-e="${x.id}" data-f="${f}"${ed?' style="cursor:pointer"':''}>${c&&c.f?'<span class="tag low">Franco</span>':esc(HR.celTxt(c))||'<span class="mu">—</span>'}${c&&c.nota?` <span title="${esc(c.nota)}">✎</span>`:''}</td>`}).join('')+'</tr>').join('')||'<tr><td class="mu">Todavía no hay empleados en la grilla.</td></tr>')+'</tbody>';
  $('#hz_em').innerHTML=H.emp.map(x=>`<span class="chip">${esc(x.nombre)}<button data-quitar="${x.id}" aria-label="Quitar a ${esc(x.nombre)}">×</button></span>`).join('')||'<span class="mu">Sin empleados</span>';
  $('#hz_h').innerHTML=H.hist.slice(-60).reverse().map(h=>`<tr><td>${new Date(h.t).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</td><td>${esc(h.quien)}</td><td style="white-space:normal">${esc(h.txt)}</td><td>${esc(h.canal)}</td></tr>`).join('')||'<tr><td colspan="4" class="mu">Todavía no hubo cambios.</td></tr>'};
MODS.push(HR.draw);
HR.msg=r=>{if(r&&r.err)toast(r.err);return r&&!r.err};
HR.editor=(e,f)=>{const c=(HR.d().plan[e]||{})[f]||{},t=c.t||[];HR.sel={e,f};$('#hz_ed').classList.remove('hide');$('#hz_et').textContent=HR.nom(e)+' · '+HR.dia(f);
  [['a1',0,0],['b1',0,1],['a2',1,0],['b2',1,1]].forEach(([k,i,j])=>$('#hz_'+k).value=(t[i]||[])[j]||'');$('#hz_fr').checked=!!c.f;$('#hz_nt').value=c.nota||''};
HR.leerEditor=()=>({t:[[$('#hz_a1').value,$('#hz_b1').value],[$('#hz_a2').value,$('#hz_b2').value]],f:$('#hz_fr').checked,nota:$('#hz_nt').value});
HR.ir=n=>{HR.sem=HR.mas(HR.sem,n);draw()};
HR.filtro=()=>HR.ver?+HR.ver:0;
$('#hz_pa').onclick=()=>HR.ir(-7);$('#hz_pn').onclick=()=>HR.ir(7);$('#hz_ho').onclick=()=>{HR.sem=HR.lunes(ld(new Date()));draw()};
$('#hz_v').onchange=e=>{HR.ver=e.target.value;draw()};
$('#hz_g').onclick=e=>{const td=e.target.closest('td[data-e]');if(td&&HR.ed())HR.editor(+td.dataset.e,td.dataset.f)};
$('#hz_gu').onclick=()=>{if(!HR.sel)return;if(HR.msg(HR.poner(HR.sel.e,HR.sel.f,HR.leerEditor()))){$('#hz_ed').classList.add('hide');draw()}};
$('#hz_bo').onclick=()=>{if(!HR.sel)return;if(HR.msg(HR.poner(HR.sel.e,HR.sel.f,{t:[]}))){$('#hz_ed').classList.add('hide');draw()}};
$('#hz_ce').onclick=()=>$('#hz_ed').classList.add('hide');
$('#hz_cp').onclick=()=>{const r=HR.copiar(HR.sem,arm==='hzcp');if(r.existe){armed('hzcp');return toast('La semana siguiente ya tiene horarios: tocá otra vez para reemplazarlos')}if(HR.msg(r)){HR.sem=r.sig;toast('Semana copiada');draw()}};
$('#hz_wa').onclick=()=>{const u=HR.wa(HR.sem,HR.filtro());if(u)window.open(u,'_blank')};
$('#hz_im').onclick=async()=>{if(HR.msg(await HR.descargar(HR.sem,HR.filtro())))toast('Imagen descargada')};
$('#hz_ic').onclick=async()=>{if(HR.msg(await HR.copiarImg(HR.sem,HR.filtro())))toast('Imagen copiada: pegala en WhatsApp')};
$('#hz_na').onclick=()=>{if(HR.msg(HR.agregar($('#hz_nn').value))){$('#hz_nn').value='';draw()}};
$('#hz_us').onclick=async()=>{const r=await HR.traer();if(HR.msg(r)){toast(r.n+' empleado(s) agregado(s)');draw()}};
$('#hz_em').onclick=e=>{const b=e.target.closest('[data-quitar]');if(b&&armed('hzq'+b.dataset.quitar)&&HR.msg(HR.quitar(+b.dataset.quitar)))draw()};
