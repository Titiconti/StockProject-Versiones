// Validación en el proceso principal: lo que llega del renderer o de un dispositivo remoto se vuelve a controlar.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const validar = require('../validar'), mkStore = require('../store');
const hoy = validar.dia(new Date().toISOString());
const base = () => ({ prods: [{ id: 1, name: 'Yerba', price: 1000, cost: 600, min: 2, lots: [{ id: 1, n: 'A', qty: 10, exp: '' }, { id: 2, n: 'V', qty: 3, exp: '2020-01-01' }] }],
  sales: [], cajas: [{ id: 1, uid: 0, user: 'Ana', caja: 'Caja 1', abre: new Date().toISOString(), ini: 0, movs: [] }], cfg: {} });
const venta = (extra = {}) => ({ id: 7, date: new Date().toISOString(), items: [{ id: 1, name: 'Yerba', qty: 1, price: 1000, lots: [{ n: 'A', exp: '', qty: 1 }] }], total: 1000, pay: 'Efectivo', caja: 1, ...extra });
const ok = (a, b) => assert.strictEqual(validar(a, b), null, JSON.stringify(validar(a, b)));
const no = (a, b, re) => { const e = validar(a, b); assert(e && re.test(e), 'esperaba rechazo ' + re + ', obtuve ' + e); assert(!/at |\.js|SQL|stack/i.test(e), 'el mensaje no expone detalles internos'); };

let a = base(), b = base(); ok(a, b);
// estructura y números
b = base(); b.prods[0].price = -1; no(a, b, /Precio inválido/);
b = base(); b.prods[0].price = Infinity; no(a, b, /Precio inválido/);
b = base(); b.prods[0].lots[0].qty = -3; no(a, b, /Cantidad de stock inválida/);
b = base(); b.prods[0].lots[0].exp = '31/12/2026'; no(a, b, /Fecha de vencimiento inválida/);
b = base(); b.prods.push({ ...b.prods[0] }); no(a, b, /repetido/);
b = base(); b.prods[0].name = ''; no(a, b, /sin nombre/);
// unidad / peso / vencimiento obligatorio / series / tramos / variantes
b = base(); b.prods[0].unidad = 'u'; b.prods[0].lots[0].qty = 1.5; no(a, b, /no admite cantidades fraccionarias/);
b = base(); b.prods[0].unidad = 'kg'; b.prods[0].lots[0].qty = 1500.5; no(a, b, /gramos enteros/); b.prods[0].lots[0].qty = 1500; ok(a, b);
b = base(); b.prods[0].reqVto = true; no(a, b, /exige fecha de vencimiento/);
b = base(); b.prods.push({ id: 2, name: 'Celular', price: 1, control: 'serie', lots: [{ n: 'SN1', qty: 1, exp: '' }, { n: 'sn1', qty: 1, exp: '' }] }); no(a, b, /serie SN1 está repetido|serie sn1 está repetido/);
b.prods[1].lots[1] = { n: 'SN2', qty: 2, exp: '' }; no(a, b, /número de serie/); b.prods[1].lots[1] = { n: 'SN2', qty: 1, exp: '' }; ok(a, b);
b = base(); b.prods[0].tramos = [{ desde: 10, precio: 900 }, { desde: 10, precio: 800 }]; no(a, b, /superponerse/);
b.prods[0].tramos = [{ desde: 1, precio: 900 }]; no(a, b, /superponerse/); b.prods[0].tramos = [{ desde: 10, precio: 900 }, { desde: 50, precio: -1 }]; no(a, b, /Precio por cantidad/);
b.prods[0].tramos = [{ desde: 10, precio: 900 }, { desde: 50, precio: 800 }]; ok(a, b);
b = base(); b.prods.push({ id: 2, name: 'Remera', price: 1, control: 'variantes', lots: [] }, { id: 3, name: 'Remera Negra S', price: 1, padre: 2, attrs: { Talle: 'S', Color: 'Negra' }, lots: [] }, { id: 4, name: 'Remera negra s', price: 1, padre: 2, attrs: { color: 'negra ', talle: 's' }, lots: [] });
no(a, b, /variante repetida/); b.prods[3].attrs = { talle: 'M', color: 'Negra' }; ok(a, b);
b.prods.splice(1, 1); no(a, b, /sin su producto principal/);
// ventas nuevas: lote vencido, caja abierta
b = base(); b.sales.push(venta()); ok(a, b);
b = base(); b.sales.push(venta({ items: [{ id: 1, name: 'Yerba', qty: 1, price: 1000, lots: [{ n: 'V', exp: '2020-01-01', qty: 1 }] }] })); no(a, b, /lote vencido/);
b = base(); b.sales.push(venta({ caja: undefined })); no(a, b, /caja abierta/);
b = base(); b.cajas[0].cierre = new Date().toISOString(); b.sales.push(venta()); no(a, b, /caja abierta/);
b = base(); b.cfg.cajaObligatoria = false; b.sales.push(venta({ caja: undefined })); ok(a, b);
b = base(); b.sales.push(venta({ caja: undefined, origen: 'api' })); ok(a, b);
b = base(); b.sales.push(venta({ items: [{ id: 1, name: 'Yerba', qty: 0, price: 1000 }] })); no(a, b, /cantidad o un precio inválido/);
// lo ya registrado no se altera
a = base(); a.sales.push(venta()); b = JSON.parse(JSON.stringify(a)); b.sales[0].total = 1; no(a, b, /no se puede modificar/);
b = JSON.parse(JSON.stringify(a)); b.sales[0].void = true; b.sales[0].voidAt = new Date().toISOString(); ok(a, b);
const anulada = JSON.parse(JSON.stringify(b)); const re = JSON.parse(JSON.stringify(b)); delete re.sales[0].void; no(anulada, re, /no se puede reactivar/);
a = base(); a.cajas[0] = { ...a.cajas[0], cierre: new Date().toISOString(), contado: 0, dif: 0 }; b = JSON.parse(JSON.stringify(a)); b.cajas[0].dif = 50; no(a, b, /cierre de caja confirmado/);
b.cajas = []; no(a, b, /cierre de caja confirmado/);
// compatibilidad: un producto viejo fuera de regla que no cambió no bloquea el guardado
a = base(); a.prods[0].lots[0].qty = -1; b = JSON.parse(JSON.stringify(a)); b.prods.push({ id: 5, name: 'Nuevo', price: 1, lots: [] }); ok(a, b);
b.prods[0].name = 'Yerba 2'; no(a, b, /Cantidad de stock inválida/);

// integrado en store.put (camino real del escritorio y del acceso remoto): rechaza y no escribe
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-val-')), st = mkStore({ dataFile: path.join(dir, 'd.json'), configFile: path.join(dir, 'c.json'), docsDir: dir, home: dir });
assert(st.put(JSON.stringify(base()), 0).ok); const antes = st.snapshot();
const malo = base(); malo.sales.push(venta({ items: [{ id: 1, name: 'Yerba', qty: 1, price: 1000, lots: [{ n: 'V', exp: '2020-01-01', qty: 1 }] }] }));
const r = st.put(JSON.stringify(malo), st.rev()); assert(!r.ok && /lote vencido/.test(r.err)); assert.strictEqual(st.snapshot(), antes, 'no se guardó nada');
fs.rmSync(dir, { recursive: true, force: true });
console.log('VALIDAR_OK');
