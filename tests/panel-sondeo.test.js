// El panel del celular no consulta de más: pregunta solo la versión (/api/ver), solo con la pestaña visible, baja los datos
// únicamente si cambió, se frena si está oculto o la sesión se cerró, y espacia las consultas cuando no hay novedades.
// Reloj y red falsos: no espera tiempo real ni toca ningún servidor.
const assert = require('assert'), fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');
(async () => {
  const HTML = fs.readFileSync(path.join(__dirname, '..', 'nube', 'panel.html'), 'utf8');
  let ahora = Date.UTC(2026, 10, 21, 15, 0, 0), oculto = false, verActual = 'v1', estadoVer = 200, id = 0; const cola = [], llamadas = { datos: 0, ver: 0 };
  const iso = () => new Date(ahora).toISOString();
  const foto = { v: 1, generado: iso(), negocio: { nombre: 'Kiosco', moneda: 'ARS', loc: 'es-AR' }, ventas: [], stock: [{ id: 1, n: 'Chocolate', disp: 7.5, u: 'kg', balde: 5, baldes: 1.5, pedir: false, estado: 'ok', precio: 100 }, { id: 2, n: 'Limón', disp: 2.5, u: 'kg', balde: 5, baldes: 0.4, pedir: true, estado: 'bajo', precio: 100 }, { n: 'Fresa', disp: 5, u: 'kg', balde: 5, estado: 'ok', precio: 100 }, { id: 3, n: 'Pan', disp: 3, estado: 'ok', precio: 5 }], cajas: [], clientes: [], bajas: [], vencimientos: [], baldes: [{ fecha: iso(), usuario: 'Ana', n: 'Limón', t: 'ingreso', baldes: 2 }] };
  const posts = [], cambios = [{ id: 'p_1', pid: 1, n: 'Chocolate', visto: 100, precio: 110, estado: 'pendiente', motivo: '' }, { id: 'p_0', pid: 3, n: 'Pan', visto: 5, precio: 6, estado: 'rechazado', motivo: 'El precio cambió en el local, revisalo' }, { id: 'p_00', pid: 9, n: 'Sal', visto: 2, precio: 3, estado: 'aplicado', motivo: '' }];
  const resp = (status, cuerpo) => Promise.resolve({ status, ok: status < 400, json: () => Promise.resolve(cuerpo) });
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/c/kiosco/', pretendToBeVisual: true, beforeParse(w) {
    w.setTimeout = (f, ms) => { cola.push({ id: ++id, f, t: ahora + ms }); return id; }; w.clearTimeout = i => { const k = cola.findIndex(x => x.id === i); if (k >= 0) cola.splice(k, 1); };
    w.setInterval = (f, ms) => { cola.push({ id: ++id, f, t: ahora + ms, cada: ms }); return id; }; w.clearInterval = w.clearTimeout;
    w.Date.now = () => ahora; w.scrollTo = () => {};
    Object.defineProperty(w.document, 'hidden', { get: () => oculto, configurable: true });
    w.fetch = (u, o) => {
      if (u === '/api/precio') { posts.push(JSON.parse(o.body)); return resp(201, { cambio: { id: 'p_9', pid: 2, n: 'Limón', visto: 100, precio: 130, estado: 'pendiente', motivo: '' } }); }
      if (u === '/api/datos') { llamadas.datos++; return resp(200, { negocio: { nombre: 'Kiosco' }, foto, ultimaSync: iso(), ahora: iso(), desactualizado: false, ver: verActual, cambios }); }
      if (u === '/api/ver') { llamadas.ver++; return estadoVer === 200 ? resp(200, { v: verActual, viejo: false }) : resp(estadoVer, { error: 'x' }); }
      return resp(404, {});
    };
  } });
  const w = dom.window, tic = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
  // avanza el reloj falso ejecutando lo que vence, en orden
  const avanzar = async ms => {
    const fin = ahora + ms;
    for (;;) {
      cola.sort((a, b) => a.t - b.t); const x = cola[0]; if (!x || x.t > fin) break;
      ahora = Math.max(ahora, x.t); if (x.cada) x.t += x.cada; else cola.shift(); x.f(); await tic();
    }
    ahora = fin; await tic();
  };
  await tic();
  assert.strictEqual(llamadas.datos, 1, 'al abrir baja los datos una vez'); assert.strictEqual(llamadas.ver, 0);

  // heladería: el stock de los gustos se ve en baldes (una decimal); sin balde no cambia nada
  w.document.querySelector('nav button[data-s=stock]').click(); await tic(); const vistaTxt = w.document.getElementById('vista').textContent;
  assert(vistaTxt.includes('1,5 baldes'), 'kilos / kilos por balde'); assert(vistaTxt.includes('0,4 baldes'), 'baldes cargados a mano'); assert.strictEqual((vistaTxt.match(/\d,\d baldes/g) || []).length, 3, 'solo los productos con balde'); assert.strictEqual((vistaTxt.match(/Pedir/g) || []).length, 1, 'Pedir solo si queda menos de 1 balde (Limón 0,4)'); assert(vistaTxt.includes('Últimos baldes cargados') && vistaTxt.includes('Entró 2 balde(s)') && vistaTxt.includes('Ana'), 'historial de baldes: quién y cuándo');

  // cambiar precios desde el celular: estado de cada pedido y edición del precio de un producto
  assert(vistaTxt.includes('Cambios de precio') && vistaTxt.includes('Pendiente') && vistaTxt.includes('Rechazado') && vistaTxt.includes('Aplicado'), 'estado de cada cambio');
  assert(vistaTxt.includes('El precio cambió en el local, revisalo'), 'motivo del rechazo'); assert(vistaTxt.includes('Cambio de precio pendiente'), 'el producto con un pedido pendiente no se vuelve a editar');
  const botones = [...w.document.querySelectorAll('#vista button.enlace')].filter(b => b.textContent === 'Cambiar precio'); assert.strictEqual(botones.length, 2, 'Limón y Pan (con id y sin pedido pendiente); Fresa no tiene id');
  botones[0].click(); await tic(); const campo = w.document.querySelector('#vista .edit input'); assert(campo, 'se abre el editor'); campo.value = '130'; campo.dispatchEvent(new w.Event('input', { bubbles: true }));
  [...w.document.querySelectorAll('#vista .edit button')].find(b => b.textContent === 'Guardar').click(); await tic();
  assert.deepStrictEqual(posts, [{ pid: 2, precio: 130, visto: 100 }], 'manda producto, precio nuevo y el precio que vio');
  assert(w.document.getElementById('vista').textContent.includes('Pedido enviado'), 'avisa que queda pendiente'); llamadas.datos = 1;   // el pedido hizo una descarga para ver el estado; se vuelve a contar desde acá

  // sin cambios: solo versión, cada 2,5 s, y los datos no se vuelven a bajar
  await avanzar(10000); assert.strictEqual(llamadas.ver, 4, 'una consulta de versión cada 2,5 s'); assert.strictEqual(llamadas.datos, 1, 'sin cambios no baja datos');
  // cambió la versión: baja los datos una vez
  verActual = 'v2'; await avanzar(2500); assert.strictEqual(llamadas.datos, 2, 'cambió: baja los datos'); await avanzar(5000); assert.strictEqual(llamadas.datos, 2, 'y no vuelve a bajarlos');

  // pestaña oculta (pantalla apagada u otra app): no consulta nada
  oculto = true; w.document.dispatchEvent(new w.Event('visibilitychange')); const v0 = llamadas.ver, d0 = llamadas.datos;
  await avanzar(10 * 60000); assert.strictEqual(llamadas.ver, v0, 'oculto no pregunta'); assert.strictEqual(llamadas.datos, d0, 'oculto no baja datos');
  // vuelve a verse: se actualiza enseguida y retoma
  oculto = false; w.document.dispatchEvent(new w.Event('visibilitychange')); await tic(); assert.strictEqual(llamadas.datos, d0 + 1, 'al volver se actualiza'); await avanzar(5000); assert(llamadas.ver > v0, 'retoma las consultas');

  // sin novedades se espacia: después de 5 minutos quietos, una consulta cada 10 s; después de 30, cada 30 s
  await avanzar(6 * 60000); let a = llamadas.ver; await avanzar(60000); const en1 = llamadas.ver - a; assert(en1 <= 7 && en1 >= 5, 'a los 5 min quieto: ~6 por minuto (' + en1 + ')');
  await avanzar(30 * 60000); a = llamadas.ver; await avanzar(60000); const en2 = llamadas.ver - a; assert(en2 <= 3, 'a los 30 min quieto: ~2 por minuto (' + en2 + ')');
  console.log('MEDIDO consultas por minuto: activo 24 | 5 min quieto', en1, '| 30 min quieto', en2, '| oculto 0');

  // sesión cerrada: pide la clave y deja de consultar
  estadoVer = 401; await avanzar(60000); assert(!w.document.getElementById('ingreso').hidden, 'muestra el ingreso'); const v1 = llamadas.ver; await avanzar(120000); assert.strictEqual(llamadas.ver, v1, 'sin sesión no consulta');
  console.log('PANEL_SONDEO_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
