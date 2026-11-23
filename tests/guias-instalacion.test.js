// Guías de instalación dentro de Configuración (Cobros y Facturación): los tildes cambian según el estado y "Crear caja QR" llama al proceso principal (simulado).
const assert = require('assert'), { JSDOM, HTML, until, api } = require('./helpers.js');
(async () => {
  const log = []; let mpe, fae, crearCaja;
  mpe = { configurado: false, modo: 'prueba', posQr: '', terminalId: '', fin: '', puedeQr: false, puedePoint: false };
  fae = { cfg: { ambiente: 'homologacion', modo: 'manual', alicuota: 21 }, configurado: false, tieneClave: false, tieneCert: false, certs: { homologacion: false, produccion: false }, listo: false, admin: true };
  crearCaja = async a => { log.push(['crearCaja', a]); mpe = { ...mpe, posQr: 'SPCAJAAB12CD', puedeQr: true }; return { ok: true, posQr: 'SPCAJAAB12CD', local: '1' }; };
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(w) {
    w.sp = { load: () => '', save: async () => ({ ok: true, rev: 1 }), version: () => 0, defaults: () => ({}), info: async () => ({ dir: 'x', last: null, warn: '' }), now: async () => ({}), print: async () => ({ ok: true }),
      auth: { estado: () => ({ habilitado: false }), call: async () => [], ir: async () => true, login: async () => ({}), logout: async () => ({}) }, seg: { estado: async () => ({ disponible: true, activo: false }) },
      mp: { estado: async () => JSON.parse(JSON.stringify(mpe)), guardar: async a => { log.push(['guardar', a]); mpe = { ...mpe, configurado: true, fin: '9999' }; return { ok: true }; }, probar: async () => ({ ok: true, pareceDePrueba: true }), crearCaja: a => crearCaja(a), terminales: async () => ({ ok: true, terminales: [] }), quitar: async () => ({ ok: true }) },
      arca: { estado: async () => JSON.parse(JSON.stringify(fae)), config: async () => ({ ok: true }), csr: async () => ({ ok: true, csr: 'x' }), cert: async () => ({ ok: true }), probar: async () => ({ ok: true, ptoVtaOk: true, ptos: [] }) } };
  } });
  const A = { ...api(dom.window), w: dom.window }, ev = A.w.eval.bind(A.w), $ = A.$;
  ev('toast=m=>{window.__t=m}'); A.w.confirm = () => true;
  const estados = sel => [...$(sel).querySelectorAll('li')].map(l => l.className);
  const ab = sel => $(sel).open;

  // ---- Mercado Pago ----
  A.tab('g'); A.click('#gp [data-s=c]');
  assert(await until(() => $('#mp_ig') && $('#mp_ig li')), 'la guía está dentro de la sección Cobros');
  assert(/Ver guía de instalación/.test(A.txt('#mp_ig summary')) && $('#mpc').contains($('#mp_ig')), 'plegable y dentro de la tarjeta de Mercado Pago');
  assert(ab('#mp_ig'), 'abierta mientras falten pasos'); assert.strictEqual($('#mp_ig li').parentNode.children.length, 8);
  assert.deepStrictEqual(estados('#mp_ig'), ['man', 'man', 'pend', 'pend', 'pend', 'pend', 'pend', 'pend'], 'sin nada hecho solo hay pasos pendientes y manuales');
  assert(/0 de 5 pasos/.test(A.txt('#mp_ig summary')) && /falta/.test(A.txt('#mp_ig li:nth-child(3)')) && /se hace a mano/.test(A.txt('#mp_ig li:nth-child(1)')), 'cada estado se dice con texto');
  assert($('#mp_ig summary').tagName === 'SUMMARY' && $('#mp_cj_ab').tagName === 'BUTTON', 'se maneja con teclado');
  // guardar el token => tilde del paso 3
  A.set('#mp_t', 'TEST-1234567890-abcdefghij-xxxxxxxxxxxx'); A.click('#mp_g'); assert(await until(() => estados('#mp_ig')[2] === 'ok'), 'token cargado: paso tildado'); assert(/✓/.test(A.txt('#mp_ig li:nth-child(3) .ig-k')));
  // probar conexión => tilde del paso 4
  A.click('#mp_p'); assert(await until(() => estados('#mp_ig')[3] === 'ok'), 'conexión probada: paso tildado');
  // crear caja automáticamente
  assert($('#mp_cj').classList.contains('hide')); A.click('#mp_cj_ab'); assert(!$('#mp_cj').classList.contains('hide') && $('#mp_cj_ab').getAttribute('aria-expanded') === 'true');
  // error claro que devuelve el proceso principal
  crearCaja = async a => ({ ok: false, err: 'Faltan las coordenadas (latitud y longitud) del local.' });
  A.set('#mp_cn', 'Kiosco Ana'); A.set('#mp_cc1', 'Mitre'); A.set('#mp_cc2', '123'); A.set('#mp_cc3', 'Rosario'); A.set('#mp_cc4', 'Santa Fe'); A.click('#mp_cjg');
  assert(await until(() => /Faltan las coordenadas/.test(A.txt('#mp_cje'))), 'muestra el error'); assert.strictEqual(estados('#mp_ig')[4], 'pend', 'con error no se tilda la caja'); assert(!$('#mp_cjg').disabled);
  crearCaja = async a => { log.push(['crearCaja', a]); mpe = { ...mpe, posQr: 'SPCAJAAB12CD', puedeQr: true }; return { ok: true, posQr: 'SPCAJAAB12CD', local: '1' }; };
  A.set('#mp_cla', '-32,9442'); A.set('#mp_clo', '-60.6505'); A.click('#mp_cjg');
  assert(await until(() => log.some(l => l[0] === 'crearCaja' && l[1].lat === -32.9442)), 'llama al proceso principal con las coordenadas como números');
  const c = log.find(l => l[0] === 'crearCaja' && l[1].lat != null)[1]; assert.deepStrictEqual([c.nombre, c.calle, c.numero, c.ciudad, c.provincia, c.lng], ['Kiosco Ana', 'Mitre', '123', 'Rosario', 'Santa Fe', -60.6505]);
  assert(await until(() => $('#mp_qr').value === 'SPCAJAAB12CD' && estados('#mp_ig')[4] === 'ok'), 'se carga sola la Caja QR y el paso se tilda'); assert($('#mp_cj').classList.contains('hide'));
  // venta cobrada con Mercado Pago => paso 7; producción => paso 8; todo listo => se pliega sola
  assert.strictEqual(estados('#mp_ig')[6], 'pend'); ev("db.sales.push({id:1,date:new Date().toISOString(),items:[{id:1,name:'x',qty:1,price:10}],total:10,pay:'Mercado Pago QR',mp:{pago:'P1'}});save()"); await ev('MP.cargar()'); assert(await until(() => estados('#mp_ig')[6] === 'ok'));
  mpe = { ...mpe, modo: 'produccion' }; await ev('MP.cargar()'); assert(await until(() => estados('#mp_ig')[7] === 'ok'));
  assert(/todo listo/.test(A.txt('#mp_ig summary')) && !ab('#mp_ig'), 'con todo listo arranca cerrada');
  // lo que el usuario abre o cierra se respeta
  A.click('#mp_ig summary'); assert(ab('#mp_ig')); await ev('MP.cargar()'); await new Promise(r => setTimeout(r, 30)); assert(ab('#mp_ig'), 'respeta que la abrió');

  // ---- ARCA ----
  A.click('#gp [data-s=f]');
  assert(await until(() => $('#fa_ig') && $('#fa_ig li')), 'la guía está dentro de la sección Facturación'); assert($('#fa').contains($('#fa_ig')) && ab('#fa_ig'));
  assert.strictEqual($('#fa_ig li').parentNode.children.length, 10);
  assert.deepStrictEqual(estados('#fa_ig'), ['man', 'pend', 'pend', 'man', 'man', 'pend', 'pend', 'pend', 'pend', 'pend']);
  fae = { ...fae, configurado: true, tieneClave: true, cfg: { ...fae.cfg, ptoVta: 3 } }; await ev('FA.pintar()');
  assert.deepStrictEqual(estados('#fa_ig'), ['man', 'ok', 'ok', 'man', 'man', 'ok', 'pend', 'pend', 'pend', 'pend'], 'datos, CSR y punto de venta tildados');
  fae = { ...fae, tieneCert: true, certs: { homologacion: true, produccion: false } }; await ev('FA.pintar()'); assert.strictEqual(estados('#fa_ig')[6], 'ok'); assert(/prueba sí · producción no/.test(A.txt('#fa_ig li:nth-child(7)')));
  A.click('#fa_pr'); assert(await until(() => estados('#fa_ig')[7] === 'ok'), 'conexión probada');
  ev("db.sales.push({id:9,date:new Date().toISOString(),items:[{id:1,name:'x',qty:1,price:10}],total:10,pay:'Efectivo',fe:{estado:'ok',cae:'123',amb:'homologacion'}});save()"); await ev('FA.pintar()'); assert.strictEqual(estados('#fa_ig')[8], 'ok', 'factura de prueba emitida');
  fae = { ...fae, listo: true, cfg: { ...fae.cfg, ambiente: 'produccion' } }; await ev('FA.pintar()'); assert.strictEqual(estados('#fa_ig')[9], 'ok'); assert(/todo listo/.test(A.txt('#fa_ig summary')) && !ab('#fa_ig'));
  fae = { ...fae, admin: false }; await ev('FA.pintar()');   assert.deepStrictEqual(A.errs, [], 'sin errores en la página');
  console.log('guias-instalacion OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
