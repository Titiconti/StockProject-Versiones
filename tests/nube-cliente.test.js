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
  assert.strictEqual(f.bajas[0].costo, 600); assert(f.vencimientos.some(v => v.n === 'Vencido' && v.estado === 'vencido') && f.vencimientos.some(v => v.n === 'Jamón' && v.estado === 'porvencer'));
  // qué NO se envía
  const txt = JSON.stringify(f); ['341 555', 'l@x.com', 'vecino', 'secreto', 'fidel', 'cajaObligatoria', '"cost"'].forEach(x => assert(!txt.includes(x), 'no debe enviarse: ' + x));
  assert.doesNotThrow(() => proyeccion({}, T)); assert.doesNotThrow(() => proyeccion(null, T));

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
  reloj += 30000; await N.sincronizar(); assert.strictEqual(envios.length, 1, 'sin cambios y hace menos de un minuto: no reenvía');
  reloj += 31000; await N.sincronizar(); assert.strictEqual(envios.length, 2, 'cada minuto avisa que sigue conectado'); assert(envios[1].body.seq > s1, 'secuencia creciente');
  db.sales.push({ id: 5, date: new Date(reloj).toISOString(), items: [], total: 10, pay: 'Efectivo', caja: 1 }); reloj += 5000; await N.sincronizar(); assert.strictEqual(envios.length, 3, 'un cambio se envía enseguida');
  // sin Internet: no rompe, avisa y reintenta después
  red = 'caida'; reloj += 61000; const e1 = await N.sincronizar(); assert(/Sin conexión/.test(e1.error)); const ult = e1.ultima;
  red = 'ok'; reloj += 1000; const e2 = await N.sincronizar(); assert(!e2.error && e2.ultima > ult, 'se recupera solo');
  // clave revocada y otros errores
  red = '401'; reloj += 61000; assert(/no reconoce la clave/.test((await N.sincronizar()).error)); red = '500'; reloj += 61000; assert(/error \(500\)/.test((await N.sincronizar()).error));
  // pausar y quitar
  red = 'ok'; const n = envios.length; N.activar(false); reloj += 61000; await N.sincronizar(); assert.strictEqual(envios.length, n, 'en pausa no envía');
  N.quitar(); assert(!N.estado().configurado && !cfg.nube.token); assert(/Primero cargá/.test(N.activar(true).err));
  console.log('NUBE_CLIENTE_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
