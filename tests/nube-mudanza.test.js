// Las instalaciones con la dirección vieja del panel se pasan solas a la nueva, sin perder el token ni la clave.
const assert = require('assert'), crear = require('../nube');
(async () => {
  const VIEJA = 'https://stock-project-versiones.vercel.app', NUEVA = 'https://stockprojectapp.vercel.app';
  let cfg = { nube: { url: VIEJA, token: 'spn_x', clave: 'k', panel: VIEJA + '/c/ana', activo: true } }; const envios = [];
  const n = crear({ leer: () => JSON.stringify({ prods: [], sales: [] }), getCfg: () => cfg, setCfg: p => { cfg = { ...cfg, ...p } }, servidor: NUEVA,
    enviar: async (u) => { envios.push(u); return { ok: true, status: 200, json: async () => ({ ok: true }) } }, programar: () => 0, cancelar: () => {} });
  await n.sincronizar(true);
  assert.strictEqual(cfg.nube.url, NUEVA); assert.strictEqual(cfg.nube.panel, NUEVA + '/c/ana'); assert.strictEqual(cfg.nube.token, 'spn_x'); assert.strictEqual(cfg.nube.clave, 'k');
  assert.strictEqual(envios[0], NUEVA + '/ingesta', 'los datos ya salen a la dirección nueva');
  // Otra dirección (por ejemplo un servidor propio) no se toca.
  cfg = { nube: { url: 'https://mio.example', token: 'spn_x', activo: true } }; await n.sincronizar(true); assert.strictEqual(cfg.nube.url, 'https://mio.example');
  console.log('NUBE_MUDANZA_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
