// ===== Mercadería: recibir en un solo paso y lista para pedir (reemplaza el flujo de pedidos en dos pasos) =====
// Recibir: cuando llega el proveedor se escanea o busca cada producto, cantidad, costo y vencimiento, y se elige cómo se
// paga (retiro de caja, deuda con el proveedor u otro medio). Suma el stock, actualiza el costo y queda registrado.
// Lista para pedir: la reposición sugerida (reposicion.js) lista para mandar al proveedor por WhatsApp, copiar o imprimir.
// Los pedidos con seguimiento de antes siguen disponibles en Funciones avanzadas.
const ME={tab:'r',items:[],pago:'caja'};
ME.fix=()=>{db.recepciones=db.recepciones||[];db.recid2=db.recid2||1};
// ---------- pantalla ----------
$('#o').insertAdjacentHTML('afterbegin',`<div class="pills" id="me_t" role="tablist" style="margin-bottom:14px"><button data-me="r" class="on">Recibir</button><button data-me="l">Lista para pedir <span id="me_n" class="tag out hide" style="margin-left:4px;padding:1px 7px"></span></button><button data-me="a" class="me-av">Pedidos con seguimiento</button></div>
<div id="me_r"><div class="grid" style="grid-template-columns:minmax(0,1fr) 330px">
<div class="card" style="margin:0"><div class="form" style="grid-template-columns:220px 1fr"><div><label for="me_pv">Proveedor</label><input id="me_pv" list="me_pvs" autocomplete="off" placeholder="Ej.: Distribuidora Sur"><datalist id="me_pvs"></datalist></div><div style="position:relative"><label for="me_q">Producto</label><input id="me_q" autocomplete="off" placeholder="Escaneá o buscá el producto que llegó"><div id="me_sg" class="sug hide"></div></div></div>
<div class="wrap"><table><thead><tr><th>Producto</th><th class="n">Llegó</th><th class="n">Costo c/u</th><th>Vence</th><th class="n">Subtotal</th><th></th></tr></thead><tbody id="me_l"></tbody></table></div>
<p class="mu" style="margin:10px 0 0;font-size:13px">Si el costo cambió, se actualiza en el producto. Si el producto exige vencimiento, pedimos la fecha.</p></div>
<div class="card" style="margin:0;display:flex;flex-direction:column;gap:10px"><div class="mu">Total de lo que llegó</div><div class="tot" id="me_tot" style="margin:0">$ 0</div><div class="mu" id="me_res" style="font-size:13px"></div>
<fieldset style="border:0;padding:0;margin:4px 0 0;display:flex;flex-direction:column;gap:8px"><legend style="font-weight:600;margin-bottom:6px">¿Cómo se paga?</legend>
<label class="opt"><input type="radio" name="me_pg" value="caja" checked> <span><b>Pago ahora con la caja</b><br><span class="mu" style="font-size:12.5px">Sale del efectivo como retiro</span></span></label>
<label class="opt"><input type="radio" name="me_pg" value="deuda"> <span><b>Le quedo debiendo</b><br><span class="mu" style="font-size:12.5px">Se anota la deuda con el proveedor</span></span></label>
<label class="opt"><input type="radio" name="me_pg" value="otro"> <span><b>Pagado por otro medio</b><br><span class="mu" style="font-size:12.5px">Transferencia o tarjeta: no toca la caja</span></span></label></fieldset>
<button class="btn" id="me_ok" style="margin-top:auto;background:var(--ok);font-size:17px;padding:14px">Sumar al stock</button></div></div>
<div class="card" style="margin-top:14px"><h3>Últimas recepciones</h3><div class="wrap"><table><tbody id="me_h"></tbody></table></div></div></div>
<div id="me_lp" class="hide"><div class="grid" style="grid-template-columns:minmax(0,1fr) 360px">
<div class="card" style="margin:0"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><label for="me_lpv" style="margin:0">Proveedor</label><select id="me_lpv" style="width:auto"></select><span class="mu" style="font-size:13px">Destildá lo que no quieras pedir; podés cambiar las cantidades.</span></div><div id="me_ll"></div></div>
<div class="card" style="margin:0;display:flex;flex-direction:column;gap:10px"><b>Así le llega al proveedor</b><div id="me_msg" style="background:color-mix(in srgb,var(--ok) 12%,var(--card));border-radius:14px 14px 14px 4px;padding:14px 16px;white-space:pre-line;line-height:1.5"></div>
<div style="margin-top:auto;display:flex;flex-direction:column;gap:8px"><button class="btn" id="me_wa" style="background:var(--ok)">Enviar por WhatsApp</button><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn sec" id="me_cp">Copiar</button><button class="btn sec" id="me_pr">Imprimir</button></div><p class="mu" style="margin:0;font-size:12.5px">Cuando llegue la mercadería, cargala en «Recibir»: la lista se arma sola de nuevo.</p></div></div></div></div>`);
// Lo de antes (pedido con seguimiento y su reposición) queda dentro de "Pedidos con seguimiento".
{const o=$('#o'),box=document.createElement('div');box.id='me_av';box.className='hide';[...o.children].filter(x=>!['me_t','me_r','me_lp'].includes(x.id)).forEach(x=>box.appendChild(x));o.appendChild(box)}
document.head.insertAdjacentHTML('beforeend','<style>body.simple .me-av{display:none!important}#me_t .on .tag{background:#fff;color:var(--bad)}</style>');
CF.NAVN.o='Mercadería';{const b=$('nav button[data-t="o"]');if(b)b.textContent='Mercadería'}
ME.verTab=t=>{ME.tab=t;$$('#me_t [data-me]').forEach(b=>b.classList.toggle('on',b.dataset.me===t));$('#me_r').classList.toggle('hide',t!=='r');$('#me_lp').classList.toggle('hide',t!=='l');$('#me_av').classList.toggle('hide',t!=='a');draw()};
$('#me_t').onclick=e=>{const b=e.target.closest('[data-me]');if(b)ME.verTab(b.dataset.me)};
// ---------- Recibir ----------
ME.prov=()=>[...new Set([...db.orders.map(o=>o.supplier),...(db.recepciones||[]).map(r=>r.prov),...db.fin.pagar.map(g=>g.prov)].filter(Boolean))].sort();
ME.sumar=p=>{if(!p)return;{const a=document.activeElement;if(a&&a.closest&&a.closest('#me_l'))a.blur()}if(esPadre(p))return toast('Elegí la variante (talle, color…) desde Inventario');let it=ME.items.find(x=>x.id===p.id);
  if(it)it.q+=esPeso(p)?1000:1;else ME.items.push(it={id:p.id,q:esPeso(p)?1000:1,c:p.cost||0,exp:'',ser:''});ME.draw();const f=$(`#me_l [data-q="${p.id}"]`);if(f){f.focus();f.select()}};
ME.sugg=()=>{const q=norm($('#me_q').value.trim()),g=$('#me_sg'),m=q?db.prods.filter(p=>!esPadre(p)&&(norm(p.name).includes(q)||norm(p.code||'').includes(q))).slice(0,8):[];
  g.innerHTML=m.map(p=>`<div data-s='${p.id}'><b>${esc(p.name)}</b> <span class='mu'>· Stock ${fq(p,tot(p))}</span></div>`).join('');g.classList.toggle('hide',!m.length)};
$('#me_q').oninput=ME.sugg;$('#me_q').onblur=()=>setTimeout(()=>$('#me_sg').classList.add('hide'),150);
$('#me_q').onkeydown=e=>{if(e.key!=='Enter')return;e.preventDefault();const v=$('#me_q').value.trim().toLowerCase(),p=db.prods.find(x=>String(x.code||'').toLowerCase()===v)||(()=>{const f=$('#me_sg').firstChild;return f&&!$('#me_sg').classList.contains('hide')?db.prods.find(x=>x.id==f.dataset.s):null})();
  if(!p)return toast('No encontré ese producto. Cargalo primero en Productos.');$('#me_q').value='';$('#me_sg').classList.add('hide');ME.sumar(p)};
$('#me_sg').onmousedown=e=>{const r=e.target.closest('[data-s]');if(r){e.preventDefault();$('#me_q').value='';$('#me_sg').classList.add('hide');ME.sumar(db.prods.find(p=>p.id==r.dataset.s))}};
// El lector de códigos en esta pantalla suma a la recepción.
{const s0=onScan;onScan=function(code){const ae=document.activeElement;if(!$('#o').classList.contains('hide')&&ME.tab==='r'&&!(ae&&ae.closest&&ae.closest('#me_av'))){const ahora=Date.now();if(code===scanPrev.c&&ahora-scanPrev.t<400)return;scanPrev={c:code,t:ahora};const p=db.prods.find(x=>String(x.code||'').trim().toLowerCase()===String(code).toLowerCase());if(!p){beep(0);return toast('Código '+code+' no encontrado entre los productos')}beep(1);return ME.sumar(p)}return s0(code)}}
ME.sub=it=>{const p=db.prods.find(x=>x.id===it.id);return p?Math.round((esPeso(p)?it.c*it.q/1000:it.c*it.q)*100)/100:0};
ME.total=()=>Math.round(ME.items.reduce((a,it)=>a+ME.sub(it),0)*100)/100;
ME.draw=()=>{if($('#o').classList.contains('hide'))return;ME.fix();const n=typeof RP!=='undefined'?RP.altas():0,b=$('#me_n');b.textContent=n;b.classList.toggle('hide',!n);
  if(ME.tab==='r'){const act=document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#me_l');
    if(!act)$('#me_l').innerHTML=ME.items.map(it=>{const p=db.prods.find(x=>x.id===it.id);if(!p)return'';const vto=p.reqVto||PX.on('vencimientos');
      return `<tr><td><b>${esc(p.name)}</b><br><span class="mu" style="font-size:12px">Stock: ${fq(p,tot(p))} → ${fq(p,tot(p)+it.q)}</span></td><td class="n"><input aria-label="Cantidad de ${esc(p.name)}" data-q="${p.id}" value="${esPeso(p)?String(it.q/1000).replace('.',','):it.q}" style="width:80px;text-align:right">${esPeso(p)?' kg':''}</td><td class="n"><input aria-label="Costo de ${esc(p.name)}" data-c="${p.id}" value="${it.c}" style="width:100px;text-align:right">${Math.abs(it.c-(p.cost||0))>0.004&&p.cost?`<br><span style="font-size:11.5px;color:var(--warn)">antes ${fmt(p.cost)}</span>`:''}</td><td>${esSerie(p)?`<input aria-label="Números de serie" data-s2="${p.id}" value="${esc(it.ser)}" placeholder="N.º de serie, separados por coma" style="width:190px">`:vto?`<input type="date" aria-label="Vencimiento" data-x="${p.id}" value="${it.exp}" style="width:150px">`:'<span class="mu">—</span>'}</td><td class="n"><b>${fmt(ME.sub(it))}</b></td><td><button class="btn del" data-rm="${p.id}" aria-label="Quitar ${esc(p.name)}">×</button></td></tr>`}).join('')||'<tr><td colspan="6" class="mu">Escaneá o buscá el primer producto que llegó.</td></tr>';
    $('#me_tot').textContent=fmt(ME.total());$('#me_res').textContent=ME.items.length?ME.items.length+(ME.items.length===1?' producto':' productos'):'';
    $('#me_pvs').innerHTML=ME.prov().map(p=>`<option value="${esc(p)}">`).join('');$('#me_ok').disabled=!ME.items.length;
    $('#me_h').innerHTML=(db.recepciones||[]).slice(-8).reverse().map(r=>`<tr><td>${new Date(r.date).toLocaleDateString('es-AR')}</td><td>${esc(r.prov||'Sin proveedor')}</td><td style="white-space:normal">${esc(r.items.map(i=>fq(db.prods.find(p=>p.id===i.id)||{},i.q)+' x '+i.name).join(', '))}</td><td class="n">${fmt(r.total)}</td><td>${{caja:'Pagado con la caja',deuda:'Debe al proveedor',otro:'Otro medio'}[r.pago]||''}</td></tr>`).join('')||'<tr><td class="mu">Todavía no recibiste mercadería con esta pantalla.</td></tr>'}
  if(ME.tab==='l')ME.drawLista()};
$('#me_l').addEventListener('input',e=>{const t=e.target,id=+(t.dataset.q||t.dataset.c||t.dataset.x||t.dataset.s2),it=ME.items.find(x=>x.id===id),p=db.prods.find(x=>x.id===id);if(!it||!p)return;
  if(t.dataset.q){const q=PX.cantidad(p,t.value);it.q=q>0?q:0}if(t.dataset.c){const c=parseFloat(String(t.value).replace(',','.'));it.c=c>=0?c:0}if(t.dataset.x)it.exp=t.value;if(t.dataset.s2)it.ser=t.value;
  $('#me_tot').textContent=fmt(ME.total());const tr=t.closest('tr');if(tr)tr.querySelector('td:nth-child(5) b').textContent=fmt(ME.sub(it))});
$('#me_l').addEventListener('change',()=>{const a=document.activeElement;if(a)a.blur();ME.draw()});
$('#me_l').onclick=e=>{const b=e.target.closest('[data-rm]');if(b){ME.items=ME.items.filter(x=>x.id!=b.dataset.rm);ME.draw()}};
// Confirma la recepción: valida todo antes de tocar nada.
ME.recibir=()=>{ME.fix();if(!ME.items.length)return{err:'Agregá al menos un producto'};const prov=$('#me_pv').value.trim().slice(0,60),pago=(document.querySelector('[name="me_pg"]:checked')||{}).value||'caja',total=ME.total();
  const series={};for(const it of ME.items){const p=db.prods.find(x=>x.id===it.id);if(!p)return{err:'Un producto ya no existe'};if(!(it.q>0))return{err:'Revisá la cantidad de '+p.name};if(!(it.c>=0))return{err:'Revisá el costo de '+p.name};
    if(p.reqVto&&!it.exp)return{err:p.name+' exige la fecha de vencimiento'};if(esSerie(p)){const s=PX.series(it.ser,it.q,p.id);if(s.err)return{err:p.name+': '+s.err};series[p.id]=s}}
  if(pago==='caja'&&total>0){if(typeof CJ==='undefined'||!CJ.abierta())return{err:'No hay una caja abierta: abrila o elegí otra forma de pago'};const k=CJ.calc(CJ.abierta());if(total>k.esperado+0.005)return{err:'No hay tanto efectivo en la caja ('+fmt(k.esperado)+'). Elegí otra forma de pago.'}}
  if(pago==='deuda'&&!prov)return{err:'Escribí el proveedor para anotar la deuda'};
  const r={id:db.recid2++,date:new Date().toISOString(),user:quien(),prov,pago,total,items:[]};
  ME.items.forEach(it=>{const p=db.prods.find(x=>x.id===it.id),n=prov?'R'+r.id:'Ingreso '+r.id;if(Math.abs((p.cost||0)-it.c)>0.004){ajuste({tipo:'producto.precio',pid:p.id,txt:p.name+': costo '+fmt(p.cost||0)+' → '+fmt(it.c)+' (recepción)'});p.cost=Math.round(it.c*100)/100}
    if(series[p.id])series[p.id].forEach(s=>p.lots.push({id:db.lid++,n:s,qty:1,exp:it.exp}));else addLot(p,n,it.q,it.exp);r.items.push({id:p.id,name:p.name,q:it.q,c:it.c,exp:it.exp})});
  if(pago==='caja'&&total>0){const m=CJ.mov('egreso',total,'Pago a '+(prov||'proveedor')+' (mercadería)');if(m.err)return m;const c=CJ.abierta(),mv=c.movs[c.movs.length-1];mv.cat='Proveedor';mv.rec=r.id}
  if(pago==='deuda')db.fin.pagar.push({id:db.fin.id++,prov,desc:'Mercadería recibida el '+new Date().toLocaleDateString('es-AR'),monto:total,vence:'',pagado:false,rec:r.id});
  db.recepciones.push(r);save();ME.items=[];return{ok:true,r}};
$('#me_ok').onclick=()=>{if(!can('pedidos','crear'))return toast('Tu usuario no tiene permiso para esto');const r=ME.recibir();if(r.err)return toast(r.err);draw();toast('Mercadería sumada al stock: '+fmt(r.r.total));$('#me_q').focus()};
// ---------- Lista para pedir ----------
ME.lista={};   // id → {q, off}
ME.items2=()=>{const pv=$('#me_lpv').value;return (typeof RP!=='undefined'?RP.calc():[]).filter(x=>!pv||x.prov===pv)};
ME.drawLista=()=>{const s=$('#me_lpv'),cv=s.value,ps=[...new Set((typeof RP!=='undefined'?RP.calc():[]).map(x=>x.prov).filter(Boolean))];s.innerHTML='<option value="">Todos</option>'+ps.map(p=>`<option>${esc(p)}</option>`).join('');s.value=ps.includes(cv)?cv:'';
  const L=ME.items2(),tg={alta:['out','Urgente'],media:['low','Esta semana'],baja:['','Puede esperar']};
  if(!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#me_ll')))$('#me_ll').innerHTML=L.map(x=>{const e=ME.lista[x.id]||{};const p=db.prods.find(y=>y.id===x.id);return `<label class="opt" style="display:grid;grid-template-columns:24px 1fr 100px 120px;gap:12px;align-items:center"><input type="checkbox" data-on="${x.id}" ${e.off?'':'checked'}><span><b>${esc(x.name)}</b><br><span class="mu" style="font-size:12.5px">${esc(x.stock>0?'Quedan '+fq(p,x.stock)+(x.diario>0?' · alcanza para '+Math.floor(x.stock/x.diario)+' días':''):'Sin stock')}</span></span><input aria-label="Cantidad a pedir de ${esc(x.name)}" data-lq="${x.id}" value="${e.q!=null?e.q:fq(p,x.sug).replace(' kg','')}" style="text-align:right"><span class="tag ${tg[x.pri][0]}" style="text-align:center">${tg[x.pri][1]}</span></label>`}).join('')||'<p class="mu">No hay nada para pedir con los datos de ventas y stock actuales.</p>';
  $('#me_msg').textContent=ME.mensaje();['#me_wa','#me_cp','#me_pr'].forEach(i=>$(i).disabled=!ME.elegidos().length)};
ME.elegidos=()=>ME.items2().filter(x=>!(ME.lista[x.id]||{}).off).map(x=>{const p=db.prods.find(y=>y.id===x.id),e=ME.lista[x.id]||{};return{name:x.name,q:e.q!=null?e.q:fq(p,x.sug)}}).filter(x=>String(x.q).trim()&&String(x.q).trim()!=='0');
ME.mensaje=()=>{const L=ME.elegidos();return L.length?`Hola! Pedido de ${(db.shop&&db.shop.n)||'mi negocio'}:\n${L.map(x=>'• '+x.name+' × '+x.q).join('\n')}\nGracias!`:'Elegí lo que querés pedir.'};
$('#me_ll').addEventListener('input',e=>{const t=e.target;if(t.dataset.lq){ME.lista[t.dataset.lq]={...(ME.lista[t.dataset.lq]||{}),q:t.value.trim()};$('#me_msg').textContent=ME.mensaje()}});
$('#me_ll').addEventListener('change',e=>{const t=e.target;if(t.dataset.on){ME.lista[t.dataset.on]={...(ME.lista[t.dataset.on]||{}),off:!t.checked};$('#me_msg').textContent=ME.mensaje();['#me_wa','#me_cp','#me_pr'].forEach(i=>$(i).disabled=!ME.elegidos().length)}});
$('#me_lpv').onchange=ME.drawLista;
$('#me_wa').onclick=()=>{window.open('https://wa.me/?text='+encodeURIComponent(ME.mensaje()),'_blank')};
$('#me_cp').onclick=()=>{const t=ME.mensaje();if(navigator.clipboard)navigator.clipboard.writeText(t).then(()=>toast('Pedido copiado'),()=>toast('No se pudo copiar'));else toast(t)};
$('#me_pr').onclick=()=>doPrint('<div style="font:14px/1.5 system-ui,sans-serif;white-space:pre-line">'+esc(ME.mensaje())+'</div>');
// Reemplaza el dibujo de Pedidos: la pantalla nueva y, en "Pedidos con seguimiento", lo de antes.
{const d0=drawOrd;drawOrd=function(){d0();const b=$('nav button[data-t="o"]');if(b)b.textContent='Mercadería';ME.draw()}}
