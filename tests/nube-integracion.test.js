// De punta a punta: la PC (nube.js) envía a un servidor central real (nube/servidor.js) y el panel lo lee. Solo lectura y aislado.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const cliente = require('../nube'), servidor = require('../nube/servidor');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-nube-e2e-')), ADMIN = 'x'.repeat(40);
  const S = servidor.crear({ dataDir: dir, dominioBase: 'nube.prueba', adminToken: ADMIN }), puerto = await S.listen(0, '127.0.0.1'), B = 'http://127.0.0.1:' + puerto;
  const J = async (u, o = {}) => { const r = await fetch(B + u, o); let j = null; try { j = await r.json(); } catch (e) {} return { s: r.status, j, r }; };
  const alta = async (nombre, sub) => (await J('/admin/comercios', { method: 'POST', headers: { Authorization: 'Bearer ' + ADMIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, sub }) })).j;
  const a = await alta('Kiosco Ana', 'ana'), b = await alta('Almacén Beto', 'beto'); assert(a.token && a.clave && b.token);
  const db = { shop: { n: 'Kiosco Ana' }, cfg: {}, prods: [{ id: 1, name: 'Yerba', price: 1000, cost: 600, min: 2, lots: [{ id: 1, n: 'A', qty: 9, exp: '' }] }], clients: [{ id: 1, name: 'Luis', phone: '341' }],
    sales: [{ id: 1, date: new Date().toISOString(), items: [{ id: 1, name: 'Yerba', qty: 1, price: 1000 }], total: 1000, pay: 'Efectivo' }], pays: [], cargos: [], cajas: [], desv: [] };
  let cfg = {}; const N = cliente({ leer: () => JSON.stringify(db), getCfg: () => cfg, setCfg: p => { cfg = { ...cfg, ...p }; }, programar: () => 1, cancelar: () => {} });
  assert(N.configurar({ url: B, token: a.token }).ok); let e = await N.sincronizar(); assert(!e.error && e.ultima, e.error);
  // el dueño entra al panel de su comercio y ve la venta
  const login = async (sub, clave) => { const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'X-Comercio': sub, 'Content-Type': 'application/json' }, body: JSON.stringify({ clave }) }); return { s: r.status, c: (r.headers.get('set-cookie') || '').split(';')[0] }; };
  const la = await login('ana', a.clave); assert.strictEqual(la.s, 200);
  const datos = async (sub, c) => J('/api/datos', { headers: { 'X-Comercio': sub, Cookie: c } });
  let d = await datos('ana', la.c); assert.strictEqual(d.s, 200); assert.strictEqual(d.j.foto.ventas.length, 1); assert.strictEqual(d.j.foto.negocio.nombre, 'Kiosco Ana'); assert.strictEqual(d.j.desactualizado, false);
  assert(!JSON.stringify(d.j).includes('341') && !JSON.stringify(d.j).includes('"cost"'), 'no viajan teléfonos ni costos');
  // una venta nueva en la PC aparece en el panel
  db.sales.push({ id: 2, date: new Date().toISOString(), items: [], total: 500, pay: 'Transferencia' }); e = await N.sincronizar(); d = await datos('ana', la.c); assert.strictEqual(d.j.foto.ventas.length, 2);
  // el panel no puede escribir y un comercio no ve a otro
  for (const m of ['POST', 'PUT', 'DELETE']) assert((await J('/api/datos', { method: m, headers: { 'X-Comercio': 'ana', Cookie: la.c, 'Content-Type': 'application/json' }, body: '{}' })).s >= 400);
  assert.strictEqual((await datos('beto', la.c)).s, 401, 'la sesión de Ana no sirve en Beto'); assert.strictEqual((await login('beto', a.clave)).s, 401);
  // clave de instalación revocada: la PC lo informa y sigue funcionando
  await J('/admin/comercios/' + a.id + '/token', { method: 'POST', headers: { Authorization: 'Bearer ' + ADMIN } }); db.sales.push({ id: 3, date: new Date().toISOString(), items: [], total: 1, pay: 'Efectivo' });
  e = await N.sincronizar(); assert(/no reconoce la clave/.test(e.error)); assert.strictEqual((await datos('ana', la.c)).j.foto.ventas.length, 2, 'el servidor conserva lo último recibido');
  // servidor caído: la PC no se rompe
  S.close(); e = await N.sincronizar(true); assert(/Sin conexión/.test(e.error));
  fs.rmSync(dir, { recursive: true, force: true }); console.log('NUBE_E2E_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
