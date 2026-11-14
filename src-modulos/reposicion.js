// ===== Reposición sugerida (v3.0.0, fase 2): recomendaciones con datos reales de stock, ventas y pedidos =====
// Para cada producto:
//  - consumo = unidades vendidas (ventas no anuladas) en los últimos 30 días; tendencia = últimos 7 días vs. los 30.
//  - en camino = lo pedido y todavía no recibido en pedidos abiertos (no se vuelve a pedir lo que ya está cubierto).
//  - reposición = días promedio entre el pedido y la primera recepción de ese producto (si no hay historial: db.cfg.reposDias, 7).
//  - objetivo = consumo diario × (reposición + cobertura) y nunca menos que el stock mínimo. Cobertura: db.cfg.reposCobertura (14 días).
//  - sugerido = objetivo − (stock vendible + en camino), redondeado hacia arriba.
//  Sin ventas en 30 días se usa solo el stock mínimo (precisión baja). No se inventan datos: el motivo dice de dónde sale cada número.
const RP={};
RP.dias=()=>Math.max(1,+db.cfg.reposDias||7);RP.cob=()=>Math.max(1,+db.cfg.reposCobertura||14);
RP.ventas=dias=>{const m=new Map(),desde=UT.add(UT.hoy(),-(dias-1));db.sales.forEach(s=>{if(s.void||UT.dk(s.date)<desde)return;s.items.forEach(i=>m.set(i.id,(m.get(i.id)||0)+i.qty))});return m};
RP.enCamino=()=>{const m=new Map();db.orders.filter(o=>!o.closed).forEach(o=>o.items.forEach(i=>{const f=Math.max(0,i.qty-i.rec);if(f)m.set(i.pid,(m.get(i.pid)||0)+f)}));return m};
RP.prov=()=>{const m=new Map();db.orders.slice().sort((a,b)=>a.date<b.date?-1:1).forEach(o=>{if(o.supplier)o.items.forEach(i=>m.set(i.pid,o.supplier))});return m};
RP.lead=()=>{const m=new Map();db.orders.forEach(o=>{const r=(o.receipts||[])[0];if(!r)return;const d=Math.max(0,Math.round((new Date(r.date)-new Date(o.date))/864e5));o.items.forEach(i=>{const a=m.get(i.pid)||[];a.push(d);m.set(i.pid,a)})});return m};
RP.calc=()=>{const v30=RP.ventas(30),v7=RP.ventas(7),cam=RP.enCamino(),prov=RP.prov(),lead=RP.lead(),cob=RP.cob(),hoy=UT.hoy(),out=[];
  db.prods.forEach(p=>{const vend=avail(p),q30=v30.get(p.id)||0,q7=v7.get(p.id)||0,enc=cam.get(p.id)||0,L=lead.get(p.id),ld=L?Math.round(L.reduce((a,x)=>a+x,0)/L.length):RP.dias();
    const diario=q30/30,trend=q30?(q7/7)/(diario||1):null,conHist=q30>0,min=p.min||0;
    const obj=conHist?Math.max(min,Math.ceil(diario*(ld+cob))):min*2,sug=Math.ceil(obj-(vend+enc));
    if(!(sug>0)||(!conHist&&!(min>0&&vend+enc<=min)))return;
    const diasStock=conHist?vend/diario:null,ex=p.lots.filter(l=>l.exp&&l.exp>=T()&&l.qty>0).map(l=>l.exp).sort()[0]||'';
    const pri=vend<=0?'alta':conHist?(diasStock<ld?'alta':diasStock<ld+7||vend<=min?'media':'baja'):(vend<=min?'media':'baja');
    const mot=[];if(vend<=0)mot.push('sin stock vendible');else if(min&&vend<=min)mot.push(`stock ${vend} en o bajo el mínimo (${min})`);
    if(conHist)mot.push(`vendió ${q30} en 30 días (${diario.toFixed(1).replace('.',',')} por día)`+(diasStock!=null?`, alcanza para ~${Math.floor(diasStock)} días`:''));else mot.push('sin ventas en 30 días: se usa solo el stock mínimo');
    if(trend!=null&&q7>0&&trend>=1.3)mot.push('las ventas de la última semana vienen en aumento');if(enc)mot.push(`ya hay ${enc} en camino`);
    mot.push(L?`la reposición tarda ~${ld} días (según pedidos anteriores)`:`reposición estimada en ${ld} días (sin historial de pedidos)`);
    let riesgo='';if(ex&&conHist){const dv=Math.round((new Date(ex+'T12:00:00')-new Date(hoy+'T12:00:00'))/864e5);if(vend/diario>dv)riesgo=`el stock actual tarda ~${Math.ceil(vend/diario)} días en venderse y un lote vence en ${dv}`}
    out.push({id:p.id,name:p.name,stock:vend,q30,diario,enc,ld,sug,pri,prec:conHist?(q30>=5?'media':'baja'):'baja',prov:prov.get(p.id)||'',vence:ex,riesgo,motivo:mot.join(' · ')})});
  const ord={alta:0,media:1,baja:2};return out.sort((a,b)=>ord[a.pri]-ord[b.pri]||b.sug-a.sug)};

$('#o').insertAdjacentHTML('afterbegin',`<div class="card" id="rp"><div class="lh"><h3>Reposición sugerida</h3><span style="display:flex;gap:6px;flex-wrap:wrap;align-items:end"><select id="rp_p" style="width:auto"></select><select id="rp_r" style="width:auto"><option value="">Todas las prioridades</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select><button class="btn sec" id="rp_all">Agregar las de prioridad alta</button></span></div><p class="mu" style="margin:0 0 8px">Calculado con tus ventas de los últimos 30 días, el stock vendible, el mínimo y lo que ya está en camino. Son estimaciones: revisá las cantidades antes de pedir.</p><div class="wrap"><table><thead><tr><th>Producto</th><th>Prioridad</th><th class="n">Stock</th><th class="n">Vendido 30 d.</th><th class="n">En camino</th><th class="n">Sugerido</th><th>Proveedor habitual</th><th>Motivo</th><th></th></tr></thead><tbody id="rp_l"></tbody></table></div></div>`);
RP.lista=()=>{const p=$('#rp_p').value,r=$('#rp_r').value;return RP.calc().filter(x=>(!p||x.prov===p)&&(!r||x.pri===r))};
RP.draw=()=>{if($('#o').classList.contains('hide'))return;const sp=$('#rp_p'),cp=sp.value,ps=[...new Set(db.orders.map(o=>o.supplier).filter(Boolean))];sp.innerHTML='<option value="">Todos los proveedores</option>'+ps.map(x=>`<option>${esc(x)}</option>`).join('');sp.value=ps.includes(cp)?cp:'';
  const L=RP.lista(),en=new Set(draft.map(d=>d.pid)),tg={alta:'out',media:'low',baja:''};
  $('#rp_l').innerHTML=L.slice(0,80).map(x=>`<tr><td><b>${esc(x.name)}</b>${x.vence?`<br><span class="mu">Próx. vto. ${fD(x.vence)}</span>`:''}</td><td><span class="tag ${tg[x.pri]}">${x.pri[0].toUpperCase()+x.pri.slice(1)}</span><br><span class="mu" style="font-size:12px">precisión ${x.prec}</span></td><td class="n">${x.stock}</td><td class="n">${x.q30}</td><td class="n">${x.enc||'-'}</td><td class="n"><b>${x.sug}</b></td><td>${esc(x.prov||'-')}</td><td style="white-space:normal;min-width:220px;font-size:13px">${esc(x.motivo)}${x.riesgo?`<br><span style="color:var(--warn)">⚠ Riesgo de vencimiento: ${esc(x.riesgo)}</span>`:''}</td><td>${en.has(x.id)?'<span class="tag">En el pedido</span>':`<button class="btn sec" data-rpa="${x.id}">Agregar</button>`}</td></tr>`).join('')||'<tr><td colspan="9" class="mu">No hay productos para reponer con los datos actuales.</td></tr>';
  $('#rp_all').disabled=!L.some(x=>x.pri==='alta'&&!en.has(x.id))};
RP.agregar=x=>{if(draft.some(d=>d.pid===x.id))return false;draft.push({pid:x.id,name:x.name,qty:x.sug,rec:0});if(x.prov&&!$('#os').value.trim())$('#os').value=x.prov;return true};
$('#rp').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.rpa){const x=RP.calc().find(z=>z.id==b.dataset.rpa);if(x&&RP.agregar(x))toast(x.name+': '+x.sug+' al pedido');drawOrd();RP.draw()}
  else if(b.id==='rp_all'){const n=RP.lista().filter(x=>x.pri==='alta').filter(RP.agregar).length;toast(n?n+' productos agregados al pedido':'No hay nada para agregar');drawOrd();RP.draw()}};
['#rp_p','#rp_r'].forEach(s=>$(s).onchange=RP.draw);
// Se redibuja junto con Pedidos (así el borrador y las sugerencias quedan siempre coherentes).
{const d0=drawOrd;drawOrd=function(){d0();RP.draw()}}
// Aviso en Inicio/Notificaciones: cantidad de productos con prioridad alta (lo usan otros módulos si existe).
RP.altas=()=>RP.calc().filter(x=>x.pri==='alta').length;
