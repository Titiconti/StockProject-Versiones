// Dos "celulares/PC" abren la aplicación desde el servidor (con clave) y comparten los mismos datos.
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const { JSDOM, CookieJar } = require('jsdom'), { api, until, wait } = require('./helpers');
const crearStore = require('../store.js'), { gestor } = require('../servidor.js');

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-rem-'));
  const store = crearStore({ dataFile: path.join(base, 'd', 'data.json'), configFile: path.join(base, 'd', 'cfg.json'), docsDir: base, home: base }); store.load();
  const g = gestor({ store, indexPath: path.join(__dirname, '..', 'index.html'), defaults: { demo: false, shop: { n: 'Kiosco Remoto', a: '', t: '' } } });
  const puerto = 3600 + Math.floor(Math.random() * 300);
  const info = await g.setConfig({ enabled: true, port: puerto }); assert(info.running, info.error);
  const URL0 = 'http://127.0.0.1:' + info.port;

  // sin clave: solo se ve la pantalla de ingreso, nunca la aplicación ni los datos
  const anon = await JSDOM.fromURL(URL0 + '/', { runScripts: 'dangerously' });
  assert(/clave de acceso/i.test(anon.window.document.body.textContent) && !/SP_BOOT/.test(anon.serialize()), 'sin sesión: pantalla de clave'); anon.window.close();

  // ingreso con clave (como hace la pantalla de login) y apertura desde dos dispositivos
  const login = await fetch(URL0 + '/api/login', { method: 'POST', body: JSON.stringify({ pin: info.pin }) }); assert.strictEqual(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const abrir = async () => {
    const jar = new CookieJar(); jar.setCookieSync(cookie + '; Path=/', URL0 + '/');
    const dom = await JSDOM.fromURL(URL0 + '/', { runScripts: 'dangerously', cookieJar: jar, pretendToBeVisual: true,
      beforeParse(w) { w.fetch = (u, o = {}) => fetch(new URL(u, URL0).href, { ...o, headers: { ...(o.headers || {}), cookie } }); } });
    return api(dom.window);
  };
  const A = await abrir(), B = await abrir();
  assert.strictEqual(A.w.eval('KIND'), 'http'); assert.strictEqual(A.w.eval('db.shop.n'), 'Kiosco Remoto', 'toma los datos del comercio del servidor'); assert.strictEqual(A.w.eval('db.prods.length'), 0, 'instalación nueva: sin productos de ejemplo');
  const sync = async (X, cond) => { X.d.dispatchEvent(new X.w.Event('visibilitychange')); return until(cond, 3000); };
  const stock = X => X.w.eval("db.prods.length?db.prods[0].lots.reduce((a,l)=>a+l.qty,0):-1");

  // A carga un producto desde el celular...
  A.tab('p'); A.set('#fn', 'Coca-Cola 1,5 L'); A.$('#fc').value = '7790895'; A.$('#fp').value = '2800'; A.$('#fk').value = '1900'; A.$('#fm').value = '2'; A.$('#fs').value = '10'; A.click('#fg');
  assert(await until(() => store.rev() === 1), 'A guardó en la PC principal'); assert.strictEqual(JSON.parse(fs.readFileSync(path.join(base, 'd', 'data.json'), 'utf8')).prods[0].cost, 1900, 'queda en el archivo único de datos');
  // ...y B (otro dispositivo) lo ve sin hacer nada más que volver a la pantalla
  assert(await sync(B, () => B.w.eval('db.prods.length') === 1), 'B recibió el producto'); assert.strictEqual(B.w.eval('rev'), 1);
  B.tab('v'); assert(/Coca-Cola 1,5 L/.test(B.txt('#prods')), 'B lo muestra en Ventas');

  // B vende; A lo ve
  B.click('#prods .p'); B.click('#cobrar'); assert(await until(() => store.rev() === 2)); assert.strictEqual(stock(B), 9);
  assert(await sync(A, () => A.w.eval('db.sales.length') === 1 && stock(A) === 9), 'A ve la venta de B y el stock actualizado');

  // acciones seguidas en un mismo dispositivo: se guardan todas, sin falsos conflictos
  A.tab('v'); A.click('#prods .p'); A.click('#cobrar'); A.click('#prods .p'); A.click('#cobrar');
  assert(await until(() => store.rev() === 4), 'dos ventas seguidas = dos guardados'); assert.strictEqual(stock(A), 7); assert(!/Otro dispositivo/.test(A.$('#toast').textContent));
  assert(await sync(B, () => stock(B) === 7), 'B al día'); assert.strictEqual(B.w.eval('db.sales.length'), 3);

  // CAMBIO SIMULTÁNEO: A guarda primero; B todavía tiene la versión anterior y vende
  A.click('#prods .p'); A.click('#cobrar'); assert(await until(() => store.rev() === 5));
  assert.strictEqual(B.w.eval('rev'), 4, 'B está una versión atrás');
  B.click('#prods .p'); B.click('#cobrar');
  assert(await until(() => /Otro dispositivo modificó/.test(B.$('#toast').textContent), 3000), 'B es avisado del conflicto');
  assert(await until(() => B.w.eval('db.sales.length') === 4 && stock(B) === 6), 'B se recarga con los datos de A; no se pisó nada');
  assert.strictEqual(store.rev(), 5, 'el servidor no aceptó el guardado viejo'); assert.strictEqual(JSON.parse(store.load()).sales.length, 4); assert.strictEqual(JSON.parse(store.load()).prods[0].lots[0].qty, 6);
  // B repite la venta y esta vez entra
  B.click('#prods .p'); B.click('#cobrar'); assert(await until(() => store.rev() === 6)); assert.strictEqual(JSON.parse(store.load()).sales.length, 5); assert.strictEqual(stock(B), 5);
  assert(await sync(A, () => stock(A) === 5 && A.w.eval('db.sales.length') === 5));
  // los números de venta no se repiten entre dispositivos
  const ids = JSON.parse(store.load()).sales.map(s => s.id); assert.strictEqual(new Set(ids).size, ids.length, 'ids únicos: ' + ids);

  // desde el celular se descarga la copia de seguridad: un solo archivo, idéntico a los datos
  const bk = await fetch(URL0 + '/api/backup', { headers: { cookie } }); assert.strictEqual(bk.status, 200);
  assert.strictEqual(await bk.text(), fs.readFileSync(path.join(base, 'd', 'data.json'), 'utf8')); assert.strictEqual(store.backup().warn, '', 'el respaldo automático toma el mismo archivo');
  const copias = fs.readdirSync(store.info().dir).filter(n => /^StockProject-\d{4}/.test(n)); assert.strictEqual(copias.length >= 1, true);
  assert(JSON.parse(fs.readFileSync(path.join(store.info().dir, copias[0]), 'utf8')).sales.length >= 1, 'la copia automática incluye ventas');

  // si cambian la clave en la PC principal, el celular queda afuera hasta volver a ingresar
  await g.setConfig({ pin: 'nueva1234' });
  A.d.dispatchEvent(new A.w.Event('visibilitychange')); await wait(300);
  const r = await fetch(URL0 + '/api/rev', { headers: { cookie } }); assert.strictEqual(r.status, 401, 'sesión cerrada al cambiar la clave');
  assert.deepStrictEqual(A.errs.concat(B.errs), []); g.stop();
  console.log('REMOTO_DOS_DISPOSITIVOS_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
