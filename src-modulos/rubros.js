// ===== Entrevista por rubro (v3.1.0): perfiles + catálogo de preguntas → capacidades reales del sistema =====
// El rubro es solo una plantilla inicial. Lo que gobierna el comportamiento son las capacidades (db.cfg.caps), que
// habilitan opciones en cada producto (productos2.js). Agregar un rubro = agregar una entrada en RB.PERFILES.
// Nunca modifica productos existentes. El progreso se guarda (db.cfg.entrevistaBorrador) y se puede retomar.
const RB={};
RB.CAPS={heladeria:'Heladería (gustos en baldes y tamaños de precio fijo)',peso:'Venta por peso',vencimientos:'Lotes y vencimientos obligatorios por producto',series:'Números de serie',garantias:'Garantías, marca y modelo',variantes:'Variantes (talle, color…)',tramos:'Precios por cantidad',minimos:'Compra mínima'};
// Cada rubro: tipo (perfil general de menú e Inicio), capacidades de arranque, preguntas propias, categorías sugeridas,
// motivos de baja propios y textos de ejemplo. Lo que un rubro no usa no aparece en el programa.
RB.PERFILES={
  kiosco:{n:'Kiosco',d:'Golosinas, bebidas, cigarrillos y mercadería general.',tipo:'minorista',caps:{},pregs:['k_vto','k_peso','stock'],cats:['Golosinas','Bebidas','Cigarrillos','Snacks','Lácteos','Librería','Varios'],ej:'Alfajor triple'},
  almacen:{n:'Almacén',d:'Alimentos envasados, fiambres, lácteos y limpieza.',tipo:'minorista',caps:{peso:true},pregs:['a_peso','a_vto','a_vtodef','alvto','stock'],cats:['Almacén','Fiambres','Lácteos','Bebidas','Limpieza','Panificados','Congelados'],ej:'Queso cremoso'},
  verduleria:{n:'Verdulería',d:'Frutas y verduras por peso, por unidad o por atado.',tipo:'minorista',caps:{peso:true,unidadPorDefecto:'kg'},pregs:['v_unidad','v_merma','v_huevos','stock'],cats:['Frutas','Verduras','Hojas','Huevos','Frutos secos'],motivos:['Merma / maduración'],ej:'Tomate redondo'},
  carniceria:{n:'Carnicería',d:'Cortes por peso, pollo, cerdo y elaborados.',tipo:'minorista',caps:{peso:true,unidadPorDefecto:'kg'},pregs:['c_vto','c_elab','c_merma','stock'],cats:['Vacuno','Cerdo','Pollo','Achuras','Elaborados','Embutidos'],motivos:['Merma por desposte'],ej:'Asado de tira'},
  cafeteria:{n:'Cafetería o restaurante',d:'Café, comidas y bebidas que se preparan y se venden en el momento.',tipo:'restaurante',caps:{},pregs:['f_insumos','f_peso'],cats:['Cafetería','Pastelería','Sándwiches','Platos','Bebidas','Insumos'],motivos:['Preparación fallida','Consumo del personal'],ej:'Café con leche'},
  ropa:{n:'Ropa y calzado',d:'Prendas con talles, colores y stock por variante.',tipo:'minorista',caps:{variantes:true},pregs:['r_var','r_atr','r_desc','stock'],cats:['Remeras','Pantalones','Abrigos','Calzado','Accesorios'],ej:'Remera básica'},
  electronica:{n:'Electrónica',d:'Dispositivos y accesorios con número de serie y garantía.',tipo:'minorista',caps:{series:true,garantias:true},pregs:['e_serie','e_gar','stock'],cats:['Celulares','Accesorios','Audio','Computación','Cables'],ej:'Auricular inalámbrico'},
  mayorista:{n:'Mayorista o distribuidora',d:'Ventas por volumen, cantidades mínimas y precios por cantidad.',tipo:'mayorista',caps:{tramos:true,minimos:true},pregs:['m_tramos','m_min','m_peso','stock'],cats:['Bebidas','Almacén','Limpieza','Golosinas'],ej:'Gaseosa 2,25 L x 6'},
  servicios:{n:'Servicios',d:'Trabajos, reparaciones o consultoría: se cobra el servicio, casi sin stock.',tipo:'servicios',caps:{},pregs:[],cats:['Servicios','Repuestos'],ej:'Mano de obra'},
  panaderia:{n:'Panadería',d:'Pan por kilo, facturas, tortas y sándwiches.',tipo:'minorista',caps:{peso:true},pregs:['pa_peso','pa_vto','pa_merma','stock'],cats:['Pan','Facturas','Tortas','Sándwiches de miga','Galletas','Bebidas'],motivos:['Sobrante del día'],ej:'Pan francés'},
  ferreteria:{n:'Ferretería',d:'Herramientas, tornillería, electricidad, plomería y pinturas.',tipo:'minorista',caps:{peso:true,tramos:true,garantias:true},pregs:['fe_peso','fe_tramos','fe_gar','fe_serie','stock'],cats:['Herramientas','Tornillería','Electricidad','Plomería','Pinturas','Jardín'],ej:'Tornillo autoperforante'},
  farmacia:{n:'Farmacia',d:'Medicamentos con lote y vencimiento, perfumería y cuidado personal.',tipo:'minorista',caps:{vencimientos:true,vtoPorDefecto:true,alertaVto:true},pregs:['fa_vto','fa_vtodef','stock'],cats:['Medicamentos','Venta libre','Perfumería','Cuidado personal','Bebés','Accesorios'],motivos:['Devolución a droguería'],ej:'Ibuprofeno 400 mg x 10'},
  libreria:{n:'Librería',d:'Útiles escolares, cuadernos, libros y regalería.',tipo:'minorista',caps:{tramos:true},pregs:['li_tramos','li_var','stock'],cats:['Útiles','Cuadernos','Libros','Arte','Fotocopias','Regalería'],ej:'Cuaderno tapa dura'},
  petshop:{n:'Pet shop',d:'Alimento suelto o en bolsa, accesorios e higiene para mascotas.',tipo:'minorista',caps:{peso:true,vencimientos:true},pregs:['pe_peso','pe_vto','stock'],cats:['Alimento para perros','Alimento para gatos','Accesorios','Higiene','Farmacia veterinaria'],ej:'Alimento adulto 15 kg'},
  dietetica:{n:'Dietética',d:'Frutos secos, harinas, semillas y suplementos, muchos por peso.',tipo:'minorista',caps:{peso:true,unidadPorDefecto:'kg',vencimientos:true},pregs:['d_unidad','d_vto','d_merma','stock'],cats:['Frutos secos','Harinas','Semillas','Legumbres','Suplementos','Sin TACC'],motivos:['Merma por fraccionado'],ej:'Almendras'},
  perfumeria:{n:'Perfumería',d:'Fragancias, maquillaje y cuidado personal.',tipo:'minorista',caps:{vencimientos:true},pregs:['pf_vto','pf_var','stock'],cats:['Fragancias','Maquillaje','Cuidado de la piel','Cabello','Higiene'],ej:'Esmalte de uñas'},
  heladeria:{n:'Heladería',d:'Gustos por balde, tamaños de precio fijo (cucurucho, ¼, ½, 1 kg) envases con stock y conteo de baldes en Inventario.',tipo:'minorista',caps:{peso:true,heladeria:true},pregs:['stock'],cats:['Helado','Tamaños','Envases','Paletas y otros','Insumos'],motivos:['Derretido'],ej:'Dulce de leche'},
  otro:{n:'Otro comercio',d:'Elegí vos qué funciones querés tener disponibles.',tipo:'otro',caps:{},pregs:['o_peso','o_vto','stock'],cats:[],ej:'Producto'}
};
// Rubro equivalente para negocios que contestaron la encuesta anterior (por tipo de comercio).
RB.deTipo=t=>({restaurante:'cafeteria',mayorista:'mayorista',servicios:'servicios'}[t]||'');
// Catálogo de preguntas. tipo: 'sino' | 'texto'. si(r): condición para mostrarse. ap(caps,valor,cfg): consecuencia.
RB.PREGS={
  k_vto:{t:'¿Tenés productos que necesitan control de vencimiento?',tipo:'sino',def:false,ap:(c,v)=>{c.vencimientos=v}},
  k_peso:{t:'¿Vendés algún producto por peso?',tipo:'sino',def:false,ap:(c,v)=>{c.peso=v}},
  a_peso:{t:'¿Vendés fiambres u otros productos por peso?',tipo:'sino',def:true,ap:(c,v)=>{c.peso=v}},
  a_vto:{t:'¿Necesitás registrar lotes y fechas de vencimiento?',tipo:'sino',def:true,ap:(c,v)=>{c.vencimientos=v}},
  a_vtodef:{t:'¿Querés que los productos nuevos exijan vencimiento por defecto?',d:'Se puede cambiar en cada producto.',tipo:'sino',def:false,si:r=>r.a_vto!==false,ap:(c,v)=>{c.vtoPorDefecto=v}},
  alvto:{t:'¿Querés alertas de vencimiento?',tipo:'sino',def:true,si:r=>r.a_vto!==false,ap:(c,v)=>{c.alertaVto=v}},
  v_unidad:{t:'¿Lo más común es vender por kilo?',d:'Si decís que sí, los productos nuevos arrancan "por peso". Igual podés cargar productos por unidad o por atado.',tipo:'sino',def:true,ap:(c,v)=>{c.unidadPorDefecto=v?'kg':'u'}},
  v_merma:{t:'¿Querés registrar la merma (fruta o verdura que se echa a perder)?',tipo:'sino',def:true,ap:(c,v,cfg)=>{cfg.sinMotivos=!v}},
  v_huevos:{t:'¿Vendés también productos envasados con vencimiento (huevos, frutos secos)?',tipo:'sino',def:false,ap:(c,v)=>{c.vencimientos=v}},
  c_vto:{t:'¿Querés controlar la fecha de vencimiento de la mercadería?',tipo:'sino',def:true,ap:(c,v)=>{c.vencimientos=v;c.alertaVto=v}},
  c_elab:{t:'¿Vendés elaborados por unidad (milanesas, hamburguesas, chorizos)?',d:'Podés cargarlos por unidad o por peso, producto por producto.',tipo:'sino',def:true,ap:()=>{}},
  c_merma:{t:'¿Querés registrar la merma por desposte y recortes?',tipo:'sino',def:true,ap:(c,v,cfg)=>{cfg.sinMotivos=!v}},
  f_insumos:{t:'¿Controlás insumos con fecha de vencimiento (leche, fiambres, pastelería)?',tipo:'sino',def:true,ap:(c,v)=>{c.vencimientos=v;c.alertaVto=v}},
  f_peso:{t:'¿Vendés algo por peso (café en grano, tortas por kilo)?',tipo:'sino',def:false,ap:(c,v)=>{c.peso=v}},
  e_serie:{t:'¿Hay productos que requieren seguimiento por número de serie?',tipo:'sino',def:true,ap:(c,v)=>{c.series=v}},
  e_gar:{t:'¿Querés registrar garantía, marca y modelo?',tipo:'sino',def:true,ap:(c,v)=>{c.garantias=v}},
  r_var:{t:'¿Querés controlar el stock por combinación (por ejemplo talle y color)?',tipo:'sino',def:true,ap:(c,v)=>{c.variantes=v}},
  r_atr:{t:'¿Qué características distinguen las variantes?',d:'Separadas por coma. Ejemplo: Talle, Color',tipo:'texto',def:'Talle, Color',req:true,si:r=>r.r_var!==false,
    val:v=>{const a=RB.lista(v);return !a.length?'Escribí al menos una característica':a.length>4?'Como máximo 4 características':a.some(x=>x.length>20)?'Cada característica puede tener hasta 20 letras':''},ap:(c,v,cfg)=>{cfg.atributos=RB.lista(v)}},
  r_desc:{t:'¿Vas a ofrecer descuentos por cantidad?',tipo:'sino',def:false,ap:(c,v)=>{c.tramos=v}},
  m_tramos:{t:'¿Manejás precios diferentes según la cantidad?',tipo:'sino',def:true,ap:(c,v)=>{c.tramos=v}},
  m_min:{t:'¿Necesitás cantidades mínimas de compra por producto?',tipo:'sino',def:true,ap:(c,v)=>{c.minimos=v}},
  m_peso:{t:'¿Vendés mercadería por peso?',tipo:'sino',def:false,ap:(c,v)=>{c.peso=v}},
  pa_peso:{t:'¿Vendés pan u otros productos por kilo?',tipo:'sino',def:true,ap:(c,v)=>{c.peso=v}},
  pa_vto:{t:'¿Vendés productos envasados con fecha de vencimiento?',tipo:'sino',def:false,ap:(c,v)=>{c.vencimientos=v}},
  pa_merma:{t:'¿Querés registrar lo que sobra al final del día?',tipo:'sino',def:true,ap:(c,v,cfg)=>{cfg.sinMotivos=!v}},
  fe_peso:{t:'¿Vendés clavos, tornillos u otros productos por kilo?',tipo:'sino',def:true,ap:(c,v)=>{c.peso=v}},
  fe_tramos:{t:'¿Tenés precios distintos según la cantidad (por ejemplo, por caja)?',tipo:'sino',def:true,ap:(c,v)=>{c.tramos=v}},
  fe_gar:{t:'¿Querés registrar marca, modelo y garantía de las herramientas?',tipo:'sino',def:true,ap:(c,v)=>{c.garantias=v}},
  fe_serie:{t:'¿Necesitás anotar el número de serie de cada máquina que vendés?',tipo:'sino',def:false,ap:(c,v)=>{c.series=v}},
  fa_vto:{t:'¿Querés controlar lote y vencimiento de los productos?',tipo:'sino',def:true,ap:(c,v)=>{c.vencimientos=v;c.alertaVto=v}},
  fa_vtodef:{t:'¿Los productos nuevos tienen que exigir fecha de vencimiento?',d:'Recomendado para medicamentos. Se puede cambiar en cada producto.',tipo:'sino',def:true,si:r=>r.fa_vto!==false,ap:(c,v)=>{c.vtoPorDefecto=v}},
  li_tramos:{t:'¿Hacés descuento por cantidad (por ejemplo, por docena o por lista escolar)?',tipo:'sino',def:true,ap:(c,v)=>{c.tramos=v}},
  li_var:{t:'¿Querés llevar el stock por color en algunos productos?',tipo:'sino',def:false,ap:(c,v,cfg)=>{c.variantes=v;if(v)cfg.atributos=['Color']}},
  pe_peso:{t:'¿Vendés alimento suelto por kilo?',tipo:'sino',def:true,ap:(c,v)=>{c.peso=v}},
  pe_vto:{t:'¿Querés controlar el vencimiento del alimento y los medicamentos?',tipo:'sino',def:true,ap:(c,v)=>{c.vencimientos=v;c.alertaVto=v}},
  d_unidad:{t:'¿Lo más común es vender por peso?',d:'Si decís que sí, los productos nuevos arrancan "por peso". Igual podés cargar productos por unidad.',tipo:'sino',def:true,ap:(c,v)=>{c.unidadPorDefecto=v?'kg':'u'}},
  d_vto:{t:'¿Querés controlar fechas de vencimiento?',tipo:'sino',def:true,ap:(c,v)=>{c.vencimientos=v;c.alertaVto=v}},
  d_merma:{t:'¿Querés registrar la merma al fraccionar?',tipo:'sino',def:true,ap:(c,v,cfg)=>{cfg.sinMotivos=!v}},
  pf_vto:{t:'¿Querés controlar el vencimiento de los productos?',tipo:'sino',def:true,ap:(c,v)=>{c.vencimientos=v;c.alertaVto=v}},
  pf_var:{t:'¿Querés llevar el stock por tono o fragancia en algunos productos?',tipo:'sino',def:false,ap:(c,v,cfg)=>{c.variantes=v;if(v)cfg.atributos=['Tono']}},
  o_peso:{t:'¿Vendés algún producto por peso?',tipo:'sino',def:false,ap:(c,v)=>{c.peso=v}},
  o_vto:{t:'¿Tenés productos con fecha de vencimiento?',tipo:'sino',def:false,ap:(c,v)=>{c.vencimientos=v}},
  stock:{t:'¿Querés alertas de stock mínimo?',tipo:'sino',def:true,ap:(c,v)=>{c.alertaStock=v}}
};
// Preguntas del rubro como HTML y su lectura (las usan la encuesta inicial y la entrevista por rubro).
RB.htmlPregs=st=>RB.visibles(st).map(id=>{const q=RB.PREGS[id],v=RB.valor(st,id);return`<div style="margin-bottom:12px" data-rp="${id}"><b>${q.t}</b>${q.req||q.tipo==='sino'?'':' <span class="mu">(opcional)</span>'}${q.d?`<br><span class="mu">${q.d}</span>`:''}<div style="margin-top:4px">${q.tipo==='sino'?`<label style="display:inline-flex;gap:6px;margin-right:14px;font-size:14px;color:var(--tx)"><input type="radio" name="rb_${id}" value="1" ${v?'checked':''} style="width:auto"> Sí</label><label style="display:inline-flex;gap:6px;font-size:14px;color:var(--tx)"><input type="radio" name="rb_${id}" value="0" ${v?'':'checked'} style="width:auto"> No</label>`:`<input data-rq="${id}" value="${esc(v||'')}">`}</div></div>`}).join('');
RB.leerPregs=(st,raiz)=>RB.visibles(st).forEach(id=>{const q=RB.PREGS[id];if(q.tipo==='sino'){const c=$(`${raiz} [name="rb_${id}"]:checked`);if(c)st.r[id]=c.value==='1'}else{const i=$(`${raiz} [data-rq="${id}"]`);if(i)st.r[id]=i.value.trim()}});
RB.lista=v=>[...new Set(String(v||'').split(',').map(x=>x.trim()).filter(Boolean))];
RB.visibles=st=>(RB.PERFILES[st.rubro]||{pregs:[]}).pregs.filter(id=>{const q=RB.PREGS[id];return !q.si||q.si(st.r)});
RB.valor=(st,id)=>st.r[id]!==undefined?st.r[id]:RB.PREGS[id].def;
// Configuración resultante: perfil + respuestas visibles + capacidades adicionales elegidas a mano.
RB.resolver=st=>{const pf=RB.PERFILES[st.rubro],caps={...pf.caps},cfg={};RB.visibles(st).forEach(id=>RB.PREGS[id].ap(caps,RB.valor(st,id),cfg));(st.extra||[]).forEach(k=>{if(RB.CAPS[k])caps[k]=true});
  Object.keys(RB.CAPS).forEach(k=>{caps[k]=!!caps[k]});if(caps.variantes&&!cfg.atributos)cfg.atributos=['Talle','Color'];if(!caps.peso)delete caps.unidadPorDefecto;return{caps,atributos:cfg.atributos||null,motivos:cfg.sinMotivos?[]:(pf.motivos||[])}};
RB.motivosDeRubros=()=>Object.values(RB.PERFILES).flatMap(p=>p.motivos||[]);
RB.validar=st=>{if(!RB.PERFILES[st.rubro])return'Elegí un rubro';for(const id of RB.visibles(st)){const q=RB.PREGS[id],v=RB.valor(st,id);if(q.req&&(v===''||v==null))return'Falta responder: '+q.t;if(q.val){const e=q.val(v);if(e)return e}}return''};
RB.aplicar=st=>{const e=RB.validar(st);if(e)return{err:e};const r=RB.resolver(st);db.cfg.rubro=st.rubro;db.cfg.caps=r.caps;if(r.atributos)db.cfg.atributos=r.atributos;db.cfg.motivosBaja=[...new Set([...(db.cfg.motivosBaja||[]).filter(m=>!RB.motivosDeRubros().includes(m)),...r.motivos])];db.cfg.entrevista={fecha:new Date().toISOString(),rubro:st.rubro,r:st.r,extra:st.extra||[]};delete db.cfg.entrevistaBorrador;if(st.rubro==='heladeria'&&typeof HL!=='undefined')HL.ejemplos();return{ok:true,...r}};
RB.resumen=st=>{const r=RB.resolver(st),on=Object.keys(RB.CAPS).filter(k=>r.caps[k]);return{rubro:RB.PERFILES[st.rubro].n,funciones:on.map(k=>RB.CAPS[k]),
  stock:[...new Set(['Por unidad',r.caps.peso?'Por peso (gramos)':'',r.caps.variantes?'Por variante':'',r.caps.series?'Por número de serie':''])].filter(Boolean),
  atributos:r.atributos||[],precios:['Precio unitario',r.caps.peso?'Precio por kg':'',r.caps.tramos?'Precios por cantidad':'',r.caps.minimos?'Compra mínima':''].filter(Boolean),
  venc:r.caps.vencimientos?(r.caps.vtoPorDefecto?'Obligatorio por defecto en productos nuevos':'Se exige en los productos que lo indiquen'):'Opcional (lotes con fecha solo si se carga)',
  alertas:[r.caps.alertaStock!==false?'Stock mínimo':'',r.caps.alertaVto!==false&&r.caps.alertaVto!==undefined||r.caps.vencimientos?'Vencimientos':''].filter(Boolean)}};
// ---------- pantalla ----------
RB.abrir=()=>{if($('#rbo'))return;const b=db.cfg.entrevistaBorrador,prev=db.cfg.entrevista,st=b?JSON.parse(JSON.stringify(b)):{paso:0,rubro:prev?prev.rubro:'',r:prev?{...prev.r}:{},extra:prev?[...prev.extra]:[]};
  document.body.insertAdjacentHTML('beforeend','<div class="ov" id="rbo" role="dialog" aria-modal="true"><div class="card" id="rbc"></div></div>');
  const guardar=()=>{db.cfg.entrevistaBorrador=JSON.parse(JSON.stringify(st));save()},cerrar=()=>{const o=$('#rbo');if(o)o.remove()};
  const leer=()=>{if(st.paso===0){const c=$('#rbc [name=rb_r]:checked');if(c)st.rubro=c.value}
    if(st.paso===1)RB.leerPregs(st,'#rbc');
    if(st.paso===2)st.extra=$$('#rbc [data-rx]').filter(c=>c.checked).map(c=>c.dataset.rx)};
  const dib=()=>{let h='';
    if(st.paso===0)h=`<h3>¿Cuál es tu rubro?</h3><p class="mu" style="margin-top:0">Es una plantilla inicial: después podés activar otras funciones.</p>${Object.entries(RB.PERFILES).map(([k,p])=>`<label class="opt"><input type="radio" name="rb_r" value="${k}" ${st.rubro===k?'checked':''}> <span><b>${p.n}</b><br><span class="mu">${p.d}</span></span></label>`).join('')}`;
    if(st.paso===1)h=`<h3>${RB.PERFILES[st.rubro].n}: algunas preguntas</h3>${RB.htmlPregs(st)||'<p class="mu">Este rubro no necesita más datos.</p>'}`;
    if(st.paso===2){const base=RB.resolver({...st,extra:[]}).caps;h=`<h3>¿Querés sumar algo más?</h3><p class="mu" style="margin-top:0">Un mismo negocio puede vender productos muy distintos. Marcá lo que también necesites.</p>${Object.entries(RB.CAPS).map(([k,t])=>`<label class="opt"><input type="checkbox" data-rx="${k}" ${base[k]?'checked disabled':(st.extra||[]).includes(k)?'checked':''}> ${t}${base[k]?' <span class="mu">(ya incluido)</span>':''}</label>`).join('')}`}
    if(st.paso===3){const r=RB.resumen(st),L=(t,v)=>`<div class="row"><span class="mu">${t}</span><b style="text-align:right">${esc(Array.isArray(v)?(v.join(' · ')||'—'):v)}</b></div>`;
      h=`<h3>Resumen</h3>${L('Rubro',r.rubro)}${L('Funciones activadas',r.funciones)}${L('Control de stock',r.stock)}${L('Características de variantes',r.atributos)}${L('Reglas de precios',r.precios)}${L('Vencimientos',r.venc)}${L('Alertas',r.alertas)}<p class="mu">Tus productos actuales no se modifican: las funciones nuevas quedan disponibles en "Opciones del producto".</p>`}
    $('#rbc').innerHTML=`<div class="mu" style="margin-bottom:6px">Paso ${st.paso+1} de 4 · Entrevista de configuración</div>${h}<div style="display:flex;gap:8px;margin-top:14px;justify-content:space-between"><button class="btn sec" id="rb_at" ${st.paso?'':'disabled'}>Atrás</button><span style="display:flex;gap:8px"><button class="btn sec" id="rb_ce">Seguir más tarde</button><button class="btn" id="rb_si">${st.paso===3?'Confirmar':'Siguiente'}</button></span></div>`;
    if(st.paso===1)$$('#rbc input[type=radio]').forEach(i=>i.onchange=()=>{leer();dib()});   // las preguntas condicionales aparecen o desaparecen
    $('#rb_at').onclick=()=>{leer();st.paso--;guardar();dib()};$('#rb_ce').onclick=()=>{leer();guardar();cerrar();toast('Progreso guardado: podés retomarla en Configuración')};
    $('#rb_si').onclick=()=>{leer();if(st.paso===0&&!RB.PERFILES[st.rubro])return toast('Elegí un rubro');if(st.paso===1){const e=RB.validar(st);if(e)return toast(e)}
      if(st.paso<3){st.paso++;guardar();return dib()}if(!can('configuracion','editar'))return toast('Tu usuario no tiene permiso para esto');const r=RB.aplicar(st);if(r.err)return toast(r.err);save();cerrar();draw();toast('Configuración aplicada: '+RB.PERFILES[st.rubro].n)}};
  dib()};
{const n=$('#g_neg');if(n)n.insertAdjacentHTML('beforeend','<p id="rb_res" class="mu" style="margin:12px 0 6px"></p><button class="btn sec" id="rb_ab">Entrevista por rubro</button>');
  $('#rb_ab').onclick=RB.abrir;
  MODS.push(()=>{const e=$('#rb_res');if(!e)return;const c=db.cfg.caps;e.textContent=db.cfg.rubro&&c?'Rubro: '+RB.PERFILES[db.cfg.rubro].n+' · '+(Object.keys(RB.CAPS).filter(k=>c[k]).map(k=>RB.CAPS[k]).join(', ')||'sin funciones adicionales'):db.cfg.entrevistaBorrador?'Tenés una entrevista por rubro sin terminar.':'Respondé la entrevista por rubro para activar venta por peso, variantes, números de serie o precios por cantidad según tu negocio.';$('#rb_ab').textContent=db.cfg.entrevistaBorrador?'Retomar la entrevista':db.cfg.rubro?'Repetir la entrevista por rubro':'Entrevista por rubro'})}
