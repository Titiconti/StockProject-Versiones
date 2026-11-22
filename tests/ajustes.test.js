// Configuración rediseñada: menú lateral con 10 secciones, buscador, zona delicada, permisos y tema Claro / Oscuro / Según Windows.
// Ningún ajuste se pierde: cada control sigue existiendo (con su id) y guarda lo mismo que antes; solo cambió de lugar.
const assert = require('assert'), { JSDOM, HTML, web, until, api } = require('./helpers.js'), U = require('../usuarios.js');
const PERM = U.PERMISOS, mat = rol => Object.fromEntries(U.MODULOS.map(m => [m, (PERM[rol][m] || [])]));
const estado = (rol, permisos) => ({ habilitado: true, usuario: { id: 2, user: rol, nombre: rol.toUpperCase(), rol, prefs: {} }, permisos: permisos || mat(rol), roles: U.ROLES, modulos: U.MODULOS, acciones: U.ACCIONES, permisosRol: PERM });
function remoto(auth) {
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(w) {
    w.SP_BOOT = { rev: 0, data: null, defaults: {}, auth };
    w.fetch = async u => { const j = /misSesiones|listar|auditoria/.test(u) ? [] : /rev/.test(u) ? { rev: 0 } : { ok: true }; return { status: 200, ok: true, json: async () => j, text: async () => JSON.stringify(j) }; };
  } });
  return api(dom.window);
}
(async () => {
  const a = web(), { $, w } = a, ev = w.eval.bind(w), pane = id => $('#' + id).closest('[data-sub]').dataset.sub;
  a.tab('g');
  // ---- Inventario: cada ajuste de hoy sigue existiendo, ahora en su sección ----
  const DONDE = { n: ['shn', 'sha', 'sht', 'ss', 'g_enc', 'g_res', 'g_m'], u: ['cfg_usr_ir'], v: ['cj_req', 'cf_at', 'g_gc', 'g_gcs'], p: ['cf_av', 'g_mb', 'g_mbs', 'g_d', 'bz_d'],
    r: ['bki', 'bn', 'bc', 'bx', 'br', 'sg_ed', 'sg_c', 'sg_on', 'sg_off', 'sg_pw', 'sg_cp', 'sg_rp', 'cfg_priv'], a: ['g_tabs', 'g_ws', 'g_rst', 'cf_an'], x: ['si_on', 'g_x'] };
  let total = 0; for (const [s, ids] of Object.entries(DONDE)) ids.forEach(id => { assert($('#' + id), 'existe #' + id); assert.strictEqual(pane(id), s, '#' + id + ' está en la sección ' + s); total++; });
  assert($$all('input[name=cf_tema]').length === 3 && pane('cfg_tema') === 'a', 'el tema está en Apariencia');
  function $$all(s) { return [...w.document.querySelectorAll(s)]; }
  assert(total >= 36, 'inventario: ' + total);
  // ---- Menú lateral: 10 secciones (las que existen en la versión web), una por vez, accesible con teclado ----
  const nombres = $$all('#gp button').map(b => b.textContent);
  assert.deepStrictEqual(nombres, ['Mi negocio', 'Usuarios y permisos', 'Ventas y caja', 'Productos y stock', 'Cobros (Mercado Pago)', 'Facturación (ARCA)', 'Panel del celular', 'Respaldos y seguridad', 'Apariencia', 'Avanzado']);
  assert($$all('#gp button').every(b => b.tagName === 'BUTTON' && b.type === 'button'), 'son botones reales (foco y Enter)');
  for (const s of ev('CF.visibles()')) { a.click('#gp [data-s=' + s + ']'); assert.deepStrictEqual($$all('#g [data-sub]:not(.hide)').map(x => x.dataset.sub), [s]); assert.strictEqual($('#gp .on').dataset.s, s); assert.strictEqual($('#gp [aria-current=page]').dataset.s, s); }
  assert(!ev('CF.visibles()').includes('c') && !ev('CF.visibles()').includes('f') && !ev('CF.visibles()').includes('l'), 'sin Mercado Pago, ARCA ni panel (solo programa instalado) esas secciones no se ofrecen');
  // ---- Mismos datos que antes ----
  a.click('#gp [data-s=v]'); a.set('#g_gc', 'Alquiler, Luz'); a.click('#g_gcs'); assert.deepStrictEqual(a.db().cfg.gastosCats, ['Alquiler', 'Luz']);
  const cj = $('#cj_req'); cj.checked = true; a.ev(cj, 'change'); assert.strictEqual(a.db().cfg.cajaObligatoria, true);
  a.click('#gp [data-s=p]'); a.set('#g_mb', 'Regalo, Muestra'); a.click('#g_mbs'); assert.deepStrictEqual(a.db().cfg.motivosBaja, ['Regalo', 'Muestra']);
  a.click('#gp [data-s=n]'); a.set('#shn', 'Kiosco Test'); a.click('#ss'); assert.strictEqual(a.db().shop.n, 'Kiosco Test');
  a.click('#gp [data-s=x]'); const si = $('#si_on'); si.checked = true; a.ev(si, 'change'); assert.strictEqual(a.db().cfg.avanzado, true);
  // ---- Zona delicada ----
  a.click('#gp [data-s=r]'); ['br', 'sg_rp', 'sg_off'].forEach(id => assert($('#' + id).closest('.cfg-peligro'), '#' + id + ' está en la zona delicada'));
  assert($('#bn').closest('.cfg-peligro') === null && $('#bx').closest('.cfg-peligro') === null, 'respaldar no es delicado');
  // ---- Buscador ----
  const buscar = q => { a.set('#cfg_q', q); return a.txt('#cfg_res'); };
  assert(/Respaldo de datos/.test(buscar('respaldo')) && !$('#cfg_res').classList.contains('hide') && $('#cfg_panes').classList.contains('hide'), 'encuentra respaldos y reemplaza el contenido');
  assert(/Categorías de gastos/.test(buscar('categorias')) && /Categorías de gastos/.test(buscar('CATEGORÍAS')), 'sin distinguir tildes ni mayúsculas');
  assert(/Tema/.test(buscar('modo noche')), 'palabras clave: "modo noche" lleva a Tema');
  assert(/Motivos de baja de stock/.test(buscar('danos extravio')), 'busca también en la explicación');
  assert(/No encontramos/.test(buscar('zzzzqq')));
  buscar('caja'); a.click($('#cfg_res .cfg-r')); assert.strictEqual($('#cfg_q').value, '', 'al elegir un resultado se limpia la búsqueda'); assert($('#cfg_res').classList.contains('hide') && !$('#cfg_panes').classList.contains('hide'));
  assert.strictEqual($('#cfg_q').type, 'search'); assert(/Buscar un ajuste/.test(a.txt('label[for=cfg_q]')), 'el buscador tiene etiqueta');
  // ---- Tema ----
  a.click('#gp [data-s=a]'); const raiz = w.document.documentElement, radio = v => $$all('input[name=cf_tema]').find(r => r.value === v);
  const elegir = v => { radio(v).checked = true; a.ev(radio(v), 'change'); };
  assert.strictEqual(radio('sistema').checked, true, 'por defecto: según Windows'); assert.strictEqual(raiz.getAttribute('data-theme'), null);
  elegir('oscuro'); assert.strictEqual(raiz.getAttribute('data-theme'), 'dark'); assert.strictEqual(JSON.parse(w.localStorage.getItem('sp_prefs_equipo')).tema, 'oscuro');
  elegir('claro'); assert.strictEqual(raiz.getAttribute('data-theme'), 'light'); assert.strictEqual(JSON.parse(w.localStorage.getItem('sp_prefs_equipo')).tema, 'claro');
  elegir('sistema'); assert.strictEqual(raiz.getAttribute('data-theme'), null); assert.strictEqual(JSON.parse(w.localStorage.getItem('sp_prefs_equipo')).tema, 'sistema');
  elegir('oscuro'); a.click('#avb'); assert.strictEqual($('#av_tm').value, 'oscuro', 'la campana muestra el mismo tema'); $('#av_tm').value = 'claro'; a.ev($('#av_tm'), 'change'); assert.strictEqual(raiz.getAttribute('data-theme'), 'light'); assert.strictEqual(radio('claro').checked, true, 'Configuración sigue a la campana');
  const an = $('#cf_an'); an.checked = false; a.ev(an, 'change'); assert(!raiz.classList.contains('anim'), '"Animaciones suaves" apaga los efectos (y no depende de Windows)'); assert.strictEqual(JSON.parse(w.localStorage.getItem('sp_prefs_equipo')).anim, false);
  // El tema guardado se aplica en el <head>, antes del primer cuadro (también en login.html y clave.html)
  const nuevo = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(win) { win.localStorage.setItem('sp_prefs_equipo', JSON.stringify({ tema: 'oscuro' })); win.document.addEventListener('readystatechange', () => {}); } });
  assert.strictEqual(nuevo.window.document.documentElement.getAttribute('data-theme'), 'dark', 'arranca oscuro con el tema guardado');
  const cab = HTML.slice(0, HTML.indexOf('</style>')); assert(cab.indexOf('data-theme') > 0 && cab.indexOf('data-theme') < cab.indexOf('#pre{'), 'el script del head va antes del estilo de la cortina');
  assert.deepStrictEqual(a.errs, []);

  // ---- Roles ----
  const gerente = remoto(estado('gerente')); gerente.tab('g');
  assert(gerente.$('#cfg_ro').classList.contains('hide'), 'el gerente edita configuración: sin aviso de solo lectura');
  assert(gerente.$('#gp [data-s=u]') && !gerente.$('#gp [data-s=u]').classList.contains('hide'), 'el gerente ve Usuarios (puede ver)');
  const empleado = remoto(estado('empleado')); assert(empleado.$('nav button[data-t=g]').classList.contains('hide'), 'el empleado no ve Configuración (permisos intactos)');
  const soloVer = remoto(estado('gerente', { ...mat('gerente'), configuracion: ['ver'] })); soloVer.tab('g');
  assert(!soloVer.$('#cfg_ro').classList.contains('hide'), 'avisa que es solo lectura');
  const bloqueados = [...soloVer.d.querySelectorAll('#g .cfg-pane:not([data-sub=a]) input, #g .cfg-pane:not([data-sub=a]) select, #g .cfg-pane:not([data-sub=a]) button')].filter(e => !e.closest('[data-libre]'));
  assert(bloqueados.length > 20 && bloqueados.every(e => e.disabled), 'solo lectura: nada se puede cambiar'); soloVer.click('#gp [data-s=a]');
  assert(soloVer.d.querySelector('input[name=cf_tema]').disabled === false, 'la apariencia sí se puede elegir');
  assert(soloVer.d.querySelector('#bn').disabled === false || soloVer.d.querySelector('#bn').dataset.ro === undefined, 'los respaldos siguen sus propios permisos');
  assert.deepStrictEqual([a.errs, gerente.errs, soloVer.errs], [[], [], []]);
  console.log('ajustes OK (' + total + ' ajustes ubicados)'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
