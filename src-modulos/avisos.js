// ===== Avisos, preferencias de este equipo y detalles de interfaz (v3.0.0, fase 3) =====
// - Campana con avisos calculados de los datos reales: vencidos, por vencer, stock bajo, reposición urgente y diferencias de caja.
//   Cada aviso tiene una clave que incluye su cantidad: si se marca como visto no vuelve a aparecer hasta que cambie.
// - Preferencias personales de este equipo (no tocan la configuración del negocio): qué avisos ver, ayuda de atajos y animaciones.
// - Indicador "Guardando…" mientras hay cambios sin confirmar y transiciones breves entre pantallas.
const AV={K:'sp_prefs_equipo'};
AV.prefs=()=>{let p={};try{p=JSON.parse(localStorage.getItem(AV.K)||'{}')||{}}catch(e){}return Object.assign({avisos:{vencidos:true,porvencer:true,stock:true,reponer:true,caja:true},atajos:true,anim:true,tema:'',visto:{},tutorial:false},p)};
// Tema: 'claro' | 'oscuro' | 'sistema'. Se guarda en este equipo (sp_prefs_equipo); la marca data-theme de <html> la pone un script
// del <head> antes del primer cuadro, y acá se mantiene al día. En el programa de escritorio se avisa a la ventana principal.
AV.TEMAS={sistema:'Según Windows',claro:'Claro',oscuro:'Oscuro'};
AV.temaActual=()=>{const t=AV.prefs().tema;if(t)return t;const u=((typeof AU!=='undefined'&&AU.usuario)||{}).prefs||{};return u.tema==='claro'||u.tema==='oscuro'?u.tema:'sistema'};
AV.aplicarTema=()=>{const t=AV.temaActual(),r=document.documentElement;if(t==='claro')r.setAttribute('data-theme','light');else if(t==='oscuro')r.setAttribute('data-theme','dark');else r.removeAttribute('data-theme')};
// Con usuarios activados, la elección también queda en las preferencias de la cuenta (Usuarios > Mi cuenta), que ya traían un tema.
AV.elegirTema=(t,soloLocal)=>{if(!AV.TEMAS[t])return;AV.set(p=>{p.tema=t});try{if(typeof sp!=='undefined'&&sp.tema)sp.tema(t)}catch(e){}
  if(!soloLocal&&typeof AU!=='undefined'&&AU.habilitado&&AU.usuario&&typeof call==='function'){try{Promise.resolve(call('setPrefs',{tema:t==='sistema'?'auto':t})).then(r=>{if(r&&r.ok)AU.usuario.prefs=r.prefs;const s=$('#f_t');if(s)s.value=t==='sistema'?'auto':t}).catch(()=>{})}catch(e){}}};
AV.set=f=>{const p=AV.prefs();f(p);try{localStorage.setItem(AV.K,JSON.stringify(p))}catch(e){}AV.aplicar();return p};
AV.TIPOS={vencidos:'Productos vencidos',porvencer:'Próximos vencimientos (7 días)',stock:'Stock bajo',reponer:'Reposición urgente',caja:'Cajas: diferencias y cajas sin cerrar'};
AV.lista=()=>{const P=AV.prefs(),o=[],hoy=T(),en7=plus(7);
  let nv=0,pv=[];db.prods.forEach(p=>p.lots.forEach(l=>{if(!l.exp||!l.qty)return;if(l.exp<hoy)nv+=1;else if(l.exp<=en7)pv.push(p.name)}));
  if(nv)o.push({t:'vencidos',k:'v'+nv,cls:'out',txt:`${nv} ${nv===1?'lote vencido':'lotes vencidos'} en el inventario. No se venden: dalos de baja con motivo Vencimiento.`,ir:'e'});
  if(pv.length)o.push({t:'porvencer',k:'p'+pv.length,cls:'low',txt:`${pv.length} ${pv.length===1?'lote vence':'lotes vencen'} en los próximos 7 días: ${[...new Set(pv)].slice(0,3).join(', ')}${pv.length>3?'…':''}.`,ir:'i'});
  const sb=db.prods.filter(p=>p.min&&avail(p)<=p.min);if(sb.length)o.push({t:'stock',k:'s'+sb.length,cls:'low',txt:`${sb.length} ${sb.length===1?'producto':'productos'} con stock bajo: ${sb.slice(0,3).map(p=>p.name).join(', ')}${sb.length>3?'…':''}.`,ir:'i'});
  if(typeof RP!=='undefined'){const n=RP.altas();if(n)o.push({t:'reponer',k:'r'+n,cls:'out',txt:`${n} ${n===1?'producto necesita':'productos necesitan'} reposición con prioridad alta.`,ir:'o'})}
  const cj=(db.cajas||[]).filter(c=>c.cierre&&Math.abs(c.dif)>=0.005&&UT.dk(c.cierre)>=UT.add(UT.hoy(),-7));cj.forEach(c=>o.push({t:'caja',k:'c'+c.id,cls:c.dif<0?'out':'low',txt:`Caja de ${c.user} (${new Date(c.cierre).toLocaleDateString('es-AR')}) cerró con ${c.dif<0?'faltante':'sobrante'} de ${fmt(Math.abs(c.dif))}.`,ir:'k'}));
  (db.cajas||[]).filter(c=>typeof CJ!=='undefined'&&CJ.vieja(c)).forEach(c=>o.push({t:'caja',k:'a'+c.id,cls:'out',txt:`La caja de ${c.user} quedó abierta desde el ${new Date(c.abre).toLocaleDateString('es-AR')}. Cerrala contando el efectivo.`,ir:'k'}));
  const K=db.cfg.caps||{};   // alertas que el negocio desactivó en la entrevista por rubro
  return o.filter(x=>P.avisos[x.t]!==false&&!(x.t==='stock'&&K.alertaStock===false)&&!(x.t==='porvencer'&&K.alertaVto===false)).map(x=>({...x,visto:P.visto[x.t]===x.k}))};
// ---------- campana ----------
$('#ses').insertAdjacentHTML('beforebegin','<span id="avw" style="position:relative"><button class="btn sec" id="avb" title="Avisos" aria-haspopup="true" style="padding:6px 11px">🔔<b id="avn" class="hide"></b></button><span id="guard" class="mu hide" style="font-size:12px;margin-left:6px" aria-live="polite">Guardando…</span><div id="avp" class="hide" role="dialog" aria-label="Avisos"></div></span>');
AV.draw=()=>{const L=AV.lista(),nuevos=L.filter(x=>!x.visto),n=$('#avn');n.textContent=nuevos.length;n.classList.toggle('hide',!nuevos.length);
  if($('#avp').classList.contains('hide'))return;const P=AV.prefs();
  $('#avp').innerHTML=`<h3 style="margin:0 0 8px">Avisos</h3>${L.map(x=>`<div class="tip" style="opacity:${x.visto?.6:1};border-left-color:var(--${x.cls==='out'?'bad':'warn'})">${esc(x.txt)}<div style="margin-top:6px;display:flex;gap:6px"><button class="btn sec" data-avir="${x.ir}" style="padding:3px 9px">Ver</button>${x.visto?'':`<button class="btn sec" data-avok="${x.t}|${x.k}" style="padding:3px 9px">Visto</button>`}</div></div>`).join('')||'<p class="mu">No hay avisos. Todo en orden.</p>'}
  <details style="margin-top:10px"><summary class="mu" style="cursor:pointer">Preferencias de este equipo</summary><div style="padding-top:8px">${Object.entries(AV.TIPOS).map(([k,v])=>`<label class="opt"><input type="checkbox" data-avt="${k}" ${P.avisos[k]!==false?'checked':''}> ${v}</label>`).join('')}<label class="opt"><input type="checkbox" id="av_at" ${P.atajos?'checked':''}> Mostrar la ayuda de atajos en Ventas</label><label class="opt"><input type="checkbox" id="av_an" ${P.anim?'checked':''}> Animaciones suaves</label><label for="av_tm" style="margin-top:6px">Tema</label><select id="av_tm">${Object.entries(AV.TEMAS).map(([k,v])=>`<option value="${k}" ${AV.temaActual()===k?'selected':''}>${v}</option>`).join('')}</select><button class="btn sec" id="av_tu" style="margin-top:4px">Ver el tutorial de atajos</button><p class="mu" style="margin:6px 0 0;font-size:12px">Se guardan solo en esta computadora o celular. La configuración del negocio está en Configuración.</p></div></details>`};
$('#avb').onclick=e=>{e.stopPropagation();$('#avp').classList.toggle('hide');AV.draw()};
document.addEventListener('click',e=>{if(e.target.isConnected&&!e.target.closest('#avw'))$('#avp').classList.add('hide')});   // un botón que se redibujó dentro del panel ya no está en la página: no cuenta como clic afuera
$('#avp').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.avok){const[t,k]=b.dataset.avok.split('|');AV.set(p=>{p.visto[t]=k});AV.draw()}
  else if(b.dataset.avir){$('#avp').classList.add('hide');const t=b.dataset.avir,nb=$(`nav button[data-t="${t}"]`);if(nb)nb.click()}
  else if(b.id==='av_tu'){$('#avp').classList.add('hide');AV.tutorial()}});
$('#avp').addEventListener('change',e=>{const c=e.target;if(c.dataset.avt)AV.set(p=>{p.avisos[c.dataset.avt]=c.checked});else if(c.id==='av_at')AV.set(p=>{p.atajos=c.checked});else if(c.id==='av_an')AV.set(p=>{p.anim=c.checked});else if(c.id==='av_tm')AV.elegirTema(c.value);AV.draw()});
// ---------- tutorial de atajos (se muestra una vez al entrar a Ventas; se puede volver a ver) ----------
AV.tutorial=()=>{if($('#avtu'))return;document.body.insertAdjacentHTML('beforeend',`<div class="ov" id="avtu" role="dialog" aria-modal="true"><div class="card"><h3>Vender rápido con el teclado</h3><div class="wrap"><table><tbody>${[['F2','Buscar o escanear un producto (desde cualquier pantalla)'],['F4','Pagar en efectivo'],['F5','Pagar con tarjeta'],['F6','Pagar con transferencia'],['F7','Cuenta corriente (con un cliente elegido)'],['F8','Cobrar: pide confirmación, Enter acepta'],['Esc','Cancelar o cerrar la ventana']].map(([k,t])=>`<tr><td><b>${k}</b></td><td style="white-space:normal">${t}</td></tr>`).join('')}</tbody></table></div><p class="mu">Con el lector de códigos de barras basta con escanear: el producto se suma solo. Para cobrar tiene que haber una caja abierta.</p><button class="btn" id="avtu_ok">Entendido</button></div></div>`);
  const ok=()=>{const o=$('#avtu');if(o)o.remove();AV.set(p=>{p.tutorial=true})};$('#avtu_ok').onclick=ok;$('#avtu').addEventListener('keydown',e=>{if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();e.stopPropagation();ok()}});$('#avtu_ok').focus()};
AV.primeraVez=()=>{if(KIND==='local'||$('#v').classList.contains('hide')||AV.prefs().tutorial||$('#tour')||$('#cjov'))return;AV.tutorial()};
// ---------- aplicar preferencias, indicador de guardado y transiciones ----------
document.head.insertAdjacentHTML('beforeend',`<style id="avcss">#avn{position:absolute;top:-6px;right:-6px;background:var(--bad);color:var(--act);border-radius:99px;font-size:11px;min-width:18px;padding:1px 5px;line-height:16px}#avn.hide{display:none}
#avp{position:absolute;right:0;top:calc(100% + 6px);width:min(360px,92vw);max-height:70vh;overflow:auto;background:var(--card);border:1px solid var(--bd);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:12px;z-index:45}#avp.hide{display:none}
html.anim main>section:not(.hide){animation:spIn .16s ease-out}html.anim .p:active:not(:disabled){transform:scale(.97)}html.anim .btn{transition:transform .08s,opacity .15s}html.anim .btn:active:not(:disabled){transform:scale(.97)}
@keyframes spIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@keyframes spPop{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:none}}</style>`);
AV.aplicar=()=>{const P=AV.prefs();document.documentElement.classList.toggle('anim',!!P.anim);AV.aplicarTema();if(typeof CF!=='undefined'&&CF.sincPrefs)CF.sincPrefs();const h=$('#athelp');if(h)h.classList.toggle('hide',!P.atajos)};
{let t=null;setInterval(()=>{const g=$('#guard');if(!g)return;if(pending>0){if(!t)t=Date.now();if(Date.now()-t>300)g.classList.remove('hide')}else{t=null;g.classList.add('hide')}},150)}
AV.aplicar();MODS.push(()=>{AV.draw();AV.aplicar();setTimeout(AV.primeraVez,0)});
