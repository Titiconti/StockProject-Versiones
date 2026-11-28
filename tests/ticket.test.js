// Ticket de venta: leyenda, fiscal, 58/80 mm, logo y límites.
const assert = require('assert'), { web } = require('./helpers.js');
(async () => {
  const A = web(), ev = A.w.eval.bind(A.w);
  const venta = { id: 77, date: new Date().toISOString(), items: [{ name: 'Queso', qty: 0.35, u: 'kg', price: 12000, tot: 4200 }, { name: 'Alfajor', qty: 2, price: 1500, lp: 1700, tot: 3000 }], total: 7200, pay: 'Efectivo', rec: 10000 };
  const mostrar = (v, w) => { ev(`db.shop.w=${JSON.stringify(w)};lastS=${JSON.stringify(v)};showPrev()`); return A.txt('#pvb'); };

  // no fiscal: leyenda, n° de operación, decimal con unidad, descuento, vuelto
  let t = mostrar(venta, 72);
  assert(/COMPROBANTE DE PAGO\s*Documento no válido como factura/.test(t) && /Operación N\.º\s*000077/.test(t), 'leyenda y n° de operación');
  assert(/0,350 kg x \$\s?12\.000,00\/kg/.test(t), 'cantidad decimal con unidad y precio por kg: ' + t);
  assert(/Descuento aplicado\s*-\$\s?400/.test(t) && /Subtotal/.test(t), 'descuento claro');
  assert(/Recibido\s*\$\s?10\.000/.test(t) && /Vuelto\s*\$\s?2\.800/.test(t), 'vuelto en efectivo');
  assert(!/CAE/.test(t), 'sin CAE');

  assert.strictEqual((t.match(/Gracias por su compra/g) || []).length, 1, 'agradecimiento por defecto una sola vez'); assert.strictEqual((t.match(/no válido como factura/g) || []).length, 1, 'leyenda una sola vez');
  // fiscal: CAE + QR, sin la leyenda de "no válido"
  const fis = { ...venta, pay: 'Mercado Pago', fe: { estado: 'ok', letra: 'B', ptoVta: 1, nro: 5, cae: '70000000000001', vto: '20261201', fecha: '20261128', amb: 'produccion', receptor: { docTipo: 99, docNro: '0', condIva: 5 }, emisor: { razon: 'Heladería SA', cuit: '20111111112', condIva: 'ri' }, qr: 'x' } };
  ev('FA.qrC["70000000000001"]=\'<svg id="qrfake"></svg>\''); ev("db.shop.tk={iibb:'901-123'}");
  t = mostrar(fis, 72);
  assert(/CAE: 70000000000001/.test(t) && A.$('#pvb #qrfake') && !/COMPROBANTE DE PAGO/.test(t) && !/no válido como factura/.test(t), 'fiscal con CAE, QR y sin leyenda');
  assert(/Ingresos Brutos: 901-123/.test(t), 'IIBB en el bloque fiscal');

  // 58 y 80 mm, completa y compacta
  ev('db.shop.tk={}');
  for (const [w, mm] of [[48, '56mm'], [72, '80mm']]) { mostrar(venta, w); assert.strictEqual(A.$('#pvb').style.width, mm, 'ancho ' + mm); }
  ev("db.shop.tk={cuit:'20-1-2',iva:'Monotributo',iibb:'5',inicio:'01/01/2020',head:'Hola\\nMundo',foot:'Vuelva pronto',plantilla:'completa'}");
  t = mostrar(venta, 72); assert(!/Gracias por su compra/.test(t) && /CUIT: 20-1-2/.test(t) && /Monotributo/.test(t) && /Ingresos Brutos: 5/.test(t) && /Inicio de actividades: 01\/01\/2020/.test(t) && /Hola/.test(t) && /Vuelva pronto/.test(t) && /Artículos/.test(t), 'completa con datos');
  ev("db.shop.tk.plantilla='compacta'"); const c = mostrar(venta, 72); assert(!/CUIT/.test(c) && !/Artículos/.test(c) && c.length < t.length, 'compacta más corta');
  ev("db.shop.tk={head:'<img src=x onerror=alert(1)>'}"); mostrar(venta, 72); assert(!A.$('#pvb img'), 'el encabezado se escapa');

  // logo: sin logo no hay imagen; con logo sí; se rechazan los datos no válidos o demasiado grandes
  const png = 'data:image/png;base64,' + 'iVBORw0KGgo='.repeat(4);
  ev(`db.shop.tk={logo:{on:true,size:'g',data:${JSON.stringify(png)}}}`); mostrar(venta, 72); assert(A.$('#pvb img') && /width:100%/.test(A.$('#pvb img').getAttribute('style')), 'logo grande');
  ev("db.shop.tk.logo.size='c'"); mostrar(venta, 48); assert(/width:35%/.test(A.$('#pvb img').getAttribute('style')), 'logo chico');
  ev("db.shop.tk.logo.on=false"); mostrar(venta, 72); assert(!A.$('#pvb img'), 'logo desactivado');
  ev(`db.shop.tk={logo:{on:true,size:'m',data:${JSON.stringify('data:image/png;base64,' + 'A'.repeat(150001))}}}`); mostrar(venta, 72); assert(!A.$('#pvb img'), 'logo demasiado grande: no se usa');
  ev(`db.shop.tk={logo:{on:true,size:'m',data:'javascript:alert(1)'}}`); mostrar(venta, 72); assert(!A.$('#pvb img'), 'logo con datos inválidos');
  assert.strictEqual(ev('TK.validarLogo(' + JSON.stringify(png) + ')'), true); assert.strictEqual(ev('TK.validarLogo("http://x/y.png")'), false);
  let rechazo = ''; try { await ev('TK.cargar({type:"image/png",size:5e6})'); } catch (e) { rechazo = e.message; } assert(/4 MB/.test(rechazo), 'archivo muy pesado rechazado');
  rechazo = ''; try { await ev('TK.cargar({type:"application/pdf",size:10})'); } catch (e) { rechazo = e.message; } assert(/imagen/.test(rechazo), 'solo imágenes');

  // conversión a blanco y negro y reducción de tamaño
  const px = new Uint8ClampedArray(8 * 4 * 4); for (let i = 0; i < 32; i++) { const v = i % 8 < 4 ? 20 : 240; px.set([v, v, v, 255], i * 4); }
  const r = JSON.parse(ev(`(()=>{const r=TK.escalarGris(new Uint8ClampedArray(${JSON.stringify([...px])}),8,4,4),b=TK.binarizar(r.g,r.w,r.h,'umbral');return JSON.stringify({w:r.w,h:r.h,b:[...b]})})()`));
  assert.strictEqual(r.w, 4); assert.strictEqual(r.h, 2); assert(r.b.every(v => v === 0 || v === 255), 'solo blanco y negro'); assert.deepStrictEqual(r.b.slice(0, 4), [0, 0, 255, 255]);
  const d = JSON.parse(ev(`JSON.stringify([...TK.binarizar(new Uint8Array(16).fill(128),4,4,'puntos')])`)); assert(d.every(v => v === 0 || v === 255) && d.includes(0) && d.includes(255), 'puntos: mezcla de blanco y negro en gris medio');
  assert.strictEqual(ev('TK.anchoPx()'), 576); ev('db.shop.w=48'); assert.strictEqual(ev('TK.anchoPx()'), 384, '58 mm = 384 px');

  // pantalla de configuración
  assert(A.$('#cfg_ticket') && A.$('#tk_prev'), 'tarjeta en Configuración');
  A.set('#tk_pl', 'compacta'); A.set('#tk_foot', 'Gracias!'); assert.strictEqual(ev('db.shop.tk.plantilla'), 'compacta'); assert(/Gracias!/.test(A.txt('#tk_prev')), 'vista previa en vivo');
  assert.deepStrictEqual(A.errs, []);
  console.log('ticket: ok'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
