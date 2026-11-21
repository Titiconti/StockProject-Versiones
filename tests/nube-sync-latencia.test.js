// Cuánto tarda una venta hecha en la PC en verse en el panel. Servidor real en 127.0.0.1 con datos en una carpeta temporal,
// la PC con el cliente real (nube.js, con sus tiempos reales: ~1 s de espera al guardar) y un "celular" que consulta la versión
// cada 2,5 s como el panel. Mide y deja el resultado en la salida (MEDIDO ...).
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const crearPC = require('../nube'), { crear } = require('../nube/servidor');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-lat-')), ADMIN = 'a'.repeat(40);
  const srv = crear({ dataDir: dir, adminToken: ADMIN }), base = 'http://127.0.0.1:' + await srv.listen(0, '127.0.0.1');
  const J = async (u, o = {}) => { const r = await fetch(base + u, o); return { s: r.status, j: await r.json(), r }; };
  const ana = (await J('/admin/comercios', { method: 'POST', headers: { Authorization: 'Bearer ' + ADMIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Kiosco Ana', sub: 'ana' }) })).j;
  const ck = (await fetch(base + '/c/ana/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave: ana.clave }) })).headers.get('set-cookie').split(';')[0];
  const H = { headers: { Cookie: ck } };
  const db = { shop: { n: 'Kiosco Ana' }, cfg: {}, prods: [{ id: 1, name: 'Yerba', price: 100, lots: [{ id: 1, n: 'A', qty: 1000, exp: '' }] }], sales: [], cajas: [], clients: [], pays: [], cargos: [], desv: [] };
  let cfg = {}; const PC = crearPC({ leer: () => JSON.stringify(db), getCfg: () => cfg, setCfg: p => { cfg = { ...cfg, ...p }; }, programar: () => 1, cancelar: () => {} });
  PC.configurar({ url: base, token: ana.token }); await PC.sincronizar();
  // el celular: consulta la versión cada 2,5 s y, si cambió, baja los datos
  const PERIODO = 2500; let vista = (await J('/c/ana/api/ver', H)).j.v, vistoEn = null, esperada = null;
  const sondeo = setInterval(async () => {
    const v = (await J('/c/ana/api/ver', H)).j.v; if (v === vista) return;
    const d = (await J('/c/ana/api/datos', H)).j; vista = v;
    if (esperada && vistoEn === null && d.foto.ventas.some(x => x.id === esperada.id)) vistoEn = Date.now();
  }, PERIODO);
  const dormir = ms => new Promise(r => setTimeout(r, ms)), lat = [], pcSrv = [];
  for (let i = 1; i <= 4; i++) {
    await dormir(3500 + i * 600);   // desfasa la venta respecto del sondeo del celular
    esperada = { id: i }; vistoEn = null; const t0 = Date.now(); db.sales.push({ id: i, date: new Date().toISOString(), items: [], total: 50, pay: 'Efectivo' }); db.prods[0].lots[0].qty -= 1; PC.avisar();
    // PC -> servidor: hasta que /api/datos ya tiene la venta (consulta directa, sin esperar al sondeo)
    while (!(await J('/c/ana/api/datos', H)).j.foto.ventas.some(x => x.id === i)) await dormir(25);
    pcSrv.push(Date.now() - t0);
    while (vistoEn === null) await dormir(25);
    lat.push(vistoEn - t0);
  }
  clearInterval(sondeo); await srv.close(); fs.rmSync(dir, { recursive: true, force: true });
  const prom = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  console.log('MEDIDO PC -> servidor (ms):', pcSrv.join(', '), '| promedio', prom(pcSrv));
  console.log('MEDIDO venta -> visible en el celular, sondeo cada 2,5 s (ms):', lat.join(', '), '| promedio', prom(lat), '| máximo', Math.max(...lat));
  assert(prom(pcSrv) < 2500, 'la PC entrega en menos de 2,5 s'); assert(Math.max(...lat) < 6000, 'se ve en el celular en menos de 6 s');
  console.log('NUBE_SYNC_LATENCIA_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
