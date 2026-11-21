// Facturación ARCA en la interfaz (escritorio simulado): asistente, botón Facturar, automático al cobrar, pendientes y comprobante con CAE + QR.
const assert = require('assert'), { JSDOM, HTML, until, api } = require('./helpers.js');
(async () => {
  const log = []; let est, resp;
  const fe = (id, n) => ({ estado: 'ok', amb: 'homologacion', tipo: 11, letra: 'C', ptoVta: 3, nro: n, fecha: '2026-11-21', cae: '7' + String(n).padStart(13, '0'), vto: '2026-12-01', receptor: { docTipo: 99, docNro: '0', condIva: 5 }, obs: [], iva: 0, neto: 100,
    emisor: { cuit: '20111111112', razon: 'Kiosco Ana', condIva: 'monotributo', domicilio: 'Calle 1', inicio: '01/01/2020' }, qr: 'https://www.afip.gob.ar/fe/qr/?p=eyJ2ZXIiOjF9' });
  est = { cfg: { ambiente: 'homologacion', modo: 'manual', alicuota: 21, cuit: '20111111112', razon: 'Kiosco Ana', condIva: 'monotributo', ptoVta: 3 }, configurado: true, tieneClave: true, tieneCert: true, certs: { homologacion: true, produccion: false }, vence: Date.now() + 300 * 864e5, listo: true, admin: true };
  let n = 0; resp = async id => ({ ok: true, fe: fe(id, ++n) });
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(w) {
    w.sp = { load: () => '', save: async () => ({ ok: true, rev: 1 }), version: () => 0, defaults: () => ({}), info: async () => ({ dir: 'x', last: null, warn: '' }), now: async () => ({}), choose: async () => ({}), restore: async () => true, print: async () => ({ ok: true }),
      auth: { estado: () => ({ habilitado: false }), call: async () => [], ir: async () => true, login: async () => ({}), logout: async () => ({}) }, seg: { estado: async () => ({ disponible: true, activo: false }) },
      arca: { estado: async () => JSON.parse(JSON.stringify(est)), config: async p => { log.push(['config', p]); Object.assign(est.cfg, p); return { ok: true }; }, csr: async o => { log.push(['csr', o]); return { ok: true, csr: '-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----\n' }; },
        cert: async (t, a) => { log.push(['cert', t, a]); return { ok: true }; }, probar: async () => ({ ok: true, ptoVtaOk: true, ptos: [{ nro: 3, bloqueado: false }] }), facturar: async (id, r) => { log.push(['facturar', id, r]); return resp(id, r); }, qr: async () => '<svg id="qrfake"></svg>' } };
  } });
  const A = { ...api(dom.window), w: dom.window }, ev = A.w.eval.bind(A.w), $ = A.$;
  ev('toast=m=>{window.__t=m}');
  const venta = (id, extra = {}) => ev(`db.sales.push(${JSON.stringify({ id, date: new Date().toISOString(), items: [{ id: 1, name: 'Yerba', qty: 1, price: 100 }], total: 100, pay: 'Efectivo', ...extra })});db.sid=Math.max(db.sid,${id + 1});save();draw()`);
  await until(() => ev('FA.e') && ev('FA.e.listo'));

  // ---- asistente ----
  A.tab('g'); $('#fa').open = true; A.ev($('#fa'), 'toggle'); assert(await until(() => /modo prueba/.test(A.txt('#fa_e'))), A.txt('#fa_e')); assert.strictEqual($('#fa_cuit').value, '20111111112'); assert($('#fa_alw').classList.contains('hide'), 'el IVA solo se pide al responsable inscripto');
  A.set('#fa_cond', 'ri'); assert(!$('#fa_alw').classList.contains('hide'));
  A.click('#fa_csr'); assert(await until(() => !$('#fa_csrb').classList.contains('hide')) && /REQUEST/.test($('#fa_csrt').value));
  $('#fa_crt').value = '-----BEGIN CERTIFICATE-----\nZZ\n-----END CERTIFICATE-----'; A.set('#fa_camb', 'produccion'); A.click('#fa_cg'); assert(await until(() => log.some(l => l[0] === 'cert' && l[2] === 'produccion')));
  A.click('#fa_pr'); assert(await until(() => /Conexión correcta/.test(A.txt('#fa_prr'))));
  const rad = [...A.d.querySelectorAll('input[name=fa_modo]')].find(r => r.value === 'siempre'); rad.checked = true; A.click('#fa_g5'); assert(await until(() => log.some(l => l[0] === 'config' && l[1].modo === 'siempre' && l[1].ambiente === 'homologacion')), 'modo prueba por defecto, producción solo a mano');
  A.tab('v');

  // ---- a pedido: botón Facturar en el historial ----
  est.cfg.modo = 'manual'; await ev('FA.cargar()'); venta(501); A.tab('r'); assert(await until(() => $('#hist [data-fa="501"]')), 'botón Facturar'); A.click($('#hist [data-fa="501"]'));
  assert(await until(() => $('#fad')) && /Factura C/.test(A.txt('#fad_l')) && /no tienen validez fiscal/.test(A.txt('#fad')), 'avisa que es de prueba y qué letra sale'); A.click('#fad_ok');
  assert(await until(() => ev('db.sales.find(s=>s.id===501).fe&&db.sales.find(s=>s.id===501).fe.cae')), 'guarda el CAE en la venta'); assert(!$('#fad'));
  assert(await until(() => /Factura C 0003-00000001/.test(A.txt('#hist'))) && !$('#hist [data-c="501"]') && !$('#hist [data-v="501"]'), 'una venta facturada no se corrige ni se anula desde acá');
  // ticket con CAE y QR
  ev('printTicket(db.sales.find(s=>s.id===501))'); assert(await until(() => $('#pvb') && /CAE: 70000000000001/.test($('#pvb').textContent)), 'ticket con CAE'); assert(/PRUEBA - SIN VALIDEZ FISCAL/.test($('#pvb').textContent) && $('#pvb #qrfake'), 'con el QR y la marca de prueba');
  assert(/Vencimiento del CAE: 01\/12\/2026/.test($('#pvb').textContent) && /CUIT: 20111111112/.test($('#pvb').textContent));

  // ---- automático al cobrar y solo clientes marcados ----
  est.cfg.modo = 'siempre'; await ev('FA.cargar()'); venta(502); ev('FA.alCobrar(db.sales.find(s=>s.id===502))'); assert(await until(() => ev('!!(db.sales.find(s=>s.id===502).fe||{}).cae')), 'automático: factura al cobrar');
  est.cfg.modo = 'clientes'; await ev('FA.cargar()'); ev("db.clients.push({id:77,name:'Ferretería Sur',doc:'30500010912',iva:1,facturar:true},{id:78,name:'Ana'})"); const antes = log.filter(l => l[0] === 'facturar').length;
  venta(503, { cid: 78 }); ev('FA.alCobrar(db.sales.find(s=>s.id===503))'); await new Promise(r => setTimeout(r, 150)); assert.strictEqual(log.filter(l => l[0] === 'facturar').length, antes, 'cliente no marcado: no factura');
  venta(504, { cid: 77 }); ev('FA.alCobrar(db.sales.find(s=>s.id===504))'); assert(await until(() => log.filter(l => l[0] === 'facturar').length === antes + 1)); assert.deepStrictEqual(JSON.parse(JSON.stringify(log.filter(l => l[0] === 'facturar').pop()[2])), { docTipo: 80, docNro: '30500010912', condIva: 1 }, 'usa los datos fiscales del cliente');
  est.cfg.modo = 'manual'; await ev('FA.cargar()'); const antes2 = log.filter(l => l[0] === 'facturar').length; venta(505); ev('FA.alCobrar(db.sales.find(s=>s.id===505))'); await new Promise(r => setTimeout(r, 100)); assert.strictEqual(log.filter(l => l[0] === 'facturar').length, antes2, 'a pedido: no factura sola');

  // ---- sin internet: pendiente y reintento ----
  resp = async () => ({ ok: false, pendiente: true, err: 'No hay conexión con ARCA' }); est.cfg.modo = 'siempre'; await ev('FA.cargar()'); venta(506); ev('FA.alCobrar(db.sales.find(s=>s.id===506))');
  assert(await until(() => ev("db.sales.find(s=>s.id===506).fe&&db.sales.find(s=>s.id===506).fe.estado")  === 'pendiente'), 'queda pendiente de facturar');
  A.tab('r'); assert(await until(() => /Pendiente de facturar/.test(A.txt('#hist'))));
  resp = async id => ({ ok: true, fe: fe(id, ++n) }); await ev('FA.reintentar()'); assert(ev('!!db.sales.find(s=>s.id===506).fe.cae'), 'al volver internet se factura sola');
  // rechazo: no se reintenta solo
  resp = async () => ({ ok: false, rechazo: true, err: 'ARCA rechazó: importe' }); venta(507); await ev('FA.emitir(507,{docTipo:99,docNro:"0",condIva:5})'); assert.strictEqual(ev('db.sales.find(s=>s.id===507).fe.estado'), 'error'); await ev('FA.reintentar()'); assert.strictEqual(ev('db.sales.find(s=>s.id===507).fe.estado'), 'error');
  // la factura no rompe la regla de ventas inmutables ni la validación
  const validar = require('../validar'); const dbj = JSON.parse(ev('JSON.stringify(db)')); const previo = JSON.parse(JSON.stringify(dbj)); previo.sales.forEach(s => delete s.fe); assert.strictEqual(validar(previo, dbj), null, 'validar acepta agregar fe a una venta existente');
  assert.deepStrictEqual(A.errs, []);
  console.log('arca-ui.test.js OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
