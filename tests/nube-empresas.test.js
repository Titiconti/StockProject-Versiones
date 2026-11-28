// Varias empresas en una PC: cambiar de empresa no puede mandar los datos de una al panel de la otra (multi-local, fase 0).
// Se arma lo mismo que main.js: getCfg/setCfg/leer siempre apuntan a la empresa ACTIVA, cada una con su propia configuración.
const assert = require('assert'), crear = require('../nube');
(async () => {
  const TA = 'spn_' + 'a'.repeat(48), TB = 'spn_' + 'b'.repeat(48);
  const emp = {
    A: { cfg: { nube: { url: 'https://panel.test', token: TA, activo: true } }, db: { shop: { n: 'Empresa A' }, prods: [{ id: 1, name: 'Yerba', price: 10, lots: [{ id: 1, n: 'x', qty: 5, exp: '' }] }], sales: [] } },
    B: { cfg: { nube: { url: 'https://panel.test', token: TB, activo: true } }, db: { shop: { n: 'Empresa B' }, prods: [{ id: 2, name: 'Café', price: 20, lots: [{ id: 2, n: 'x', qty: 7, exp: '' }] }], sales: [] } },
    C: { cfg: {}, db: { shop: { n: 'Empresa C sin panel' }, prods: [{ id: 3, name: 'Secreto C', price: 1, lots: [{ id: 3, n: 'x', qty: 1, exp: '' }] }], sales: [] } }
  };
  let activa = 'A'; const envios = [];
  const enviar = async (url, o) => {
    const tok = (o.headers.Authorization || '').replace('Bearer ', ''), cuerpo = o.body ? JSON.parse(o.body) : {};
    envios.push({ url, tok, cuerpo }); return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const nube = crear({ leer: () => JSON.stringify(emp[activa].db), getCfg: () => emp[activa].cfg, setCfg: p => { emp[activa].cfg = { ...emp[activa].cfg, ...p }; }, enviar, servidor: 'https://panel.test' });
  const nombres = tok => envios.filter(e => e.tok === tok).map(e => e.cuerpo.foto && e.cuerpo.foto.negocio.nombre);

  await nube.sincronizar(true);
  assert.deepStrictEqual(nombres(TA), ['Empresa A'], 'la empresa A manda lo suyo a su panel');

  activa = 'B'; await nube.sincronizar(true);
  assert.deepStrictEqual(nombres(TB), ['Empresa B'], 'al cambiar a B, su panel recibe los datos de B');
  assert.deepStrictEqual(nombres(TA), ['Empresa A'], 'el panel de A no recibe nada de B');

  activa = 'C'; const antes = envios.length; await nube.sincronizar(true); await nube.sincronizar();
  assert.strictEqual(envios.length, antes, 'una empresa sin panel no manda nada (ni sus datos a otro panel)');
  assert(!JSON.stringify(envios).includes('Secreto C'), 'los datos de C no salieron nunca');
  assert.strictEqual(nube.estado().configurado, false, 'la pantalla muestra que C no tiene panel');

  // De A a B sin forzar: no se mandan diferencias contra lo que el servidor tenía de A, sino la foto entera de B.
  activa = 'A'; await nube.sincronizar(true); envios.length = 0;
  activa = 'B'; await nube.sincronizar();
  assert.strictEqual(envios.length, 1); assert.strictEqual(envios[0].tok, TB); assert(envios[0].cuerpo.foto, 'foto entera, no diferencias de la otra empresa'); assert.strictEqual(envios[0].cuerpo.foto.negocio.nombre, 'Empresa B');

  // Cada empresa guarda sus propios datos de envío (seq) en su configuración.
  assert(emp.A.cfg.nube.seq > 0 && emp.B.cfg.nube.seq > 0); assert.strictEqual(emp.C.cfg.nube, undefined, 'C no recibe configuración ajena');
  assert.strictEqual(emp.A.cfg.nube.token, TA); assert.strictEqual(emp.B.cfg.nube.token, TB);
  console.log('nube-empresas OK');
})().catch(e => { console.error(e); process.exit(1); });
