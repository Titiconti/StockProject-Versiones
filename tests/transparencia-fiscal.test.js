// Transparencia fiscal (Ley 27.743, RG ARCA 5614/2024): IVA contenido en el ticket y la factura.
const assert = require('assert'), { web, until } = require('./helpers.js');
(async () => {
  const A = web(), ev = A.w.eval.bind(A.w), js = x => JSON.parse(ev('JSON.stringify(' + x + ')'));
  // ---- cálculo ----
  assert.deepStrictEqual(js('FA.ivaLineas({items:[{qty:1,price:121,tot:121}],total:121},21)'), [{ a: 21, iva: 21 }]);
  assert.deepStrictEqual(js('FA.ivaLineas({items:[{qty:1,price:1000,tot:1000}],total:1000},21)'), [{ a: 21, iva: 173.55 }], '1000 con 21 %: neto 826,45');
  assert.deepStrictEqual(js('FA.ivaLineas({items:[{qty:1,price:1000,tot:1000}],total:1000},10.5)'), [{ a: 10.5, iva: 95.02 }], '1000 con 10,5 %: neto 904,98');
  assert.deepStrictEqual(js('FA.ivaLineas({items:[{qty:1,price:1210,tot:1210},{qty:1,price:1105,tot:1105,iva:10.5}],total:2315},21)'), [{ a: 21, iva: 210 }, { a: 10.5, iva: 105 }], 'una línea por alícuota');
  assert.deepStrictEqual(js('FA.ivaLineas({items:[{qty:2,price:100,tot:200}],total:180},21)'), [{ a: 21, iva: 31.24 }], 'con descuento se calcula sobre lo que paga el cliente (180)');
  assert.deepStrictEqual(js('FA.ivaLineas({items:[],total:121},21)'), [{ a: 21, iva: 21 }]);

  // ---- quién lo muestra ----
  ev('FA.e=null'); assert.strictEqual(ev('FA.transpCfg().on'), false, 'sin ARCA configurada, automático = apagado');
  ev("FA.e={cfg:{condIva:'ri',alicuota:21}}"); assert.strictEqual(ev('FA.transpCfg().on'), true, 'responsable inscripto: encendido por defecto');
  ev("FA.e={cfg:{condIva:'monotributo',alicuota:21}}"); assert.strictEqual(ev('FA.transpCfg().on'), false, 'monotributo: apagado por defecto (a confirmar con contador)');
  ev("db.cfg.transp={modo:'si',alic:10.5}"); assert.deepStrictEqual(js('[FA.transpCfg().on,FA.transpCfg().alic]'), [true, 10.5], 'se puede forzar');
  ev("FA.e={cfg:{condIva:'ri',alicuota:21}};db.cfg.transp={modo:'no'}"); assert.strictEqual(ev('FA.transpCfg().on'), false, 'y apagar');

  // ---- ticket con y sin el bloque (preview 58 y 80 mm) ----
  const venta = { id: 4001, date: new Date().toISOString(), items: [{ id: 1, name: 'Helado 1/2 kg', qty: 1, price: 6050, tot: 6050 }], total: 6050, pay: 'Efectivo' };
  const mostrar = w => { ev(`db.shop.w=${w};lastS=${JSON.stringify(venta)};showPrev()`); return A.txt('#pvb'); };
  ev("FA.e={cfg:{condIva:'ri',alicuota:21}};db.cfg.transp={modo:'no'}"); let t = mostrar(80); assert(/TOTAL/.test(t) && !/Transparencia Fiscal/.test(t), 'sin el bloque');
  ev("db.cfg.transp={modo:'auto'}");
  for (const w of [48, 72])  /* anchos imprimibles: papel de 58 mm = 48, de 80 mm = 72 */ { t = mostrar(w); assert(/Régimen de Transparencia Fiscal al Consumidor \(Ley 27\.743\)/.test(t) && /IVA Contenido \(21 %\)/.test(t) && /1\.050,00/.test(t) && /Otros Impuestos Nacionales Indirectos/.test(t), 'con el bloque a ancho ' + w + ': ' + t); assert.strictEqual(ev("document.querySelector('#pvb').style.width"), (w + 8) + 'mm'); assert(t.indexOf('no válido como factura') < t.indexOf('Transparencia'), 'va al pie'); }
  ev("db.shop.w='a4';lastS=" + JSON.stringify(venta) + ';showPrev()'); assert(/IVA Contenido/.test(A.txt('#pvb')), 'también en A4');
  ev("db.shop.w=72;FA.e={cfg:{condIva:'monotributo',alicuota:21}};db.cfg.transp={modo:'auto'}"); assert(!/Transparencia/.test(mostrar(72)), 'monotributo: sin bloque');
  // ---- factura electrónica: usa el IVA de la factura ----
  ev("FA.e={cfg:{condIva:'ri',alicuota:21}};db.cfg.transp={modo:'auto'}"); venta.fe = { estado: 'ok', amb: 'produccion', tipo: 6, letra: 'B', ptoVta: 3, nro: 7, fecha: '2026-11-21', cae: '70000000000007', vto: '2026-12-01', receptor: { docTipo: 99, docNro: '0', condIva: 5 }, iva: 1050, neto: 5000, alicuotaId: 5, emisor: { cuit: '20111111112', razon: 'Heladería', condIva: 'ri' } };
  t = mostrar(80); assert(/Factura B 0003-00000007/.test(t) && /CAE: 70000000000007/.test(t) && /IVA Contenido \(21 %\)/.test(t) && /1\.050,00/.test(t), t);
  assert.deepStrictEqual(A.errs, []); console.log('transparencia-fiscal.test.js OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
