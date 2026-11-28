// ===== Ticket de venta: diseño, logo en blanco y negro y configuración por comercio =====
// Todo se guarda en db.shop.tk (junto a nombre, dirección y teléfono). El ancho del papel sigue siendo db.shop.w
// (48 = papel de 58 mm, 72 = papel de 80 mm, 'a4'). Los datos fiscales de ARCA (CAE + QR) los sigue dibujando FA.bloque.
const TK={MAX_LOGO:150000,MAX_ARCHIVO:4e6,MAX_SRC:120000,TAM:{c:.35,m:.6,g:1},PLANT:['completa','compacta'],tim:null};
const TK_B64=/^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/;
TK.cfg=()=>{const t=(db.shop&&db.shop.tk)||{};return{plantilla:TK.PLANT.includes(t.plantilla)?t.plantilla:'completa',head:String(t.head||'').slice(0,240),foot:String(t.foot||'').slice(0,240),
  cuit:String(t.cuit||'').slice(0,20),iva:String(t.iva||'').slice(0,40),iibb:String(t.iibb||'').slice(0,30),inicio:String(t.inicio||'').slice(0,10),
  logo:{on:!!(t.logo&&t.logo.on),size:TK.TAM[t.logo&&t.logo.size]?t.logo.size:'m',data:t.logo&&TK_B64.test(t.logo.data||'')&&t.logo.data.length<=TK.MAX_LOGO?t.logo.data:'',src:t.logo&&TK_B64.test(t.logo.src||'')?t.logo.src:''}}};
TK.set=p=>{db.shop=db.shop||{};db.shop.tk={...TK.cfg(),...p,logo:{...TK.cfg().logo,...(p.logo||{})}}};
// Datos del comercio: lo que escribió el dueño y, si falta, lo que ya tiene cargado ARCA.
TK.datos=()=>{const c=TK.cfg(),a=(typeof FA!=='undefined'&&FA.e&&FA.e.cfg)||{};
  return{cuit:c.cuit||a.cuit||'',iva:c.iva||(a.condIva?(a.condIva==='ri'?'IVA Responsable Inscripto':'Responsable Monotributo'):''),iibb:c.iibb,inicio:c.inicio||a.inicio||''}};
TK.iibb=()=>TK.cfg().iibb;
TK.fiscal=s=>!!(s&&s.fe&&s.fe.cae);
const tkLineas=t=>esc(String(t||'')).split(/\r?\n/).slice(0,4).map(x=>x.trim()).filter(Boolean).join('<br>');
TK.cant=i=>{const u=i.u&&i.u!=='u'?i.u:'';return(u||!Number.isInteger(i.qty)?i.qty.toLocaleString('es-AR',{maximumFractionDigits:3,minimumFractionDigits:u==='kg'?3:0}):String(i.qty))+(u?' '+u:'')};
TK.lineaTot=i=>i.tot!=null?i.tot:i.qty*i.price;
TK.ahorro=s=>Math.round(s.items.reduce((a,i)=>a+(i.u==='kg'||!(i.lp>i.price)?0:i.lp*i.qty-TK.lineaTot(i)),0)*100)/100;
TK.logoHtml=()=>{const l=TK.cfg().logo;return l.on&&l.data?`<div style="text-align:center;margin-bottom:4px"><img alt="" src="${l.data}" style="width:${TK.TAM[l.size]*100}%;image-rendering:pixelated;display:inline-block"></div>`:''};
TK.leyenda=s=>TK.fiscal(s)?'':'Comprobante no válido como factura';
TK.item=(i,comp)=>{const kg=i.u==='kg',tot=fmt(TK.lineaTot(i)),ser=i.series?` (N.º ${esc(i.series.join(', '))})`:'',det=comp&&i.qty===1&&!kg?'':`<div style="white-space:nowrap">&nbsp;&nbsp;${TK.cant(i)} x ${fmt(i.price)}${kg?'/kg':''}</div>`;
  return `<div class="r"><span>${esc(i.name)}${ser}</span><b style="white-space:nowrap;font-weight:400">${tot}</b></div>${det}`};
// Ticket angosto (papel térmico). `s` = venta, `sh` = db.shop, `d` = fecha.
TK.html=(s,sh,d)=>{const c=TK.cfg(),comp=c.plantilla==='compacta',fis=TK.fiscal(s),dt=TK.datos(),ah=TK.ahorro(s),sub=Math.round((s.total+ah)*100)/100;
  const fiscalLin=!fis&&!comp?[dt.cuit&&'CUIT: '+esc(dt.cuit),dt.iva&&esc(dt.iva),dt.iibb&&'Ingresos Brutos: '+esc(dt.iibb),dt.inicio&&'Inicio de actividades: '+esc(dt.inicio)].filter(Boolean).join('<br>'):'';
  const n=s.items.reduce((a,i)=>a+(i.u==='kg'?1:i.qty),0);
  const vuelto=s.pay==='Efectivo'&&s.rec>0?`<div class="r"><span>Recibido</span><span>${fmt(s.rec)}</span></div><div class="r"><span>Vuelto</span><span>${fmt(Math.max(0,Math.round((s.rec-s.total)*100)/100))}</span></div>`:'';
  return `${TK.logoHtml()}<div style="text-align:center"><b style="font-size:15px">${esc(sh.n||'StockProject')}</b>${sh.a?'<br>'+esc(sh.a):''}${sh.t?'<br>Tel: '+esc(sh.t):''}${fiscalLin?'<br>'+fiscalLin:''}${c.head?'<br>'+tkLineas(c.head):''}</div><hr>`
  +(fis?'':`<div style="text-align:center"><b>COMPROBANTE DE PAGO</b><br>No válido como factura</div><hr>`)
  +`<div class="r"><span>Operación N.º</span><b>${String(s.id).padStart(6,'0')}</b></div>${d.toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}${s.cname?'<br>Cliente: '+esc(s.cname):''}<hr>`
  +s.items.map(i=>TK.item(i,comp)).join('')+'<hr>'
  +(ah>0?`<div class="r"><span>Subtotal</span><span>${fmt(sub)}</span></div><div class="r"><span>Descuento aplicado${s.disc?': '+s.disc+' %':''}</span><span>-${fmt(ah)}</span></div>`:'')
  +`<div class="r" style="font-size:14px"><b>TOTAL</b><b>${fmt(s.total)}</b></div>`+(comp?'':`<div class="r"><span>Artículos</span><span>${n.toLocaleString('es-AR',{maximumFractionDigits:3})}</span></div>`)
  +`<div class="r"><span>Pago</span><span>${esc(s.pay)}</span></div>${vuelto}${!ah&&s.disc?'Descuento aplicado: '+s.disc+' %<br>':''}<hr>`
  +`<div style="text-align:center">${c.foot?tkLineas(c.foot)+'<br>':''}¡Gracias por su compra!${fis?'':'<br>Comprobante no válido como factura'}</div>`};
// ---- Logo: gris -> blanco y negro de alto contraste (umbral o puntos) ----
// Promedia los píxeles al ancho pedido (sobre fondo blanco) y devuelve niveles de gris.
TK.escalarGris=(rgba,w,h,tw)=>{const th=Math.max(1,Math.round(h*tw/w)),g=new Uint8Array(tw*th),fx=w/tw,fy=h/th;
  for(let y=0;y<th;y++)for(let x=0;x<tw;x++){let sum=0,k=0;const y0=Math.floor(y*fy),y1=Math.max(y0+1,Math.floor((y+1)*fy)),x0=Math.floor(x*fx),x1=Math.max(x0+1,Math.floor((x+1)*fx));
    for(let yy=y0;yy<y1&&yy<h;yy++)for(let xx=x0;xx<x1&&xx<w;xx++){const p=(yy*w+xx)*4,a=rgba[p+3]/255;sum+=(.299*rgba[p]+.587*rgba[p+1]+.114*rgba[p+2])*a+255*(1-a);k++}
    g[y*tw+x]=k?Math.round(sum/k):255}return{g,w:tw,h:th}};
// modo 'umbral' (logos de línea/texto) o 'puntos' (Floyd-Steinberg, para fotos). Devuelve 0 = negro, 255 = blanco.
TK.binarizar=(g,w,h,modo)=>{const o=new Uint8Array(g.length);if(modo!=='puntos'){for(let i=0;i<g.length;i++)o[i]=g[i]<140?0:255;return o}
  const f=Float32Array.from(g);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,v=f[i]<128?0:255,e=f[i]-v;o[i]=v;
    if(x+1<w)f[i+1]+=e*7/16;if(y+1<h){if(x>0)f[i+w-1]+=e*3/16;f[i+w]+=e*5/16;if(x+1<w)f[i+w+1]+=e/16}}return o};
// Muchos grises intermedios = foto (puntos); pocos = logo de línea o texto (umbral).
TK.esFoto=g=>{let m=0;for(let i=0;i<g.length;i++)if(g[i]>50&&g[i]<205)m++;return m/g.length>.12};
TK.anchoPx=()=>{const w=db.shop&&db.shop.w;return w==='a4'?576:Math.round((w||72)*8)};   // 203 dpi ≈ 8 puntos por mm
TK.validarLogo=url=>typeof url==='string'&&TK_B64.test(url)&&url.length<=TK.MAX_LOGO;
const tkImg=url=>new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>no(new Error('No se pudo leer la imagen'));im.src=url});
const tkCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
// Reduce hasta que el PNG entre en el límite de tamaño (nunca se guarda algo más grande).
TK.generar=async()=>{const c=TK.cfg();if(!c.logo.src)return;const im=await tkImg(c.logo.src);let ancho=Math.max(32,Math.round(TK.anchoPx()*TK.TAM[c.logo.size]));
  for(let n=0;n<8;n++){const cv=tkCanvas(im.width,im.height),cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(im,0,0);
    const id=cx.getImageData(0,0,cv.width,cv.height),r=TK.escalarGris(id.data,cv.width,cv.height,ancho),b=TK.binarizar(r.g,r.w,r.h,TK.esFoto(r.g)?'puntos':'umbral');
    const out=tkCanvas(r.w,r.h),ox=out.getContext('2d'),oi=ox.createImageData(r.w,r.h);for(let i=0;i<b.length;i++){oi.data[i*4]=oi.data[i*4+1]=oi.data[i*4+2]=b[i];oi.data[i*4+3]=255}
    ox.putImageData(oi,0,0);const url=out.toDataURL('image/png');if(TK.validarLogo(url)){TK.set({logo:{data:url}});save();return true}ancho=Math.round(ancho*.75)}
  throw new Error('El logo es demasiado complejo: probá con una imagen más simple')};
// Carga el archivo, lo achica a 576 px máx. en grises (esa es la "fuente" que se reusa al cambiar papel o tamaño) y arma el logo.
TK.cargar=async f=>{if(!f||!/^image\/(png|jpeg|gif|webp|bmp)$/.test(f.type))throw new Error('Elegí una imagen (PNG o JPG)');if(f.size>TK.MAX_ARCHIVO)throw new Error('La imagen pesa más de 4 MB: elegí una más liviana');
  const url=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(new Error('No se pudo leer el archivo'));r.readAsDataURL(f)});const im=await tkImg(url);
  let w=Math.min(576,im.width);for(let n=0;n<6;n++){const h=Math.max(1,Math.round(im.height*w/im.width)),cv=tkCanvas(w,h),cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,w,h);cx.drawImage(im,0,0,w,h);
    const s=cv.toDataURL('image/jpeg',.8);if(s.length<=TK.MAX_SRC){TK.set({logo:{src:s,on:true}});await TK.generar();return true}w=Math.round(w*.7)}
  throw new Error('La imagen es demasiado grande para guardarla')};
// ---- Pantalla de configuración (Configuración > Mi negocio) ----
TK.MUESTRA=()=>({id:128,date:new Date().toISOString(),pay:'Efectivo',rec:15000,total:11400,items:[{name:'Yerba mate 1 kg',qty:1,price:4200,lp:4200},{name:'Queso cremoso',qty:.35,u:'kg',price:12000,tot:4200},{name:'Alfajor triple',qty:2,price:1500,lp:1700,tot:3000}]});
TK.preview=()=>{const p=document.getElementById('tk_prev');if(!p||!db.shop)return;const w=db.shop.w;p.style.width=w==='a4'?'':((w||72)+8)+'mm';p.innerHTML=TK.html(TK.MUESTRA(),db.shop,new Date())};
TK.pintar=()=>{const k=document.getElementById('cfg_ticket');if(!k||!db.shop||k.contains(document.activeElement))return;const c=TK.cfg(),v=(i,x)=>{document.getElementById(i).value=x};
  v('tk_w',String(db.shop.w||72));v('tk_pl',c.plantilla);v('tk_cuit',c.cuit);v('tk_iva',c.iva);v('tk_iibb',c.iibb);v('tk_ini',c.inicio);v('tk_head',c.head);v('tk_foot',c.foot);v('tk_sz',c.logo.size);
  document.getElementById('tk_on').checked=c.logo.on;document.getElementById('tk_quitar').classList.toggle('hide',!c.logo.src);TK.preview()};
TK.guardar=()=>{const g=i=>document.getElementById(i).value.trim();TK.set({plantilla:g('tk_pl'),cuit:g('tk_cuit'),iva:g('tk_iva'),iibb:g('tk_iibb'),inicio:g('tk_ini'),head:g('tk_head'),foot:g('tk_foot'),logo:{on:document.getElementById('tk_on').checked,size:g('tk_sz')}});
  const w=g('tk_w');db.shop.w=w==='a4'?'a4':+w;clearTimeout(TK.tim);TK.tim=setTimeout(save,300);TK.preview()};
TK.init=()=>{const base=document.getElementById('cfg_datos');if(!base||document.getElementById('cfg_ticket'))return;
  base.insertAdjacentHTML('afterend',`<div class="card" id="cfg_ticket" data-kw="ticket logo comprobante papel impresora 58 80 encabezado pie cuit ingresos brutos plantilla"><h3>Ticket de venta</h3><p class="mu cfg-e">Elegí cómo sale impreso el comprobante. La vista previa se actualiza sola.</p>
<div class="form" style="margin:0"><div><label for="tk_w">Ancho del papel</label><select id="tk_w"><option value="48">Papel de 58 mm</option><option value="72">Papel de 80 mm</option><option value="a4">Hoja A4</option></select></div>
<div><label for="tk_pl">Plantilla</label><select id="tk_pl"><option value="completa">Completa</option><option value="compacta">Compacta (más corta)</option></select></div>
<div><label for="tk_cuit">CUIT</label><input id="tk_cuit" maxlength="20" placeholder="Si usás ARCA se toma de ahí"></div><div><label for="tk_iva">Condición frente al IVA</label><input id="tk_iva" maxlength="40" placeholder="Ej: Responsable Monotributo"></div>
<div><label for="tk_iibb">Ingresos Brutos</label><input id="tk_iibb" maxlength="30"></div><div><label for="tk_ini">Inicio de actividades</label><input id="tk_ini" maxlength="10" placeholder="dd/mm/aaaa"></div>
<div><label for="tk_head">Encabezado (opcional)</label><textarea id="tk_head" rows="2" maxlength="240"></textarea></div><div><label for="tk_foot">Pie (opcional)</label><textarea id="tk_foot" rows="2" maxlength="240"></textarea></div>
<div><label><input type="checkbox" id="tk_on"> Mostrar logo</label><br><input type="file" id="tk_file" accept="image/*"><div class="mu" id="tk_msg" style="margin-top:4px">Se convierte a blanco y negro. Algunas impresoras térmicas no imprimen imágenes: si es tu caso, destildá el logo.</div></div>
<div><label for="tk_sz">Tamaño del logo</label><select id="tk_sz"><option value="c">Chico</option><option value="m">Mediano</option><option value="g">Grande</option></select> <button class="btn sec hide" id="tk_quitar" type="button">Quitar logo</button></div></div>
<div style="margin-top:10px"><b>Vista previa</b><div id="tk_prev" style="margin:6px auto 0;background:#fff;color:#000;font:12px/1.35 monospace;padding:4mm;box-shadow:0 2px 10px rgba(0,0,0,.25);max-width:100%;overflow:hidden"></div></div></div>`);
  const k=document.getElementById('cfg_ticket');k.addEventListener('input',TK.guardar);k.addEventListener('change',async e=>{TK.guardar();if(e.target.id==='tk_w'||e.target.id==='tk_sz'){try{await TK.generar();TK.preview()}catch(x){toast(x.message)}}});
  document.getElementById('tk_file').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{await TK.cargar(f);toast('Logo cargado');TK.pintar()}catch(x){toast(x.message)}});
  document.getElementById('tk_quitar').onclick=()=>{TK.set({logo:{on:false,data:'',src:''}});save();TK.pintar()};MODS.push(TK.pintar);TK.pintar()};
TK.init();
