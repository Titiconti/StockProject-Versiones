// ===== Balanza (v5.7.0): etiquetas EAN-13 de balanza (prefijo 2) con precio o peso adentro =====
// Plantilla en db.cfg.balanza = { iPlu, nPlu, iVal, nVal, tipo:'importe'|'peso', dec }. Las posiciones cuentan desde 0 sobre los 13 dígitos
// (el último, el 12, es el dígito de control; no se puede usar). `dec` = cuántos decimales trae el valor
// (importe 450000 con dec 2 = $4.500,00 · peso 01125 con dec 3 = 1,125 kg). Cada producto por peso guarda su `plu` (el N.º que usa la balanza).
// shortcut: una sola plantilla por local y se ignora un dígito de control interno del importe; si hay balanzas con formatos distintos, pasar a una lista de plantillas.
const BZ={};
BZ.digito=c12=>{let s=0;for(let i=0;i<12;i++)s+=(+c12[i])*(i%2?3:1);return(10-s%10)%10};
BZ.valido=c=>/^\d{13}$/.test(c)&&BZ.digito(c)===+c[12];
BZ.esEtiqueta=c=>/^2\d{12}$/.test(String(c));
BZ.tplErr=t=>{if(!t||typeof t!=='object')return'Falta configurar la balanza';
  if(['iPlu','nPlu','iVal','nVal','dec'].some(k=>!Number.isInteger(t[k])||t[k]<0))return'La plantilla tiene números inválidos';if(!['importe','peso'].includes(t.tipo))return'El valor de la etiqueta es importe o peso';
  if(t.iPlu<1||t.iVal<1||t.nPlu<1||t.nVal<1||t.iPlu+t.nPlu>12||t.iVal+t.nVal>12)return'La plantilla se sale de la etiqueta (el primer dígito es el prefijo y el último el de control)';
  if(t.iPlu<t.iVal+t.nVal&&t.iVal<t.iPlu+t.nPlu)return'El producto y el importe/peso no pueden pisarse';if(t.dec>3)return'Hasta 3 decimales';return''};
// → {plu (sin ceros a la izquierda), valor, tipo} o {err}. Valida el dígito de control.
BZ.decodificar=(code,t)=>{code=String(code||'').trim();if(!BZ.esEtiqueta(code))return{err:'No es una etiqueta de balanza (13 dígitos que empiezan con 2)'};const e=BZ.tplErr(t);if(e)return{err:e};
  if(!BZ.valido(code))return{err:'El dígito de control de la etiqueta no coincide: leela de nuevo'};
  return{plu:String(+code.substr(t.iPlu,t.nPlu)),valor:Math.round(+code.substr(t.iVal,t.nVal))/10**t.dec,tipo:t.tipo}};
// Asistente: dada una etiqueta real y lo que dice (N.º de producto y importe o peso), devuelve las plantillas posibles, la más probable primero.
BZ.deducir=(code,pluTxt,valTxt,tipo)=>{code=String(code||'').trim();if(!BZ.esEtiqueta(code))return{err:'Escaneá una etiqueta de balanza (13 dígitos que empiezan con 2)'};
  const pl=String(pluTxt||'').replace(/\D/g,''),vt=String(valTxt||'').replace(/[\s$]/g,''),vn=PX.num(vt);if(!pl||!(+pl>0))return{err:'Escribí el N.º de producto que usa la balanza'};if(!(vn>0))return{err:'Escribí el importe o el peso que dice la etiqueta'};
  const decT=(vt.split(',')[1]||'').length,out=[],visto=new Set();
  for(let nPlu=1;nPlu<=8;nPlu++)for(let iPlu=1;iPlu+nPlu<=12;iPlu++){if(+code.substr(iPlu,nPlu)!==+pl)continue;
    for(let nVal=2;nVal<=7;nVal++)for(let iVal=1;iVal+nVal<=12;iVal++){if(iPlu<iVal+nVal&&iVal<iPlu+nPlu)continue;const raw=+code.substr(iVal,nVal);
      for(let dec=0;dec<=3;dec++){if(Math.abs(raw/10**dec-vn)>1e-9)continue;const k=[iPlu,nPlu,iVal,nVal,dec].join();if(visto.has(k))continue;visto.add(k);
        out.push({t:{iPlu,nPlu,iVal,nVal,tipo:tipo==='peso'?'peso':'importe',dec},puntos:(dec===decT?4:0)+(iVal+nVal===12?3:0)+(iPlu<=2?2:0)+(iPlu===1?1:0)+(nVal===5?1:0)+(nPlu>=4?1:0)})}}}
  out.sort((a,b)=>b.puntos-a.puntos);if(!out.length)return{err:'No encontré ese producto y ese valor dentro de la etiqueta: revisá lo que escribiste'};
  return{plantillas:out.slice(0,5).map(o=>o.t),controlOk:BZ.valido(code)}};
BZ.describir=t=>`producto: dígitos ${t.iPlu+1} a ${t.iPlu+t.nPlu} · ${t.tipo==='peso'?'peso':'importe'}: dígitos ${t.iVal+1} a ${t.iVal+t.nVal}, ${t.dec} decimal${t.dec===1?'':'es'}`;
BZ.producto=plu=>db.prods.find(p=>esPeso(p)&&String(p.plu||'')===String(plu));
// Agrega una pesada al carrito. imp = importe fijo (si la etiqueta trae importe) o null.
BZ.agregar=(p,g,imp)=>{const a=avail(p),g0=cart[p.id]||0;if(!(g>0))return{err:'La etiqueta de '+p.name+' trae un peso o importe en cero'};if(g0+g>a)return{err:'No hay tanto stock de '+p.name+': disponible '+fq(p,a)};
  if(imp!=null||cartImp[p.id])cartImp[p.id]={g:g0+g,imp:UT.r2((g0?lineaTotal(p,g0):0)+(imp!=null?imp:PX.impDeG(p,g)))};
  cart[p.id]=g0+g;drawCart();return{ok:true}};
// Una lectura en Ventas. true = era una etiqueta de balanza y ya se atendió (con éxito o con aviso).
BZ.escaneo=code=>{code=String(code||'').trim();if(!BZ.esEtiqueta(code)||!db.cfg.balanza)return false;
  if(db.prods.some(p=>String(p.code||'').trim()===code))return false;   // es el código de barras de un producto común
  const r=BZ.decodificar(code,db.cfg.balanza);if(r.err){beep(0);toast(r.err);return true}
  const p=BZ.producto(r.plu);if(!p){beep(0);toast('Etiqueta de balanza: ningún producto por peso tiene el código de balanza '+r.plu);return true}
  const g=r.tipo==='peso'?Math.round(r.valor*1000):PX.gDesdeImporte(p,r.valor),x=BZ.agregar(p,g,r.tipo==='importe'?r.valor:null);
  if(x.err){beep(0);toast(x.err);return true}beep(1);toast(p.name+' · '+fq(p,g)+' · '+fmt(lineaTotal(p,cart[p.id])));return true};
{const s0=onScan;onScan=function(code){if(tabActiva()==='v'&&!$('#pxm')&&BZ.escaneo(code))return;return s0(code)}}
{const k0=$('#q').onkeydown;$('#q').onkeydown=e=>{if(e.key==='Enter'&&BZ.escaneo(e.target.value)){e.target.value='';drawProds();return}return k0.call(e.target,e)}}

// ---------- Configuración > Mi negocio ----------
{const n=$('#cfg_bal');if(n){
  n.insertAdjacentHTML('beforeend',`<div class="card" id="bz_d" data-kw="balanza etiqueta codigo de barras peso plantilla"><h3>Balanza: etiquetas con código de barras</h3>
<p class="mu cfg-e">Si tu balanza imprime etiquetas con código de barras (empiezan con 2), el lector arma la venta solo. Cada producto por peso lleva el "código de balanza" que usa la balanza (en Productos, Opciones del producto).</p>
<details class="cfg-det"><summary>Configurar la balanza</summary><h4 style="margin:10px 0 4px">Asistente: aprender de una etiqueta real</h4>
<div class="form"><div><label>Escaneá una etiqueta</label><input id="bz_et" inputmode="numeric" placeholder="13 dígitos"></div><div><label>N.º de producto en la balanza</label><input id="bz_pl" inputmode="numeric" placeholder="Ej.: 123"></div><div><label>Lo que dice la etiqueta</label><input id="bz_vl" inputmode="decimal" placeholder="4500 o 1,125"></div>
<div><label>Eso es un</label><select id="bz_vt"><option value="importe">Importe ($)</option><option value="peso">Peso (kg)</option></select></div><div><button class="btn sec" id="bz_de">Deducir plantilla</button></div></div><div id="bz_cand"></div>
<h4 style="margin:10px 0 4px">Plantilla (posiciones del 2 al 12; el 1 es el prefijo)</h4>
<div class="form"><div><label>El valor es</label><select id="bz_t"><option value="importe">Importe ($)</option><option value="peso">Peso (kg)</option></select></div><div><label>Producto desde el dígito</label><input id="bz_ip" inputmode="numeric" placeholder="2"></div><div><label>Cantidad de dígitos del producto</label><input id="bz_np" inputmode="numeric" placeholder="6"></div><div><label>Valor desde el dígito</label><input id="bz_iv" inputmode="numeric" placeholder="8"></div><div><label>Cantidad de dígitos del valor</label><input id="bz_nv" inputmode="numeric" placeholder="5"></div><div><label>Decimales del valor</label><input id="bz_dc" inputmode="numeric" placeholder="0"></div></div>
<div style="display:flex;gap:8px;margin:8px 0"><button class="btn" id="bz_gu">Guardar plantilla</button><button class="btn sec" id="bz_qu">Quitar</button></div>
<div class="form"><div><label>Probar con una etiqueta</label><input id="bz_pr" inputmode="numeric" placeholder="Escaneá o escribí el código"></div></div><p id="bz_rs" class="mu"></p></details></div>`);
  const F=['bz_ip','bz_np','bz_iv','bz_nv','bz_dc'],sin=()=>toast('Tu usuario no tiene permiso para esto');
  const pon=t=>{$('#bz_t').value=t.tipo;[t.iPlu+1,t.nPlu,t.iVal+1,t.nVal,t.dec].forEach((v,i)=>$('#'+F[i]).value=v)};
  const leer=()=>{const v=F.map(id=>PX.num($('#'+id).value));return{iPlu:v[0]-1,nPlu:v[1],iVal:v[2]-1,nVal:v[3],tipo:$('#bz_t').value,dec:v[4]}};
  let cand=[];
  $('#bz_de').onclick=()=>{const r=BZ.deducir($('#bz_et').value,$('#bz_pl').value,$('#bz_vl').value,$('#bz_vt').value),o=$('#bz_cand');if(r.err){cand=[];o.innerHTML=`<p class="tip">${esc(r.err)}</p>`;return}
    cand=r.plantillas;pon(cand[0]);o.innerHTML=(r.controlOk?'':'<p class="tip">Ojo: el dígito de control de esa etiqueta no coincide; puede estar mal leída.</p>')+`<p class="mu">Probé la más probable (ya está cargada abajo). Si no es la tuya, elegí otra:</p>`+cand.map((t,i)=>`<button class="btn sec" data-bzc="${i}" style="margin:0 6px 6px 0">${esc(BZ.describir(t))}</button>`).join('')};
  $('#bz_cand').onclick=e=>{const b=e.target.closest('[data-bzc]');if(b)pon(cand[+b.dataset.bzc])};
  $('#bz_gu').onclick=()=>{if(!can('configuracion','editar'))return sin();const t=leer(),e=BZ.tplErr(t);if(e)return toast(e);db.cfg.balanza=t;save();draw();toast('Plantilla de balanza guardada')};
  $('#bz_qu').onclick=()=>{if(!can('configuracion','editar'))return sin();delete db.cfg.balanza;save();draw();toast('Plantilla quitada')};
  $('#bz_pr').oninput=()=>{const c=$('#bz_pr').value.trim(),o=$('#bz_rs');if(c.length<13){o.textContent='';return}const r=BZ.decodificar(c,db.cfg.balanza||leer());if(r.err){o.textContent=r.err;return}
    const p=BZ.producto(r.plu);o.textContent='Producto N.º '+r.plu+(p?' ('+p.name+')':' (ningún producto lo usa)')+' · '+(r.tipo==='peso'?PX.coma(r.valor,3)+' kg':fmt(r.valor))};
  MODS.push(()=>{if(db.cfg.balanza&&document.activeElement!==$('#bz_ip')&&!$('#bz_ip').value)pon(db.cfg.balanza)})}}
