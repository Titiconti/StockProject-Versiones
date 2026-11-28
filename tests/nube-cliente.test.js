// Envío de datos de solo lectura al servidor central (nube.js): qué se envía, qué no, reintentos y errores.
const assert = require('assert'), crear = require('../nube'), { proyeccion } = crear;
(async () => {
  const T = new Date('2026-11-14T15:00:00-03:00').getTime(), iso = d => new Date(T + d * 864e5).toISOString(), ymd = d => iso(d).slice(0, 10);
  const db = { shop: { n: 'Kiosco Ana' }, cfg: { moneda: 'ARS', loc: 'es-AR', cajaObligatoria: true, fidel: { on: true } }, rules: { linkPago: 'https://secreto' },
    prods: [{ id: 1, name: 'Yerba', code: '779', price: 1000, cost: 600, min: 5, cat: 'Almacén', lots: [{ id: 1, n: 'A', qty: 3, exp: '' }, { id: 2, n: 'V', qty: 4, exp: ymd(-10) }] },
      { id: 2, name: 'Jamón', price: 12000, unidad: 'kg', min: 1, lots: [{ id: 3, n: 'J', qty: 2500, exp: ymd(5) }] }, { id: 3, name: 'Vencido', price: 1, lots: [{ id: 4, n: 'X', qty: 2, exp: ymd(-1) }] },
      { id: 4, name: 'Remera', price: 1, control: 'variantes', lots: [] }],
    clients: [{ id: 1, name: 'Luis', phone: '341 555', note: 'vecino', mail: 'l@x.com' }, { id: 2, name: 'Sin deuda', phone: '1' }],
    sales: [{ id: 1, date: iso(-100), items: [], total: 50, pay: 'Efectivo' }, { id: 2, date: iso(0), items: [{ id: 1, name: 'Yerba', qty: 2, price: 1000, cost: 600 }], total: 2000, pay: 'Cuenta corriente', cid: 1, cname: 'Luis', user: 'Ana', caja: 1 },
      { id: 3, date: iso(0), items: [{ id: 2, name: 'Jamón', qty: 0.15, u: 'kg', g: 150, price: 12000, tot: 1800 }], total: 1800, pay: 'Efectivo', caja: 1 }, { id: 4, date: iso(0), items: [], total: 999, pay: 'Efectivo', caja: 1, void: true }],
    pays: [{ id: 1, cid: 1, amount: 500, method: 'Efectivo', caja: 1 }], cargos: [],
    cajas: [{ id: 1, uid: 0, user: 'Ana', caja: 'Caja 1', abre: iso(0), ini: 100, movs: [{ t: 'egreso', monto: 50, motivo: 'x' }] }],
    desv: [{ id: 1, date: iso(0), reason: 'Daños', just: 'roto', user: 'Ana', items: [{ id: 1, name: 'Yerba', qty: 1, cost: 600 }] }] };
  const f = proyeccion(db, T);
  // qué se envía
  assert.deepStrictEqual(f.negocio, { nombre: 'Kiosco Ana', moneda: 'ARS', loc: 'es-AR' }); assert.strictEqual(f.ventas.length, 3, 'solo los últimos 90 días');
  assert(f.ventas.find(v => v.id === 4).anulada); assert.deepStrictEqual(f.ventas.find(v => v.id === 3).items[0], { n: 'Jamón', q: 0.15, u: 'kg', p: 12000, t: 1800 });
  const st = n => f.stock.find(x => x.n === n); assert.deepStrictEqual([st('Yerba').disp, st('Yerba').estado], [3, 'bajo'], 'vendible, sin los vencidos'); assert.deepStrictEqual([st('Jamón').disp, st('Jamón').u, st('Jamón').estado], [2.5, 'kg', 'ok']);
  assert.strictEqual(st('Vencido').estado, 'vencido'); assert.strictEqual(st('Remera'), undefined, 'el producto principal de variantes no es stock');
  assert.deepStrictEqual(f.clientes, [{ n: 'Luis', saldo: 1500 }], 'solo nombre y saldo, y solo quien tiene saldo');
  assert.deepStrictEqual([f.cajas[0].esperado, f.cajas[0].vendido, f.cajas[0].porMedio.Efectivo], [2350, 3800, 1800], 'efectivo: 100 + 1800 + 500 − 50; la anulada no cuenta');
  assert.strictEqual(f.bajas[0].costo, undefined, 'la foto del panel no lleva el costo de compra'); assert(f.bajas[0].detalle, 'la baja sí sale, sin costo'); assert(f.vencimientos.some(v => v.n === 'Vencido' && v.estado === 'vencido') && f.vencimientos.some(v => v.n === 'Jamón' && v.estado === 'porvencer'));
  // qué NO se envía
  const txt = JSON.stringify(f); ['341 555', 'l@x.com', 'vecino', 'secreto', 'fidel', 'cajaObligatoria', '"cost"'].forEach(x => assert(!txt.includes(x), 'no debe enviarse: ' + x));
  assert.doesNotThrow(() => proyeccion({}, T)); assert.doesNotThrow(() => proyeccion(null, T));

  // ---- heladería: tamaños armados sin stock propio, gustos en baldes, vendedor elegido ----
  const dbH = { shop: { n: 'Heladería Sol' }, cfg: { rubro: 'heladeria', caps: { peso: true, heladeria: true } }, prods: [{ id: 1, name: 'Chocolate', unidad: 'kg', balde: 5, price: 100, lots: [{ id: 1, n: 'A', qty: 7500, exp: '' }] },
      { id: 2, name: 'Limón', unidad: 'kg', balde: 5, price: 100, lots: [{ id: 2, n: 'A', qty: 2500, exp: '' }] }, { id: 3, name: '1/4 kg', tipo: 'tamano', price: 4000, lots: [] }, { id: 4, name: 'Pan', price: 5, lots: [{ id: 3, n: 'A', qty: 3, exp: '' }] }], baldes: [{ id: 1, date: iso(-1), user: 'Lu', gid: 2, gusto: 'Limón', t: 'ingreso', baldes: 1, g: 5000 }, { id: 2, date: iso(0), user: 'Ana', gid: 1, gusto: 'Chocolate', t: 'ajuste', baldes: 1.5, g: -500 }],
    sales: [{ id: 1, date: iso(0), items: [{ id: 3, name: '1/4 kg', qty: 1, price: 4000 }], total: 4000, pay: 'Efectivo', user: 'Caja', vend: { id: 2, nombre: 'Lu' } }, { id: 2, date: iso(0), items: [], total: 5, pay: 'Efectivo', user: 'Ana' }], cajas: [], clients: [], pays: [], cargos: [], desv: [] };
  const fH = JSON.parse(JSON.stringify(proyeccion(dbH, T))), sH = n => fH.stock.find(x => x.n === n);
  assert.strictEqual(sH('1/4 kg'), undefined, 'los tamaños armados no tienen stock propio: no aparecen como "sin stock"');
  assert.deepStrictEqual([sH('Chocolate').gusto, sH('Chocolate').baldes, sH('Chocolate').pedir, sH('Chocolate').disp, sH('Chocolate').u], [true, 1.5, false, 1.5, 'balde'], 'datos 5.7.0 (balde = 5 kg): 7,5 kg = 1,5 baldes, sin kilos');
  const sN = proyeccion({ cfg: { caps: { heladeria: true } }, prods: [{ id: 1, name: 'Americana', unidad: 'kg', balde: 1, price: 0, lots: [{ id: 1, n: 'A', qty: 250, exp: '' }] }, { id: 2, name: 'Dulce de leche', unidad: 'kg', balde: 1, price: 0, lots: [{ id: 2, n: 'A', qty: 1500, exp: '' }] }] }, T).stock; assert.deepStrictEqual(sN.map(x => [x.n, x.disp, x.u, x.pedir]), [['Americana', 0.25, 'balde', true], ['Dulce de leche', 1.5, 'balde', false]], 'formato nuevo: 1 balde = 1000'); assert.deepStrictEqual([sH('Limón').baldes, sH('Limón').pedir], [0.5, true], 'queda menos de 1 balde: Pedir');
  assert(!('gusto' in sH('Pan')) && !('balde' in sH('Pan')) && !('baldes' in sH('Pan')) && !('pedir' in sH('Pan')), 'sin balde no se agrega nada (compatible con lo anterior)');
  assert.deepStrictEqual(fH.baldes.map(b => [b.usuario, b.n, b.t, b.baldes]), [['Lu', 'Limón', 'ingreso', 1], ['Ana', 'Chocolate', 'ajuste', 1.5]], 'últimas entradas de baldes: quién y cuándo'); assert(fH.baldes[0].fecha); assert.deepStrictEqual(JSON.parse(JSON.stringify(proyeccion({ prods: [] }, T))).baldes, [], 'sin historial de baldes: lista vacía, no rompe');
  assert.strictEqual(fH.ventas[0].vend, 'Lu'); assert.strictEqual(fH.ventas[0].usuario, 'Caja'); assert(!('vend' in fH.ventas[1]), 'sin vendedor elegido no se agrega'); assert.strictEqual(fH.ventas[1].usuario, 'Ana');
  // ---- rubro: los baldes solo existen para el panel si el rubro activo es Heladería ----
  const gustoViejo = JSON.parse(JSON.stringify(dbH)); gustoViejo.prods.push({ id: 9, name: 'Dulce con precio', unidad: 'kg', balde: 5, price: 50, lots: [{ id: 9, n: 'A', qty: 3000, exp: '' }] });
  const fHel = JSON.parse(JSON.stringify(proyeccion(gustoViejo, T)));
  assert(fHel.stock.find(x => x.n === 'Chocolate').gusto && fHel.baldes.length === 2, 'heladería: el panel recibe gustos en baldes e historial');
  for (const cfgOtro of [{ rubro: 'kiosco', caps: { peso: true } }, { rubro: 'kiosco' }, {}]) {   // kiosco con gustos viejos (de cuando era heladería)
    const kio = JSON.parse(JSON.stringify(gustoViejo)); kio.cfg = cfgOtro; kio.prods.forEach(x => { if (x.balde > 0 && x.id !== 9) x.price = 0; }); kio.envs = [{}]; kio.prods.find(x => x.id === 3).env = 4; kio.prods.find(x => x.id === 3).tipo = 'tamano';
    const fK = JSON.parse(JSON.stringify(proyeccion(kio, T))), nomK = fK.stock.map(x => x.n);
    assert.deepStrictEqual(fK.baldes, [], 'otro rubro: sin historial de baldes'); assert(fK.stock.every(x => !('gusto' in x) && !('baldes' in x) && !('pedir' in x) && !('balde' in x) && !('envase' in x) && x.u !== 'balde'), 'otro rubro: nada de baldes ni envases en el stock');
    assert(!nomK.includes('Chocolate') && !nomK.includes('Limón'), 'gustos sin precio: no se muestran en otro rubro'); const dulce = fK.stock.find(x => x.n === 'Dulce con precio'); assert(dulce && dulce.precio === 50 && dulce.u === 'kg' && dulce.disp === 3, 'un gusto con precio se ve como producto común (en kilos)');
    assert(fK.stock.find(x => x.n === 'Pan') && fK.stock.every(x => x.id != null), 'los productos conservan su id: el cambio de precio desde el celular sigue disponible');
  }

  // ---- envío ----
  let cfg = {}, reloj = T, red = 'ok'; const envios = [];
  const enviar = async (u, o) => { if (red === 'caida') throw new TypeError('fetch failed'); envios.push({ u, auth: o.headers.Authorization, body: JSON.parse(o.body) }); return { ok: red === 'ok', status: red === 'ok' ? 200 : +red }; };
  const N = crear({ leer: () => JSON.stringify(db), getCfg: () => cfg, setCfg: p => { cfg = { ...cfg, ...p }; }, enviar, ahora: () => reloj, proteger: s => 'P:' + s, desproteger: s => s.slice(2), programar: () => 1, cancelar: () => {} });
  const TOK = 'spn_' + 'a'.repeat(48);
  assert(!N.estado().configurado); assert((await N.sincronizar()) && envios.length === 0, 'sin configurar no envía nada');
  assert(/https/.test(N.configurar({ url: 'http://servidor.com', token: TOK }).err), 'exige https'); assert(/clave de instalación/.test(N.configurar({ url: 'https://s.com', token: 'abc' }).err));
  assert(N.configurar({ url: 'https://nube.ejemplo/', token: TOK, panel: 'https://ana.nube.ejemplo' }).ok); assert.strictEqual(cfg.nube.token, 'P:' + TOK, 'la clave se guarda protegida'); assert(!JSON.stringify(N.estado()).includes(TOK), 'el estado no expone la clave');
  await N.sincronizar(); assert.strictEqual(envios.length, 1); assert.strictEqual(envios[0].u, 'https://nube.ejemplo/ingesta'); assert.strictEqual(envios[0].auth, 'Bearer ' + TOK); assert.strictEqual(envios[0].body.foto.ventas.length, 3);
  const s1 = envios[0].body.seq; assert(N.estado().ultima && !N.estado().error);
  reloj += 30000; await N.sincronizar(); assert.strictEqual(envios.length, 1, 'sin cambios: no reenvía enseguida');
  reloj += 540000; await N.sincronizar(); assert.strictEqual(envios.length, 1, 'a los 9 minutos y medio todavía no');
  reloj += 31000; await N.sincronizar(); assert.strictEqual(envios.length, 2, 'cada 10 minutos avisa que sigue conectado'); assert.strictEqual(envios[1].u, 'https://nube.ejemplo/ingesta/ops', 'el latido es chico, por diferencias'); assert.strictEqual(envios[1].body.n, envios[0].body.n + 1, 'numeración consecutiva'); assert(!envios[1].body.ventas, 'sin cambios no manda datos');
  db.sales.push({ id: 5, date: new Date(reloj).toISOString(), items: [], total: 10, pay: 'Efectivo', caja: 1 }); reloj += 5000; await N.sincronizar(); assert.strictEqual(envios.length, 3, 'un cambio se envía enseguida'); assert.deepStrictEqual(envios[2].body.ventas.map(v => v.id), [5], 'solo la venta nueva');
  // sin Internet: no rompe, avisa y reintenta después (con espera creciente)
  db.sales.push({ id: 6, date: new Date(reloj).toISOString(), items: [], total: 11, pay: 'Efectivo', caja: 1 });
  red = 'caida'; reloj += 301000; const e1 = await N.sincronizar(); assert(/Sin conexión/.test(e1.error)); const ult = e1.ultima;
  await N.sincronizar(); assert.strictEqual(envios.length, 3, 'tras el fallo espera 2 s antes de reintentar');
  red = 'ok'; reloj += 3000; const e2 = await N.sincronizar(); assert(!e2.error && e2.ultima > ult, 'se recupera solo');
  // clave revocada y otros errores
  red = '401'; reloj += 601000; assert(/no reconoce la clave/.test((await N.sincronizar()).error)); red = '500'; reloj += 601000; assert(/error \(500\)/.test((await N.sincronizar()).error));
  // pausar y quitar
  red = 'ok'; const n = envios.length; N.activar(false); reloj += 601000; await N.sincronizar(); assert.strictEqual(envios.length, n, 'en pausa no envía');
  N.quitar(); assert(!N.estado().configurado && !cfg.nube.token); assert(/Primero cargá/.test(N.activar(true).err));
  console.log('NUBE_CLIENTE_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
