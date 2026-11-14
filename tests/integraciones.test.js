const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), crypto = require('crypto');
const crearStore = require('../store.js'), crearInt = require('../integraciones.js'), { gestor } = require('../servidor.js');
(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-int-'));
  const store = crearStore({ dataFile: path.join(base, 'd.json'), configFile: path.join(base, 'c.json'), docsDir: base, home: base }); store.load();
  const hoy = new Date().toLocaleDateString('sv-SE');
  const DATA = { prods: [{ id: 1, name: 'Yerba', code: '7790001', price: 1000, cost: 600, min: 5, lots: [{ id: 1, n: 'A', qty: 10, exp: '' }] }, { id: 2, name: 'Leche', code: '7790002', price: 500, cost: 300, min: 2, lots: [{ id: 2, n: 'B', qty: 3, exp: '2000-01-01' }, { id: 3, n: 'C', qty: 2, exp: '2099-01-01' }] }], clients: [{ id: 1, name: 'Ana', phone: '', disc: 10, limite: 1500 }], sales: [], pays: [], cargos: [], nid: 3, cid: 2, sid: 1, lid: 4, payid: 1, cgid: 1 };
  assert(store.put(JSON.stringify(DATA), 0).ok);
  // ---- webhooks: receptor simulado ----
  const recibidos = []; let falla = 0, t = 1e12; const timers = [];
  const fetchSim = async (url, o) => { if (falla > 0) { falla--; return { status: 500 }; } recibidos.push({ url, headers: o.headers, body: o.body }); return { status: 200 }; };
  const integ = crearInt({ file: path.join(base, 'i.json'), fetchFn: fetchSim, ahora: () => t, esperar: (f, ms) => timers.push([f, ms]) });
  store.onPut(x => integ.alGuardar(x));
  // claves
  assert(!integ.crearToken('', 'lectura').ok); assert(!integ.crearToken('x', 'admin').ok);
  const tl = integ.crearToken('Solo lectura', 'lectura').token, te = integ.crearToken('Tienda online', 'escritura').token;
  assert(/^spk_[0-9a-f]{48}$/.test(tl)); assert(!fs.readFileSync(path.join(base, 'i.json'), 'utf8').includes(tl), 'la clave no se guarda en claro');
  assert(JSON.stringify(integ.listarTokens()).indexOf(tl) < 0 && integ.listarTokens().length === 2);
  assert.strictEqual(integ.verificar('Bearer ' + tl).scope, 'lectura'); assert.strictEqual(integ.verificar('Bearer spk_' + '0'.repeat(48)), null); assert.strictEqual(integ.verificar('Basic x'), null);

  // ---- API real sobre el servidor ----
  const g = gestor({ store, integraciones: integ, indexPath: path.join(__dirname, '..', 'index.html'), defaults: { puertoRemoto: 0 } });
  const i = await g.start(), U = 'http://127.0.0.1:' + i.port;
  const call = (p, o = {}, tk) => fetch(U + '/api/v1' + p, { ...o, headers: { ...(tk ? { Authorization: 'Bearer ' + tk } : {}), ...(o.headers || {}) } });
  const post = (p, b, tk) => call(p, { method: 'POST', body: JSON.stringify(b) }, tk);
  assert.strictEqual((await call('/productos')).status, 401); assert.strictEqual((await call('/productos', {}, 'spk_malo')).status, 401);
  assert((await (await call('/docs')).text()).includes('StockProject API v1')); assert((await (await call('/openapi.json')).json()).openapi);
  let r = await call('/productos', {}, tl); assert.strictEqual(r.status, 200); let L = await r.json();
  assert.deepStrictEqual(L.map(p => [p.codigo, p.stock]), [['7790001', 10], ['7790002', 2]], 'el stock no cuenta lotes vencidos');
  assert.strictEqual((await (await call('/productos?q=yer', {}, tl)).json()).length, 1);
  assert.deepStrictEqual((await (await call('/stock-bajo', {}, tl)).json()).map(p => p.nombre), ['Leche']);
  assert.strictEqual((await (await call('/clientes', {}, tl)).json())[0].saldo, 0);
  assert.strictEqual((await post('/ventas', { items: [{ codigo: '7790001', cantidad: 1 }] }, tl)).status, 403, 'clave de lectura no escribe');
  // alta de producto, cliente y venta
  r = await post('/productos', { codigo: '7790003', nombre: 'Azúcar', precio: 800, costo: 500, stock_minimo: 3, sumar_stock: 8 }, te); assert.strictEqual(r.status, 201); assert.strictEqual((await r.json()).producto.stock, 8);
  assert.strictEqual((await post('/productos', { codigo: '7790003', precio: 850 }, te)).status, 201); assert.strictEqual(JSON.parse(store.snapshot()).prods.find(p => p.code === '7790003').price, 850, 'actualiza por código');
  assert.strictEqual((await post('/productos', { nombre: 'Sin precio' }, te)).status, 400);
  r = await post('/clientes', { nombre: 'Beto', telefono: '1166', descuento: 5 }, te); assert.strictEqual((await r.json()).nuevo, true);
  const revAntes = store.rev();
  r = await post('/ventas', { items: [{ codigo: '7790001', cantidad: 2 }, { id: 2, cantidad: 2 }], medio_pago: 'Transferencia', cliente: 'Ana' }, te); assert.strictEqual(r.status, 201);
  const s = JSON.parse(store.snapshot()); assert(store.rev() > revAntes); const v = s.sales[0]; assert.strictEqual(v.total, 2 * 900 + 2 * 450, 'aplica el 10% del cliente'); assert.strictEqual(v.cid, 1);
  assert.strictEqual(s.prods[0].lots[0].qty, 8); assert.strictEqual(s.prods[1].lots.find(l => l.n === 'C'), undefined, 'consume el lote vigente y lo cierra'); assert.strictEqual(s.prods[1].lots.find(l => l.n === 'B').qty, 3, 'no toca el vencido');
  assert.strictEqual((await post('/ventas', { items: [{ codigo: '7790002', cantidad: 1 }] }, te)).status, 409, 'sin stock vigente'); assert.strictEqual((await post('/ventas', { items: [{ codigo: 'xx', cantidad: 1 }] }, te)).status, 404); assert.strictEqual((await post('/ventas', { items: [{ codigo: '7790001', cantidad: 1.5 }] }, te)).status, 400);
  assert.strictEqual((await post('/ventas', { items: [{ codigo: '7790001', cantidad: 1 }], medio_pago: 'Cuenta corriente' }, te)).status, 400, 'cuenta corriente exige cliente');
  assert.strictEqual((await post('/ventas', { items: [{ codigo: '7790001', cantidad: 2 }], medio_pago: 'Cuenta corriente', cliente: 'Ana' }, te)).status, 409, 'supera el límite de crédito (1500)');
  assert.strictEqual(JSON.parse(store.snapshot()).prods[0].lots[0].qty, 8, 'una venta rechazada no descuenta stock');
  const res = await (await call('/resumen', {}, tl)).json(); assert.strictEqual(res.tickets, 1); assert.strictEqual(res.ventas, 2700); assert.strictEqual(res.ganancia, 2700 - (2 * 600 + 2 * 300));
  for (let n = 0; n < 20; n++) await call('/productos', {}, 'spk_x'); assert.strictEqual((await call('/productos', {}, tl)).status, 429, 'bloquea tras muchos intentos fallidos');
  const man = await fetch(U + '/manifest.webmanifest'); assert.strictEqual(man.status, 200); const mj = await man.json(); assert.strictEqual(mj.display, 'standalone'); assert.strictEqual(mj.icons[0].src, '/icon.svg');
  const ic = await fetch(U + '/icon.svg'); assert.strictEqual(ic.headers.get('content-type'), 'image/svg+xml'); assert(/<svg/.test(await ic.text()));
  const st = g.info().stats; assert(st.peticiones > 30 && st.api > 25 && st.errores === 0, JSON.stringify(st));
  g.stop();

  // ---- webhooks ----
  assert(!integ.crearHook({ url: 'ftp://x', eventos: ['venta.creada'] }).ok); assert(!integ.crearHook({ url: 'http://x', eventos: [] }).ok);
  const hk = integ.crearHook({ url: 'http://receptor.local/hook', eventos: ['venta.creada', 'stock.bajo', 'cliente.creado'] }); assert(hk.ok && hk.secreto.length === 40);
  integ.iniciar(store.snapshot()); const nuevo = JSON.parse(store.snapshot());
  nuevo.sales.push({ id: 50, date: new Date().toISOString(), items: [{ id: 1, name: 'Yerba', qty: 3, price: 1000, cost: 600 }], total: 3000, pay: 'Efectivo', caja: 1 }); nuevo.cajas = [{ id: 1, uid: 0, user: 'Sin usuario', caja: 'Caja 1', abre: new Date().toISOString(), ini: 0, movs: [] }]; /* v3: las ventas del local van en una caja abierta */ nuevo.prods[0].lots[0].qty = 4;
  nuevo.clients.push({ id: 9, name: 'Nuevo', phone: '' }); nuevo.pays.push({ id: 5, cid: 1, amount: 10, method: 'Efectivo' });
  assert(store.put(JSON.stringify(nuevo), store.rev()).ok); await new Promise(r => setTimeout(r, 30));
  const ev = recibidos.map(x => JSON.parse(x.body).evento).sort(); assert.deepStrictEqual(ev, ['cliente.creado', 'stock.bajo', 'venta.creada'], 'solo los eventos elegidos (no pago.registrado)');
  const m = recibidos[0]; assert.strictEqual(m.headers['X-StockProject-Signature'], integ.firma(hk.secreto, m.body), 'firma HMAC verificable'); assert(crypto.createHmac('sha256', hk.secreto).update(m.body).digest('hex') === m.headers['X-StockProject-Signature'].slice(7));
  assert.strictEqual(JSON.parse(recibidos.find(x => /venta/.test(x.body)).body).datos.total, 3000);
  // no repite eventos de lo que ya estaba
  recibidos.length = 0; const otro = JSON.parse(store.snapshot()); otro.prods[1].name = 'Leche Entera'; store.put(JSON.stringify(otro), store.rev()); await new Promise(r => setTimeout(r, 20)); assert.strictEqual(recibidos.length, 0);
  // reintentos: falla dos veces y luego entrega
  falla = 2; await integ.emitir('venta.creada', { id: 1 }); assert.strictEqual(recibidos.length, 0); assert.strictEqual(timers.length, 1, 'reintento programado'); assert.strictEqual(timers[0][1], 1000);
  await timers.shift()[0](); assert.strictEqual(timers[0][1], 5000); await timers.shift()[0](); await new Promise(r => setTimeout(r, 10)); assert.strictEqual(recibidos.length, 1, 'se entregó al tercer intento'); assert.strictEqual(integ.listarHooks()[0].fallos, 0);
  // se desactiva solo tras muchos fallos seguidos y se puede reactivar
  const i2 = crearInt({ file: path.join(base, 'i2.json'), fetchFn: async () => ({ status: 500 }), esperar: () => {}, maxFallos: 3 }); i2.crearHook({ url: 'http://x.local', eventos: ['venta.creada'] });
  for (let n = 0; n < 3; n++) await i2.emitir('venta.creada', {}); assert.strictEqual(i2.listarHooks()[0].activo, false, 'deshabilitado tras 3 fallos'); i2.activarHook(i2.listarHooks()[0].id); assert.strictEqual(i2.listarHooks()[0].activo, true);
  assert.strictEqual((await integ.probar(integ.listarHooks()[0].id)).ok, true);
  assert(!JSON.stringify(integ.listarHooks()).includes(hk.secreto), 'el secreto no se vuelve a mostrar');
  console.log('integraciones OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
